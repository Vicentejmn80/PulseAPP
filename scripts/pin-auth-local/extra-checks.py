"""Local checks that sit outside the main suite. Refuses any non-local database."""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[2]
PSQL = os.environ["RUSHER_PSQL"]
PIN_MIGRATION = ROOT / "supabase" / "migrations" / "20261011120000_pin_auth_hardening.sql"
PHASE1 = ROOT / "supabase" / "migrations" / "20261012120000_phase1_revocations.sql"
BOOTSTRAP = Path(__file__).resolve().parent / "bootstrap.sql"


def psql(database: str, sql: str | None = None, path: Path | None = None) -> str:
    args = [PSQL, "-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-t", "-A"]
    if path:
        args.extend(["-f", str(path)])
        proc = subprocess.run(args, capture_output=True)
    else:
        proc = subprocess.run(args, input=sql.encode(), capture_output=True)
    err = (proc.stderr or b"").decode("utf-8", "replace")
    if proc.returncode != 0:
        raise RuntimeError(err[-1500:])
    return (proc.stdout or b"").decode("utf-8", "replace")


def concurrent_credit() -> dict:
    dsn = "host=127.0.0.1 port=55432 dbname=rusher_pin_local user=postgres"
    with psycopg.connect(dsn) as conn:
        conn.execute(
            """
            insert into public.pulse_profiles (id, phone, alias, handle, initials, avatar_color, access_code, alias_normalized, full_name)
            values ('user_race', '+580000000777', 'race', '@race', 'RA', '#18A085', 'ABCDEF', 'race', 'Race Local')
            on conflict (id) do nothing
            """
        )
        conn.commit()
    errors = []

    def once():
        try:
            with psycopg.connect(dsn) as conn:
                conn.execute(
                    "select public.pulse_credit('user_race', 'qr_scan', 'race-once', 3, '{}'::jsonb)"
                )
                conn.commit()
        except Exception as exc:
            errors.append(type(exc).__name__)

    threads = [threading.Thread(target=once) for _ in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    with psycopg.connect(dsn) as conn:
        row = conn.execute(
            """
            select count(*)::int as n, coalesce(sum(points), 0)::int as points
            from public.pulse_transactions
            where user_id = 'user_race' and source_id = 'race-once'
            """
        ).fetchone()
        balance = conn.execute(
            """
            select coalesce(sum(points), 0)::int as points
            from public.pulse_transactions
            where user_id = 'user_race'
            """
        ).fetchone()[0]
    return {"rows": row[0], "points": row[1], "balance": balance, "errors": errors[:3], "errorCount": len(errors)}


def drop_pool_role() -> None:
    psql(
        "postgres",
        """
        do $$
        begin
          if exists (select 1 from pg_roles where rolname = 'rusher_pool') then
            execute 'revoke all on database rusher_pin_local from rusher_pool';
            execute 'drop role rusher_pool';
          end if;
        end $$;
        """,
    )


def connection_limit() -> dict:
    drop_pool_role()
    psql("postgres", "create role rusher_pool login;")
    psql("postgres", "grant connect on database rusher_pin_local to rusher_pool;")
    psql("postgres", "alter database rusher_pin_local connection limit 4;")
    opened = 0
    rejected = 0
    held = []
    try:
        for _ in range(8):
            try:
                conn = psycopg.connect("host=127.0.0.1 port=55432 dbname=rusher_pin_local user=rusher_pool")
                held.append(conn)
                opened += 1
            except Exception:
                rejected += 1
    finally:
        for conn in held:
            conn.close()
        psql("postgres", "alter database rusher_pin_local connection limit -1;")
        drop_pool_role()
    return {"opened": opened, "rejected": rejected}


def login_rate() -> dict:
    dsn = "host=127.0.0.1 port=55432 dbname=rusher_pin_local user=postgres"
    with psycopg.connect(dsn) as conn:
        conn.execute(
            "select public.pulse_account_register('+580000000778', 'Tasa Local', 'tasa_local', '135790')"
        )
        conn.commit()
    lats = []
    stop = time.perf_counter() + 8
    lock = threading.Lock()

    def worker():
        while time.perf_counter() < stop:
            started = time.perf_counter()
            with psycopg.connect(dsn) as conn:
                conn.execute("select public.pulse_account_login('+580000000778', '135790')")
                conn.commit()
            elapsed = (time.perf_counter() - started) * 1000
            with lock:
                lats.append(elapsed)

    threads = [threading.Thread(target=worker) for _ in range(4)]
    started = time.perf_counter()
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    elapsed = time.perf_counter() - started
    ordered = sorted(lats)
    def pct(p):
        if not ordered:
            return None
        return round(ordered[min(len(ordered) - 1, int(p * (len(ordered) - 1)))], 1)
    return {"n": len(lats), "seconds": round(elapsed, 2), "perSecond": round(len(lats) / elapsed, 2), "p50": pct(0.5), "p95": pct(0.95)}


def phase1_then_pin() -> dict:
    psql("postgres", "drop database if exists rusher_pin_phase1 with (force);")
    psql("postgres", "create database rusher_pin_phase1;")
    psql("rusher_pin_phase1", path=BOOTSTRAP)
    psql("rusher_pin_phase1", path=PHASE1)
    psql("rusher_pin_phase1", path=PIN_MIGRATION)
    anon_load = "denied"
    try:
        psql("rusher_pin_phase1", "begin; set role anon; select public.pulse_load('missing'); commit;")
        anon_load = "allowed"
    except Exception:
        anon_load = "denied"
    anon_login = "denied"
    try:
        psql("rusher_pin_phase1", "begin; set role anon; select public.pulse_account_login('1','2'); commit;")
        anon_login = "allowed"
    except Exception:
        anon_login = "denied"
    return {"applied": True, "anonLoad": anon_load, "anonLogin": anon_login}


def main() -> None:
    report = {
        "concurrent": concurrent_credit(),
        "pool": connection_limit(),
        "loginRate": login_rate(),
        "phaseOrder": phase1_then_pin(),
    }
    print(json.dumps(report))


if __name__ == "__main__":
    main()

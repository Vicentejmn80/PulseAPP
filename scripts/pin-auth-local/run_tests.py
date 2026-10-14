"""Isolated PIN auth tests. Accepts only local databases rusher_pin_local and rusher_pin_schema."""

from __future__ import annotations

import json
import math
import os
import statistics
import subprocess
import threading
import time
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20261011120000_pin_auth_hardening.sql"
BOOTSTRAP = Path(__file__).resolve().parent / "bootstrap.sql"
ALLOWED_DBS = {"rusher_pin_local", "rusher_pin_schema"}
DSN = os.environ.get("RUSHER_TEST_DSN", "host=127.0.0.1 port=55432 dbname=rusher_pin_local user=postgres")
PIN = "135790"
PUBLIC_FAIL = {"ok": False, "code": "PIN_INVALID", "error": "El número o PIN no son correctos."}


def percentile(values: list[float], p: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    rank = (len(ordered) - 1) * p
    low = math.floor(rank)
    high = math.ceil(rank)
    if low == high:
        return ordered[low]
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)


def public_view(payload: dict) -> dict:
    allowed = ("ok", "code", "error", "retryAfter", "deliver", "isNew")
    return {key: payload.get(key) for key in allowed if key in payload}


def connect():
    conn = psycopg.connect(DSN, row_factory=dict_row)
    conn.autocommit = False
    info = conn.execute("select current_database() as name, inet_server_addr()::text as addr").fetchone()
    addr = info["addr"] or "127.0.0.1"
    if info["name"] not in ALLOWED_DBS or not addr.startswith("127."):
        conn.close()
        raise SystemExit(f"refusing database {info['name']} at {addr}")
    return conn


def target_db() -> str:
    name = os.environ.get("RUSHER_TEST_DB", "rusher_pin_local")
    if name not in ALLOWED_DBS:
        raise SystemExit(f"refusing database {name}")
    return name


def apply_sql(path: Path) -> None:
    psql = os.environ.get("RUSHER_PSQL")
    if psql:
        proc = subprocess.run(
            [psql, "-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", target_db(), "-v", "ON_ERROR_STOP=1", "-f", str(path)],
            capture_output=True,
        )
    else:
        proc = subprocess.run(
            ["docker", "exec", "-i", "rusher-pin-local", "psql", "-U", "postgres", "-d", "rusher_pin_local", "-v", "ON_ERROR_STOP=1"],
            input=path.read_bytes(),
            capture_output=True,
        )
    if proc.returncode != 0:
        tail = (proc.stderr or b"").decode("utf-8", "replace")[-2500:]
        out = (proc.stdout or b"").decode("utf-8", "replace")[-1500:]
        raise RuntimeError(tail + "\n" + out)


def call(conn, fn: str, args: tuple):
    row = conn.execute(f"select {fn} as result", args).fetchone()["result"]
    conn.commit()
    return row


def cleanup(conn) -> None:
    conn.rollback()
    conn.execute(
        """
        delete from public.pulse_sessions
        where user_id in (select id from public.pulse_profiles where phone like '+580000%');
        delete from public.pulse_profiles where phone like '+580000%';
        delete from public.pulse_pin_attempts;
        delete from public.pulse_pin_challenges;
        delete from public.pulse_auth_events;
        """
    )
    conn.execute(
        """
        do $$ begin
          if to_regclass('public.pulse_otp_challenges') is not null then
            delete from public.pulse_otp_challenges where phone like '+580000%';
          end if;
        end $$;
        """
    )
    conn.commit()


def measure_crypt(conn) -> dict:
    samples = {8: [], 10: []}
    for cost in (8, 10):
        for _ in range(5):
            started = time.perf_counter()
            conn.execute("select extensions.crypt(%s, extensions.gen_salt('bf', %s))", (PIN, cost))
            conn.commit()
            samples[cost].append((time.perf_counter() - started) * 1000)
    medians = {cost: statistics.median(values) for cost, values in samples.items()}
    chosen = 10 if medians[10] <= 400 else 8
    return {"samples_ms": samples, "median_ms": medians, "chosen": chosen}


def stamp_cost(cost: int) -> None:
    text = MIGRATION.read_text(encoding="utf-8")
    if "__PIN_BCRYPT_COST__" not in text and f"'{cost}'" not in text and f"'{cost}'::integer" not in text:
        raise RuntimeError("migration is missing the bcrypt cost placeholder")
    text = text.replace("'__PIN_BCRYPT_COST__'", f"'{cost}'")
    text = text.replace("'__PIN_BCRYPT_COST__'::integer", f"{cost}")
    MIGRATION.write_text(text, encoding="utf-8")


def _median_ms(samples: list[float]) -> float:
    return round(statistics.median(samples), 2) if samples else 0.0


def _spread(medians: list[float]) -> float:
    low = min(medians)
    high = max(medians)
    if low <= 0:
        return 999.0
    return (high - low) / low


def timing(conn) -> dict:
    before = {}
    for label, cost in (("cost06", 6), ("cost10", 10), ("missing", 10), ("absent_pin", 10)):
        samples = []
        for _ in range(5):
            started = time.perf_counter()
            conn.execute("select extensions.crypt(%s, extensions.gen_salt('bf', %s))", (PIN, cost))
            conn.commit()
            samples.append((time.perf_counter() - started) * 1000)
        before[label] = _median_ms(samples)

    call(conn, "public.pulse_account_register(%s,%s,%s,%s)", ("+580000000070", "Costo Diez", "costo_diez", PIN))
    call(conn, "public.pulse_account_register(%s,%s,%s,%s)", ("+580000000071", "Costo Seis", "costo_seis", PIN))
    cheap = conn.execute("select extensions.crypt(%s, extensions.gen_salt('bf', 6)) as hash", (PIN,)).fetchone()["hash"]
    conn.commit()
    after = {}

    def time_login(phone: str, pin: str, reset_hash: str | None = None) -> float:
        samples = []
        for _ in range(5):
            if reset_hash is not None:
                conn.execute("update public.pulse_profiles set pin_hash = %s where phone = %s", (reset_hash, phone))
                conn.commit()
            started = time.perf_counter()
            call(conn, "public.pulse_account_login(%s,%s)", (phone, pin))
            samples.append((time.perf_counter() - started) * 1000)
        return _median_ms(samples)

    after["cost10"] = time_login("+580000000070", PIN)
    after["cost06"] = time_login("+580000000071", PIN, cheap)
    after["missing"] = time_login("+580000000404", PIN)
    after["absent_pin"] = time_login("+580000000070", "12")
    gap = _spread(list(after.values()))
    return {
        "status": "PASÓ" if gap <= 0.20 else "FALLÓ",
        "before_single_crypt_ms": before,
        "after_login_ms": after,
        "after_spread": round(gap, 4),
    }


def lock_stats(conn) -> dict:
    rows = conn.execute(
        """
        select event,
               percentile_cont(0.5) within group (order by reason::numeric) as p50,
               percentile_cont(0.95) within group (order by reason::numeric) as p95,
               max(reason::numeric) as max_ms,
               count(*)::int as n
        from public.pulse_auth_events
        where event in ('pin_lock_held', 'pin_recovery_lock_held')
          and reason ~ '^[0-9]+(\\.[0-9]+)?$'
        group by event
        """
    ).fetchall()
    conn.commit()
    return {"events": rows}


def audit(conn) -> dict:
    routines = conn.execute(
        """
        select routine_name, grantee
        from information_schema.routine_privileges
        where routine_schema = 'public' and grantee in ('anon', 'PUBLIC', 'authenticated')
        order by 1, 2
        """
    ).fetchall()
    conn.commit()
    tables = conn.execute(
        """
        select c.relname as name
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        order by 1
        """
    ).fetchall()
    conn.commit()
    provider = conn.execute(
        """
        select grantee
        from information_schema.routine_privileges
        where routine_schema = 'public' and routine_name = 'pulse_otp_provider'
          and grantee in ('anon', 'PUBLIC', 'authenticated', 'service_role')
        """
    ).fetchall()
    conn.commit()
    return {"routines": routines, "tables_without_rls": [row["name"] for row in tables], "otp_provider_grantees": provider}


def consume_probe(conn) -> dict:
    exists = conn.execute(
        "select to_regprocedure('public.pulse_otp_consume(text,text)') is not null as ok"
    ).fetchone()["ok"]
    conn.commit()
    if not exists:
        return {"status": "NO EJECUTADA", "detail": "pulse_otp_consume no está en esta base"}
    created = call(conn, "public.pulse_account_register(%s,%s,%s,%s)", ("+580000000040", "Consume Local", "consume_local", PIN))
    if created.get("code") != "PROFILE_CREATED":
        return {"status": "FALLÓ", "detail": public_view(created)}
    conn.execute(
        """
        insert into public.pulse_otp_challenges (phone, code_hash, expires_at)
        values (
          '+580000000040',
          extensions.crypt(%s, extensions.gen_salt('bf', 8)),
          now() + interval '10 minutes'
        )
        """,
        (PIN,),
    )
    conn.commit()
    consumed = call(conn, "public.pulse_otp_consume(%s,%s)", ("+580000000040", PIN))
    filled = conn.execute(
        """
        select (expires_at is not null) as filled
        from public.pulse_sessions s
        join public.pulse_profiles p on p.id = s.user_id
        where p.phone = '+580000000040'
        order by s.created_at desc
        limit 1
        """
    ).fetchone()["filled"]
    conn.execute(
        """
        insert into public.pulse_sessions (token, user_id)
        select 'sess_omit_expires', id from public.pulse_profiles where phone = '+580000000040'
        """
    )
    omitted = conn.execute(
        "select (expires_at is not null) as filled from public.pulse_sessions where token = 'sess_omit_expires'"
    ).fetchone()["filled"]
    conn.execute("delete from public.pulse_sessions where token = 'sess_omit_expires'")
    conn.commit()
    ok = consumed.get("code") == "OTP_VERIFIED" and filled and omitted
    return {"status": "PASÓ" if ok else "FALLÓ", "code": consumed.get("code"), "defaultFilled": bool(filled), "omitFilled": bool(omitted)}


def rollback_roundtrip() -> dict:
    setup = connect()
    try:
        call(setup, "public.pulse_account_register(%s,%s,%s,%s)", ("+580000000001", "Ana Local", "ana_local", PIN))
    finally:
        setup.close()
    apply_sql(ROOT / "scripts" / "pin_auth_forward_rollback.sql")
    conn = connect()
    try:
        old_login = public_view(call(conn, "public.pulse_account_login(%s,%s)", ("+580000000001", PIN)))
        missing = public_view(call(conn, "public.pulse_account_login(%s,%s)", ("+580000000405", PIN)))
        stub = call(conn, "public.pulse_register(%s,%s)", ("+580000000001", "legacyfx"))
        expires = conn.execute(
            """
            select is_nullable = 'NO' as required, column_default is not null as has_default
            from information_schema.columns
            where table_schema = 'public' and table_name = 'pulse_sessions' and column_name = 'expires_at'
            """
        ).fetchone()
        conn.commit()
        anon = connect()
        anon.execute("set role anon")
        anon.commit()
        denied = []
        for statement in (
            "select public.pulse_snapshot('user_legacy_fixture', 'x')",
            "select public.pulse_pin_recovery_start('+580000000001')",
            "select public.pulse_pin_commit('+580000000001', '000000', '135790')",
            "select public.pulse_register('+580000000001', 'abc')",
        ):
            try:
                anon.execute(statement)
                anon.commit()
                denied.append(False)
            except Exception:
                anon.rollback()
                denied.append(True)
        anon.close()
    finally:
        conn.close()
    apply_sql(MIGRATION)
    restored = connect()
    try:
        again = public_view(call(restored, "public.pulse_account_login(%s,%s)", ("+580000000405", PIN)))
    finally:
        restored.close()
    ok = (
        old_login.get("code") == "SESSION_CREATED"
        and missing.get("code") == "ACCOUNT_NOT_FOUND"
        and stub.get("code") == "LEGACY_AUTH_DISABLED"
        and expires["required"]
        and expires["has_default"]
        and all(denied)
        and again.get("code") == "PIN_INVALID"
    )
    return {
        "status": "PASÓ" if ok else "FALLÓ",
        "oldLogin": old_login.get("code"),
        "oldMissing": missing.get("code"),
        "stub": stub.get("code"),
        "expiresRequired": expires["required"],
        "anonDenied": denied,
        "restoredMissing": again.get("code"),
    }


def main() -> None:
    report = {"functional": [], "load": [], "measured": None, "database": None}
    conn = connect()
    try:
        report["database"] = conn.execute("select current_database() as name").fetchone()["name"]
        conn.commit()
        conn.execute("create schema if not exists extensions")
        conn.execute("create extension if not exists pgcrypto with schema extensions")
        conn.commit()
        measured = measure_crypt(conn)
        report["measured"] = measured
        conn.close()
        stamp_cost(measured["chosen"])
        apply_sql(BOOTSTRAP)
        delta = os.environ.get("RUSHER_SCHEMA_DELTA")
        if delta:
            apply_sql(Path(delta))
        conn = connect()
        conn.execute(
            """
            insert into public.pulse_profiles
              (id, phone, alias, handle, initials, avatar_color, access_code, alias_normalized, full_name, city)
            values
              ('user_legacy_fixture', '+580000000099', 'legacyfx', '@legacyfx', 'LE', '#18A085', 'ABCDEF', 'legacyfx', 'Legacy Fixture', 'Caracas')
            """
        )
        conn.execute(
            """
            insert into public.pulse_sessions (token, user_id, created_at)
            values ('sess_legacy_fixture', 'user_legacy_fixture', now() - interval '8 days')
            """
        )
        conn.commit()
        conn.close()
        apply_sql(MIGRATION)
        conn = connect()
        report["functional"] = functional(conn)
        report["timing"] = timing(conn)
        report["load"] = load(conn)
        report["locks"] = lock_stats(conn)
        report["audit"] = audit(conn)
        report["consume"] = consume_probe(conn)
        if os.environ.get("RUSHER_CHECK_ROLLBACK") == "1":
            report["rollback"] = rollback_roundtrip()
    finally:
        try:
            cleanup(conn)
        finally:
            conn.close()
    text = json.dumps(report, default=str, indent=2)
    report_path = os.environ.get("RUSHER_REPORT")
    if report_path:
        Path(report_path).write_text(text, encoding="utf-8")
    print(text)


def functional(conn) -> list:
    results = []

    def record(name, ok, detail):
        results.append({"name": name, "status": "PASÓ" if ok else "FALLÓ", "detail": detail})

    created = call(conn, "public.pulse_account_register(%s,%s,%s,%s)", ("+580000000001", "Ana Local", "ana_local", PIN))
    record("alta válida", created.get("code") == "PROFILE_CREATED" and created.get("ok") is True, public_view(created))

    dup_phone = call(conn, "public.pulse_account_register(%s,%s,%s,%s)", ("+580000000001", "Ana Local", "ana_otra", PIN))
    dup_alias = call(conn, "public.pulse_account_register(%s,%s,%s,%s)", ("+580000000011", "Ana Local", "ana_local", PIN))
    profiles = conn.execute("select count(*)::int as n from public.pulse_profiles where phone = '+580000000001'").fetchone()["n"]
    conn.commit()
    reasons = conn.execute(
        "select reason, count(*)::int as n from public.pulse_auth_events where event = 'pin_register' group by reason"
    ).fetchall()
    conn.commit()
    record(
        "alta duplicada de teléfono y alias",
        dup_phone.get("code") == "REGISTER_REJECTED"
        and dup_alias.get("code") == "REGISTER_REJECTED"
        and profiles == 1
        and {row["reason"] for row in reasons} >= {"PHONE_TAKEN", "ALIAS_TAKEN"},
        {"phone": public_view(dup_phone), "alias": public_view(dup_alias), "profiles": profiles, "reasons": reasons},
    )

    for _ in range(5):
        call(conn, "public.pulse_account_login(%s,%s)", ("+580000000001", "246810"))
    locked = conn.execute(
        """
        select next_allowed_at
        from public.pulse_pin_attempts
        where phone_hmac = public.pulse_phone_hmac('+580000000001')
        """
    ).fetchone()["next_allowed_at"]
    conn.commit()
    during = call(conn, "public.pulse_account_login(%s,%s)", ("+580000000001", PIN))
    record(
        "PIN correcto dentro de la ventana",
        during.get("code") == "SESSION_CREATED",
        public_view(during),
    )

    wrong = public_view(call(conn, "public.pulse_account_login(%s,%s)", ("+580000000001", "246810")))
    missing = public_view(call(conn, "public.pulse_account_login(%s,%s)", ("+580000000088", PIN)))
    call(
        conn,
        "public.pulse_account_register(%s,%s,%s,%s)",
        ("+580000000077", "Sin Pin", "sin_pin_local", PIN),
    )
    conn.execute("update public.pulse_profiles set pin_hash = null where phone = '+580000000077'")
    conn.commit()
    unset = public_view(call(conn, "public.pulse_account_login(%s,%s)", ("+580000000077", PIN)))
    record("mismo JSON público", wrong == missing == unset == PUBLIC_FAIL, {"wrong": wrong, "missing": missing, "unset": unset})

    conn.execute(
        """
        update public.pulse_pin_attempts
        set failures = 0, window_started_at = now(), next_allowed_at = now()
        where phone_hmac = public.pulse_phone_hmac('+580000000001')
        """
    )
    conn.commit()
    barrier = threading.Barrier(2)
    parallel = []

    def one_bad():
        local = connect()
        try:
            barrier.wait()
            parallel.append(public_view(call(local, "public.pulse_account_login(%s,%s)", ("+580000000001", "246810"))))
        finally:
            local.close()

    threads = [threading.Thread(target=one_bad) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    failures = conn.execute(
        "select failures from public.pulse_pin_attempts where phone_hmac = public.pulse_phone_hmac('+580000000001')"
    ).fetchone()["failures"]
    conn.commit()
    record("dos login concurrentes", failures == 2, {"failures": failures, "responses": parallel})

    conn.execute(
        """
        update public.pulse_pin_attempts
        set failures = 0, window_started_at = now(), next_allowed_at = now()
        where phone_hmac = public.pulse_phone_hmac('+580000000001')
        """
    )
    conn.commit()
    for _ in range(5):
        call(conn, "public.pulse_account_login(%s,%s)", ("+580000000001", "246810"))
    before = conn.execute(
        "select next_allowed_at from public.pulse_pin_attempts where phone_hmac = public.pulse_phone_hmac('+580000000001')"
    ).fetchone()["next_allowed_at"]
    conn.commit()
    extra = [public_view(call(conn, "public.pulse_account_login(%s,%s)", ("+580000000001", "246810"))) for _ in range(3)]
    after = conn.execute(
        "select next_allowed_at from public.pulse_pin_attempts where phone_hmac = public.pulse_phone_hmac('+580000000001')"
    ).fetchone()["next_allowed_at"]
    conn.commit()
    record(
        "el castigo no se alarga",
        before == after and all(item.get("code") == "PIN_RATE_LIMITED" for item in extra),
        {"unchanged": before == after, "extra": extra},
    )

    issued = call(conn, "public.pulse_pin_recovery_start(%s)", ("+580000000077",))
    otp = issued.get("otp")
    committed = call(conn, "public.pulse_pin_commit(%s,%s,%s)", ("+580000000077", otp, "246810"))
    sessions = conn.execute(
        """
        select count(*)::int as n
        from public.pulse_sessions s
        join public.pulse_profiles p on p.id = s.user_id
        where p.phone = '+580000000077'
        """
    ).fetchone()["n"]
    conn.commit()
    record(
        "fijar PIN deja una sesión",
        issued.get("deliver") is True and committed.get("code") == "PIN_SET" and sessions == 1 and "otp" not in public_view(issued),
        {"deliver": issued.get("deliver"), "commit": public_view(committed), "sessions": sessions},
    )

    legacy = call(conn, "public.pulse_load(%s)", ("sess_legacy_fixture",))
    record("sesión previa a la migración", legacy.get("ok") is True and legacy.get("currentUser", {}).get("id") == "user_legacy_fixture", {"ok": legacy.get("ok")})

    conn.execute("update public.pulse_sessions set expires_at = now() - interval '1 minute' where token = 'sess_legacy_fixture'")
    conn.commit()
    expired = call(conn, "public.pulse_load(%s)", ("sess_legacy_fixture",))
    unknown = call(conn, "public.pulse_load(%s)", ("sess_does_not_exist",))
    reasons = conn.execute(
        "select reason from public.pulse_auth_events where event = 'pin_load' and reason in ('EXPIRED','INVALID_TOKEN') group by reason"
    ).fetchall()
    conn.commit()
    record(
        "token vencido y desconocido",
        expired.get("error") == unknown.get("error") and {row["reason"] for row in reasons} == {"EXPIRED", "INVALID_TOKEN"},
        {"sameText": expired.get("error") == unknown.get("error"), "reasons": [row["reason"] for row in reasons]},
    )

    anon = connect()
    anon.execute("set role anon")
    anon.commit()
    try:
        visible = anon.execute("select count(*)::int as n from public.pulse_profiles").fetchone()["n"]
        anon.commit()
    except Exception:
        anon.rollback()
        visible = 0
    denied = []
    for statement in (
        "select public.pulse_snapshot('user_legacy_fixture', 'x')",
        "select public.pulse_pin_recovery_start('+580000000001')",
        "select public.pulse_pin_commit('+580000000001', '000000', '135790')",
        "select public.pulse_account_login('+580000000001', '135790')",
        "select public.pulse_account_register('+580000000001', 'Ana', 'ana', '135790')",
        "select public.pulse_logout('sess_legacy_fixture')",
    ):
        try:
            anon.execute(statement)
            anon.commit()
            denied.append(False)
        except Exception:
            anon.rollback()
            denied.append(True)
    anon.close()
    blocked = []
    for table in (
        "pulse_internal_config",
        "pulse_pin_attempts",
        "pulse_auth_events",
        "pulse_pin_challenges",
        "pulse_sessions",
        "pulse_profiles",
        "pulse_participations",
        "pulse_transactions",
        "pulse_completed_missions",
        "pulse_prediction_picks",
        "pulse_extra_games",
        "pulse_sim_scenarios",
    ):
        probe = connect()
        probe.execute("set role anon")
        try:
            seen = probe.execute(f"select count(*)::int as n from public.{table}").fetchone()["n"]
            probe.commit()
            blocked.append(seen == 0)
        except Exception:
            probe.rollback()
            blocked.append(True)
        finally:
            probe.close()
    load_probe = connect()
    load_probe.execute("set role anon")
    load_probe.commit()
    try:
        loaded = load_probe.execute("select public.pulse_load('sess_does_not_exist') as result").fetchone()
        load_probe.commit()
        load_allowed = True
        load_code = loaded["result"]
        if isinstance(load_code, str):
            load_code = json.loads(load_code)
    except Exception:
        load_probe.rollback()
        load_allowed = False
        load_code = {}
    finally:
        load_probe.close()
    record(
        "anon sin lectura ni RPC de registro login o recuperación",
        visible == 0 and all(denied) and all(blocked) and load_allowed and load_code.get("code") == "SESSION_EXPIRED",
        {"visibleProfiles": visible, "denied": denied, "tablesBlocked": blocked, "loadAllowed": load_allowed},
    )

    phone = "+580000000510"
    call(conn, "public.pulse_account_register(%s,%s,%s,%s)", (phone, "Escala Local", "escala_local", PIN))
    for _ in range(5):
        call(conn, "public.pulse_account_login(%s,%s)", (phone, "246810"))
    level_row = conn.execute(
        """
        select lock_level, extract(epoch from (next_allowed_at - now())) as wait_s
        from public.pulse_pin_attempts
        where phone_hmac = public.pulse_phone_hmac(%s)
        """,
        (phone,),
    ).fetchone()
    level_events = conn.execute(
        "select reason from public.pulse_auth_events where event = 'pin_lock_level' and phone_hmac = public.pulse_phone_hmac(%s) order by id",
        (phone,),
    ).fetchall()
    conn.commit()
    still_in = public_view(call(conn, "public.pulse_account_login(%s,%s)", (phone, PIN)))
    reset_row = conn.execute(
        "select lock_level from public.pulse_pin_attempts where phone_hmac = public.pulse_phone_hmac(%s)",
        (phone,),
    ).fetchone()
    conn.commit()
    record(
        "escalado 15 min y el dueño entra",
        level_row["lock_level"] == 1
        and 14 * 60 <= level_row["wait_s"] <= 16 * 60
        and [row["reason"] for row in level_events] == ["1"]
        and still_in.get("code") == "SESSION_CREATED"
        and reset_row["lock_level"] == 0,
        {"level": level_row["lock_level"], "wait_s": round(level_row["wait_s"], 1), "after": reset_row["lock_level"]},
    )

    def punish(expected_level: int, low_s: int, high_s: int):
        conn.execute(
            """
            update public.pulse_pin_attempts
            set failures = 0, next_allowed_at = now(), window_started_at = now(),
                lock_level = %s, lock_raised_at = now()
            where phone_hmac = public.pulse_phone_hmac(%s)
            """,
            (expected_level - 1, phone),
        )
        conn.commit()
        for _ in range(5):
            call(conn, "public.pulse_account_login(%s,%s)", (phone, "246810"))
        row = conn.execute(
            """
            select lock_level, extract(epoch from (next_allowed_at - now())) as wait_s
            from public.pulse_pin_attempts
            where phone_hmac = public.pulse_phone_hmac(%s)
            """,
            (phone,),
        ).fetchone()
        conn.commit()
        return row["lock_level"] == expected_level and low_s <= row["wait_s"] <= high_s

    hour_ok = punish(2, 59 * 60, 61 * 60)
    day_ok = punish(3, 23 * 3600, 25 * 3600)
    owner_locked = public_view(call(conn, "public.pulse_account_login(%s,%s)", (phone, PIN)))
    cleared = conn.execute(
        "select lock_level from public.pulse_pin_attempts where phone_hmac = public.pulse_phone_hmac(%s)",
        (phone,),
    ).fetchone()
    conn.commit()
    for _ in range(5):
        call(conn, "public.pulse_account_login(%s,%s)", (phone, "246810"))
    back = conn.execute(
        """
        select lock_level, extract(epoch from (next_allowed_at - now())) as wait_s
        from public.pulse_pin_attempts
        where phone_hmac = public.pulse_phone_hmac(%s)
        """,
        (phone,),
    ).fetchone()
    conn.commit()
    record(
        "escalado 1 h, 24 h y reinicio tras éxito",
        hour_ok and day_ok and owner_locked.get("code") == "SESSION_CREATED" and cleared["lock_level"] == 0 and back["lock_level"] == 1 and 14 * 60 <= back["wait_s"] <= 16 * 60,
        {"hour": hour_ok, "day": day_ok, "owner": owner_locked.get("code"), "reset": back["lock_level"]},
    )

    other = call(conn, "public.pulse_account_register(%s,%s,%s,%s)", ("+580000000511", "Otro Local", "otro_local", PIN))
    mine = call(conn, "public.pulse_load(%s)", (created["token"],))
    record(
        "token de A no lee a B",
        mine.get("currentUser", {}).get("id") == created.get("currentUser", {}).get("id")
        and mine.get("currentUser", {}).get("id") != other.get("currentUser", {}).get("id"),
        {"same": mine.get("currentUser", {}).get("id") == created.get("currentUser", {}).get("id")},
    )

    credit = conn.execute("select to_regprocedure('public.pulse_credit(text,text,text,integer,jsonb)') is not null as present").fetchone()["present"]
    conn.commit()
    if not credit:
        results.append({"name": "anon no ejecuta pulse_credit", "status": "NO EJECUTADA", "detail": {"reason": "la función no está en esta base"}})
    else:
        probe = connect()
        probe.execute("set role anon")
        probe.commit()
        try:
            probe.execute("select public.pulse_credit('user_b', 'x', 'y', 1, '{}'::jsonb)")
            probe.commit()
            credit_denied = False
        except Exception:
            probe.rollback()
            credit_denied = True
        finally:
            probe.close()
        record("anon no ejecuta pulse_credit", credit_denied, {"denied": credit_denied})

    purged_token = "sess_purge_fixture"
    conn.execute(
        """
        insert into public.pulse_sessions (token, user_id, expires_at)
        values (%s, 'user_legacy_fixture', now() - interval '2 days')
        """,
        (purged_token,),
    )
    conn.execute(
        "insert into public.pulse_auth_events (created_at, event, reason) values (now() - interval '91 days', 'pin_login', 'OLD')"
    )
    conn.execute(
        "insert into public.pulse_pin_challenges (phone_hmac, code_hash, expires_at) values ('purge-hmac', 'hash', now() - interval '2 days')"
    )
    conn.commit()
    purged = call(conn, "public.pulse_auth_purge()", ())
    left_session = conn.execute("select count(*)::int as n from public.pulse_sessions where token = %s", (purged_token,)).fetchone()["n"]
    left_event = conn.execute("select count(*)::int as n from public.pulse_auth_events where reason = 'OLD'").fetchone()["n"]
    left_challenge = conn.execute("select count(*)::int as n from public.pulse_pin_challenges where phone_hmac = 'purge-hmac'").fetchone()["n"]
    conn.commit()
    record(
        "purga borra eventos viejos, desafíos y sesiones vencidas",
        purged.get("ok") is True and left_session == 0 and left_event == 0 and left_challenge == 0,
        {"sessions": left_session, "events": left_event, "challenges": left_challenge},
    )

    issue_present = conn.execute("select to_regprocedure('public.pulse_otp_issue(text,text,text)') is not null as present").fetchone()["present"]
    conn.commit()
    if not issue_present:
        results.append({"name": "emisión OTP con tope de 3 por hora", "status": "NO EJECUTADA", "detail": {"reason": "pulse_otp_issue no está en esta base"}})
    else:
        otp_phone = "+580000000512"
        codes = []
        for _ in range(4):
            conn.execute("update public.pulse_otp_challenges set last_sent_at = now() - interval '2 minutes' where phone = %s", (otp_phone,))
            conn.commit()
            issued_otp = call(conn, "public.pulse_otp_issue(%s,%s,%s)", (otp_phone, "135790", "local-test-secret"))
            codes.append(issued_otp.get("code"))
        stored = conn.execute("select code_hash from public.pulse_otp_challenges where phone = %s", (otp_phone,)).fetchone()
        conn.commit()
        anon_issue = connect()
        anon_issue.execute("set role anon")
        anon_issue.commit()
        try:
            anon_issue.execute("select public.pulse_otp_issue(%s,%s,%s)", (otp_phone, "135790", "local-test-secret"))
            anon_issue.commit()
            issue_denied = False
        except Exception:
            anon_issue.rollback()
            issue_denied = True
        finally:
            anon_issue.close()
        record(
            "emisión OTP con tope de 3 por hora",
            codes[:3] == ["OTP_SENT", "OTP_SENT", "OTP_SENT"]
            and codes[3] == "OTP_RATE_LIMITED"
            and stored
            and stored["code_hash"] != "135790"
            and issue_denied,
            {"codes": codes, "hashed": bool(stored and stored["code_hash"] != "135790"), "anonDenied": issue_denied},
        )

    admin_denied = 0
    admin_present = 0
    names = conn.execute(
        """
        select p.proname
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and (p.proname like 'pulse_admin_%' or p.proname like 'pulse_reporter_%'
            or p.proname like 'pulse_trivia_admin_%'
            or p.proname in ('pulse_cleanup_test', 'pulse_seed_test_scenario', 'pulse_require_admin'))
        """
    ).fetchall()
    conn.commit()
    for row in names:
        admin_present += 1
        probe = connect()
        probe.execute("set role anon")
        probe.commit()
        try:
            probe.execute(f"select public.{row['proname']}('x')")
            probe.commit()
        except Exception as exc:
            probe.rollback()
            if "permission denied" in str(exc).lower():
                admin_denied += 1
        finally:
            probe.close()
    if admin_present < 42:
        results.append({"name": "anon sin funciones admin", "status": "NO EJECUTADA", "detail": {"present": admin_present}})
    else:
        record("anon sin funciones admin", admin_denied == admin_present, {"present": admin_present, "denied": admin_denied})

    conn.execute(
        """
        create table if not exists public.pulse_admin_keys (
          id integer generated always as identity primary key,
          admin_key text not null
        );
        insert into public.pulse_admin_keys (admin_key)
        select '0123456789abcdef0123456789abcdef'
        where not exists (select 1 from public.pulse_admin_keys);
        """
    )
    conn.execute("drop function if exists public.pulse_require_admin(text)")
    conn.execute(
        """
        create function public.pulse_require_admin(p_admin_key text)
        returns boolean language plpgsql security definer set search_path to public, extensions as $fn$
        declare
          v_key text;
          v_got text := trim(coalesce(p_admin_key, ''));
          v_a bytea;
          v_b bytea;
          v_diff int := 0;
          v_i int;
        begin
          select admin_key into v_key from public.pulse_admin_keys order by id limit 1;
          if v_key is null or length(v_got) < 32 or length(v_key) < 32 then
            return false;
          end if;
          v_a := extensions.digest(v_got, 'sha256');
          v_b := extensions.digest(v_key, 'sha256');
          for v_i in 0..31 loop
            v_diff := v_diff + (get_byte(v_a, v_i) # get_byte(v_b, v_i));
          end loop;
          return v_diff = 0;
        end;
        $fn$;
        """
    )
    conn.commit()
    admin_match = conn.execute(
        "select public.pulse_require_admin('0123456789abcdef0123456789abcdef') as ok"
    ).fetchone()["ok"]
    admin_short = conn.execute("select public.pulse_require_admin('short-secret') as ok").fetchone()["ok"]
    admin_wrong = conn.execute(
        "select public.pulse_require_admin('fedcba9876543210fedcba9876543210') as ok"
    ).fetchone()["ok"]
    conn.execute("update public.pulse_admin_keys set admin_key = 'shortkey12'")
    conn.commit()
    admin_stored_short = conn.execute(
        "select public.pulse_require_admin('0123456789abcdef0123456789abcdef') as ok"
    ).fetchone()["ok"]
    conn.commit()
    record(
        "admin exige secreto de 32 y compara el hash",
        admin_match is True and admin_short is False and admin_wrong is False and admin_stored_short is False,
        {"match": admin_match, "short": admin_short, "wrong": admin_wrong, "storedShort": admin_stored_short},
    )

    credit_user = created.get("currentUser", {}).get("id")
    for _ in range(20):
        conn.execute("select public.pulse_credit(%s, 'qr_scan', 'once', 3, '{}'::jsonb)", (credit_user,))
        conn.commit()
    credit_rows = conn.execute(
        "select count(*)::int as n, coalesce(sum(points), 0)::int as points from public.pulse_transactions where user_id = %s",
        (credit_user,),
    ).fetchone()
    conn.commit()
    record(
        "veinte créditos del mismo origen dejan una fila",
        credit_rows["n"] == 1 and credit_rows["points"] == 3,
        {"rows": credit_rows["n"], "points": credit_rows["points"]},
    )
    conn.execute("update public.pulse_internal_config set value = 'true' where key = 'pin_prizes_frozen'")
    conn.commit()
    conn.execute("select public.pulse_credit(%s, 'qr_scan', 'frozen', 9, '{}'::jsonb)", (credit_user,))
    conn.commit()
    frozen_rows = conn.execute(
        "select count(*)::int as n from public.pulse_transactions where source_id = 'frozen'"
    ).fetchone()["n"]
    conn.execute("update public.pulse_internal_config set value = 'false' where key = 'pin_prizes_frozen'")
    conn.commit()
    record("congelar premios no acredita", frozen_rows == 0, {"rows": frozen_rows})

    conn.execute(
        """
        create table if not exists public.pulse_league_members (
          league_id text not null,
          user_id text not null,
          primary key (league_id, user_id)
        );
        create or replace function public.pulse_user_id(p_token text)
        returns text language sql security definer set search_path to public as $fn$
          select user_id from public.pulse_sessions where token = p_token and expires_at > now();
        $fn$;
        create or replace function public.pulse_league_ranking(p_token text, p_league_id text, p_cycle text default 'lifetime')
        returns jsonb language plpgsql security definer set search_path to public as $fn$
        declare uid text;
        begin
          uid := public.pulse_user_id(p_token);
          if uid is null or not exists (
            select 1 from public.pulse_league_members member
            where member.league_id = p_league_id and member.user_id = uid
          ) then
            return '[]'::jsonb;
          end if;
          return jsonb_build_object('member', true);
        end;
        $fn$;
        """
    )
    conn.execute(
        "insert into public.pulse_league_members (league_id, user_id) values ('league_b', %s) on conflict do nothing",
        (other.get("currentUser", {}).get("id"),),
    )
    conn.commit()
    hidden = call(conn, "public.pulse_league_ranking(%s,%s,%s)", (created.get("token"), "league_b", "lifetime"))
    visible = call(conn, "public.pulse_league_ranking(%s,%s,%s)", (other.get("token"), "league_b", "lifetime"))
    record(
        "token de A no ve la liga de B",
        hidden == [] and isinstance(visible, dict) and visible.get("member") is True,
        {"hiddenEmpty": hidden == [], "member": isinstance(visible, dict) and visible.get("member") is True},
    )
    conn.execute("revoke all on function public.pulse_user_id(text) from public, anon, authenticated")
    conn.commit()

    sends = 0
    for _ in range(8):
        started = call(conn, "public.pulse_pin_recovery_start(%s)", ("+580000000001",))
        if started.get("deliver") is True:
            sends += 1
    record("adaptador respeta el tope y no expone el código", sends <= 5, {"sends": sends})
    return results


def load(conn) -> list:
    results = []
    samples = []
    cost = conn.execute("select value::int as cost from public.pulse_internal_config where key = 'pin_bcrypt_cost'").fetchone()["cost"]
    conn.commit()
    for _ in range(5):
        started = time.perf_counter()
        conn.execute("select extensions.crypt(%s, extensions.gen_salt('bf', %s))", (PIN, cost))
        conn.commit()
        samples.append((time.perf_counter() - started) * 1000)
    median = statistics.median(samples)

    def record(name, ok, detail):
        results.append({"name": name, "status": "PASÓ" if ok else "FALLÓ", "detail": detail, "crypt_median_ms": round(median, 2)})

    latencies = []
    barrier = threading.Barrier(20)
    errors = []

    def correct_login():
        local = connect()
        try:
            barrier.wait()
            started = time.perf_counter()
            view = public_view(call(local, "public.pulse_account_login(%s,%s)", ("+580000000001", PIN)))
            latencies.append((time.perf_counter() - started) * 1000)
            if view.get("code") != "SESSION_CREATED":
                errors.append(view.get("code"))
        except Exception as exc:
            errors.append(type(exc).__name__)
        finally:
            local.close()

    conn.execute(
        """
        update public.pulse_pin_attempts
        set failures = 0, window_started_at = now(), next_allowed_at = now()
        where phone_hmac = public.pulse_phone_hmac('+580000000001')
        """
    )
    conn.commit()
    threads = [threading.Thread(target=correct_login) for _ in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    same_p95 = percentile(latencies, 0.95)
    same_p50 = percentile(latencies, 0.5)

    distinct_lat = []
    distinct_errors = []
    for index in range(20):
        phone = f"+580000000{100 + index:03d}"
        alias = f"dist{index:02d}"
        call(conn, "public.pulse_account_register(%s,%s,%s,%s)", (phone, "Distinto Local", alias, PIN))
    distinct_barrier = threading.Barrier(20)

    def distinct_login(index: int):
        local = connect()
        try:
            distinct_barrier.wait()
            started = time.perf_counter()
            view = public_view(call(local, "public.pulse_account_login(%s,%s)", (f"+580000000{100 + index:03d}", PIN)))
            distinct_lat.append((time.perf_counter() - started) * 1000)
            if view.get("code") != "SESSION_CREATED":
                distinct_errors.append(view.get("code"))
        except Exception as exc:
            distinct_errors.append(type(exc).__name__)
        finally:
            local.close()

    distinct_threads = [threading.Thread(target=distinct_login, args=(index,)) for index in range(20)]
    for thread in distinct_threads:
        thread.start()
    for thread in distinct_threads:
        thread.join()
    distinct_p95 = percentile(distinct_lat, 0.95)
    record(
        "20 login mismo teléfono vs 20 distintos",
        not errors and not distinct_errors and same_p95 <= distinct_p95 * 1.5,
        {
            "same_p50": round(same_p50, 2),
            "same_p95": round(same_p95, 2),
            "distinct_p50": round(percentile(distinct_lat, 0.5), 2),
            "distinct_p95": round(distinct_p95, 2),
            "errors": errors + distinct_errors,
        },
    )

    baseline = []
    for _ in range(10):
        started = time.perf_counter()
        call(conn, "public.pulse_account_login(%s,%s)", ("+580000000001", PIN))
        baseline.append((time.perf_counter() - started) * 1000)
    baseline_p95 = percentile(baseline, 0.95)
    attack_lat = []
    attack_errors = []
    attack_jobs = list(range(200))
    attack_lock = threading.Lock()

    def attacker():
        local = connect()
        try:
            while True:
                with attack_lock:
                    if not attack_jobs:
                        return
                    attack_jobs.pop()
                call(local, "public.pulse_account_login(%s,%s)", ("+580000000001", "246810"))
        except Exception as exc:
            attack_errors.append(type(exc).__name__)
        finally:
            local.close()

    attackers = [threading.Thread(target=attacker) for _ in range(4)]
    for thread in attackers:
        thread.start()
    time.sleep(0.05)
    for _ in range(10):
        started = time.perf_counter()
        view = public_view(call(conn, "public.pulse_account_login(%s,%s)", ("+580000000001", PIN)))
        attack_lat.append((time.perf_counter() - started) * 1000)
        if view.get("code") != "SESSION_CREATED":
            attack_errors.append(view.get("code"))
    for thread in attackers:
        thread.join()
    attack_p95 = percentile(attack_lat, 0.95)
    record(
        "dueño durante 200 PIN incorrectos",
        not attack_errors and attack_p95 <= baseline_p95 * 2,
        {
            "owner_p50": round(percentile(attack_lat, 0.5), 2),
            "owner_p95": round(attack_p95, 2),
            "baseline_p95": round(baseline_p95, 2),
            "errors": attack_errors[:5],
        },
    )

    pool_errors = []
    paced = []
    start_gate = time.perf_counter()
    jobs = list(range(600))
    job_lock = threading.Lock()

    def paced_worker():
        local = connect()
        try:
            while True:
                with job_lock:
                    if not jobs:
                        return
                    index = jobs.pop(0)
                phone = f"+58000000{1000 + index:04d}"
                target = start_gate + (index / 5)
                delay = target - time.perf_counter()
                if delay > 0:
                    time.sleep(delay)
                try:
                    started = time.perf_counter()
                    call(local, "public.pulse_account_login(%s,%s)", (phone, PIN))
                    paced.append((time.perf_counter() - started) * 1000)
                except Exception as exc:
                    pool_errors.append(type(exc).__name__)
        finally:
            local.close()

    workers = [threading.Thread(target=paced_worker) for _ in range(8)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join()
    record(
        "100 teléfonos a 5 req/s durante 2 min",
        not pool_errors and len(paced) == 600,
        {"completed": len(paced), "errors": pool_errors[:5], "p50": round(percentile(paced, 0.5), 2), "p95": round(percentile(paced, 0.95), 2)},
    )

    token = conn.execute(
        "select token from public.pulse_sessions s join public.pulse_profiles p on p.id = s.user_id where p.phone = '+580000000001' limit 1"
    ).fetchone()["token"]
    conn.commit()
    load_lat = []
    load_errors = []
    load_barrier = threading.Barrier(50)

    def one_load():
        local = connect()
        try:
            load_barrier.wait()
            started = time.perf_counter()
            result = call(local, "public.pulse_load(%s)", (token,))
            load_lat.append((time.perf_counter() - started) * 1000)
            if result.get("ok") is not True:
                load_errors.append(result.get("code"))
        except Exception as exc:
            load_errors.append(type(exc).__name__)
        finally:
            local.close()

    loaders = [threading.Thread(target=one_load) for _ in range(50)]
    for loader in loaders:
        loader.start()
    for loader in loaders:
        loader.join()
    record(
        "50 pulse_load concurrentes",
        not load_errors,
        {"p50": round(percentile(load_lat, 0.5), 2), "p95": round(percentile(load_lat, 0.95), 2), "errors": load_errors[:5]},
    )

    reg_codes = []
    reg_barrier = threading.Barrier(20)

    def one_register():
        local = connect()
        try:
            reg_barrier.wait()
            reg_codes.append(public_view(call(local, "public.pulse_account_register(%s,%s,%s,%s)", ("+580000000050", "Carrera Local", "carrera_local", PIN))).get("code"))
        finally:
            local.close()

    racers = [threading.Thread(target=one_register) for _ in range(20)]
    for racer in racers:
        racer.start()
    for racer in racers:
        racer.join()
    winners = conn.execute("select count(*)::int as n from public.pulse_profiles where phone = '+580000000050'").fetchone()["n"]
    conn.commit()
    record("20 altas concurrentes del mismo teléfono", winners == 1 and reg_codes.count("PROFILE_CREATED") == 1, {"profiles": winners, "created": reg_codes.count("PROFILE_CREATED")})

    call(conn, "public.pulse_account_register(%s,%s,%s,%s)", ("+580000000066", "Tope Local", "tope_local", PIN))
    burst_sends = 0
    burst_lat = []
    burst_errors = []
    burst_jobs = list(range(100))
    burst_lock = threading.Lock()

    def recovery_worker():
        local = connect()
        try:
            while True:
                with burst_lock:
                    if not burst_jobs:
                        return
                    burst_jobs.pop()
                try:
                    started = time.perf_counter()
                    started_row = call(local, "public.pulse_pin_recovery_start(%s)", ("+580000000066",))
                    burst_lat.append((time.perf_counter() - started) * 1000)
                    if started_row.get("deliver") is True:
                        with burst_lock:
                            nonlocal_sends[0] += 1
                except Exception as exc:
                    burst_errors.append(type(exc).__name__)
        finally:
            local.close()

    nonlocal_sends = [0]
    burst_workers = [threading.Thread(target=recovery_worker) for _ in range(20)]
    burst_started = time.perf_counter()
    for worker in burst_workers:
        worker.start()
    for worker in burst_workers:
        worker.join()
    burst_sends = nonlocal_sends[0]
    burst_seconds = max(time.perf_counter() - burst_started, 0.001)
    record(
        "100 arranques de recuperación",
        burst_sends <= 5 and not burst_errors,
        {
            "sends": burst_sends,
            "errors": burst_errors[:5],
            "elapsed_s": round(burst_seconds, 2),
            "starts_per_s": round(100 / burst_seconds, 2),
            "p50": round(percentile(burst_lat, 0.5), 2),
            "p95": round(percentile(burst_lat, 0.95), 2),
        },
    )

    spike_lat = []
    spike_errors = []
    spike_phones = [f"+580000002{index:03d}" for index in range(200)]
    spike_jobs = list(enumerate(spike_phones))
    spike_lock = threading.Lock()
    peak_conn = [0]
    stop_watch = threading.Event()

    def watch_connections():
        local = connect()
        try:
            while not stop_watch.is_set():
                seen = local.execute(
                    "select count(*)::int as n from pg_stat_activity where datname = current_database()"
                ).fetchone()["n"]
                local.commit()
                peak_conn[0] = max(peak_conn[0], seen)
                time.sleep(0.05)
        finally:
            local.close()

    def spike_worker():
        local = connect()
        try:
            while True:
                with spike_lock:
                    if not spike_jobs:
                        return
                    index, phone = spike_jobs.pop()
                started = time.perf_counter()
                view = public_view(
                    call(local, "public.pulse_account_register(%s,%s,%s,%s)", (phone, "Pico Local", f"pico{index:03d}", PIN))
                )
                spike_lat.append((time.perf_counter() - started) * 1000)
                if view.get("code") != "PROFILE_CREATED":
                    spike_errors.append(view.get("code"))
        except Exception as exc:
            spike_errors.append(type(exc).__name__)
        finally:
            local.close()

    watcher = threading.Thread(target=watch_connections)
    watcher.start()
    spike_started = time.perf_counter()
    spike_threads = [threading.Thread(target=spike_worker) for _ in range(12)]
    for thread in spike_threads:
        thread.start()
    for thread in spike_threads:
        thread.join()
    spike_elapsed = time.perf_counter() - spike_started
    stop_watch.set()
    watcher.join()
    record(
        "200 altas en 30 s",
        not spike_errors and spike_elapsed <= 30 and len(spike_lat) == 200,
        {
            "n": len(spike_lat),
            "elapsed_s": round(spike_elapsed, 2),
            "p50": round(percentile(spike_lat, 0.5), 2) if spike_lat else None,
            "p95": round(percentile(spike_lat, 0.95), 2) if spike_lat else None,
            "errors": spike_errors[:5],
            "peak_connections": peak_conn[0],
        },
    )

    mix_phone = "+580000000530"
    mix_created = call(conn, "public.pulse_account_register(%s,%s,%s,%s)", (mix_phone, "Mezcla Local", "mezcla_local", PIN))
    mix_token = mix_created.get("token") or ""
    kinds = ["load" if index % 20 < 16 else "login" if index % 20 < 19 else "register" for index in range(300)]
    mix_lat = {"load": [], "login": [], "register": []}
    mix_errors = []
    mix_jobs = list(enumerate(kinds))
    mix_lock = threading.Lock()
    mix_reg = [0]
    mix_start = time.perf_counter()

    def mix_worker():
        local = connect()
        try:
            while True:
                with mix_lock:
                    if not mix_jobs:
                        return
                    index, kind = mix_jobs.pop(0)
                due = mix_start + (index * 180 / 300)
                delay = due - time.perf_counter()
                if delay > 0:
                    time.sleep(delay)
                started = time.perf_counter()
                if kind == "load":
                    view = public_view(call(local, "public.pulse_load(%s)", (mix_token,)))
                    ok = view.get("ok") is True
                elif kind == "login":
                    view = public_view(call(local, "public.pulse_account_login(%s,%s)", (mix_phone, PIN)))
                    ok = view.get("code") == "SESSION_CREATED"
                else:
                    with mix_lock:
                        n = mix_reg[0]
                        mix_reg[0] += 1
                    view = public_view(
                        call(
                            local,
                            "public.pulse_account_register(%s,%s,%s,%s)",
                            (f"+580000004{n:03d}", "Mezcla Alta", f"mez{n:03d}", PIN),
                        )
                    )
                    ok = view.get("code") == "PROFILE_CREATED"
                mix_lat[kind].append((time.perf_counter() - started) * 1000)
                if not ok:
                    mix_errors.append(view.get("code") or kind)
        except Exception as exc:
            mix_errors.append(type(exc).__name__)
        finally:
            local.close()

    mix_threads = [threading.Thread(target=mix_worker) for _ in range(8)]
    for thread in mix_threads:
        thread.start()
    for thread in mix_threads:
        thread.join()
    mix_elapsed = time.perf_counter() - mix_start

    def pack(name: str):
        values = mix_lat[name]
        return {
            "n": len(values),
            "p50": round(percentile(values, 0.5), 2) if values else None,
            "p95": round(percentile(values, 0.95), 2) if values else None,
        }

    record(
        "mezcla 300 operaciones en 3 min",
        not mix_errors and pack("load")["n"] == 240 and pack("login")["n"] == 45 and pack("register")["n"] == 15,
        {"elapsed_s": round(mix_elapsed, 2), "errors": mix_errors[:5], "load": pack("load"), "login": pack("login"), "register": pack("register")},
    )
    return results


if __name__ == "__main__":
    main()

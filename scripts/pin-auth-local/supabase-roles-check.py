"""Apply phase 1 and the PIN migration as a non-superuser postgres.

The cluster on port 55432 cannot drop SUPERUSER from its bootstrap user.
This script starts a second local cluster whose bootstrap user is supabase_admin
and whose postgres role is not a superuser.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = Path(os.environ["RUSHER_PSQL"]).parent
PSQL = str(BIN / "psql.exe")
INITDB = str(BIN / "initdb.exe")
CTL = str(BIN / "pg_ctl.exe")
DATA = Path(os.environ["LOCALAPPDATA"]) / "rusher-pg" / "roles-data"
LOG = Path(os.environ["LOCALAPPDATA"]) / "rusher-pg" / "roles-server.log"
BOOTSTRAP = Path(__file__).resolve().parent / "bootstrap.sql"
PHASE1 = ROOT / "supabase" / "migrations" / "20261012120000_phase1_revocations.sql"
PIN = ROOT / "supabase" / "migrations" / "20261011120000_pin_auth_hardening.sql"
OPTIONAL = ROOT / "supabase" / "optional" / "pulse_harden_new_public.sql"
DB = "rusher_pin_roles"
PORT = "55433"


def run(args: list[str], check: bool = True) -> subprocess.CompletedProcess:
    proc = subprocess.run(args, capture_output=True)
    if check and proc.returncode != 0:
        err = (proc.stderr or b"").decode("utf-8", "replace")[-1500:]
        raise RuntimeError(err)
    return proc


def psql(user: str, database: str, sql: str | None = None, path: Path | None = None, check: bool = True):
    args = [PSQL, "-h", "127.0.0.1", "-p", PORT, "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1", "-t", "-A"]
    if path:
        args.extend(["-f", str(path)])
        proc = run(args, check=check)
    else:
        proc = subprocess.run(args, input=sql.encode(), capture_output=True)
        if check and proc.returncode != 0:
            raise RuntimeError((proc.stderr or b"").decode("utf-8", "replace")[-1500:])
    err = (proc.stderr or b"").decode("utf-8", "replace")
    out = (proc.stdout or b"").decode("utf-8", "replace")
    return proc.returncode, out, err


def apply(path: Path) -> dict:
    code, _out, err = psql("postgres", DB, path=path, check=False)
    lines = [
        line.strip()
        for line in err.splitlines()
        if line.strip().startswith("ERROR") or "permission denied" in line.lower() or "must be superuser" in line.lower()
    ]
    return {"ok": code == 0, "errors": lines[:8]}


def main() -> None:
    if DATA.exists():
        shutil.rmtree(DATA)
    run([INITDB, "-D", str(DATA), "-U", "supabase_admin", "--auth=trust", "--encoding=UTF8", "--locale=C"])
    conf = DATA / "postgresql.conf"
    conf.write_text(conf.read_text(encoding="utf-8") + "\nlisten_addresses = '127.0.0.1'\nport = 55433\n", encoding="utf-8")
    run([CTL, "-D", str(DATA), "-l", str(LOG), "start"])
    ready = False
    for _ in range(40):
        probe = subprocess.run(
            [PSQL, "-h", "127.0.0.1", "-p", PORT, "-U", "supabase_admin", "-d", "postgres", "-c", "select 1"],
            capture_output=True,
        )
        if probe.returncode == 0:
            ready = True
            break
        time.sleep(0.25)
    if not ready:
        raise RuntimeError("the local role cluster did not accept connections")
    report = {"port": 55433, "steps": []}
    try:
        addr = psql("supabase_admin", "postgres", "select coalesce(inet_server_addr()::text, '127.0.0.1');")[1].strip()
        if not addr.startswith("127."):
            raise SystemExit(f"refusing {addr}")
        psql(
            "supabase_admin",
            "postgres",
            """
            create role postgres login nosuperuser bypassrls;
            create role anon nologin noinherit;
            create role authenticated nologin noinherit;
            create role service_role nologin noinherit bypassrls;
            create role authenticator noinherit login;
            grant anon, authenticated, service_role to authenticator;
            grant anon, authenticated, service_role to postgres with admin option;
            """,
        )
        psql("supabase_admin", "postgres", "create database rusher_pin_roles owner postgres;")
        who = psql("postgres", DB, "select current_user, rolsuper::text from pg_roles where rolname = current_user;")[1].strip()
        report["during"] = who
        for name, path in (
            ("bootstrap", BOOTSTRAP),
            ("phase1", PHASE1),
            ("pin", PIN),
            ("optionalTrigger", OPTIONAL),
        ):
            report["steps"].append({"name": name, **apply(path)})
        present = psql(
            "postgres",
            DB,
            "select to_regprocedure('public.pulse_account_login(text,text)') is not null;",
        )[1].strip()
        trigger = psql(
            "postgres",
            DB,
            "select exists (select 1 from pg_event_trigger where evtname = 'pulse_harden_new_public_trg');",
        )[1].strip()
        report["pinFunctionPresent"] = present == "t"
        report["optionalTriggerPresent"] = trigger == "t"
    finally:
        run([CTL, "-D", str(DATA), "-m", "fast", "stop"], check=False)
        main_psql = str(BIN / "psql.exe")
        subprocess.run(
            [main_psql, "-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", "postgres", "-c", "drop role if exists supabase_admin;"],
            capture_output=True,
        )
    print(json.dumps(report))


if __name__ == "__main__":
    main()

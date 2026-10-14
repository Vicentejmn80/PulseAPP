"""Apply only the phase-1 migration on a fresh local database and call the old client surface."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[2]
PSQL = os.environ["RUSHER_PSQL"]
BOOTSTRAP = Path(__file__).resolve().parent / "bootstrap.sql"
PHASE1 = ROOT / "supabase" / "migrations" / "20261012120000_phase1_revocations.sql"
DB = "rusher_pin_phase1"
DSN = f"host=127.0.0.1 port=55432 dbname={DB} user=postgres"


def psql(database: str, sql: str | None = None, path: Path | None = None) -> None:
    args = [PSQL, "-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"]
    if path:
        args.extend(["-f", str(path)])
        proc = subprocess.run(args, capture_output=True)
    else:
        proc = subprocess.run(args, input=sql.encode(), capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or b"").decode("utf-8", "replace")[-2000:])


def anon_call(sql: str):
    conn = psycopg.connect(DSN, row_factory=dict_row)
    conn.execute("set role anon")
    conn.commit()
    try:
        row = conn.execute(sql).fetchone()
        conn.commit()
        return True, row
    except Exception as exc:
        conn.rollback()
        return False, type(exc).__name__
    finally:
        conn.close()


def main() -> None:
    psql("postgres", "drop database if exists rusher_pin_phase1 with (force);")
    psql("postgres", "create database rusher_pin_phase1;")
    psql(DB, path=BOOTSTRAP)
    psql(
        DB,
        """
        insert into public.pulse_profiles (id, phone, alias, handle, initials, avatar_color, access_code, alias_normalized, full_name)
        values ('user_phase1', '+580000000777', 'fase1', '@fase1', 'FA', '#18A085', 'ABCDEF', 'fase1', 'Fase Uno');
        insert into public.pulse_sessions (token, user_id)
        values ('sess_phase1', 'user_phase1');
        create or replace function public.pulse_account_register(p_phone text, p_full_name text, p_alias text, p_pin text)
        returns jsonb language sql security definer set search_path to public as $$
          select jsonb_build_object('ok', true, 'code', 'PROFILE_CREATED');
        $$;
        create or replace function public.pulse_account_login(p_phone text, p_pin text)
        returns jsonb language sql security definer set search_path to public as $$
          select jsonb_build_object('ok', true, 'code', 'SESSION_CREATED');
        $$;
        create or replace function public.pulse_load(p_token text)
        returns jsonb language sql security definer set search_path to public as $$
          select jsonb_build_object('ok', true, 'code', 'LOADED');
        $$;
        create or replace function public.pulse_award_plenos(p_day date)
        returns void language sql security definer set search_path to public as $$ select null::void $$;
        create or replace function public.pulse_credit(p_user text, p_source_type text, p_source_id text, p_points integer, p_meta jsonb)
        returns void language sql security definer set search_path to public as $$ select null::void $$;
        create or replace function public.pulse_ranking(p_token text)
        returns jsonb language plpgsql security definer set search_path to public as $$
        begin
          perform public.pulse_award_plenos(current_date);
          return '[]'::jsonb;
        end $$;
        create or replace function public.pulse_otp_provider(p_secret text)
        returns jsonb language sql security definer set search_path to public as $$
          select jsonb_build_object('ok', true);
        $$;
        grant execute on function public.pulse_account_register(text, text, text, text) to anon, authenticated;
        grant execute on function public.pulse_account_login(text, text) to anon, authenticated;
        grant execute on function public.pulse_load(text) to anon, authenticated;
        grant execute on function public.pulse_award_plenos(date) to anon, authenticated;
        grant execute on function public.pulse_credit(text, text, text, integer, jsonb) to anon, authenticated;
        grant execute on function public.pulse_ranking(text) to anon, authenticated;
        grant execute on function public.pulse_otp_provider(text) to anon, authenticated;
        """,
    )
    psql(DB, path=PHASE1)
    psql(DB, "create function public.pulse_phase1_probe() returns int language sql as $$ select 1 $$;")
    checks = {
        "register": anon_call("select public.pulse_account_register('1','2','3','4') as result"),
        "login": anon_call("select public.pulse_account_login('1','2') as result"),
        "load": anon_call("select public.pulse_load('sess_phase1') as result"),
        "ranking": anon_call("select public.pulse_ranking('sess_phase1') as result"),
        "admin": anon_call("select public.pulse_admin_create_match('x') as result"),
        "award": anon_call("select public.pulse_award_plenos(current_date)"),
        "credit": anon_call("select public.pulse_credit('user_phase1','x','y',1,'{}'::jsonb)"),
        "provider": anon_call("select public.pulse_otp_provider('x')"),
        "scenarios": anon_call("select count(*) from public.pulse_sim_scenarios"),
    }
    fresh = anon_call("select public.pulse_phase1_probe()")
    report = {
        "register": checks["register"][0],
        "login": checks["login"][0],
        "load": checks["load"][0],
        "rankingCallsMutator": checks["ranking"][0],
        "adminStillCallable": checks["admin"][0],
        "awardDenied": not checks["award"][0],
        "creditDenied": not checks["credit"][0],
        "providerDenied": not checks["provider"][0],
        "scenariosDenied": not checks["scenarios"][0],
        "newFunctionStillExecutable": fresh[0],
    }
    print(json.dumps(report))
    needed = [
        report["register"],
        report["login"],
        report["load"],
        report["rankingCallsMutator"],
        report["adminStillCallable"],
        report["awardDenied"],
        report["creditDenied"],
        report["providerDenied"],
        report["scenariosDenied"],
    ]
    if not all(needed):
        raise SystemExit(1)


if __name__ == "__main__":
    main()

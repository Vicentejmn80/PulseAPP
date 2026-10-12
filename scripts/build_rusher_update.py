# Builds the Iniciado bank, the LVBP schedule diff, and the reviewable migration.
# Reads the local PDFs. Does not connect to Supabase.
from __future__ import annotations

import hashlib
import json
import re
import shutil
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = Path(r"c:\Users\Vicente\Downloads")
TRIVIA_FILES = [
    DOWNLOADS / "RUSHER_Biblioteca_Trivia_Lote_01_90 - Principiante.pdf",
    DOWNLOADS / "RUSHER_Biblioteca_Trivia_Lote_03_90 - Principiante.pdf",
    DOWNLOADS / "RUSHER_Biblioteca_Trivia_Lote_03_90 - Principiante (1).pdf",
]
SCHEDULE_PDF = DOWNLOADS / "RUSHER_Cronograma_LVBP_80_Juegos_12Oct_05Nov_2026.pdf"
OCTOBER_SQL = ROOT / "supabase" / "migrations" / "20260928160000_tobo_october.sql"
TRIVIA_SQL = ROOT / "supabase" / "migrations" / "20261008180000_trivia_reactivation.sql"
BANNER_SRC = Path(
    r"C:\Users\Vicente\.cursor\projects\c-Users-Vicente-Documents-PulseAPP-main\assets"
    r"\c__Users_Vicente_AppData_Roaming_Cursor_User_workspaceStorage_361c5fe77bc3f4714ba8515495c405aa_images_flyer_beisbol_rush-a8aaaae9-3fee-4ed0-837d-0880c26796c0.png"
)
OUT_TRIVIA = ROOT / "src" / "data" / "triviaIniciado.json"
OUT_SCHEDULE = ROOT / "src" / "data" / "lvbpSchedule.json"
OUT_SQL = ROOT / "supabase" / "migrations" / "20261012140000_rusher_trivia_points_schedule.sql"
OUT_BANNER = ROOT / "public" / "rusher-locales-afiliados.png"

TEAMS = {
    "tiburones": ("Tiburones de La Guaira", "tib"),
    "navegantes": ("Navegantes del Magallanes", "mag"),
    "tigres": ("Tigres de Aragua", "tig"),
    "caribes": ("Caribes de Anzoátegui", "car"),
    "leones": ("Leones del Caracas", "leo"),
    "águilas": ("Águilas del Zulia", "agu"),
    "aguilas": ("Águilas del Zulia", "agu"),
    "bravos": ("Bravos de Margarita", "bra"),
    "cardenales": ("Cardenales de Lara", "crd"),
}
MONTHS = {"oct": 10, "octubre": 10, "nov": 11, "noviembre": 11}


def fold(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace("“", '"').replace("”", '"').replace("’", "'")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def column_of(x: float) -> str | None:
    if x < 78:
        return "code"
    if x < 148:
        return "tema"
    if x < 308:
        return "question"
    if x < 383:
        return "a"
    if x < 458:
        return "b"
    if x < 533:
        return "c"
    if x < 612:
        return "d"
    if x < 655:
        return "letter"
    return "answer"


def parse_trivia(path: Path) -> list[dict]:
    doc = fitz.open(path)
    rows: list[dict] = []
    for page in doc:
        page_text = page.get_text()
        if "Respuesta correcta" not in page_text:
            continue
        words = page.get_text("words")
        codes = [w for w in words if re.fullmatch(r"P\d+", w[4]) and w[0] < 78]
        codes.sort(key=lambda w: w[1])
        for index, code in enumerate(codes):
            y0 = code[1] - 2
            y1 = codes[index + 1][1] - 2 if index + 1 < len(codes) else page.rect.height
            buckets = {key: [] for key in ("code", "tema", "question", "a", "b", "c", "d", "letter", "answer")}
            for word in words:
                if word[1] < y0 or word[1] >= y1:
                    continue
                bucket = column_of(word[0])
                if bucket:
                    buckets[bucket].append(word)
            def joined(key: str) -> str:
                ordered = sorted(buckets[key], key=lambda w: (round(w[1], 1), w[0]))
                return re.sub(r"\s+", " ", " ".join(w[4] for w in ordered)).strip()
            right = [
                word for word in words
                if y0 <= word[1] < y1 and word[0] >= 610
            ]
            letters = [
                word for word in right
                if re.fullmatch(r"[A-Da-d]", word[4]) and word[0] < 645
            ]
            letter_word = min(letters, key=lambda word: abs(word[0] - 629)) if letters else None
            if letter_word:
                answer_words = [
                    word for word in right
                    if word[0] > letter_word[0] + 6
                ]
                answer_words.sort(key=lambda word: (round(word[1], 1), word[0]))
                answer_text = re.sub(r"\s+", " ", " ".join(word[4] for word in answer_words)).strip()
                letter = letter_word[4].upper()
            else:
                answer_text = ""
                letter = ""
            rows.append({
                "source": path.name,
                "code": joined("code"),
                "category": joined("tema"),
                "prompt": joined("question"),
                "options": {
                    "a": joined("a"),
                    "b": joined("b"),
                    "c": joined("c"),
                    "d": joined("d"),
                },
                "letter": letter,
                "answerText": answer_text,
            })
    doc.close()
    return rows


def completeness(row: dict) -> int:
    return len(row["prompt"]) + sum(len(v) for v in row["options"].values()) + len(row["answerText"])


def review_reason(row: dict) -> str | None:
    if not re.fullmatch(r"P\d+", row["code"] or ""):
        return "código ausente o inválido"
    if len(row["prompt"]) < 12 or "?" not in row["prompt"] and "¿" not in row["prompt"]:
        return "enunciado incompleto"
    missing = [key for key, value in row["options"].items() if not value]
    if missing:
        return "opciones incompletas: " + ",".join(missing)
    if row["letter"] not in {"A", "B", "C", "D"}:
        return "letra correcta ausente"
    chosen = row["options"][row["letter"].lower()]
    if fold(chosen) != fold(row["answerText"]):
        return "la respuesta correcta no coincide con la opción " + row["letter"]
    labels = [fold(v) for v in row["options"].values()]
    if len(set(labels)) < 4:
        return "opciones repetidas"
    return None


def dedupe(rows: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    kept: list[dict] = []
    exact_removed: list[dict] = []
    semantic_removed: list[dict] = []
    flagged: list[dict] = []
    for row in rows:
        reason = review_reason(row)
        if reason:
            flagged.append({**row, "reason": reason})
            continue
        prompt_key = fold(row["prompt"])
        exact = next((item for item in kept if fold(item["prompt"]) == prompt_key and fold(item["options"]["a"]) == fold(row["options"]["a"])), None)
        if exact:
            exact_removed.append(row)
            if completeness(row) > completeness(exact):
                kept.remove(exact)
                kept.append(row)
            continue
        semantic = None
        ratio = 0.0
        for item in kept:
            score = SequenceMatcher(None, prompt_key, fold(item["prompt"])).ratio()
            if score > ratio:
                ratio = score
                semantic = item
        if semantic and ratio >= 0.90 and fold(semantic["answerText"]) == fold(row["answerText"]):
            semantic_removed.append({**row, "similarTo": semantic["code"], "ratio": round(ratio, 3)})
            if completeness(row) > completeness(semantic):
                kept.remove(semantic)
                kept.append(row)
            continue
        if semantic and ratio >= 0.90 and fold(semantic["answerText"]) != fold(row["answerText"]):
            flagged.append({**row, "reason": f"parecida a {semantic['code']} ({ratio:.2f}) con otra respuesta; se conservan ambas"})
        kept.append(row)
    return kept, exact_removed, semantic_removed, flagged


def to_question(row: dict, used_ids: set[str]) -> dict:
    base = "trv_ini_" + row["code"].lower()
    qid = base
    if qid in used_ids:
        source = "l03" if "Lote_03" in row["source"] else "l01"
        qid = f"{base}_{source}"
    used_ids.add(qid)
    options = [{"id": key, "label": row["options"][key]} for key in ("a", "b", "c", "d")]
    return {
        "id": qid,
        "code": row["code"],
        "source": row["source"],
        "prompt": row["prompt"],
        "options": options,
        "correctOption": row["letter"].lower(),
        "category": row["category"] or "general",
        "difficulty": "easy",
        "points": 2,
    }


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def question_sql(questions: list[dict]) -> str:
    lines = [
        "-- Banco Iniciado importado de los PDF Principiante. No borra otros niveles.",
        "insert into public.pulse_trivia_questions",
        "  (id, prompt, options, correct_option, explanation, category, difficulty, status, publish_date, points, created_by)",
        "values",
    ]
    values = []
    for question in questions:
        options = json.dumps(question["options"], ensure_ascii=False, separators=(",", ":"))
        values.append(
            "  ("
            + ", ".join([
                sql_literal(question["id"]),
                sql_literal(question["prompt"]),
                sql_literal(options) + "::jsonb",
                sql_literal(question["correctOption"]),
                "null",
                sql_literal(question["category"]),
                "'easy'",
                "'active'",
                "null",
                "2",
                "null",
            ])
            + ")"
        )
    lines.append(",\n".join(values))
    lines.append(
        "on conflict (id) do update set\n"
        "  prompt = excluded.prompt,\n"
        "  options = excluded.options,\n"
        "  correct_option = excluded.correct_option,\n"
        "  category = excluded.category,\n"
        "  difficulty = excluded.difficulty,\n"
        "  status = 'active',\n"
        "  points = 2;"
    )
    return "\n".join(lines)


def parse_schedule_text() -> list[dict]:
    doc = fitz.open(SCHEDULE_PDF)
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    games = []
    current_date = None
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    lines = [line for line in lines if line]
    index = 0
    date_re = re.compile(r"^(?:Lun|Mar|Mié|Jue|Vie|Sáb|Dom)\s+(\d{1,2})\s+(oct|nov)$", re.I)
    while index < len(lines):
        match = date_re.match(lines[index])
        if match:
            day = int(match.group(1))
            month = MONTHS[match.group(2).lower()]
            current_date = f"2026-{month:02d}-{day:02d}"
            if index + 4 >= len(lines):
                break
            away, home, hour, city = lines[index + 1:index + 5]
            games.append({
                "date": current_date,
                "awayShort": away,
                "homeShort": home,
                "hourLabel": hour,
                "city": city,
            })
            index += 5
            continue
        index += 1
    return games


def resolve_team(short: str) -> tuple[str, str] | None:
    return TEAMS.get(fold(short))


def parse_existing() -> list[dict]:
    text = OCTOBER_SQL.read_text(encoding="utf-8")
    rows = []
    for match in re.finditer(
        r"\('(lvbp_[^']+)', '([^']+)', '([^']+)', timestamptz '([^']+)'\)",
        text,
    ):
        rows.append({
            "id": match.group(1),
            "away": match.group(2),
            "home": match.group(3),
            "startsAt": match.group(4),
        })
    return rows


def clock_from_label(label: str) -> str | None:
    cleaned = label.lower().replace(".", "")
    if "no indicada" in cleaned:
        return None
    match = re.search(r"(\d{1,2}):(\d{2})\s*([ap])", cleaned)
    if not match:
        return None
    hour = int(match.group(1))
    minute = match.group(2)
    suffix = match.group(3)
    if suffix == "p" and hour < 12:
        hour += 12
    if suffix == "a" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute}"


def schedule_plan(games: list[dict], existing: list[dict]) -> dict:
    by_id = {row["id"]: row for row in existing}
    used_existing: set[str] = set()
    planned = []
    duplicates = []
    seen_keys = set()
    for game in games:
        away = resolve_team(game["awayShort"])
        home = resolve_team(game["homeShort"])
        clock = clock_from_label(game["hourLabel"])
        item = {
            **game,
            "awayTeam": away[0] if away else None,
            "homeTeam": home[0] if home else None,
            "awayCode": away[1] if away else None,
            "homeCode": home[1] if home else None,
            "clock": clock,
            "action": None,
            "id": None,
            "note": None,
        }
        if not away or not home:
            item["action"] = "unmapped"
            item["note"] = "equipo sin identificador existente"
            planned.append(item)
            continue
        key = (game["date"], away[0], home[0])
        if key in seen_keys:
            item["action"] = "duplicate"
            duplicates.append(item)
            planned.append(item)
            continue
        seen_keys.add(key)
        same = [
            row for row in existing
            if row["startsAt"][:10] == game["date"] and row["away"] == away[0] and row["home"] == home[0]
        ]
        swapped = [
            row for row in existing
            if row["startsAt"][:10] == game["date"] and row["away"] == home[0] and row["home"] == away[0]
        ]
        if same:
            row = same[0]
            used_existing.add(row["id"])
            item["id"] = row["id"]
            if clock is None:
                item["action"] = "kept_unconfirmed_time"
                item["note"] = "el cronograma no publica hora; se conserva " + row["startsAt"]
            elif row["startsAt"][11:16] == clock:
                item["action"] = "unchanged"
            else:
                item["action"] = "update_time"
                item["startsAt"] = f"{game['date']} {clock}:00-04"
                item["previousStartsAt"] = row["startsAt"]
        elif swapped:
            row = swapped[0]
            used_existing.add(row["id"])
            item["id"] = row["id"]
            item["action"] = "update_home_away"
            item["startsAt"] = f"{game['date']} {clock}:00-04" if clock else row["startsAt"]
            item["previous"] = {"away": row["away"], "home": row["home"], "startsAt": row["startsAt"]}
            item["note"] = "mismo día y mismos equipos, local y visitante corregidos; las predicciones siguen en este id"
        elif clock is None:
            item["action"] = "omitted_no_time"
            item["note"] = "sin hora publicada y sin partido previo; no se inventa horario"
        else:
            item["action"] = "insert"
            item["id"] = f"lvbp_{game['date'].replace('-', '')}_{clock.replace(':', '')}_{away[1]}_{home[1]}"
            item["startsAt"] = f"{game['date']} {clock}:00-04"
            if item["id"] in by_id:
                item["action"] = "duplicate_id"
        planned.append(item)
    leftover = [row for row in existing if row["id"] not in used_existing]
    return {"games": planned, "duplicates": duplicates, "leftoverExisting": leftover}


def schedule_sql(plan: dict) -> str:
    updates = []
    inserts = []
    for game in plan["games"]:
        if game["action"] == "update_time":
            updates.append(
                "update public.pulse_matches set starts_at = "
                + sql_literal(game["startsAt"])
                + "::timestamptz, updated_at = now() where id = "
                + sql_literal(game["id"])
                + " and status = 'scheduled';"
            )
        elif game["action"] == "update_home_away":
            updates.append(
                "update public.pulse_matches set away_team = "
                + sql_literal(game["awayTeam"])
                + ", home_team = "
                + sql_literal(game["homeTeam"])
                + ", starts_at = "
                + sql_literal(game["startsAt"])
                + "::timestamptz, updated_at = now() where id = "
                + sql_literal(game["id"])
                + " and status = 'scheduled';"
            )
        elif game["action"] == "insert":
            inserts.append(
                "  ("
                + ", ".join([
                    sql_literal(game["id"]),
                    sql_literal(game["awayTeam"]),
                    sql_literal(game["homeTeam"]),
                    sql_literal(game["startsAt"]) + "::timestamptz",
                ])
                + ")"
            )
    parts = ["-- Cronograma LVBP 12 oct–5 nov 2026. No borra partidos ni predicciones."]
    parts.extend(updates)
    if inserts:
        parts.append("insert into public.pulse_matches (id, away_team, home_team, starts_at)")
        parts.append("values")
        parts.append(",\n".join(inserts))
        parts.append(
            "on conflict (id) do update set\n"
            "  away_team = excluded.away_team,\n"
            "  home_team = excluded.home_team,\n"
            "  starts_at = excluded.starts_at,\n"
            "  updated_at = now()\n"
            "where public.pulse_matches.status = 'scheduled';"
        )
    return "\n".join(parts)


def patched_functions() -> str:
    source = TRIVIA_SQL.read_text(encoding="utf-8")
    start = source.index("create or replace function public.pulse_trivia_start")
    end = source.index("drop function if exists public.pulse_trivia_answer")
    body = source[start:end]
    old_pick = """    select coalesce(jsonb_agg(id), '[]'::jsonb) into picked
    from (
      select question.id
      from public.pulse_trivia_questions question
      where question.status = 'active' and question.difficulty = diff
      order by md5(question.id || new_id)
      limit 4
    ) chosen;"""
    new_pick = """    if diff = 'easy' then
      select coalesce(jsonb_agg(id order by ord), '[]'::jsonb) into picked
      from (
        select chosen.id, row_number() over () as ord
        from (
          select question.id
          from public.pulse_trivia_questions question
          left join lateral (
            select max(answer.answered_at) as last_seen
            from public.pulse_trivia_answers answer
            where answer.user_id = uid and answer.question_id = question.id
          ) seen on true
          where question.status = 'active' and question.difficulty = 'easy'
          order by seen.last_seen asc nulls first,
                   md5(question.id || ':' || uid || ':' || ((now() at time zone 'America/Caracas')::date)::text)
          limit 4
        ) chosen
      ) ordered;
    else
      select coalesce(jsonb_agg(id), '[]'::jsonb) into picked
      from (
        select question.id
        from public.pulse_trivia_questions question
        where question.status = 'active' and question.difficulty = diff
        order by md5(question.id || new_id)
        limit 4
      ) chosen;
    end if;"""
    if old_pick not in body:
        raise SystemExit("pick block not found")
    body = body.replace(old_pick, new_pick, 1)
    old_points = "'points', q.points,"
    new_points = """'points', case q.difficulty
      when 'easy' then 2
      when 'medium' then 4
      when 'hard' then 6
      else q.points
    end,"""
    if old_points not in body:
        raise SystemExit("points field not found")
    body = body.replace(old_points, new_points, 1)
    old_award = "  awarded := case when is_correct then question.points else 0 end;"
    new_award = """  awarded := case
    when not is_correct then 0
    when sess.difficulty = 'easy' then 2
    when sess.difficulty = 'medium' then 4
    when sess.difficulty = 'hard' then 6
    else 0
  end;"""
    if old_award not in body:
        raise SystemExit("award line not found")
    body = body.replace(old_award, new_award, 1)
    return body


def main() -> None:
    file_hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in TRIVIA_FILES}
    received_rows = []
    per_file = {}
    for path in TRIVIA_FILES:
        parsed = parse_trivia(path)
        per_file[path.name] = len(parsed)
        received_rows.extend(parsed)
    kept, exact_removed, semantic_removed, flagged = dedupe(received_rows)
    used_ids: set[str] = set()
    questions = [to_question(row, used_ids) for row in kept]
    review = [
        {
            "source": row["source"],
            "code": row.get("code"),
            "prompt": row.get("prompt"),
            "reason": row["reason"],
        }
        for row in flagged
    ]
    trivia_payload = {
        "receivedRows": len(received_rows),
        "perFile": per_file,
        "fileSha256": file_hashes,
        "incorporated": len(questions),
        "exactDuplicatesRemoved": len(exact_removed),
        "semanticDuplicatesRemoved": len(semantic_removed),
        "needsReview": len(review),
        "questions": questions,
        "review": review,
        "semanticRemoved": [
            {"source": row["source"], "code": row["code"], "prompt": row["prompt"], "similarTo": row["similarTo"], "ratio": row["ratio"]}
            for row in semantic_removed
        ],
    }
    OUT_TRIVIA.parent.mkdir(parents=True, exist_ok=True)
    OUT_TRIVIA.write_text(json.dumps(trivia_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    games = parse_schedule_text()
    existing = parse_existing()
    plan = schedule_plan(games, existing)
    counts: dict[str, int] = {}
    for game in plan["games"]:
        counts[game["action"]] = counts.get(game["action"], 0) + 1
    schedule_payload = {
        "parsed": len(games),
        "existingSeed": len(existing),
        "counts": counts,
        "leftoverExisting": plan["leftoverExisting"],
        "games": plan["games"],
    }
    OUT_SCHEDULE.write_text(json.dumps(schedule_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    sql = "\n".join([
        "-- Rusher: puntos 2/4/6, banco Iniciado y cronograma LVBP 12 oct–5 nov 2026.",
        "-- Revisable. No aplicar con db push desde este cambio; no borra predicciones ni historial.",
        "",
        question_sql(questions),
        "",
        "update public.pulse_trivia_questions",
        "set status = 'disabled'",
        "where difficulty = 'easy'",
        "  and status = 'active'",
        "  and id not like 'trv_ini_%';",
        "",
        "update public.pulse_trivia_questions",
        "set points = case difficulty",
        "  when 'easy' then 2",
        "  when 'medium' then 4",
        "  when 'hard' then 6",
        "  else points",
        "end",
        "where difficulty in ('easy', 'medium', 'hard');",
        "",
        patched_functions().rstrip() + ";",
        "",
        "grant execute on function public.pulse_trivia_start(text, text) to anon, authenticated;",
        "grant execute on function public.pulse_trivia_answer(text, text, text, text) to anon, authenticated;",
        "",
        schedule_sql(plan),
        "",
    ])
    OUT_SQL.write_text(sql, encoding="utf-8")
    if BANNER_SRC.exists():
        shutil.copyfile(BANNER_SRC, OUT_BANNER)
    print(json.dumps({
        "trivia": {k: trivia_payload[k] for k in ("receivedRows", "perFile", "incorporated", "exactDuplicatesRemoved", "semanticDuplicatesRemoved", "needsReview")},
        "sameLote03": file_hashes[TRIVIA_FILES[1].name] == file_hashes[TRIVIA_FILES[2].name],
        "schedule": {"parsed": len(games), "counts": counts, "leftover": len(plan["leftoverExisting"])},
        "banner": OUT_BANNER.exists(),
        "sqlBytes": OUT_SQL.stat().st_size,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

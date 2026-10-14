from pathlib import Path

text = Path("supabase/migrations/20261013050000_trivia_avanzado_bank.sql").read_text(encoding="utf-8")
lines = [ln for ln in text.splitlines() if ln.startswith("  ('trv_adv_")]
header = """insert into public.pulse_trivia_questions
  (id, code, prompt, options, correct_option, explanation, category, difficulty, status, publish_date, points, created_by, review_note)
values
"""
assert len(lines) == 90, len(lines)
for i, start in enumerate(range(0, len(lines), 30)):
    chunk = lines[start : start + 30]
    body = []
    for j, ln in enumerate(chunk):
        ln = ln.rstrip()
        if ln.endswith(","):
            ln = ln[:-1]
        if j < len(chunk) - 1:
            ln += ","
        body.append(ln)
    sql = header + "\n".join(body) + "\non conflict (code) where code is not null do nothing;\n"
    if i == 2:
        sql += """
update public.pulse_trivia_questions
set status = 'disabled',
    review_note = 'fuera del banco Avanzado oficial'
where difficulty = 'hard'
  and status = 'active'
  and not starts_with(id, 'trv_adv_a');
"""
    out = Path(f"scripts/.adv-bank-{i}.sql")
    out.write_text(sql, encoding="utf-8")
    print(i, out.stat().st_size)

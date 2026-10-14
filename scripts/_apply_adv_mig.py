from pathlib import Path
sql = Path("supabase/migrations/20261013050000_trivia_avanzado_bank.sql").read_text(encoding="utf-8")
# strip verification comments at bottom for apply test
lines = []
for ln in sql.splitlines():
    if ln.startswith("-- Verificación"):
        break
    lines.append(ln)
body = "\n".join(lines).strip() + "\n"
Path("scripts/.adv-mig-test.sql").write_text(body, encoding="utf-8")
print(len(body))

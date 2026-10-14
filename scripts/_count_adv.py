from pathlib import Path
text = Path("supabase/migrations/20261013050000_trivia_avanzado_bank.sql").read_text(encoding="utf-8")
lines = [ln for ln in text.splitlines() if ln.startswith("  ('trv_adv_")]
print("rows", len(lines))

import fs from "node:fs";
import { BANK } from "../src/lib/challenges/bank.mjs";

const rows = BANK.map((template) => ({
  code: template.code,
  title: template.title,
  description: template.description,
  category: template.category,
  difficulty: template.difficulty,
  points: template.points,
  answerType: template.answerType,
  options: template.options,
  rule: template.scoringRule,
  priority: template.priority,
  cooldown: template.cooldownDays,
  tags: template.tags,
}));

const size = 25;
for (let index = 0; index < rows.length; index += size) {
  const body = JSON.stringify(rows.slice(index, index + size));
  const sql = `insert into public.pulse_challenge_templates (id, code, title, description, category, difficulty, points, answer_type, options, scoring_rule, required_facts, active, priority, cooldown_days, tags)
select 'cht_' || lower(code), code, title, description, category, difficulty, points, "answerType", options, rule, array['home_score','away_score']::text[], true, priority, cooldown, array(select jsonb_array_elements_text(tags))
from jsonb_to_recordset($json$${body}$json$::jsonb) as t(code text, title text, description text, category text, difficulty text, points int, "answerType" text, options jsonb, rule jsonb, priority int, cooldown int, tags jsonb)
on conflict (code) do nothing;`;
  const name = `scripts/.chsql/j${String(index / size).padStart(2, "0")}.sql`;
  fs.writeFileSync(name, sql);
  console.log(name, sql.length);
}

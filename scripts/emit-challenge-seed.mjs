import { appendFileSync } from "node:fs";
import { BANK } from "../src/lib/challenges/bank.mjs";

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;

const rows = BANK.map((template) => {
  const id = `cht_${template.code.toLowerCase()}`;
  const facts = `array[${template.requiredFacts.map(q).join(",")}]::text[]`;
  const tags = `array[${template.tags.map(q).join(",")}]::text[]`;
  return `(${[
    q(id),
    q(template.code),
    q(template.title),
    q(template.description),
    q(template.category),
    q(template.difficulty),
    template.points,
    q(template.answerType),
    `${q(JSON.stringify(template.options))}::jsonb`,
    `${q(JSON.stringify(template.scoringRule))}::jsonb`,
    facts,
    template.active ? "true" : "false",
    template.priority,
    template.cooldownDays,
    tags,
  ].join(", ")})`;
});

const sql = `
insert into public.pulse_challenge_templates (
  id, code, title, description, category, difficulty, points, answer_type, options, scoring_rule, required_facts, active, priority, cooldown_days, tags
) values
${rows.join(",\n")}
on conflict (code) do nothing;

do $$
declare game_id text;
begin
  if exists (
    select 1 from public.pulse_challenge_templates
    where active and (scoring_rule is null or scoring_rule->>'op' is null)
  ) then
    raise exception 'Hay una plantilla activa sin scoring_rule';
  end if;
  for game_id in
    select id from public.pulse_matches
    where status in ('scheduled', 'postponed')
  loop
    perform public.pulse_assign_game_challenges(game_id);
  end loop;
end $$;
`;

appendFileSync(new URL("../supabase/migrations/20261005040000_match_challenges.sql", import.meta.url), sql);
console.log("rows", rows.length);

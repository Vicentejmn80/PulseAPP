import { readFileSync, writeFileSync } from "node:fs";

const scenarios = [
  ["cerrado", 1, 3],
  ["remontada", 0, 3],
  ["ultimo", 0, 3],
];

for (const [id, from, to] of scenarios) {
  const lines = [];
  for (let i = from; i <= to; i += 1) {
    const b64 = readFileSync(`scripts/_b64_${id}_${i}.txt`, "utf8").trim();
    lines.push(`  execute convert_from(decode('${b64}', 'base64'), 'utf8');`);
  }
  const sql = `do $do$
begin
${lines.join("\n")}
end
$do$;
select length(body) as n, left(body, 12) as head, right(body, 2) as tail
from public.pulse_sim_seed_buf where id = '${id}';
`;
  writeFileSync(`scripts/_apply_${id}.sql`, sql);
  console.log(id, sql.length);
}

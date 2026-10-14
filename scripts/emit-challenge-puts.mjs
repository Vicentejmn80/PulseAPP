import fs from "node:fs";
import { BANK } from "../src/lib/challenges/bank.mjs";

const yes = `[{"id":"si","label":"Sí"},{"id":"no","label":"No"}]`;
const lines = BANK.map((template) => {
  const options = template.answerType === "boolean" ? yes : JSON.stringify(template.options);
  const tags = `array[${template.tags.map((tag) => `'${tag}'`).join(",")}]`;
  const title = template.title.replaceAll("'", "''");
  return `select public.pulse_put_challenge('${template.code}', '${title}', '${template.category}', '${template.difficulty}', ${template.points}, '${template.answerType}', '${options}'::jsonb, '${JSON.stringify(template.scoringRule)}'::jsonb, ${tags}, ${template.priority});`;
});

const size = 12;
for (let index = 0; index < lines.length; index += size) {
  const file = `scripts/.chsql/put-${String(index / size).padStart(2, "0")}.sql`;
  fs.writeFileSync(file, lines.slice(index, index + size).join("\n"));
  console.log(file, lines.slice(index, index + size).length);
}

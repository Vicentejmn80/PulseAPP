import fs from "node:fs";

for (const name of ["j00", "j01", "j02", "j03", "j04"]) {
  const sql = fs.readFileSync(`scripts/.chsql/${name}.sql`, "utf8");
  const start = sql.indexOf("$json$[") + "$json$".length;
  const end = sql.lastIndexOf("]$json$");
  const rows = JSON.parse(sql.slice(start, end + 1));
  const groups = [];
  for (let index = 0; index < rows.length; index += 4) groups.push(rows.slice(index, index + 4));
  groups.forEach((group, index) => {
    const header = sql.slice(0, start);
    const footer = sql.slice(end + 1);
    const body = `${header}${JSON.stringify(group)}${footer}`;
    fs.writeFileSync(`scripts/.chsql/${name}-${index}.sql`, body);
  });
  console.log(name, groups.length);
}

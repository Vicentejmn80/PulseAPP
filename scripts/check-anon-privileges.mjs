import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const psql = process.env.RUSHER_PSQL;
const db = process.env.RUSHER_TEST_DB || "rusher_pin_local";
if (!psql) throw new Error("Falta RUSHER_PSQL");
if (!["rusher_pin_local", "rusher_pin_schema", "rusher_pin_phase1", "rusher_pin_real"].includes(db)) {
  throw new Error("base rechazada");
}

const allow = JSON.parse(readFileSync(new URL("./anon-allowlist.json", import.meta.url), "utf8"));
const allowed = new Set(allow.functions.map((entry) => entry.name));

function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      psql,
      ["-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.slice(-500)));
    });
    child.stdin.write(sql);
    child.stdin.end();
  });
}

const sql = readFileSync(new URL("./check-anon-privileges.sql", import.meta.url), "utf8");
const raw = await query(sql);
const rows = raw ? raw.split(/\r?\n/).filter(Boolean).map((line) => {
  const [kind, name] = line.split("|");
  return { kind, name };
}) : [];
const extraFunctions = rows.filter((row) => row.kind === "function" && !allowed.has(row.name));
const tableGrants = rows.filter((row) => row.kind === "table-grant");
const noRls = rows.filter((row) => row.kind === "table-no-rls");
const report = {
  db,
  functions: rows.filter((row) => row.kind === "function").length,
  extraFunctions: extraFunctions.map((row) => row.name),
  tableGrants: tableGrants.map((row) => row.name),
  tablesWithoutRls: noRls.map((row) => row.name),
};
console.log(JSON.stringify(report));
if (extraFunctions.length || tableGrants.length || noRls.length) process.exit(1);

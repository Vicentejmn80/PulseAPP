import { readFileSync } from "node:fs";

const COLUMNS = [
  "Código",
  "Nivel",
  "Tema",
  "Pregunta",
  "A",
  "B",
  "C",
  "D",
  "Correcta (letra)",
  "Respuesta correcta (texto)",
  "Fuente",
  "Estado de verificación",
  "Fecha de verificación",
];

const LEVELS = new Set(["Iniciado", "Intermedio", "Avanzado", "easy", "medium", "hard"]);

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

export function importTriviaBank(csvText) {
  const table = parseCsv(csvText.replace(/^\uFEFF/, ""));
  const header = table[0]?.map((value) => value.trim()) ?? [];
  const missing = COLUMNS.filter((column) => !header.includes(column));
  const invalid = [];
  const accepted = [];
  const seenCodes = new Set();
  const seenPrompts = new Set();
  if (missing.length) {
    return { accepted, invalid: [{ row: 1, reasons: [`Faltan columnas: ${missing.join(", ")}`] }] };
  }
  const index = Object.fromEntries(header.map((column, position) => [column, position]));

  table.slice(1).forEach((cells, offset) => {
    const rowNumber = offset + 2;
    const value = (column) => (cells[index[column]] ?? "").trim();
    const reasons = [];
    const code = value("Código");
    const level = value("Nivel");
    const prompt = value("Pregunta");
    const options = { A: value("A"), B: value("B"), C: value("C"), D: value("D") };
    const letter = value("Correcta (letra)").toUpperCase();
    const answerText = value("Respuesta correcta (texto)");
    if (!code) reasons.push("sin código");
    if (!LEVELS.has(level)) reasons.push("nivel inválido");
    if (!prompt) reasons.push("pregunta vacía");
    for (const key of ["A", "B", "C", "D"]) {
      if (!options[key]) reasons.push(`opción ${key} vacía`);
    }
    const normalizedOptions = Object.values(options).map(normalize);
    if (new Set(normalizedOptions).size !== 4) reasons.push("opciones repetidas");
    if (!["A", "B", "C", "D"].includes(letter)) reasons.push("la correcta debe ser A, B, C o D");
    else if (normalize(options[letter]) !== normalize(answerText)) reasons.push("la letra no coincide con el texto de la respuesta");
    const promptKey = normalize(prompt);
    if (code && seenCodes.has(code.toUpperCase())) reasons.push("código duplicado");
    if (promptKey && seenPrompts.has(promptKey)) reasons.push("pregunta duplicada");
    if (code) seenCodes.add(code.toUpperCase());
    if (promptKey) seenPrompts.add(promptKey);
    if (reasons.length) {
      invalid.push({ row: rowNumber, code, reasons });
      return;
    }
    accepted.push({
      code,
      level,
      topic: value("Tema"),
      prompt,
      options,
      correct: letter,
      answerText,
      source: value("Fuente"),
      verification: value("Estado de verificación"),
      verifiedOn: value("Fecha de verificación"),
    });
  });

  return { accepted, invalid };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: node scripts/import-trivia-bank.mjs archivo.csv");
    process.exit(1);
  }
  const result = importTriviaBank(readFileSync(file, "utf8"));
  console.log(JSON.stringify({ accepted: result.accepted.length, invalid: result.invalid }, null, 2));
  if (result.invalid.length) process.exitCode = 2;
}

if (process.argv[1] && process.argv[1].endsWith("import-trivia-bank.mjs")) main();

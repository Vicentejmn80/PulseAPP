import { describe, expect, it } from "vitest";
import { importTriviaBank } from "./import-trivia-bank.mjs";

const header = "Código,Nivel,Tema,Pregunta,A,B,C,D,Correcta (letra),Respuesta correcta (texto),Fuente,Estado de verificación,Fecha de verificación";

describe("importador de trivias", () => {
  it("acepta una fila válida y rechaza las inválidas", () => {
    const csv = [
      header,
      "P900,Intermedio,Estadios,¿Dónde juegan los Leones?,Caracas,Valencia,Maracaibo,Barquisimeto,A,Caracas,banco,pendiente,",
      "P901,Intermedio,Estadios,¿Dónde juegan los Leones?,Caracas,Valencia,Maracaibo,Barquisimeto,A,Caracas,banco,pendiente,",
      "P902,Experto,Tema,Pregunta suelta,Uno,Dos,Tres,Cuatro,B,Dos,banco,pendiente,",
      "P903,Avanzado,Tema,¿Cuál falta?,Solo una,,, ,A,Solo una,banco,pendiente,",
      "P904,Avanzado,Tema,¿Letra distinta?,Rojo,Azul,Verde,Negro,C,Azul,banco,pendiente,",
      "P904,Iniciado,Tema,Otra pregunta,Rojo,Azul,Verde,Negro,A,Rojo,banco,pendiente,",
    ].join("\n");
    const result = importTriviaBank(csv);
    expect(result.accepted.map((row) => row.code)).toEqual(["P900"]);
    expect(result.invalid.map((row) => row.row)).toEqual([3, 4, 5, 6, 7]);
    expect(result.invalid[0].reasons).toContain("pregunta duplicada");
    expect(result.invalid[1].reasons).toContain("nivel inválido");
    expect(result.invalid[2].reasons.join(" ")).toContain("vacía");
    expect(result.invalid[3].reasons).toContain("la letra no coincide con el texto de la respuesta");
    expect(result.invalid[4].reasons).toContain("código duplicado");
  });
});

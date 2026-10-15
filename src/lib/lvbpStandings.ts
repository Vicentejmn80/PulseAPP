export interface StandingMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  startsAt?: string;
  simulation?: boolean;
  demo?: boolean;
}

export interface StandingRow {
  team: string;
  played: number;
  wins: number;
  losses: number;
  /** Victorias / partidos. Null si todavía no jugó. */
  winPct: number | null;
  /** Diferencia de juegos frente al referente de mejor porcentaje. No desempata el puesto. */
  gamesBehind: number | null;
  /** Racha reciente, por ejemplo G2 o P1. Sale del orden de los finales. */
  streak: string;
  rank: number;
}

export interface StandingsResult {
  rows: StandingRow[];
  excludedTies: number;
  countedGames: number;
  latestCountedStart: string | null;
}

interface Accumulator {
  team: string;
  wins: number;
  losses: number;
  results: Array<"G" | "P">;
}

function streakLabel(results: Array<"G" | "P">) {
  if (results.length === 0) return "";
  const last = results[results.length - 1];
  let count = 0;
  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (results[index] !== last) break;
    count += 1;
  }
  return `${last}${count}`;
}

function teamName(value: string) {
  return value.trim();
}

function pctValue(row: Accumulator) {
  const played = row.wins + row.losses;
  if (played <= 0) return null;
  return row.wins / played;
}

function samePercentage(left: Accumulator, right: Accumulator) {
  const a = pctValue(left);
  const b = pctValue(right);
  if (a === null || b === null) return a === b;
  return left.wins * (right.wins + right.losses) === right.wins * (left.wins + left.losses);
}

function comparePct(left: Accumulator, right: Accumulator) {
  const leftPlayed = left.wins + left.losses;
  const rightPlayed = right.wins + right.losses;
  if (leftPlayed === 0 && rightPlayed === 0) return left.team.localeCompare(right.team, "es");
  if (leftPlayed === 0) return 1;
  if (rightPlayed === 0) return -1;
  const cross = left.wins * rightPlayed - right.wins * leftPlayed;
  if (cross !== 0) return cross > 0 ? -1 : 1;
  return left.team.localeCompare(right.team, "es");
}

/**
 * Clasificación de equipos a partir de marcadores finales.
 * Solo usa victorias, derrotas, partidos y porcentaje.
 * Un empate de porcentaje comparte puesto: no se inventa desempate.
 * Los partidos empatados no entran, porque la liquidación actual no los acepta.
 */
export function lvbpStandings(matches: StandingMatch[]): StandingsResult {
  const table = new Map<string, Accumulator>();
  let excludedTies = 0;
  let countedGames = 0;
  let latestCountedStart: string | null = null;

  function bucket(name: string) {
    const team = teamName(name);
    const current = table.get(team) ?? { team, wins: 0, losses: 0, results: [] };
    table.set(team, current);
    return current;
  }

  const chronological = [...matches].sort((left, right) => (left.startsAt ?? "").localeCompare(right.startsAt ?? ""));
  for (const match of chronological) {
    if (match.simulation || match.demo) continue;
    if (match.status !== "finished") continue;
    if (match.homeScore === null || match.awayScore === null) continue;
    if (!Number.isInteger(match.homeScore) || !Number.isInteger(match.awayScore)) continue;
    const home = teamName(match.homeTeam);
    const away = teamName(match.awayTeam);
    if (!home || !away || home === away) continue;
    if (match.homeScore === match.awayScore) {
      excludedTies += 1;
      continue;
    }
    const homeRow = bucket(home);
    const awayRow = bucket(away);
    countedGames += 1;
    if (match.startsAt && (!latestCountedStart || match.startsAt > latestCountedStart)) {
      latestCountedStart = match.startsAt;
    }
    if (match.homeScore > match.awayScore) {
      homeRow.wins += 1;
      homeRow.results.push("G");
      awayRow.losses += 1;
      awayRow.results.push("P");
    } else {
      awayRow.wins += 1;
      awayRow.results.push("G");
      homeRow.losses += 1;
      homeRow.results.push("P");
    }
  }

  const ordered = [...table.values()].sort(comparePct);
  const leader = ordered.find((row) => row.wins + row.losses > 0) ?? null;
  let rank = 0;
  let seen = 0;
  let previous: Accumulator | null = null;
  const rows = ordered.map((row) => {
    seen += 1;
    if (!previous || !samePercentage(previous, row)) rank = seen;
    previous = row;
    const played = row.wins + row.losses;
    let gamesBehind: number | null = null;
    if (leader && played > 0 && leader.wins + leader.losses > 0) {
      gamesBehind = ((leader.wins - row.wins) + (row.losses - leader.losses)) / 2;
    }
    return {
      team: row.team,
      played,
      wins: row.wins,
      losses: row.losses,
      winPct: pctValue(row),
      gamesBehind,
      streak: streakLabel(row.results),
      rank,
    };
  });

  return { rows, excludedTies, countedGames, latestCountedStart };
}

export function formatWinPct(value: number | null) {
  if (value === null) return "—";
  return value.toFixed(3);
}

export function formatGamesBehind(value: number | null) {
  if (value === null) return "—";
  if (value === 0) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

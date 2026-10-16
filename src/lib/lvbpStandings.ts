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
  id: string;
  team: string;
  played: number;
  wins: number;
  losses: number;
  winPct: number | null;
  gamesBehind: number | null;
  runDiff: number;
  streak: string;
  last10: string;
  home: string;
  away: string;
  rank: number;
}

export interface StandingsResult {
  rows: StandingRow[];
  excludedTies: number;
  countedGames: number;
  latestCountedStart: string | null;
}

export const LVBP_CLUBS = [
  { id: "tiburones", short: "Tiburones", full: "Tiburones de La Guaira" },
  { id: "aguilas", short: "Águilas", full: "Águilas del Zulia" },
  { id: "tigres", short: "Tigres", full: "Tigres de Aragua" },
  { id: "cardenales", short: "Cardenales", full: "Cardenales de Lara" },
  { id: "bravos", short: "Bravos", full: "Bravos de Margarita" },
  { id: "caribes", short: "Caribes", full: "Caribes de Anzoátegui" },
  { id: "leones", short: "Leones", full: "Leones del Caracas" },
  { id: "navegantes", short: "Navegantes", full: "Navegantes del Magallanes" },
] as const;

const CLUB_BY_ID = new Map<string, (typeof LVBP_CLUBS)[number]>(LVBP_CLUBS.map((club) => [club.id, club]));

interface Bucket {
  id: string;
  wins: number;
  losses: number;
  runsFor: number;
  runsAgainst: number;
  homeWins: number;
  homeLosses: number;
  awayWins: number;
  awayLosses: number;
  results: Array<"G" | "P">;
}

function plain(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function lvbpClubId(name: string) {
  const text = plain(name);
  if (text.includes("guaira") || text.includes("tiburon")) return "tiburones";
  if (text.includes("zulia") || text.includes("aguila")) return "aguilas";
  if (text.includes("aragua") || text.includes("tigre")) return "tigres";
  if (text.includes("lara") || text.includes("cardenal")) return "cardenales";
  if (text.includes("margarita") || text.includes("bravo")) return "bravos";
  if (text.includes("anzoategui") || text.includes("caribe")) return "caribes";
  if (text.includes("caracas") || text.includes("leon")) return "leones";
  if (text.includes("magallanes") || text.includes("navegante")) return "navegantes";
  return null;
}

function emptyBucket(id: string): Bucket {
  return {
    id,
    wins: 0,
    losses: 0,
    runsFor: 0,
    runsAgainst: 0,
    homeWins: 0,
    homeLosses: 0,
    awayWins: 0,
    awayLosses: 0,
    results: [],
  };
}

function pct(row: Bucket) {
  const played = row.wins + row.losses;
  if (played <= 0) return null;
  return row.wins / played;
}

function runDiff(row: Bucket) {
  return row.runsFor - row.runsAgainst;
}

function sameStanding(left: Bucket, right: Bucket) {
  const leftPct = pct(left);
  const rightPct = pct(right);
  if (leftPct === null || rightPct === null) return leftPct === rightPct;
  const samePct = left.wins * (right.wins + right.losses) === right.wins * (left.wins + left.losses);
  return samePct
    && left.wins === right.wins
    && left.wins + left.losses === right.wins + right.losses
    && runDiff(left) === runDiff(right);
}

function compare(left: Bucket, right: Bucket) {
  const leftPlayed = left.wins + left.losses;
  const rightPlayed = right.wins + right.losses;
  if (leftPlayed === 0 && rightPlayed === 0) {
    return (CLUB_BY_ID.get(left.id)?.short ?? left.id).localeCompare(CLUB_BY_ID.get(right.id)?.short ?? right.id, "es");
  }
  if (leftPlayed === 0) return 1;
  if (rightPlayed === 0) return -1;
  const cross = left.wins * rightPlayed - right.wins * leftPlayed;
  if (cross !== 0) return cross > 0 ? -1 : 1;
  if (left.wins !== right.wins) return right.wins - left.wins;
  const diff = runDiff(right) - runDiff(left);
  if (diff !== 0) return diff;
  return (CLUB_BY_ID.get(left.id)?.short ?? left.id).localeCompare(CLUB_BY_ID.get(right.id)?.short ?? right.id, "es");
}

function streakLabel(results: Array<"G" | "P">) {
  if (results.length === 0) return "-";
  const last = results[results.length - 1];
  let count = 0;
  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (results[index] !== last) break;
    count += 1;
  }
  return `${last}${count}`;
}

function record(wins: number, losses: number, played: boolean) {
  if (!played) return "-";
  return `${wins}-${losses}`;
}

function apply(bucket: Bucket, scored: number, allowed: number, home: boolean) {
  const won = scored > allowed;
  bucket.runsFor += scored;
  bucket.runsAgainst += allowed;
  bucket.results.push(won ? "G" : "P");
  if (won) bucket.wins += 1;
  else bucket.losses += 1;
  if (home) {
    if (won) bucket.homeWins += 1;
    else bucket.homeLosses += 1;
  } else if (won) bucket.awayWins += 1;
  else bucket.awayLosses += 1;
}

export function lvbpStandings(matches: StandingMatch[]): StandingsResult {
  const table = new Map<string, Bucket>(LVBP_CLUBS.map((club) => [club.id, emptyBucket(club.id)]));
  let excludedTies = 0;
  let countedGames = 0;
  let latestCountedStart: string | null = null;
  const chronological = [...matches].sort((left, right) => (left.startsAt ?? "").localeCompare(right.startsAt ?? ""));

  for (const match of chronological) {
    if (match.simulation || match.demo) continue;
    if (match.status !== "finished") continue;
    if (match.homeScore === null || match.awayScore === null) continue;
    if (!Number.isInteger(match.homeScore) || !Number.isInteger(match.awayScore)) continue;
    const homeId = lvbpClubId(match.homeTeam);
    const awayId = lvbpClubId(match.awayTeam);
    if (!homeId || !awayId || homeId === awayId) continue;
    if (match.homeScore === match.awayScore) {
      excludedTies += 1;
      continue;
    }
    const home = table.get(homeId);
    const away = table.get(awayId);
    if (!home || !away) continue;
    countedGames += 1;
    if (match.startsAt && (!latestCountedStart || match.startsAt > latestCountedStart)) {
      latestCountedStart = match.startsAt;
    }
    apply(home, match.homeScore, match.awayScore, true);
    apply(away, match.awayScore, match.homeScore, false);
  }

  const ordered = [...table.values()].sort(compare);
  const leader = ordered.find((row) => row.wins + row.losses > 0) ?? null;
  let rank = 0;
  let seen = 0;
  let previous: Bucket | null = null;
  const rows = ordered.map((row) => {
    seen += 1;
    if (!previous || !sameStanding(previous, row)) rank = seen;
    previous = row;
    const played = row.wins + row.losses;
    const recent = row.results.slice(-10);
    const recentWins = recent.filter((item) => item === "G").length;
    let gamesBehind: number | null = null;
    if (leader && played > 0) {
      gamesBehind = ((leader.wins - row.wins) + (row.losses - leader.losses)) / 2;
    }
    return {
      id: row.id,
      team: CLUB_BY_ID.get(row.id)?.short ?? row.id,
      played,
      wins: row.wins,
      losses: row.losses,
      winPct: pct(row),
      gamesBehind,
      runDiff: runDiff(row),
      streak: streakLabel(row.results),
      last10: record(recentWins, recent.length - recentWins, played > 0),
      home: `${row.homeWins}-${row.homeLosses}`,
      away: `${row.awayWins}-${row.awayLosses}`,
      rank,
    };
  });

  return { rows, excludedTies, countedGames, latestCountedStart };
}

export function formatWinPct(value: number | null) {
  if (value === null) return "—";
  return value.toFixed(3);
}

/** Positivo: el equipo subió. Negativo: bajó. Cero: se quedó. */
export function rankDelta(previousRank: number | undefined, rank: number, played: number) {
  if (!played || previousRank === undefined || previousRank === rank) return 0;
  return previousRank - rank;
}

export function formatGamesBehind(value: number | null) {
  if (value === null) return "—";
  if (value === 0) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

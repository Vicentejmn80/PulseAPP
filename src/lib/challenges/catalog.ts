import type { ChallengeTemplate } from "./types";
import { BANK } from "./bank.mjs";

export const CHALLENGE_BANK = BANK as ChallengeTemplate[];

export function templateId(code: string) {
  return `cht_${code.toLowerCase()}`;
}

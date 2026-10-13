import { describe, expect, it } from "vitest";
import { LEAGUE_MAX_MEMBERS, leagueInviteLink, pickLeagueShareText } from "@/config/leagues";

describe("invitación de liga", () => {
  it("arma el enlace y un mensaje sin premios ni dinero", () => {
    expect(LEAGUE_MAX_MEMBERS).toBe(50);
    expect(leagueInviteLink("ABC123", "https://app.example")).toBe("https://app.example/unirse/ABC123");
    const text = pickLeagueShareText({ alias: "Vicente", liga: "Los panas", codigo: "ABC123", enlace: "https://app.example/unirse/ABC123" }, 0);
    expect(text).toContain("Vicente");
    expect(text).toContain("Los panas");
    expect(text).toContain("ABC123");
    expect(text.toLowerCase()).not.toContain("dinero");
    expect(text.toLowerCase()).not.toContain("premio");
  });
});

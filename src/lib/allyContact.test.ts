import { describe, expect, it } from "vitest";
import { instagramLink, whatsappDigits, whatsappLink } from "@/lib/allyContact";

describe("contacto de aliados", () => {
  it("normaliza el WhatsApp de Garrison", () => {
    expect(whatsappDigits("+58 424-1846766")).toBe("584241846766");
    expect(whatsappDigits("04241846766")).toBe("584241846766");
    expect(whatsappLink("04241846766")).toContain("https://wa.me/584241846766?text=");
  });

  it("acepta Instagram como usuario o como URL", () => {
    expect(instagramLink("@garrisonoficial_")).toBe("https://instagram.com/garrisonoficial_");
    expect(instagramLink("https://instagram.com/garrisonoficial_")).toBe("https://instagram.com/garrisonoficial_");
    expect(instagramLink("")).toBe("");
  });
});

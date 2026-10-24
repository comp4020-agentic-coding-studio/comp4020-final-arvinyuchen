import { describe, expect, it } from "vitest";
import { best, merge, score } from "../src/lib/finder";
import { LOCAL } from "../src/lib/places-index";

// Find, for sharing a place: forgiving the way a person types a name they
// half remember, and searching Canberra's places from Overture's index
// before OpenStreetMap's (src/pages/api/lookup.ts).

const at = (name: string, area = "", lat = -35.28, lon = 149.13) => ({
  ref: `overture/${name}`,
  name,
  kind: "coffee" as const,
  area,
  address: "",
  lat,
  lon,
});

describe("finding a place to share", () => {
  it("takes a street's short form for its long one", () => {
    expect(score("Lonsdale Street Roasters", "Lonsdale St Roasters")).toBe(100);
  });

  it("finds a name typed as one word or as two", () => {
    expect(score("highroad", "High Road")).toBe(100);
    expect(score("High Road", "Highroad")).toBe(100);
  });

  it("finds a place whatever kind of place it's called", () => {
    const [first] = best("Kingpin bowling", [at("Kingpin"), at("King O'Malley's"), at("Pin Bowl")]);
    expect(first.name).toBe("Kingpin");
  });

  it("counts a suburb typed with the name", () => {
    const [first] = best("two before ten aranda", [at("Two Before Ten", "City"), at("Two Before Ten Aranda", "Aranda")]);
    expect(first.name).toBe("Two Before Ten Aranda");
    expect(best("ona griffith", [at("Ona Coffee", "Griffith"), at("ONA Coffee", "Fyshwick")])[0].area).toBe("Griffith");
  });

  it("forgives a typo, but not a different place", () => {
    expect(score("Bar Rochferd", "Bar Rochford")).toBeGreaterThan(0);
    expect(score("dumplings", "Mount Ainslie")).toBe(0);
  });

  it("lists a place found in both sources once", () => {
    const one = at("Lonsdale St Roasters");
    const again = { ...at("Lonsdale Street Roasters"), ref: "node/1", lat: one.lat + 0.0005 };
    const elsewhere = { ...at("Lonsdale St Roasters"), ref: "node/2", lat: one.lat + 0.05 };
    expect(merge([one], [again, elsewhere]).map((c) => c.ref)).toEqual([one.ref, "node/2"]);
  });

  it("searches Canberra's places from Overture, each with its suburb", () => {
    expect(LOCAL.length).toBeGreaterThan(1000);
    const [highroad] = best("Highroad", LOCAL);
    expect(highroad.name).toBe("Highroad");
    expect(highroad.area).toBe("Dickson");
    expect(LOCAL.every((p) => p.lat < -35.1 && p.lat > -35.95 && p.lon > 148.7 && p.lon < 149.45)).toBe(true);
  });
});

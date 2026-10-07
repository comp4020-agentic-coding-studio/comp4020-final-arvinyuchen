import { describe, expect, it } from "vitest";
import { anchorsFrom, cosine, distanceKm, parseQuery } from "../src/lib/query";

// Reading a search prompt: the "where" in it is a hard filter, so it has to
// be read exactly. These run on their own, no app needed.
const places = [
  { name: "Woolley Street", area: "Dickson", lat: -35.2503, lon: 149.1367 },
  { name: "Lonsdale Street", area: "Braddon", lat: -35.2759, lon: 149.1324 },
  { name: "Haig Park", area: "Braddon", lat: -35.274, lon: 149.128 },
  { name: "National Museum of Australia", area: "Acton", lat: -35.2932, lon: 149.1213 },
  { name: "Somewhere unlocated", area: "Narnia", lat: null, lon: null },
];
const anchors = anchorsFrom(places);

describe("reading a search prompt", () => {
  it("takes 'near <suburb>' as where, and leaves the rest to match on meaning", () => {
    const q = parseQuery("Cheap dumplings near Dickson for a rainy night", anchors);
    expect(q.near?.name).toBe("Dickson");
    expect(q.rest).toBe("cheap dumplings for a rainy night");
  });

  it("puts a suburb at the middle of its places", () => {
    const braddon = parseQuery("drinks in Braddon", anchors).near!;
    expect(braddon.lat).toBeCloseTo((-35.2759 + -35.274) / 2, 4);
  });

  it("knows a shared place by name, and ANU without one", () => {
    expect(parseQuery("coffee next to the National Museum of Australia", anchors).near?.name).toBe(
      "National Museum of Australia",
    );
    expect(parseQuery("lunch near campus", anchors).near?.name).toBe("ANU");
  });

  it("doesn't read a where into a word that only starts like a suburb", () => {
    expect(parseQuery("near dicksonville", anchors).near).toBeNull();
    expect(parseQuery("a place with a view", anchors).near).toBeNull();
  });

  it("ignores places that have no location", () => {
    expect(parseQuery("near Narnia", anchors).near).toBeNull();
  });

  it("hears a kind only when the prompt asks for one", () => {
    expect(parseQuery("somewhere for dinner", anchors).kind).toBe("food");
    expect(parseQuery("a picnic spot", anchors).kind).toBe("outdoors");
    expect(parseQuery("dinner then a walk in the park", anchors).kind).toBeNull();
    expect(parseQuery("something cosy", anchors).kind).toBeNull();
  });
});

describe("the maths", () => {
  it("measures kilometres between two points", () => {
    // Lonsdale Street to Woolley Street is about 2.9 km as the crow flies.
    expect(distanceKm({ lat: -35.2759, lon: 149.1324 }, { lat: -35.2503, lon: 149.1367 })).toBeCloseTo(2.87, 1);
  });

  it("scores the same direction 1 and a right angle 0", () => {
    expect(cosine(Float32Array.from([1, 2, 3]), Float32Array.from([2, 4, 6]))).toBeCloseTo(1, 6);
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBeCloseTo(0, 6);
  });
});

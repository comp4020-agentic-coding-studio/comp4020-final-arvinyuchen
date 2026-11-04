import type { Kind } from "./kinds";

// The picture a card shows when its place has no photo of its own: one for
// each kind, so it stands for the kind, never for that place, and the card
// names the kind on it to say so. Each is an illustration made for Spots in
// the starter places' style and on their paper (scripts/starter_art.py),
// kept in public/kinds/ at the card's size. A kind without one would show
// the kind's colour and icon instead.
export interface KindArt {
  src: string;
}

export const KIND_ART: Partial<Record<Kind, KindArt>> = {
  food: { src: "/kinds/food.webp" },
  coffee: { src: "/kinds/coffee.webp" },
  drinks: { src: "/kinds/drinks.webp" },
  outdoors: { src: "/kinds/outdoors.webp" },
  culture: { src: "/kinds/culture.webp" },
  fun: { src: "/kinds/fun.webp" },
};

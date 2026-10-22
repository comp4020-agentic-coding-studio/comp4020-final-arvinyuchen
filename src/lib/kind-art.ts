import type { Kind } from "./kinds";

// The picture a card shows when its place has no photo of its own: one for
// each kind, so it stands for the kind, never for that place, and the card
// names the kind on it to say so. Each is a photo from Unsplash (free to
// use under the Unsplash licence, which asks for no credit), kept in
// public/kinds/ at the card's size rather than hotlinked, and credited
// anyway: to its photographer where we know them, else to Unsplash. Until
// a kind has one, its card shows the kind's colour and icon instead.
export interface KindArt {
  src: string;
  /** the photo's page on Unsplash, and who took it, where we know them */
  page?: string;
  credit?: string;
}

export const KIND_ART: Partial<Record<Kind, KindArt>> = {
  coffee: { src: "/kinds/coffee.jpg" },
  drinks: { src: "/kinds/drinks.jpg" },
  outdoors: { src: "/kinds/outdoors.jpg" },
  culture: { src: "/kinds/culture.jpg" },
  fun: { src: "/kinds/fun.jpg" },
};

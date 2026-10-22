import type { Kind } from "./kinds";

// The picture a card shows when its place has no photo of its own: one for
// each kind, so it stands for the kind, never for that place, and the card
// names the kind on it to say so. Each is a photo from Unsplash (free to
// use under the Unsplash licence), kept in public/kinds/ rather than
// hotlinked, and credited anyway. Until a kind has one, its card shows the
// kind's colour and icon instead.
export interface KindArt {
  src: string;
  /** the photo's page on Unsplash */
  page: string;
  credit: string;
}

export const KIND_ART: Partial<Record<Kind, KindArt>> = {};

import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { Photo } from "./catalogue";
import { dataDir } from "./db";
import { nominatim, USER_AGENT } from "./nominatim";

// A place's photo. Where OpenStreetMap links a place to Wikidata or to a
// file on Wikimedia Commons, and that photo's licence allows reuse, the
// place gets it, credited the way the starter places are. Or the person
// sharing it uploads their own, which is re-encoded here with every bit of
// metadata (a phone's GPS location among it) left behind. Or it has none,
// and its card shows its kind's picture (src/lib/kind-art.ts).

// ---- Found: Wikimedia Commons, through OpenStreetMap's tags -----------------

// (licences that let anyone reuse a photo with a credit, or without one)
const FREE = /^(cc[ -]?by(-sa)?\b|cc0|public domain|pd\b)/i;

const text = (html: string | undefined) =>
  (html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const wiki = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return (await res.json()) as T;
};

/** A Commons file as a card's photo, if it's a photo whose licence allows reuse. */
async function commons(file: string): Promise<Photo | null> {
  const title = file.startsWith("File:") ? file : `File:${file}`;
  if (!/\.(jpe?g|png|webp)$/i.test(title)) return null;
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "960",
    format: "json",
    formatversion: "2",
  });
  type Info = {
    query?: {
      pages?: {
        imageinfo?: {
          url: string;
          thumburl?: string;
          descriptionurl: string;
          extmetadata?: Record<string, { value?: string }>;
        }[];
      }[];
    };
  };
  const info = (await wiki<Info>(`https://commons.wikimedia.org/w/api.php?${params}`)).query?.pages?.[0]?.imageinfo?.[0];
  const license = text(info?.extmetadata?.LicenseShortName?.value);
  if (!info || !FREE.test(license)) return null;
  return {
    src: info.thumburl ?? info.url,
    page: info.descriptionurl,
    credit: text(info.extmetadata?.Artist?.value).slice(0, 60) || "Wikimedia Commons",
    license,
  };
}

/** The Commons file a place's OpenStreetMap tags point to, if any. */
async function fileOf(tags: Record<string, string>): Promise<string | null> {
  const linked = tags.wikimedia_commons ?? "";
  if (linked.startsWith("File:")) return linked;
  const image = tags.image ?? "";
  const page = image.match(/commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/);
  if (page) return decodeURIComponent(page[1]).replace(/_/g, " ");
  const upload = image.match(/upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/);
  if (upload) return `File:${decodeURIComponent(upload[1]).replace(/_/g, " ")}`;
  if (/^Q\d+$/.test(tags.wikidata ?? "")) {
    type Claims = { claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] } };
    const claims = await wiki<Claims>(
      `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${tags.wikidata}&property=P18&format=json`,
    );
    const file = claims.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (file) return `File:${file}`;
  }
  return null;
}

// What's been worked out for each OpenStreetMap place (a photo, or none).
const found = new Map<string, Photo | null>();

/** The photo for a place from its OpenStreetMap tags (as Find gets them). */
export async function photoFromTags(osm: string, tags: Record<string, string> | undefined): Promise<Photo | null> {
  if (found.has(osm)) return found.get(osm)!;
  let photo: Photo | null = null;
  try {
    const file = await fileOf(tags ?? {});
    photo = file ? await commons(file) : null;
  } catch {
    // (Wikimedia unreachable: no photo found, so the sharer adds one)
    return null;
  }
  found.set(osm, photo);
  return photo;
}

/** What's been worked out for an OpenStreetMap place so far, if anything. */
export const knownPhoto = (osm: string): Photo | null => found.get(osm) ?? null;

/** The photo for an OpenStreetMap place being shared: what Find found, or
 *  (if the server has restarted since) its tags asked for once more. */
export async function photoForOsm(osm: string): Promise<Photo | null> {
  if (found.has(osm)) return found.get(osm)!;
  const [type, id] = osm.split("/");
  try {
    const [hit] = await nominatim<{ extratags?: Record<string, string> }[]>("lookup", {
      osm_ids: `${type[0].toUpperCase()}${id}`,
      extratags: "1",
    });
    return hit ? await photoFromTags(osm, hit.extratags) : null;
  } catch {
    return null;
  }
}

// ---- Uploaded: the sharer's own ---------------------------------------------

export const PHOTOS = join(dataDir, "photos");
export const MAX_UPLOAD = 15 * 1024 * 1024;
export const PHOTO_FILE = /^[A-Za-z0-9_-]{16}(-800)?\.jpg$/;

/** Keeps an uploaded photo: turned upright, at two widths (the card's and a
 *  big one to open), as JPEG with no metadata at all. Null if it isn't a
 *  photo we can read. */
export async function savePhoto(file: File, by: string): Promise<Photo | null> {
  if (!file.size || file.size > MAX_UPLOAD) return null;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const id = randomBytes(12).toString("base64url");
    mkdirSync(PHOTOS, { recursive: true });
    // (sharp writes no metadata unless asked to, so EXIF and GPS go here)
    const upright = sharp(input, { failOn: "error" }).rotate();
    await upright
      .clone()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(join(PHOTOS, `${id}.jpg`));
    await upright
      .clone()
      .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(join(PHOTOS, `${id}-800.jpg`));
    return { src: `/photos/${id}-800.jpg`, page: `/photos/${id}.jpg`, credit: by, license: "" };
  } catch {
    return null;
  }
}

export const readPhoto = (file: string) => readFile(join(PHOTOS, file));

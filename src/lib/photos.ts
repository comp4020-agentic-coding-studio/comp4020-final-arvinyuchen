import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { Photo } from "./catalogue";
import { dataDir } from "./db";

// A place's photo, if it has one, is the one the person sharing it
// uploads, re-encoded here with every bit of metadata (a phone's GPS
// location among it) left behind. Nothing is fetched for it from anywhere
// else: a place shared without one shows its kind's picture
// (src/lib/kind-art.ts). (The starter places, and places shared before
// this, keep the Commons photos they have.)

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

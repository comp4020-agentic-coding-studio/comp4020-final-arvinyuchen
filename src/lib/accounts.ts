import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";

// Accounts, passkeys and sessions (tables in src/lib/db.ts). An account is
// a name, an email and the passkeys that can sign in as it: no password.
// It can have several passkeys (a phone's, a laptop's that doesn't share
// with it), never none. The email never signs in: it only gets the link
// that lets a device make a passkey, once they're all lost.

export interface Account {
  id: number;
  /** The WebAuthn user handle: random, never shown. */
  handle: string;
  name: string;
  /** Where a lost-passkey link goes; accounts from before it was asked for have none. */
  email: string | null;
  /** May use /admin (see src/lib/admin.ts). */
  isAdmin: boolean;
}

export interface StoredPasskey {
  id: string;
  accountId: number;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports: string[];
  synced: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  /** The password manager that holds it, when its AAGUID says. */
  keeper: string | null;
  /** The device and browser it was made on, e.g. "iPhone · Safari". */
  madeOn: string | null;
}

export const newHandle = () => randomBytes(16).toString("base64url");

export function createAccount(handle: string, name: string, email: string | null): Account {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO accounts (handle, name, email) VALUES (?, ?, ?)")
    .run(handle, name, email);
  return { id: Number(lastInsertRowid), handle, name, email, isAdmin: false };
}

type AccountRow = Omit<Account, "isAdmin"> & { isAdmin: number };
const toAccount = (row: AccountRow | undefined): Account | undefined => row && { ...row, isAdmin: row.isAdmin === 1 };
const COLUMNS = "id, handle, name, email, is_admin AS isAdmin";

export const getAccount = (id: number): Account | undefined =>
  toAccount(db.prepare(`SELECT ${COLUMNS} FROM accounts WHERE id = ?`).get(id) as AccountRow);

/** An email as it's kept (trimmed, lower case), or null if it doesn't look like one. */
export function cleanEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function setEmail(accountId: number, email: string): void {
  db.prepare("UPDATE accounts SET email = ? WHERE id = ?").run(email, accountId);
}

/** The accounts with this email (one person may have made more than one), newest first. */
export const accountsByEmail = (email: string): Account[] =>
  (
    db
      .prepare(`SELECT ${COLUMNS} FROM accounts WHERE email = ? ORDER BY id DESC LIMIT 3`)
      .all(email) as AccountRow[]
  ).map((row) => toAccount(row)!);

/**
 * One account, one name: renaming it renames its member in every group,
 * so friends see the new name everywhere. Returns the groups it's in, for
 * their live pages. (Places it shared keep the name they were shared with.)
 */
export function renameAccount(accountId: number, name: string): string[] {
  return db.transaction(() => {
    db.prepare("UPDATE accounts SET name = ? WHERE id = ?").run(name, accountId);
    db.prepare("UPDATE members SET name = ? WHERE account_id = ? AND removed_at IS NULL").run(name, accountId);
    return (
      db.prepare("SELECT DISTINCT group_id FROM members WHERE account_id = ? AND removed_at IS NULL").all(accountId) as {
        group_id: string;
      }[]
    ).map((r) => r.group_id);
  })();
}

// ---- passkeys -------------------------------------------------------------------

type PasskeyRow = {
  id: string;
  account_id: number;
  public_key: Buffer;
  counter: number;
  transports: string;
  synced: number;
  created_at: string;
  last_used_at: string | null;
  aaguid: string | null;
  made_on: string | null;
};
const toPasskey = (r: PasskeyRow): StoredPasskey => ({
  id: r.id,
  accountId: r.account_id,
  publicKey: new Uint8Array(r.public_key),
  counter: r.counter,
  transports: JSON.parse(r.transports) as string[],
  synced: Boolean(r.synced),
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at,
  keeper: (r.aaguid && KEEPERS[r.aaguid]) ?? null,
  madeOn: r.made_on,
});

// Where a passkey lives, from the AAGUID its password manager reports
// (the community list at github.com/passkeydeveloper/passkey-authenticator-aaguids).
// Some report none (all zeros); those just show the device they were made on.
const KEEPERS: Record<string, string> = {
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "771b48fd-d3d4-4f74-9232-fc157ab0507a": "Microsoft Password Manager",
  "53414d53-554e-4700-0000-000000000000": "Samsung Pass",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
  "50726f74-6f6e-5061-7373-50726f746f6e": "Proton Pass",
  "fdb141b2-5d84-443e-8a35-4698c205a502": "KeePassXC",
};

/** "iPhone · Safari", from a User-Agent: just enough to tell passkeys apart. */
export function deviceOf(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const device = [
    [/iPhone/, "iPhone"],
    [/iPad/, "iPad"],
    [/Android/, "Android"],
    [/CrOS/, "Chromebook"],
    [/Macintosh/, "Mac"],
    [/Windows/, "Windows"],
    [/Linux/, "Linux"],
  ].find(([re]) => (re as RegExp).test(userAgent))?.[1] as string | undefined;
  const browser = [
    [/Edg(e|A|iOS)?\//, "Edge"],
    [/Firefox|FxiOS/, "Firefox"],
    [/SamsungBrowser/, "Samsung Internet"],
    [/CriOS|Chrome\//, "Chrome"],
    [/Safari/, "Safari"],
  ].find(([re]) => (re as RegExp).test(userAgent))?.[1] as string | undefined;
  return [device, browser].filter(Boolean).join(" · ") || null;
}

export function savePasskey(
  accountId: number,
  credential: { id: string; publicKey: Uint8Array; counter: number; transports?: string[] },
  about: { synced: boolean; aaguid: string; madeOn: string | null },
): void {
  db.prepare(
    `INSERT INTO passkeys (id, account_id, public_key, counter, transports, synced, aaguid, made_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    credential.id,
    accountId,
    Buffer.from(credential.publicKey),
    credential.counter,
    JSON.stringify(credential.transports ?? []),
    about.synced ? 1 : 0,
    about.aaguid,
    about.madeOn,
  );
}

/**
 * Forgets one of an account's passkeys, so it can't sign in any more. Never
 * the last one: an account always keeps a way in.
 */
export function removePasskey(accountId: number, id: string): boolean {
  return db.transaction(() => {
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE account_id = ?").get(accountId) as { n: number };
    if (n < 2) return false;
    return db.prepare("DELETE FROM passkeys WHERE id = ? AND account_id = ?").run(id, accountId).changes > 0;
  })();
}

export function passkeyById(id: string): StoredPasskey | undefined {
  const row = db.prepare("SELECT * FROM passkeys WHERE id = ?").get(id) as PasskeyRow | undefined;
  return row && toPasskey(row);
}

export const listPasskeys = (accountId: number): StoredPasskey[] =>
  (db.prepare("SELECT * FROM passkeys WHERE account_id = ? ORDER BY created_at").all(accountId) as PasskeyRow[]).map(
    toPasskey,
  );

export function passkeyUsed(id: string, counter: number): void {
  db.prepare("UPDATE passkeys SET counter = ?, last_used_at = datetime('now') WHERE id = ?").run(counter, id);
}

// ---- sessions -------------------------------------------------------------------

const SESSION_DAYS = 365;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Starts a session and returns its token, for the cookie only. */
export function startSession(accountId: number): string {
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    `INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`,
  ).run(hash(token), accountId);
  return token;
}

export function accountForSession(token: string | undefined): Account | undefined {
  if (!token) return undefined;
  return toAccount(
    db
      .prepare(
        `SELECT a.id, a.handle, a.name, a.email, a.is_admin AS isAdmin FROM sessions s JOIN accounts a ON a.id = s.account_id
          WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
      )
      .get(hash(token)) as AccountRow,
  );
}

export function endSession(token: string | undefined): void {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
}

/**
 * Adding a device that doesn't have your passkey (another ecosystem, a
 * browser that doesn't share): one you're signed in on shows a short code,
 * and its QR code; on the new one, the code lets you make a passkey there
 * for your account, and is gone. It never signs anyone in by itself: only
 * the passkey it makes does. Ten minutes, once, the newest only.
 *
 * With every device lost, the same thing comes by email instead
 * (src/pages/recover.astro): a long code, in a link, for 30 minutes.
 */
const DEVICE_CODE_MINUTES = 10;
const EMAIL_CODE_MINUTES = 30;
// (no 0, O, 1 or I: read off one screen, typed into another)
const CODE_LETTERS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const plainCode = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, "");
/** An emailed code, not one read off a screen: it's longer. */
export const isEmailCode = (code: string) => plainCode(code).length > 8;

function newCode(accountId: number, length: number, minutes: number): string {
  const code = [...randomBytes(length)].map((b) => CODE_LETTERS[b % CODE_LETTERS.length]).join("");
  db.transaction(() => {
    db.prepare("DELETE FROM device_codes WHERE account_id = ? OR expires_at <= datetime('now')").run(accountId);
    db.prepare(
      `INSERT INTO device_codes (code_hash, account_id, expires_at) VALUES (?, ?, datetime('now', '+${minutes} minutes'))`,
    ).run(hash(code), accountId);
  })();
  return code;
}

/** A new code for the account, as XXXX-XXXX; any earlier one stops working. */
export function newDeviceCode(accountId: number): string {
  const code = newCode(accountId, 8, DEVICE_CODE_MINUTES);
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** A new code for an emailed link (24 letters, too many to guess); any earlier one stops working. */
export const newEmailCode = (accountId: number): string => newCode(accountId, 24, EMAIL_CODE_MINUTES);

/** Whose account a code adds a device to, while it works. */
export function accountForDeviceCode(code: string): Account | undefined {
  const id = db
    .prepare("SELECT account_id FROM device_codes WHERE code_hash = ? AND expires_at > datetime('now')")
    .pluck()
    .get(hash(plainCode(code))) as number | undefined;
  return id === undefined ? undefined : getAccount(id);
}

/** Uses the code up, once the new device's passkey is saved; false if it had already gone. */
export function useDeviceCode(code: string, accountId: number): boolean {
  return (
    db
      .prepare("DELETE FROM device_codes WHERE code_hash = ? AND account_id = ? AND expires_at > datetime('now')")
      .run(hash(plainCode(code)), accountId).changes > 0
  );
}

export { DEVICE_CODE_MINUTES, EMAIL_CODE_MINUTES, SESSION_DAYS };

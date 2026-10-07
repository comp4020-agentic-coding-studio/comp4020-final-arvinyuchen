import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";

// Accounts, passkeys and sessions (tables in src/lib/db.ts). An account is
// a name and the passkeys that can sign in as it: no password, no email.

export interface Account {
  id: number;
  /** The WebAuthn user handle: random, never shown. */
  handle: string;
  name: string;
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
}

export const newHandle = () => randomBytes(16).toString("base64url");

export function createAccount(handle: string, name: string): Account {
  const { lastInsertRowid } = db.prepare("INSERT INTO accounts (handle, name) VALUES (?, ?)").run(handle, name);
  return { id: Number(lastInsertRowid), handle, name };
}

export const getAccount = (id: number): Account | undefined =>
  db.prepare("SELECT id, handle, name FROM accounts WHERE id = ?").get(id) as Account | undefined;

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
});

export function savePasskey(
  accountId: number,
  credential: { id: string; publicKey: Uint8Array; counter: number; transports?: string[] },
  synced: boolean,
): void {
  db.prepare(
    "INSERT INTO passkeys (id, account_id, public_key, counter, transports, synced) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    credential.id,
    accountId,
    Buffer.from(credential.publicKey),
    credential.counter,
    JSON.stringify(credential.transports ?? []),
    synced ? 1 : 0,
  );
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
  return db
    .prepare(
      `SELECT a.id, a.handle, a.name FROM sessions s JOIN accounts a ON a.id = s.account_id
        WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    )
    .get(hash(token)) as Account | undefined;
}

export function endSession(token: string | undefined): void {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
}

export { SESSION_DAYS };

import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

// A passkey in software, for the spec: it makes P-256 credentials and signs
// challenges exactly as a phone or laptop would (WebAuthn level 3, "none"
// attestation), so the server's real verification runs end to end. One
// instance is one person's synced passkey: using it from two cookie jars is
// the same passkey on two devices.

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const sha256 = (data: Uint8Array | string) => new Uint8Array(createHash("sha256").update(data).digest());
const concat = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts));
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

// Just enough CBOR for an attestation object and a COSE key.
type Cbor = number | string | Uint8Array | Map<Cbor, Cbor>;
function cbor(value: Cbor): Uint8Array {
  const head = (major: number, n: number) => {
    if (n < 24) return new Uint8Array([(major << 5) | n]);
    if (n < 256) return new Uint8Array([(major << 5) | 24, n]);
    if (n < 65536) return new Uint8Array([(major << 5) | 25, n >> 8, n & 255]);
    return concat(new Uint8Array([(major << 5) | 26]), u32(n));
  };
  if (typeof value === "number") return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    return concat(head(3, bytes.length), bytes);
  }
  if (value instanceof Uint8Array) return concat(head(2, value.length), value);
  return concat(head(5, value.size), ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)]));
}

interface Credential {
  id: Uint8Array;
  key: KeyObject;
  rpId: string;
  userHandle: string;
  counter: number;
}

// Flags: user present, user verified, backup eligible, backed up (synced).
const UP = 0x01, UV = 0x04, BE = 0x08, BS = 0x10, AT = 0x40;

export class Authenticator {
  credentials: Credential[] = [];

  /** navigator.credentials.create(), answered: a RegistrationResponseJSON. */
  create(options: { challenge: string; rp: { id: string }; user: { id: string } }, origin: string) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = publicKey.export({ format: "jwk" });
    const cose = cbor(
      new Map<Cbor, Cbor>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, new Uint8Array(Buffer.from(jwk.x!, "base64url"))],
        [-3, new Uint8Array(Buffer.from(jwk.y!, "base64url"))],
      ]),
    );
    const id = new Uint8Array(randomBytes(16));
    const credential = { id, key: privateKey, rpId: options.rp.id, userHandle: options.user.id, counter: 0 };
    this.credentials.push(credential);
    const authData = concat(
      sha256(options.rp.id),
      new Uint8Array([UP | UV | BE | BS | AT]),
      u32(0),
      new Uint8Array(16), // aaguid
      new Uint8Array([id.length >> 8, id.length & 255]),
      id,
      cose,
    );
    const clientDataJSON = JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin, crossOrigin: false });
    return {
      id: b64url(id),
      rawId: b64url(id),
      type: "public-key",
      response: {
        clientDataJSON: b64url(new TextEncoder().encode(clientDataJSON)),
        attestationObject: b64url(cbor(new Map<Cbor, Cbor>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]))),
        transports: ["internal", "hybrid"],
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    };
  }

  /** navigator.credentials.get(), answered with this device's passkey for the site. */
  get(options: { challenge: string; rpId: string }, origin: string) {
    const credential = this.credentials.find((c) => c.rpId === options.rpId);
    if (!credential) throw new Error(`no passkey for ${options.rpId}`);
    credential.counter += 1;
    const authData = concat(sha256(options.rpId), new Uint8Array([UP | UV | BE | BS]), u32(credential.counter));
    const clientDataJSON = new TextEncoder().encode(
      JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin, crossOrigin: false }),
    );
    const signature = sign("sha256", concat(authData, sha256(clientDataJSON)), credential.key);
    return {
      id: b64url(credential.id),
      rawId: b64url(credential.id),
      type: "public-key",
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(new Uint8Array(signature)),
        userHandle: credential.userHandle,
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    };
  }
}

/** A browser's cookies, across requests: enough of one for the spec. */
export class Jar {
  private cookies = new Map<string, string>();
  take(res: Response): Response {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const [name, ...rest] = pair.split("=");
      const gone = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a) || /^\s*expires=.*1970/i.test(a));
      if (gone || rest.join("=") === "") this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), rest.join("="));
    }
    return res;
  }
  get header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  has(name: string): boolean {
    return this.cookies.has(name);
  }
}

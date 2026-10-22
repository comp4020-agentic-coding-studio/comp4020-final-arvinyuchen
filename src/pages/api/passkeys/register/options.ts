import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { APIRoute } from "astro";
import { listPasskeys, newHandle } from "../../../../lib/accounts";
import { clean, signedIn } from "../../../../lib/me";
import { begin, relyingParty } from "../../../../lib/passkeys";

// Step one of saving a passkey. Either someone signed in adds another one
// (say, for a laptop on a different ecosystem), or someone new makes an
// account: a name and this passkey. That's the only way in to Spots, and
// the only thing needed before starting or joining a group.
export const POST: APIRoute = async ({ cookies, request, url }) => {
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const account = signedIn(cookies);
  const name = clean(body.name ?? null, 40);

  let ceremony;
  if (account) ceremony = { accountId: account.id, handle: account.handle, name: account.name };
  else if (name) ceremony = { accountId: null, handle: newHandle(), name };
  else return Response.json({ error: "Type your name first, so your friends know it's you." }, { status: 400 });

  const { rpName, rpID } = relyingParty(url);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: ceremony.name,
    userDisplayName: ceremony.name,
    userID: new Uint8Array(Buffer.from(ceremony.handle, "base64url")),
    attestationType: "none",
    // Discoverable, so signing in later needs no username at all.
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    excludeCredentials: ceremony.accountId
      ? listPasskeys(ceremony.accountId).map((p) => ({ id: p.id, transports: p.transports }))
      : [],
  });
  begin(cookies, { kind: "register", challenge: options.challenge, ...ceremony });
  return Response.json(options);
};

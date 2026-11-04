import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { APIRoute } from "astro";
import { accountForDeviceCode, cleanEmail, isEmailCode, listPasskeys, newHandle } from "../../../../lib/accounts";
import { clean, signedIn } from "../../../../lib/me";
import { begin, CODE_GONE, LINK_GONE, relyingParty } from "../../../../lib/passkeys";

// Step one of saving a passkey. Either someone signed in adds another one
// (say, for a laptop on a different ecosystem), a new device adds one with
// the code a signed-in device showed or an emailed link carried
// (src/pages/add-device.astro), or someone new makes an account: a name, an
// email and this passkey. That's the only way in to Spots, and the only
// thing needed before starting or joining a group.
export const POST: APIRoute = async ({ cookies, request, url }) => {
  const body = (await request.json().catch(() => ({}))) as { name?: string; email?: string; code?: string };
  const account = signedIn(cookies);
  const name = clean(body.name ?? null, 40);
  const email = cleanEmail(body.email);
  const code = clean(body.code ?? null, 40);
  const linking = !account && code ? accountForDeviceCode(code) : undefined;

  let ceremony;
  if (account) ceremony = { accountId: account.id, handle: account.handle, name: account.name };
  else if (code && !linking) return Response.json({ error: isEmailCode(code) ? LINK_GONE : CODE_GONE }, { status: 400 });
  else if (linking) ceremony = { accountId: linking.id, handle: linking.handle, name: linking.name, code };
  else if (!name) return Response.json({ error: "Type your name first, so your friends know it's you." }, { status: 400 });
  else if (!email)
    return Response.json({ error: "Type your email too: it gets you back in if you lose your passkey." }, { status: 400 });
  else ceremony = { accountId: null, handle: newHandle(), name, email };

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

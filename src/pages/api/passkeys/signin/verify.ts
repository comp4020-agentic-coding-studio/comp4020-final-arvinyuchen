import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { APIRoute } from "astro";
import { passkeyById, passkeyUsed } from "../../../../lib/accounts";
import { getGroup, linkMember } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { cookieMember, signIn } from "../../../../lib/me";
import { finish, relyingParty } from "../../../../lib/passkeys";

// Step two: the signature has to come from a passkey we stored, over the
// challenge we gave this browser. Signing in from a group page also brings
// along the member this browser already is there, if the account has none.
export const POST: APIRoute = async ({ cookies, request, url }) => {
  const ceremony = finish(cookies);
  if (ceremony?.kind !== "signin") return Response.json({ error: "That took too long. Try again." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { response?: AuthenticationResponseJSON; group?: string } | null;
  const passkey = body?.response?.id ? passkeyById(body.response.id) : undefined;
  if (!body?.response || !passkey) {
    return Response.json({ error: "Spots doesn't know that passkey. Was it made for this site?" }, { status: 400 });
  }
  const { rpID, origin } = relyingParty(url);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: passkey.id, publicKey: passkey.publicKey, counter: passkey.counter, transports: passkey.transports },
      requireUserVerification: false,
    });
  } catch {
    return Response.json({ error: "That passkey couldn't be checked. Try again." }, { status: 400 });
  }
  if (!verification.verified) return Response.json({ error: "That passkey couldn't be checked." }, { status: 400 });

  passkeyUsed(passkey.id, verification.authenticationInfo.newCounter);
  signIn(cookies, passkey.accountId);
  const group = body.group ? getGroup(body.group) : undefined;
  const member = group && cookieMember(cookies, group.id);
  if (group && member && linkMember(member, group.id, passkey.accountId)) changed(group.id);
  return Response.json({ ok: true });
};

import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { APIRoute } from "astro";
import { passkeyById, passkeyUsed } from "../../../../lib/accounts";
import { signIn } from "../../../../lib/me";
import { finish, relyingParty } from "../../../../lib/passkeys";

// Step two: the signature has to come from a passkey we stored, over the
// challenge we gave this browser. Then this browser is that account.
export const POST: APIRoute = async ({ cookies, request, url }) => {
  const ceremony = finish(cookies);
  if (ceremony?.kind !== "signin") return Response.json({ error: "That took too long. Try again." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { response?: AuthenticationResponseJSON } | null;
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
  return Response.json({ ok: true });
};

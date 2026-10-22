import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { APIRoute } from "astro";
import { createAccount, deviceOf, savePasskey } from "../../../../lib/accounts";
import { signIn, signedIn } from "../../../../lib/me";
import { finish, relyingParty } from "../../../../lib/passkeys";

// Step two: check what the device signed, store its public key, and sign
// this browser in, making the account first if it's new.
export const POST: APIRoute = async ({ cookies, request, url }) => {
  const ceremony = finish(cookies);
  if (ceremony?.kind !== "register") return Response.json({ error: "That took too long. Try again." }, { status: 400 });
  const { rpID, origin } = relyingParty(url);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: await request.json(),
      expectedChallenge: ceremony.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch {
    return Response.json({ error: "That passkey couldn't be checked. Try again." }, { status: 400 });
  }
  if (!verification.verified) return Response.json({ error: "That passkey couldn't be checked." }, { status: 400 });

  // Adding to an account: the browser still has to be signed in as it.
  if (ceremony.accountId !== null && signedIn(cookies)?.id !== ceremony.accountId) {
    return Response.json({ error: "Signed out in the meantime. Sign in and try again." }, { status: 401 });
  }

  const accountId = ceremony.accountId ?? createAccount(ceremony.handle, ceremony.name).id;
  const { credential, credentialBackedUp, aaguid } = verification.registrationInfo;
  savePasskey(accountId, credential, {
    synced: credentialBackedUp,
    aaguid,
    madeOn: deviceOf(request.headers.get("user-agent")),
  });
  signIn(cookies, accountId);
  return Response.json({ ok: true });
};

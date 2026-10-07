import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { APIRoute } from "astro";
import { createAccount, savePasskey } from "../../../../lib/accounts";
import { getGroup, linkMember } from "../../../../lib/db";
import { changed } from "../../../../lib/events";
import { cookieMember, signIn, signedIn } from "../../../../lib/me";
import { finish, relyingParty } from "../../../../lib/passkeys";

// Step two: check what the device signed, store its public key, and sign
// this browser in. A new account takes over the member it started from.
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

  // The browser still has to be who it was a moment ago.
  if (ceremony.accountId !== null && signedIn(cookies)?.id !== ceremony.accountId) {
    return Response.json({ error: "Signed out in the meantime. Sign in and try again." }, { status: 401 });
  }
  const group = ceremony.groupId ? getGroup(ceremony.groupId) : undefined;
  const member = group ? cookieMember(cookies, group.id) : undefined;
  if (ceremony.accountId === null && (!group || member?.id !== ceremony.memberId)) {
    return Response.json({ error: "Something changed. Reload and try again." }, { status: 409 });
  }

  const accountId = ceremony.accountId ?? createAccount(ceremony.handle, ceremony.name).id;
  const { credential, credentialBackedUp } = verification.registrationInfo;
  savePasskey(accountId, credential, credentialBackedUp);
  if (group && member) {
    linkMember(member, group.id, accountId);
    changed(group.id);
  }
  signIn(cookies, accountId);
  return Response.json({ ok: true });
};

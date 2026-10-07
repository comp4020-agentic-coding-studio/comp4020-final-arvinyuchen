import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { APIRoute } from "astro";
import { listPasskeys, newHandle } from "../../../../lib/accounts";
import { getGroup } from "../../../../lib/db";
import { cookieMember, signedIn } from "../../../../lib/me";
import { begin, relyingParty } from "../../../../lib/passkeys";

// Step one of saving a passkey. Either someone signed in adds another one
// (say, for a laptop on a different ecosystem), or a member who joined by
// name turns themselves into an account. Nobody else gets to make one: an
// account always starts as a person in a group.
export const POST: APIRoute = async ({ cookies, request, url }) => {
  const body = (await request.json().catch(() => ({}))) as { group?: string };
  const account = signedIn(cookies);
  const group = body.group ? getGroup(body.group) : undefined;
  const member = group ? cookieMember(cookies, group.id) : undefined;

  let ceremony;
  if (account) {
    ceremony = { accountId: account.id, handle: account.handle, name: account.name, memberId: null, groupId: null };
  } else if (group && member && member.accountId === null) {
    ceremony = { accountId: null, handle: newHandle(), name: member.name, memberId: member.id, groupId: group.id };
  } else {
    return Response.json({ error: "Join a group first, then save yourself with a passkey." }, { status: 401 });
  }

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

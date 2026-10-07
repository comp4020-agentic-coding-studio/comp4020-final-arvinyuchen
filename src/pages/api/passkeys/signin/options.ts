import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { APIRoute } from "astro";
import { begin, relyingParty } from "../../../../lib/passkeys";

// Step one of signing in. No username: the device offers whichever Spots
// passkeys it holds, and the one chosen says whose account it is.
export const POST: APIRoute = async ({ cookies, url }) => {
  const options = await generateAuthenticationOptions({ rpID: relyingParty(url).rpID, userVerification: "preferred" });
  begin(cookies, { kind: "signin", challenge: options.challenge });
  return Response.json(options);
};

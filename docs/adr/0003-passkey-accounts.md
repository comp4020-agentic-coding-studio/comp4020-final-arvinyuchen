# Accounts, by passkey only

Decided 2026-10-07; first landed in [`de6958e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/de6958e).

**Context.** Group links persist (they're rows in SQLite on the volume), but
who you are in a group was only a cookie in one browser. On a second device,
or after clearing cookies, a friend joined again and became a second person,
with none of their keens. And whoever started a group had no way to look
after it.

**Decision.** Optional accounts whose only credential is a passkey
(WebAuthn, via SimpleWebAuthn): no password, no email, no third-party sign-in.
An account starts from a member already in a group, so joining is still a
link and a name. Passkeys are discoverable, so signing in needs no username;
they sync through iCloud Keychain or Google Password Manager, and a QR code
covers a phone signing in on someone else's laptop. The group's first member
is its owner, with four tools: rename, remove, merge duplicates, reset the
invite link. A reset retires the old link instead of changing the group's
id, so members following an old link are sent to the new one.

**Why not the alternatives.** A magic link by email needs a mail service, a
key and people's email addresses, and lands in spam. "Sign in with Google"
needs app registration, client secrets and a consent screen, and makes
Spots depend on someone else's account.

**Trade-offs.** Passkeys need JavaScript and a device that has them; without
both the buttons don't appear and everything else still works. Lose every
device holding the passkey and the account is gone (the groups aren't); a
second passkey on another device is the only recovery. Real Face ID can't be
driven from the test suite, so `spec/authenticator.ts` is a software
passkey that signs exactly as a device does, and the server's real
verification runs against it.

**Later.** Most of this changed as Spots grew, and the rules in `CLAUDE.md`
are what holds now:

- Accounts stopped being optional: every member is a passkey account, made
  from a name and a passkey when starting or joining a group
  ([`c45908e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/c45908e)).
- A device without your passkey is added with a short code from one signed
  in ([`11b3890`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/11b3890), [#139](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/139)).
- "No email" didn't hold: someone who lost every device had only the
  owner's merge to get back. An email is now asked at sign-up, and only ever
  brings a link that lets a new device make a passkey
  ([`78ff8eb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/commit/78ff8eb), [#195](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/195)).
- With email recovery in place, the owner's merge was a second way back that
  nobody needed, and was taken out ([#222](https://github.com/comp4020-agentic-coding-studio/comp4020-final-arvinyuchen/issues/222)).

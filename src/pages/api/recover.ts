import type { APIRoute } from "astro";
import { accountsByEmail, cleanEmail, EMAIL_CODE_MINUTES, newEmailCode } from "../../lib/accounts";
import { sendMail } from "../../lib/mail";

// Lost every passkey: the email on the account gets a link
// (src/pages/recover.astro). The link is /add-device with a long code, so
// it signs nobody in by itself: the device that opens it makes a passkey
// for the account, and that signs in.
//
// The answer is the same whether or not the email has an account, so
// nobody learns who's here by asking. Asking is limited (a few times per
// email, more per address, which Fly's proxy says; none for this machine
// itself, the spec's), kept in memory: the app is one process.
// The link's origin is APP_ORIGIN (fly.toml), never the request's host:
// a forwarded host can be made up, and the link would go there.
const LIMITS = { email: { n: 3, ms: 15 * 60_000 }, from: { n: 20, ms: 60 * 60_000 } };
const asked = new Map<string, number[]>();

function allowed(key: string, { n, ms }: { n: number; ms: number }): boolean {
  const now = Date.now();
  const times = (asked.get(key) ?? []).filter((t) => now - t < ms);
  if (times.length >= n) return false;
  asked.set(key, [...times, now]);
  return true;
}

const local = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const POST: APIRoute = async ({ request, redirect, url, clientAddress }) => {
  const email = cleanEmail((await request.formData()).get("email"));
  if (!email) return redirect("/recover?error=email", 303);
  const sent = redirect("/recover?sent=1", 303);
  const from = request.headers.get("fly-client-ip") ?? clientAddress;
  if (!allowed(`email:${email}`, LIMITS.email)) return sent;
  if (!local.test(from.replace(/^::ffff:/, "").replace(/^::1$/, "[::1]")) && !allowed(`from:${from}`, LIMITS.from))
    return sent;

  const accounts = accountsByEmail(email);
  if (accounts.length === 0) return sent;
  const origin = process.env.APP_ORIGIN ?? (local.test(url.hostname) ? url.origin : null);
  if (!origin) {
    console.error("recover: set APP_ORIGIN, so the link knows where Spots is");
    return sent;
  }
  const links = accounts.map((a) => ({ name: a.name, link: `${origin}/add-device?code=${newEmailCode(a.id)}` }));
  const one = links.length === 1;
  const intro = one
    ? `Someone, hopefully you, asked to get back into Spots with this email. Open this link on the phone or computer you want to use: it makes a new passkey there for ${links[0].name}.`
    : `Someone, hopefully you, asked to get back into Spots with this email. It has ${links.length} accounts: open the one you want on the phone or computer you want to use, and it makes a new passkey there.`;
  const outro = `It works once, for ${EMAIL_CODE_MINUTES} minutes. Didn't ask? Ignore this email: nobody gets in without the link.`;
  await sendMail({
    to: email,
    subject: "Your link back into Spots",
    text: [intro, ...links.map((l) => (one ? l.link : `${l.name}: ${l.link}`)), outro].join("\n\n"),
    html: [
      `<p>${escape(intro)}</p>`,
      ...links.map(
        (l) =>
          `<p><a href="${escape(l.link)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#0071e3;color:#fff;font-weight:600;text-decoration:none">Make a passkey for ${escape(l.name)}</a></p>`,
      ),
      `<p style="color:#6e6e73">${escape(outro)}</p>`,
    ].join("\n"),
  });
  return sent;
};

// The one email Spots sends: the link that gets someone back in when their
// passkeys are lost (src/pages/api/recover.ts). Sent through Resend from
// MAIL_FROM with RESEND_API_KEY (both Fly secrets, mise.local.toml here).
//
// Without a key, or with OUTING_STUB set (the spec), nothing leaves the
// machine: the mail is kept here (the last 50) and logged, and
// /api/mail-log hands it to the spec while stubbed.

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const outbox: Mail[] = [];
/** What would have been sent, oldest first. */
export const kept = (): Mail[] => [...outbox];

export async function sendMail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || process.env.OUTING_STUB) {
    outbox.push(mail);
    if (outbox.length > 50) outbox.shift();
    console.log(`mail (not sent) to ${mail.to}: ${mail.subject}\n${mail.text}`);
    return true;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM ?? "Spots <spots@example.com>", ...mail, to: [mail.to] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`mail: Resend said ${res.status}: ${await res.text()}`);
    return res.ok;
  } catch (error) {
    console.error("mail: Resend didn't answer", error);
    return false;
  }
}

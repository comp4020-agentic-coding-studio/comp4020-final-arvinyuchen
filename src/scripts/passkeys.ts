import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";

// Passkey buttons: [data-passkey="register"] saves one, [data-passkey="signin"]
// signs in with one. Both talk to /api/passkeys/*; data-group, when there,
// says which group page this is so the member here comes along. Passkeys
// need JavaScript and a device that has them, so the buttons stay hidden
// (data-passkey-only) unless both are true. Joining by name never needs one.

const supported = browserSupportsWebAuthn();
for (const el of document.querySelectorAll<HTMLElement>("[data-passkey-only]")) el.hidden = !supported;

const post = async (path: string, body: unknown) => {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
};

// What a person sees when their device says no, in plain words.
function explain(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return "Cancelled. Nothing was saved.";
  if (name === "InvalidStateError") return "This device already has your Spots passkey.";
  return (error as Error)?.message || "That didn't work. Try again.";
}

async function run(button: HTMLButtonElement) {
  const kind = button.dataset.passkey;
  const group = button.dataset.group;
  const message = button.parentElement?.querySelector<HTMLElement>(".passkey-msg");
  const say = (text: string) => {
    if (message) message.textContent = text;
  };
  button.disabled = true;
  say("");
  try {
    if (kind === "register") {
      const optionsJSON = await post("/api/passkeys/register/options", { group });
      const response = await startRegistration({ optionsJSON });
      await post("/api/passkeys/register/verify", response);
      say("Saved. You can sign in on any device now.");
      window.location.reload();
    } else {
      const optionsJSON = await post("/api/passkeys/signin/options", {});
      const response = await startAuthentication({ optionsJSON });
      await post("/api/passkeys/signin/verify", { response, group });
      // From a group page, stay there (now as yourself); otherwise, your groups.
      if (group) window.location.reload();
      else window.location.assign(button.dataset.next ?? "/me");
    }
  } catch (error) {
    say(explain(error));
  } finally {
    button.disabled = false;
  }
}

document.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-passkey]");
  if (button) run(button);
});

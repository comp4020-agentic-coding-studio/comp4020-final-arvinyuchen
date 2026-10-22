import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

// Everyone in Spots is an account: a name and a passkey. This drives the
// passkey steps, all through /api/passkeys/*:
//
// - <form data-account="new">: sending it first makes the account, from the
//   form's name field and a new passkey, then sends the form for real (start
//   a group, join one); with data-then, it goes there instead.
// - [data-passkey="signin"]: signs in with a passkey this device has (or a
//   phone's, by QR code), then goes to data-then: a page, "reload", or a
//   form's #id to send (join, once you're you).
// - [data-passkey="register"]: adds a passkey to the signed-in account.
//
// Whether they show at all is decided in the page's head (Base.astro):
// where passkeys can't work, src/components/NoPasskey.astro shows instead,
// and its Copy link button is wired here.

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
  if (name === "SecurityError" || name === "NotSupportedError")
    return "This browser can't make a passkey here. Open the page in Safari or Chrome.";
  return (error as Error)?.message || "That didn't work. Try again.";
}

/** Where to go once signed in: a page, a reload, or a form to send. */
function then(where: string | undefined) {
  if (where?.startsWith("#")) {
    document.querySelector<HTMLFormElement>(where)?.submit();
    return;
  }
  const url = new URL(!where || where === "reload" ? location.href : where, location.href);
  // (only the hash differs: assigning wouldn't load it again)
  if (url.pathname + url.search === location.pathname + location.search) {
    history.replaceState(null, "", url);
    location.reload();
  } else location.assign(url);
}

const register = async (name?: string) => {
  const optionsJSON = await post("/api/passkeys/register/options", { name });
  await post("/api/passkeys/register/verify", await startRegistration({ optionsJSON }));
};

const signIn = async () => {
  const optionsJSON = await post("/api/passkeys/signin/options", {});
  await post("/api/passkeys/signin/verify", { response: await startAuthentication({ optionsJSON }) });
};

async function busy(el: HTMLElement, button: HTMLButtonElement | null, task: () => Promise<void>) {
  const message =
    el.closest("form")?.querySelector<HTMLElement>(".passkey-msg") ??
    el.parentElement?.querySelector<HTMLElement>(".passkey-msg");
  if (message) message.textContent = "";
  if (button) button.disabled = true;
  try {
    await task();
  } catch (error) {
    if (message) message.textContent = explain(error);
    if (button) button.disabled = false;
  }
}

document.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-passkey]");
  if (!button) return;
  busy(button, button, async () => {
    if (button.dataset.passkey === "register") {
      await register();
      then("reload");
    } else {
      await signIn();
      then(button.dataset.then);
    }
  });
});

document.addEventListener("submit", (event) => {
  const form = event.target as HTMLFormElement;
  if (form.dataset.account !== "new") return;
  event.preventDefault();
  const name = form.querySelector<HTMLInputElement>("input[name=name]")?.value.trim();
  busy(form, form.querySelector("button:not([type=button])"), async () => {
    await register(name);
    // (the form's own fields, like the group's name, go as they are)
    if (form.dataset.then) then(form.dataset.then);
    else form.submit();
  });
});

// Without passkeys here: copy the page's link, to open it somewhere that has them.
for (const copy of document.querySelectorAll<HTMLElement>("[data-copy-page]")) {
  if (!navigator.clipboard) continue;
  copy.hidden = false;
  copy.querySelector("button")?.addEventListener("click", async () => {
    const said = copy.querySelector(".passkey-msg");
    try {
      await navigator.clipboard.writeText(location.href);
      if (said) said.textContent = "Copied. Paste it into Safari or Chrome.";
    } catch {
      if (said) said.textContent = location.href;
    }
  });
}

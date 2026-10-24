// Talk on the group's page (src/components/TalkSheet.astro): a place's
// thread opens in place, from the bubble on its row. On a phone (and a
// tablet) it's a sheet over Our list, sized to what the keyboard leaves of
// the screen; on a wide screen it takes Explore's column while it's open,
// and the map flies to the place, so the list and the map stay in view.
// Sending, deleting and Undo post in the background (x-spots: in-page),
// so the stream stays open and what you're typing stays where it is: a
// refresh swaps only the thread, never the box. Without this script, the
// bubble is a link to ?talk=<place> and the forms post and come back.

const sheet = document.querySelector<HTMLDialogElement>("dialog[data-talk-sheet]");
if (sheet) talk(sheet);

function talk(sheet: HTMLDialogElement) {
  const api = `/api/groups/${sheet.dataset.group}`;
  const scroll = sheet.querySelector<HTMLElement>("[data-talk-scroll]")!;
  const compose = sheet.querySelector<HTMLFormElement>("[data-talk-send]")!;
  const box = compose.querySelector<HTMLTextAreaElement>("textarea")!;
  const placeField = compose.querySelector<HTMLInputElement>("input[name=place]")!;
  const nonceField = compose.querySelector<HTMLInputElement>("input[name=nonce]")!;
  const left = compose.querySelector<HTMLElement>(".talk__left")!;
  const title = sheet.querySelector<HTMLElement>("#talk-title")!;
  const toast = sheet.querySelector<HTMLElement>(".talk__toast")!;
  const wide = matchMedia("(min-width: 1180px)");
  const finePointer = matchMedia("(pointer: fine)");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const home = sheet.parentElement!;
  const max = Number(box.maxLength) || 500;
  // (what you'd typed for each place, kept while you look at another)
  const drafts = new Map<string, string>();
  const place = () => sheet.dataset.place ?? "";
  const inColumn = () => wide.matches && document.querySelector(".group-page.is-tabbed") !== null;

  // ---- the thread ------------------------------------------------------------

  let loading: Promise<void> | null = null;
  let again = false;
  /** Reads the thread again: the newest, or all from the oldest already shown. */
  async function load(from?: string) {
    if (loading) {
      again = true;
      return loading;
    }
    const id = place();
    loading = (async () => {
      try {
        const oldest = from ?? scroll.querySelector<HTMLElement>(".talk__thread")?.dataset.first;
        const sameThread = scroll.querySelector<HTMLElement>(".talk__thread")?.dataset.thread === id;
        const query = new URLSearchParams({ place: id });
        if (oldest && (sameThread || from)) query.set("from", oldest);
        const res = await fetch(`${api}/thread?${query}`, { cache: "no-store" });
        if (place() !== id) return;
        if (res.status === 404) {
          scroll.innerHTML = `<p class="talk__empty">This place isn't on the list now, so its Talk is put away.</p>`;
          compose.hidden = true;
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        compose.hidden = false;
        const fresh = new DOMParser().parseFromString(await res.text(), "text/html").querySelector(".talk__thread");
        if (!fresh) return;
        // (the menus open in it stay open)
        const open = [...scroll.querySelectorAll<HTMLElement>(".msg:has(.msg__more[open])")].map((m) => m.dataset.msg);
        scroll.replaceChildren(fresh);
        for (const msg of open) scroll.querySelector(`.msg[data-msg="${msg}"] .msg__more`)?.setAttribute("open", "");
      } finally {
        loading = null;
      }
      if (again) {
        again = false;
        await load();
      }
    })();
    return loading;
  }

  // ---- opening and closing ---------------------------------------------------

  // On a phone the keyboard covers the foot of the screen, and Safari
  // doesn't shrink a fixed sheet for it: so the sheet takes the height of
  // what's left (the visual viewport), and the box stays above the keys.
  const viewport = window.visualViewport;
  function fit() {
    if (!viewport || !sheet.open || inColumn()) return;
    const keyboard = window.innerHeight - viewport.height > 120;
    sheet.style.setProperty("--talk-top", `${viewport.offsetTop}px`);
    sheet.style.setProperty("--talk-h", `${viewport.height}px`);
    sheet.classList.toggle("is-typing", keyboard);
  }
  viewport?.addEventListener("resize", fit);
  viewport?.addEventListener("scroll", fit);

  // (closing it only to open it again the other way isn't closing it)
  let quiet = 0;
  function shut() {
    if (!sheet.open) return;
    quiet++;
    sheet.close();
  }
  function placeIt() {
    if (inColumn()) {
      // (Explore's column, beside the list: Explore must be the tab beside it)
      const wrap = document.querySelector<HTMLElement>(".explore-wrap");
      if (wrap?.hidden) document.querySelector<HTMLAnchorElement>('.tabs a[data-tab="explore"]')?.click();
      if (sheet.matches(":modal")) shut();
      if (wrap && sheet.parentElement !== wrap) wrap.prepend(sheet);
      if (!sheet.open) sheet.show();
      sheet.classList.add("is-column");
    } else {
      sheet.classList.remove("is-column");
      if (sheet.parentElement !== home) {
        shut();
        home.append(sheet);
      }
      if (sheet.open && !sheet.matches(":modal")) shut();
      if (!sheet.open) sheet.showModal();
      fit();
    }
  }

  async function open(id: string, name: string) {
    if (place() && place() !== id) drafts.set(place(), box.value);
    const switching = place() !== id;
    sheet.dataset.place = id;
    placeField.value = id;
    title.textContent = name;
    hideToast();
    if (switching) {
      box.value = drafts.get(id) ?? "";
      grow();
      scroll.innerHTML = "";
      compose.hidden = false;
    }
    placeIt();
    if (inColumn()) document.dispatchEvent(new CustomEvent("spots:fly", { detail: Number(id) }));
    // (the address says which, so a reload opens it again)
    const url = new URL(location.href);
    url.searchParams.set("talk", id);
    url.searchParams.delete("before");
    url.searchParams.delete("error");
    history.replaceState(null, "", url.pathname + url.search + "#talk");
    if (finePointer.matches) box.focus({ preventScroll: true });
    else sheet.focus();
    await load();
    // (it's read now: the row and the tab catch up)
    document.dispatchEvent(new Event("spots:refresh"));
  }

  function close() {
    if (sheet.open) sheet.close();
  }
  sheet.addEventListener("close", () => {
    if (quiet > 0) {
      quiet--;
      return;
    }
    if (place()) drafts.set(place(), box.value);
    sheet.classList.remove("is-column", "is-typing");
    if (sheet.parentElement !== home) home.append(sheet);
    const url = new URL(location.href);
    for (const key of ["talk", "before", "error"]) url.searchParams.delete(key);
    history.replaceState(null, "", url.pathname + url.search + (url.hash === "#talk" ? "#list" : url.hash));
    document.dispatchEvent(new Event("spots:refresh"));
  });
  // (open from the server, ?talk=: the same sheet, in its place)
  if (sheet.open && place()) {
    placeField.value = place();
    placeIt();
    if (inColumn()) document.dispatchEvent(new CustomEvent("spots:fly", { detail: Number(place()) }));
  }
  wide.addEventListener("change", () => {
    if (sheet.open) placeIt();
  });

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const opener = target.closest<HTMLAnchorElement>("[data-talk-open]");
    if (opener && !(event as MouseEvent).metaKey && !(event as MouseEvent).ctrlKey && !(event as MouseEvent).shiftKey) {
      event.preventDefault();
      open(opener.dataset.talkOpen!, opener.dataset.talkName ?? "");
      return;
    }
    // (in the column, another tab beside the list puts it away)
    if (target.closest(".tabs a[data-tab]") && sheet.classList.contains("is-column")) {
      close();
      return;
    }
    if (target.closest("[data-talk-close]")) {
      event.preventDefault();
      close();
      return;
    }
    // Earlier messages: the page before the oldest shown, then all from there
    const earlier = target.closest<HTMLAnchorElement>("[data-talk-earlier]");
    if (earlier) {
      event.preventDefault();
      earlier.setAttribute("aria-busy", "true");
      fetch(`${api}/thread?${new URLSearchParams({ place: place(), before: earlier.dataset.talkEarlier! })}`, { cache: "no-store" })
        .then((res) => res.text())
        .then((html) => {
          const first = new DOMParser().parseFromString(html, "text/html").querySelector<HTMLElement>(".talk__thread")?.dataset.first;
          return load(first);
        })
        .catch(() => (location.href = earlier.href));
      return;
    }
    // (a click outside an open ··· menu closes it)
    for (const menu of sheet.querySelectorAll<HTMLDetailsElement>(".msg__more[open]")) if (!menu.contains(target)) menu.open = false;
  });
  // (in the column, Escape closes it as it does the sheet)
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !sheet.open || sheet.matches(":modal")) return;
    const menu = sheet.querySelector<HTMLDetailsElement>(".msg__more[open]");
    if (menu) menu.open = false;
    else close();
  });

  // ---- live ------------------------------------------------------------------

  // The stream says which thread changed (src/pages/g/[link].astro): read it
  // if it's the one open, then the page (its counts) catches up.
  document.addEventListener("spots:talk", async (event) => {
    const changed = (event as CustomEvent<{ place: number | null }>).detail.place;
    if (sheet.open && (changed === null || String(changed) === place())) await load().catch(() => {});
    if (changed !== null) document.dispatchEvent(new Event("spots:refresh"));
  });

  // ---- the box -----------------------------------------------------------------

  function grow() {
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 8 * 22)}px`;
    const rest = max - box.value.length;
    left.hidden = rest > 60;
    left.textContent = rest === 1 ? "1 character left" : `${rest} characters left`;
  }
  box.addEventListener("input", grow);
  // (on a keyboard, Return sends and Shift-Return starts a line; on a phone, the button sends)
  box.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && finePointer.matches) {
      event.preventDefault();
      compose.requestSubmit();
    }
  });
  const newNonce = () => (nonceField.value = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  newNonce();

  // ---- sending, deleting, Undo --------------------------------------------------

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function hideToast() {
    clearTimeout(toastTimer);
    toast.hidden = true;
  }
  function say(text: string, undo?: () => void) {
    clearTimeout(toastTimer);
    toast.querySelector(".talk__toast-text")!.textContent = text;
    const button = toast.querySelector<HTMLButtonElement>(".talk__toast-undo")!;
    button.hidden = !undo;
    button.onclick = undo
      ? () => {
          hideToast();
          undo();
        }
      : null;
    toast.hidden = false;
    toastTimer = setTimeout(hideToast, 6000);
  }
  const WHY: Record<string, string> = {
    long: `That's more than ${max} characters. Say it shorter, or in two.`,
    slow: "That's a lot at once. Wait a minute, then send it again.",
    empty: "Write something first.",
    gone: "This place isn't on the list now, so its Talk is put away.",
    "not-yours": "That one has changed meanwhile.",
  };
  const post = (body: FormData) => fetch(`${api}/talk`, { method: "POST", body, headers: { "x-spots": "in-page" } });

  document.addEventListener("submit", async (event) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>("form[data-talk]");
    if (!form) return;
    event.preventDefault();
    if (form.dataset.sending) return;
    if (form === compose && !box.value.trim()) return;
    const body = new FormData(form);
    form.dataset.sending = "true";
    try {
      const res = await post(body);
      if (res.status === 409) {
        say(WHY[res.headers.get("x-spots-error") ?? ""] ?? WHY["not-yours"]);
        await load();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      if (form === compose) {
        box.value = "";
        drafts.delete(place());
        newNonce();
        grow();
        await load();
        scroll.scrollTo({ top: 0 });
        return;
      }
      await load();
      if (form.matches("[data-talk-delete]")) {
        const message = body.get("message");
        say("Message removed.", async () => {
          const undo = new FormData();
          undo.set("action", "undo");
          undo.set("place", place());
          undo.set("message", String(message));
          await post(undo);
          await load();
        });
      }
    } catch {
      form.submit();
    } finally {
      delete form.dataset.sending;
    }
  });

  // A long press on your own message opens its menu, as on a phone's
  // Messages: the ··· beside it does the same for a click or a key.
  let press: ReturnType<typeof setTimeout> | undefined;
  let pressedAt: { x: number; y: number } | null = null;
  scroll.addEventListener("pointerdown", (event) => {
    const bubble = (event.target as HTMLElement).closest(".msg--mine .msg__bubble");
    if (!bubble || event.button !== 0) return;
    pressedAt = { x: event.clientX, y: event.clientY };
    press = setTimeout(() => {
      const menu = bubble.closest(".msg")?.querySelector<HTMLDetailsElement>(".msg__more");
      if (!menu) return;
      menu.open = true;
      menu.querySelector("button")?.focus({ preventScroll: true });
      if (!still.matches) navigator.vibrate?.(10);
    }, 450);
  });
  const cancelPress = () => clearTimeout(press);
  scroll.addEventListener("pointerup", cancelPress);
  scroll.addEventListener("pointercancel", cancelPress);
  scroll.addEventListener("pointermove", (event) => {
    if (pressedAt && Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > 8) cancelPress();
  });
  // (the long press is ours, not the browser's menu)
  scroll.addEventListener("contextmenu", (event) => {
    if ((event.target as HTMLElement).closest(".msg--mine .msg__bubble") && !finePointer.matches) event.preventDefault();
  });
}

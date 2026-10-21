// The invite page. Its name field: the face beside it is the one you'll have in
// the group (the same initial and colour as src/pages/g/[link].astro gives
// every member), so it fills in as you type your name.

const hue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.codePointAt(0)!) % 360, 17);

const input = document.querySelector<HTMLInputElement>("#join-name");
const face = document.querySelector<HTMLElement>(".welcome__you");

if (input && face) {
  input.addEventListener("input", () => {
    const name = input.value.trim();
    const initial = [...name][0]?.toUpperCase() ?? "";
    if (initial === face.textContent?.trim()) return;
    face.textContent = initial;
    if (name) face.style.setProperty("--hue", String(hue(name)));
    // Each new initial pops in again.
    face.classList.remove("is-new");
    void face.offsetWidth;
    face.classList.toggle("is-new", initial !== "");
  });
}

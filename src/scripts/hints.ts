// A field left empty (or otherwise not right) says so under itself, in a
// line of the page's own type, instead of the browser's bubble: its
// data-hint if it has one ("Give the group a name."), else plainly. The
// field's ring turns red; typing in it takes both away. On every page
// (src/layouts/Base.astro); without the script it's the browser's bubble.

const said = (field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
  const v = field.validity;
  if (field.dataset.hint && (v.valueMissing || v.patternMismatch)) return field.dataset.hint;
  if (v.valueMissing) return "Fill this in.";
  if (v.tooLong) return `That's a bit long: ${field.getAttribute("maxlength")} letters at most.`;
  if (v.rangeUnderflow || v.rangeOverflow) return "That's outside the times it can be.";
  return field.validationMessage;
};

// (under the field: under its list's card when it's a row of one, inside
// its label when it has one, or under the row it sits in)
const anchor = (field: HTMLElement) =>
  field.closest<HTMLElement>(".list") ?? field.closest<HTMLElement>("label, .welcome__field, .finder__row") ?? field;

const clear = (field: HTMLElement) => {
  field.classList.remove("is-invalid");
  field.removeAttribute("aria-invalid");
  const a = anchor(field);
  const hint = a.tagName === "LABEL" ? a.querySelector(".hint") : a.nextElementSibling?.classList.contains("hint") ? a.nextElementSibling : null;
  hint?.remove();
};

let focused: HTMLFormElement | null = null;
document.addEventListener(
  "invalid",
  (event) => {
    const field = event.target as HTMLInputElement;
    if (field.type === "radio" || field.type === "checkbox" || field.type === "hidden") return;
    event.preventDefault();
    clear(field);
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.setAttribute("role", "alert");
    hint.textContent = said(field);
    const a = anchor(field);
    if (a.tagName === "LABEL") a.append(hint);
    else a.after(hint);
    field.classList.add("is-invalid");
    field.setAttribute("aria-invalid", "true");
    // (the first one in the form gets the cursor, once per try)
    if (field.form && focused !== field.form) {
      focused = field.form;
      field.focus();
      setTimeout(() => (focused = null));
    }
  },
  true,
);

document.addEventListener("input", (event) => {
  const field = event.target as HTMLElement;
  if (field.classList?.contains("is-invalid")) clear(field);
});

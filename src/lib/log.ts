// Who did what: one line per action on standard output (`log.act`), which is what
// `flyctl logs` shows, so someone watching the logs can say who joined,
// voted, shared or was taken out, and when.
//
//   spots keen by="Mia (m311)" group="Saturday crew (k3x9a2)" pick=12 keen=on
//
// A line says the act, who did it, where, and the ids of what it touched.
// Never what anyone said, their email, their busy times, a search prompt,
// a code, a token or a passkey: a line counts those, at most. The last
// lines are also kept here, and /api/log-tail hands them to the spec while
// stubbed (OUTING_STUB), so it can check what's written and what never is.

type Field = string | number | boolean | null | undefined;

const kept: string[] = [];
/** The last 500 lines, oldest first. */
export const logged = (): string[] => [...kept];

const value = (v: string | number | boolean) =>
  typeof v === "string" && (v === "" || /[\s"=]/.test(v)) ? JSON.stringify(v) : String(v);

export function act(name: string, fields: Record<string, Field> = {}): void {
  const parts = Object.entries(fields)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== null)
    .map(([key, v]) => `${key}=${value(v)}`);
  const line = ["spots", name, ...parts].join(" ");
  console.log(line);
  kept.push(line);
  if (kept.length > 500) kept.shift();
}

/** A member or an account, as a line names them: "Mia (m311)" or "Mia (a42)". */
export const member = (m: { id: number; name: string }) => `${m.name} (m${m.id})`;
export const account = (a: { id: number; name: string }) => `${a.name} (a${a.id})`;
/** A group, as a line names it: "Saturday crew (k3x9a2)". */
export const group = (g: { id: string; name: string }) => `${g.name} (${g.id})`;

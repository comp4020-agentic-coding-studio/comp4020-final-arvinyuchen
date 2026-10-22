// OpenStreetMap's Nominatim, asked politely: an identifying User-Agent, at
// most one request a second (spaced out here, across every caller), and
// only when someone presses a button for it, never as they type.
const BASE = "https://nominatim.openstreetmap.org";
export const USER_AGENT = "Spots/1.0 (https://comp4020-final-arvinyuchen.fly.dev; COMP4020 student project)";
let last = 0;

export async function nominatim<T>(path: "search" | "lookup", params: Record<string, string>): Promise<T> {
  const wait = last + 1100 - Date.now();
  last = Date.now() + Math.max(0, wait);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  const res = await fetch(`${BASE}/${path}?${new URLSearchParams({ format: "jsonv2", ...params })}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  return (await res.json()) as T;
}

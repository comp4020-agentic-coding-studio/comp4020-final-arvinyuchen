import type { Jar } from "./authenticator";
import { baseUrl } from "./browser";

// An open page's stream, as the spec hears it: when each "change" arrived.
// `next(after, ms)` waits for the first change heard after `after`
// (performance.now()), and says when it came, or throws once `ms` pass.
export async function listen(jar: Jar, groupId: string) {
  const controller = new AbortController();
  const res = await fetch(new URL(`/api/events?group=${groupId}`, baseUrl), {
    headers: { cookie: jar.header },
    signal: controller.signal,
  });
  if (res.status !== 200) throw new Error(`stream answered ${res.status}`);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const changes: number[] = [];
  const waiting = new Set<() => void>();
  let buffer = "";
  let connected!: () => void;
  const ready = new Promise<void>((resolve) => (connected = resolve));
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const event = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (event.startsWith(": connected")) connected();
          if (event.startsWith("event: change")) {
            changes.push(performance.now());
            for (const wake of waiting) wake();
          }
        }
      }
    } catch {
      // (closed by stop())
    }
  })();
  await ready;
  return {
    changes,
    next(after: number, ms = 5000): Promise<number> {
      return new Promise((resolve, reject) => {
        const check = () => {
          const at = changes.find((t) => t > after);
          if (at === undefined) return false;
          waiting.delete(check);
          clearTimeout(timer);
          resolve(at);
          return true;
        };
        const timer = setTimeout(() => {
          waiting.delete(check);
          reject(new Error(`no change heard within ${ms} ms`));
        }, ms);
        if (!check()) waiting.add(check);
      });
    },
    stop: () => controller.abort(),
  };
}

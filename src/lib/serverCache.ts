// Tiny in-memory cache for slow upstream reads (Google Sheets CSV, the
// Retention Apps Script). Lives per serverless instance: a warm instance
// answers from memory, a cold one just fetches like before. Concurrent
// callers share a single in-flight request instead of each hitting Google.

type Entry<T> = { value?: T; expires: number; inflight?: Promise<T> };

const store = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as Entry<T> | undefined;
  if (entry?.value !== undefined && entry.expires > now) return entry.value;
  if (entry?.inflight) return entry.inflight;

  const inflight = loader()
    .then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .catch((err) => {
      store.delete(key);
      throw err;
    });
  store.set(key, { value: entry?.value, expires: 0, inflight });
  return inflight;
}

export function invalidate(key: string): void {
  store.delete(key);
}

// Browser-side memory of the last response per API URL, so switching
// between screens shows the previous data instantly while a fresh copy
// loads in the background (instead of a blank "loading" every time).

const store = new Map<string, unknown>();

export function getCachedBody<T>(url: string): T | undefined {
  return store.get(url) as T | undefined;
}

export function setCachedBody(url: string, body: unknown): void {
  store.set(url, body);
}

export function patchCachedBodies<T>(prefix: string, patch: (body: T) => T): void {
  for (const [url, body] of store) {
    if (url.startsWith(prefix)) store.set(url, patch(body as T));
  }
}

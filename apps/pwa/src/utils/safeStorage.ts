/**
 * localStorage access that cannot crash the app. In sandboxed embeds (VS Code
 * Simple Browser, some webviews) localStorage access throws SecurityError;
 * several of our reads happen at module init or first render, where an
 * uncaught throw blanks the entire UI. These wrappers degrade to in-memory
 * behaviour instead.
 */

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* unavailable — value lives only in memory this session */
  }
}

export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* unavailable */
  }
}

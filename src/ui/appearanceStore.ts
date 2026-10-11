const KEY = 'ava.appearance';

/** Read synchronously at start-up, before any screen or style exists. */
export function readRaw(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeRaw(value: string): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Private windows can refuse storage: the app keeps its current look.
  }
}

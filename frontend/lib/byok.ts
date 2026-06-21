'use client';

// Bring-Your-Own-Key (BYOK) storage.
//
// The user's own OpenRouter API key is kept ONLY in this browser (localStorage)
// and sent with each scan request over HTTPS. The backend uses it for that one
// request and never persists it — consistent with the product's "we store
// nothing" guarantee. This means no third-party secret ever lands in our DB.

const KEY = 'xenlens-byok';

export function getByokKey(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setByokKey(value: string): void {
  try {
    const trimmed = value.trim();
    if (trimmed) localStorage.setItem(KEY, trimmed);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function clearByokKey(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Light shape check so we don't send obviously-wrong values. */
export function looksLikeOpenRouterKey(value: string): boolean {
  return /^sk-or-[A-Za-z0-9._-]{8,}$/.test(value.trim());
}

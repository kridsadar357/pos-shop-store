// Runtime-resolved API base so the POS can run as a desktop / LAN client pointing at any
// server (set via the server-connection setup), not just the same-origin or build-time URL.
// Priority: Electron-injected global → user-configured (localStorage) → build-time env → same-origin.
const API_BASE_KEY = 'pos_api_base';
const normalizeBase = (u: string) => u.trim().replace(/\/+$/, '');

export function apiBase(): string {
  const injected = typeof window !== 'undefined' ? (window as unknown as { __POS_API_BASE__?: string }).__POS_API_BASE__ : undefined;
  if (injected) return normalizeBase(injected);
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(API_BASE_KEY) : null;
  if (stored) return normalizeBase(stored);
  return normalizeBase(import.meta.env.VITE_API_URL || '');
}
/** The configured server URL (empty = same-origin). For the connection-setup UI. */
export function getApiBase(): string {
  const injected = typeof window !== 'undefined' ? (window as unknown as { __POS_API_BASE__?: string }).__POS_API_BASE__ : undefined;
  return injected ? normalizeBase(injected) : (localStorage.getItem(API_BASE_KEY) || '');
}
/** Persist the server URL (empty clears it → same-origin). */
export function setApiBase(url: string) {
  const v = normalizeBase(url);
  if (v) localStorage.setItem(API_BASE_KEY, v);
  else localStorage.removeItem(API_BASE_KEY);
}

/** True when running inside the desktop shell (Tauri webview, or an injected flag). */
export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return !!(w.__TAURI_INTERNALS__ || w.__TAURI__ || w.__POS_DESKTOP__);
}

/** Resolve a server-relative path (e.g. an /uploads/… image) to a fetchable URL. */
export function resolveUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${apiBase()}${path.startsWith('/') ? '' : '/'}${path}`;
}

let authToken: string | null = localStorage.getItem('pos_token');
let onUnauthorized: (() => void) | null = null;

export function setToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem('pos_token', token);
  else localStorage.removeItem('pos_token');
}

export function setOnUnauthorized(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, unknown> } = {}
): Promise<T> {
  const { method = 'GET', body, query } = options;
  let url = `${apiBase()}/api${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error('Unauthorized');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

/** Upload a file via multipart/form-data (lets the browser set the boundary). */
export async function uploadFile<T = unknown>(path: string, field: string, file: File): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  const res = await fetch(`${apiBase()}/api${path}`, {
    method: 'POST',
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    body: form,
  });
  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error('Unauthorized');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error((data as { error?: string })?.error || `Upload failed (${res.status})`);
  return data as T;
}

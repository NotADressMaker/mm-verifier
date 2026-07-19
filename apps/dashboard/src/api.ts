const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

function headers(json = false): HeadersInit {
  const token = import.meta.env.VITE_AUTH_TOKEN;
  return { ...(json ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) };
}

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers: headers(true), body: JSON.stringify(body) });
  const data = await res.json() as T & { errors?: Array<{ message?: string }>; error?: string };
  if (!res.ok) throw new Error(data.errors?.map(error => error.message).join(', ') || data.error || `Request failed: ${res.status}`);
  return data;
}

export async function requestJson<T>(path: string, method: 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { method, headers: headers(body !== undefined), body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return undefined as T;
  const data = await res.json() as T & { errors?: Array<{ message?: string }>; error?: string };
  if (!res.ok) throw new Error(data.errors?.map(error => error.message).join(', ') || data.error || `Request failed: ${res.status}`);
  return data;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

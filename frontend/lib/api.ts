'use client';
import useSWR, { type SWRConfiguration } from 'swr';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (Array.isArray(j.issues) && j.issues.length) return j.issues.map((i: { path: string; message: string }) => (i.path ? `${i.path}: ` : '') + i.message).join('; ');
    return Array.isArray(j.message) ? j.message.join('; ') : j.message || res.statusText;
  } catch {
    return res.statusText || 'Something went wrong';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && !path.startsWith('auth/')) {
    window.location.href = '/login';
    throw new ApiError('Session expired', 401);
  }
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(p: string) => request<T>('GET', p),
  post: <T,>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  put: <T,>(p: string, b?: unknown) => request<T>('PUT', p, b ?? {}),
  patch: <T,>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {}),
  delete: <T,>(p: string, b?: unknown) => request<T>('DELETE', p, b)
};

export function useApi<T>(path: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(path, (p: string) => api.get<T>(p), { revalidateOnFocus: true, ...config });
}

export function useMe() {
  return useApi<import('./types').Me>('auth/me');
}

'use client';
import { useApi } from '@/lib/api';

/** Whether the server has an AI key. When it doesn't, the helpers explain that instead of failing. */
export function useAiAvailable() {
  const { data } = useApi<{ available: boolean }>('setup-ai/status', { revalidateOnFocus: false });
  return { available: data?.available ?? true, loaded: !!data };
}

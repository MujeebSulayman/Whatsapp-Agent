import { describe, expect, it } from 'vitest';
import { createOpenRouterClient, pickModel } from './index.js';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('openrouter client', () => {
  it('sends the key, tools and parses usage + cost', async () => {
    let seen: { headers: Record<string, string>; body: { model: string; tools?: unknown[] } } | undefined;
    const client = createOpenRouterClient({
      apiKey: 'k',
      fetchImpl: (async (_u: string, init: RequestInit) => {
        seen = { headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
        return ok({ choices: [{ message: { role: 'assistant', content: 'hi' } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0002 } });
      }) as unknown as typeof fetch
    });
    const r = await client.chat({ model: 'm', messages: [{ role: 'user', content: 'x' }], tools: [{ type: 'function', function: { name: 't', description: 'd', parameters: {} } }] });
    expect(seen?.headers.Authorization).toBe('Bearer k');
    expect(seen?.body.tools).toHaveLength(1);
    expect(r.message.content).toBe('hi');
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 5, costUsd: 0.0002 });
  });

  it('retries 5xx then succeeds, but not on 4xx', async () => {
    let calls = 0;
    const flaky = createOpenRouterClient({
      apiKey: 'k',
      fetchImpl: (async () => (++calls < 2 ? new Response('x', { status: 503 }) : ok({ choices: [{ message: { content: 'ok' } }] }))) as unknown as typeof fetch
    });
    expect((await flaky.chat({ model: 'm', messages: [] })).message.content).toBe('ok');
    expect(calls).toBe(2);

    let c2 = 0;
    const bad = createOpenRouterClient({ apiKey: 'k', fetchImpl: (async () => (c2++, new Response('nope', { status: 401 }))) as unknown as typeof fetch });
    await expect(bad.chat({ model: 'm', messages: [] })).rejects.toThrow(/401/);
    expect(c2).toBe(1);
  });
});

describe('pickModel', () => {
  const cfg = { fast: 'f', smart: 's' };
  it('uses the cheap model for greetings only', () => {
    expect(pickModel(cfg, { lastMessage: 'Hello!', hasOpenOrder: false })).toBe('f');
    expect(pickModel(cfg, { lastMessage: 'I want party pack', hasOpenOrder: false })).toBe('s');
    expect(pickModel(cfg, { lastMessage: 'ok', hasOpenOrder: true })).toBe('s');
  });
});

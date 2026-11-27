import { describe, expect, it } from 'vitest';
import { createOpenRouterClient, createOpenRouterEmbedder, extractJson, pickModel } from './index.js';

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

describe('embedder', () => {
  const vec = (n: number) => Array.from({ length: 1536 }, (_, i) => (i === n ? 1 : 0));
  it('returns vectors in input order and rejects wrong dimensions', async () => {
    const good = createOpenRouterEmbedder({ apiKey: 'k', model: 'm', fetchImpl: (async () => ok({ data: [{ index: 1, embedding: vec(1) }, { index: 0, embedding: vec(0) }] })) as unknown as typeof fetch });
    const out = await good.embed(['a', 'b']);
    expect([out[0]![0], out[1]![1]]).toEqual([1, 1]);
    const bad = createOpenRouterEmbedder({ apiKey: 'k', model: 'm', fetchImpl: (async () => ok({ data: [{ index: 0, embedding: [1, 2, 3] }] })) as unknown as typeof fetch });
    await expect(bad.embed(['a'])).rejects.toThrow(/1536/);
  });
});

describe('json + images', () => {
  it('asks for JSON mode and passes image parts through untouched', async () => {
    let body: { response_format?: unknown; messages: { content: unknown }[] } | undefined;
    const client = createOpenRouterClient({ apiKey: 'k', fetchImpl: (async (_u: string, init: RequestInit) => { body = JSON.parse(init.body as string); return ok({ choices: [{ message: { content: '{"a":1}' } }] }); }) as unknown as typeof fetch });
    await client.chat({ model: 'm', json: true, messages: [{ role: 'user', content: [{ type: 'text', text: 'read this' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }] });
    expect(body?.response_format).toEqual({ type: 'json_object' });
    expect(JSON.stringify(body?.messages[0]?.content)).toContain('data:image/png;base64,AAAA');
  });
  it('extracts JSON from fenced or chatty replies and returns null otherwise', () => {
    expect(extractJson('{"x":1}')).toEqual({ x: 1 });
    expect(extractJson('Sure!\n```json\n{"x":[1,2]}\n```\nHope that helps')).toEqual({ x: [1, 2] });
    expect(extractJson('here you go: {"x": 2} thanks')).toEqual({ x: 2 });
    expect(extractJson('no json here')).toBeNull();
    expect(extractJson('{broken')).toBeNull();
    expect(extractJson(null)).toBeNull();
  });
});

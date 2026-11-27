export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type ToolDef = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ChatResult = {
  message: ChatMessage;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
};

export interface LlmClient {
  chat(req: { model: string; messages: ChatMessage[]; tools?: ToolDef[]; temperature?: number }): Promise<ChatResult>;
}

export interface OpenRouterOptions {
  apiKey: string;
  baseUrl?: string;
  /** Shown on openrouter.ai rankings; optional. */
  appTitle?: string;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** OpenRouter speaks the OpenAI chat-completions + tool-calling protocol. */
export function createOpenRouterClient(opts: OpenRouterOptions): LlmClient {
  const base = opts.baseUrl ?? 'https://openrouter.ai/api/v1';
  const doFetch = opts.fetchImpl ?? fetch;
  const maxAttempts = opts.maxAttempts ?? 3;

  return {
    async chat({ model, messages, tools, temperature }) {
      let lastErr: Error = new Error('LLM call failed');
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await doFetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${opts.apiKey}`,
              'Content-Type': 'application/json',
              ...(opts.appTitle ? { 'X-Title': opts.appTitle } : {})
            },
            body: JSON.stringify({
              model,
              messages,
              ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
              temperature: temperature ?? 0.3,
              usage: { include: true }
            })
          });
          if (res.status === 429 || res.status >= 500) throw new Error(`OpenRouter ${res.status}`);
          if (!res.ok) {
            // 4xx other than 429 will not succeed on retry.
            throw Object.assign(new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`), { fatal: true });
          }
          const json = (await res.json()) as {
            choices?: { message?: ChatMessage }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
          };
          const message = json.choices?.[0]?.message;
          if (!message) throw new Error('OpenRouter returned no message');
          return {
            message: { role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls },
            usage: {
              inputTokens: json.usage?.prompt_tokens ?? 0,
              outputTokens: json.usage?.completion_tokens ?? 0,
              costUsd: json.usage?.cost ?? 0
            }
          };
        } catch (e) {
          lastErr = e as Error;
          if ((e as { fatal?: boolean }).fatal || attempt === maxAttempts) break;
          await sleep(500 * 2 ** (attempt - 1));
        }
      }
      throw lastErr;
    }
  };
}

/** Model routing: cheap model for greetings/chit-chat, stronger model for orders and multi-step chats. */
export interface ModelConfig {
  fast: string;
  smart: string;
}

export function modelConfigFromEnv(env: Record<string, string | undefined> = process.env): ModelConfig {
  return {
    fast: env.OPENROUTER_MODEL_FAST ?? 'openai/gpt-4o-mini',
    smart: env.OPENROUTER_MODEL_SMART ?? 'openai/gpt-4o'
  };
}

const GREETING = /^(hi|hello|hey|good (morning|afternoon|evening)|how far|howfa|good day|thanks?|thank you|ok(ay)?|alright)[\s!.?]*$/i;

export function pickModel(cfg: ModelConfig, o: { lastMessage: string; hasOpenOrder: boolean }): string {
  if (!o.hasOpenOrder && GREETING.test(o.lastMessage.trim())) return cfg.fast;
  return cfg.smart;
}

/* ---------------- Embeddings (OpenRouter /embeddings, OpenAI-compatible) ---------------- */
export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}
export const EMBEDDING_DIMENSIONS = 1536;

export function embeddingModelFromEnv(env: Record<string, string | undefined> = process.env): string {
  return env.OPENROUTER_EMBEDDING_MODEL ?? 'openai/text-embedding-3-small';
}

export function createOpenRouterEmbedder(opts: { apiKey: string; model: string; baseUrl?: string; fetchImpl?: typeof fetch }): Embedder {
  const base = opts.baseUrl ?? 'https://openrouter.ai/api/v1';
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async embed(texts) {
      if (texts.length === 0) return [];
      const res = await doFetch(`${base}/embeddings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: opts.model, input: texts })
      });
      if (!res.ok) throw new Error(`OpenRouter embeddings ${res.status}`);
      const json = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
      const rows = [...(json.data ?? [])].sort((a, b) => a.index - b.index).map((d) => d.embedding);
      if (rows.length !== texts.length || rows.some((r) => r.length !== EMBEDDING_DIMENSIONS)) {
        throw new Error(`Embedding model must return ${EMBEDDING_DIMENSIONS}-dimension vectors`);
      }
      return rows;
    }
  };
}

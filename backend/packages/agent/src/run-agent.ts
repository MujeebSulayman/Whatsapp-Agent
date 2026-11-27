import type { ChatMessage, LlmClient } from '@wa/ai';
import { TOOLS, toolDefs } from './tools/index.js';
import type { Tool, ToolContext } from './tools/types.js';

export const MAX_STEPS = 6;

export interface AgentResult {
  reply: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  toolCalls: { name: string; args: unknown; result: unknown }[];
  handedOff: boolean;
  hitStepCap: boolean;
}

export async function runAgent(o: {
  llm: LlmClient;
  model: string;
  system: string;
  history: ChatMessage[];
  ctx: Omit<ToolContext, 'state'>;
  tools?: Tool[];
}): Promise<AgentResult> {
  const tools = o.tools ?? TOOLS;
  const defs = toolDefs(tools);
  const state = { handedOff: false };
  const ctx: ToolContext = { ...o.ctx, state };
  const messages: ChatMessage[] = [{ role: 'system', content: o.system }, ...o.history];
  const result: AgentResult = { reply: '', model: o.model, inputTokens: 0, outputTokens: 0, costUsd: 0, toolCalls: [], handedOff: false, hitStepCap: false };

  for (let step = 0; step < MAX_STEPS; step++) {
    const { message, usage } = await o.llm.chat({ model: o.model, messages, tools: defs });
    result.inputTokens += usage.inputTokens;
    result.outputTokens += usage.outputTokens;
    result.costUsd += usage.costUsd;

    if (!message.tool_calls?.length) {
      result.reply = (message.content ?? '').trim();
      result.handedOff = state.handedOff;
      return result;
    }

    messages.push(message);
    for (const call of message.tool_calls) {
      const tool = tools.find((t) => t.name === call.function.name);
      let args: unknown = undefined;
      let out: unknown;
      if (!tool) {
        out = { error: `Unknown tool ${call.function.name}` };
      } else {
        try {
          args = JSON.parse(call.function.arguments || '{}');
          const parsed = tool.schema.safeParse(args);
          out = parsed.success ? await tool.run(ctx, parsed.data) : { error: `Invalid arguments: ${parsed.error.message}` };
        } catch (e) {
          out = { error: `Tool failed: ${(e as Error).message}` };
        }
      }
      result.toolCalls.push({ name: call.function.name, args, result: out });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out) });
    }
  }

  // Step cap hit: stop looping, hand to a human rather than guess.
  result.hitStepCap = true;
  result.handedOff = state.handedOff;
  return result;
}

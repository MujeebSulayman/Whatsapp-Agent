import type { PrismaClient } from '@wa/db';
import type { z } from 'zod';

export interface ToolContext {
  db: PrismaClient;
  businessId: string;
  /** ISO 4217 code of the business; every amount shown to a customer uses it. */
  currency: string;
  conversationId: string;
  customerId: string;
  /** Optional: embeds a search query (enables vector search; keyword search is always the fallback). */
  embed?: (text: string) => Promise<number[]>;
  /** Optional: lets a tool send a product photo into the chat. */
  sendImage?: (o: { url: string; caption?: string }) => Promise<void>;
  /** Mutable per-run state the tools can flag for the loop/handler. */
  state: { handedOff: boolean; handoff?: { reason: string; summary: string } };
}

export interface Tool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run(ctx: ToolContext, args: z.infer<S>): Promise<unknown>;
}

export const defineTool = <S extends z.ZodType>(t: Tool<S>): Tool<S> => t;

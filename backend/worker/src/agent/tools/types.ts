import type { PrismaClient } from '@wa/db';
import type { z } from 'zod';

export interface ToolContext {
  db: PrismaClient;
  businessId: string;
  conversationId: string;
  customerId: string;
  /** Mutable per-run state the tools can flag for the loop/handler. */
  state: { handedOff: boolean };
}

export interface Tool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run(ctx: ToolContext, args: z.infer<S>): Promise<unknown>;
}

export const defineTool = <S extends z.ZodType>(t: Tool<S>): Tool<S> => t;

import { z } from 'zod';
import type { ToolDef } from '@wa/ai';
import { createOrder } from './create-order.js';
import { getDeliveryFee } from './get-delivery-fee.js';
import { handoffToHuman } from './handoff-to-human.js';
import { searchProducts } from './search-products.js';
import type { Tool } from './types.js';

export const TOOLS: Tool[] = [searchProducts, getDeliveryFee, createOrder, handoffToHuman] as Tool[];

export const toolDefs = (tools: Tool[] = TOOLS): ToolDef[] =>
  tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: z.toJSONSchema(t.schema) as Record<string, unknown> }
  }));

import { z } from 'zod';
import type { ToolDef } from '@wa/ai';
import { applyDiscount } from './apply-discount.js';
import { checkOrderStatus } from './check-order-status.js';
import { checkStock } from './check-stock.js';
import { createPaymentLink } from './create-payment-link.js';
import { createOrder } from './create-order.js';
import { getDeliveryFee } from './get-delivery-fee.js';
import { finishPlaybook, recordAnswer, startPlaybook } from './playbook.js';
import { listDeliveryAreas } from './list-delivery-areas.js';
import { listCatalog } from './list-catalog.js';
import { joinWaitlist } from './join-waitlist.js';
import { handoffToHuman } from './handoff-to-human.js';
import { saveCustomerDetail } from './save-customer-detail.js';
import { searchProducts } from './search-products.js';
import { suggestAlternatives } from './suggest-alternatives.js';
import { sendProductImage } from './send-product-image.js';
import type { Tool } from './types.js';

export const TOOLS: Tool[] = [
  searchProducts, listCatalog, listDeliveryAreas, checkStock, getDeliveryFee, createOrder, checkOrderStatus, applyDiscount, sendProductImage, saveCustomerDetail, suggestAlternatives, joinWaitlist, startPlaybook, recordAnswer, finishPlaybook, createPaymentLink, handoffToHuman
] as Tool[];

export const toolDefs = (tools: Tool[] = TOOLS): ToolDef[] =>
  tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: z.toJSONSchema(t.schema) as Record<string, unknown> }
  }));

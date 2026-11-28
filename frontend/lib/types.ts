export interface Me { user: { id: string; email: string; name: string | null }; business: { id: string; name: string; slug: string; plan: string; trialEndsAt: string | null }; role: 'owner' | 'agent' }

export interface BusinessDetail {
  id: string; name: string; slug: string; category: string; city: string; country: string; currency: string; kind: 'goods' | 'services' | 'both'; timezone: string; tone: string; aiEnabled: boolean; plan: string;
  businessHours: Record<string, string> | null; paymentInfo: string | null; returnPolicy: string | null; ownerPhone: string | null;
  trialDaysLeft: number | null;
  payMethods: string[]; bankName: string | null; bankAccountNumber: string | null; bankAccountName: string | null;
  fulfilment: string | null; address: string | null; returnType: string | null; returnDays: number | null;
  cancellationHours: number | null; depositRequired: boolean | null; paystackSubaccountCode?: string | null;
  readiness: { complete: boolean; items: { key: string; label: string; done: boolean; hint: string }[] };
  aiRules: { maxDiscountPct: number; escalateKeywords: string[]; forbiddenTopics: string[]; customInstructions: string | null } | null;
  whatsappAccounts: { id: string; displayNumber: string; phoneNumberId: string; status: string; wabaId: string }[];
  usage: { period: string; aiReplies: number; waMessagesBilled: number };
  setup: { whatsapp: boolean; products: boolean; zones: boolean; faqs: boolean };
}

export interface Product { id: string; name: string; category?: string | null; description: string | null; priceMinor: number; stockQty: number; trackStock: boolean; variants: { name: string; stockQty?: number | null; image?: string | null }[] | null; restockNote: string | null; allowPreorder: boolean; imageUrls: string[]; active: boolean }
export interface Zone { id: string; areaName: string; feeMinor: number; etaText: string }
export interface Faq { id: string; question: string; answer: string }

export type ConvStatus = 'ai' | 'human' | 'closed';
export interface ConversationRow {
  id: string; status: ConvStatus; lastMessageAt: string; windowExpiresAt: string | null;
  customer: { id: string; name: string | null; waId: string };
  lastMessage: { body: string | null; direction: 'inbound' | 'outbound'; type: string; createdAt: string; sentBy: string } | null;
}
export interface Message { id: string; direction: 'inbound' | 'outbound'; type: string; body: string | null; mediaUrl: string | null; sentBy: 'ai' | 'human' | 'customer'; status: string; createdAt: string }
export interface ConversationDetail {
  conversation: { id: string; status: ConvStatus; assignedTo: string | null; windowExpiresAt: string | null; lastMessageAt: string };
  customer: { id: string; name: string | null; waId: string; notes: string | null };
  messages: Message[]; orders: Order[];
}

export type OrderStatus = 'pending' | 'paid' | 'dispatched' | 'delivered' | 'cancelled';
export interface OrderItem { product_id: string; name: string; variant: string | null; quantity: number; unit_price_minor: number; line_total_minor: number; preorder?: boolean }
export interface Order {
  id: string; status: OrderStatus; paymentStatus: 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';
  items: OrderItem[]; subtotalMinor: number; deliveryFeeMinor: number; discountMinor: number; totalMinor: number;
  address: string | null; notes: string | null; createdAt: string; customer?: { id: string; name: string | null; waId: string };
}

export interface Customer { id: string; name: string | null; waId: string; notes: string | null; tags: string[]; totalSpentMinor: number; lastOrderAt: string | null; optedInMarketing: boolean; _count?: { orders: number } }
export interface CustomerDetail extends Customer { orders: Order[]; conversations: { id: string; status: ConvStatus; lastMessageAt: string }[] }

export interface Analytics {
  days: number; conversations: number; orders: number; paidOrders: number; revenueMinor: number; conversionPct: number | null; aiHandledPct: number | null;
  aiRuns: number; series: { date: string; orders: number; revenueMinor: number }[]; topProducts: { name: string; quantity: number; revenueMinor: number }[];
}
export interface TeamMember { userId: string; role: 'owner' | 'agent'; email: string; name: string | null }

/* ---- AI setup assistant ---- */
export interface ProposedProduct { name: string; category?: string | null; description: string | null; priceMinor: number | null; variants: string[]; stockQty: number | null; issue: string | null }
export interface ProposedZone { areaName: string; feeMinor: number | null; etaText: string | null; issue: string | null }
export interface ProposedFaq { question: string; answer: string }
export interface ImportProposal { products: ProposedProduct[]; zones: ProposedZone[]; faqs: ProposedFaq[]; warnings: string[]; detected?: { businessName: string | null; phone: string | null } }
export interface InterviewDraft {
  faqs: ProposedFaq[]; paymentInfo: string | null; returnPolicy: string | null; businessHours: Record<string, string> | null;
  customInstructions: string | null; escalateKeywords: string[]; forbiddenTopics: string[];
}
export interface PracticeReply { reply: string; handedOff: boolean; actions: { name: string; failed: boolean }[] }

export interface WaitGroup { productId: string; name: string; variant: string | null; inStock: boolean; people: { id: string; name: string | null; waId: string; since: string }[] }

export interface PlaybookStepT { id?: string; ask: string; required: boolean }
export interface Playbook { id: string; name: string; whenToUse: string; steps: (PlaybookStepT & { id: string })[]; finish: 'handoff' | 'message'; finishMessage: string | null; active: boolean; runs: number }
export interface PlaybookResponse { id: string; status: 'active' | 'completed'; createdAt: string; completedAt: string | null; conversationId: string | null; playbook: { id: string; name: string }; customer: { id: string; name: string | null; waId: string }; answers: { ask: string; answer: string | null }[] }
export interface PlaybookDraft { name: string; whenToUse: string; steps: { ask: string; required: boolean }[]; finish: 'handoff' | 'message'; finishMessage: string | null }

export interface Me { user: { id: string; email: string; name: string | null }; business: { id: string; name: string; slug: string; plan: string; trialEndsAt: string | null }; role: 'owner' | 'agent' }

export interface BusinessDetail {
  id: string; name: string; slug: string; category: string; city: string; tone: string; aiEnabled: boolean; plan: string;
  businessHours: Record<string, string> | null; paymentInfo: string | null; returnPolicy: string | null; ownerPhone: string | null;
  trialDaysLeft: number | null; aiDailyCapUsd: string;
  aiRules: { maxDiscountPct: number; escalateKeywords: string[]; forbiddenTopics: string[]; customInstructions: string | null } | null;
  whatsappAccounts: { id: string; displayNumber: string; phoneNumberId: string; status: string; wabaId: string }[];
  usage: { period: string; aiReplies: number; waMessagesBilled: number };
  setup: { whatsapp: boolean; products: boolean; zones: boolean; faqs: boolean };
}

export interface Product { id: string; name: string; description: string | null; priceKobo: number; stockQty: number; variants: { name: string }[] | null; imageUrls: string[]; active: boolean }
export interface Zone { id: string; areaName: string; feeKobo: number; etaText: string }
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
export interface OrderItem { product_id: string; name: string; variant: string | null; quantity: number; unit_price_kobo: number; line_total_kobo: number }
export interface Order {
  id: string; status: OrderStatus; paymentStatus: 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';
  items: OrderItem[]; subtotalKobo: number; deliveryFeeKobo: number; discountKobo: number; totalKobo: number;
  address: string | null; notes: string | null; createdAt: string; customer?: { id: string; name: string | null; waId: string };
}

export interface Customer { id: string; name: string | null; waId: string; notes: string | null; tags: string[]; totalSpentKobo: number; lastOrderAt: string | null; optedInMarketing: boolean; _count?: { orders: number } }
export interface CustomerDetail extends Customer { orders: Order[]; conversations: { id: string; status: ConvStatus; lastMessageAt: string }[] }

export interface Analytics {
  days: number; conversations: number; orders: number; paidOrders: number; revenueKobo: number; conversionPct: number | null; aiHandledPct: number | null;
  aiCostUsd: string; aiRuns: number; series: { date: string; orders: number; revenueKobo: number }[]; topProducts: { name: string; quantity: number; revenueKobo: number }[];
}
export interface TeamMember { userId: string; role: 'owner' | 'agent'; email: string; name: string | null }

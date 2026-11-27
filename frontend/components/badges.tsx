import type { ConvStatus, Order } from '@/lib/types';
import { Badge } from './ui';

export const ConvBadge = ({ status }: { status: ConvStatus }) =>
  status === 'ai' ? <Badge>AI replying</Badge> : status === 'human' ? <Badge tone="warning">Needs you</Badge> : <Badge>Closed</Badge>;

export const OrderBadge = ({ status }: { status: Order['status'] }) => {
  const tone = { pending: 'warning', paid: 'success', dispatched: 'neutral', delivered: 'success', cancelled: 'danger' } as const;
  return <Badge tone={tone[status]} className="capitalize">{status}</Badge>;
};
export const PaymentBadge = ({ status }: { status: Order['paymentStatus'] }) => {
  const tone = { unpaid: 'warning', pending: 'warning', paid: 'success', failed: 'danger', refunded: 'neutral' } as const;
  return <Badge tone={tone[status]} className="capitalize">{status}</Badge>;
};

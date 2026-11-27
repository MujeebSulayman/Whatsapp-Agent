'use client';
import { useLabels } from '@/lib/use-labels';
import type { ConvStatus, Order } from '@/lib/types';
import { Badge } from './ui';

export const ConvBadge = ({ status }: { status: ConvStatus }) =>
  status === 'ai' ? <Badge>AI replying</Badge> : status === 'human' ? <Badge tone="warning">Needs you</Badge> : <Badge>Closed</Badge>;

export const OrderBadge = ({ status }: { status: Order['status'] }) => {
  const labels = useLabels();
  const tone = { pending: 'warning', paid: 'success', dispatched: 'neutral', delivered: 'success', cancelled: 'danger' } as const;
  const text = status === 'dispatched' ? labels.status.dispatched : status === 'delivered' ? labels.status.delivered : status;
  return <Badge tone={tone[status]} className="capitalize">{text}</Badge>;
};
export const PaymentBadge = ({ status }: { status: Order['paymentStatus'] }) => {
  const tone = { unpaid: 'warning', pending: 'warning', paid: 'success', failed: 'danger', refunded: 'neutral' } as const;
  return <Badge tone={tone[status]} className="capitalize">{status}</Badge>;
};

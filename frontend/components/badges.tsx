'use client';
import { useLabels } from '@/lib/use-labels';
import type { ConvStatus, Order } from '@/lib/types';
import { StatusDot } from './ui';

export const ConvBadge = ({ status }: { status: ConvStatus }) =>
  status === 'ai' ? <StatusDot tone="success">AI replying</StatusDot> : status === 'human' ? <StatusDot tone="warning">Needs you</StatusDot> : <StatusDot>Closed</StatusDot>;

export const OrderBadge = ({ status }: { status: Order['status'] }) => {
  const labels = useLabels();
  const tone = { pending: 'warning', paid: 'success', dispatched: 'neutral', delivered: 'success', cancelled: 'danger' } as const;
  const text = status === 'dispatched' ? labels.status.dispatched : status === 'delivered' ? labels.status.delivered : status;
  return <StatusDot tone={tone[status]} className="capitalize">{text}</StatusDot>;
};
export const PaymentBadge = ({ status }: { status: Order['paymentStatus'] }) => {
  const tone = { unpaid: 'warning', pending: 'warning', paid: 'success', failed: 'danger', refunded: 'neutral' } as const;
  return <StatusDot tone={tone[status]} className="capitalize">{status}</StatusDot>;
};

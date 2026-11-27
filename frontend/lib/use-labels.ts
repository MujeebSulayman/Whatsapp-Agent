'use client';
import { useMemo } from 'react';
import { useApi } from './api';
import type { Kind } from './categories';
import type { BusinessDetail } from './types';

export interface Labels {
  kind: Kind;
  items: string; item: string; addItem: string;
  orders: string; order: string; ordersBlurb: string;
  zones: string; zoneTab: string; zonesBlurb: string; fee: string;
  priceLabel: string; showStock: boolean;
  status: { dispatched: string; delivered: string };
}

const BY_KIND: Record<Kind, Omit<Labels, 'kind'>> = {
  goods: {
    items: 'Products', item: 'product', addItem: 'Add product',
    orders: 'Orders', order: 'order', ordersBlurb: 'Orders the assistant captured from WhatsApp chats.',
    zones: 'Delivery areas', zoneTab: 'Delivery', zonesBlurb: "The assistant quotes these fees and times. Areas you don't list are handed to you.", fee: 'Delivery fee',
    priceLabel: 'Price', showStock: true, status: { dispatched: 'Dispatched', delivered: 'Delivered' }
  },
  services: {
    items: 'Services', item: 'service', addItem: 'Add service',
    orders: 'Bookings', order: 'booking', ordersBlurb: 'Booking requests the assistant captured from WhatsApp chats. Confirm the time and final price with the customer.',
    zones: 'Service areas', zoneTab: 'Service areas', zonesBlurb: 'Where you work, with a call-out or travel fee for each area. Areas you don’t list are handed to you.', fee: 'Call-out fee',
    priceLabel: 'Starting price', showStock: false, status: { dispatched: 'In progress', delivered: 'Completed' }
  },
  both: {
    items: 'Products & services', item: 'item', addItem: 'Add item',
    orders: 'Orders & bookings', order: 'order', ordersBlurb: 'Orders and booking requests the assistant captured from WhatsApp chats.',
    zones: 'Delivery & service areas', zoneTab: 'Areas', zonesBlurb: 'Where you deliver or work, with the fee for each area. Areas you don’t list are handed to you.', fee: 'Delivery / call-out fee',
    priceLabel: 'Price', showStock: true, status: { dispatched: 'Dispatched / in progress', delivered: 'Delivered / completed' }
  }
};

/** Wording that follows the business type (products, services or both). Cached; shared by every page. */
export function useLabels(): Labels {
  const { data } = useApi<BusinessDetail>('business');
  const kind = data?.kind ?? 'goods';
  return useMemo(() => ({ kind, ...BY_KIND[kind] }), [kind]);
}

import './globals.css';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';

export const metadata = { title: 'WA Sales Agent', description: 'Your AI salesperson on WhatsApp' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}

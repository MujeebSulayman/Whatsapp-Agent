import './globals.css';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';

export const metadata = { title: 'Converso', description: 'Your AI salesperson on WhatsApp' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint to avoid a flash. Dark is the default. */}
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('theme')||'dark'}catch(e){}" }} />
      </head>
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}

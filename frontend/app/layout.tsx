import './globals.css';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';

export const metadata = { title: 'Converso', description: 'Your AI salesperson on WhatsApp' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        {/* Apply the saved theme before first paint to avoid a flash. Dark is the default. */}
        <Script id="theme-init" strategy="beforeInteractive">{"try{document.documentElement.dataset.theme=localStorage.getItem('theme')||'dark'}catch(e){}"}</Script>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

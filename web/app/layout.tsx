import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata = { title: 'Daily Snapshot' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

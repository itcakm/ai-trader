import type { Metadata } from 'next';
import { ThemeProvider } from '@/providers/ThemeProvider';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'AI-Assisted Crypto Trading System',
  description: 'Professional crypto trading platform with AI-powered insights',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/app/globals.css';
import { Providers } from '@/components/layout/Providers';
import { NavBar } from '@/components/layout/NavBar';
import { Toaster } from 'sonner';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans',
});

export const metadata: Metadata = {
  title: 'Soprano Cafe',
  description: 'Cafe operations dashboard.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning className={inter.variable}>
      <body className="font-sans">
        <Providers>
          <NavBar />
          <main className="pt-12">{children}</main>
          <Toaster
            position="bottom-right"
            duration={3000}
            richColors
            toastOptions={{
              classNames: {
                toast:
                  'border border-white/10 bg-zinc-950 text-white shadow-2xl shadow-black/40',
                title: 'text-white',
                description: 'text-zinc-300',
                actionButton: 'bg-white text-black',
                cancelButton: 'bg-zinc-800 text-zinc-100',
                error: 'border-red-500/30 bg-zinc-950 text-white',
                success: 'border-emerald-500/30 bg-zinc-950 text-white',
                warning: 'border-amber-500/30 bg-zinc-950 text-white',
                info: 'border-sky-500/30 bg-zinc-950 text-white',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}

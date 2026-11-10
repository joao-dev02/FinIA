import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'FinAI · Seu dinheiro, com clareza', description: 'Fundação local de gestão financeira pessoal. Ambiente demonstrativo.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}

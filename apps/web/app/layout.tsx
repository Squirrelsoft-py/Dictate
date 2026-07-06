import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dictate',
  description: 'Self-hosted meeting & lecture transcription with notes',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
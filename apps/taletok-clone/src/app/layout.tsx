import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReelForge — faceless video automation',
  description:
    'Generate, edit and schedule faceless short-form videos: story videos, cinematic shorts, ' +
    'timelapses, quizzes, listicles and more.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

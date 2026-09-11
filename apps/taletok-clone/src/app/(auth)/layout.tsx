import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-6 py-12">
      <Link href="/" className="mb-8 text-lg font-semibold text-white">
        Reel<span className="text-brand-400">Forge</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

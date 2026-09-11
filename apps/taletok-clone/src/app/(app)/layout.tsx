import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { usingPlaceholders } from '@/providers/registry';
import { Sidebar } from '@/components/sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen bg-ink-950">
      <Sidebar user={user} placeholders={usingPlaceholders()} />
      <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">{children}</main>
    </div>
  );
}

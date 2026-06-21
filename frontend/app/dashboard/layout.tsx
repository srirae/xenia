import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BalanceProvider } from '@/components/dashboard/BalanceContext';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Defence in depth: middleware already guards /dashboard, but verify here too.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/?auth=required');

  return (
    <BalanceProvider>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <DashboardNav />
        <main style={{ flex: 1, width: '100%', maxWidth: 1180, margin: '0 auto', padding: '28px 24px 80px' }}>
          {children}
        </main>
      </div>
    </BalanceProvider>
  );
}

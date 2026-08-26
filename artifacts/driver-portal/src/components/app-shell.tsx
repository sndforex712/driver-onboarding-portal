import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Home, FileText, MessageSquare, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/instructions', label: 'Instructions', icon: MessageSquare },
  { href: '/help', label: 'Help', icon: HelpCircle },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
      <main className="flex-1 px-4 pb-28 pt-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-border bg-card">
        <div className="grid grid-cols-4">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex min-h-[64px] flex-col items-center justify-center gap-1 text-xs font-semibold',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="h-6 w-6" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

import { useDriver } from '@/context/driver-context';
import { NoSession } from '@/pages/no-session';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';

export function Instructions() {
  const { driver } = useDriver();
  if (!driver) return <NoSession />;

  const sorted = [...driver.instructions].sort(
    (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
  );

  return (
    <AppShell>
      <h1 className="text-2xl font-extrabold">Instructions</h1>
      <p className="mt-1 text-sm text-muted-foreground">Messages from your recruiting team.</p>

      <div className="mt-5 space-y-3">
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        )}
        {sorted.map((note) => (
          <Card key={note.id} className={note.read ? 'opacity-70' : ''}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-bold">{note.title}</p>
              <p className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground">
                {new Date(note.postedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
            <p className="mt-1 text-base text-muted-foreground">{note.body}</p>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

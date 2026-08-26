import { useDriver } from '@/context/driver-context';
import { NoSession } from '@/pages/no-session';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { AskQuestionButton } from '@/components/ask-question-button';

export function Help() {
  const { driver } = useDriver();
  if (!driver) return <NoSession />;

  return (
    <AppShell>
      <h1 className="text-2xl font-extrabold">Help</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Need something? Reach out and your recruiting team will follow up.
      </p>

      <Card className="mt-5">
        <AskQuestionButton />
      </Card>
    </AppShell>
  );
}

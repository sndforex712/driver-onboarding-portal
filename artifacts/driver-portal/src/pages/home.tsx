import { Link } from 'wouter';
import { useDriver } from '@/context/driver-context';
import { NoSession } from '@/pages/no-session';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { StepProgress } from '@/components/ui/step-progress';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { nextActionForStep, missingDocuments } from '@/lib/mock-data';
import { AskQuestionButton } from '@/components/ask-question-button';

export function Home() {
  const { driver } = useDriver();
  if (!driver) return <NoSession />;

  const firstName = driver.fullName.split(' ')[0];
  const unreadInstructions = driver.instructions.filter((i) => !i.read);
  const missing = missingDocuments(driver);

  return (
    <AppShell>
      <p className="text-base text-muted-foreground">Welcome back,</p>
      <h1 className="text-3xl font-extrabold">{firstName}</h1>

      <Card className="mt-5">
        <StepProgress currentStep={driver.currentStep} />
      </Card>

      <Card className="mt-4 border-primary/30 bg-primary/5">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">What's next?</p>
        <p className="mt-1 text-xl font-semibold leading-snug">{nextActionForStep(driver.currentStep)}</p>
      </Card>

      {missing.length > 0 && (
        <Card className="mt-4 border-amber-300 bg-amber-50">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-bold uppercase tracking-wide">Missing documents</p>
          </div>
          <ul className="mt-3 space-y-2">
            {missing.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3">
                <span className="text-base font-medium text-amber-900">{doc.name}</span>
                <Link
                  href="/documents"
                  className="inline-flex min-h-[44px] items-center rounded-xl bg-amber-900 px-4 text-sm font-semibold text-amber-50"
                >
                  Upload
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
        You're on track. Once this step is done, we'll move you forward.
      </p>

      {unreadInstructions.length > 0 && (
        <Card className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Latest from your recruiter
          </p>
          <p className="mt-1 text-base font-semibold">{unreadInstructions[0].title}</p>
          <p className="mt-0.5 text-base text-muted-foreground">{unreadInstructions[0].body}</p>
          <Link href="/instructions" className="mt-2 inline-block text-sm font-semibold text-primary">
            See all instructions →
          </Link>
        </Card>
      )}

      <div className="mt-5">
        <AskQuestionButton />
      </div>
    </AppShell>
  );
}

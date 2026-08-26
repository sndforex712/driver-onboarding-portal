import { Link } from 'wouter';
import { MOCK_DRIVERS } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';

// Shown when someone lands on a driver page without going through /link/:token first.
// Demo convenience only — a real deployment would just bounce to a "link expired" state.
export function NoSession() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm text-center">
        <p className="text-lg font-bold">No active link</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Open your secure onboarding link to see your progress. For this demo, try one of:
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {Object.values(MOCK_DRIVERS).map((d) => (
            <Link
              key={d.token}
              href={`/link/${d.token}`}
              className="min-h-[52px] rounded-2xl border-2 border-border flex items-center justify-center font-semibold"
            >
              {d.fullName} — Step {d.currentStep}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

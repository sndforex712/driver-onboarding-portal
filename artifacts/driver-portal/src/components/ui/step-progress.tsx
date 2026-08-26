import { STEP_NAMES, TOTAL_STEPS } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

export function StepProgress({ currentStep }: { currentStep: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Step {currentStep} of {TOTAL_STEPS}
        </p>
        <p className="text-sm text-muted-foreground">
          {Math.round((currentStep / TOTAL_STEPS) * 100)}%
        </p>
      </div>
      <p className="mt-1 text-2xl font-bold">{STEP_NAMES[currentStep - 1]}</p>
      <div className="mt-3 flex gap-1.5">
        {STEP_NAMES.map((name, i) => {
          const step = i + 1;
          const state = step < currentStep ? 'done' : step === currentStep ? 'current' : 'todo';
          return (
            <span
              key={name}
              title={`${step}. ${name}`}
              className={cn(
                'h-2.5 flex-1 rounded-full',
                state === 'done' && 'bg-primary',
                state === 'current' && 'bg-primary/60',
                state === 'todo' && 'bg-muted',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

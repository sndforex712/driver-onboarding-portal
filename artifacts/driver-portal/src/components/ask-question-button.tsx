import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircleQuestion } from 'lucide-react';

// Phase 1: no backend, no Twenty Cloud. Clicking just shows a placeholder message.
export function AskQuestionButton() {
  const [shown, setShown] = useState(false);

  return (
    <div>
      <Button variant="outline" full onClick={() => setShown(true)}>
        <MessageCircleQuestion className="h-5 w-5" />
        Ask a question
      </Button>
      {shown && (
        <div className="mt-3 rounded-2xl bg-muted p-4 text-center">
          <p className="text-sm font-semibold">Your question will go to the recruiting team.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This isn't wired up yet in this preview — for now, text or call your recruiter directly.
          </p>
        </div>
      )}
    </div>
  );
}

import { useDriver } from '@/context/driver-context';
import { NoSession } from '@/pages/no-session';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { DocumentItem, DocumentStatus } from '@/lib/mock-data';

const STATUS_LABEL: Record<DocumentStatus, string> = {
  not_submitted: 'Not submitted',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_TONE: Record<DocumentStatus, 'neutral' | 'info' | 'good' | 'danger'> = {
  not_submitted: 'neutral',
  under_review: 'info',
  approved: 'good',
  rejected: 'danger',
};

function DocumentRow({ doc }: { doc: DocumentItem }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold">{doc.name}</p>
        <Pill tone={STATUS_TONE[doc.status]}>{STATUS_LABEL[doc.status]}</Pill>
      </div>

      {doc.status === 'rejected' && (
        <div className="mt-3 rounded-xl bg-red-50 p-3">
          <div className="flex items-start gap-2 text-red-900">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm">{doc.rejectionReason}</p>
          </div>
          <Button variant="primary" className="mt-3 bg-red-700 hover:bg-red-700/90" onClick={() => {}}>
            Re-upload
          </Button>
        </div>
      )}

      {doc.status === 'not_submitted' && (
        <Button variant="primary" full className="mt-3" onClick={() => {}}>
          Upload
        </Button>
      )}
    </Card>
  );
}

export function Documents() {
  const { driver } = useDriver();
  if (!driver) return <NoSession />;

  const nothingMissing = driver.documents.every((d) => d.status === 'approved');

  return (
    <AppShell>
      <h1 className="text-2xl font-extrabold">Documents</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Uploading isn't wired up yet in this preview — buttons are for layout only.
      </p>

      <div className="mt-5 space-y-3">
        {nothingMissing ? (
          <Card className="flex items-center gap-3 border-emerald-300 bg-emerald-50">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-700" />
            <p className="font-semibold text-emerald-900">Nothing missing right now.</p>
          </Card>
        ) : (
          driver.documents.map((doc) => <DocumentRow key={doc.id} doc={doc} />)
        )}
      </div>
    </AppShell>
  );
}

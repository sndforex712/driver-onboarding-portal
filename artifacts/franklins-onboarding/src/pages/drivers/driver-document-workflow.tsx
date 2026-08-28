import React, { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { Button, Input } from "@/components/ui";

type Requirement = {
  id: number;
  requirementKey: string;
  label: string;
  isMandatory: boolean;
  allowsManualCompletion: boolean;
};

type DocumentRecord = {
  id: number;
  requirementKey: string;
  docName: string;
  status: "under_review" | "verified" | "rejected";
  rejectionReason: string | null;
  downloadUrl: string;
};

type WorkflowStep = {
  number: number;
  key: string;
  label: string;
  state: "complete" | "current" | "upcoming";
  allowsManualCompletion: boolean;
  requirements: Requirement[];
  documents: DocumentRecord[];
};

type Workflow = {
  candidateId: string;
  candidateName: string;
  canManageDocuments: boolean;
  currentStepKey: string;
  currentStepNumber: number;
  currentStepLabel: string;
  steps: WorkflowStep[];
};

async function responseBody(response: Response) {
  return response.json().catch(() => null);
}

export function DriverDocumentWorkflowPanel({
  candidateId,
  candidateName,
  onClose,
  onWorkflowChanged,
}: {
  candidateId: string;
  candidateName: string;
  onClose: () => void;
  onWorkflowChanged: () => void;
}) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectingDocId, setRejectingDocId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const loadWorkflow = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/drivers/operational-queue/${candidateId}/document-workflow`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body?.message ?? "Document workflow could not load.");
      setWorkflow(body as Workflow);
    } catch (reason) {
      setWorkflow(null);
      setError(reason instanceof Error ? reason.message : "Document workflow could not load.");
    } finally {
      setIsLoading(false);
    }
  }, [candidateId]);

  useEffect(() => { void loadWorkflow(); }, [loadWorkflow]);

  const mutate = async (key: string, request: () => Promise<Response>) => {
    setActionKey(key);
    setError(null);
    try {
      const response = await request();
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body?.message ?? "The document action could not be completed.");
      setRejectingDocId(null);
      setRejectionReason("");
      await loadWorkflow();
      onWorkflowChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The document action could not be completed.");
    } finally {
      setActionKey(null);
    }
  };

  const uploadDocument = async (step: WorkflowStep, requirement: Requirement, file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("stepKey", step.key);
    form.append("requirementKey", requirement.requirementKey);
    await mutate(`upload:${requirement.id}`, () => fetch(
      `/api/drivers/operational-queue/${candidateId}/documents`,
      { method: "POST", credentials: "same-origin", body: form },
    ));
  };

  const reviewDocument = async (document: DocumentRecord, status: "verified" | "rejected") => {
    await mutate(`review:${document.id}:${status}`, () => fetch(
      `/api/drivers/operational-queue/${candidateId}/documents/${document.id}/review`,
      {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          status,
          ...(status === "rejected" ? { rejectionReason: rejectionReason.trim() } : {}),
        }),
      },
    ));
  };

  const completeStep = async (step: WorkflowStep) => {
    await mutate(`complete:${step.key}`, () => fetch(
      `/api/drivers/operational-queue/${candidateId}/complete-step`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ expectedStepKey: step.key }),
      },
    ));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label={`Document workflow for ${candidateName}`}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close document workflow" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col overflow-hidden border-l border-border bg-background shadow-2xl">
        <header className="z-10 flex items-start justify-between gap-4 border-b border-border bg-background px-4 py-4 sm:px-6">
          <div>
            <div className="fleet-eyebrow">Driver documents</div>
            <h2 className="mt-1 text-lg font-extrabold text-foreground">{candidateName}</h2>
            {workflow && <p className="mt-1 text-xs text-muted-foreground">Current: {workflow.currentStepNumber}. {workflow.currentStepLabel}</p>}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {error && (
            <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <span>{error}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => void loadWorkflow()}><RefreshCw className="mr-1 h-3.5 w-3.5" />Retry</Button>
            </div>
          )}
          {isLoading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading 12-step workflow…</div>
          ) : workflow ? (
            <div className="space-y-3">
              {workflow.steps.map((step) => (
                <section key={step.key} className={`rounded-xl border p-4 ${step.state === "current" ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-card"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      step.state === "complete" ? "bg-emerald-100 text-emerald-700" : step.state === "current" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    }`}>
                      {step.state === "complete" ? <Check className="h-4 w-4" /> : step.number}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold">{step.label}</h3>
                        {step.state === "current" && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">CURRENT</span>}
                      </div>
                      {step.requirements.length === 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">No requirement configuration.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {step.requirements.map((requirement) => {
                            const documents = step.documents.filter((document) => document.requirementKey === requirement.requirementKey);
                            const verified = documents.some((document) => document.status === "verified");
                            return (
                              <div key={requirement.id} className="rounded-lg border border-border bg-background/70 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex min-w-0 gap-2">
                                    {verified ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                                    <div>
                                      <div className="text-xs font-semibold">{requirement.label}</div>
                                      <div className="mt-0.5 text-[10px] text-muted-foreground">{requirement.isMandatory ? "Required" : "Optional / no document"}</div>
                                    </div>
                                  </div>
                                  {workflow.canManageDocuments && step.state === "current" && requirement.requirementKey !== "NO_DOCUMENT" && (
                                    <label className="inline-flex cursor-pointer items-center rounded-md border border-input bg-card px-2.5 py-1.5 text-[11px] font-semibold hover:bg-secondary">
                                      {actionKey === `upload:${requirement.id}` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
                                      Upload
                                      <input
                                        type="file"
                                        className="sr-only"
                                        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                                        disabled={actionKey !== null}
                                        onChange={(event) => {
                                          const file = event.target.files?.[0];
                                          if (file) void uploadDocument(step, requirement, file);
                                          event.currentTarget.value = "";
                                        }}
                                      />
                                    </label>
                                  )}
                                </div>
                                {documents.map((document) => (
                                  <div key={document.id} className="mt-2 border-t border-border pt-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                      <a className="min-w-0 flex-1 truncate text-xs font-medium text-primary hover:underline" href={document.downloadUrl}>
                                        {document.docName}
                                      </a>
                                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                                        document.status === "verified" ? "bg-emerald-100 text-emerald-700" : document.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                                      }`}>{document.status.replace("_", " ")}</span>
                                      <a href={document.downloadUrl} aria-label={`Download ${document.docName}`} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"><Download className="h-3.5 w-3.5" /></a>
                                    </div>
                                    {document.rejectionReason && <p className="mt-1 text-[10px] text-red-700">Reason: {document.rejectionReason}</p>}
                                    {workflow.canManageDocuments && document.status === "under_review" && (
                                      <div className="mt-2">
                                        {rejectingDocId === document.id ? (
                                          <div className="space-y-2">
                                            <Input value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Required rejection reason" className="h-8 text-xs" />
                                            <div className="flex gap-2">
                                              <Button size="sm" variant="destructive" disabled={!rejectionReason.trim() || actionKey !== null} onClick={() => void reviewDocument(document, "rejected")}>Confirm rejection</Button>
                                              <Button size="sm" variant="ghost" onClick={() => { setRejectingDocId(null); setRejectionReason(""); }}>Cancel</Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="flex gap-2">
                                            <Button size="sm" disabled={actionKey !== null} onClick={() => void reviewDocument(document, "verified")}><Check className="mr-1 h-3.5 w-3.5" />Verify</Button>
                                            <Button size="sm" variant="outline" disabled={actionKey !== null} onClick={() => setRejectingDocId(document.id)}><XCircle className="mr-1 h-3.5 w-3.5" />Reject</Button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {workflow.canManageDocuments && step.state === "current" && step.allowsManualCompletion && (
                        <Button className="mt-3 w-full sm:w-auto" size="sm" disabled={actionKey !== null} onClick={() => void completeStep(step)}>
                          {actionKey === `complete:${step.key}` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
                          Complete step
                        </Button>
                      )}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
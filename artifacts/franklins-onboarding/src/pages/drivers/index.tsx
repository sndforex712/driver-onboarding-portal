import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, FilterX, Search } from "lucide-react";
import { Button, Card, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { DriverPhoneActions } from "./driver-phone-actions";
import { DRIVER_OWNER_SECTIONS, groupDriverRows } from "./driver-owner-sections";

type QueueView = "all" | "due_today" | "overdue" | "waiting_blocked" | "no_next_action" | "needs_review";

type DriverRow = {
  id: string;
  fullName: string;
  status: string;
  recruiterName: string;
  sourceChannel: string;
  operationalOwnerName: string | null;
  currentStepNumber: number;
  currentStepLabel: string;
  completedStepNumbers: number[];
  nextActionDue: string | null;
  phone: string | null;
  completionPercent: number;
};

type QueueResponse = {
  items: DriverRow[];
  counts: { all: number; dueToday: number; overdue: number; waitingBlocked: number; noNextAction: number; needsReview: number };
  total: number;
  stepCount: number;
  filterOptions: {
    owners: Array<{ id: number; name: string }>;
    steps: Array<{ number: number; key: string; label: string }>;
    sources: string[];
  };
};

const VIEW_LABELS: Record<QueueView, string> = {
  all: "All Drivers",
  due_today: "Due Today",
  overdue: "Overdue",
  waiting_blocked: "Waiting / Blocked",
  no_next_action: "No Next Action",
  needs_review: "Needs Review",
};

const STATUSES = [
  ["ACTIVE", "Active"],
  ["HIRED_DISPATCH_READY", "Hired / Dispatch Ready"],
  ["NOT_QUALIFIED", "Not Qualified"],
  ["WITHDRAWN", "Withdrawn"],
  ["NO_RESPONSE", "No Response"],
  ["REJECTED", "Rejected"],
] as const;

const OWNERS = [
  ["RECRUITER_A", "Recruiter A"],
  ["RECRUITER_B", "Recruiter B"],
  ["HARDY", "Hardy"],
] as const;

function statusLabel(status: string): string {
  return STATUSES.find(([value]) => value === status)?.[1] ?? status.replace(/_/g, " ");
}

export default function DriversList({ onSignedOut }: { onSignedOut: () => void }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<QueueView>("all");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [step, setStep] = useState("");
  const [source, setSource] = useState("");
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (view !== "all") params.set("view", view);
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    if (owner) params.set("operationalOwner", owner);
    if (step) params.set("step", step);
    if (source) params.set("source", source);
    return params.toString();
  }, [view, search, status, owner, step, source]);

  const loadQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/drivers/operational-queue${queryString ? `?${queryString}` : ""}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message ?? "The operational queue could not load.");
      setQueue(body as QueueResponse);
    } catch (reason) {
      setQueue(null);
      setError(reason instanceof Error ? reason.message : "The operational queue could not load.");
    } finally {
      setIsLoading(false);
    }
  }, [queryString]);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const updateCandidate = async (id: string, update: { recruiter?: string; status?: string }) => {
    setSavingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/drivers/operational-queue/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(update),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message ?? "The change could not be saved to Twenty Cloud.");
      await loadQueue();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The change could not be saved to Twenty Cloud.");
    } finally {
      setSavingId(null);
    }
  };

  const groupedRows = groupDriverRows(queue?.items ?? []);
  const hasFilters = Boolean(search || view !== "all" || status || owner || step || source);
  const resetFilters = () => {
    setSearch("");
    setView("all");
    setStatus("");
    setOwner("");
    setStep("");
    setSource("");
  };
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    onSignedOut();
  };
  const viewCount = (candidate: QueueView) => {
    if (!queue) return 0;
    if (candidate === "all") return queue.counts.all;
    if (candidate === "due_today") return queue.counts.dueToday;
    if (candidate === "overdue") return queue.counts.overdue;
    if (candidate === "waiting_blocked") return queue.counts.waitingBlocked;
    if (candidate === "no_next_action") return queue.counts.noNextAction;
    return queue.counts.needsReview;
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl flex-col">
        <header className="mb-6 flex items-center justify-between border-b border-border pb-5">
          <div className="flex items-center gap-2 text-base font-extrabold text-primary">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm text-primary-foreground shadow-sm">F</span>
            <span>Franklins<span className="text-amber-600">.</span>OS</span>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => void signOut()}>Sign out</Button>
        </header>

        <div className="flex flex-1 flex-col space-y-5">
          <div className="flex shrink-0 flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="fleet-eyebrow">Onboarding operations</div>
              <h1 className="fleet-page-title mt-1">All drivers</h1>
              <p className="mt-2 text-sm text-muted-foreground">Operational onboarding queue and Twenty Cloud assignments.</p>
            </div>
            <div className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {queue ? `${queue.total} visible of ${queue.counts.all} filtered` : "Loading queue…"}
            </div>
          </div>

          <Card className="shrink-0 space-y-4 p-4">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(VIEW_LABELS) as QueueView[]).map((candidate) => (
                <Button key={candidate} size="sm" variant={view === candidate ? "default" : "outline"} onClick={() => setView(candidate)} className="min-h-9 text-[11px]">
                  {VIEW_LABELS[candidate]} <span className="ml-1 opacity-70">{viewCount(candidate)}</span>
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search name, recruiter, owner, source, or step…" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
              </div>
              <select className="h-10 rounded-[10px] border border-input bg-card px-3 text-xs" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All statuses</option>
                {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select className="h-10 rounded-[10px] border border-input bg-card px-3 text-xs" value={owner} onChange={(event) => setOwner(event.target.value)}>
                <option value="">All owners</option>
                {queue?.filterOptions.owners.map((option) => <option key={option.id} value={option.name}>{option.name}</option>)}
              </select>
              <select className="h-10 rounded-[10px] border border-input bg-card px-3 text-xs" value={step} onChange={(event) => setStep(event.target.value)}>
                <option value="">All steps</option>
                {queue?.filterOptions.steps.map((option) => <option key={option.number} value={option.number}>{option.number}. {option.label}</option>)}
              </select>
              <select className="h-10 rounded-[10px] border border-input bg-card px-3 text-xs" value={source} onChange={(event) => setSource(event.target.value)}>
                <option value="">All sources</option>
                {queue?.filterOptions.sources.map((option) => <option key={option} value={option}>{option.replace(/_/g, " ")}</option>)}
              </select>
              {hasFilters && <Button variant="ghost" size="icon" onClick={resetFilters} title="Clear filters"><FilterX className="h-4 w-4" /></Button>}
            </div>
          </Card>

          <Card className="flex flex-1 flex-col overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground"><span className="fleet-skeleton mx-auto mb-3 block h-3 w-44" />Loading operational queue…</div>
            ) : error ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 p-8 text-center">
                <div className="fleet-state-title text-red-700">The operational queue could not load</div>
                <div className="text-xs text-muted-foreground">{error}</div>
                <Button size="sm" variant="outline" onClick={() => void loadQueue()}>Retry</Button>
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                {DRIVER_OWNER_SECTIONS.map((section) => {
                  const sectionRows = groupedRows[section.key];
                  return (
                    <section key={section.key} aria-labelledby={`driver-owner-${section.key}`} className="border-b border-border last:border-b-0">
                      <div className="sticky left-0 z-10 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-muted/40 px-4 py-3">
                        <h2 id={`driver-owner-${section.key}`} className="text-xs font-bold tracking-[0.18em] text-foreground">{section.label}</h2>
                        <span className="text-[11px] font-medium text-muted-foreground">{section.stepRange}</span>
                        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{sectionRows.length}</span>
                      </div>
                       <Table>
                         <TableHeader><TableRow><TableHead>Driver</TableHead><TableHead>Current Step</TableHead><TableHead>Operational Owner</TableHead><TableHead>Recruiter / Source</TableHead><TableHead>Safe Status</TableHead><TableHead>Due</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {sectionRows.map((driver) => {
                            const saving = savingId === driver.id;
                            const ownerValue = OWNERS.find(([, label]) => label === driver.operationalOwnerName)?.[0] ?? "";
                            return (
                              <TableRow key={driver.id}>
                                <TableCell><div className="min-w-[12rem]"><div className="font-bold text-foreground">{driver.fullName}</div><div className="mt-1"><DriverPhoneActions driverName={driver.fullName} phone={driver.phone} /></div></div></TableCell>
                                <TableCell><div className="min-w-[10rem]"><div className="font-medium text-sm">{driver.currentStepNumber}. {driver.currentStepLabel}</div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${driver.completionPercent}%` }} /></div><div className="mt-1 text-[10px] text-muted-foreground">{driver.completedStepNumbers.length}/{queue?.stepCount ?? 12} canonical steps complete</div></div></TableCell>
                                <TableCell><select aria-label={`Owner for ${driver.fullName}`} disabled={saving} className="h-8 rounded-md border border-input bg-card px-2 text-xs disabled:opacity-50" value={ownerValue} onChange={(event) => void updateCandidate(driver.id, { recruiter: event.target.value })}>{OWNERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></TableCell>
                                <TableCell><div className="text-xs">{driver.recruiterName}</div><div className="text-[10px] text-muted-foreground capitalize">{driver.sourceChannel.replace(/_/g, " ") || "—"}</div></TableCell>
                                <TableCell><div className="min-w-[9rem]"><select aria-label={`Status for ${driver.fullName}`} disabled={saving} className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs disabled:opacity-50" value={driver.status} onChange={(event) => void updateCandidate(driver.id, { status: event.target.value })}>{STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className="mt-1 text-[10px] text-muted-foreground">{saving ? "Saving to Twenty Cloud…" : statusLabel(driver.status)}</div></div></TableCell>
                                 <TableCell>{driver.nextActionDue ? <div className="flex items-center gap-1 text-xs"><CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />{formatDateTime(driver.nextActionDue)}</div> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                              </TableRow>
                            );
                          })}
                           {sectionRows.length === 0 && <TableRow><TableCell colSpan={6} className="h-20 text-center text-xs text-muted-foreground">No drivers match these filters in {section.label}.</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </section>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
        <footer className="mt-6 border-t border-border pt-4 text-center text-[11px] text-muted-foreground">DEV / DEMO — Twenty Cloud-backed driver queue.</footer>
       </div>
    </main>
  );
}
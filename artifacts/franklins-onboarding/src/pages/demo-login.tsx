import React, { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { ShieldCheck } from "lucide-react";

const demoAccounts = [
  { account: "admin", name: "Demo Admin", role: "Owner admin" },
  { account: "hardy", name: "Hardy", role: "Manager" },
  { account: "mason", name: "Mason", role: "Onboarding specialist" },
  { account: "wayne", name: "Wayne", role: "Onboarding specialist" },
] as const;

export default function DemoLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [submittingAccount, setSubmittingAccount] = useState<string | null>(null);

  const continueAs = async (account: (typeof demoAccounts)[number]["account"]) => {
    setSubmittingAccount(account);
    setError(null);
    try {
      const response = await fetch("/api/auth/demo-login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ account }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? "Unable to sign in.");
      }
      onAuthenticated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setSubmittingAccount(null);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <Card className="w-full max-w-[28rem] border-border shadow-[0_8px_30px_rgba(25,47,34,0.07)]">
        <CardHeader className="space-y-5 p-6 pb-5 sm:p-8 sm:pb-6">
          <div className="flex items-center gap-2 text-base font-extrabold text-primary">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm text-primary-foreground shadow-sm">F</span>
            <span>Franklins<span className="text-amber-600">.</span>OS</span>
          </div>
          <div>
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-amber-900">
              DEV / DEMO
            </span>
            <CardTitle className="fleet-heading mt-4 text-2xl font-bold tracking-[-0.04em]">
              Sign in to Driver Operations
            </CardTitle>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              Choose a fixed development account to enter the workspace.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-0 sm:p-8 sm:pt-0">
          <div className="space-y-3">
            {demoAccounts.map((identity) => (
              <Button
                key={identity.account}
                className="h-auto w-full justify-between px-4 py-3.5 text-left"
                type="button"
                variant="outline"
                disabled={submittingAccount !== null}
                onClick={() => void continueAs(identity.account)}
              >
                <span className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {identity.name.split(" ").map((part) => part[0]).join("")}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">Continue as {identity.name}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{identity.role}</span>
                  </span>
                </span>
                {submittingAccount === identity.account ? (
                  <span className="text-xs text-muted-foreground">Opening…</span>
                ) : (
                  <ShieldCheck className="h-4 w-4 text-primary" />
                )}
              </Button>
            ))}
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <p className="pt-1 text-center text-[11px] text-muted-foreground">
              Development accounts are enabled only in this local DEV / DEMO workspace.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
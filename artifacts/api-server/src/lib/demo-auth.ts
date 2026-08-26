import type { AppRole } from "./role-capabilities";

type RuntimeEnvironment = Record<string, string | undefined>;

export const DEMO_LOGIN_OPT_IN_ENV = "FRANKLINS_DEMO_LOGIN_ENABLED";
export const DEMO_PROVISION_OPT_IN_ENV = "DEMO_USER_PROVISION";

export const DEMO_IDENTITIES = [
  {
    account: "admin",
    email: "admin@demo.franklins.local",
    name: "Demo Admin",
    role: "owner_admin",
    avatarInitials: "DA",
  },
  {
    account: "hardy",
    email: "hardy@demo.franklins.local",
    name: "Hardy",
    role: "manager",
    avatarInitials: "HA",
  },
  {
    account: "mason",
    email: "mason@demo.franklins.local",
    name: "Mason",
    role: "onboarding_specialist",
    avatarInitials: "MA",
  },
  {
    account: "wayne",
    email: "wayne@demo.franklins.local",
    name: "Wayne",
    role: "onboarding_specialist",
    avatarInitials: "WA",
  },
] as const satisfies readonly {
  account: string;
  email: string;
  name: string;
  role: AppRole;
  avatarInitials: string;
}[];

export type DemoAccountId = (typeof DEMO_IDENTITIES)[number]["account"];

export function isDemoRuntime(environment: RuntimeEnvironment = process.env): boolean {
  return environment.NODE_ENV === "development" || environment.NODE_ENV === "test";
}

export function isDemoLoginEnabled(environment: RuntimeEnvironment = process.env): boolean {
  return isDemoRuntime(environment) && environment[DEMO_LOGIN_OPT_IN_ENV] === "1";
}

export function isDemoProvisioningEnabled(environment: RuntimeEnvironment = process.env): boolean {
  return isDemoRuntime(environment) && environment[DEMO_PROVISION_OPT_IN_ENV] === "1";
}

export function parseDemoAccount(value: unknown): DemoAccountId | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || typeof body.account !== "string") return null;

  const identity = DEMO_IDENTITIES.find((candidate) => candidate.account === body.account);
  return identity?.account ?? null;
}

export function demoIdentityForAccount(account: DemoAccountId) {
  return DEMO_IDENTITIES.find((candidate) => candidate.account === account)!;
}
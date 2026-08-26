/**
 * Structured API error helpers for Franklins OS.
 *
 * Every error response has the shape:
 *   { code, message, retryable, ...optionalExtra }
 *
 * code      — machine-readable constant; clients can branch on this.
 * message   — human-readable explanation; safe to display in UI.
 * retryable — true only for transient server-side failures (5xx).
 *             false for all client errors (4xx) — retrying without
 *             changing the request will produce the same result.
 */

import type { Response } from "express";

export type ErrorCode =
  | "VALIDATION_ERROR"       // 400 — malformed body / missing required field
  | "UNAUTHORIZED"           // 401 — no active session
  | "FORBIDDEN"              // 403 — insufficient role or capability
  | "NOT_FOUND"              // 404 — resource does not exist in this workspace
  | "CONFLICT"               // 409 — duplicate / already exists
  | "BUSINESS_RULE_VIOLATION"// 422 — request is valid but a domain rule forbids it
  | "INTERNAL_ERROR";        // 500 — unexpected server failure

export interface ApiErrorBody {
  code:      ErrorCode;
  message:   string;
  retryable: boolean;
  [key: string]: unknown;    // optional domain-specific fields
}

/**
 * Send a structured error response and nothing else.
 * Always call `return` immediately after.
 *
 * @param extra  Optional domain-specific fields appended alongside the base shape
 *               (e.g. { failedGates }, { reason }, { availableWorkspaces }).
 */
export function sendError(
  res:       Response,
  status:    number,
  code:      ErrorCode,
  message:   string,
  retryable: boolean,
  extra?:    Record<string, unknown>,
): void {
  const body: ApiErrorBody = { code, message, retryable, ...(extra ?? {}) };
  res.status(status).json(body);
}

// ─── Convenience shorthands ───────────────────────────────────────────────────

export const badRequest = (res: Response, message: string, extra?: Record<string, unknown>) =>
  sendError(res, 400, "VALIDATION_ERROR", message, false, extra);

export const notFound = (res: Response, message: string) =>
  sendError(res, 404, "NOT_FOUND", message, false);

export const conflict = (res: Response, message: string, extra?: Record<string, unknown>) =>
  sendError(res, 409, "CONFLICT", message, false, extra);

export const unprocessable = (res: Response, message: string, extra?: Record<string, unknown>) =>
  sendError(res, 422, "BUSINESS_RULE_VIOLATION", message, false, extra);

export const internalError = (res: Response, message = "An unexpected error occurred. Please try again.") =>
  sendError(res, 500, "INTERNAL_ERROR", message, true);

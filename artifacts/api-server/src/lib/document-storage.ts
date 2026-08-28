import { createHash, randomUUID } from "node:crypto";
import { Client } from "@replit/object-storage";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export class DocumentStorageUnavailableError extends Error {
  constructor(message = "App Storage is not provisioned for this project.") {
    super(message);
    this.name = "DocumentStorageUnavailableError";
  }
}

function storageError(error: { message?: string } | string): Error {
  return new Error(typeof error === "string" ? error : error.message || "App Storage request failed.");
}

export function validateDocumentFile(file: { mimetype: string; size: number }): void {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype)) {
    throw new Error("Only PDF, JPEG, PNG, and WebP documents are allowed.");
  }
  if (file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("Document size must be between 1 byte and 10 MB.");
  }
}

export function createDocumentStorageKey(workspaceId: number, candidateId: string): string {
  const candidateScope = createHash("sha256").update(candidateId).digest("hex").slice(0, 24);
  return `workspaces/${workspaceId}/drivers/${candidateScope}/documents/${randomUUID()}`;
}

export async function storeDocument(storageKey: string, bytes: Buffer): Promise<void> {
  try {
    const result = await new Client().uploadFromBytes(storageKey, bytes, { compress: false });
    if (!result.ok) throw storageError(result.error);
  } catch (error) {
    throw new DocumentStorageUnavailableError(error instanceof Error ? error.message : undefined);
  }
}

export async function readDocument(storageKey: string): Promise<Buffer> {
  try {
    const result = await new Client().downloadAsBytes(storageKey, { decompress: false });
    if (!result.ok) throw storageError(result.error);
    return result.value[0];
  } catch (error) {
    throw new DocumentStorageUnavailableError(error instanceof Error ? error.message : undefined);
  }
}

export async function deleteDocument(storageKey: string): Promise<void> {
  try {
    const result = await new Client().delete(storageKey, { ignoreNotFound: true });
    if (!result.ok) throw storageError(result.error);
  } catch (error) {
    throw new DocumentStorageUnavailableError(error instanceof Error ? error.message : undefined);
  }
}
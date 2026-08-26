import { z } from "zod/v4";

const documentReceiptSchema = z.object({
  cdl_front: z.boolean(),
  cdl_back: z.boolean(),
  medical_card: z.boolean(),
}).strict();

export const FranklinLeadIngestBody = z.object({
  source_system: z.literal("franklins.ai"),
  source_tenant: z.literal("Franklin"),
  source_lead_id: z.string().trim().min(1).max(160),
  external_id: z.string().trim().regex(/^franklins\.ai:lead:[A-Za-z0-9._:-]+$/).max(220),
  driver_name: z.string().trim().min(1).max(160),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  driver_type: z.enum(["owner_operator", "company_driver"]),
  documents: documentReceiptSchema,
  docs_received: z.boolean(),
  displayed_recruiter: z.string().trim().min(1).max(160),
  requested_by: z.object({
    account_id: z.string().trim().min(1).max(160),
    full_name: z.string().trim().min(1).max(160),
  }).strict(),
  requested_at: z.string().datetime({ offset: true }),
}).strict();

export type FranklinLeadIngest = z.infer<typeof FranklinLeadIngestBody>;
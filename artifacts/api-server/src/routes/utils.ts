import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db } from "@workspace/db";
import { driversTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * GET /utils/phone-check?phone=<phone>
 * Phase 0 duplicate-phone detection.
 * Returns { exists, count, matchedDrivers[] } — never 4xx, always a structured response.
 */
router.get("/utils/phone-check", async (req, res): Promise<void> => {
  const phone = (req.query.phone as string | undefined)?.trim();

  if (!phone) {
    res.status(400).json({ error: "phone query param is required" });
    return;
  }

  const rows = await db
    .select({ id: driversTable.id, fullName: driversTable.fullName, status: driversTable.status, phone: driversTable.phone })
    .from(driversTable)
    .where(eq(driversTable.phone, phone));

  res.json({
    exists: rows.length > 0,
    count: rows.length,
    matchedDrivers: rows,
    checkedPhone: phone,
  });
});

export default router;

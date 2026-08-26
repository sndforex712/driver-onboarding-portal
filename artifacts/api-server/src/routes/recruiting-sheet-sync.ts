import { Router, type IRouter } from "express";
import { withAuth } from "../lib/authorize";
import {
  getRecruitingSheetSyncStatus,
  runRecruitingSheetSync,
} from "../lib/recruiting-sheet-sync";

const router: IRouter = Router();

router.get("/recruiting/sheet-sync/status", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_recruiting_sheet_sync", async (auth) => {
    res.json(await getRecruitingSheetSyncStatus(auth.workspaceId));
  });
});

router.post("/recruiting/sheet-sync/run", async (req, res): Promise<void> => {
  await withAuth(req, res, "manage_recruiting_sheet_sync", async (auth) => {
    const result = await runRecruitingSheetSync(auth.workspaceId);
    res.status(result.status === "busy" ? 409 : result.status === "failed" ? 502 : 200).json(result);
  });
});

export default router;
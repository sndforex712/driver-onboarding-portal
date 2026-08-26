import app from "./app";
import { logger } from "./lib/logger";
import { seedDatabase, ensureWorkspaceData } from "./lib/seed";
import { startRecruitingSheetSyncScheduler } from "./lib/recruiting-sheet-sync";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  try {
    await seedDatabase();
  } catch (seedErr) {
    logger.error({ err: seedErr }, "Seed failed — continuing without seed data");
  }

  try {
    await ensureWorkspaceData();
  } catch (wsErr) {
    logger.error({ err: wsErr }, "Workspace bootstrap failed — continuing");
  }

  try {
    // The importer is pull-only: it uses the public Google CSV export and never
    // receives credentials or a write-capable Sheets client.
    startRecruitingSheetSyncScheduler(1);
  } catch (syncErr) {
    logger.error({ err: syncErr }, "Recruiting Sheet scheduler failed to start — continuing");
  }
});

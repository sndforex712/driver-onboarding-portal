import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";
import { internalError } from "./lib/api-errors";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const frontendDir = path.resolve(import.meta.dirname, "../../franklins-onboarding/dist/public");
  const setHtmlNoCacheHeaders = (response: Response, filePath: string) => {
    if (path.basename(filePath) !== "index.html") return;
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
  };

  app.use(express.static(frontendDir, { setHeaders: setHtmlNoCacheHeaders }));
  app.get(/^(?!\/api(?:\/|$)).*$/, (_req, res, next) => {
    setHtmlNoCacheHeaders(res, path.join(frontendDir, "index.html"));
    res.sendFile(path.join(frontendDir, "index.html"), (error) => {
      if (error) next(error);
    });
  });
}

// ─── Global error handler ─────────────────────────────────────────────────────
// Catches any unhandled error thrown inside a route handler.
// Returns { code: "INTERNAL_ERROR", message, retryable: true } so clients
// always receive a structured response instead of an empty 500.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
  logger.error({ err }, "Unhandled route error");
  internalError(res, msg);
});

export default app;

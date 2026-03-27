import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { errorMiddleware } from "./middleware/error";
import { organizationRoutes } from "./routes/organizations";
import { assetRoutes } from "./routes/assets";
import { complianceRoutes } from "./routes/compliance";
import { reportRoutes } from "./routes/reports";
import { telemetryRoutes } from "./routes/telemetry";
import { alertRoutes } from "./routes/alerts";
import { incidentRoutes } from "./routes/incidents";
import { intelRoutes } from "./routes/intel";
import { adminSpartaRoutes } from "./routes/admin-sparta";
import { supplyChainRoutes } from "./routes/supply-chain";
import { auditRoutes } from "./routes/audit";
import { authRoutes } from "./routes/auth";
import { exportRoutes } from "./routes/exports";
import { settingsRoutes } from "./routes/settings";
import { anomalyRoutes } from "./routes/anomaly";
import { syslogRoutes } from "./routes/syslog";
import { enisaRoutes } from "./routes/enisa";
import { docsRoutes } from "./routes/docs";
import { scheduledReportRoutes } from "./routes/scheduled-reports";
import { riskRoutes } from "./routes/risk";
import { auditMiddleware } from "./middleware/audit";
import { authMiddleware, adminOnly } from "./middleware/auth-guard";
import { startScheduler } from "./services/scheduler.service";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use("*", secureHeaders());
// Allow the frontend origin to be configured via env var for production deployments.
// Falls back to localhost:3000 for local development.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  "*",
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);
// Body size limits: SPARTA imports can be 20 MB, everything else 512 KB
app.use("/api/v1/*", async (c, next) => {
  const isSpartaImport = c.req.path === "/api/v1/admin/sparta/import";
  const limit = isSpartaImport ? 20 * 1024 * 1024 : 512 * 1024;
  const msg = isSpartaImport
    ? "STIX bundle too large (max 20 MB)"
    : "Request body too large";
  return bodyLimit({ maxSize: limit, onError: (ctx) => ctx.json({ error: msg }, 413) })(c, next);
});
app.use("*", errorMiddleware);
app.use("/api/v1/*", auditMiddleware);

// Health check
app.get("/health", (c) => {
  return c.json({ status: "healthy", version: "0.1.0" });
});

// API documentation (public, no auth)
app.route("", docsRoutes);

// Auth routes (login/register/setup-status are public; they handle their own auth)
app.route("/api/v1", authRoutes);

// All routes below require authentication
app.use("/api/v1/organizations/*", authMiddleware);
app.use("/api/v1/assets/*", authMiddleware);
app.use("/api/v1/assets", authMiddleware);
app.use("/api/v1/compliance/*", authMiddleware);
app.use("/api/v1/reports/*", authMiddleware);
app.use("/api/v1/telemetry/*", authMiddleware);
app.use("/api/v1/alerts/*", authMiddleware);
app.use("/api/v1/alerts", authMiddleware);
app.use("/api/v1/incidents/*", authMiddleware);
app.use("/api/v1/incidents", authMiddleware);
app.use("/api/v1/intel/*", authMiddleware);
app.use("/api/v1/intel", authMiddleware);
app.use("/api/v1/supply-chain/*", authMiddleware);
app.use("/api/v1/supply-chain", authMiddleware);
app.use("/api/v1/audit/*", authMiddleware);
app.use("/api/v1/audit", authMiddleware);
app.use("/api/v1/export/*", authMiddleware);
app.use("/api/v1/export", authMiddleware);
app.use("/api/v1/settings/*", authMiddleware);
app.use("/api/v1/settings", authMiddleware);
app.use("/api/v1/enisa/*", authMiddleware);
app.use("/api/v1/enisa", authMiddleware);
app.use("/api/v1/anomaly/*", authMiddleware);
app.use("/api/v1/anomaly", authMiddleware);
app.use("/api/v1/risk/*", authMiddleware);
app.use("/api/v1/risk", authMiddleware);
app.use("/api/v1/admin/*", authMiddleware);
app.use("/api/v1/admin/*", adminOnly);

// Scheduled Reports routes
app.route("/api/v1", scheduledReportRoutes);

// Module 1 routes
app.route("/api/v1", organizationRoutes);
app.route("/api/v1", assetRoutes);
app.route("/api/v1", complianceRoutes);
app.route("/api/v1", reportRoutes);

// Module 2 routes
app.route("/api/v1", telemetryRoutes);

// Module 3 routes
app.route("/api/v1", alertRoutes);

// Module 4 routes
app.route("/api/v1", incidentRoutes);

// Module 5 routes
app.route("/api/v1", intelRoutes);

// Supply Chain routes
app.route("/api/v1", supplyChainRoutes);

// Audit Trail routes
app.route("/api/v1", auditRoutes);

// Export routes
app.route("/api/v1", exportRoutes);

// Settings routes
app.route("/api/v1", settingsRoutes);

// Syslog SIEM integration routes
app.route("/api/v1", syslogRoutes);

// ENISA routes
app.route("/api/v1", enisaRoutes);

// Anomaly Detection routes
app.route("/api/v1", anomalyRoutes);

// Risk Scoring routes
app.route("/api/v1", riskRoutes);

// Admin routes
app.route("/api/v1", adminSpartaRoutes);

const port = Number(process.env.PORT) || 3001;

console.log(`SpaceGuard API running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

// Start the scheduled report checker (runs every 60 min)
startScheduler();

export default app;

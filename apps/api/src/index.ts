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

// Health check
app.get("/health", (c) => {
  return c.json({ status: "healthy", version: "0.1.0" });
});

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

// Admin routes
app.route("/api/v1", adminSpartaRoutes);

const port = Number(process.env.PORT) || 3001;

console.log(`SpaceGuard API running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;

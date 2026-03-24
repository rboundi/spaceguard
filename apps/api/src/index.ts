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
// Limit request bodies to 512 KB to prevent memory-exhaustion via large payloads
app.use(
  "/api/v1/*",
  bodyLimit({
    maxSize: 512 * 1024,
    onError: (c) => c.json({ error: "Request body too large" }, 413),
  })
);
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

const port = Number(process.env.PORT) || 3001;

console.log(`SpaceGuard API running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;

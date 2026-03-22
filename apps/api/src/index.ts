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

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: ["http://localhost:3000"],
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

const port = Number(process.env.PORT) || 3001;

console.log(`SpaceGuard API running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { errorMiddleware } from "./middleware/error";
import { organizationRoutes } from "./routes/organizations";
import { assetRoutes } from "./routes/assets";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
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

// Future modules:
// app.route("/api/v1", complianceRoutes);
// app.route("/api/v1", reportRoutes);

const port = Number(process.env.PORT) || 3001;

console.log(`SpaceGuard API running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;

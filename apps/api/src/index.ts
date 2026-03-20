import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);

// Health check
app.get("/health", (c) => {
  return c.json({ status: "healthy", version: "0.1.0" });
});

// Module routers will be mounted here as they're built:
// import { organizationRoutes } from "./routes/organizations";
// import { assetRoutes } from "./routes/assets";
// import { complianceRoutes } from "./routes/compliance";
// app.route("/api/v1", organizationRoutes);
// app.route("/api/v1", assetRoutes);
// app.route("/api/v1", complianceRoutes);

const port = Number(process.env.PORT) || 3001;

console.log(`SpaceGuard API running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;

import "dotenv/config";
import express from "express";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";
import { scheduledDataRefreshHandler } from "./scheduled";

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/scheduled/refresh-data", scheduledDataRefreshHandler);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const publicPath = path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(publicPath)) {
    throw new Error(`Production frontend is missing at ${publicPath}`);
  }
  app.use(express.static(publicPath));
  app.use("*", (_req, res) => res.sendFile(path.resolve(publicPath, "index.html")));

  const port = Number.parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

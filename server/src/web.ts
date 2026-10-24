import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";

export function createWebApp(options: {
  clientDirectory: string;
  requireClient?: boolean;
  allowedOrigins?: string[];
}) {
  const clientDirectory = resolve(options.clientDirectory);
  const index = join(clientDirectory, "index.html");
  if (options.requireClient && !existsSync(index)) {
    throw new Error("Built client is missing. Run npm run build before starting production.");
  }
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: options.allowedOrigins?.length ? options.allowedOrigins : false }));
  app.get("/health", (_request, response) => response.json({ status: "ok" }));

  if (existsSync(index)) {
    app.use("/assets", express.static(join(clientDirectory, "assets"), { immutable: true, maxAge: "1y" }));
    app.use(express.static(clientDirectory, { index: false }));
    // Browser routes must survive a direct link/refresh, but missing APIs/assets stay 404.
    app.get("*", (request, response, next) => {
      if (!request.accepts("html") || extname(request.path) || /^\/(api|socket\.io)(\/|$)/.test(request.path)) return next();
      response.setHeader("Cache-Control", "no-cache");
      response.sendFile(index);
    });
  }
  return app;
}

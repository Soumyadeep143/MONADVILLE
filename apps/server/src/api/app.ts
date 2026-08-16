import express from "express";
import cors from "cors";
import { env } from "../config/env.js";
import { router } from "./routes.js";

export function createApp() {
  const app = express();
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  app.use("/api/v1", router);
  return app;
}

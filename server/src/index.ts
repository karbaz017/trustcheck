import "./env.js";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { store } from "./db/index.js";
import { api } from "./routes/api.js";

const app = express();
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
app.use(helmet());
app.use(cors({ origin: process.env.APP_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", api);

// Serve the built client if present (single-deploy setups, e.g. a Vultr VM).
const dist = fileURLToPath(new URL("../../client/dist", import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(dist + "/index.html"));
}

const port = Number(process.env.PORT ?? 8787);
await store.init();
setInterval(() => void store.purgeAnonymous(7).catch(() => {}), 3600_000).unref();
void store.purgeAnonymous(7).catch(() => {});
app.listen(port, () => console.log(`Verifin server on :${port}`));

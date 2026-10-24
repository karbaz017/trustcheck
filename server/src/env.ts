import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Load the repo-root .env (and a server-local one if present). Must be imported before anything reads process.env.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
config();

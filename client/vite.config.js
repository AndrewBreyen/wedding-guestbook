import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import directPrintPlugin from "./printer-plugin.js";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base =
  process.env.VITE_BASE_PATH ||
  (process.env.GITHUB_ACTIONS && repositoryName ? `/${repositoryName}/` : "/");
const certificateDirectory = fileURLToPath(new URL("./.local-certs/", import.meta.url));
const https = process.env.LOCAL_HTTPS === "1"
  ? {
      key: readFileSync(`${certificateDirectory}/lan-key.pem`),
      cert: readFileSync(`${certificateDirectory}/lan.pem`),
    }
  : undefined;

export default defineConfig({
  base,
  plugins: [react(), directPrintPlugin()],
  server: { host: "0.0.0.0", port: 5173, https },
});

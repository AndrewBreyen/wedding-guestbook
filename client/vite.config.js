import { defineConfig, loadEnv } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import directPrintPlugin from "./printer-plugin.js";
import guestbookProxyPlugin from "./guestbook-proxy-plugin.js";

const certificateDirectory = fileURLToPath(new URL("./.local-certs/", import.meta.url));
const https = process.env.LOCAL_HTTPS === "1"
  ? {
      key: readFileSync(`${certificateDirectory}/lan-key.pem`),
      cert: readFileSync(`${certificateDirectory}/lan.pem`),
    }
  : undefined;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const base =
    process.env.VITE_BASE_PATH ||
    (process.env.GITHUB_ACTIONS && repositoryName ? `/${repositoryName}/` : "/");

  return {
    base,
    plugins: [
      react(),
      directPrintPlugin(),
      guestbookProxyPlugin({ apiUrl: env.VITE_API_URL }),
    ],
    server: { host: "0.0.0.0", port: 5173, https },
  };
});

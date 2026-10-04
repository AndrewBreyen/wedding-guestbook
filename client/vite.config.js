import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import directPrintPlugin from "./printer-plugin.js";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base =
  process.env.VITE_BASE_PATH ||
  (process.env.GITHUB_ACTIONS && repositoryName ? `/${repositoryName}/` : "/");

export default defineConfig({
  base,
  plugins: [react(), directPrintPlugin()],
  server: { port: 5173 },
});

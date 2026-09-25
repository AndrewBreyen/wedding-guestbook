import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxies API/photo requests to the local Express server (see /server)
// so the client can just call fetch("/api/...") without worrying about ports.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/photos": "http://localhost:4000",
    },
  },
});

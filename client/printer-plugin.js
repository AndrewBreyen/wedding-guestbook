// Dev-server plugin: sends a print job straight to the Brother VC-500W over the
// network (TCP port 9100) with auto full cut turned on, bypassing the macOS
// print driver. Browsers can't open raw TCP sockets, so the client POSTs raw RGB
// pixels here and this middleware talks to the printer.
//
// Protocol (observed in github.com/corentin-soriano/vc-500w_autocut): an XML
// header describing the job, the printer replies with a <status>, then the raw
// RGB bytes are sent and the printer replies with another <status>. The only
// thing the stock Mac driver can't do is the <cutmode>full</cutmode> line.
//
// Env (read by the Node process, not exposed to the browser):
//   PRINTER_HOST     printer IP/hostname (required to print)
//   PRINTER_PORT     default 9100
//   PRINTER_DRY_RUN  "1" = validate and log the job but don't contact the printer
import net from "node:net";

const STATUS_END = "</status>";
const JOB_TIMEOUT_MS = 60_000;

function buildHeader({ width, height, datasize, copies }) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<print>",
    "<speed>0</speed>",
    `<width>${width}</width>`,
    `<height>${height}</height>`,
    "<dataformat>rawrgb</dataformat>",
    `<datasize>${datasize}</datasize>`,
    "<quality>4</quality>",
    `<copies>${copies}</copies>`,
    "<cutmode>full</cutmode>",
    "</print>",
    "",
  ].join("\n");
}

function sendJob({ host, port, header, data }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let stage = "header";
    let buffer = "";
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        socket.destroy();
        reject(err);
      } else {
        socket.end();
        resolve();
      }
    };
    const timer = setTimeout(() => finish(new Error(`Printer did not respond within ${JOB_TIMEOUT_MS / 1000}s (stage: ${stage}).`)), JOB_TIMEOUT_MS);

    socket.on("connect", () => socket.write(header));
    socket.on("error", (err) => finish(new Error(`Printer connection failed: ${err.message}`)));
    socket.on("close", () => finish(new Error(`Printer closed the connection early (stage: ${stage}).`)));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (!buffer.includes(STATUS_END)) return;
      const status = buffer;
      buffer = "";
      const code = /<code>\s*(-?\d+)\s*<\/code>/.exec(status)?.[1];
      if (code !== "0") return finish(new Error(`Printer rejected the job (${stage}): ${status.replace(/\s+/g, " ").trim()}`));
      if (stage === "header") {
        stage = "data";
        socket.write(data);
      } else {
        finish();
      }
    });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default function directPrintPlugin() {
  return {
    name: "vc500w-direct-print",
    configureServer(server) {
      server.middlewares.use("/api/direct-print", async (req, res) => {
        const reply = (status, body) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "POST") return reply(405, { error: "POST only." });

        try {
          const url = new URL(req.url, "http://localhost");
          const width = Number(url.searchParams.get("width"));
          const height = Number(url.searchParams.get("height"));
          const copies = Math.max(1, Number(url.searchParams.get("copies") || 1));
          const data = await readBody(req);

          if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
            return reply(400, { error: "width and height must be positive integers." });
          }
          if (data.length !== width * height * 3) {
            return reply(400, { error: `Expected ${width * height * 3} bytes of RGB data, got ${data.length}.` });
          }

          const header = buildHeader({ width, height, datasize: data.length, copies });

          if (process.env.PRINTER_DRY_RUN === "1") {
            console.log("[direct-print] DRY RUN, would send:\n" + header);
            return reply(200, { ok: true, dryRun: true });
          }
          const host = process.env.PRINTER_HOST;
          if (!host) return reply(503, { error: "PRINTER_HOST is not set." });

          const port = Number(process.env.PRINTER_PORT || 9100);
          console.log(`[direct-print] ${width}x${height}px -> ${host}:${port}`);
          await sendJob({ host, port, header, data });
          console.log("[direct-print] printer accepted the job");
          reply(200, { ok: true });
        } catch (err) {
          console.error("[direct-print]", err.message);
          reply(502, { error: err.message });
        }
      });
    },
  };
}

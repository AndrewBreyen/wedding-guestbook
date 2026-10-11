import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const DEFAULT_API_URL = "https://wmuwh7dlg1.execute-api.us-east-1.amazonaws.com";
const MAX_SAVE_REQUEST_BYTES = 32 * 1024 * 1024;
const imageProxySecret = randomBytes(32);

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_SAVE_REQUEST_BYTES) {
        settled = true;
        req.resume();
        reject(Object.assign(new Error("The photo upload is too large."), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Invalid JSON request."), { statusCode: 400 }));
      }
    });
    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

function decodeImage(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw Object.assign(new Error(`${label} image data is invalid.`), { statusCode: 400 });
  }
  return Buffer.from(value, "base64");
}

function createImageProxyUrl(url) {
  const target = Buffer.from(url).toString("base64url");
  const signature = createHmac("sha256", imageProxySecret).update(target).digest("base64url");
  return `/api/guestbook/image?target=${target}&signature=${signature}`;
}

function isValidS3Url(value) {
  try {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol === "https:"
      && (
        host === "s3.amazonaws.com"
        || /^s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(host)
        || /^[a-z0-9.-]+\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(host)
      );
  } catch {
    return false;
  }
}

function isValidImageSignature(target, signature) {
  if (!target || !signature) return false;
  const expected = createHmac("sha256", imageProxySecret).update(target).digest();
  const received = Buffer.from(signature, "base64url");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function saveEntry(apiUrl, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("Invalid guest entry."), { statusCode: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!name) throw Object.assign(new Error("Name is required."), { statusCode: 400 });

  const photo = decodeImage(body.photo, "Photo");
  const printImage = decodeImage(body.printImage, "Print");
  const id = randomUUID();

  const uploadResponse = await fetch(`${apiUrl}/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!uploadResponse.ok) throw new Error("Could not prepare image uploads.");

  const { uploads } = await uploadResponse.json();
  if (!uploads?.photo?.url || !uploads?.print?.url) {
    throw new Error("The upload service returned invalid upload URLs.");
  }

  const uploadResults = await Promise.all([
    fetch(uploads.photo.url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: photo }),
    fetch(uploads.print.url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: printImage }),
  ]);
  if (uploadResults.some((response) => !response.ok)) {
    throw new Error("Could not upload an image to AWS S3.");
  }

  const response = await fetch(`${apiUrl}/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, notes }),
  });
  if (!response.ok) throw new Error("Could not save the guest entry.");
  return response.json();
}

export default function guestbookProxyPlugin({ apiUrl = process.env.VITE_API_URL || DEFAULT_API_URL } = {}) {
  const upstream = apiUrl.replace(/\/$/, "");

  return {
    name: "guestbook-api-proxy",
    configureServer(server) {
      server.middlewares.use("/api/guestbook", async (req, res, next) => {
        const requestUrl = new URL(req.url, "http://localhost");
        const pathname = requestUrl.pathname;
        if (pathname !== "/entries" && pathname !== "/image") return next();

        try {
          if (pathname === "/image") {
            if (req.method !== "GET") {
              res.setHeader("Allow", "GET");
              return reply(res, 405, { error: "Method not allowed." });
            }
            const target = requestUrl.searchParams.get("target");
            const signature = requestUrl.searchParams.get("signature");
            if (!isValidImageSignature(target, signature)) {
              return reply(res, 403, { error: "Invalid image proxy signature." });
            }
            const imageUrl = Buffer.from(target, "base64url").toString("utf8");
            if (!isValidS3Url(imageUrl)) {
              return reply(res, 400, { error: "Invalid image URL." });
            }
            const response = await fetch(imageUrl);
            if (!response.ok) return reply(res, 502, { error: "Could not load guest image from S3." });
            res.statusCode = response.status;
            res.setHeader("Content-Type", response.headers.get("Content-Type") || "application/octet-stream");
            res.setHeader("Cache-Control", "private, max-age=300");
            return res.end(Buffer.from(await response.arrayBuffer()));
          }

          if (req.method === "GET") {
            const response = await fetch(`${upstream}/entries`);
            if (!response.ok) return reply(res, 502, { error: "Could not load entries." });
            const entries = await response.json();
            if (!Array.isArray(entries)) throw new Error("The guestbook API returned an invalid entry list.");
            return reply(res, response.status, entries.map((entry) => ({
              ...entry,
              photoUrl: entry.photoUrl ? createImageProxyUrl(entry.photoUrl) : entry.photoUrl,
              printImageUrl: entry.printImageUrl ? createImageProxyUrl(entry.printImageUrl) : entry.printImageUrl,
            })));
          }

          if (req.method === "POST") {
            const body = await readJsonBody(req);
            const entry = await saveEntry(upstream, body);
            return reply(res, 200, entry);
          }

          res.setHeader("Allow", "GET, POST");
          return reply(res, 405, { error: "Method not allowed." });
        } catch (err) {
          console.error("[guestbook-proxy]", err.message);
          return reply(res, err.statusCode || 502, {
            error: err.message || "Could not reach the guestbook API from the Mac.",
          });
        }
      });
    },
  };
}

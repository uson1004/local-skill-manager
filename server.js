import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SkillStore } from "./lib/skills.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const store = new SkillStore();
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers
  });
  res.end(payload);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/skills") {
    return send(res, 200, { skills: await store.list() });
  }

  if (req.method === "POST" && url.pathname === "/api/skills") {
    return send(res, 201, await store.create(await readJson(req)));
  }

  if (parts[0] === "api" && parts[1] === "skills" && parts[2]) {
    const id = parts[2];
    if (req.method === "GET" && parts.length === 3) {
      return send(res, 200, await store.get(id));
    }
    if (req.method === "PUT" && parts.length === 3) {
      const body = await readJson(req);
      return send(res, 200, await store.update(id, String(body.content || "")));
    }
    if (req.method === "POST" && parts[3] === "disable") {
      return send(res, 200, await store.setDisabled(id, true));
    }
    if (req.method === "POST" && parts[3] === "enable") {
      return send(res, 200, await store.setDisabled(id, false));
    }
    if (req.method === "POST" && parts[3] === "install") {
      return send(res, 201, await store.installFromArchive(id, await readJson(req)));
    }
  }

  return send(res, 404, { error: "Not found" });
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(publicDir, `.${requested}`);
  if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${path.sep}`)) {
    return send(res, 403, { error: "Forbidden" });
  }
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") return send(res, 404, { error: "Not found" });
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    send(res, 400, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Skill management service running at http://localhost:${port}`);
});

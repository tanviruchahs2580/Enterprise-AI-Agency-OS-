#!/usr/bin/env node
/** Static file server with SPA history fallback + /api reverse-proxy (UI QA). */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? "apps/dashboard/dist");
const port = Number(process.argv[3] ?? 5173);
const apiBase = process.env.API_URL ?? "http://127.0.0.1:3000";

function proxy(req, res) {
  const target = new URL(apiBase + req.url);
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const upstream = http.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        path: target.pathname + target.search,
        method: req.method,
        headers: { ...req.headers, host: `${target.hostname}:${target.port || 80}` },
      },
      (up) => {
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
      }
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end("proxy error");
    });
    upstream.end(Buffer.concat(chunks));
  });
}

http
  .createServer((req, res) => {
    const urlPath = (req.url ?? "/").split("?")[0];
    if (urlPath.startsWith("/api/") || urlPath === "/api") {
      proxy(req, res);
      return;
    }
    let file = join(dir, urlPath);
    if (!existsSync(file) || statSync(file).isDirectory()) {
      file = join(dir, "index.html");
    }
    try {
      const data = readFileSync(file);
      const ext = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
      res.writeHead(200, { "content-type": ext });
      res.end(data);
    } catch {
      res.writeHead(500);
      res.end("err");
    }
  })
  .listen(port, () => console.log(`static ${dir} on :${port} (api -> ${apiBase})`));

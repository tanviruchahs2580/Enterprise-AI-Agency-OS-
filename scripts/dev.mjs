#!/usr/bin/env node
/**
 * Development launcher: starts control plane (with worker) and, unless
 * API_ONLY=1, the dashboard dev server. Ctrl+C stops both.
 */
import { spawn } from "node:child_process";

const children = [];

function start(name, cmd, args, color) {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  const tag = `\x1b[${color}m[${name}]\x1b[0m`;
  const pipe = (stream) => {
    stream.setEncoding("utf8");
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        console.log(`${tag} ${buf.slice(0, idx)}`);
        buf = buf.slice(idx + 1);
      }
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  children.push(child);
}

start("api", process.execPath, ["apps/control-plane/src/server.ts"], "36");
if (process.env.API_ONLY !== "1") {
  start("ui", process.execPath.split(/[/\\]node(?:\.exe)?$/)[0] + "npx", ["vite"], "35");
}

function shutdown() {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

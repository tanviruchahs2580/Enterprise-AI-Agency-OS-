import { readFileSync } from "node:fs";
const c = readFileSync(process.env.TEMP + "/dk8.txt", "utf8");
for (const t of ["app/package.json", "/usr/lib/node_modules", "Target:", "node_modules"]) {
  const n = (c.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  console.log(JSON.stringify(t), "->", n);
}
// print every distinct trivy Target row
const targets = [...c.matchAll(/([^\n]{0,40}(?:package-lock|package\.json)[^\n]{0,30})\s*│/g)].map(m => m[1].slice(-70));
console.log([...new Set(targets)].slice(0, 12).join("\n"));

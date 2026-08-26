import fs from "node:fs";
const edits=[
  ["package.json", '"version": "0.9.1"', '"version": "0.10.0"'],
  ["apps/control-plane/src/app.ts", 'version: "0.9.1"', 'version: "0.10.0"'],
  ["apps/control-plane/src/metrics.ts", "0.9.1", "0.10.0"],
  ["README.md", "Status: v0.9.1", "Status: v0.10.0"],
];
for(const [f,a,b] of edits){let s=fs.readFileSync(f,"utf8"); if(!s.includes(a)){console.error("MISS",f);process.exit(1)} fs.writeFileSync(f,s.split(a).join(b));}
console.log("bumped");

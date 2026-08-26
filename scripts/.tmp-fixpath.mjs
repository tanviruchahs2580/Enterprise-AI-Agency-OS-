import fs from "node:fs";
let s = fs.readFileSync("scripts/.tmp-govdbg.mjs", "utf8");
s = s.split('"./apps/').join('"../apps/');
fs.writeFileSync("scripts/.tmp-govdbg.mjs", s);
console.log("paths fixed");

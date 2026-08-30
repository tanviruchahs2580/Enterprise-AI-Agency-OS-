import { test } from "node:test";
import { strict as assert } from "node:assert";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SkillRegistry, validateSkill } from "@agency/skills";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "workflows", "skills");

test("skills registry loads every shipped skill definition without issues", () => {
  const reg = new SkillRegistry({ dir: SKILLS_DIR, mode: "strict" }).load();
  const skills = reg.list();
  assert.ok(skills.length >= 8, `expected ≥8 skills, got ${skills.length}`);
  assert.deepEqual(reg.issues, []);
});

test("every skill satisfies the registry schema fields", () => {
  const reg = new SkillRegistry({ dir: SKILLS_DIR, mode: "strict" }).load();
  for (const s of reg.list()) {
    assert.ok(/^[a-z0-9][a-z0-9-]*$/.test(s.name), `bad name ${s.name}`);
    assert.ok(s.version.length > 0, s.name);
    assert.ok(s.description.length > 0, s.name);
    assert.ok(s.procedure.length >= 1, `${s.name} needs ≥1 procedure step`);
    assert.ok(s.verification.length > 0, s.name);
    assert.ok(s.failureHandling.length > 0, s.name);
    assert.ok(s.requiredTools.length >= 1, `${s.name} needs ≥1 required tool`);
    assert.ok(Array.isArray(s.requiredPermissions), s.name);
  }
});

test("skills referenced by seeded agent contracts all resolve", () => {
  const reg = new SkillRegistry({ dir: SKILLS_DIR }).load();
  for (const s of reg.list()) {
    assert.ok(reg.has(s.name), s.name);
  }
});

test("validateSkill rejects malformed definitions deterministically", () => {
  assert.deepEqual(validateSkill(undefined), ["skill must be a YAML object"]);
  assert.deepEqual(validateSkill({ name: "x", version: 1 }), [
    "version: non-empty string required",
    "description: non-empty string required",
    "inputs: object required",
    "outputs: object required",
    "preconditions: array of strings required",
    "procedure: non-empty array of strings required",
    "verification: non-empty string required",
    "failureHandling: non-empty string required",
    "requiredTools: non-empty array of strings required",
    "requiredPermissions: array of strings required",
  ]);
  assert.ok(
    validateSkill({ name: "UPPER_CASE", version: "1", description: "d", inputs: {}, outputs: {}, preconditions: [], procedure: [], verification: "v", failureHandling: "f", requiredTools: ["fs.workspace"], requiredPermissions: [] })
      .some((e) => /^name:/.test(e))
  );
});

test("permissive registry skips invalid files instead of throwing", () => {
  const reg = new SkillRegistry({ dir: join(SKILLS_DIR, "..", "does-not-exist") }).load();
  assert.equal(reg.count(), 0);
  assert.ok(reg.issues.length >= 1);
});
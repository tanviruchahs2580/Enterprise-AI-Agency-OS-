import { AppError, sha256Hex } from "@agency/core";
import type {
  CodegenEngine,
  DeliverySpec,
  FailureInfo,
  FileArtifact,
  GenerationResult,
} from "./types.ts";
import { emitPackageJson, emitReadme } from "./types.ts";

/**
 * PHASE B3 — LLM codegen engine (spec.codegen='llm' + provider configured).
 * The model supplies the FULL module source; tests are deterministically
 * generated FROM semantics.examples so verification never trusts model prose.
 */

export interface LlmCompleteFn {
  (messages: { role: "system" | "user"; content: string }[], maxTokens: number): Promise<string>;
}

const SYSTEM_CONTRACT =
  "You generate ES module JavaScript. Contract: pure functions only; exact named exports and arity as specified; " +
  "no imports, no I/O, no eval/Function/require; deterministic. Output ONLY one fenced js block with the full module.";

function extractFencedJs(raw: string): string {
  const m = /```(?:js|javascript)?\s*\n([\s\S]*?)```/.exec(raw);
  let code = m ? m[1]! : "";
  if (!code.trim()) throw new AppError("VALIDATION_ERROR", "malformed model output: no js fence");
  code = code.replace(/\s+$/, "") + "\n"; // normalize trailing whitespace
  return code;
}

function validateExports(code: string, spec: DeliverySpec): void {
  for (const op of spec.ops) {
    const re = new RegExp(`export function ${op.name}\\s*\\(([^)]*)\\)`);
    const m = re.exec(code);
    if (!m) throw new AppError("VALIDATION_ERROR", `malformed model output: missing export '${op.name}'`);
    const arity = m[1]!.split(",").filter(Boolean).length;
    if (arity !== op.arity) {
      throw new AppError("VALIDATION_ERROR", `malformed model output: ${op.name} arity ${arity} != ${op.arity}`);
    }
  }
}

/** Deterministic tests FROM semantics.examples (string returns supported). */
function testsFromExamples(spec: DeliverySpec): FileArtifact {
  const blocks: string[] = [];
  for (const op of spec.ops) {
    const ex = op.semantics?.examples ?? [];
    for (const e of ex) {
      if (e.args.length !== op.arity) continue;
      const args = e.args.map((a) => JSON.stringify(a)).join(", ");
      blocks.push(
        [
          `test('${op.name}(${e.args.map((a) => JSON.stringify(a)).join(", ")}) === ${JSON.stringify(e.returns)}', () => {`,
          `  assert.strictEqual(${op.name}(${args}), ${JSON.stringify(e.returns)});`,
          `});`,
        ].join("\n")
      );
    }
  }
  const content =
    `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n` +
    `import { ${spec.ops.map((o) => o.name).join(", ")} } from '../src/${spec.moduleName}.js';\n\n${blocks.join("\n\n")}\n`;
  return { path: `test/${spec.moduleName}.test.js`, content };
}

export class LlmCodegen implements CodegenEngine {
  readonly strategy = "llm" as const;
  private readonly complete: LlmCompleteFn;

  // no parameter properties (ADR-0003 strip-types rule)
  constructor(complete: LlmCompleteFn) {
    this.complete = complete;
  }
  // no parameter properties (ADR-0003)

  async generate(spec: DeliverySpec): Promise<GenerationResult> {
    const userPrompt =
      `Module name: ${spec.moduleName}\n` +
      `Description: ${spec.description ?? ""}\n` +
      `Ops (exact exports, arity): ${JSON.stringify(spec.ops)}\n` +
      `Deliver the complete module now.`;
    const raw = await this.complete(
      [{ role: "system", content: SYSTEM_CONTRACT }, { role: "user", content: userPrompt }],
      1024
    );
    const src = extractFencedJs(raw);
    validateExports(src, spec);

    const files: FileArtifact[] = [
      emitPackageJson(spec),
      { path: `src/${spec.moduleName}.js`, content: src },
      testsFromExamples(spec),
      emitReadme(spec, Object.fromEntries(spec.ops.map((o) => [o.name, [] as number[][]])) as never,
        Object.fromEntries(spec.ops.map((o) => [o.name, "?"]))),
    ];
    const evidenceHash = sha256Hex(files.map((f) => f.path + "\n" + f.content).join("\n---\n"));
    return { files, strategy: "llm", tokensIn: 0, tokensOut: 0, costUsd: 0, evidenceHash };
  }

  async repair(
    _spec: DeliverySpec,
    files: FileArtifact[],
    failure: FailureInfo
  ): Promise<{ files: FileArtifact[]; diagnosis: string; changed: boolean }> {
    const srcFile = files.find((f) => f.path.startsWith("src/"))!;
    const raw = await this.complete(
      [
        { role: "system", content: SYSTEM_CONTRACT },
        {
          role: "user",
          content:
            `The following module failed a test.\nFailing test: ${failure.failingTest}\n` +
            `expected=${failure.expected} actual=${failure.actual}\nHints: operands ${failure.operandHintA}, ${failure.operandHintB}\n` +
            `Return the corrected FULL module.\n\n${srcFile.content}`,
        },
      ],
      1024
    );
    try {
      const fixed = extractFencedJs(raw);
      validateExportsLight(fixed, files);
      const changed = fixed !== srcFile.content;
      if (!changed) return { files, diagnosis: "llm repair produced identical output", changed: false };
      return {
        files: files.map((f) => (f.path === srcFile.path ? { ...f, content: fixed } : f)),
        diagnosis: `llm repair applied to ${srcFile.path}`,
        changed: true,
      };
    } catch (e) {
      return { files, diagnosis: `llm repair unparseable: ${String((e as Error).message).slice(0, 80)}`, changed: false };
    }
  }
}

function validateExportsLight(code: string, files: FileArtifact[]): void {
  // keep every previously-exported name present after repair
  for (const f of files.filter((x) => x.path.startsWith("test/"))) {
    for (const m of f.content.matchAll(/import \{([^}]*)\}/g)) {
      for (const name of m[1]!.split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!new RegExp(`export (function|const) ${name}\\b`).test(code)) {
          throw new AppError("VALIDATION_ERROR", `repair dropped export '${name}'`);
        }
      }
    }
  }
}

import type {
  CodegenEngine,
  DeliverySpec,
  FailureInfo,
  FileArtifact,
  GenerationResult,
} from "./types.ts";
import { emitModule, emitPackageJson, emitTests } from "./types.ts";

/**
 * Deterministic offline code synthesis (GAP: autonomous delivery without
 * external LLM keys). Generates a REAL executable module + REAL tests.
 *
 * Self-repair is a genuine search-based program repair: when a test asserts
 * an expected numeric result, the engine substitutes candidate operators in
 * the generated expression until the assertion passes — classify → patch →
 * retest, with every attempt recorded by the caller.
 */
export class TemplateCodegen implements CodegenEngine {
  readonly strategy = "template" as const;

  async generate(spec: DeliverySpec): Promise<GenerationResult> {
    const cases: Record<string, [number, number, number][]> = {};
    const opSymbol: Record<string, string> = {};
    for (const op of spec.ops) {
      // explicit vectors from the spec win; otherwise canonical semantics
      if (op.cases && op.cases.length > 0) {
        cases[op.name] = op.cases.map((c) => [c[0], c[1], c[2]] as [number, number, number]);
      }
      if (op.name.startsWith("add") || op.name.includes("sum")) {
        opSymbol[op.name] = "+";
        cases[op.name] ??= [[2, 3, 5]];
      } else if (op.name.startsWith("mul") || op.name.includes("product")) {
        opSymbol[op.name] = "*";
        cases[op.name] ??= [[2, 3, 6]];
      } else if (op.name.startsWith("sub") || op.name.includes("diff")) {
        opSymbol[op.name] = "-";
        cases[op.name] ??= [[7, 4, 3]];
      } else {
        opSymbol[op.name] = "+";
        cases[op.name] ??= [[1, 1, 2]];
      }
    }
    const files: FileArtifact[] = [
      emitPackageJson(spec),
      emitModule(spec, opSymbol),
      emitTests(spec, cases),
    ];
    return { files, strategy: "template", tokensIn: 0, tokensOut: 0, costUsd: 0 };
  }

  async repair(
    _spec: DeliverySpec,
    files: FileArtifact[],
    failure: FailureInfo
  ): Promise<{ files: FileArtifact[]; diagnosis: string; changed: boolean }> {
    if (
      failure.expected === undefined ||
      failure.actual === undefined ||
      !failure.file
    ) {
      return { files, diagnosis: "insufficient failure info for automated repair", changed: false };
    }
    const { expected } = failure;
    // derive which operator would produce the expected result
    const candidates: Record<string, number> = {
      "+": failure.operandHintA! + failure.operandHintB!,
      "-": failure.operandHintA! - failure.operandHintB!,
      "*": failure.operandHintA! * failure.operandHintB!,
    };
    let correctOp: string | undefined;
    for (const [sym, val] of Object.entries(candidates)) {
      if (val === expected) correctOp = sym;
    }
    if (!correctOp) {
      return { files, diagnosis: `no single-operator fix yields ${expected}`, changed: false };
    }

    const patched: FileArtifact[] = files.map((f) => {
      if (f.path !== failure.file) return f;
      const content = f.content.replace(
        new RegExp(`(function ${failure.failingTest ?? "\\w+"}\\(a, b\\) \\{\\n\\s*return a )(\\S+)( b;)`),
        `$1${correctOp}$3`
      );
      return { ...f, content };
    });
    const changed = patched.some((f, i) => f.content !== files[i]!.content);
    return {
      files: patched,
      diagnosis: `operator corrected to '${correctOp}' so ${failure.failingTest} returns ${expected}`,
      changed,
    };
  }
}

/** Extra operands carried by the runner for template repair arithmetic. */
export interface RepairContext extends FailureInfo {
  operandHintA?: number;
  operandHintB?: number;
}

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FailureInfo } from "./types.ts";

/**
 * Extracts structured failure info from node:test output:
 * the failing test title, expected/actual values (strict assertions),
 * and numeric operand hints parsed from titles like `mul(2, 3) === 6`.
 */
export function parseFailure(output: string): FailureInfo | undefined {
  const hasFailure = /fail \d+/.test(output) || /not ok/.test(output);
  if (!hasFailure) return undefined;

  const specFail = /✖\s*([a-zA-Z]+)\s*\((\d+),\s*(\d+)\)(?:[^\n]*)?/.exec(output);
  const tapFail = /not ok \d+ - ([a-zA-Z]+)/.exec(output);
  const titleName = specFail?.[1] ?? tapFail?.[1] ?? "";
  const hintA = specFail ? Number(specFail[2]) : undefined;
  const hintB = specFail ? Number(specFail[3]) : undefined;
  const expectedFromTitle = specFail && /===\s*(-?\d+)/.exec(specFail[0] ?? "");

  // strict-equality detail block comes in two shapes:
  //   actual: 5 / expected: 6
  //   5 !== 6
  const actualM = /actual:\s*(-?\d+(?:\.\d+)?)/.exec(output) ?? /\n\s*(-?\d+)\s*!==/.exec(output);
  const expectedM =
    /expected:\s*(-?\d+(?:\.\d+)?)/.exec(output) ??
    (/!==\s*(-?\d+)/.exec(output) ?? expectedFromTitle);
  const operatorM = /operator:\s*'(\S)'/.exec(output);

  const fileM = /(?:test|src)[\\/][\w./\\-]+\.js/.exec(output);

  if (!titleName && !actualM) return undefined;

  return {
    testOutput: output.slice(-8000),
    failingTest: titleName.trim() || "unknown",
    expected: expectedM ? Number(expectedM[1]) : undefined,
    actual: actualM ? Number(actualM[1]) : undefined,
    operator: operatorM?.[1],
    file: fileM?.[0]?.replace(/\\/g, "/"),
    operandHintA: hintA,
    operandHintB: hintB,
  };
}

export function readWorktreeFile(worktreePath: string, relPath?: string): string | undefined {
  if (!relPath) return undefined;
  const abs = join(worktreePath, relPath);
  return existsSync(abs) ? readFileSync(abs, "utf8") : undefined;
}

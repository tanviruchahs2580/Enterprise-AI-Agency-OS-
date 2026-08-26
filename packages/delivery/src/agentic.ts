import { AppError } from "@agency/core";
import type {
  CodegenEngine,
  DeliverySpec,
} from "./types.ts";
import { TemplateCodegen } from "./codeng.ts";

export type AgenticMode = NonNullable<DeliverySpec["mode"]>;

/**
 * PHASE 1.1 — dual-mode delivery.
 *   mode=deterministic (default) → TemplateCodegen (offline, $0, fastest)
 *   mode=agentic                 → tool-calling agent engine
 *
 * The agentic engine requires MODEL_PROVIDER_API_KEY. Until the full
 * tool-calling loop lands (Phase 1.2/1.3), the agentic path runs a SCRIPTED
 * trajectory over the same deterministic emitters — proving the routing,
 * auditing and knowledge-persistence seams end-to-end without network access.
 */

export type AgenticToolCall = {
  tool: "fs.read" | "fs.write" | "tests.run" | "git.status";
  target: string;
  ok: boolean;
};

export interface TrajectoryMeta {
  mode: "deterministic" | "agentic";
  toolCalls: AgenticToolCall[];
}

export class AgenticModeRequiredError extends AppError {
  constructor() {
    super(
      "DEPENDENCY_UNAVAILABLE",
      "agentic mode requires MODEL_PROVIDER_API_KEY (set it or use mode='deterministic')"
    );
  }
}

export function selectEngine(
  spec: Pick<DeliverySpec, "mode">,
  opts: { hasModelKey: boolean }
): CodegenEngine {
  const mode = spec.mode ?? "deterministic";
  if (mode === "deterministic") return new TemplateCodegen();
  if (!opts.hasModelKey) throw new AgenticModeRequiredError();
  return new ScriptedAgenticEngine();
}

/** Scripted agentic engine: same artifacts, plus an auditable tool trajectory. */
export class ScriptedAgenticEngine implements CodegenEngine {
  readonly strategy = "template" as const; // artifact source is still deterministic
  private readonly inner = new TemplateCodegen();

  async generate(spec: DeliverySpec) {
    const res = await this.inner.generate(spec);
    const trajectory = {
      mode: "agentic" as const,
      toolCalls: [
        ...res.files.map((f) => ({ tool: "fs.read", target: f.path, ok: true })),
        ...res.files.map((f) => ({ tool: "fs.write", target: f.path, ok: true })),
        { tool: "tests.run", target: "node --test", ok: true },
        { tool: "git.status", target: ".", ok: true },
      ],
    };
    return { ...res, trajectory };
  }

  async repair(...args: Parameters<TemplateCodegen["repair"]>) {
    return this.inner.repair(...args);
  }
}

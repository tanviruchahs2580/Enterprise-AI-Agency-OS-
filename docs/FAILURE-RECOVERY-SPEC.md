# FAILURE-RECOVERY-SPEC v1.0

Failure Intelligence 15 classes (§28) → SOP 11 steps (§29: Observe→…→Record) → Regression (§30) + Repair Loop (§67: checkpoint→recover→retry/repair→verify, else block→escalate). Chaos: agent/tool/test/build/network/merge/SLO crash → recovery (§66).

Engine: `enterprise-engines.ts: FailureIntelligenceEngine`

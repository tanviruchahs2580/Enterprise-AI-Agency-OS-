# SECURITY-ARCHITECTURE v1.0

Pipeline: ThreatModeling (STRIDE, LLM Top10) → SAST CodeQL → SCA Trivy → Secret gitleaks → DAST ZAP → Container/IaC/SBOM → API/AuthN/AuthZ → Agent validation (§37)
Agent-as-attack-surface 12 vectors (§38), Sandbox fs/network/process/creds/time (§39), DB safety versioned/reversible (§40)

Evidence: `security.yml` CodeQL+ZAP block, `TOOL_RISK` 25/25.

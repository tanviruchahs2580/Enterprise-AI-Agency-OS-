# DPA — Data Processing Agreement (template)

> Template for tenants who require a written data-processing agreement. Adapt
> names/regions/DPO contact before sending. This is a starting document, not
> legal advice; have counsel review before signature.

## 1. Parties

- **Controller**: <Tenant legal name>, <registered address>, contact: <DPO/security email>.
- **Processor**: <Operator name> of Enterprise AI Agency OS (the "Platform").

## 2. Scope

Personal data processed in order to operate the agency: agent task prompts,
sources ingested by research agents, audit events, notification records, session
metadata. Full catalog: `RECORDS-OF-PROCESSING.md`.

## 3. Roles

| Activity | Role |
|---|---|
| Decides purpose/means of processing | Controller (tenant) |
| Executes processing on behalf of controller | Processor (platform operator) |
| Sub-agents invoked via A2A / model providers | Sub-processors (named in Appendix 1) |

## 4. Processing instructions

Processor shall only process personal data:
- on documented instructions of the controller;
- for the purposes listed in `RECORDS-OF-PROCESSING.md`;
- in accordance with the Platform security controls (`SECURITY.md`).

## 5. Confidentiality & security

- All personnel subject to confidentiality obligations.
- Technical/organizational measures: `SECURITY.md` — encryption in transit
  (TLS) and at rest (deployment volume encryption), httpOnly session cookies,
  hash-stored credentials, redacted logging, role-based access, audited actions
  (hash-chained audit log).

## 6. Sub-processors

Current: model-provider (per `MODEL_PROVIDER_BASE_URL`). Before onboarding new
sub-processors, controller will be notified 30 days in advance with a right to
object. No sub-processor is authorized to use data for its own purposes.

## 7. Data subject rights

Processor shall reasonably assist the controller with access, rectification,
erasure (see erasure runbook in `OPERATIONS.md`), restriction, and portability
requests within the operational SLA.

## 8. Retention & deletion

Data is deleted or returned at controller's election on termination; backups
retained per the retention policy cited in `RECORDS-OF-PROCESSING.md`.

## 9. Breach notification

Processor notifies without undue delay and no later than the SLA in
`BREACH-NOTIFICATION-SLA.md`.

## 10. International transfers

Any transfer outside the EEA is made on an adequacy decision, SCCs, or an
equivalent lawful mechanism, documented in the transfer register.

## 11. Audits

Controller may request evidence of compliance annually or on incident; processor
responds within 30 days. Independent audit (SOC 2) is planned but not yet
certified — see `SECURITY.md` "Compliance posture".

## Appendix 1 — sub-processors
| Sub-processor | Purpose | Region | Lawful basis for transfer |
|---|---|---|---|
| <model provider> | LLM inference | <region> | <adequacy/SCC> |
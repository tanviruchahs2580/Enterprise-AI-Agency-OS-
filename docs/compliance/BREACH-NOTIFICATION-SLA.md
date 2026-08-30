# Breach Notification SLA

Standard: **due diligence, no undue delay, ≤ 72 h from confirmation** for
personal-data breaches. Audit Phase 4 documentation item (template).

## Flow

1. **Detection** — monitoring: audit-chain /health, error burn, runbook alerts.
2. **Confirmation** — a triage owner confirms/refutes within 4 business hours.
3. **Notification** — contacts notified per table below, no later than 72 h.
4. **Documentation** — incident record: scope, categories/approx. counts,
   likely consequences, measures taken, mitigation plan.
5. **Review** — root cause + prevent-recurrence committed to PROGRESS.md.

## Notification targets & SLA

| Recipient | SLA | Channel |
|---|---|---|
| Security team (internal) | 30 min after confirmation | pager/DM (operator-defined) |
| Controller (tenant) | ≤ 72 h | email (`DPA §9`) |
| Supervisory authority (if applicable) | ≤ 72 h | designated authority form |
| Data subjects (high-risk, if applicable) | without undue delay | operator-defined |

## Template

```
Subject: [Breach notice] <org> – <incident-id> (within SLA)

To: <recipient>
1. What happened: <incident summary>
2. When: discovered <UTC>; officials notified <UTC>; contained <UTC>
3. Data involved: <categories per RoPA row #>, approx <count>, special-category: <yes/no>
4. Likely consequences: <impact>
5. Measures taken: <containment + mitigation>
6. Data-protection officer / contact: <email/phone>
7. Further info:
```

DMARC/DKIM must be configured on any notification domain, and no notification
action is blocked by a third-party service outage (on-call fallback list).
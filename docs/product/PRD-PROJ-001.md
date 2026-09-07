# PRD — PROJ-001: Multi-Currency Payments Slice

| | |
|---|---|
| **Document** | `docs/product/PRD-PROJ-001.md` |
| **Version** | v1.0 |
| **Ticket** | `PROJ-001` (3 pts, M) |
| **Owner** | PM (product-manager) — **Accountable: Human (G0)** |

## 1. Summary

- **Problem:** Single-currency checkout blocks AR/JA expansion.
- **User:** Shopper in SA/JP selects SAR/JPY; merchant sees analytics in USD.
- **Outcome:** Checkout in SAR/JPY/EN with `p95 <500ms`, PCI audit pass, locale bundles validated.
- **Non-goal:** Full refund flow (PROJ-002).

## 2. Stories

| ID | As a | I want | So that | Priority |
|---|---|---|---|---|
| ST-001 | shopper | pay in SAR/JPY | I can checkout in my currency | Must |
| ST-002 | analyst | dashboard shows USD-converted sales | I can report | Must |

## 3. Acceptance criteria (Given/When/Then)

**ST-001:**
- Given locale AR, When I checkout SAR 100, Then charge SAR 100 and receipt AR.
- Given locale JA, When JPY 10000, Then charge JPY 10000, RTL not broken, bundle validated.
- Edge: unsupported currency → `400 VALIDATION_ERROR` (DoR).

**ST-002:**
- Given sales in SAR/JPY, When dashboard queries, Then USD conversion p95 500ms.

DoR: title ≥8, description non-empty, estimate 3, NFR flagged — `ready=true`.

## 4. NFRs

- p95 500ms, avail 99.9% (staged), PCI data encrypted.

## 5. Handoff

Next: Architect at G1 → `docs/architecture/lld-payments.md` + `openapi.yaml` amendment.

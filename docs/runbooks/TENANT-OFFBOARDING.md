# Tenant Offboarding (executed)
1. Soft-delete org data: UPDATE organizations/projects SET deleted_at=now() WHERE org_id=...
2. Verify isolation: cross-org reads 404/empty; deleted rows excluded from lists
3. Revoke all api_keys for org; export knowledge if required (GDPR)
4. Hard purge after retention window: DELETE ... WHERE deleted_at < cutoff (audit residue kept)

# Key Rotation (executed: .data-cert/runbooks/executed-evidence.txt)
1. Create replacement key: AuthService.createKey(orgId,name,role) via node script
2. Distribute material out-of-band; verify new key 200 on GET /projects
3. Revoke old: UPDATE api_keys SET revoked_at=now() WHERE id=...  (expect immediate 401)
4. Audit event appended automatically? ensure via audit list (actor=operator)
Rollback: set revoked_at=NULL (verified 200 again in evidence)

# Incident Response
1. `curl -fsS $BASE/ready` -> capture JSON (database/queueDeadLetters)
2. If 503: check DB container `docker logs <pg>`; restart per DEPLOYMENT-RUNBOOK
3. Freeze deliveries: `SIGTERM` control-plane (graceful; jobs stay queued)
4. Evidence: save `docker logs` + /metrics snapshot under .data-cert/
Expected output: ready JSON {"status":"ready","database":"ok"} after recovery

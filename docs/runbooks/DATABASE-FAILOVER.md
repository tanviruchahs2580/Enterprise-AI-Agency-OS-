# Database Failover
Managed PG: promote replica (cloud console) -> update DATABASE_URL secret -> rolling restart control-plane
Compose: docker stop postgres; start standby container with same volume; verify /ready database ok and /audit/verify valid:true
RPO<=5min (WAL) RTO<=30min target; drill evidence: FINAL-V2 §10 + compose persistence checks

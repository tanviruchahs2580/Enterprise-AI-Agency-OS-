# QUICKSTART — 10 minutes to a running agency

## 0. Prerequisites

- **Node.js ≥ 24** (uses native TypeScript execution — no build step needed)
- **Git**
- Docker *optional* (only for containerized deployment or the docker sandbox)

## 1. Bootstrap (Windows)

```powershell
git clone https://github.com/tanviruchahs2580/Enterprise-AI-Agency-OS-.git
cd Enterprise-AI-Agency-OS-
./scripts/bootstrap.ps1
```

macOS / Linux:

```sh
./scripts/bootstrap.sh
```

Bootstrap checks prerequisites, installs dependencies, creates `.env`,
runs migrations, seeds the agent roster and prints a **one-time admin API key**.
Store that key — it is your `OWNER` identity for the dashboard and API.

## 2. Run

```powershell
# terminal 1: control plane + worker + dashboard dev server
npm run dev
```

Open:

| URL | What |
|---|---|
| http://localhost:5173 | Dashboard (dev server, proxies `/api`) |
| http://localhost:3000/health | Liveness |
| http://localhost:3000/ready | Readiness incl. queue/dead-letters |
| http://localhost:3000/api/v1/meta | API metadata |

Sign in to the dashboard with the admin key.

## 3. First agency flow (curl)

```sh
export KEY=<your-admin-key>
H="authorization: Bearer $KEY"
BASE=http://localhost:3000/api/v1

# create a project
curl -s -X POST $BASE/projects -H "$H" -H "content-type: application/json" \
  -d '{"name":"Billing Service","description":"SOC2-scoped B2B billing"}'

# add requirements
curl -s -X POST $BASE/projects/<projectId>/requirements -H "$H" \
  -H "content-type: application/json" \
  -d '{"title":"Invoice finality","acceptanceCriteria":["idempotent creation"]}'

# create tasks with dependencies
curl -s -X POST $BASE/tasks -H "$H" -H "content-type: application/json" \
  -d '{"projectId":"<projectId>","title":"Design invoice schema"}'
curl -s -X POST $BASE/tasks -H "$H" -H "content-type: application/json" \
  -d '{"projectId":"<projectId>","title":"Implement POST /invoices","dependsOn":["<taskAId>"]}'

# dispatch an agent at a task (queued → worker runs it through the model router)
curl -s -X POST $BASE/executions -H "$H" -H "content-type: application/json" \
  -d '{"taskId":"<taskAId>","agentId":"<agentId>"}'
```

## 4. Connect OpenCode via MCP

Add to your OpenCode MCP config:

```json
{
  "mcpServers": {
    "agencyos": {
      "command": "node",
      "args": ["apps/mcp-server/src/index.ts"],
      "environment": {
        "AGENCYOS_API_KEY": "<your-key>"
      }
    }
  }
}
```

Your agent can now call `list_projects`, `create_task`, `get_ready_tasks`,
`search_knowledge`, `request_approval` and more.

## 5. Verify everything

```sh
make test          # 38+ tests: unit, integration, e2e, MCP contract
make self-test     # environment diagnostics
```

Next: [DEPLOYMENT](DEPLOYMENT.md) for staging/production.

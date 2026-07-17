# @toqar/mcp-server

Toqar's agent-native surface: customers' own agents (Claude Code,
Cursor, anything MCP) query their analytics. Official TypeScript MCP
SDK; **read-only by construction** — no tool mutates anything.

## Tools

| Tool | What it returns |
| --- | --- |
| `query_metric` | Any semantic-layer metric over a window (segmentable) — the value **and** its `q_…` citation, same contract as every other surface |
| `list_findings` / `get_finding` | Published findings with full evidence chains and delivery history |
| `get_registry` | The tenant's event registry identity cards |

## Running (stdio)

```jsonc
// Claude Code / Cursor MCP config
{
  "toqar": {
    "command": "toqar-mcp",
    "env": {
      "TOQAR_API_URL": "https://registry.example",
      "TOQAR_TOKEN": "tok_…",
      "TOQAR_TENANT_ID": "t_…",
      "CLICKHOUSE_URL": "https://user:pass@clickhouse.example:8123"
    }
  }
}
```

Tenant scoping is by construction: one server instance per tenant token;
every compiled query binds that tenant id. The e2e suite drives a real
MCP client over a linked transport and answers the validation question
log's cost question through the protocol.

## License

MIT-licensed — open for registry listing and inspection (see `LICENSING.md` at the repo root).

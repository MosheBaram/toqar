#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClickHouse, createMetricExecutor } from '@toqar/pipeline';
import { createToqarMcpServer } from './server.js';

/**
 * Stdio entry for MCP clients (Claude Code, Cursor):
 *   env: TOQAR_API_URL, TOQAR_TOKEN, TOQAR_TENANT_ID, CLICKHOUSE_URL
 */
const { TOQAR_API_URL, TOQAR_TOKEN, TOQAR_TENANT_ID, CLICKHOUSE_URL } = process.env;
if (!TOQAR_API_URL || !TOQAR_TOKEN || !TOQAR_TENANT_ID || !CLICKHOUSE_URL) {
  console.error(
    'missing env: TOQAR_API_URL, TOQAR_TOKEN, TOQAR_TENANT_ID, CLICKHOUSE_URL are all required',
  );
  process.exit(1);
}

const server = createToqarMcpServer({
  executor: createMetricExecutor(createClickHouse(CLICKHOUSE_URL)),
  apiUrl: TOQAR_API_URL,
  token: TOQAR_TOKEN,
  tenantId: TOQAR_TENANT_ID,
});

await server.connect(new StdioServerTransport());

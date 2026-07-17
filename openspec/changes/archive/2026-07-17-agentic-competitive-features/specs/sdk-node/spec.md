# sdk-node Specification (delta)

## ADDED Requirements

### Requirement: Framework auto-instrument wrappers

The SDK SHALL offer drop-in wrappers for the major LLM/agent frameworks (at minimum: the Anthropic and OpenAI SDKs, Vercel AI SDK, LangChain/LangGraph) that emit TOQAR events from existing application calls without manual `track()` calls — a zero-PR "first data in five minutes" path that complements (not replaces) the PR-based instrumentation agent. Wrappers preserve the SDK's guarantees: fire-and-forget, never block or crash the host, envelope completion, kill switch.

#### Scenario: Wrapping a client yields events without code changes elsewhere

- **WHEN** a customer wraps their LLM client with the Toqar wrapper and runs their existing agent
- **THEN** `step_executed` events (model, tokens, latency, status) flow to the collector with no other code modified, and a delivery failure never affects the host application

#### Scenario: Wrapper data upgrades to full instrumentation

- **WHEN** the instrumentation agent later opens its PR for the same app
- **THEN** wrapper-derived and plan-derived events share the same registry contract — no conflicting event definitions

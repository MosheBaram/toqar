/**
 * TOQAR analytics wrapper — TEMPLATE.
 * Adapt destination + context plumbing to the host repo. Keep the shape:
 * one typed function per event, single track() chokepoint, fire-and-forget.
 */

type Destination = { capture: (event: string, props: object) => void };

// PostHog variant (their free tier). Swap for an HTTP POST to the hosted
// ClickHouse collector when that is the engagement's destination.
function makeDestination(): Destination {
  if (process.env.ANALYTICS_DISABLED === '1') {
    return { capture: () => {} };
  }
  // e.g. posthog-node: new PostHog(process.env.POSTHOG_KEY!, { host: ... })
  throw new Error('wire the destination for this repo');
}

const destination = makeDestination();

export interface TaskContext {
  task_id: string;
  run_id: string;
  task_type: string;
  session_id?: string;
}

const AGENT = {
  name: 'REPLACE_agent_name',
  version: process.env.RELEASE_SHA,
  model: 'REPLACE_default_model',
};

function track(event: string, ctx: TaskContext, props: object): void {
  try {
    destination.capture(event, {
      event_id: crypto.randomUUID(),
      schema_version: '0.1.0',
      timestamp: new Date().toISOString(),
      agent: AGENT,
      ...ctx,
      ...props,
    });
  } catch (err) {
    // Analytics must never break the agent loop.
    console.warn('[analytics] drop:', event, err);
  }
}

export const analytics = {
  taskStarted: (
    ctx: TaskContext,
    p: { initiator: 'human' | 'agent' | 'schedule' | 'api'; input_ref?: string },
  ) => track('task_started', ctx, p),

  taskCompleted: (
    ctx: TaskContext,
    p: {
      verification: 'verified' | 'self_reported';
      verifier?: string;
      duration_ms: number;
      steps_total: number;
      tokens_in_total?: number;
      tokens_out_total?: number;
      cost_usd?: number;
      output_ref?: string;
    },
  ) => track('task_completed', ctx, p),

  taskFailed: (
    ctx: TaskContext,
    p: {
      error: { type: string; message?: string };
      retryable: boolean;
      duration_ms: number;
      failed_step_id?: string;
    },
  ) => track('task_failed', ctx, p),

  taskAbandoned: (
    ctx: TaskContext,
    p: { abandoned_by: 'human' | 'timeout' | 'system'; reason?: string; duration_ms: number },
  ) => track('task_abandoned', ctx, p),

  stepExecuted: (
    ctx: TaskContext,
    p: {
      step_id: string;
      step_index: number;
      step_type: 'llm_call' | 'tool_call' | 'retrieval' | 'code_execution' | 'handoff' | 'other';
      tool_name?: string;
      model?: string;
      tokens_in?: number;
      tokens_out?: number;
      latency_ms: number;
      status: 'ok' | 'error' | 'timeout';
      error?: { type: string; message?: string };
      retry_of_step_id?: string;
    },
  ) => track('step_executed', ctx, p),

  handoffToHuman: (
    ctx: TaskContext,
    p: {
      handoff_id: string;
      reason: 'approval_required' | 'low_confidence' | 'error' | 'policy' | 'clarification' | 'user_request';
      blocking: boolean;
      context_ref?: string;
    },
  ) => track('handoff_to_human', ctx, p),

  humanApproved: (
    ctx: TaskContext,
    p: { handoff_id: string; response_latency_ms: number },
  ) => track('human_approved', ctx, p),

  humanEdited: (
    ctx: TaskContext,
    p: {
      handoff_id?: string;
      artifact_type: string;
      edit_magnitude?: { unit: 'chars' | 'tokens' | 'lines'; value: number };
    },
  ) => track('human_edited', ctx, p),

  humanOverrode: (
    ctx: TaskContext,
    p: { handoff_id?: string; takeover_step_id?: string; reason?: string },
  ) => track('human_overrode', ctx, p),

  feedbackGiven: (
    ctx: TaskContext,
    p: {
      rating: { kind: 'binary' | 'scale'; value: number };
      source: 'end_user' | 'operator';
      comment_ref?: string;
    },
  ) => track('feedback_given', ctx, p),
};

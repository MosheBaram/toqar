/**
 * Onboarding view state (spec: onboarding). Reads the real timeline from
 * the registry service — the UI only ever shows honest system state, never
 * a scripted success. The connect→plan→approve→flowing flow is driven by
 * `toqar onboard` (server-side, needs repo access); this surface reflects it.
 */

export interface OnboardingState {
  connected_at: string | null;
  plan_proposed_at: string | null;
  plan_approved_at: string | null;
  first_event_at: string | null;
  first_finding_at: string | null;
  current_step: string;
  time_to_first_finding_ms: number | null;
}

export async function fetchOnboarding(base: string, token: string): Promise<OnboardingState> {
  const res = await fetch(`${base}/v1/onboarding`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`onboarding ${res.status}`);
  return (await res.json()) as OnboardingState;
}

const STEP_LABELS: Record<string, string> = {
  connect_repo: 'Connect the repo your agent lives in.',
  awaiting_plan: 'The agent is mapping your codebase to propose a tracking plan.',
  review_plan: 'Review the proposed tracking plan and approve it to open the instrumentation PR.',
  awaiting_data: 'Plan approved — merge the instrumentation PR and events will start flowing.',
  awaiting_first_finding: 'Data is flowing. The first sweep produces a finding once there is enough to defend.',
  active: 'Onboarding complete — findings are live in your feed.',
};

export function describeOnboardingStep(step: string): string {
  return STEP_LABELS[step] ?? `In progress (${step}).`;
}

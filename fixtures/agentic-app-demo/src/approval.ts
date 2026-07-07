// FIXTURE: human-approval seam. In a real product this posts to Slack
// and waits; here it resolves immediately.

export interface ApprovalResult {
  approved: boolean;
  // When the reviewer edited the draft before approving.
  finalText: string;
  edited: boolean;
  respondedInMs: number;
}

export async function requestApproval(
  leadEmail: string,
  draftText: string,
): Promise<ApprovalResult> {
  // Simulated reviewer: approves, lightly edits the draft.
  return {
    approved: true,
    finalText: draftText.replace(/^Hi/, 'Hello'),
    edited: true,
    respondedInMs: 42_000,
  };
}

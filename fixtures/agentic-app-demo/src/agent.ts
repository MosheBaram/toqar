// FIXTURE: the agent loop of a fake AI SDR. One task type
// ("reply_to_lead"), one LLM call, one tool call, one approval seam.

import Anthropic from '@anthropic-ai/sdk';
import { requestApproval } from './approval.js';
import { fetchLead, sendEmail } from './crm.js';

const anthropic = new Anthropic();

export type TaskOutcome = 'sent' | 'failed' | 'abandoned';

export async function replyToLead(leadId: string): Promise<TaskOutcome> {
  const startedAt = Date.now();
  try {
    const lead = await fetchLead(leadId);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Draft a short reply to this lead.\nName: ${lead.fullName}\nNotes: ${lead.personalNotes}\nTheir message: ${lead.lastMessageBody}`,
        },
      ],
    });

    const block = response.content[0];
    const draft = block && block.type === 'text' ? block.text : '';
    if (draft === '') return 'failed';

    const approval = await requestApproval(lead.email, draft);
    if (!approval.approved) return 'abandoned';

    await sendEmail(lead.email, approval.finalText);
    return 'sent';
  } catch (err) {
    console.error('reply_to_lead failed after', Date.now() - startedAt, 'ms', err);
    return 'failed';
  }
}

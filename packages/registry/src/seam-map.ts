import { z } from 'zod';

/**
 * A seam is a place in a customer's codebase where a TOQAR event belongs:
 * where tasks start, where the LLM/tools are called, where outcomes are
 * decided, where humans take over.
 */
export const seamSchema = z.object({
  kind: z.enum([
    'task_start',
    'llm_call',
    'tool_call',
    'retrieval',
    'outcome',
    'handoff',
    'verification',
  ]),
  /** "path/to/file.ts:line" anchor in the customer repo. */
  location: z.string().min(1),
  note: z.string().min(1).optional(),
});

/**
 * The instrumentation agent's understanding of one repo — persisted per
 * tenant in the registry backend so runs compound instead of remapping
 * (the accumulated-context moat).
 */
export const seamMapSchema = z.object({
  repo: z.string().min(1),
  /** Detected stacks, e.g. ["express", "react", "anthropic-sdk"]. */
  frameworks: z.array(z.string().min(1)).min(1),
  seams: z.array(seamSchema),
  /** snake_case task_type names, named after units of value. */
  task_taxonomy: z.array(z.string().min(1)),
  /** Which agent build produced this map — drives regression tracing. */
  agent_version: z.string().min(1),
  produced_at: z.string().datetime({ offset: true }),
});

export type Seam = z.infer<typeof seamSchema>;
export type SeamMap = z.infer<typeof seamMapSchema>;

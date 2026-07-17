import { Kafka, logLevel, type Consumer, type Producer } from 'kafkajs';
import type { StreamSink } from '@toqar/collector';
import type { ClickHouseClient } from '@clickhouse/client';
import { insertRows } from './clickhouse.js';
import { toRow } from './transform.js';

export const EVENTS_TOPIC = 'toqar.events';
export const EVENTS_DLQ_TOPIC = 'toqar.events.dlq';

/**
 * Production binding of the collector's StreamSink seam (spec:
 * stream-pipeline). Durable by construction: idempotent producer (a retry
 * after an ambiguous failure cannot duplicate on the broker) with
 * acks=all — stream correctness no longer rests solely on downstream
 * ClickHouse dedup.
 */
export function createRedpandaSink(brokers: string[]): StreamSink & { close(): Promise<void> } {
  const kafka = new Kafka({ clientId: 'toqar-collector', brokers, logLevel: logLevel.NOTHING });
  let producer: Producer | null = null;

  return {
    async publish(messages) {
      if (!producer) {
        producer = kafka.producer({
          allowAutoTopicCreation: true,
          idempotent: true,
          maxInFlightRequests: 1,
        });
        await producer.connect();
      }
      if (messages.length === 0) return;
      await producer.send({
        topic: EVENTS_TOPIC,
        acks: -1, // all in-sync replicas (Redpanda acks after fsync)
        messages: messages.map((m) => ({
          key: String(m.event_id ?? ''),
          value: JSON.stringify(m),
        })),
      });
    },
    async close() {
      await producer?.disconnect();
      producer = null;
    },
  };
}

/**
 * Explicit topic provisioning: retention is a stated policy, not an
 * accident of broker defaults. The events topic covers the ClickHouse
 * restore window (the practical PITR backstop); the DLQ keeps failures
 * longer for repair. Tiered (object-storage) retention is a Redpanda
 * Enterprise deployment concern — documented in the README.
 */
export async function ensureTopics(
  brokers: string[],
  opts: { retentionMs?: number; dlqRetentionMs?: number } = {},
): Promise<void> {
  const kafka = new Kafka({ clientId: 'toqar-admin', brokers, logLevel: logLevel.NOTHING });
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({
      topics: [
        {
          topic: EVENTS_TOPIC,
          configEntries: [
            { name: 'cleanup.policy', value: 'delete' },
            { name: 'retention.ms', value: String(opts.retentionMs ?? 7 * 24 * 3_600_000) },
          ],
        },
        {
          topic: EVENTS_DLQ_TOPIC,
          configEntries: [
            { name: 'cleanup.policy', value: 'delete' },
            { name: 'retention.ms', value: String(opts.dlqRetentionMs ?? 30 * 24 * 3_600_000) },
          ],
        },
      ],
    });
  } finally {
    await admin.disconnect();
  }
}

export interface ConsumerHandle {
  stop(): Promise<void>;
  /** Messages that could not map to rows — routed to the DLQ, never dropped. */
  unmapped(): number;
  /** Everything routed to the DLQ (unmappable + insert-failed batches). */
  deadLettered(): number;
}

/**
 * Topic → ClickHouse, effectively-once (spec: stream-pipeline):
 * - Offsets are committed only AFTER the ClickHouse write — a crash
 *   between write and commit re-processes, never skips; the dedup layer
 *   makes the replay invisible in query results.
 * - Unmappable messages and batches that still fail insertion after a
 *   retry go to the dead-letter topic with their reason — recoverable,
 *   never silently dropped. If the DLQ write itself fails, the batch is
 *   not committed and will be re-processed.
 */
/**
 * Residency routing (spec: data-governance): every enriched message
 * carries its tenant's residency tag; the router deterministically picks
 * the regional ClickHouse cluster. Unknown/missing tags go to the default
 * region — a message is never dropped over routing.
 */
export function createResidencyRouter(
  clients: { us: ClickHouseClient; eu?: ClickHouseClient },
): (residency: string) => ClickHouseClient {
  return (residency) => (residency === 'eu' && clients.eu ? clients.eu : clients.us);
}

export async function startEventsConsumer(args: {
  brokers: string[];
  clickhouse: ClickHouseClient;
  /** Regional routing; defaults to the single configured cluster. */
  route?: (residency: string) => ClickHouseClient;
  groupId?: string;
}): Promise<ConsumerHandle> {
  const kafka = new Kafka({ clientId: 'toqar-pipeline', brokers: args.brokers, logLevel: logLevel.NOTHING });
  const consumer: Consumer = kafka.consumer({
    groupId: args.groupId ?? 'toqar-pipeline',
    allowAutoTopicCreation: true,
  });
  const dlqProducer = kafka.producer({
    allowAutoTopicCreation: true,
    idempotent: true,
    maxInFlightRequests: 1,
  });
  let unmappedCount = 0;
  let deadLetteredCount = 0;

  const toDlq = async (entries: { reason: string; original: string }[]) => {
    if (entries.length === 0) return;
    await dlqProducer.send({
      topic: EVENTS_DLQ_TOPIC,
      acks: -1,
      messages: entries.map((e) => ({
        value: JSON.stringify({ reason: e.reason, original: e.original }),
      })),
    });
    deadLetteredCount += entries.length;
  };

  await consumer.connect();
  await dlqProducer.connect();
  await consumer.subscribe({ topic: EVENTS_TOPIC, fromBeginning: true });
  await consumer.run({
    autoCommit: false,
    eachBatch: async ({ batch, resolveOffset, commitOffsetsIfNecessary, heartbeat }) => {
      const route = args.route ?? (() => args.clickhouse);
      const byRegion = new Map<ClickHouseClient, ReturnType<typeof toRow>[]>();
      const dead: { reason: string; original: string }[] = [];
      for (const message of batch.messages) {
        if (!message.value) continue;
        const raw = message.value.toString();
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const row = toRow(parsed);
          if (row) {
            const client = route(typeof parsed.residency === 'string' ? parsed.residency : 'us');
            const bucket = byRegion.get(client) ?? [];
            bucket.push(row);
            byRegion.set(client, bucket);
          } else {
            unmappedCount++;
            dead.push({ reason: 'unmappable', original: raw });
          }
        } catch {
          unmappedCount++;
          dead.push({ reason: 'unparsable', original: raw });
        }
      }

      for (const [client, rows] of byRegion) {
        try {
          await insertRows(client, rows.filter((r): r is NonNullable<typeof r> => r !== null));
        } catch {
          await new Promise((r) => setTimeout(r, 500));
          try {
            await insertRows(client, rows.filter((r): r is NonNullable<typeof r> => r !== null));
          } catch (second) {
            // Poison or persistent failure: preserve the batch for repair
            // instead of blocking the partition forever.
            const reason = `insert_failed: ${String((second as Error).message ?? second)}`;
            dead.push(...rows.map((row) => ({ reason, original: JSON.stringify(row) })));
          }
        }
      }

      await toDlq(dead);
      // Commit only after the durable write (or DLQ preservation): a crash
      // before this line re-processes — never skips.
      for (const message of batch.messages) resolveOffset(message.offset);
      await commitOffsetsIfNecessary();
      await heartbeat();
    },
  });

  return {
    async stop() {
      await consumer.disconnect();
      await dlqProducer.disconnect();
    },
    unmapped: () => unmappedCount,
    deadLettered: () => deadLetteredCount,
  };
}

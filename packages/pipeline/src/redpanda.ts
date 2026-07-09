import { Kafka, logLevel, type Consumer, type Producer } from 'kafkajs';
import type { StreamSink } from '@toqar/collector';
import type { ClickHouseClient } from '@clickhouse/client';
import { insertRows } from './clickhouse.js';
import { toRow } from './transform.js';

export const EVENTS_TOPIC = 'toqar.events';

/** Production binding of the collector's StreamSink seam. */
export function createRedpandaSink(brokers: string[]): StreamSink & { close(): Promise<void> } {
  const kafka = new Kafka({ clientId: 'toqar-collector', brokers, logLevel: logLevel.NOTHING });
  let producer: Producer | null = null;

  return {
    async publish(messages) {
      if (!producer) {
        producer = kafka.producer({ allowAutoTopicCreation: true });
        await producer.connect();
      }
      if (messages.length === 0) return;
      await producer.send({
        topic: EVENTS_TOPIC,
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

export interface ConsumerHandle {
  stop(): Promise<void>;
  /** Messages that could not map to rows, by count — never silently dropped. */
  unmapped(): number;
}

/** Topic → ClickHouse. Redelivery-safe: the table dedups on event_id. */
export async function startEventsConsumer(args: {
  brokers: string[];
  clickhouse: ClickHouseClient;
  groupId?: string;
}): Promise<ConsumerHandle> {
  const kafka = new Kafka({ clientId: 'toqar-pipeline', brokers: args.brokers, logLevel: logLevel.NOTHING });
  const consumer: Consumer = kafka.consumer({
    groupId: args.groupId ?? 'toqar-pipeline',
    allowAutoTopicCreation: true,
  });
  let unmappedCount = 0;

  await consumer.connect();
  await consumer.subscribe({ topic: EVENTS_TOPIC, fromBeginning: true });
  await consumer.run({
    eachBatch: async ({ batch, heartbeat }) => {
      const rows = [];
      for (const message of batch.messages) {
        if (!message.value) continue;
        try {
          const row = toRow(JSON.parse(message.value.toString()));
          if (row) rows.push(row);
          else unmappedCount++;
        } catch {
          unmappedCount++;
        }
      }
      await insertRows(args.clickhouse, rows);
      await heartbeat();
    },
  });

  return {
    async stop() {
      await consumer.disconnect();
    },
    unmapped: () => unmappedCount,
  };
}

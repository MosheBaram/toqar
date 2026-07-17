/**
 * The stream seam (change design D3): unit tests bind an in-memory sink,
 * production binds Redpanda. BufferedSink rides short broker outages —
 * accepted events buffer up to capacity and drain on recovery.
 *
 * No acknowledge-then-drop (spec: stream-pipeline): once an event is
 * 202-acked it lives in the buffer until delivered. When the buffer is
 * full, publish() throws BackpressureError BEFORE the new events are
 * acknowledged — the route answers 503 and the client retries. Nothing
 * acked is ever silently discarded.
 */
export interface StreamSink {
  publish(messages: Record<string, unknown>[]): Promise<void>;
}

export interface SinkHealth {
  broker: 'up' | 'degraded';
  buffered: number;
}

/** The broker is down and the buffer is full — refuse before acking. */
export class BackpressureError extends Error {
  constructor(buffered: number) {
    super(`ingest backpressure: ${buffered} events already buffered`);
    this.name = 'BackpressureError';
  }
}

export class BufferedSink implements StreamSink {
  private buffer: Record<string, unknown>[] = [];
  private degraded = false;

  constructor(
    private readonly inner: StreamSink,
    private readonly opts: { capacity: number },
  ) {}

  async publish(messages: Record<string, unknown>[]): Promise<void> {
    const backlog = this.buffer;
    const pending = [...backlog, ...messages];
    this.buffer = [];
    try {
      if (pending.length > 0) await this.inner.publish(pending);
      this.degraded = false;
    } catch {
      this.degraded = true;
      if (pending.length <= this.opts.capacity) {
        // Everything (acked backlog + this request) fits — buffer it all;
        // the caller may acknowledge.
        this.buffer = pending;
        return;
      }
      // Full: keep the already-acknowledged backlog, refuse the new
      // messages before they are acknowledged.
      this.buffer = backlog;
      throw new BackpressureError(backlog.length);
    }
  }

  health(): SinkHealth {
    return {
      broker: this.degraded ? 'degraded' : 'up',
      buffered: this.buffer.length,
    };
  }
}

/**
 * The stream seam (change design D3): unit tests bind an in-memory sink,
 * production binds Redpanda. BufferedSink rides short broker outages —
 * accepted events buffer up to capacity and drain on recovery.
 */
export interface StreamSink {
  publish(messages: Record<string, unknown>[]): Promise<void>;
}

export interface SinkHealth {
  broker: 'up' | 'degraded';
  buffered: number;
}

export class BufferedSink implements StreamSink {
  private buffer: Record<string, unknown>[] = [];
  private degraded = false;
  private dropped = 0;

  constructor(
    private readonly inner: StreamSink,
    private readonly opts: { capacity: number },
  ) {}

  async publish(messages: Record<string, unknown>[]): Promise<void> {
    const pending = [...this.buffer, ...messages];
    this.buffer = [];
    try {
      if (pending.length > 0) await this.inner.publish(pending);
      this.degraded = false;
    } catch {
      this.degraded = true;
      this.buffer = pending.slice(-this.opts.capacity);
      this.dropped += Math.max(0, pending.length - this.opts.capacity);
    }
  }

  health(): SinkHealth & { dropped: number } {
    return {
      broker: this.degraded ? 'degraded' : 'up',
      buffered: this.buffer.length,
      dropped: this.dropped,
    };
  }
}

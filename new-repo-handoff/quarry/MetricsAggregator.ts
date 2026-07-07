/**
 * Metrics Aggregator Service
 * Real-time metrics aggregation and calculation
 */

import { EventEmitter } from 'events';
import { createComponentLogger } from '../utils/logger';

const logger = createComponentLogger('MetricsAggregator');

export interface MetricPoint {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

export interface AggregatedMetric {
  name: string;
  value: number;
  min: number;
  max: number;
  avg: number;
  sum: number;
  count: number;
  percentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  rate?: number;
  trend?: 'up' | 'down' | 'stable';
}

export interface MetricWindow {
  duration: number; // milliseconds
  points: MetricPoint[];
  aggregated?: AggregatedMetric;
}

interface AggregatorConfig {
  windowSize?: number; // Default window size in ms
  maxPoints?: number; // Max points to keep per metric
  aggregationInterval?: number; // How often to compute aggregates
  enablePercentiles?: boolean;
  enableRateCalculation?: boolean;
}

export class MetricsAggregator extends EventEmitter {
  private metrics: Map<string, MetricWindow> = new Map();
  private config: Required<AggregatorConfig>;
  private aggregationTimer?: NodeJS.Timer;
  private rateCalculationCache: Map<string, { lastValue: number; lastTimestamp: number }> = new Map();

  constructor(config: AggregatorConfig = {}) {
    super();
    this.config = {
      windowSize: config.windowSize || 60000, // 1 minute default
      maxPoints: config.maxPoints || 1000,
      aggregationInterval: config.aggregationInterval || 1000, // 1 second
      enablePercentiles: config.enablePercentiles ?? true,
      enableRateCalculation: config.enableRateCalculation ?? true
    };

    this.startAggregation();
  }

  /**
   * Add a metric point
   */
  addMetric(name: string, value: number, labels?: Record<string, string>): void {
    const timestamp = Date.now();
    const point: MetricPoint = { timestamp, value, labels };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        duration: this.config.windowSize,
        points: []
      });
    }

    const window = this.metrics.get(name)!;
    window.points.push(point);

    // Trim old points
    this.trimWindow(window, timestamp);

    // Emit real-time update
    this.emit('metric:update', {
      name,
      point,
      window: window.aggregated
    });

    logger.debug('Metric added', { name, value, labels });
  }

  /**
   * Add multiple metrics at once
   */
  addBatch(metrics: Array<{ name: string; value: number; labels?: Record<string, string> }>): void {
    const timestamp = Date.now();
    
    metrics.forEach(({ name, value, labels }) => {
      this.addMetric(name, value, labels);
    });

    this.emit('batch:processed', { count: metrics.length, timestamp });
  }

  /**
   * Get aggregated metric
   */
  getMetric(name: string): AggregatedMetric | null {
    const window = this.metrics.get(name);
    if (!window || !window.aggregated) return null;
    return window.aggregated;
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Map<string, AggregatedMetric> {
    const result = new Map<string, AggregatedMetric>();
    
    this.metrics.forEach((window, name) => {
      if (window.aggregated) {
        result.set(name, window.aggregated);
      }
    });

    return result;
  }

  /**
   * Get metric history
   */
  getHistory(name: string, duration?: number): MetricPoint[] {
    const window = this.metrics.get(name);
    if (!window) return [];

    if (!duration) return window.points;

    const cutoff = Date.now() - duration;
    return window.points.filter(p => p.timestamp >= cutoff);
  }

  /**
   * Calculate rate of change
   */
  getRate(name: string): number | null {
    if (!this.config.enableRateCalculation) return null;

    const window = this.metrics.get(name);
    if (!window || window.points.length < 2) return null;

    const cache = this.rateCalculationCache.get(name);
    const currentPoint = window.points[window.points.length - 1];

    if (!cache) {
      this.rateCalculationCache.set(name, {
        lastValue: currentPoint.value,
        lastTimestamp: currentPoint.timestamp
      });
      return 0;
    }

    const timeDiff = (currentPoint.timestamp - cache.lastTimestamp) / 1000; // seconds
    const valueDiff = currentPoint.value - cache.lastValue;
    const rate = timeDiff > 0 ? valueDiff / timeDiff : 0;

    // Update cache
    cache.lastValue = currentPoint.value;
    cache.lastTimestamp = currentPoint.timestamp;

    return rate;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
    this.rateCalculationCache.clear();
    this.emit('metrics:cleared');
  }

  /**
   * Stop aggregation
   */
  stop(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = undefined;
    }
  }

  /**
   * Start aggregation timer
   */
  private startAggregation(): void {
    this.aggregationTimer = setInterval(() => {
      this.aggregateAll();
    }, this.config.aggregationInterval);
  }

  /**
   * Aggregate all metrics
   */
  private aggregateAll(): void {
    const timestamp = Date.now();
    const updates: Array<{ name: string; metric: AggregatedMetric }> = [];

    this.metrics.forEach((window, name) => {
      this.trimWindow(window, timestamp);
      
      if (window.points.length > 0) {
        window.aggregated = this.aggregate(name, window.points);
        updates.push({ name, metric: window.aggregated });
      }
    });

    if (updates.length > 0) {
      this.emit('aggregation:complete', { updates, timestamp });
    }
  }

  /**
   * Trim old points from window
   */
  private trimWindow(window: MetricWindow, currentTime: number): void {
    const cutoff = currentTime - window.duration;
    
    // Remove old points
    window.points = window.points.filter(p => p.timestamp >= cutoff);

    // Enforce max points limit
    if (window.points.length > this.config.maxPoints) {
      window.points = window.points.slice(-this.config.maxPoints);
    }
  }

  /**
   * Aggregate metric points
   */
  private aggregate(name: string, points: MetricPoint[]): AggregatedMetric {
    if (points.length === 0) {
      throw new Error('Cannot aggregate empty points array');
    }

    const values = points.map(p => p.value);
    const sorted = [...values].sort((a, b) => a - b);
    
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    // Calculate percentiles
    const percentiles = this.config.enablePercentiles ? {
      p50: this.percentile(sorted, 0.5),
      p90: this.percentile(sorted, 0.9),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99)
    } : { p50: avg, p90: avg, p95: avg, p99: avg };

    // Calculate rate if enabled
    const rate = this.getRate(name) || undefined;

    // Determine trend
    const trend = this.calculateTrend(values);

    return {
      name,
      value: values[values.length - 1], // Latest value
      min,
      max,
      avg,
      sum,
      count: values.length,
      percentiles,
      rate,
      trend
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Calculate trend direction
   */
  private calculateTrend(values: number[]): 'up' | 'down' | 'stable' {
    if (values.length < 3) return 'stable';

    const recentValues = values.slice(-10); // Last 10 values
    const firstHalf = recentValues.slice(0, Math.floor(recentValues.length / 2));
    const secondHalf = recentValues.slice(Math.floor(recentValues.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (change > 5) return 'up';
    if (change < -5) return 'down';
    return 'stable';
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): any {
    const data: any = {
      timestamp: Date.now(),
      metrics: {}
    };

    this.metrics.forEach((window, name) => {
      data.metrics[name] = {
        points: window.points,
        aggregated: window.aggregated,
        windowSize: window.duration
      };
    });

    return data;
  }

  /**
   * Import metrics data
   */
  importMetrics(data: any): void {
    if (!data.metrics) return;

    Object.entries(data.metrics).forEach(([name, metricData]: [string, any]) => {
      this.metrics.set(name, {
        duration: metricData.windowSize || this.config.windowSize,
        points: metricData.points || [],
        aggregated: metricData.aggregated
      });
    });

    this.emit('metrics:imported', { count: Object.keys(data.metrics).length });
  }
}

// Singleton instance
let aggregatorInstance: MetricsAggregator | null = null;

export function getMetricsAggregator(config?: AggregatorConfig): MetricsAggregator {
  if (!aggregatorInstance) {
    aggregatorInstance = new MetricsAggregator(config);
  }
  return aggregatorInstance;
}

export default MetricsAggregator;
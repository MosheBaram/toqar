/**
 * Anomaly Detection System
 * AI-powered anomaly detection for system behavior monitoring
 */

import { EventEmitter } from 'events';
import { MetricsAggregator, AggregatedMetric, MetricPoint } from '../../dashboard/src/services/MetricsAggregator';
import { AlertsManager, AlertSeverity } from '../../dashboard/src/services/AlertsManager';
import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('anomaly-detection');

export interface AnomalyConfig {
  sensitivity?: number; // 0-1, higher = more sensitive
  learningPeriod?: number; // ms, time to establish baseline
  detectionMethods?: DetectionMethod[];
  correlationThreshold?: number; // 0-1, for correlation detection
  seasonalityDetection?: boolean;
  alertOnAnomaly?: boolean;
}

export type DetectionMethod = 
  | 'statistical'
  | 'isolation-forest'
  | 'zscore'
  | 'mad' // Median Absolute Deviation
  | 'iqr' // Interquartile Range
  | 'seasonal'
  | 'correlation'
  | 'pattern';

export interface Anomaly {
  id: string;
  metric: string;
  timestamp: Date;
  value: number;
  expectedRange: { min: number; max: number };
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-1
  method: DetectionMethod;
  description: string;
  correlatedAnomalies?: string[];
  possibleCauses?: string[];
  suggestedActions?: string[];
}

export interface Baseline {
  metric: string;
  mean: number;
  stdDev: number;
  median: number;
  mad: number; // Median Absolute Deviation
  iqr: { q1: number; q3: number; range: number };
  seasonality?: SeasonalPattern;
  lastUpdated: Date;
  dataPoints: number;
}

export interface SeasonalPattern {
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  patterns: number[]; // Expected values for each period segment
  confidence: number;
}

export interface CorrelationPair {
  metric1: string;
  metric2: string;
  correlation: number;
  lag: number; // Time lag in ms
}

export class AnomalyDetectionSystem extends EventEmitter {
  private config: Required<AnomalyConfig>;
  private baselines: Map<string, Baseline> = new Map();
  private anomalies: Map<string, Anomaly> = new Map();
  private correlations: CorrelationPair[] = [];
  private metricsAggregator?: MetricsAggregator;
  private alertsManager?: AlertsManager;
  private detectionTimer?: NodeJS.Timer;
  private learningStartTime: number;
  private isLearning: boolean = true;

  constructor(config: AnomalyConfig = {}) {
    super();
    this.config = {
      sensitivity: config.sensitivity ?? 0.7,
      learningPeriod: config.learningPeriod ?? 3600000, // 1 hour default
      detectionMethods: config.detectionMethods ?? ['statistical', 'zscore', 'iqr'],
      correlationThreshold: config.correlationThreshold ?? 0.7,
      seasonalityDetection: config.seasonalityDetection ?? true,
      alertOnAnomaly: config.alertOnAnomaly ?? true
    };
    this.learningStartTime = Date.now();
  }

  /**
   * Initialize with dependencies
   */
  initialize(metricsAggregator: MetricsAggregator, alertsManager?: AlertsManager): void {
    this.metricsAggregator = metricsAggregator;
    this.alertsManager = alertsManager;
    
    // Subscribe to metrics updates
    this.metricsAggregator.on('aggregation:complete', this.handleAggregation.bind(this));
    
    // Start detection cycle
    this.startDetection();
    
    logger.info('Anomaly detection system initialized', {
      sensitivity: this.config.sensitivity,
      methods: this.config.detectionMethods
    });
  }

  /**
   * Start anomaly detection
   */
  private startDetection(): void {
    this.detectionTimer = setInterval(() => {
      this.detectAnomalies();
    }, 5000); // Run every 5 seconds
  }

  /**
   * Stop anomaly detection
   */
  stop(): void {
    if (this.detectionTimer) {
      clearInterval(this.detectionTimer);
      this.detectionTimer = undefined;
    }
  }

  /**
   * Handle metrics aggregation
   */
  private handleAggregation(data: { updates: Array<{ name: string; metric: AggregatedMetric }> }): void {
    const now = Date.now();
    
    // Check if still in learning phase
    if (this.isLearning && now - this.learningStartTime >= this.config.learningPeriod) {
      this.isLearning = false;
      logger.info('Learning period completed, starting anomaly detection');
      this.emit('learning:complete');
    }

    // Update baselines
    data.updates.forEach(({ name, metric }) => {
      this.updateBaseline(name, metric);
    });
  }

  /**
   * Update baseline for a metric
   */
  private updateBaseline(metricName: string, metric: AggregatedMetric): void {
    const baseline = this.baselines.get(metricName) || this.createBaseline(metricName);
    
    // Update statistics
    baseline.mean = (baseline.mean * baseline.dataPoints + metric.value) / (baseline.dataPoints + 1);
    baseline.median = metric.percentiles.p50;
    baseline.dataPoints++;
    baseline.lastUpdated = new Date();

    // Update standard deviation (online algorithm)
    const diff = metric.value - baseline.mean;
    baseline.stdDev = Math.sqrt(
      (baseline.stdDev ** 2 * (baseline.dataPoints - 1) + diff ** 2) / baseline.dataPoints
    );

    // Update IQR
    baseline.iqr = {
      q1: metric.percentiles.p50 - (metric.percentiles.p90 - metric.percentiles.p50) / 2,
      q3: metric.percentiles.p90,
      range: metric.percentiles.p90 - (metric.percentiles.p50 - (metric.percentiles.p90 - metric.percentiles.p50) / 2)
    };

    // Calculate MAD (simplified)
    baseline.mad = Math.abs(metric.value - baseline.median) * 1.4826;

    this.baselines.set(metricName, baseline);
  }

  /**
   * Create new baseline
   */
  private createBaseline(metricName: string): Baseline {
    return {
      metric: metricName,
      mean: 0,
      stdDev: 0,
      median: 0,
      mad: 0,
      iqr: { q1: 0, q3: 0, range: 0 },
      lastUpdated: new Date(),
      dataPoints: 0
    };
  }

  /**
   * Detect anomalies across all metrics
   */
  private async detectAnomalies(): Promise<void> {
    if (this.isLearning || !this.metricsAggregator) {return;}

    const metrics = this.metricsAggregator.getAllMetrics();
    const detectedAnomalies: Anomaly[] = [];

    // Detect anomalies for each metric
    metrics.forEach((metric, name) => {
      const baseline = this.baselines.get(name);
      if (!baseline || baseline.dataPoints < 10) {return;}

      for (const method of this.config.detectionMethods) {
        const anomaly = this.detectAnomalyByMethod(name, metric, baseline, method);
        if (anomaly) {
          detectedAnomalies.push(anomaly);
        }
      }
    });

    // Detect correlation anomalies
    if (this.config.detectionMethods.includes('correlation')) {
      const correlationAnomalies = this.detectCorrelationAnomalies(metrics);
      detectedAnomalies.push(...correlationAnomalies);
    }

    // Process detected anomalies
    detectedAnomalies.forEach(anomaly => {
      this.processAnomaly(anomaly);
    });

    // Update correlations periodically
    if (Math.random() < 0.1) { // 10% chance to update correlations
      this.updateCorrelations(metrics);
    }
  }

  /**
   * Detect anomaly using specific method
   */
  private detectAnomalyByMethod(
    metricName: string,
    metric: AggregatedMetric,
    baseline: Baseline,
    method: DetectionMethod
  ): Anomaly | null {
    let isAnomaly = false;
    let confidence = 0;
    let expectedRange = { min: 0, max: 0 };

    switch (method) {
      case 'statistical':
        const statResult = this.statisticalDetection(metric.value, baseline);
        isAnomaly = statResult.isAnomaly;
        confidence = statResult.confidence;
        expectedRange = statResult.expectedRange;
        break;

      case 'zscore':
        const zResult = this.zScoreDetection(metric.value, baseline);
        isAnomaly = zResult.isAnomaly;
        confidence = zResult.confidence;
        expectedRange = zResult.expectedRange;
        break;

      case 'mad':
        const madResult = this.madDetection(metric.value, baseline);
        isAnomaly = madResult.isAnomaly;
        confidence = madResult.confidence;
        expectedRange = madResult.expectedRange;
        break;

      case 'iqr':
        const iqrResult = this.iqrDetection(metric.value, baseline);
        isAnomaly = iqrResult.isAnomaly;
        confidence = iqrResult.confidence;
        expectedRange = iqrResult.expectedRange;
        break;

      case 'pattern':
        const patternResult = this.patternDetection(metricName, metric);
        isAnomaly = patternResult.isAnomaly;
        confidence = patternResult.confidence;
        break;
    }

    if (isAnomaly && confidence >= (1 - this.config.sensitivity)) {
      return {
        id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        metric: metricName,
        timestamp: new Date(),
        value: metric.value,
        expectedRange,
        severity: this.calculateSeverity(metric.value, expectedRange, confidence),
        confidence,
        method,
        description: this.generateDescription(metricName, metric.value, expectedRange, method),
        possibleCauses: this.analyzePossibleCauses(metricName, metric, method),
        suggestedActions: this.generateSuggestedActions(metricName, metric.value, expectedRange)
      };
    }

    return null;
  }

  /**
   * Statistical anomaly detection
   */
  private statisticalDetection(value: number, baseline: Baseline): {
    isAnomaly: boolean;
    confidence: number;
    expectedRange: { min: number; max: number };
  } {
    const threshold = 3; // 3 standard deviations
    const min = baseline.mean - threshold * baseline.stdDev;
    const max = baseline.mean + threshold * baseline.stdDev;
    
    const isAnomaly = value < min || value > max;
    const deviation = Math.abs(value - baseline.mean) / baseline.stdDev;
    const confidence = Math.min(deviation / threshold, 1);

    return {
      isAnomaly,
      confidence,
      expectedRange: { min, max }
    };
  }

  /**
   * Z-Score anomaly detection
   */
  private zScoreDetection(value: number, baseline: Baseline): {
    isAnomaly: boolean;
    confidence: number;
    expectedRange: { min: number; max: number };
  } {
    const zScore = (value - baseline.mean) / baseline.stdDev;
    const threshold = 2.5;
    
    const isAnomaly = Math.abs(zScore) > threshold;
    const confidence = Math.min(Math.abs(zScore) / threshold, 1);
    
    const min = baseline.mean - threshold * baseline.stdDev;
    const max = baseline.mean + threshold * baseline.stdDev;

    return {
      isAnomaly,
      confidence,
      expectedRange: { min, max }
    };
  }

  /**
   * MAD (Median Absolute Deviation) detection
   */
  private madDetection(value: number, baseline: Baseline): {
    isAnomaly: boolean;
    confidence: number;
    expectedRange: { min: number; max: number };
  } {
    const threshold = 3;
    const modifiedZScore = 0.6745 * (value - baseline.median) / baseline.mad;
    
    const isAnomaly = Math.abs(modifiedZScore) > threshold;
    const confidence = Math.min(Math.abs(modifiedZScore) / threshold, 1);
    
    const min = baseline.median - threshold * baseline.mad / 0.6745;
    const max = baseline.median + threshold * baseline.mad / 0.6745;

    return {
      isAnomaly,
      confidence,
      expectedRange: { min, max }
    };
  }

  /**
   * IQR (Interquartile Range) detection
   */
  private iqrDetection(value: number, baseline: Baseline): {
    isAnomaly: boolean;
    confidence: number;
    expectedRange: { min: number; max: number };
  } {
    const multiplier = 1.5;
    const min = baseline.iqr.q1 - multiplier * baseline.iqr.range;
    const max = baseline.iqr.q3 + multiplier * baseline.iqr.range;
    
    const isAnomaly = value < min || value > max;
    let confidence = 0;
    
    if (value < min) {
      confidence = Math.min((min - value) / baseline.iqr.range, 1);
    } else if (value > max) {
      confidence = Math.min((value - max) / baseline.iqr.range, 1);
    }

    return {
      isAnomaly,
      confidence,
      expectedRange: { min, max }
    };
  }

  /**
   * Pattern-based anomaly detection
   */
  private patternDetection(metricName: string, metric: AggregatedMetric): {
    isAnomaly: boolean;
    confidence: number;
  } {
    // Check for sudden trend changes
    if (metric.trend === 'up' && metric.rate && metric.rate > metric.value * 0.5) {
      return { isAnomaly: true, confidence: 0.8 };
    }
    
    if (metric.trend === 'down' && metric.rate && Math.abs(metric.rate) > metric.value * 0.5) {
      return { isAnomaly: true, confidence: 0.8 };
    }

    return { isAnomaly: false, confidence: 0 };
  }

  /**
   * Detect correlation-based anomalies
   */
  private detectCorrelationAnomalies(metrics: Map<string, AggregatedMetric>): Anomaly[] {
    const anomalies: Anomaly[] = [];

    this.correlations.forEach(correlation => {
      const metric1 = metrics.get(correlation.metric1);
      const metric2 = metrics.get(correlation.metric2);
      
      if (!metric1 || !metric2) {return;}

      const baseline1 = this.baselines.get(correlation.metric1);
      const baseline2 = this.baselines.get(correlation.metric2);
      
      if (!baseline1 || !baseline2) {return;}

      // Check if correlation is broken
      const expectedRatio = baseline1.mean / baseline2.mean;
      const actualRatio = metric1.value / metric2.value;
      const deviation = Math.abs(actualRatio - expectedRatio) / expectedRatio;

      if (deviation > 0.3) { // 30% deviation threshold
        anomalies.push({
          id: `anomaly_corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          metric: `${correlation.metric1}-${correlation.metric2}`,
          timestamp: new Date(),
          value: actualRatio,
          expectedRange: { 
            min: expectedRatio * 0.7, 
            max: expectedRatio * 1.3 
          },
          severity: deviation > 0.5 ? 'high' : 'medium',
          confidence: Math.min(deviation, 1),
          method: 'correlation',
          description: `Correlation anomaly detected between ${correlation.metric1} and ${correlation.metric2}`,
          correlatedAnomalies: [correlation.metric1, correlation.metric2],
          possibleCauses: ['System imbalance', 'Service degradation', 'Configuration change'],
          suggestedActions: ['Check both services', 'Review recent changes', 'Analyze logs']
        });
      }
    });

    return anomalies;
  }

  /**
   * Update correlations between metrics
   */
  private updateCorrelations(metrics: Map<string, AggregatedMetric>): void {
    const metricNames = Array.from(metrics.keys());
    const newCorrelations: CorrelationPair[] = [];

    for (let i = 0; i < metricNames.length; i++) {
      for (let j = i + 1; j < metricNames.length; j++) {
        const correlation = this.calculateCorrelation(
          metricNames[i],
          metricNames[j],
          this.metricsAggregator!
        );
        
        if (Math.abs(correlation) >= this.config.correlationThreshold) {
          newCorrelations.push({
            metric1: metricNames[i],
            metric2: metricNames[j],
            correlation,
            lag: 0
          });
        }
      }
    }

    this.correlations = newCorrelations;
  }

  /**
   * Calculate correlation between two metrics
   */
  private calculateCorrelation(metric1: string, metric2: string, aggregator: MetricsAggregator): number {
    const history1 = aggregator.getHistory(metric1, 300000); // Last 5 minutes
    const history2 = aggregator.getHistory(metric2, 300000);
    
    if (history1.length < 10 || history2.length < 10) {return 0;}

    // Simple Pearson correlation
    const values1 = history1.map(p => p.value);
    const values2 = history2.map(p => p.value);
    
    const mean1 = values1.reduce((a, b) => a + b, 0) / values1.length;
    const mean2 = values2.reduce((a, b) => a + b, 0) / values2.length;
    
    let numerator = 0;
    let denominator1 = 0;
    let denominator2 = 0;
    
    for (let i = 0; i < Math.min(values1.length, values2.length); i++) {
      const diff1 = values1[i] - mean1;
      const diff2 = values2[i] - mean2;
      
      numerator += diff1 * diff2;
      denominator1 += diff1 ** 2;
      denominator2 += diff2 ** 2;
    }
    
    const denominator = Math.sqrt(denominator1 * denominator2);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calculate anomaly severity
   */
  private calculateSeverity(
    value: number,
    expectedRange: { min: number; max: number },
    confidence: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const deviation = Math.max(
      (value - expectedRange.max) / (expectedRange.max - expectedRange.min),
      (expectedRange.min - value) / (expectedRange.max - expectedRange.min)
    );

    if (deviation > 2 && confidence > 0.9) {return 'critical';}
    if (deviation > 1.5 && confidence > 0.8) {return 'high';}
    if (deviation > 1 && confidence > 0.7) {return 'medium';}
    return 'low';
  }

  /**
   * Generate anomaly description
   */
  private generateDescription(
    metric: string,
    value: number,
    expectedRange: { min: number; max: number },
    method: DetectionMethod
  ): string {
    const direction = value > expectedRange.max ? 'above' : 'below';
    const percentage = Math.abs(
      ((value - (expectedRange.max + expectedRange.min) / 2) / 
       ((expectedRange.max - expectedRange.min) / 2)) * 100
    );

    return `${metric} is ${percentage.toFixed(1)}% ${direction} expected range using ${method} detection`;
  }

  /**
   * Analyze possible causes
   */
  private analyzePossibleCauses(
    metric: string,
    aggregatedMetric: AggregatedMetric,
    method: DetectionMethod
  ): string[] {
    const causes: string[] = [];

    // Generic causes based on metric type
    if (metric.includes('error') || metric.includes('failure')) {
      causes.push('Service degradation', 'Configuration error', 'Dependency failure');
    } else if (metric.includes('latency') || metric.includes('response')) {
      causes.push('High load', 'Network issues', 'Resource contention');
    } else if (metric.includes('cpu') || metric.includes('memory')) {
      causes.push('Memory leak', 'Runaway process', 'Increased traffic');
    }

    // Method-specific causes
    if (method === 'correlation') {
      causes.push('Service dependency issue', 'Cascading failure');
    } else if (method === 'seasonal') {
      causes.push('Unusual traffic pattern', 'Scheduled job failure');
    }

    // Trend-based causes
    if (aggregatedMetric.trend === 'up') {
      causes.push('Gradual degradation', 'Growing backlog');
    } else if (aggregatedMetric.trend === 'down') {
      causes.push('Service recovery', 'Traffic reduction');
    }

    return causes;
  }

  /**
   * Generate suggested actions
   */
  private generateSuggestedActions(
    metric: string,
    value: number,
    expectedRange: { min: number; max: number }
  ): string[] {
    const actions: string[] = [];

    // Generic actions
    actions.push('Review recent deployments', 'Check system logs', 'Monitor related metrics');

    // Metric-specific actions
    if (metric.includes('error')) {
      actions.push('Review error logs', 'Check downstream services', 'Enable debug logging');
    } else if (metric.includes('cpu') || metric.includes('memory')) {
      actions.push('Scale resources', 'Restart affected services', 'Profile application');
    } else if (metric.includes('latency')) {
      actions.push('Check database performance', 'Review network latency', 'Enable caching');
    }

    // Severity-based actions
    if (value > expectedRange.max * 2 || value < expectedRange.min * 0.5) {
      actions.unshift('IMMEDIATE ACTION REQUIRED');
      actions.push('Page on-call engineer', 'Prepare rollback plan');
    }

    return actions;
  }

  /**
   * Process detected anomaly
   */
  private processAnomaly(anomaly: Anomaly): void {
    // Store anomaly
    this.anomalies.set(anomaly.id, anomaly);

    // Emit event
    this.emit('anomaly:detected', anomaly);

    // Log anomaly
    logger.warn('Anomaly detected', {
      id: anomaly.id,
      metric: anomaly.metric,
      value: anomaly.value,
      severity: anomaly.severity,
      confidence: anomaly.confidence
    });

    // Create alert if configured
    if (this.config.alertOnAnomaly && this.alertsManager) {
      const alertSeverity: AlertSeverity = 
        anomaly.severity === 'critical' ? 'critical' :
        anomaly.severity === 'high' ? 'error' :
        anomaly.severity === 'medium' ? 'warning' : 'info';

      this.alertsManager.createAlert({
        name: `Anomaly: ${anomaly.metric}`,
        message: anomaly.description,
        severity: alertSeverity,
        source: 'anomaly-detection',
        tags: {
          metric: anomaly.metric,
          method: anomaly.method,
          confidence: anomaly.confidence.toString()
        },
        metadata: {
          anomaly: anomaly,
          possibleCauses: anomaly.possibleCauses,
          suggestedActions: anomaly.suggestedActions
        }
      });
    }
  }

  /**
   * Get all anomalies
   */
  getAnomalies(since?: Date): Anomaly[] {
    const anomalies = Array.from(this.anomalies.values());
    
    if (since) {
      return anomalies.filter(a => a.timestamp >= since);
    }
    
    return anomalies;
  }

  /**
   * Get anomalies for specific metric
   */
  getMetricAnomalies(metric: string, since?: Date): Anomaly[] {
    const anomalies = this.getAnomalies(since);
    return anomalies.filter(a => a.metric === metric);
  }

  /**
   * Get system health score
   */
  getHealthScore(): {
    score: number; // 0-100
    anomalyCount: number;
    criticalCount: number;
    confidence: number;
  } {
    const recentAnomalies = this.getAnomalies(new Date(Date.now() - 3600000)); // Last hour
    const criticalCount = recentAnomalies.filter(a => a.severity === 'critical').length;
    const highCount = recentAnomalies.filter(a => a.severity === 'high').length;
    
    // Calculate score (100 = perfect health)
    let score = 100;
    score -= criticalCount * 20;
    score -= highCount * 10;
    score -= (recentAnomalies.length - criticalCount - highCount) * 2;
    score = Math.max(0, score);

    const avgConfidence = recentAnomalies.length > 0
      ? recentAnomalies.reduce((sum, a) => sum + a.confidence, 0) / recentAnomalies.length
      : 1;

    return {
      score,
      anomalyCount: recentAnomalies.length,
      criticalCount,
      confidence: avgConfidence
    };
  }

  /**
   * Export anomaly data
   */
  exportData(): any {
    return {
      anomalies: Array.from(this.anomalies.values()),
      baselines: Array.from(this.baselines.values()),
      correlations: this.correlations,
      healthScore: this.getHealthScore(),
      config: this.config,
      timestamp: new Date()
    };
  }
}

export default AnomalyDetectionSystem;
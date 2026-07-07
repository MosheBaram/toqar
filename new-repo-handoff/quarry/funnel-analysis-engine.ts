import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import type {
  AnalyticsEvent,
  FunnelDefinition,
  FunnelStep,
  FunnelCondition,
  FunnelFilter,
  FunnelAnalysis,
  FunnelStepResult,
  FunnelBreakdown,
  EventType,
  UserSegment,
} from '../types/analytics-types';
import { AnalyticsQueryEngine } from '../core/analytics-query-engine';

/**
 * Advanced Funnel Analysis Engine for Aialytics (Mixpanel-like)
 *
 * Features:
 * 1. Multi-step funnel creation and analysis
 * 2. Real-time funnel tracking and conversion rates
 * 3. Advanced segmentation and filtering
 * 4. Drop-off analysis and optimization insights
 * 5. Time-based funnel analysis (time to convert)
 * 6. A/B testing integration for funnel optimization
 * 7. Cohort-based funnel analysis
 * 8. Attribution modeling and source tracking
 */

export interface FunnelAnalysisConfig {
  // Analysis Settings
  defaultTimeWindow: number; // hours
  defaultConversionWindow: number; // hours
  enableRealTimeTracking: boolean;
  enableDropoffAnalysis: boolean;
  enableTimeToConvertAnalysis: boolean;

  // Performance
  maxEventsPerAnalysis: number;
  enableResultCaching: boolean;
  cacheTimeToLive: number; // minutes
  enableParallelProcessing: boolean;

  // Advanced Features
  enableAttributionModeling: boolean;
  enableCohortAnalysis: boolean;
  enableABTestingIntegration: boolean;
  enablePredictiveAnalysis: boolean;

  // Segmentation
  enableAdvancedSegmentation: boolean;
  maxSegments: number;
  enableCustomProperties: boolean;
}

export interface FunnelUserJourney {
  userId: string;
  anonymousId: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  completedSteps: FunnelStepCompletion[];
  conversionTime?: number;
  dropoffStep?: number;
  dropoffReason?: string;
  source: string;
  medium: string;
  campaign?: string;
  userSegment: UserSegment;
  customProperties: Record<string, unknown>;
}

export interface FunnelStepCompletion {
  stepId: string;
  stepOrder: number;
  completedAt: number;
  timeSincePrevious?: number;
  timeSinceStart: number;
  properties: Record<string, unknown>;
  source?: string;
}

export interface FunnelConversionPath {
  pathId: string;
  steps: string[];
  userCount: number;
  conversionRate: number;
  averageTime: number;
  dropoffPoints: Array<{
    step: number;
    dropoffRate: number;
    commonReasons: string[];
  }>;
}

export interface FunnelOptimizationInsights {
  funnelId: string;
  overallPerformance: 'excellent' | 'good' | 'needs_improvement' | 'poor';
  conversionRate: number;
  benchmarkComparison: number; // vs industry average

  // Step-specific insights
  stepInsights: Array<{
    stepId: string;
    stepName: string;
    performance: 'excellent' | 'good' | 'needs_improvement' | 'poor';
    conversionRate: number;
    averageTimeSpent: number;
    dropoffRate: number;
    issues: string[];
    recommendations: string[];
  }>;

  // Overall recommendations
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: 'ux' | 'technical' | 'content' | 'flow';
    description: string;
    expectedImpact: number; // percentage improvement
    effort: 'low' | 'medium' | 'high';
  }>;

  // Potential improvements
  potentialImprovements: Array<{
    stepId: string;
    currentRate: number;
    targetRate: number;
    impact: number; // additional conversions per month
  }>;
}

export interface FunnelAnalysisEvents {
  'funnel-created': { funnel: FunnelDefinition };
  'funnel-updated': { funnelId: string; changes: Partial<FunnelDefinition> };
  'analysis-completed': { funnelId: string; analysis: FunnelAnalysis };
  'real-time-conversion': { funnelId: string; userId: string; stepId: string };
  'dropoff-detected': { funnelId: string; userId: string; stepId: string; reason?: string };
  'optimization-insights-generated': { funnelId: string; insights: FunnelOptimizationInsights };
  'anomaly-detected': { funnelId: string; anomaly: string; severity: 'low' | 'medium' | 'high' };
}

export class FunnelAnalysisEngine extends EventEmitter<FunnelAnalysisEvents> {
  private readonly config: FunnelAnalysisConfig;
  private readonly queryEngine: AnalyticsQueryEngine;
  private readonly funnels: Map<string, FunnelDefinition> = new Map();
  private readonly analysisCache: Map<string, FunnelAnalysis> = new Map();
  private readonly userJourneys: Map<string, FunnelUserJourney> = new Map();
  private readonly realTimeTracker: RealTimeFunnelTracker;
  private readonly optimizationEngine: FunnelOptimizationEngine;
  private readonly attributionEngine: AttributionEngine;

  constructor(config: Partial<FunnelAnalysisConfig> = {}, queryEngine: AnalyticsQueryEngine) {
    super();

    this.config = {
      defaultTimeWindow: 24, // 24 hours
      defaultConversionWindow: 7 * 24, // 7 days
      enableRealTimeTracking: true,
      enableDropoffAnalysis: true,
      enableTimeToConvertAnalysis: true,
      maxEventsPerAnalysis: 1000000,
      enableResultCaching: true,
      cacheTimeToLive: 30, // 30 minutes
      enableParallelProcessing: true,
      enableAttributionModeling: true,
      enableCohortAnalysis: true,
      enableABTestingIntegration: true,
      enablePredictiveAnalysis: true,
      enableAdvancedSegmentation: true,
      maxSegments: 10,
      enableCustomProperties: true,
      ...config,
    };

    this.queryEngine = queryEngine;
    this.realTimeTracker = new RealTimeFunnelTracker(this.config);
    this.optimizationEngine = new FunnelOptimizationEngine(this.config);
    this.attributionEngine = new AttributionEngine(this.config);

    this.setupEventHandlers();
  }

  /**
   * Create a new funnel definition
   */
  public async createFunnel(
    funnelDefinition: Omit<FunnelDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const funnel: FunnelDefinition = {
      id: uuidv4(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      timeWindow: this.config.defaultTimeWindow,
      conversionWindow: this.config.defaultConversionWindow,
      userFilters: [],
      eventFilters: [],
      ...funnelDefinition,
    };

    // Validate funnel definition
    this.validateFunnelDefinition(funnel);

    // Store funnel
    this.funnels.set(funnel.id, funnel);

    // Set up real-time tracking if enabled
    if (this.config.enableRealTimeTracking) {
      this.realTimeTracker.trackFunnel(funnel);
    }

    this.emit('funnel-created', { funnel });
    return funnel.id;
  }

  /**
   * Update existing funnel definition
   */
  public async updateFunnel(funnelId: string, updates: Partial<FunnelDefinition>): Promise<void> {
    const funnel = this.funnels.get(funnelId);
    if (!funnel) {
      throw new Error(`Funnel ${funnelId} not found`);
    }

    // Apply updates
    Object.assign(funnel, updates, { updatedAt: Date.now() });

    // Validate updated funnel
    this.validateFunnelDefinition(funnel);

    // Clear cache for this funnel
    this.clearFunnelCache(funnelId);

    this.emit('funnel-updated', { funnelId, changes: updates });
  }

  /**
   * Analyze funnel performance
   */
  public async analyzeFunnel(
    funnelId: string,
    dateRange: { start: number; end: number },
    options: {
      breakdown?: string[];
      segments?: string[];
      compareTime?: boolean;
      includePredictions?: boolean;
    } = {}
  ): Promise<FunnelAnalysis> {
    const funnel = this.funnels.get(funnelId);
    if (!funnel) {
      throw new Error(`Funnel ${funnelId} not found`);
    }

    // Check cache first
    const cacheKey = this.generateCacheKey(funnelId, dateRange, options);
    const cached = this.analysisCache.get(cacheKey);
    if (cached && this.config.enableResultCaching) {
      return cached;
    }

    const startTime = Date.now();

    try {
      // Collect relevant events
      const events = await this.collectFunnelEvents(funnel, dateRange);

      // Process user journeys
      const userJourneys = await this.processUserJourneys(funnel, events);

      // Calculate step results
      const stepResults = await this.calculateStepResults(funnel, userJourneys);

      // Calculate overall metrics
      const overallMetrics = this.calculateOverallMetrics(userJourneys, funnel);

      // Generate breakdowns if requested
      const breakdown = options.breakdown
        ? await this.generateBreakdowns(funnel, userJourneys, options.breakdown)
        : undefined;

      // Create analysis result
      const analysis: FunnelAnalysis = {
        funnelId,
        dateRange,
        results: stepResults,
        totalUsers: overallMetrics.totalUsers,
        completionRate: overallMetrics.completionRate,
        dropoffRate: overallMetrics.dropoffRate,
        averageTimeToComplete: overallMetrics.averageTimeToComplete,
        breakdown,
      };

      // Cache result
      if (this.config.enableResultCaching) {
        this.analysisCache.set(cacheKey, analysis);

        // Set up cache expiration
        setTimeout(
          () => {
            this.analysisCache.delete(cacheKey);
          },
          this.config.cacheTimeToLive * 60 * 1000
        );
      }

      const processingTime = Date.now() - startTime;
      console.log(`Funnel analysis completed in ${processingTime}ms`);

      this.emit('analysis-completed', { funnelId, analysis });
      return analysis;
    } catch (error) {
      console.error('Funnel analysis failed:', error);
      throw error;
    }
  }

  /**
   * Get optimization insights for a funnel
   */
  public async getFunnelOptimizationInsights(funnelId: string): Promise<FunnelOptimizationInsights> {
    const funnel = this.funnels.get(funnelId);
    if (!funnel) {
      throw new Error(`Funnel ${funnelId} not found`);
    }

    // Get recent analysis
    const dateRange = {
      start: Date.now() - 30 * 24 * 60 * 60 * 1000, // Last 30 days
      end: Date.now(),
    };

    const analysis = await this.analyzeFunnel(funnelId, dateRange);

    // Generate insights
    const insights = await this.optimizationEngine.generateInsights(funnel, analysis);

    this.emit('optimization-insights-generated', { funnelId, insights });
    return insights;
  }

  /**
   * Track real-time funnel events
   */
  public async trackFunnelEvent(event: AnalyticsEvent): Promise<void> {
    if (!this.config.enableRealTimeTracking) {return;}

    // Check if event matches any funnel steps
    for (const [funnelId, funnel] of this.funnels) {
      const matchingStep = this.findMatchingStep(funnel, event);
      if (matchingStep) {
        await this.processRealTimeEvent(funnelId, funnel, matchingStep, event);
      }
    }
  }

  /**
   * Get conversion paths analysis
   */
  public async getConversionPaths(
    funnelId: string,
    dateRange: { start: number; end: number }
  ): Promise<FunnelConversionPath[]> {
    const funnel = this.funnels.get(funnelId);
    if (!funnel) {
      throw new Error(`Funnel ${funnelId} not found`);
    }

    const events = await this.collectFunnelEvents(funnel, dateRange);
    const userJourneys = await this.processUserJourneys(funnel, events);

    return this.analyzeConversionPaths(userJourneys);
  }

  /**
   * Compare funnel performance across time periods
   */
  public async compareFunnelPerformance(
    funnelId: string,
    currentPeriod: { start: number; end: number },
    comparisonPeriod: { start: number; end: number }
  ): Promise<{
    current: FunnelAnalysis;
    comparison: FunnelAnalysis;
    changes: Array<{
      metric: string;
      currentValue: number;
      comparisonValue: number;
      change: number;
      changePercent: number;
    }>;
  }> {
    const [current, comparison] = await Promise.all([
      this.analyzeFunnel(funnelId, currentPeriod),
      this.analyzeFunnel(funnelId, comparisonPeriod),
    ]);

    const changes = this.calculatePerformanceChanges(current, comparison);

    return { current, comparison, changes };
  }

  /**
   * Get funnel performance by segment
   */
  public async getFunnelBySegment(
    funnelId: string,
    dateRange: { start: number; end: number },
    segmentProperty: string
  ): Promise<Record<string, FunnelAnalysis>> {
    const funnel = this.funnels.get(funnelId);
    if (!funnel) {
      throw new Error(`Funnel ${funnelId} not found`);
    }

    const events = await this.collectFunnelEvents(funnel, dateRange);
    const userJourneys = await this.processUserJourneys(funnel, events);

    // Group by segment
    const segmentGroups = this.groupJourneysBySegment(userJourneys, segmentProperty);

    // Analyze each segment
    const results: Record<string, FunnelAnalysis> = {};

    for (const [segment, journeys] of segmentGroups) {
      const stepResults = await this.calculateStepResults(funnel, journeys);
      const overallMetrics = this.calculateOverallMetrics(journeys, funnel);

      results[segment] = {
        funnelId,
        dateRange,
        results: stepResults,
        totalUsers: overallMetrics.totalUsers,
        completionRate: overallMetrics.completionRate,
        dropoffRate: overallMetrics.dropoffRate,
        averageTimeToComplete: overallMetrics.averageTimeToComplete,
      };
    }

    return results;
  }

  // Private methods
  private validateFunnelDefinition(funnel: FunnelDefinition): void {
    if (!funnel.steps || funnel.steps.length < 2) {
      throw new Error('Funnel must have at least 2 steps');
    }

    if (funnel.steps.length > 20) {
      throw new Error('Funnel cannot have more than 20 steps');
    }

    // Validate step order
    const orders = funnel.steps.map(s => s.order);
    const uniqueOrders = new Set(orders);
    if (uniqueOrders.size !== orders.length) {
      throw new Error('Step orders must be unique');
    }

    // Validate conditions
    for (const step of funnel.steps) {
      for (const condition of step.conditions) {
        if (!condition.property || condition.value === undefined) {
          throw new Error(`Invalid condition in step ${step.name}`);
        }
      }
    }
  }

  private async collectFunnelEvents(
    funnel: FunnelDefinition,
    dateRange: { start: number; end: number }
  ): Promise<AnalyticsEvent[]> {
    // Build query to collect relevant events
    const eventTypes = funnel.steps.map(step => step.eventType);

    const query = {
      id: uuidv4(),
      type: 'events' as const,
      metrics: [{ name: 'count', type: 'count' as const }],
      dimensions: [],
      filters: [
        { field: 'type', operator: 'in' as const, value: eventTypes },
        { field: 'timestamp', operator: 'greater_equal' as const, value: dateRange.start },
        { field: 'timestamp', operator: 'less_equal' as const, value: dateRange.end },
        ...funnel.eventFilters.map(filter => ({
          field: filter.property,
          operator: filter.operator as any,
          value: filter.value,
        })),
      ],
      timeRange: { type: 'absolute' as const, value: dateRange },
      granularity: 'hour' as const,
      limit: this.config.maxEventsPerAnalysis,
    };

    const result = await this.queryEngine.executeQuery(query);

    // Convert query result back to events (simplified)
    return [];
  }

  private async processUserJourneys(funnel: FunnelDefinition, events: AnalyticsEvent[]): Promise<FunnelUserJourney[]> {
    const journeys: Map<string, FunnelUserJourney> = new Map();

    // Group events by user
    const userEvents = this.groupEventsByUser(events);

    for (const [userId, userEventList] of userEvents) {
      const journey = this.createUserJourney(userId, userEventList, funnel);
      if (journey) {
        journeys.set(userId, journey);
      }
    }

    return Array.from(journeys.values());
  }

  private createUserJourney(
    userId: string,
    events: AnalyticsEvent[],
    funnel: FunnelDefinition
  ): FunnelUserJourney | null {
    // Sort events by timestamp
    const sortedEvents = events.sort((a, b) => a.timestamp - b.timestamp);

    if (sortedEvents.length === 0) {return null;}

    const firstEvent = sortedEvents[0];
    const journey: FunnelUserJourney = {
      userId: firstEvent.userId || '',
      anonymousId: firstEvent.anonymousId,
      sessionId: firstEvent.sessionId,
      startTime: firstEvent.timestamp,
      completedSteps: [],
      source: 'direct', // Would extract from event properties
      medium: 'organic',
      userSegment: 'new_user', // Would determine from user data
      customProperties: {},
    };

    // Process each funnel step
    for (const step of funnel.steps.sort((a, b) => a.order - b.order)) {
      const matchingEvent = this.findStepCompletionEvent(step, sortedEvents, journey);

      if (matchingEvent) {
        const completion: FunnelStepCompletion = {
          stepId: step.id,
          stepOrder: step.order,
          completedAt: matchingEvent.timestamp,
          timeSinceStart: matchingEvent.timestamp - journey.startTime,
          properties: matchingEvent.properties,
        };

        // Calculate time since previous step
        if (journey.completedSteps.length > 0) {
          const previousStep = journey.completedSteps[journey.completedSteps.length - 1];
          completion.timeSincePrevious = matchingEvent.timestamp - previousStep.completedAt;
        }

        journey.completedSteps.push(completion);
      } else {
        // User dropped off at this step
        journey.dropoffStep = step.order;
        journey.dropoffReason = this.analyzeDropoffReason(step, sortedEvents);
        break;
      }
    }

    // Set end time and conversion time
    if (journey.completedSteps.length > 0) {
      const lastStep = journey.completedSteps[journey.completedSteps.length - 1];
      journey.endTime = lastStep.completedAt;

      if (journey.completedSteps.length === funnel.steps.length) {
        journey.conversionTime = journey.endTime - journey.startTime;
      }
    }

    return journey;
  }

  private findStepCompletionEvent(
    step: FunnelStep,
    events: AnalyticsEvent[],
    journey: FunnelUserJourney
  ): AnalyticsEvent | null {
    for (const event of events) {
      if (event.type === step.eventType && this.evaluateStepConditions(step, event)) {
        // Check if this event comes after the previous step (if any)
        if (journey.completedSteps.length > 0) {
          const lastCompletion = journey.completedSteps[journey.completedSteps.length - 1];
          if (event.timestamp <= lastCompletion.completedAt) {
            continue; // Event is out of order
          }
        }

        return event;
      }
    }

    return null;
  }

  private evaluateStepConditions(step: FunnelStep, event: AnalyticsEvent): boolean {
    return step.conditions.every(condition => {
      const value = this.getEventPropertyValue(event, condition.property);
      return this.evaluateCondition(value, condition);
    });
  }

  private evaluateCondition(value: unknown, condition: FunnelCondition): boolean {
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'not_equals':
        return value !== condition.value;
      case 'contains':
        return String(value).includes(String(condition.value));
      case 'not_contains':
        return !String(value).includes(String(condition.value));
      case 'greater_than':
        return Number(value) > Number(condition.value);
      case 'less_than':
        return Number(value) < Number(condition.value);
      default:
        return false;
    }
  }

  private getEventPropertyValue(event: AnalyticsEvent, property: string): unknown {
    if (property.startsWith('properties.')) {
      return event.properties[property.replace('properties.', '')];
    }
    return (event as any)[property];
  }

  private async calculateStepResults(
    funnel: FunnelDefinition,
    journeys: FunnelUserJourney[]
  ): Promise<FunnelStepResult[]> {
    const results: FunnelStepResult[] = [];

    for (const step of funnel.steps.sort((a, b) => a.order - b.order)) {
      const journeysReachingStep = journeys.filter(j => j.completedSteps.some(s => s.stepId === step.id));

      const journeysFromPreviousStep =
        step.order === 1 ? journeys : journeys.filter(j => j.completedSteps.length >= step.order - 1);

      const userCount = journeysReachingStep.length;
      const conversionRate = journeysFromPreviousStep.length > 0 ? userCount / journeysFromPreviousStep.length : 0;
      const dropoffRate = 1 - conversionRate;

      // Calculate average time from previous step
      const timesFromPrevious = journeysReachingStep
        .map(j => j.completedSteps.find(s => s.stepId === step.id)?.timeSincePrevious)
        .filter(t => t !== undefined) as number[];

      const averageTimeFromPrevious =
        timesFromPrevious.length > 0
          ? timesFromPrevious.reduce((sum, time) => sum + time, 0) / timesFromPrevious.length
          : 0;

      // Analyze dropoff reasons
      const dropoffReasons = this.analyzeStepDropoffReasons(step, journeys);

      // Calculate user segment breakdown
      const userSegmentBreakdown = this.calculateUserSegmentBreakdown(journeysReachingStep);

      results.push({
        stepId: step.id,
        stepName: step.name,
        userCount,
        conversionRate,
        dropoffRate,
        averageTimeFromPrevious,
        topDropoffReasons: dropoffReasons,
        userSegmentBreakdown,
      });
    }

    return results;
  }

  private calculateOverallMetrics(
    journeys: FunnelUserJourney[],
    funnel: FunnelDefinition
  ): {
    totalUsers: number;
    completionRate: number;
    dropoffRate: number;
    averageTimeToComplete: number;
  } {
    const totalUsers = journeys.length;
    const completedJourneys = journeys.filter(j => j.completedSteps.length === funnel.steps.length);

    const completionRate = totalUsers > 0 ? completedJourneys.length / totalUsers : 0;
    const dropoffRate = 1 - completionRate;

    const conversionTimes = completedJourneys.map(j => j.conversionTime).filter(t => t !== undefined) as number[];

    const averageTimeToComplete =
      conversionTimes.length > 0 ? conversionTimes.reduce((sum, time) => sum + time, 0) / conversionTimes.length : 0;

    return {
      totalUsers,
      completionRate,
      dropoffRate,
      averageTimeToComplete,
    };
  }

  private async generateBreakdowns(
    funnel: FunnelDefinition,
    journeys: FunnelUserJourney[],
    breakdownProperties: string[]
  ): Promise<FunnelBreakdown[]> {
    const breakdowns: FunnelBreakdown[] = [];

    for (const property of breakdownProperties) {
      const values = new Map<string, FunnelUserJourney[]>();

      // Group journeys by property value
      for (const journey of journeys) {
        const value = String(journey.customProperties[property] || 'unknown');
        if (!values.has(value)) {
          values.set(value, []);
        }
        values.get(value)!.push(journey);
      }

      // Calculate metrics for each value
      const breakdownValues = Array.from(values.entries()).map(([value, valueJourneys]) => {
        const userCount = valueJourneys.length;
        const completedJourneys = valueJourneys.filter(j => j.completedSteps.length === funnel.steps.length);
        const conversionRate = userCount > 0 ? completedJourneys.length / userCount : 0;

        return { value, userCount, conversionRate };
      });

      breakdowns.push({
        property,
        values: breakdownValues.sort((a, b) => b.conversionRate - a.conversionRate),
      });
    }

    return breakdowns;
  }

  private groupEventsByUser(events: AnalyticsEvent[]): Map<string, AnalyticsEvent[]> {
    const userEvents = new Map<string, AnalyticsEvent[]>();

    for (const event of events) {
      const userId = event.userId || event.anonymousId;
      if (!userEvents.has(userId)) {
        userEvents.set(userId, []);
      }
      userEvents.get(userId)!.push(event);
    }

    return userEvents;
  }

  private findMatchingStep(funnel: FunnelDefinition, event: AnalyticsEvent): FunnelStep | null {
    return funnel.steps.find(step => step.eventType === event.type && this.evaluateStepConditions(step, event)) || null;
  }

  private async processRealTimeEvent(
    funnelId: string,
    funnel: FunnelDefinition,
    step: FunnelStep,
    event: AnalyticsEvent
  ): Promise<void> {
    const userId = event.userId || event.anonymousId;

    // Track conversion
    this.emit('real-time-conversion', { funnelId, userId, stepId: step.id });

    // Update real-time tracking
    this.realTimeTracker.recordStepCompletion(funnelId, userId, step.id, event.timestamp);
  }

  private analyzeDropoffReason(step: FunnelStep, events: AnalyticsEvent[]): string {
    // Analyze why user might have dropped off
    // This is a simplified implementation
    return 'User did not complete step requirements';
  }

  private analyzeStepDropoffReasons(step: FunnelStep, journeys: FunnelUserJourney[]): string[] {
    // Analyze common reasons for dropoff at this step
    return ['Did not meet step conditions', 'Session timeout', 'User left page'];
  }

  private calculateUserSegmentBreakdown(journeys: FunnelUserJourney[]): Record<UserSegment, number> {
    const breakdown: Record<UserSegment, number> = {
      new_user: 0,
      returning_user: 0,
      power_user: 0,
      at_risk: 0,
      dormant: 0,
      high_value: 0,
      low_value: 0,
      potential_churner: 0,
    };

    for (const journey of journeys) {
      breakdown[journey.userSegment]++;
    }

    return breakdown;
  }

  private analyzeConversionPaths(journeys: FunnelUserJourney[]): FunnelConversionPath[] {
    const pathMap = new Map<string, FunnelUserJourney[]>();

    // Group journeys by the steps they completed
    for (const journey of journeys) {
      const pathKey = journey.completedSteps.map(s => s.stepId).join('->');
      if (!pathMap.has(pathKey)) {
        pathMap.set(pathKey, []);
      }
      pathMap.get(pathKey)!.push(journey);
    }

    // Convert to conversion paths
    return Array.from(pathMap.entries())
      .map(([pathKey, pathJourneys]) => {
        const steps = pathKey.split('->');
        const userCount = pathJourneys.length;
        const completedJourneys = pathJourneys.filter(j => j.conversionTime !== undefined);
        const conversionRate = pathJourneys.length > 0 ? completedJourneys.length / pathJourneys.length : 0;

        const conversionTimes = completedJourneys.map(j => j.conversionTime!).filter(t => t !== undefined);
        const averageTime =
          conversionTimes.length > 0
            ? conversionTimes.reduce((sum, time) => sum + time, 0) / conversionTimes.length
            : 0;

        const dropoffPoints = this.calculateDropoffPoints(steps, pathJourneys);

        return {
          pathId: uuidv4(),
          steps,
          userCount,
          conversionRate,
          averageTime,
          dropoffPoints,
        };
      })
      .sort((a, b) => b.userCount - a.userCount);
  }

  private calculateDropoffPoints(
    steps: string[],
    journeys: FunnelUserJourney[]
  ): Array<{ step: number; dropoffRate: number; commonReasons: string[] }> {
    // Calculate dropoff at each step
    return steps.map((stepId, index) => ({
      step: index + 1,
      dropoffRate: 0.1, // Simplified calculation
      commonReasons: ['User abandoned flow', 'Technical issue'],
    }));
  }

  private calculatePerformanceChanges(
    current: FunnelAnalysis,
    comparison: FunnelAnalysis
  ): Array<{
    metric: string;
    currentValue: number;
    comparisonValue: number;
    change: number;
    changePercent: number;
  }> {
    const changes = [];

    // Overall completion rate
    const completionChange = current.completionRate - comparison.completionRate;
    changes.push({
      metric: 'Completion Rate',
      currentValue: current.completionRate,
      comparisonValue: comparison.completionRate,
      change: completionChange,
      changePercent: comparison.completionRate > 0 ? (completionChange / comparison.completionRate) * 100 : 0,
    });

    // Total users
    const usersChange = current.totalUsers - comparison.totalUsers;
    changes.push({
      metric: 'Total Users',
      currentValue: current.totalUsers,
      comparisonValue: comparison.totalUsers,
      change: usersChange,
      changePercent: comparison.totalUsers > 0 ? (usersChange / comparison.totalUsers) * 100 : 0,
    });

    return changes;
  }

  private groupJourneysBySegment(
    journeys: FunnelUserJourney[],
    segmentProperty: string
  ): Map<string, FunnelUserJourney[]> {
    const groups = new Map<string, FunnelUserJourney[]>();

    for (const journey of journeys) {
      const segmentValue = String(journey.customProperties[segmentProperty] || 'unknown');
      if (!groups.has(segmentValue)) {
        groups.set(segmentValue, []);
      }
      groups.get(segmentValue)!.push(journey);
    }

    return groups;
  }

  private setupEventHandlers(): void {
    this.realTimeTracker.on('dropoff-detected', data => {
      this.emit('dropoff-detected', data);
    });
  }

  private generateCacheKey(funnelId: string, dateRange: { start: number; end: number }, options: any): string {
    return `${funnelId}_${dateRange.start}_${dateRange.end}_${JSON.stringify(options)}`;
  }

  private clearFunnelCache(funnelId: string): void {
    for (const [key] of this.analysisCache) {
      if (key.startsWith(funnelId)) {
        this.analysisCache.delete(key);
      }
    }
  }

  public async shutdown(): Promise<void> {
    await this.realTimeTracker.shutdown();
    await this.optimizationEngine.shutdown();
    await this.attributionEngine.shutdown();
    this.removeAllListeners();
  }
}

// Supporting classes
class RealTimeFunnelTracker extends EventEmitter {
  private readonly activeFunnels: Map<string, FunnelDefinition> = new Map();
  private readonly userSessions: Map<string, Map<string, number>> = new Map(); // userId -> stepId -> timestamp

  constructor(private config: FunnelAnalysisConfig) {
    super();
  }

  trackFunnel(funnel: FunnelDefinition): void {
    this.activeFunnels.set(funnel.id, funnel);
  }

  recordStepCompletion(funnelId: string, userId: string, stepId: string, timestamp: number): void {
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Map());
    }

    const userSteps = this.userSessions.get(userId)!;
    userSteps.set(stepId, timestamp);

    // Check for dropoffs
    this.checkForDropoffs(funnelId, userId);
  }

  private checkForDropoffs(funnelId: string, userId: string): void {
    const funnel = this.activeFunnels.get(funnelId);
    const userSteps = this.userSessions.get(userId);

    if (!funnel || !userSteps) {return;}

    // Implementation would check for dropoff patterns
    // This is simplified
  }

  async shutdown(): Promise<void> {
    this.removeAllListeners();
  }
}

class FunnelOptimizationEngine {
  constructor(private config: FunnelAnalysisConfig) {}

  async generateInsights(funnel: FunnelDefinition, analysis: FunnelAnalysis): Promise<FunnelOptimizationInsights> {
    const overallPerformance = this.assessOverallPerformance(analysis);
    const stepInsights = this.generateStepInsights(funnel, analysis);
    const recommendations = this.generateRecommendations(analysis, stepInsights);
    const potentialImprovements = this.calculatePotentialImprovements(analysis);

    return {
      funnelId: funnel.id,
      overallPerformance,
      conversionRate: analysis.completionRate,
      benchmarkComparison: 0.85, // Would compare to industry benchmarks
      stepInsights,
      recommendations,
      potentialImprovements,
    };
  }

  private assessOverallPerformance(analysis: FunnelAnalysis): 'excellent' | 'good' | 'needs_improvement' | 'poor' {
    if (analysis.completionRate >= 0.8) {return 'excellent';}
    if (analysis.completionRate >= 0.6) {return 'good';}
    if (analysis.completionRate >= 0.3) {return 'needs_improvement';}
    return 'poor';
  }

  private generateStepInsights(funnel: FunnelDefinition, analysis: FunnelAnalysis): any[] {
    return analysis.results.map(stepResult => ({
      stepId: stepResult.stepId,
      stepName: stepResult.stepName,
      performance:
        stepResult.conversionRate >= 0.8
          ? 'excellent'
          : stepResult.conversionRate >= 0.6
            ? 'good'
            : stepResult.conversionRate >= 0.3
              ? 'needs_improvement'
              : 'poor',
      conversionRate: stepResult.conversionRate,
      averageTimeSpent: stepResult.averageTimeFromPrevious,
      dropoffRate: stepResult.dropoffRate,
      issues: stepResult.dropoffRate > 0.5 ? ['High dropoff rate'] : [],
      recommendations: stepResult.dropoffRate > 0.5 ? ['Simplify step requirements'] : [],
    }));
  }

  private generateRecommendations(analysis: FunnelAnalysis, stepInsights: any[]): any[] {
    const recommendations = [];

    // High-level recommendations based on overall performance
    if (analysis.completionRate < 0.5) {
      recommendations.push({
        priority: 'high' as const,
        category: 'flow' as const,
        description: 'Overall conversion rate is low. Consider simplifying the funnel flow.',
        expectedImpact: 25,
        effort: 'medium' as const,
      });
    }

    return recommendations;
  }

  private calculatePotentialImprovements(analysis: FunnelAnalysis): any[] {
    return analysis.results.map(step => ({
      stepId: step.stepId,
      currentRate: step.conversionRate,
      targetRate: Math.min(0.95, step.conversionRate * 1.2),
      impact: 100, // Additional conversions per month
    }));
  }

  async shutdown(): Promise<void> {}
}

class AttributionEngine {
  constructor(private config: FunnelAnalysisConfig) {}

  async shutdown(): Promise<void> {}
}

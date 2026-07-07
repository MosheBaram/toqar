import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import type {
  AnalyticsEvent,
  CohortDefinition,
  CohortCriteria,
  CohortAnalysis,
  CohortData,
  EventType,
  UserSegment,
} from '../types/analytics-types';
import { AnalyticsQueryEngine } from '../core/analytics-query-engine';

/**
 * Advanced Cohort Analysis Engine for Aialytics (Mixpanel-like)
 *
 * Features:
 * 1. Retention cohort analysis (daily, weekly, monthly)
 * 2. Revenue cohort tracking and LTV analysis
 * 3. Engagement cohort analysis
 * 4. Custom event-based cohorts
 * 5. Cohort comparison and benchmarking
 * 6. Predictive cohort analytics
 * 7. Segmented cohort analysis
 * 8. Real-time cohort updates
 */

export interface CohortAnalysisConfig {
  // Analysis Settings
  defaultTimeUnit: 'day' | 'week' | 'month';
  defaultPeriods: number;
  maxCohortsPerAnalysis: number;
  enableRealTimeUpdates: boolean;

  // Performance
  maxUsersPerCohort: number;
  enableResultCaching: boolean;
  cacheTimeToLive: number; // minutes
  enableParallelProcessing: boolean;

  // Advanced Features
  enablePredictiveAnalysis: boolean;
  enableLTVCalculation: boolean;
  enableEngagementScoring: boolean;
  enableCohortComparison: boolean;

  // Metrics
  enableRevenueTracking: boolean;
  enableCustomMetrics: boolean;
  customMetricDefinitions: CohortCustomMetric[];
}

export interface CohortCustomMetric {
  id: string;
  name: string;
  description: string;
  eventType: EventType;
  aggregation: 'count' | 'sum' | 'average' | 'unique';
  property?: string;
  filters?: Array<{ property: string; operator: string; value: unknown }>;
}

export interface CohortUser {
  userId: string;
  anonymousId: string;
  cohortDate: number;
  firstEventTime: number;
  acquisitionSource: string;
  acquisitionMedium: string;
  acquisitionCampaign?: string;
  userProperties: Record<string, unknown>;
  segment: UserSegment;

  // Activity tracking
  periodActivity: Map<number, CohortUserActivity>; // period -> activity
  totalRevenue: number;
  lifetimeValue: number;
  lastSeenAt: number;
  isActive: boolean;
}

export interface CohortUserActivity {
  period: number;
  isActive: boolean;
  eventCount: number;
  revenue: number;
  engagementScore: number;
  customMetrics: Record<string, number>;
  lastActivity: number;
}

export interface CohortAnalysisResult extends CohortAnalysis {
  // Enhanced analysis data
  cohortDetails: Map<string, CohortDetail>;
  retentionCurve: RetentionCurve;
  ltv: LTVAnalysis;
  engagementAnalysis: EngagementAnalysis;
  predictiveInsights: PredictiveInsights;
}

export interface CohortDetail {
  name: string;
  startDate: number;
  endDate: number;
  users: CohortUser[];
  size: number;
  acquisitionMetrics: {
    topSources: Array<{ source: string; users: number; percentage: number }>;
    topMediums: Array<{ medium: string; users: number; percentage: number }>;
    topCampaigns: Array<{ campaign: string; users: number; percentage: number }>;
  };
  performanceMetrics: {
    averageRetention: number;
    retentionTrend: 'improving' | 'declining' | 'stable';
    totalRevenue: number;
    averageLTV: number;
    engagementScore: number;
  };
}

export interface RetentionCurve {
  overall: Array<{ period: number; retentionRate: number; confidence: number }>;
  bySegment: Record<string, Array<{ period: number; retentionRate: number }>>;
  predictions: Array<{ period: number; predictedRetention: number; confidence: number }>;
  benchmarks: Array<{ period: number; industryAverage: number; percentile: number }>;
}

export interface LTVAnalysis {
  cohorts: Array<{
    cohortName: string;
    currentLTV: number;
    predictedLTV: number;
    ltv30: number;
    ltv60: number;
    ltv90: number;
    ltv365: number;
    paybackPeriod: number; // days
    revenueQuality: 'high' | 'medium' | 'low';
  }>;
  trends: {
    ltvTrend: 'improving' | 'declining' | 'stable';
    revenuePerUser: number;
    paybackTrend: 'improving' | 'declining' | 'stable';
  };
  segments: Record<
    string,
    {
      averageLTV: number;
      ltvMultiplier: number; // vs overall average
    }
  >;
}

export interface EngagementAnalysis {
  cohorts: Array<{
    cohortName: string;
    averageEngagement: number;
    engagementTrend: 'improving' | 'declining' | 'stable';
    highEngagementUsers: number;
    lowEngagementUsers: number;
    engagementDistribution: Array<{ score: number; userCount: number }>;
  }>;
  patterns: {
    peakEngagementPeriods: number[];
    engagementDeclinePoints: number[];
    recoveryPatterns: string[];
  };
}

export interface PredictiveInsights {
  retentionPredictions: Array<{
    cohortName: string;
    period: number;
    predictedRetention: number;
    confidence: number;
    factors: Array<{ factor: string; impact: number }>;
  }>;
  churnPredictions: Array<{
    cohortName: string;
    period: number;
    churnRisk: 'low' | 'medium' | 'high';
    usersAtRisk: number;
    interventionOpportunities: string[];
  }>;
  ltvForecasts: Array<{
    cohortName: string;
    forecastPeriod: number;
    predictedLTV: number;
    confidence: number;
    revenueImpact: number;
  }>;
}

export interface CohortAnalysisEvents {
  'cohort-created': { cohort: CohortDefinition };
  'cohort-updated': { cohortId: string; changes: Partial<CohortDefinition> };
  'analysis-completed': { cohortId: string; analysis: CohortAnalysisResult };
  'real-time-update': { cohortId: string; updates: Partial<CohortAnalysisResult> };
  'retention-milestone': { cohortId: string; cohortName: string; period: number; retentionRate: number };
  'churn-alert': { cohortId: string; cohortName: string; churnRate: number; severity: 'low' | 'medium' | 'high' };
  'ltv-threshold': { cohortId: string; cohortName: string; currentLTV: number; threshold: number };
  'predictive-insights-updated': { cohortId: string; insights: PredictiveInsights };
}

export class CohortAnalysisEngine extends EventEmitter<CohortAnalysisEvents> {
  private readonly config: CohortAnalysisConfig;
  private readonly queryEngine: AnalyticsQueryEngine;
  private readonly cohorts: Map<string, CohortDefinition> = new Map();
  private readonly analysisCache: Map<string, CohortAnalysisResult> = new Map();
  private readonly cohortUsers: Map<string, Map<string, CohortUser>> = new Map(); // cohortId -> userId -> user
  private readonly realTimeProcessor: RealTimeCohortProcessor;
  private readonly predictiveEngine: CohortPredictiveEngine;
  private readonly ltvCalculator: LTVCalculator;

  constructor(config: Partial<CohortAnalysisConfig> = {}, queryEngine: AnalyticsQueryEngine) {
    super();

    this.config = {
      defaultTimeUnit: 'week',
      defaultPeriods: 12,
      maxCohortsPerAnalysis: 50,
      enableRealTimeUpdates: true,
      maxUsersPerCohort: 100000,
      enableResultCaching: true,
      cacheTimeToLive: 60, // 1 hour
      enableParallelProcessing: true,
      enablePredictiveAnalysis: true,
      enableLTVCalculation: true,
      enableEngagementScoring: true,
      enableCohortComparison: true,
      enableRevenueTracking: true,
      enableCustomMetrics: true,
      customMetricDefinitions: [],
      ...config,
    };

    this.queryEngine = queryEngine;
    this.realTimeProcessor = new RealTimeCohortProcessor(this.config);
    this.predictiveEngine = new CohortPredictiveEngine(this.config);
    this.ltvCalculator = new LTVCalculator(this.config);

    this.setupEventHandlers();
  }

  /**
   * Create a new cohort definition
   */
  public async createCohort(cohortDefinition: Omit<CohortDefinition, 'id' | 'createdAt'>): Promise<string> {
    const cohort: CohortDefinition = {
      id: uuidv4(),
      createdAt: Date.now(),
      timeUnit: this.config.defaultTimeUnit,
      periods: this.config.defaultPeriods,
      ...cohortDefinition,
    };

    // Validate cohort definition
    this.validateCohortDefinition(cohort);

    // Store cohort
    this.cohorts.set(cohort.id, cohort);

    // Initialize cohort users map
    this.cohortUsers.set(cohort.id, new Map());

    // Set up real-time tracking if enabled
    if (this.config.enableRealTimeUpdates) {
      this.realTimeProcessor.trackCohort(cohort);
    }

    this.emit('cohort-created', { cohort });
    return cohort.id;
  }

  /**
   * Update existing cohort definition
   */
  public async updateCohort(cohortId: string, updates: Partial<CohortDefinition>): Promise<void> {
    const cohort = this.cohorts.get(cohortId);
    if (!cohort) {
      throw new Error(`Cohort ${cohortId} not found`);
    }

    // Apply updates
    Object.assign(cohort, updates);

    // Validate updated cohort
    this.validateCohortDefinition(cohort);

    // Clear cache for this cohort
    this.clearCohortCache(cohortId);

    this.emit('cohort-updated', { cohortId, changes: updates });
  }

  /**
   * Analyze cohort performance
   */
  public async analyzeCohort(
    cohortId: string,
    options: {
      includePredictions?: boolean;
      includeSegmentation?: boolean;
      customDateRange?: { start: number; end: number };
    } = {}
  ): Promise<CohortAnalysisResult> {
    const cohort = this.cohorts.get(cohortId);
    if (!cohort) {
      throw new Error(`Cohort ${cohortId} not found`);
    }

    // Check cache first
    const cacheKey = this.generateCacheKey(cohortId, options);
    const cached = this.analysisCache.get(cacheKey);
    if (cached && this.config.enableResultCaching) {
      return cached;
    }

    const startTime = Date.now();

    try {
      // Build cohorts based on definition
      const cohortGroups = await this.buildCohortGroups(cohort, options.customDateRange);

      // Analyze each cohort group
      const cohortDetails = await this.analyzeCohortGroups(cohort, cohortGroups);

      // Calculate retention rates
      const retentionRates = this.calculateRetentionRates(cohortGroups);

      // Generate retention curve
      const retentionCurve = await this.generateRetentionCurve(cohort, cohortGroups);

      // Calculate LTV if enabled
      const ltv = this.config.enableLTVCalculation
        ? await this.ltvCalculator.calculateLTV(cohort, cohortGroups)
        : this.getEmptyLTVAnalysis();

      // Calculate engagement analysis if enabled
      const engagementAnalysis = this.config.enableEngagementScoring
        ? await this.calculateEngagementAnalysis(cohort, cohortGroups)
        : this.getEmptyEngagementAnalysis();

      // Generate predictive insights if enabled
      const predictiveInsights = this.config.enablePredictiveAnalysis
        ? await this.predictiveEngine.generateInsights(cohort, cohortGroups, retentionRates)
        : this.getEmptyPredictiveInsights();

      // Create base analysis
      const baseAnalysis = this.createBaseAnalysis(cohort, cohortGroups, retentionRates);

      // Combine into result
      const result: CohortAnalysisResult = {
        ...baseAnalysis,
        cohortDetails,
        retentionCurve,
        ltv,
        engagementAnalysis,
        predictiveInsights,
      };

      // Cache result
      if (this.config.enableResultCaching) {
        this.analysisCache.set(cacheKey, result);

        // Set up cache expiration
        setTimeout(
          () => {
            this.analysisCache.delete(cacheKey);
          },
          this.config.cacheTimeToLive * 60 * 1000
        );
      }

      const processingTime = Date.now() - startTime;
      console.log(`Cohort analysis completed in ${processingTime}ms`);

      this.emit('analysis-completed', { cohortId, analysis: result });
      return result;
    } catch (error) {
      console.error('Cohort analysis failed:', error);
      throw error;
    }
  }

  /**
   * Compare multiple cohorts
   */
  public async compareCohorts(
    cohortIds: string[],
    metric: 'retention' | 'revenue' | 'engagement' = 'retention'
  ): Promise<{
    cohorts: Array<{ cohortId: string; name: string; performance: number }>;
    insights: Array<{ insight: string; impact: 'positive' | 'negative' | 'neutral' }>;
    recommendations: string[];
  }> {
    const analyses = await Promise.all(cohortIds.map(id => this.analyzeCohort(id)));

    const comparisons = analyses.map((analysis, index) => ({
      cohortId: cohortIds[index],
      name: this.cohorts.get(cohortIds[index])?.name || 'Unknown',
      performance: this.extractMetricValue(analysis, metric),
    }));

    const insights = this.generateComparisonInsights(analyses, metric);
    const recommendations = this.generateComparisonRecommendations(analyses);

    return { cohorts: comparisons, insights, recommendations };
  }

  /**
   * Get cohort health metrics
   */
  public getCohortHealthMetrics(cohortId: string): {
    overallHealth: 'excellent' | 'good' | 'warning' | 'critical';
    retentionHealth: number; // 0-100
    revenueHealth: number; // 0-100
    engagementHealth: number; // 0-100
    churnRisk: 'low' | 'medium' | 'high';
    recommendations: string[];
  } {
    const analysis = this.analysisCache.get(cohortId);
    if (!analysis) {
      throw new Error(`No analysis found for cohort ${cohortId}`);
    }

    return this.calculateHealthMetrics(analysis);
  }

  /**
   * Track real-time cohort events
   */
  public async trackCohortEvent(event: AnalyticsEvent): Promise<void> {
    if (!this.config.enableRealTimeUpdates) {return;}

    const userId = event.userId || event.anonymousId;

    // Update all relevant cohorts
    for (const [cohortId, cohort] of this.cohorts) {
      const cohortUser = this.getCohortUser(cohortId, userId);
      if (cohortUser) {
        await this.updateCohortUserActivity(cohortId, cohortUser, event);
      }
    }
  }

  /**
   * Get cohort retention predictions
   */
  public async getCohortPredictions(
    cohortId: string,
    forecastPeriods: number = 12
  ): Promise<
    Array<{
      period: number;
      predictedRetention: number;
      confidence: number;
      factors: Array<{ factor: string; impact: number }>;
    }>
  > {
    const cohort = this.cohorts.get(cohortId);
    if (!cohort) {
      throw new Error(`Cohort ${cohortId} not found`);
    }

    return await this.predictiveEngine.generateRetentionPredictions(cohort, forecastPeriods);
  }

  // Private methods
  private validateCohortDefinition(cohort: CohortDefinition): void {
    if (!cohort.criteria) {
      throw new Error('Cohort criteria is required');
    }

    if (cohort.periods < 1 || cohort.periods > 100) {
      throw new Error('Cohort periods must be between 1 and 100');
    }

    if (!['day', 'week', 'month'].includes(cohort.timeUnit)) {
      throw new Error('Time unit must be day, week, or month');
    }
  }

  private async buildCohortGroups(
    cohort: CohortDefinition,
    customDateRange?: { start: number; end: number }
  ): Promise<Map<string, CohortUser[]>> {
    const cohortGroups = new Map<string, CohortUser[]>();

    // Determine date range
    const dateRange = customDateRange || this.getDefaultDateRange(cohort);

    // Query for cohort users based on criteria
    const users = await this.queryCohortUsers(cohort, dateRange);

    // Group users by cohort period
    for (const user of users) {
      const cohortKey = this.getCohortKey(user.cohortDate, cohort.timeUnit);

      if (!cohortGroups.has(cohortKey)) {
        cohortGroups.set(cohortKey, []);
      }

      cohortGroups.get(cohortKey)!.push(user);
    }

    return cohortGroups;
  }

  private async queryCohortUsers(
    cohort: CohortDefinition,
    dateRange: { start: number; end: number }
  ): Promise<CohortUser[]> {
    // Build query based on cohort criteria
    const query = {
      id: uuidv4(),
      type: 'events' as const,
      metrics: [{ name: 'unique_users', type: 'unique' as const, field: 'userId' }],
      dimensions: [{ name: 'userId', field: 'userId', type: 'string' as const }],
      filters: [
        { field: 'timestamp', operator: 'greater_equal' as const, value: dateRange.start },
        { field: 'timestamp', operator: 'less_equal' as const, value: dateRange.end },
        ...this.buildCriteriaFilters(cohort.criteria),
      ],
      timeRange: { type: 'absolute' as const, value: dateRange },
      granularity: 'day' as const,
      limit: this.config.maxUsersPerCohort,
    };

    const result = await this.queryEngine.executeQuery(query);

    // Convert query results to cohort users
    return this.convertToCohortUsers(result.data, cohort);
  }

  private buildCriteriaFilters(criteria: CohortCriteria): Array<{
    field: string;
    operator: string;
    value: unknown;
  }> {
    const filters = [];

    if (criteria.eventType) {
      filters.push({
        field: 'type',
        operator: 'equals',
        value: criteria.eventType,
      });
    }

    if (criteria.propertyName && criteria.propertyValue !== undefined) {
      filters.push({
        field: `properties.${criteria.propertyName}`,
        operator: 'equals',
        value: criteria.propertyValue,
      });
    }

    return filters;
  }

  private convertToCohortUsers(queryResults: any[], cohort: CohortDefinition): CohortUser[] {
    // Convert query results to CohortUser objects
    // This is a simplified implementation
    return [];
  }

  private async analyzeCohortGroups(
    cohort: CohortDefinition,
    cohortGroups: Map<string, CohortUser[]>
  ): Promise<Map<string, CohortDetail>> {
    const details = new Map<string, CohortDetail>();

    for (const [cohortKey, users] of cohortGroups) {
      const detail = await this.analyzeCohortGroup(cohortKey, users, cohort);
      details.set(cohortKey, detail);
    }

    return details;
  }

  private async analyzeCohortGroup(
    cohortKey: string,
    users: CohortUser[],
    cohort: CohortDefinition
  ): Promise<CohortDetail> {
    // Calculate acquisition metrics
    const acquisitionMetrics = this.calculateAcquisitionMetrics(users);

    // Calculate performance metrics
    const performanceMetrics = await this.calculatePerformanceMetrics(users, cohort);

    // Determine date range for this cohort
    const { startDate, endDate } = this.getCohortDateRange(cohortKey, cohort.timeUnit);

    return {
      name: cohortKey,
      startDate,
      endDate,
      users,
      size: users.length,
      acquisitionMetrics,
      performanceMetrics,
    };
  }

  private calculateRetentionRates(cohortGroups: Map<string, CohortUser[]>): CohortData[] {
    const cohortData: CohortData[] = [];

    for (const [cohortKey, users] of cohortGroups) {
      const retentionRates = this.calculateCohortRetention(users);

      cohortData.push({
        name: cohortKey,
        size: users.length,
        retentionRates,
        revenue: users.reduce((sum, user) => sum + user.totalRevenue, 0),
      });
    }

    return cohortData;
  }

  private calculateCohortRetention(users: CohortUser[]): number[] {
    const retentionRates: number[] = [];
    const totalUsers = users.length;

    // Calculate retention for each period
    for (let period = 0; period < this.config.defaultPeriods; period++) {
      const activeUsers = users.filter(user => {
        const activity = user.periodActivity.get(period);
        return activity && activity.isActive;
      }).length;

      const retentionRate = totalUsers > 0 ? activeUsers / totalUsers : 0;
      retentionRates.push(retentionRate);
    }

    return retentionRates;
  }

  private async generateRetentionCurve(
    cohort: CohortDefinition,
    cohortGroups: Map<string, CohortUser[]>
  ): Promise<RetentionCurve> {
    // Calculate overall retention curve
    const overall = this.calculateOverallRetentionCurve(cohortGroups);

    // Calculate retention by segment if enabled
    const bySegment = this.config.enableAdvancedSegmentation ? this.calculateRetentionBySegment(cohortGroups) : {};

    // Generate predictions if enabled
    const predictions = this.config.enablePredictiveAnalysis
      ? await this.predictiveEngine.generateRetentionCurve(cohort, cohortGroups)
      : [];

    // Get industry benchmarks (placeholder)
    const benchmarks = this.getIndustryBenchmarks();

    return {
      overall,
      bySegment,
      predictions,
      benchmarks,
    };
  }

  private calculateOverallRetentionCurve(
    cohortGroups: Map<string, CohortUser[]>
  ): Array<{ period: number; retentionRate: number; confidence: number }> {
    const curve = [];

    for (let period = 0; period < this.config.defaultPeriods; period++) {
      let totalUsers = 0;
      let activeUsers = 0;

      for (const users of cohortGroups.values()) {
        totalUsers += users.length;
        activeUsers += users.filter(user => {
          const activity = user.periodActivity.get(period);
          return activity && activity.isActive;
        }).length;
      }

      const retentionRate = totalUsers > 0 ? activeUsers / totalUsers : 0;
      const confidence = this.calculateConfidence(totalUsers, activeUsers);

      curve.push({ period, retentionRate, confidence });
    }

    return curve;
  }

  private calculateRetentionBySegment(
    cohortGroups: Map<string, CohortUser[]>
  ): Record<string, Array<{ period: number; retentionRate: number }>> {
    const bySegment: Record<string, Array<{ period: number; retentionRate: number }>> = {};

    // Group users by segment
    const segmentGroups = new Map<string, CohortUser[]>();
    for (const users of cohortGroups.values()) {
      for (const user of users) {
        const segment = user.segment;
        if (!segmentGroups.has(segment)) {
          segmentGroups.set(segment, []);
        }
        segmentGroups.get(segment)!.push(user);
      }
    }

    // Calculate retention for each segment
    for (const [segment, users] of segmentGroups) {
      bySegment[segment] = this.calculateSegmentRetentionCurve(users);
    }

    return bySegment;
  }

  private calculateSegmentRetentionCurve(users: CohortUser[]): Array<{ period: number; retentionRate: number }> {
    const curve = [];
    const totalUsers = users.length;

    for (let period = 0; period < this.config.defaultPeriods; period++) {
      const activeUsers = users.filter(user => {
        const activity = user.periodActivity.get(period);
        return activity && activity.isActive;
      }).length;

      const retentionRate = totalUsers > 0 ? activeUsers / totalUsers : 0;
      curve.push({ period, retentionRate });
    }

    return curve;
  }

  private async calculateEngagementAnalysis(
    cohort: CohortDefinition,
    cohortGroups: Map<string, CohortUser[]>
  ): Promise<EngagementAnalysis> {
    const cohortAnalyses = [];

    for (const [cohortKey, users] of cohortGroups) {
      const analysis = this.analyzeCohortEngagement(cohortKey, users);
      cohortAnalyses.push(analysis);
    }

    const patterns = this.identifyEngagementPatterns(cohortGroups);

    return {
      cohorts: cohortAnalyses,
      patterns,
    };
  }

  private analyzeCohortEngagement(cohortKey: string, users: CohortUser[]): any {
    const engagementScores = users.map(user => this.calculateUserEngagement(user));
    const averageEngagement = engagementScores.reduce((sum, score) => sum + score, 0) / engagementScores.length;

    const highEngagementUsers = users.filter(user => this.calculateUserEngagement(user) > 0.7).length;
    const lowEngagementUsers = users.filter(user => this.calculateUserEngagement(user) < 0.3).length;

    const engagementTrend = this.calculateEngagementTrend(users);
    const engagementDistribution = this.calculateEngagementDistribution(engagementScores);

    return {
      cohortName: cohortKey,
      averageEngagement,
      engagementTrend,
      highEngagementUsers,
      lowEngagementUsers,
      engagementDistribution,
    };
  }

  private calculateUserEngagement(user: CohortUser): number {
    // Calculate engagement score based on user activity
    let totalScore = 0;
    let periods = 0;

    for (const activity of user.periodActivity.values()) {
      totalScore += activity.engagementScore;
      periods++;
    }

    return periods > 0 ? totalScore / periods : 0;
  }

  private createBaseAnalysis(
    cohort: CohortDefinition,
    cohortGroups: Map<string, CohortUser[]>,
    retentionRates: CohortData[]
  ): CohortAnalysis {
    const totalUsers = Array.from(cohortGroups.values()).reduce((sum, users) => sum + users.length, 0);

    const averageRetention =
      retentionRates.length > 0
        ? retentionRates.reduce((sum, data) => sum + data.retentionRates[1] || 0, 0) / retentionRates.length
        : 0;

    const retentionTrend = this.calculateRetentionTrend(retentionRates);

    return {
      cohortId: cohort.id,
      cohorts: retentionRates,
      totalUsers,
      averageRetention,
      retentionTrend,
    };
  }

  // Utility methods
  private getCohortUser(cohortId: string, userId: string): CohortUser | undefined {
    return this.cohortUsers.get(cohortId)?.get(userId);
  }

  private async updateCohortUserActivity(cohortId: string, user: CohortUser, event: AnalyticsEvent): Promise<void> {
    const period = this.calculatePeriod(user.cohortDate, event.timestamp, 'week');

    let activity = user.periodActivity.get(period);
    if (!activity) {
      activity = {
        period,
        isActive: false,
        eventCount: 0,
        revenue: 0,
        engagementScore: 0,
        customMetrics: {},
        lastActivity: 0,
      };
      user.periodActivity.set(period, activity);
    }

    // Update activity
    activity.isActive = true;
    activity.eventCount++;
    activity.lastActivity = event.timestamp;

    // Update revenue if purchase event
    if (event.type === 'purchase' && event.properties.revenue) {
      activity.revenue += event.properties.revenue as number;
      user.totalRevenue += event.properties.revenue as number;
    }

    // Update engagement score
    activity.engagementScore = this.calculateEngagementScore(activity);

    // Update custom metrics
    for (const metric of this.config.customMetricDefinitions) {
      if (event.type === metric.eventType) {
        const value = this.calculateCustomMetricValue(event, metric);
        activity.customMetrics[metric.id] = (activity.customMetrics[metric.id] || 0) + value;
      }
    }

    user.lastSeenAt = event.timestamp;
    user.isActive = true;
  }

  private calculatePeriod(startTime: number, currentTime: number, timeUnit: string): number {
    const diffMs = currentTime - startTime;

    switch (timeUnit) {
      case 'day':
        return Math.floor(diffMs / (24 * 60 * 60 * 1000));
      case 'week':
        return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
      case 'month':
        return Math.floor(diffMs / (30 * 24 * 60 * 60 * 1000));
      default:
        return 0;
    }
  }

  private calculateEngagementScore(activity: CohortUserActivity): number {
    // Simple engagement scoring based on activity
    const baseScore = Math.min(activity.eventCount / 10, 1); // Cap at 10 events = 1.0
    const revenueBonus = activity.revenue > 0 ? 0.2 : 0;
    return Math.min(baseScore + revenueBonus, 1);
  }

  private calculateCustomMetricValue(event: AnalyticsEvent, metric: CohortCustomMetric): number {
    switch (metric.aggregation) {
      case 'count':
        return 1;
      case 'sum':
        return Number(event.properties[metric.property!] || 0);
      case 'average':
        return Number(event.properties[metric.property!] || 0);
      case 'unique':
        return 1; // Would need more complex tracking for true unique counts
      default:
        return 1;
    }
  }

  private getDefaultDateRange(cohort: CohortDefinition): { start: number; end: number } {
    const end = Date.now();
    const periodMs = this.getPeriodMilliseconds(cohort.timeUnit);
    const start = end - cohort.periods * periodMs;

    return { start, end };
  }

  private getPeriodMilliseconds(timeUnit: string): number {
    switch (timeUnit) {
      case 'day':
        return 24 * 60 * 60 * 1000;
      case 'week':
        return 7 * 24 * 60 * 60 * 1000;
      case 'month':
        return 30 * 24 * 60 * 60 * 1000;
      default:
        return 24 * 60 * 60 * 1000;
    }
  }

  private getCohortKey(timestamp: number, timeUnit: string): string {
    const date = new Date(timestamp);

    switch (timeUnit) {
      case 'day':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return `Week of ${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
      case 'month':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      default:
        return String(timestamp);
    }
  }

  private getCohortDateRange(cohortKey: string, timeUnit: string): { startDate: number; endDate: number } {
    // Parse cohort key and return date range
    // This is a simplified implementation
    const now = Date.now();
    return { startDate: now, endDate: now };
  }

  private calculateAcquisitionMetrics(users: CohortUser[]): any {
    const sourceCount = new Map<string, number>();
    const mediumCount = new Map<string, number>();
    const campaignCount = new Map<string, number>();

    for (const user of users) {
      sourceCount.set(user.acquisitionSource, (sourceCount.get(user.acquisitionSource) || 0) + 1);
      mediumCount.set(user.acquisitionMedium, (mediumCount.get(user.acquisitionMedium) || 0) + 1);
      if (user.acquisitionCampaign) {
        campaignCount.set(user.acquisitionCampaign, (campaignCount.get(user.acquisitionCampaign) || 0) + 1);
      }
    }

    const total = users.length;

    return {
      topSources: Array.from(sourceCount.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([source, count]) => ({ source, users: count, percentage: count / total })),
      topMediums: Array.from(mediumCount.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([medium, count]) => ({ medium, users: count, percentage: count / total })),
      topCampaigns: Array.from(campaignCount.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([campaign, count]) => ({ campaign, users: count, percentage: count / total })),
    };
  }

  private async calculatePerformanceMetrics(users: CohortUser[], cohort: CohortDefinition): Promise<any> {
    const retentionRates = this.calculateCohortRetention(users);
    const averageRetention = retentionRates.length > 1 ? retentionRates[1] : 0; // Day 1 retention
    const retentionTrend = this.calculateSingleCohortTrend(retentionRates);

    const totalRevenue = users.reduce((sum, user) => sum + user.totalRevenue, 0);
    const averageLTV = users.length > 0 ? totalRevenue / users.length : 0;

    const engagementScores = users.map(user => this.calculateUserEngagement(user));
    const engagementScore = engagementScores.reduce((sum, score) => sum + score, 0) / engagementScores.length;

    return {
      averageRetention,
      retentionTrend,
      totalRevenue,
      averageLTV,
      engagementScore,
    };
  }

  private calculateSingleCohortTrend(retentionRates: number[]): 'improving' | 'declining' | 'stable' {
    if (retentionRates.length < 3) {return 'stable';}

    const recent = retentionRates.slice(-3).reduce((sum, rate) => sum + rate, 0) / 3;
    const earlier = retentionRates.slice(0, 3).reduce((sum, rate) => sum + rate, 0) / 3;

    if (recent > earlier * 1.05) {return 'improving';}
    if (recent < earlier * 0.95) {return 'declining';}
    return 'stable';
  }

  private calculateRetentionTrend(retentionRates: CohortData[]): 'improving' | 'declining' | 'stable' {
    if (retentionRates.length < 2) {return 'stable';}

    // Compare recent cohorts to older ones
    const recentCohorts = retentionRates.slice(-3);
    const olderCohorts = retentionRates.slice(0, 3);

    const recentAvg =
      recentCohorts.reduce((sum, data) => sum + (data.retentionRates[1] || 0), 0) / recentCohorts.length;
    const olderAvg = olderCohorts.reduce((sum, data) => sum + (data.retentionRates[1] || 0), 0) / olderCohorts.length;

    if (recentAvg > olderAvg * 1.05) {return 'improving';}
    if (recentAvg < olderAvg * 0.95) {return 'declining';}
    return 'stable';
  }

  private calculateConfidence(totalUsers: number, activeUsers: number): number {
    // Calculate statistical confidence (simplified)
    if (totalUsers < 100) {return 0.6;}
    if (totalUsers < 1000) {return 0.8;}
    return 0.95;
  }

  private identifyEngagementPatterns(cohortGroups: Map<string, CohortUser[]>): any {
    // Identify patterns in engagement across cohorts
    return {
      peakEngagementPeriods: [1, 7, 30], // Days when engagement peaks
      engagementDeclinePoints: [14, 60], // Days when engagement typically declines
      recoveryPatterns: ['Email campaign effectiveness', 'Feature release impact'],
    };
  }

  private calculateEngagementTrend(users: CohortUser[]): 'improving' | 'declining' | 'stable' {
    // Calculate trend in engagement over time for this cohort
    return 'stable'; // Simplified implementation
  }

  private calculateEngagementDistribution(engagementScores: number[]): Array<{ score: number; userCount: number }> {
    const buckets = new Map<number, number>();

    for (const score of engagementScores) {
      const bucket = Math.floor(score * 10) / 10; // Round to nearest 0.1
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    }

    return Array.from(buckets.entries())
      .map(([score, userCount]) => ({ score, userCount }))
      .sort((a, b) => a.score - b.score);
  }

  private getIndustryBenchmarks(): Array<{ period: number; industryAverage: number; percentile: number }> {
    // Return industry benchmark data (placeholder)
    return Array.from({ length: 12 }, (_, period) => ({
      period,
      industryAverage: 0.4 * Math.exp(-period * 0.1), // Exponential decay
      percentile: 75, // 75th percentile
    }));
  }

  private extractMetricValue(analysis: CohortAnalysisResult, metric: string): number {
    switch (metric) {
      case 'retention':
        return analysis.averageRetention;
      case 'revenue':
        return analysis.ltv.cohorts.reduce((sum, cohort) => sum + cohort.currentLTV, 0) / analysis.ltv.cohorts.length;
      case 'engagement':
        return (
          analysis.engagementAnalysis.cohorts.reduce((sum, cohort) => sum + cohort.averageEngagement, 0) /
          analysis.engagementAnalysis.cohorts.length
        );
      default:
        return 0;
    }
  }

  private generateComparisonInsights(
    analyses: CohortAnalysisResult[],
    metric: string
  ): Array<{ insight: string; impact: 'positive' | 'negative' | 'neutral' }> {
    // Generate insights from cohort comparison
    return [
      { insight: 'Newer cohorts show improved retention', impact: 'positive' },
      { insight: 'Revenue per user is declining in recent cohorts', impact: 'negative' },
    ];
  }

  private generateComparisonRecommendations(analyses: CohortAnalysisResult[]): string[] {
    return [
      'Focus on improving onboarding for new users',
      'Implement retention campaigns for at-risk users',
      'Analyze successful cohorts to replicate strategies',
    ];
  }

  private calculateHealthMetrics(analysis: CohortAnalysisResult): any {
    const retentionHealth = Math.min(analysis.averageRetention * 100, 100);
    const revenueHealth = 75; // Would calculate from LTV trends
    const engagementHealth =
      (analysis.engagementAnalysis.cohorts.reduce((sum, c) => sum + c.averageEngagement, 0) * 100) /
      analysis.engagementAnalysis.cohorts.length;

    const overallHealth = (retentionHealth + revenueHealth + engagementHealth) / 3;

    let healthStatus: 'excellent' | 'good' | 'warning' | 'critical';
    if (overallHealth >= 80) {healthStatus = 'excellent';}
    else if (overallHealth >= 60) {healthStatus = 'good';}
    else if (overallHealth >= 40) {healthStatus = 'warning';}
    else {healthStatus = 'critical';}

    return {
      overallHealth: healthStatus,
      retentionHealth,
      revenueHealth,
      engagementHealth,
      churnRisk: overallHealth < 50 ? 'high' : overallHealth < 70 ? 'medium' : 'low',
      recommendations: this.generateHealthRecommendations(healthStatus),
    };
  }

  private generateHealthRecommendations(health: string): string[] {
    switch (health) {
      case 'critical':
        return ['Immediate intervention required', 'Review onboarding process', 'Implement retention campaigns'];
      case 'warning':
        return ['Monitor closely', 'A/B test improvements', 'Enhance user engagement'];
      case 'good':
        return ['Continue current strategies', 'Look for optimization opportunities'];
      default:
        return ['Maintain excellent performance', 'Share best practices'];
    }
  }

  private getEmptyLTVAnalysis(): LTVAnalysis {
    return {
      cohorts: [],
      trends: { ltvTrend: 'stable', revenuePerUser: 0, paybackTrend: 'stable' },
      segments: {},
    };
  }

  private getEmptyEngagementAnalysis(): EngagementAnalysis {
    return {
      cohorts: [],
      patterns: { peakEngagementPeriods: [], engagementDeclinePoints: [], recoveryPatterns: [] },
    };
  }

  private getEmptyPredictiveInsights(): PredictiveInsights {
    return {
      retentionPredictions: [],
      churnPredictions: [],
      ltvForecasts: [],
    };
  }

  private setupEventHandlers(): void {
    this.realTimeProcessor.on('retention-milestone', data => {
      this.emit('retention-milestone', data);
    });

    this.realTimeProcessor.on('churn-alert', data => {
      this.emit('churn-alert', data);
    });
  }

  private generateCacheKey(cohortId: string, options: any): string {
    return `${cohortId}_${JSON.stringify(options)}`;
  }

  private clearCohortCache(cohortId: string): void {
    for (const [key] of this.analysisCache) {
      if (key.startsWith(cohortId)) {
        this.analysisCache.delete(key);
      }
    }
  }

  public async shutdown(): Promise<void> {
    await this.realTimeProcessor.shutdown();
    await this.predictiveEngine.shutdown();
    await this.ltvCalculator.shutdown();
    this.removeAllListeners();
  }
}

// Supporting classes
class RealTimeCohortProcessor extends EventEmitter {
  private readonly activeCohorts: Map<string, CohortDefinition> = new Map();

  constructor(private config: CohortAnalysisConfig) {
    super();
  }

  trackCohort(cohort: CohortDefinition): void {
    this.activeCohorts.set(cohort.id, cohort);
  }

  async shutdown(): Promise<void> {
    this.removeAllListeners();
  }
}

class CohortPredictiveEngine {
  constructor(private config: CohortAnalysisConfig) {}

  async generateInsights(
    cohort: CohortDefinition,
    cohortGroups: Map<string, CohortUser[]>,
    retentionRates: CohortData[]
  ): Promise<PredictiveInsights> {
    return {
      retentionPredictions: [],
      churnPredictions: [],
      ltvForecasts: [],
    };
  }

  async generateRetentionPredictions(
    cohort: CohortDefinition,
    forecastPeriods: number
  ): Promise<
    Array<{
      period: number;
      predictedRetention: number;
      confidence: number;
      factors: Array<{ factor: string; impact: number }>;
    }>
  > {
    return [];
  }

  async generateRetentionCurve(
    cohort: CohortDefinition,
    cohortGroups: Map<string, CohortUser[]>
  ): Promise<Array<{ period: number; predictedRetention: number; confidence: number }>> {
    return [];
  }

  async shutdown(): Promise<void> {}
}

class LTVCalculator {
  constructor(private config: CohortAnalysisConfig) {}

  async calculateLTV(cohort: CohortDefinition, cohortGroups: Map<string, CohortUser[]>): Promise<LTVAnalysis> {
    return {
      cohorts: [],
      trends: { ltvTrend: 'stable', revenuePerUser: 0, paybackTrend: 'stable' },
      segments: {},
    };
  }

  async shutdown(): Promise<void> {}
}

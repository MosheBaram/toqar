/**
 * A/B Testing Framework
 * Statistical testing with experiment management and automated decisions
 */

import { EventEmitter } from 'events';
import { injectable } from 'tsyringe';
import { InjectLogger, InjectCache } from './di/decorators';
import { Logger } from './logging/logger';
import { ICache } from './cache/cache.interface';

export interface ABTestingConfig {
  enableExperiments: boolean;
  maxConcurrentExperiments: number;
  defaultTrafficSplit: number; // 0-1
  minSampleSize: number;
  maxExperimentDuration: number; // days
  significanceLevel: number; // 0-1 (e.g., 0.05 for 95% confidence)
  minimumDetectableEffect: number; // 0-1 (e.g., 0.05 for 5% improvement)
  powerThreshold: number; // 0-1 (e.g., 0.8 for 80% power)
  enableAutoDecisions: boolean;
  enableSegmentation: boolean;
}

export interface Experiment {
  id: string;
  name: string;
  description: string;
  hypothesis: string;
  owner: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'terminated';
  
  // Configuration
  trafficSplit: Record<string, number>; // variant -> percentage
  targetMetrics: TargetMetric[];
  segments: ExperimentSegment[];
  excludeRules: ExclusionRule[];
  
  // Timing
  startDate?: Date;
  endDate?: Date;
  plannedDuration: number; // days
  actualDuration?: number; // days
  
  // Variants
  variants: ExperimentVariant[];
  
  // Results
  results?: ExperimentResults;
  decision?: ExperimentDecision;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface ExperimentVariant {
  id: string;
  name: string;
  description: string;
  isControl: boolean;
  trafficAllocation: number; // 0-1
  configuration: Record<string, any>;
  
  // Performance tracking
  exposures: number;
  conversions: number;
  conversionRate: number;
  revenue: number;
  
  // Statistical data
  sampleSize: number;
  confidence: number;
  significance: number;
}

export interface TargetMetric {
  id: string;
  name: string;
  type: 'conversion' | 'revenue' | 'engagement' | 'retention' | 'custom';
  description: string;
  goal: 'increase' | 'decrease' | 'maintain';
  currentBaseline?: number;
  targetImprovement: number; // percentage
  isPrimary: boolean;
  weight: number; // for multi-metric optimization
}

export interface ExperimentSegment {
  id: string;
  name: string;
  description: string;
  criteria: {
    userProperties?: Record<string, any>;
    behaviorCriteria?: string[];
    demographicFilters?: Record<string, any>;
    geographicFilters?: string[];
    deviceFilters?: string[];
  };
  trafficAllocation: number; // 0-1
}

export interface ExclusionRule {
  id: string;
  name: string;
  condition: string;
  reason: string;
  enabled: boolean;
}

export interface ExperimentResults {
  id: string;
  experimentId: string;
  generatedAt: Date;
  
  // Statistical Analysis
  overallResults: VariantResults[];
  segmentResults: Record<string, VariantResults[]>;
  metricResults: Record<string, MetricAnalysis>;
  
  // Statistical Tests
  statisticalTests: StatisticalTest[];
  
  // Confidence and Power
  overallConfidence: number;
  overallPower: number;
  overallSignificance: number;
  
  // Recommendations
  recommendations: string[];
  riskAssessment: RiskAssessment;
  
  // Business Impact
  estimatedImpact: BusinessImpact;
}

export interface VariantResults {
  variantId: string;
  variantName: string;
  
  // Sample Data
  sampleSize: number;
  exposures: number;
  conversions: number;
  conversionRate: number;
  revenue: number;
  
  // Statistical Measures
  mean: number;
  standardDeviation: number;
  standardError: number;
  confidenceInterval: { lower: number; upper: number };
  
  // Comparisons to Control
  relativeImprovement?: number;
  absoluteImprovement?: number;
  pValue?: number;
  zScore?: number;
  
  // Quality Metrics
  sampleRatio: number;
  exposureQuality: number;
  dataQuality: number;
}

export interface MetricAnalysis {
  metricId: string;
  metricName: string;
  
  // Results by variant
  variantPerformance: Record<string, number>;
  
  // Statistical significance
  isSignificant: boolean;
  pValue: number;
  confidenceLevel: number;
  effectSize: number;
  
  // Power analysis
  observedPower: number;
  requiredSampleSize: number;
  actualSampleSize: number;
  
  // Trend analysis
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  trendSignificance: number;
}

export interface StatisticalTest {
  testType: 'ttest' | 'welch' | 'chi_square' | 'mann_whitney' | 'bootstrap';
  hypothesis: string;
  nullHypothesis: string;
  alternativeHypothesis: string;
  
  // Test results
  testStatistic: number;
  pValue: number;
  criticalValue: number;
  degreesOfFreedom?: number;
  
  // Decision
  rejectNull: boolean;
  conclusion: string;
  
  // Assumptions
  assumptionsMet: boolean;
  assumptionChecks: Record<string, boolean>;
}

export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high';
  riskFactors: {
    sampleSizeRisk: 'low' | 'medium' | 'high';
    biasRisk: 'low' | 'medium' | 'high';
    externalValidityRisk: 'low' | 'medium' | 'high';
    implementationRisk: 'low' | 'medium' | 'high';
  };
  mitigation: string[];
  confidence: number;
}

export interface BusinessImpact {
  estimatedLift: number; // percentage
  estimatedRevenue: number;
  estimatedCost: number;
  roi: number;
  
  // Projections
  annualizedImpact: number;
  confidenceInterval: { lower: number; upper: number };
  
  // Risk-adjusted metrics
  expectedValue: number;
  valueAtRisk: number;
  probabilityOfSuccess: number;
}

export interface ExperimentDecision {
  decision: 'launch_winner' | 'continue_testing' | 'terminate' | 'iterate';
  winningVariant?: string;
  confidence: number;
  reasoning: string[];
  
  // Decision criteria met
  statisticalSignificance: boolean;
  practicalSignificance: boolean;
  sampleSizeAdequate: boolean;
  riskAcceptable: boolean;
  
  // Implementation plan
  rolloutPlan?: {
    phases: Array<{
      name: string;
      trafficPercentage: number;
      duration: number; // days
      successCriteria: string[];
    }>;
    monitoringPlan: string[];
    rollbackCriteria: string[];
  };
  
  madeAt: Date;
  madeBy: string;
}

export interface ExperimentEvent {
  id: string;
  experimentId: string;
  variantId: string;
  userId: string;
  eventType: 'exposure' | 'conversion' | 'custom';
  eventName: string;
  eventValue?: number;
  properties: Record<string, any>;
  timestamp: Date;
  
  // User context
  userSegment?: string;
  deviceType?: string;
  location?: string;
  sessionId?: string;
}

@injectable()
export class ABTestingFramework extends EventEmitter {
  private config: ABTestingConfig;
  private activeExperiments: Map<string, Experiment> = new Map();
  private experimentEvents: Map<string, ExperimentEvent[]> = new Map();
  private userAssignments: Map<string, Map<string, string>> = new Map(); // userId -> experimentId -> variantId
  private analysisInterval?: NodeJS.Timeout;

  constructor(
    @InjectLogger('ABTestingFramework') private logger: Logger,
    @InjectCache() private cache: ICache
  ) {
    super();

    this.config = {
      enableExperiments: true,
      maxConcurrentExperiments: 20,
      defaultTrafficSplit: 0.1, // 10% default traffic
      minSampleSize: 1000,
      maxExperimentDuration: 30, // 30 days
      significanceLevel: 0.05, // 95% confidence
      minimumDetectableEffect: 0.05, // 5% improvement
      powerThreshold: 0.8, // 80% power
      enableAutoDecisions: true,
      enableSegmentation: true,
    };

    this.initializeFramework();
  }

  /**
   * Initialize A/B testing framework
   */
  private async initializeFramework(): Promise<void> {
    try {
      // Load active experiments
      await this.loadActiveExperiments();

      // Load user assignments
      await this.loadUserAssignments();

      // Start analysis engine
      if (this.config.enableExperiments) {
        this.startAnalysisEngine();
      }

      this.logger.info('A/B testing framework initialized', {
        enableExperiments: this.config.enableExperiments,
        maxConcurrentExperiments: this.config.maxConcurrentExperiments,
        activeExperiments: this.activeExperiments.size,
        enableAutoDecisions: this.config.enableAutoDecisions,
      });

      this.emit('framework-initialized');
    } catch (error) {
      this.logger.error('Failed to initialize A/B testing framework', error);
      throw error;
    }
  }

  /**
   * Load active experiments from cache
   */
  private async loadActiveExperiments(): Promise<void> {
    try {
      const cached = await this.cache.get<Experiment[]>('active-experiments');
      if (cached && Array.isArray(cached)) {
        cached.forEach(exp => this.activeExperiments.set(exp.id, exp));
        this.logger.info('Loaded active experiments', { count: cached.length });
      }
    } catch (error) {
      this.logger.warn('Failed to load active experiments', error);
    }
  }

  /**
   * Load user assignments from cache
   */
  private async loadUserAssignments(): Promise<void> {
    try {
      const cached = await this.cache.get<Map<string, Map<string, string>>>('user-assignments');
      if (cached) {
        this.userAssignments = new Map(cached);
        this.logger.info('Loaded user assignments', { userCount: this.userAssignments.size });
      }
    } catch (error) {
      this.logger.warn('Failed to load user assignments', error);
    }
  }

  /**
   * Start analysis engine
   */
  private startAnalysisEngine(): void {
    this.analysisInterval = setInterval(async () => {
      try {
        await this.runPeriodicAnalysis();
      } catch (error) {
        this.logger.error('Periodic analysis failed', error);
      }
    }, 60000); // Run every minute

    this.logger.info('Started analysis engine');
  }

  /**
   * Run periodic analysis
   */
  private async runPeriodicAnalysis(): Promise<void> {
    for (const experiment of this.activeExperiments.values()) {
      if (experiment.status === 'active') {
        try {
          // Update experiment results
          const results = await this.analyzeExperiment(experiment.id);
          experiment.results = results;
          experiment.updatedAt = new Date();

          // Check for auto-decision criteria
          if (this.config.enableAutoDecisions) {
            const decision = await this.evaluateAutoDecision(experiment);
            if (decision) {
              experiment.decision = decision;
              await this.implementDecision(experiment, decision);
            }
          }

          this.activeExperiments.set(experiment.id, experiment);
        } catch (error) {
          this.logger.error('Failed to analyze experiment', error, { experimentId: experiment.id });
        }
      }
    }
  }

  /**
   * Create a new experiment
   */
  public async createExperiment(experimentConfig: {
    name: string;
    description: string;
    hypothesis: string;
    owner: string;
    variants: Array<{
      name: string;
      description: string;
      isControl: boolean;
      configuration: Record<string, any>;
    }>;
    targetMetrics: Omit<TargetMetric, 'id'>[];
    trafficSplit?: Record<string, number>;
    segments?: Omit<ExperimentSegment, 'id'>[];
    plannedDuration?: number;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    tags?: string[];
  }): Promise<string> {
    const experimentId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Validate concurrent experiment limit
    if (this.activeExperiments.size >= this.config.maxConcurrentExperiments) {
      throw new Error('Maximum concurrent experiments limit reached');
    }

    // Create experiment variants
    const variants: ExperimentVariant[] = experimentConfig.variants.map((v, index) => ({
      id: `var_${experimentId}_${index}`,
      name: v.name,
      description: v.description,
      isControl: v.isControl,
      trafficAllocation: experimentConfig.trafficSplit?.[v.name] || (1 / experimentConfig.variants.length),
      configuration: v.configuration,
      exposures: 0,
      conversions: 0,
      conversionRate: 0,
      revenue: 0,
      sampleSize: 0,
      confidence: 0,
      significance: 0,
    }));

    // Create target metrics
    const targetMetrics: TargetMetric[] = experimentConfig.targetMetrics.map((m, index) => ({
      id: `metric_${experimentId}_${index}`,
      ...m,
    }));

    // Create experiment segments
    const segments: ExperimentSegment[] = experimentConfig.segments?.map((s, index) => ({
      id: `segment_${experimentId}_${index}`,
      ...s,
    })) || [];

    const experiment: Experiment = {
      id: experimentId,
      name: experimentConfig.name,
      description: experimentConfig.description,
      hypothesis: experimentConfig.hypothesis,
      owner: experimentConfig.owner,
      status: 'draft',
      
      trafficSplit: experimentConfig.trafficSplit || {},
      targetMetrics,
      segments,
      excludeRules: [],
      
      plannedDuration: experimentConfig.plannedDuration || 14, // 2 weeks default
      
      variants,
      
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: experimentConfig.tags || [],
      priority: experimentConfig.priority || 'medium',
    };

    this.activeExperiments.set(experimentId, experiment);

    // Cache the experiment
    await this.cacheActiveExperiments();

    this.logger.info('Experiment created', {
      experimentId,
      name: experiment.name,
      variants: variants.length,
      owner: experiment.owner,
    });

    this.emit('experiment-created', { experiment });
    return experimentId;
  }

  /**
   * Start an experiment
   */
  public async startExperiment(experimentId: string): Promise<boolean> {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment) {
      this.logger.warn('Experiment not found', { experimentId });
      return false;
    }

    if (experiment.status !== 'draft') {
      this.logger.warn('Experiment cannot be started', { 
        experimentId, 
        currentStatus: experiment.status 
      });
      return false;
    }

    // Validate experiment configuration
    const validation = await this.validateExperiment(experiment);
    if (!validation.isValid) {
      this.logger.error('Experiment validation failed', {
        experimentId,
        errors: validation.errors,
      });
      return false;
    }

    // Calculate sample size requirements
    const sampleSizeRequirements = await this.calculateSampleSizeRequirements(experiment);
    
    experiment.status = 'active';
    experiment.startDate = new Date();
    experiment.endDate = new Date(Date.now() + experiment.plannedDuration * 24 * 60 * 60 * 1000);
    experiment.updatedAt = new Date();

    this.activeExperiments.set(experimentId, experiment);
    await this.cacheActiveExperiments();

    this.logger.info('Experiment started', {
      experimentId,
      name: experiment.name,
      plannedDuration: experiment.plannedDuration,
      requiredSampleSize: sampleSizeRequirements.totalRequired,
    });

    this.emit('experiment-started', { experiment });
    return true;
  }

  /**
   * Validate experiment configuration
   */
  private async validateExperiment(experiment: Experiment): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check variants
    if (experiment.variants.length < 2) {
      errors.push('Experiment must have at least 2 variants');
    }

    const controlVariants = experiment.variants.filter(v => v.isControl);
    if (controlVariants.length !== 1) {
      errors.push('Experiment must have exactly one control variant');
    }

    // Check traffic allocation
    const totalTraffic = experiment.variants.reduce((sum, v) => sum + v.trafficAllocation, 0);
    if (Math.abs(totalTraffic - 1.0) > 0.01) {
      errors.push('Total traffic allocation must equal 100%');
    }

    // Check metrics
    if (experiment.targetMetrics.length === 0) {
      errors.push('Experiment must have at least one target metric');
    }

    const primaryMetrics = experiment.targetMetrics.filter(m => m.isPrimary);
    if (primaryMetrics.length === 0) {
      warnings.push('No primary metric defined');
    }

    // Check duration
    if (experiment.plannedDuration > this.config.maxExperimentDuration) {
      warnings.push(`Planned duration exceeds recommended maximum of ${this.config.maxExperimentDuration} days`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Calculate sample size requirements
   */
  private async calculateSampleSizeRequirements(experiment: Experiment): Promise<{
    perVariant: number;
    totalRequired: number;
    estimatedDuration: number; // days
    assumptions: {
      baselineConversionRate: number;
      minimumDetectableEffect: number;
      significanceLevel: number;
      power: number;
    };
  }> {
    // Simplified sample size calculation using standard formulas
    const assumptions = {
      baselineConversionRate: 0.05, // 5% default conversion rate
      minimumDetectableEffect: this.config.minimumDetectableEffect,
      significanceLevel: this.config.significanceLevel,
      power: this.config.powerThreshold,
    };

    // Get baseline from primary metric if available
    const primaryMetric = experiment.targetMetrics.find(m => m.isPrimary);
    if (primaryMetric?.currentBaseline) {
      assumptions.baselineConversionRate = primaryMetric.currentBaseline;
    }

    // Calculate required sample size per variant using standard formula
    const z_alpha = this.getZScore(1 - assumptions.significanceLevel / 2); // Two-tailed test
    const z_beta = this.getZScore(assumptions.power);
    
    const p1 = assumptions.baselineConversionRate;
    const p2 = p1 * (1 + assumptions.minimumDetectableEffect);
    const p_pooled = (p1 + p2) / 2;
    
    const numerator = Math.pow(z_alpha + z_beta, 2) * 2 * p_pooled * (1 - p_pooled);
    const denominator = Math.pow(p2 - p1, 2);
    
    const sampleSizePerVariant = Math.ceil(numerator / denominator);
    const totalRequired = sampleSizePerVariant * experiment.variants.length;

    // Estimate duration based on expected traffic
    const expectedDailyTraffic = 1000; // Would be calculated from historical data
    const estimatedDuration = Math.ceil(totalRequired / expectedDailyTraffic);

    return {
      perVariant: sampleSizePerVariant,
      totalRequired,
      estimatedDuration,
      assumptions,
    };
  }

  /**
   * Get Z-score for given probability
   */
  private getZScore(probability: number): number {
    // Simplified Z-score calculation - would use proper statistical library
    const zScores: Record<string, number> = {
      '0.90': 1.28,
      '0.95': 1.645,
      '0.975': 1.96,
      '0.99': 2.33,
      '0.995': 2.58,
    };

    const key = probability.toFixed(3);
    return zScores[key] || 1.96; // Default to 95% confidence
  }

  /**
   * Assign user to experiment variant
   */
  public async assignUserToVariant(
    userId: string,
    experimentId: string,
    userProperties?: Record<string, any>
  ): Promise<string | null> {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment || experiment.status !== 'active') {
      return null;
    }

    // Check if user is already assigned
    const userExperiments = this.userAssignments.get(userId);
    if (userExperiments?.has(experimentId)) {
      return userExperiments.get(experimentId)!;
    }

    // Check exclusion rules
    if (await this.isUserExcluded(userId, experiment, userProperties)) {
      return null;
    }

    // Check segment eligibility
    if (experiment.segments.length > 0) {
      const isEligible = await this.isUserInSegment(userId, experiment.segments, userProperties);
      if (!isEligible) {
        return null;
      }
    }

    // Assign to variant using consistent hashing
    const variantId = await this.hashUserToVariant(userId, experiment);
    
    // Store assignment
    if (!this.userAssignments.has(userId)) {
      this.userAssignments.set(userId, new Map());
    }
    this.userAssignments.get(userId)!.set(experimentId, variantId);

    // Update variant exposure count
    const variant = experiment.variants.find(v => v.id === variantId);
    if (variant) {
      variant.exposures++;
      variant.sampleSize++;
    }

    // Cache assignments
    await this.cacheUserAssignments();

    this.logger.debug('User assigned to variant', {
      userId,
      experimentId,
      variantId,
    });

    this.emit('user-assigned', { userId, experimentId, variantId });
    return variantId;
  }

  /**
   * Check if user is excluded from experiment
   */
  private async isUserExcluded(
    userId: string,
    experiment: Experiment,
    userProperties?: Record<string, any>
  ): Promise<boolean> {
    for (const rule of experiment.excludeRules) {
      if (!rule.enabled) {continue;}

      // Simple rule evaluation - would be more sophisticated in production
      if (rule.condition.includes('userId') && rule.condition.includes(userId)) {
        return true;
      }

      if (userProperties) {
        // Evaluate user property conditions
        // This is simplified - would use a proper rule engine
        for (const [key, value] of Object.entries(userProperties)) {
          if (rule.condition.includes(key) && rule.condition.includes(String(value))) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Check if user is in experiment segments
   */
  private async isUserInSegment(
    userId: string,
    segments: ExperimentSegment[],
    userProperties?: Record<string, any>
  ): Promise<boolean> {
    for (const segment of segments) {
      let matches = true;

      // Check user properties
      if (segment.criteria.userProperties && userProperties) {
        for (const [key, value] of Object.entries(segment.criteria.userProperties)) {
          if (userProperties[key] !== value) {
            matches = false;
            break;
          }
        }
      }

      // Add more sophisticated segment matching logic here
      // For now, simple property matching

      if (matches) {return true;}
    }

    return segments.length === 0; // If no segments, user is eligible
  }

  /**
   * Hash user to variant using consistent hashing
   */
  private async hashUserToVariant(userId: string, experiment: Experiment): Promise<string> {
    // Simple consistent hashing - would use proper hashing algorithm
    const hash = this.simpleHash(`${userId}_${experiment.id}`);
    const normalized = hash / 2147483647; // Normalize to 0-1

    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.trafficAllocation;
      if (normalized <= cumulative) {
        return variant.id;
      }
    }

    // Fallback to control variant
    return experiment.variants.find(v => v.isControl)?.id || experiment.variants[0].id;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Track experiment event
   */
  public async trackEvent(
    userId: string,
    experimentId: string,
    eventType: 'exposure' | 'conversion' | 'custom',
    eventName: string,
    eventValue?: number,
    properties?: Record<string, any>
  ): Promise<boolean> {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment || experiment.status !== 'active') {
      return false;
    }

    // Get user's variant assignment
    const variantId = this.userAssignments.get(userId)?.get(experimentId);
    if (!variantId) {
      return false;
    }

    const event: ExperimentEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      experimentId,
      variantId,
      userId,
      eventType,
      eventName,
      eventValue,
      properties: properties || {},
      timestamp: new Date(),
    };

    // Store event
    if (!this.experimentEvents.has(experimentId)) {
      this.experimentEvents.set(experimentId, []);
    }
    this.experimentEvents.get(experimentId)!.push(event);

    // Update variant metrics
    const variant = experiment.variants.find(v => v.id === variantId);
    if (variant) {
      if (eventType === 'conversion') {
        variant.conversions++;
        variant.conversionRate = variant.conversions / Math.max(variant.exposures, 1);
        if (eventValue) {
          variant.revenue += eventValue;
        }
      }
    }

    this.logger.debug('Event tracked', {
      userId,
      experimentId,
      variantId,
      eventType,
      eventName,
      eventValue,
    });

    this.emit('event-tracked', { event });
    return true;
  }

  /**
   * Analyze experiment results
   */
  public async analyzeExperiment(experimentId: string): Promise<ExperimentResults> {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    const events = this.experimentEvents.get(experimentId) || [];
    
    // Calculate variant results
    const variantResults: VariantResults[] = experiment.variants.map(variant => {
      const variantEvents = events.filter(e => e.variantId === variant.id);
      const conversions = variantEvents.filter(e => e.eventType === 'conversion').length;
      const exposures = Math.max(variant.exposures, 1);
      
      const conversionRate = conversions / exposures;
      const revenue = variantEvents
        .filter(e => e.eventType === 'conversion' && e.eventValue)
        .reduce((sum, e) => sum + (e.eventValue || 0), 0);

      // Calculate statistical measures
      const mean = conversionRate;
      const variance = mean * (1 - mean) / exposures; // Binomial variance
      const standardError = Math.sqrt(variance);
      const standardDeviation = Math.sqrt(mean * (1 - mean));

      // 95% confidence interval
      const z = 1.96; // 95% confidence
      const marginOfError = z * standardError;
      const confidenceInterval = {
        lower: Math.max(0, mean - marginOfError),
        upper: Math.min(1, mean + marginOfError),
      };

      return {
        variantId: variant.id,
        variantName: variant.name,
        sampleSize: exposures,
        exposures,
        conversions,
        conversionRate,
        revenue,
        mean,
        standardDeviation,
        standardError,
        confidenceInterval,
        sampleRatio: exposures / Math.max(experiment.variants.reduce((sum, v) => sum + v.exposures, 1), 1),
        exposureQuality: 1.0, // Simplified
        dataQuality: 1.0, // Simplified
      };
    });

    // Find control variant
    const controlVariant = experiment.variants.find(v => v.isControl);
    const controlResults = variantResults.find(r => r.variantId === controlVariant?.id);

    // Calculate comparisons to control
    if (controlResults) {
      variantResults.forEach(result => {
        if (result.variantId !== controlResults.variantId) {
          result.absoluteImprovement = result.conversionRate - controlResults.conversionRate;
          result.relativeImprovement = controlResults.conversionRate > 0 
            ? (result.conversionRate - controlResults.conversionRate) / controlResults.conversionRate
            : 0;

          // Simplified statistical test (t-test)
          const pooledSE = Math.sqrt(
            (result.standardError ** 2) + (controlResults.standardError ** 2)
          );
          result.zScore = pooledSE > 0 ? (result.conversionRate - controlResults.conversionRate) / pooledSE : 0;
          result.pValue = this.calculatePValue(Math.abs(result.zScore));
        }
      });
    }

    // Run statistical tests
    const statisticalTests: StatisticalTest[] = [];
    
    if (controlResults) {
      const treatmentResults = variantResults.filter(r => r.variantId !== controlResults.variantId);
      
      for (const treatment of treatmentResults) {
        const test = await this.performTTest(controlResults, treatment);
        statisticalTests.push(test);
      }
    }

    // Calculate overall metrics
    const overallConfidence = Math.min(...variantResults.map(r => 
      Math.min(r.confidenceInterval.upper - r.confidenceInterval.lower, 1)
    ));
    
    const overallPower = this.calculatePower(experiment, variantResults);
    const overallSignificance = Math.min(...statisticalTests.map(t => t.pValue));

    // Generate recommendations
    const recommendations = this.generateRecommendations(experiment, variantResults, statisticalTests);

    // Risk assessment
    const riskAssessment = this.assessRisk(experiment, variantResults);

    // Business impact
    const estimatedImpact = this.calculateBusinessImpact(experiment, variantResults);

    const results: ExperimentResults = {
      id: `results_${experimentId}_${Date.now()}`,
      experimentId,
      generatedAt: new Date(),
      
      overallResults: variantResults,
      segmentResults: {}, // Simplified - would segment by user properties
      metricResults: {}, // Simplified - would analyze each target metric
      
      statisticalTests,
      
      overallConfidence,
      overallPower,
      overallSignificance,
      
      recommendations,
      riskAssessment,
      estimatedImpact,
    };

    this.logger.info('Experiment analysis completed', {
      experimentId,
      variants: variantResults.length,
      overallSignificance,
      overallPower,
    });

    this.emit('experiment-analyzed', { experiment, results });
    return results;
  }

  /**
   * Calculate p-value from z-score
   */
  private calculatePValue(zScore: number): number {
    // Simplified p-value calculation - would use proper statistical library
    if (zScore > 2.58) {return 0.01;}
    if (zScore > 1.96) {return 0.05;}
    if (zScore > 1.645) {return 0.1;}
    if (zScore > 1.28) {return 0.2;}
    return 0.5;
  }

  /**
   * Perform t-test between variants
   */
  private async performTTest(control: VariantResults, treatment: VariantResults): Promise<StatisticalTest> {
    const pooledSE = Math.sqrt((control.standardError ** 2) + (treatment.standardError ** 2));
    const tStatistic = pooledSE > 0 ? (treatment.conversionRate - control.conversionRate) / pooledSE : 0;
    const pValue = this.calculatePValue(Math.abs(tStatistic));
    
    const test: StatisticalTest = {
      testType: 'ttest',
      hypothesis: `${treatment.variantName} performs differently than ${control.variantName}`,
      nullHypothesis: 'No difference between variants',
      alternativeHypothesis: 'Variants have different conversion rates',
      
      testStatistic: tStatistic,
      pValue,
      criticalValue: 1.96, // 95% confidence
      degreesOfFreedom: control.sampleSize + treatment.sampleSize - 2,
      
      rejectNull: pValue < 0.05,
      conclusion: pValue < 0.05 
        ? `${treatment.variantName} is significantly different from ${control.variantName}`
        : 'No significant difference detected',
      
      assumptionsMet: true, // Simplified
      assumptionChecks: {
        normalityTest: true,
        homogeneityTest: true,
        independenceTest: true,
      },
    };

    return test;
  }

  /**
   * Calculate statistical power
   */
  private calculatePower(experiment: Experiment, results: VariantResults[]): number {
    // Simplified power calculation
    const totalSampleSize = results.reduce((sum, r) => sum + r.sampleSize, 0);
    const requiredSampleSize = this.config.minSampleSize * experiment.variants.length;
    
    return Math.min(totalSampleSize / requiredSampleSize, 1.0);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    experiment: Experiment,
    results: VariantResults[],
    tests: StatisticalTest[]
  ): string[] {
    const recommendations: string[] = [];

    // Check sample size
    const totalSamples = results.reduce((sum, r) => sum + r.sampleSize, 0);
    if (totalSamples < this.config.minSampleSize * experiment.variants.length) {
      recommendations.push('Increase sample size to achieve statistical significance');
    }

    // Check statistical significance
    const significantTests = tests.filter(t => t.rejectNull);
    if (significantTests.length === 0) {
      recommendations.push('No statistically significant results detected - consider extending experiment');
    } else {
      recommendations.push(`${significantTests.length} variant(s) show statistical significance`);
    }

    // Check practical significance
    const practicallySignificant = results.filter(r => 
      Math.abs(r.relativeImprovement || 0) >= this.config.minimumDetectableEffect
    );
    
    if (practicallySignificant.length === 0) {
      recommendations.push('No practically significant improvements detected');
    }

    // Business recommendations
    const winner = results
      .filter(r => !experiment.variants.find(v => v.id === r.variantId)?.isControl)
      .sort((a, b) => (b.conversionRate || 0) - (a.conversionRate || 0))[0];
    
    if (winner && (winner.relativeImprovement || 0) > 0) {
      recommendations.push(`Consider implementing ${winner.variantName} as the winning variant`);
    }

    return recommendations;
  }

  /**
   * Assess experiment risk
   */
  private assessRisk(experiment: Experiment, results: VariantResults[]): RiskAssessment {
    const totalSamples = results.reduce((sum, r) => sum + r.sampleSize, 0);
    const requiredSamples = this.config.minSampleSize * experiment.variants.length;
    
    // Sample size risk
    const sampleSizeRisk = totalSamples < requiredSamples * 0.5 ? 'high' : 
                          totalSamples < requiredSamples ? 'medium' : 'low';

    // Bias risk (simplified)
    const biasRisk = results.some(r => Math.abs(r.sampleRatio - (1/experiment.variants.length)) > 0.1) ? 'medium' : 'low';

    // External validity risk
    const experimentDuration = experiment.startDate ? 
      (Date.now() - experiment.startDate.getTime()) / (24 * 60 * 60 * 1000) : 0;
    const externalValidityRisk = experimentDuration < 7 ? 'high' : 
                                experimentDuration < 14 ? 'medium' : 'low';

    // Implementation risk
    const implementationRisk = experiment.variants.length > 3 ? 'medium' : 'low';

    const riskFactors = { sampleSizeRisk, biasRisk, externalValidityRisk, implementationRisk };
    const riskLevels = Object.values(riskFactors);
    const overallRisk = riskLevels.includes('high') ? 'high' : 
                       riskLevels.includes('medium') ? 'medium' : 'low';

    return {
      overallRisk,
      riskFactors,
      mitigation: [
        'Ensure adequate sample size before making decisions',
        'Monitor for external factors that could influence results',
        'Validate results with additional testing if needed',
      ],
      confidence: overallRisk === 'low' ? 0.9 : overallRisk === 'medium' ? 0.7 : 0.5,
    };
  }

  /**
   * Calculate business impact
   */
  private calculateBusinessImpact(experiment: Experiment, results: VariantResults[]): BusinessImpact {
    const control = results.find(r => experiment.variants.find(v => v.id === r.variantId)?.isControl);
    const winner = results
      .filter(r => !experiment.variants.find(v => v.id === r.variantId)?.isControl)
      .sort((a, b) => (b.conversionRate || 0) - (a.conversionRate || 0))[0];

    if (!control || !winner) {
      return {
        estimatedLift: 0,
        estimatedRevenue: 0,
        estimatedCost: 0,
        roi: 0,
        annualizedImpact: 0,
        confidenceInterval: { lower: 0, upper: 0 },
        expectedValue: 0,
        valueAtRisk: 0,
        probabilityOfSuccess: 0.5,
      };
    }

    const lift = winner.relativeImprovement || 0;
    const annualTraffic = 100000; // Would be calculated from actual traffic data
    const avgOrderValue = 50; // Would be calculated from actual data
    
    const estimatedRevenue = annualTraffic * control.conversionRate * lift * avgOrderValue;
    const estimatedCost = 10000; // Implementation and maintenance costs
    const roi = estimatedCost > 0 ? (estimatedRevenue - estimatedCost) / estimatedCost : 0;

    return {
      estimatedLift: lift,
      estimatedRevenue,
      estimatedCost,
      roi,
      annualizedImpact: estimatedRevenue,
      confidenceInterval: {
        lower: estimatedRevenue * 0.8, // Conservative estimate
        upper: estimatedRevenue * 1.2, // Optimistic estimate
      },
      expectedValue: estimatedRevenue * 0.7, // Risk-adjusted
      valueAtRisk: estimatedRevenue * 0.3,
      probabilityOfSuccess: winner.pValue ? Math.max(0.5, 1 - winner.pValue) : 0.5,
    };
  }

  /**
   * Evaluate auto-decision criteria
   */
  private async evaluateAutoDecision(experiment: Experiment): Promise<ExperimentDecision | null> {
    if (!experiment.results || !this.config.enableAutoDecisions) {
      return null;
    }

    const results = experiment.results;
    const significantTests = results.statisticalTests.filter(t => t.rejectNull);

    // Check termination criteria
    const shouldTerminate = 
      // No significant results after sufficient time
      (experiment.startDate && 
       Date.now() - experiment.startDate.getTime() > 21 * 24 * 60 * 60 * 1000 && // 3 weeks
       significantTests.length === 0) ||
      // High risk assessment
      results.riskAssessment.overallRisk === 'high';

    if (shouldTerminate) {
      return {
        decision: 'terminate',
        confidence: 0.8,
        reasoning: ['No significant results after sufficient testing period', 'Risk assessment indicates high risk'],
        statisticalSignificance: false,
        practicalSignificance: false,
        sampleSizeAdequate: results.overallPower >= this.config.powerThreshold,
        riskAcceptable: false,
        madeAt: new Date(),
        madeBy: 'auto-decision-engine',
      };
    }

    // Check for clear winner
    const winner = results.overallResults
      .filter(r => !experiment.variants.find(v => v.id === r.variantId)?.isControl)
      .find(r => 
        (r.pValue || 1) < this.config.significanceLevel &&
        Math.abs(r.relativeImprovement || 0) >= this.config.minimumDetectableEffect
      );

    if (winner && 
        results.overallPower >= this.config.powerThreshold &&
        results.riskAssessment.overallRisk !== 'high') {
      
      return {
        decision: 'launch_winner',
        winningVariant: winner.variantId,
        confidence: 0.9,
        reasoning: [
          'Statistical significance achieved',
          'Practical significance detected',
          'Adequate sample size reached',
          'Risk assessment acceptable',
        ],
        statisticalSignificance: true,
        practicalSignificance: true,
        sampleSizeAdequate: true,
        riskAcceptable: true,
        rolloutPlan: {
          phases: [
            {
              name: 'Initial rollout',
              trafficPercentage: 25,
              duration: 7,
              successCriteria: ['No increase in error rates', 'Conversion rate maintained'],
            },
            {
              name: 'Full rollout',
              trafficPercentage: 100,
              duration: 14,
              successCriteria: ['Business metrics improved', 'User satisfaction maintained'],
            },
          ],
          monitoringPlan: [
            'Monitor conversion rates daily',
            'Track error rates and performance metrics',
            'Collect user feedback',
          ],
          rollbackCriteria: [
            'Conversion rate drops below baseline',
            'Error rate increases significantly',
            'Negative user feedback spike',
          ],
        },
        madeAt: new Date(),
        madeBy: 'auto-decision-engine',
      };
    }

    return null;
  }

  /**
   * Implement experiment decision
   */
  private async implementDecision(experiment: Experiment, decision: ExperimentDecision): Promise<void> {
    switch (decision.decision) {
      case 'launch_winner':
        experiment.status = 'completed';
        this.logger.info('Auto-decision: Launching winner', {
          experimentId: experiment.id,
          winningVariant: decision.winningVariant,
        });
        break;

      case 'terminate':
        experiment.status = 'terminated';
        this.logger.info('Auto-decision: Terminating experiment', {
          experimentId: experiment.id,
          reasoning: decision.reasoning,
        });
        break;

      case 'continue_testing':
        this.logger.info('Auto-decision: Continue testing', {
          experimentId: experiment.id,
        });
        break;
    }

    experiment.updatedAt = new Date();
    this.activeExperiments.set(experiment.id, experiment);
    await this.cacheActiveExperiments();

    this.emit('auto-decision-made', { experiment, decision });
  }

  /**
   * Get experiment status
   */
  public getExperiment(experimentId: string): Experiment | null {
    return this.activeExperiments.get(experimentId) || null;
  }

  /**
   * Get all active experiments
   */
  public getActiveExperiments(): Experiment[] {
    return Array.from(this.activeExperiments.values())
      .filter(exp => exp.status === 'active');
  }

  /**
   * Get experiment statistics
   */
  public async getStatistics(): Promise<{
    totalExperiments: number;
    activeExperiments: number;
    completedExperiments: number;
    totalUsers: number;
    totalEvents: number;
    avgExperimentDuration: number;
    successRate: number;
  }> {
    const allExperiments = Array.from(this.activeExperiments.values());
    const activeExperiments = allExperiments.filter(exp => exp.status === 'active');
    const completedExperiments = allExperiments.filter(exp => exp.status === 'completed');
    
    const totalUsers = this.userAssignments.size;
    const totalEvents = Array.from(this.experimentEvents.values())
      .reduce((sum, events) => sum + events.length, 0);

    const experimentsWithDuration = allExperiments.filter(exp => exp.actualDuration);
    const avgDuration = experimentsWithDuration.length > 0 
      ? experimentsWithDuration.reduce((sum, exp) => sum + (exp.actualDuration || 0), 0) / experimentsWithDuration.length
      : 0;

    const successfulExperiments = completedExperiments.filter(exp => 
      exp.decision?.decision === 'launch_winner'
    );
    const successRate = completedExperiments.length > 0 
      ? successfulExperiments.length / completedExperiments.length 
      : 0;

    return {
      totalExperiments: allExperiments.length,
      activeExperiments: activeExperiments.length,
      completedExperiments: completedExperiments.length,
      totalUsers,
      totalEvents,
      avgExperimentDuration: avgDuration,
      successRate,
    };
  }

  /**
   * Cache active experiments
   */
  private async cacheActiveExperiments(): Promise<void> {
    try {
      await this.cache.set(
        'active-experiments', 
        Array.from(this.activeExperiments.values()), 
        24 * 60 * 60 // 24 hours
      );
    } catch (error) {
      this.logger.warn('Failed to cache active experiments', error);
    }
  }

  /**
   * Cache user assignments
   */
  private async cacheUserAssignments(): Promise<void> {
    try {
      await this.cache.set(
        'user-assignments', 
        Array.from(this.userAssignments.entries()), 
        24 * 60 * 60 // 24 hours
      );
    } catch (error) {
      this.logger.warn('Failed to cache user assignments', error);
    }
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = undefined;
    }

    // Persist data
    await this.cacheActiveExperiments();
    await this.cacheUserAssignments();

    this.activeExperiments.clear();
    this.experimentEvents.clear();
    this.userAssignments.clear();
    this.removeAllListeners();

    this.logger.info('A/B testing framework cleaned up');
  }
}
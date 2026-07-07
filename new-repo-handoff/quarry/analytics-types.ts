// Aialytics - Advanced Analytics Platform Types
// Combining features from Hotjar, Mixpanel, and Google Analytics with revolutionary data efficiency

export interface AialyticsConfig {
  // Core Configuration
  projectId: string;
  apiKey: string;
  environment: 'development' | 'staging' | 'production';

  // Data Storage Strategy
  dataRetentionDays: number;
  compressionLevel: 'low' | 'medium' | 'high' | 'adaptive';
  predictiveStorageEnabled: boolean;
  eventDrivenStorage: boolean;

  // Feature Toggles
  enableHeatmaps: boolean;
  enableSessionRecording: boolean;
  enableFunnelAnalysis: boolean;
  enableCohortTracking: boolean;
  enableABTesting: boolean;
  enableRealTimeAnalytics: boolean;
  enablePredictiveInsights: boolean;

  // Performance & Efficiency
  batchSize: number;
  flushInterval: number;
  samplingRate: number;
  enableSmartSampling: boolean;

  // Privacy & Compliance
  enableGDPRMode: boolean;
  enableDataAnonymization: boolean;
  cookieConsentRequired: boolean;
  dataProcessingRegion: 'US' | 'EU' | 'APAC';
}

// Event System - Core data structure
export interface AnalyticsEvent {
  // Event Identity
  id: string;
  type: EventType;
  category: EventCategory;
  action: string;
  label?: string;

  // Timing
  timestamp: number;
  sessionId: string;
  userId?: string;
  anonymousId: string;

  // Context
  properties: Record<string, unknown>;
  userProperties: Record<string, unknown>;
  deviceProperties: DeviceContext;
  locationProperties: LocationContext;

  // Technical Details
  url: string;
  referrer?: string;
  userAgent: string;
  ip: string; // Will be anonymized based on privacy settings

  // Data Efficiency
  compressed: boolean;
  predicted: boolean;
  samplingWeight: number;

  // Metadata
  sdkVersion: string;
  apiVersion: string;
}

export type EventType =
  // Page/Screen Events
  | 'page_view'
  | 'screen_view'
  | 'page_leave'
  // User Interaction Events
  | 'click'
  | 'scroll'
  | 'hover'
  | 'focus'
  | 'blur'
  | 'input'
  // Form Events
  | 'form_start'
  | 'form_submit'
  | 'form_abandon'
  | 'field_focus'
  | 'field_blur'
  // E-commerce Events
  | 'purchase'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'checkout_start'
  | 'checkout_complete'
  // Engagement Events
  | 'session_start'
  | 'session_end'
  | 'engagement'
  | 'scroll_depth'
  // Custom Events
  | 'custom'
  | 'conversion'
  | 'milestone'
  // A/B Testing Events
  | 'experiment_view'
  | 'experiment_conversion'
  // Error Events
  | 'error'
  | 'performance_issue';

export type EventCategory =
  | 'navigation'
  | 'interaction'
  | 'engagement'
  | 'conversion'
  | 'ecommerce'
  | 'content'
  | 'social'
  | 'video'
  | 'download'
  | 'search'
  | 'form'
  | 'error'
  | 'performance'
  | 'experiment';

export interface DeviceContext {
  type: 'desktop' | 'mobile' | 'tablet' | 'smart_tv' | 'wearable';
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  screenResolution: string;
  screenDensity: number;
  viewport: { width: number; height: number };
  language: string;
  timezone: string;
  connection: 'slow-2g' | '2g' | '3g' | '4g' | '5g' | 'wifi' | 'ethernet';
}

export interface LocationContext {
  country: string;
  region: string;
  city: string;
  latitude?: number; // Only if geo-tracking enabled
  longitude?: number; // Only if geo-tracking enabled
  accuracy?: number;
}

// Session Management
export interface AnalyticsSession {
  id: string;
  userId?: string;
  anonymousId: string;
  startTime: number;
  endTime?: number;
  duration?: number;

  // Session Metadata
  isActive: boolean;
  pageViews: number;
  eventCount: number;

  // User Journey
  entryPage: string;
  exitPage?: string;
  referrer?: string;
  campaign?: CampaignData;

  // Device & Location (captured once per session)
  device: DeviceContext;
  location: LocationContext;

  // Engagement Metrics
  engagementScore: number;
  scrollDepth: number;
  timeOnPage: Record<string, number>;

  // Conversion Tracking
  conversions: any[];
  revenue?: number;

  // Quality Metrics
  bounced: boolean;
  quality: 'high' | 'medium' | 'low' | 'bot';
}

export interface CampaignData {
  source: string;
  medium: string;
  campaign: string;
  term?: string;
  content?: string;
  gclid?: string; // Google Ads
  fbclid?: string; // Facebook Ads
  utmParameters: Record<string, string>;
}

// User Management
export interface AnalyticsUser {
  id: string;
  anonymousId: string;
  createdAt: number;
  lastSeenAt: number;

  // Profile
  email?: string;
  name?: string;
  avatar?: string;

  // Computed Properties
  totalSessions: number;
  totalPageViews: number;
  totalEvents: number;
  lifetimeValue: number;

  // Behavioral Segmentation
  segment: UserSegment;
  cohort?: string;
  tags: string[];

  // Custom Properties
  properties: Record<string, unknown>;

  // Privacy
  optedOut: boolean;
  consentGiven: boolean;
  dataRetentionDate?: number;
}

export type UserSegment =
  | 'new_user'
  | 'returning_user'
  | 'power_user'
  | 'at_risk'
  | 'dormant'
  | 'high_value'
  | 'low_value'
  | 'potential_churner';

// Heatmap System (Hotjar-like)
export interface HeatmapData {
  id: string;
  url: string;
  type: HeatmapType;
  createdAt: number;
  dataPoints: HeatmapPoint[];

  // Metadata
  totalViews: number;
  uniqueUsers: number;
  dateRange: { start: number; end: number };
  deviceFilter?: 'desktop' | 'mobile' | 'tablet';

  // Configuration
  resolution: { width: number; height: number };
  samplingRate: number;
}

export type HeatmapType = 'click' | 'move' | 'scroll' | 'attention';

export interface HeatmapPoint {
  x: number;
  y: number;
  intensity: number;
  count: number;
  element?: string; // CSS selector
  text?: string; // Element text content
}

// Session Recording (Hotjar-like)
export interface SessionRecording {
  id: string;
  sessionId: string;
  userId?: string;
  url: string;

  // Recording Metadata
  startTime: number;
  endTime: number;
  duration: number;

  // Recording Data (compressed)
  events: RecordingEvent[];
  snapshots: DOMSnapshot[];

  // Analysis
  clickCount: number;
  inputCount: number;
  scrollEvents: number;
  rageClicks: number;

  // Storage Efficiency
  compressionRatio: number;
  originalSize: number;
  compressedSize: number;
}

export interface RecordingEvent {
  type: 'dom' | 'input' | 'click' | 'scroll' | 'resize' | 'focus' | 'blur';
  timestamp: number;
  data: Record<string, unknown>;
}

export interface DOMSnapshot {
  timestamp: number;
  html: string; // Compressed HTML snapshot
  css: string[]; // CSS rules
  mutations: DOMMutation[];
}

export interface DOMMutation {
  type: 'add' | 'remove' | 'attributes' | 'text';
  target: string; // CSS selector
  data: unknown;
}

// Funnel Analysis (Mixpanel-like)
export interface FunnelDefinition {
  id: string;
  name: string;
  description: string;
  steps: FunnelStep[];

  // Configuration
  timeWindow: number; // Hours
  conversionWindow: number; // Hours

  // Filters
  userFilters: FunnelFilter[];
  eventFilters: FunnelFilter[];

  createdAt: number;
  updatedAt: number;
}

export interface FunnelStep {
  id: string;
  name: string;
  eventType: EventType;
  conditions: FunnelCondition[];
  order: number;
}

export interface FunnelCondition {
  property: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than';
  value: unknown;
}

export interface FunnelFilter {
  property: string;
  operator: string;
  value: unknown;
}

export interface FunnelAnalysis {
  funnelId: string;
  dateRange: { start: number; end: number };
  results: FunnelStepResult[];

  // Summary Metrics
  totalUsers: number;
  completionRate: number;
  dropoffRate: number;
  averageTimeToComplete: number;

  // Breakdown
  breakdown?: FunnelBreakdown[];
}

export interface FunnelStepResult {
  stepId: string;
  stepName: string;
  userCount: number;
  conversionRate: number;
  dropoffRate: number;
  averageTimeFromPrevious: number;

  // Detailed Analysis
  topDropoffReasons: string[];
  userSegmentBreakdown: Record<UserSegment, number>;
}

export interface FunnelBreakdown {
  property: string;
  values: Array<{
    value: string;
    userCount: number;
    conversionRate: number;
  }>;
}

// Cohort Analysis (Mixpanel-like)
export interface CohortDefinition {
  id: string;
  name: string;
  description: string;

  // Cohort Criteria
  criteriaType: 'first_event' | 'custom_event' | 'property_value';
  criteria: CohortCriteria;

  // Analysis Settings
  metricType: 'retention' | 'revenue' | 'engagement' | 'conversion';
  timeUnit: 'day' | 'week' | 'month';
  periods: number;

  createdAt: number;
}

export interface CohortCriteria {
  eventType?: EventType;
  propertyName?: string;
  propertyValue?: unknown;
  timeRange: { start: number; end: number };
}

export interface CohortAnalysis {
  cohortId: string;
  cohorts: CohortData[];

  // Summary
  totalUsers: number;
  averageRetention: number;
  retentionTrend: 'improving' | 'declining' | 'stable';
}

export interface CohortData {
  name: string; // e.g., "Week of Jan 1, 2024"
  size: number;
  retentionRates: number[]; // Array of retention rates for each period
  revenue?: number[];
  engagementScores?: number[];
}

// A/B Testing Framework
export interface Experiment {
  id: string;
  name: string;
  description: string;
  hypothesis: string;

  // Configuration
  status: ExperimentStatus;
  type: ExperimentType;
  variants: ExperimentVariant[];

  // Targeting
  targetingRules: TargetingRule[];
  trafficAllocation: number; // Percentage of users to include

  // Metrics
  primaryMetric: ExperimentMetric;
  secondaryMetrics: ExperimentMetric[];

  // Statistical Settings
  significanceLevel: number; // Default 0.05
  minimumDetectableEffect: number;
  power: number; // Default 0.8

  // Timeline
  startDate?: number;
  endDate?: number;
  duration?: number; // Days

  // Results
  results?: ExperimentResults;

  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export type ExperimentStatus = 'draft' | 'ready' | 'running' | 'paused' | 'completed' | 'archived';

export type ExperimentType = 'ab_test' | 'multivariate' | 'split_url' | 'feature_flag';

export interface ExperimentVariant {
  id: string;
  name: string;
  description: string;
  allocation: number; // Percentage allocation
  changes: VariantChange[];

  // Results
  users?: number;
  conversions?: number;
  conversionRate?: number;
}

export interface VariantChange {
  type: 'element' | 'css' | 'javascript' | 'redirect' | 'feature_flag';
  selector?: string;
  property?: string;
  value: unknown;
}

export interface TargetingRule {
  property: string;
  operator: string;
  value: unknown;
  type: 'user' | 'session' | 'event' | 'device' | 'location';
}

export interface ExperimentMetric {
  id: string;
  name: string;
  type: MetricType;
  eventType?: EventType;
  aggregation: 'count' | 'sum' | 'average' | 'unique' | 'rate';

  // Filters
  filters: ExperimentMetric[];

  // Configuration
  winDirection: 'increase' | 'decrease';
  format: 'number' | 'percentage' | 'currency' | 'time';
}

export type MetricType =
  | 'conversion_rate'
  | 'revenue'
  | 'engagement'
  | 'retention'
  | 'custom_event'
  | 'page_views'
  | 'session_duration';

export interface ExperimentResults {
  status: 'running' | 'completed' | 'inconclusive';

  // Statistical Results
  pValue: number;
  confidenceInterval: [number, number];
  statisticalSignificance: boolean;
  practicalSignificance: boolean;

  // Variant Performance
  variants: VariantResults[];
  winner?: string; // Variant ID

  // Recommendations
  recommendation: 'implement_winner' | 'continue_testing' | 'stop_test' | 'redesign';
  insights: string[];

  // Meta Analysis
  sampleSize: number;
  conversionRate: number;
  effect: number;
  effectSize: 'small' | 'medium' | 'large';

  calculatedAt: number;
}

export interface VariantResults {
  variantId: string;
  name: string;

  // Core Metrics
  users: number;
  conversions: number;
  conversionRate: number;
  improvement: number; // Percentage vs control

  // Statistical Analysis
  pValue?: number;
  confidenceInterval?: [number, number];
  significance?: boolean;

  // Secondary Metrics
  secondaryMetrics: Record<string, number>;
}

// Real-time Analytics
export interface RealTimeMetrics {
  timestamp: number;

  // Current Activity
  activeUsers: number;
  activeSessionsPastMinute: number;
  pageViewsPastMinute: number;
  eventsPastMinute: number;

  // Top Content
  topPages: Array<{ url: string; views: number }>;
  topEvents: Array<{ event: string; count: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;

  // Geographic Distribution
  topCountries: Array<{ country: string; users: number }>;
  topCities: Array<{ city: string; users: number }>;

  // Technology
  topBrowsers: Array<{ browser: string; users: number }>;
  topDevices: Array<{ device: string; users: number }>;

  // Conversions & Revenue
  conversionsPastHour: number;
  revenuePastHour: number;

  // Experiments
  activeExperiments: Array<{ name: string; users: number }>;
}

// Predictive Analytics & Data Efficiency
export interface DataPrediction {
  id: string;
  type: PredictionType;
  confidence: number;

  // Prediction Data
  predictedValue: number;
  actualValue?: number;
  variance: number;

  // Context
  timeframe: number;
  basedOnData: string[];
  algorithm: PredictionAlgorithm;

  // Efficiency Metrics
  storageReduction: number; // Percentage
  accuracyScore: number;

  createdAt: number;
  validUntil: number;
}

export type PredictionType =
  | 'user_behavior'
  | 'conversion_rate'
  | 'session_duration'
  | 'bounce_rate'
  | 'revenue'
  | 'churn_risk'
  | 'engagement';

export type PredictionAlgorithm =
  | 'linear_regression'
  | 'time_series'
  | 'neural_network'
  | 'ensemble'
  | 'bayesian'
  | 'pattern_matching';

export interface DataCompressionStrategy {
  level: 'low' | 'medium' | 'high' | 'adaptive';
  algorithm: 'gzip' | 'lz4' | 'zstd' | 'brotli' | 'custom';

  // Sampling Strategy
  samplingRate: number;
  smartSampling: boolean;
  preserveImportantEvents: boolean;

  // Aggregation Strategy
  aggregationRules: AggregationRule[];
  retentionPolicy: RetentionPolicy;

  // Prediction Integration
  usePredictiveStorage: boolean;
  predictionAccuracyThreshold: number;
}

export interface AggregationRule {
  eventType: EventType;
  timeWindow: number; // Minutes
  aggregationType: 'count' | 'sum' | 'average' | 'max' | 'min';
  properties: string[];
}

export interface RetentionPolicy {
  rawDataDays: number;
  aggregatedDataDays: number;
  archivedDataDays: number;

  // Special Cases
  highValueEventsDays: number;
  conversionEventsDays: number;
  errorEventsDays: number;
}

// API & Integration Types
export interface AialyticsAPI {
  // Event Tracking
  track(event: Partial<AnalyticsEvent>): Promise<void>;
  page(properties?: Record<string, unknown>): Promise<void>;
  identify(userId: string, properties?: Record<string, unknown>): Promise<void>;

  // Heatmaps & Recordings
  enableHeatmaps(url?: string): void;
  enableRecording(options?: RecordingOptions): void;

  // A/B Testing
  getVariant(experimentId: string): Promise<string>;
  track_conversion(experimentId: string, metricId?: string): Promise<void>;

  // Configuration
  init(config: AialyticsConfig): void;
  setUser(user: Partial<AnalyticsUser>): void;
  reset(): void;
}

export interface RecordingOptions {
  maskInputs: boolean;
  maskImages: boolean;
  ignoreSelectors: string[];
  maxDuration: number; // Minutes
}

// MoMind Integration Types
export interface MoMindIntegration {
  // Agent Analytics
  trackAgentAction(agentId: string, action: string, properties?: Record<string, unknown>): Promise<void>;
  trackAgentPerformance(agentId: string, metrics: AgentPerformanceMetrics): Promise<void>;

  // Quality Gates Integration
  trackQualityGate(gateId: string, result: QualityGateResult): Promise<void>;

  // A/B Testing for Agents
  getAgentExperiment(agentId: string, context: Record<string, unknown>): Promise<ExperimentVariant>;

  // Business Intelligence Integration
  trackBusinessIntelligence(requestId: string, insights: BusinessInsightMetrics): Promise<void>;
}

export interface AgentPerformanceMetrics {
  responseTime: number;
  successRate: number;
  errorRate: number;
  qualityScore: number;
  taskCompletionRate: number;
}

export interface QualityGateResult {
  passed: boolean;
  score: number;
  category: string;
  recommendations: string[];
}

export interface BusinessInsightMetrics {
  credibilityScore: number;
  insightCount: number;
  dataSourceCount: number;
  processingTime: number;
}

// Billing & Subscription Types
export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;

  // Pricing
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;

  // Limits
  monthlyEvents: number;
  dataRetentionMonths: number;
  heatmapPagesPerMonth: number;
  recordingMinutesPerMonth: number;
  experimentsLimit: number;

  // Features
  features: PlanFeature[];

  // Support
  supportLevel: 'email' | 'priority' | 'dedicated';
}

export interface PlanFeature {
  name: string;
  description: string;
  enabled: boolean;
  limit?: number;
}

export interface UsageMetrics {
  period: { start: number; end: number };

  // Core Usage
  totalEvents: number;
  uniqueUsers: number;
  pageViews: number;
  sessions: number;

  // Feature Usage
  heatmapPages: number;
  recordingMinutes: number;
  activeExperiments: number;
  apiCalls: number;

  // Storage Efficiency
  rawDataSize: number;
  compressedDataSize: number;
  compressionRatio: number;
  storageCostSaved: number;
}

// Dashboard & Reporting Types
export interface Dashboard {
  id: string;
  name: string;
  description: string;

  // Configuration
  widgets: DashboardWidget[];
  layout: DashboardLayout;
  filters: DashboardFilter[];

  // Sharing
  isPublic: boolean;
  sharedWith: string[];

  // Metadata
  createdAt: number;
  updatedAt: number;
  createdBy: string;

  // Auto-refresh
  autoRefresh: boolean;
  refreshInterval: number; // Seconds
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;

  // Configuration
  metric: string;
  dimensions: string[];
  filters: WidgetFilter[];
  timeRange: TimeRange;

  // Visualization
  chartType: ChartType;
  options: WidgetOptions;

  // Position & Size
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export type WidgetType =
  | 'metric'
  | 'chart'
  | 'table'
  | 'heatmap'
  | 'funnel'
  | 'cohort'
  | 'experiment'
  | 'realtime'
  | 'custom';

export type ChartType =
  | 'line'
  | 'bar'
  | 'pie'
  | 'area'
  | 'scatter'
  | 'heatmap'
  | 'funnel'
  | 'cohort_table'
  | 'gauge'
  | 'number';

export interface WidgetFilter {
  property: string;
  operator: string;
  value: unknown;
}

export interface TimeRange {
  type: 'relative' | 'absolute';
  value: string | { start: number; end: number };
}

export interface WidgetOptions {
  showLegend: boolean;
  showGrid: boolean;
  colors: string[];
  yAxisMin?: number;
  yAxisMax?: number;
  goalLine?: number;
  compareTime?: boolean;
}

export interface DashboardLayout {
  columns: number;
  rowHeight: number;
  margin: [number, number];
  containerPadding: [number, number];
}

export interface DashboardFilter {
  property: string;
  type: 'dimension' | 'metric';
  operator: string;
  value: unknown;
  required: boolean;
}

// Data Export & API Types
export interface DataExport {
  id: string;
  name: string;
  description: string;

  // Export Configuration
  format: 'csv' | 'json' | 'parquet' | 'avro';
  compression: 'none' | 'gzip' | 'snappy';

  // Data Selection
  eventTypes: EventType[];
  properties: string[];
  timeRange: TimeRange;
  filters: ExportFilter[];

  // Privacy
  anonymizeUsers: boolean;
  excludeProperties: string[];

  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  downloadUrl?: string;

  // Metadata
  fileSize?: number;
  recordCount?: number;
  createdAt: number;
  expiresAt: number;
}

export interface ExportFilter {
  property: string;
  operator: string;
  value: unknown;
}

// System Health & Monitoring
export interface AialyticsHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;

  // Performance Metrics
  ingestionRate: number; // Events per second
  processingLatency: number; // Milliseconds
  queryLatency: number; // Milliseconds
  errorRate: number; // Percentage

  // Storage Efficiency
  compressionRatio: number;
  predictionAccuracy: number;
  storageUtilization: number; // Percentage

  // System Resources
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIO: number;

  // Feature Health
  heatmapsEnabled: boolean;
  recordingEnabled: boolean;
  experimentingEnabled: boolean;
  realTimeEnabled: boolean;
}

export interface AialyticsMetrics {
  // Usage Statistics
  totalProjects: number;
  totalUsers: number;
  totalEvents: number;
  dailyActiveUsers: number;
  monthlyActiveUsers: number;

  // Platform Performance
  averageIngestionLatency: number;
  averageQueryLatency: number;
  systemUptime: number;
  dataAccuracy: number;

  // Efficiency Metrics
  averageCompressionRatio: number;
  totalStorageSaved: number;
  predictionHitRate: number;

  // Feature Adoption
  heatmapUsage: number;
  recordingUsage: number;
  experimentUsage: number;
  dashboardUsage: number;
}

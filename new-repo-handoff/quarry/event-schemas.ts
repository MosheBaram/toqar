/**
 * Event Validation Schemas
 * Comprehensive schema validation for all event types
 */

import { z } from 'zod';

// Base event schema
export const BaseEventSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().min(1, 'User ID is required'),
  sessionId: z.string().min(1, 'Session ID is required'),
  timestamp: z.number().positive().optional(),
  type: z.enum([
    'page_view',
    'click',
    'scroll',
    'form_submit',
    'search',
    'purchase',
    'signup',
    'login',
    'logout',
    'error',
    'feature_use',
    'time_spent',
    'navigation',
    'interaction',
    'conversion',
    'abandonment'
  ]),
  category: z.enum([
    'engagement',
    'conversion',
    'navigation',
    'error',
    'feature',
    'performance',
    'user_preference',
    'content_interaction'
  ]),
  action: z.string().min(1, 'Action is required'),
  label: z.string().optional(),
  value: z.number().optional(),
  properties: z.record(z.any()).optional(),
  context: z.object({
    page: z.string().optional(),
    referrer: z.string().optional(),
    userAgent: z.string().optional(),
    device: z.string().optional(),
    location: z.string().optional(),
    campaign: z.string().optional(),
    source: z.string().optional(),
    medium: z.string().optional(),
    feature: z.string().optional(),
    component: z.string().optional(),
    version: z.string().optional(),
    experiment: z.string().optional(),
    variant: z.string().optional(),
  }).optional(),
  metadata: z.object({
    processed: z.boolean().optional(),
    scored: z.boolean().optional(),
    segmented: z.boolean().optional(),
    anonymized: z.boolean().optional(),
    quality: z.number().min(0).max(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
    tags: z.array(z.string()).optional(),
    flags: z.array(z.string()).optional(),
  }).optional(),
});

// Specific event schemas
export const PageViewEventSchema = BaseEventSchema.extend({
  type: z.literal('page_view'),
  category: z.literal('navigation'),
  properties: z.object({
    page: z.string().min(1, 'Page is required for page view events'),
    title: z.string().optional(),
    url: z.string().url().optional(),
    referrer: z.string().optional(),
    loadTime: z.number().positive().optional(),
    scrollDepth: z.number().min(0).max(100).optional(),
  }).optional(),
});

export const ClickEventSchema = BaseEventSchema.extend({
  type: z.literal('click'),
  category: z.literal('engagement'),
  properties: z.object({
    element: z.string().min(1, 'Element is required for click events'),
    elementType: z.enum(['button', 'link', 'image', 'text', 'form', 'other']).optional(),
    position: z.object({
      x: z.number(),
      y: z.number(),
    }).optional(),
    target: z.string().optional(),
  }).optional(),
});

export const FormSubmitEventSchema = BaseEventSchema.extend({
  type: z.literal('form_submit'),
  category: z.literal('conversion'),
  properties: z.object({
    formId: z.string().min(1, 'Form ID is required for form submit events'),
    formName: z.string().optional(),
    fields: z.array(z.string()).optional(),
    completionTime: z.number().positive().optional(),
    validationErrors: z.array(z.string()).optional(),
  }).optional(),
});

export const PurchaseEventSchema = BaseEventSchema.extend({
  type: z.literal('purchase'),
  category: z.literal('conversion'),
  properties: z.object({
    transactionId: z.string().min(1, 'Transaction ID is required for purchase events'),
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().length(3, 'Currency must be 3 characters'),
    items: z.array(z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      category: z.string().optional(),
      quantity: z.number().positive(),
      price: z.number().positive(),
    })).optional(),
    paymentMethod: z.string().optional(),
    couponCode: z.string().optional(),
    discount: z.number().optional(),
  }).optional(),
});

export const ErrorEventSchema = BaseEventSchema.extend({
  type: z.literal('error'),
  category: z.literal('error'),
  properties: z.object({
    errorType: z.string().min(1, 'Error type is required'),
    errorMessage: z.string().min(1, 'Error message is required'),
    errorCode: z.string().optional(),
    stackTrace: z.string().optional(),
    userAgent: z.string().optional(),
    url: z.string().optional(),
    line: z.number().optional(),
    column: z.number().optional(),
  }).optional(),
});

// Feedback event schema
export const FeedbackEventSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  timestamp: z.number().positive().optional(),
  type: z.enum([
    'bug_report',
    'feature_request',
    'improvement',
    'complaint',
    'compliment',
    'question',
    'suggestion',
    'review',
    'rating',
    'nps',
    'usability',
    'performance',
    'accessibility',
    'security',
    'other'
  ]),
  category: z.enum([
    'ui_ux',
    'functionality',
    'performance',
    'security',
    'accessibility',
    'content',
    'integration',
    'mobile',
    'desktop',
    'api',
    'documentation',
    'support',
    'billing',
    'onboarding',
    'navigation',
    'search',
    'other'
  ]),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  status: z.enum([
    'new',
    'acknowledged',
    'in_review',
    'planned',
    'in_progress',
    'completed',
    'rejected',
    'duplicate',
    'cannot_reproduce'
  ]).optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  rating: z.number().min(1).max(10).optional(),
  npsScore: z.number().min(0).max(10).optional(),
  user: z.object({
    id: z.string().optional(),
    segment: z.string().optional(),
    cohort: z.string().optional(),
    plan: z.string().optional(),
    tenure: z.number().optional(),
    usage: z.string().optional(),
    role: z.string().optional(),
    company: z.string().optional(),
    industry: z.string().optional(),
    size: z.string().optional(),
    location: z.string().optional(),
    isAnonymous: z.boolean().optional(),
  }).optional(),
});

// Type exports
export type BaseEvent = z.infer<typeof BaseEventSchema>;
export type PageViewEvent = z.infer<typeof PageViewEventSchema>;
export type ClickEvent = z.infer<typeof ClickEventSchema>;
export type FormSubmitEvent = z.infer<typeof FormSubmitEventSchema>;
export type PurchaseEvent = z.infer<typeof PurchaseEventSchema>;
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
export type FeedbackEvent = z.infer<typeof FeedbackEventSchema>;

// Union type for all events
export type ValidatedEvent = 
  | PageViewEvent
  | ClickEvent
  | FormSubmitEvent
  | PurchaseEvent
  | ErrorEvent
  | BaseEvent;

// Schema registry
export const EventSchemaRegistry = {
  page_view: PageViewEventSchema,
  click: ClickEventSchema,
  form_submit: FormSubmitEventSchema,
  purchase: PurchaseEventSchema,
  error: ErrorEventSchema,
  base: BaseEventSchema,
};

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  data?: ValidatedEvent;
}

// Business rules validation
export const BusinessRules = {
  maxEventSize: 10000, // 10KB max event size
  maxPropertiesCount: 50,
  maxStringLength: 1000,
  maxArrayLength: 100,
  requiredFields: ['userId', 'sessionId', 'type', 'category', 'action'],
  allowedEventTypes: [
    'page_view', 'click', 'scroll', 'form_submit', 'search', 'purchase',
    'signup', 'login', 'logout', 'error', 'feature_use', 'time_spent',
    'navigation', 'interaction', 'conversion', 'abandonment'
  ],
  allowedCategories: [
    'engagement', 'conversion', 'navigation', 'error', 'feature',
    'performance', 'user_preference', 'content_interaction'
  ],
  eventRateLimit: {
    maxEventsPerSecond: 100,
    maxEventsPerMinute: 1000,
    maxEventsPerHour: 10000,
  },
  sessionRules: {
    maxSessionDuration: 24 * 60 * 60 * 1000, // 24 hours
    maxEventsPerSession: 10000,
  },
};
/**
 * Event Validator
 * Comprehensive event validation with schema checking, business rules, and rate limiting
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'eventemitter3';
import {
  BaseEventSchema,
  EventSchemaRegistry,
  BusinessRules,
  ValidationResult,
  ValidatedEvent,
  BaseEvent
} from './event-schemas.js';

interface ValidationConfig {
  enableSchemaValidation: boolean;
  enableBusinessRules: boolean;
  enableRateLimiting: boolean;
  enableSanitization: boolean;
  strictMode: boolean;
  maxEventSize: number;
  logInvalidEvents: boolean;
}

interface RateLimitEntry {
  count: number;
  timestamp: number;
  windowStart: number;
}

interface ValidationMetrics {
  totalEvents: number;
  validEvents: number;
  invalidEvents: number;
  rateLimitedEvents: number;
  sanitizedEvents: number;
  errors: Record<string, number>;
  performance: {
    averageValidationTime: number;
    maxValidationTime: number;
    minValidationTime: number;
  };
}

interface ValidationEvents {
  'event-validated': { event: ValidatedEvent; validationTime: number };
  'event-rejected': { event: any; errors: string[]; validationTime: number };
  'rate-limit-exceeded': { userId: string; sessionId: string; limit: string };
  'validation-error': { error: Error; event: any };
  'metrics-updated': { metrics: ValidationMetrics };
}

export class EventValidator extends EventEmitter<ValidationEvents> {
  private readonly config: ValidationConfig;
  private readonly rateLimitStore: Map<string, RateLimitEntry> = new Map();
  private readonly metrics: ValidationMetrics = {
    totalEvents: 0,
    validEvents: 0,
    invalidEvents: 0,
    rateLimitedEvents: 0,
    sanitizedEvents: 0,
    errors: {},
    performance: {
      averageValidationTime: 0,
      maxValidationTime: 0,
      minValidationTime: Number.MAX_SAFE_INTEGER,
    },
  };

  constructor(config: Partial<ValidationConfig> = {}) {
    super();
    
    this.config = {
      enableSchemaValidation: true,
      enableBusinessRules: true,
      enableRateLimiting: true,
      enableSanitization: true,
      strictMode: false,
      maxEventSize: BusinessRules.maxEventSize,
      logInvalidEvents: true,
      ...config,
    };

    // Cleanup rate limit store every minute
    setInterval(() => this.cleanupRateLimitStore(), 60000);
  }

  /**
   * Validate an event
   */
  public async validateEvent(event: any): Promise<ValidationResult> {
    const startTime = Date.now();
    this.metrics.totalEvents++;

    try {
      // Step 1: Basic validation
      const basicValidation = this.validateBasicStructure(event);
      if (!basicValidation.isValid) {
        return this.handleValidationFailure(event, basicValidation.errors, startTime);
      }

      // Step 2: Rate limiting
      if (this.config.enableRateLimiting) {
        const rateLimitResult = this.checkRateLimit(event);
        if (!rateLimitResult.isValid) {
          this.metrics.rateLimitedEvents++;
          return this.handleValidationFailure(event, rateLimitResult.errors, startTime);
        }
      }

      // Step 3: Schema validation
      if (this.config.enableSchemaValidation) {
        const schemaValidation = this.validateSchema(event);
        if (!schemaValidation.isValid) {
          return this.handleValidationFailure(event, schemaValidation.errors, startTime);
        }
        event = schemaValidation.data;
      }

      // Step 4: Business rules validation
      if (this.config.enableBusinessRules) {
        const businessRulesValidation = this.validateBusinessRules(event);
        if (!businessRulesValidation.isValid) {
          return this.handleValidationFailure(event, businessRulesValidation.errors, startTime);
        }
      }

      // Step 5: Sanitization
      if (this.config.enableSanitization) {
        const sanitizedEvent = this.sanitizeEvent(event);
        if (sanitizedEvent.sanitized) {
          this.metrics.sanitizedEvents++;
        }
        event = sanitizedEvent.event;
      }

      // Step 6: Enrich event
      const enrichedEvent = this.enrichEvent(event);

      // Success
      const validationTime = Date.now() - startTime;
      this.updatePerformanceMetrics(validationTime);
      this.metrics.validEvents++;
      
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
        data: enrichedEvent,
      };

      this.emit('event-validated', { event: enrichedEvent, validationTime });
      this.emit('metrics-updated', { metrics: this.metrics });

      return result;

    } catch (error) {
      this.emit('validation-error', { error: error as Error, event });
      return this.handleValidationFailure(event, [`Validation error: ${error.message}`], startTime);
    }
  }

  /**
   * Validate basic event structure
   */
  private validateBasicStructure(event: any): ValidationResult {
    const errors: string[] = [];

    if (!event || typeof event !== 'object') {
      errors.push('Event must be an object');
      return { isValid: false, errors, warnings: [] };
    }

    // Check event size
    const eventSize = JSON.stringify(event).length;
    if (eventSize > this.config.maxEventSize) {
      errors.push(`Event size (${eventSize}) exceeds maximum (${this.config.maxEventSize})`);
    }

    // Check required fields
    for (const field of BusinessRules.requiredFields) {
      if (!event[field]) {
        errors.push(`Required field '${field}' is missing`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Check rate limits
   */
  private checkRateLimit(event: any): ValidationResult {
    const userId = event.userId || 'anonymous';
    const sessionId = event.sessionId || 'unknown';
    const key = `${userId}:${sessionId}`;
    const now = Date.now();

    const entry = this.rateLimitStore.get(key) || {
      count: 0,
      timestamp: now,
      windowStart: now,
    };

    // Check per-second rate limit
    if (now - entry.timestamp < 1000) {
      if (entry.count >= BusinessRules.eventRateLimit.maxEventsPerSecond) {
        this.emit('rate-limit-exceeded', { userId, sessionId, limit: 'per-second' });
        return {
          isValid: false,
          errors: ['Rate limit exceeded: too many events per second'],
          warnings: [],
        };
      }
    } else {
      // Reset counter for new second
      entry.count = 0;
      entry.timestamp = now;
    }

    // Check per-minute rate limit
    if (now - entry.windowStart >= 60000) {
      entry.windowStart = now;
      entry.count = 0;
    }

    entry.count++;
    this.rateLimitStore.set(key, entry);

    return { isValid: true, errors: [], warnings: [] };
  }

  /**
   * Validate against schema
   */
  private validateSchema(event: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get appropriate schema
      const schema = EventSchemaRegistry[event.type] || BaseEventSchema;
      
      // Validate with schema
      const result = schema.safeParse(event);
      
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push(`${issue.path.join('.')}: ${issue.message}`);
        }
        return { isValid: false, errors, warnings };
      }

      return { isValid: true, errors, warnings, data: result.data };

    } catch (error) {
      errors.push(`Schema validation error: ${error.message}`);
      return { isValid: false, errors, warnings };
    }
  }

  /**
   * Validate business rules
   */
  private validateBusinessRules(event: ValidatedEvent): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check event type
    if (!BusinessRules.allowedEventTypes.includes(event.type)) {
      errors.push(`Invalid event type: ${event.type}`);
    }

    // Check category
    if (!BusinessRules.allowedCategories.includes(event.category)) {
      errors.push(`Invalid event category: ${event.category}`);
    }

    // Check properties count
    if (event.properties && Object.keys(event.properties).length > BusinessRules.maxPropertiesCount) {
      errors.push(`Too many properties: ${Object.keys(event.properties).length} > ${BusinessRules.maxPropertiesCount}`);
    }

    // Check string lengths
    if (event.action && event.action.length > BusinessRules.maxStringLength) {
      errors.push(`Action too long: ${event.action.length} > ${BusinessRules.maxStringLength}`);
    }

    // Check arrays
    if (event.metadata?.tags && event.metadata.tags.length > BusinessRules.maxArrayLength) {
      errors.push(`Too many tags: ${event.metadata.tags.length} > ${BusinessRules.maxArrayLength}`);
    }

    // Business logic validation
    if (event.type === 'purchase' && event.properties?.amount && event.properties.amount <= 0) {
      errors.push('Purchase amount must be positive');
    }

    if (event.type === 'form_submit' && !event.properties?.formId) {
      warnings.push('Form submit event should include formId');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Sanitize event data
   */
  private sanitizeEvent(event: ValidatedEvent): { event: ValidatedEvent; sanitized: boolean } {
    let sanitized = false;
    const sanitizedEvent = { ...event };

    // Remove potential XSS
    if (sanitizedEvent.action) {
      const originalAction = sanitizedEvent.action;
      sanitizedEvent.action = this.sanitizeString(sanitizedEvent.action);
      if (sanitizedEvent.action !== originalAction) {
        sanitized = true;
      }
    }

    // Sanitize properties
    if (sanitizedEvent.properties) {
      sanitizedEvent.properties = this.sanitizeObject(sanitizedEvent.properties);
      sanitized = true;
    }

    // Remove sensitive data patterns
    if (sanitizedEvent.properties) {
      const sensitiveKeys = ['password', 'ssn', 'creditcard', 'token', 'key'];
      for (const key of Object.keys(sanitizedEvent.properties)) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          delete sanitizedEvent.properties[key];
          sanitized = true;
        }
      }
    }

    return { event: sanitizedEvent, sanitized };
  }

  /**
   * Enrich event with metadata
   */
  private enrichEvent(event: ValidatedEvent): ValidatedEvent {
    const enrichedEvent: ValidatedEvent = {
      ...event,
      id: event.id || uuidv4(),
      timestamp: event.timestamp || Date.now(),
      metadata: {
        ...event.metadata,
        processed: false,
        scored: false,
        segmented: false,
        quality: 1.0,
        confidence: 1.0,
        tags: event.metadata?.tags || [],
        flags: event.metadata?.flags || [],
      },
    };

    return enrichedEvent;
  }

  /**
   * Handle validation failure
   */
  private handleValidationFailure(event: any, errors: string[], startTime: number): ValidationResult {
    const validationTime = Date.now() - startTime;
    this.updatePerformanceMetrics(validationTime);
    this.metrics.invalidEvents++;

    // Track error types
    for (const error of errors) {
      const errorType = error.split(':')[0];
      this.metrics.errors[errorType] = (this.metrics.errors[errorType] || 0) + 1;
    }

    this.emit('event-rejected', { event, errors, validationTime });
    this.emit('metrics-updated', { metrics: this.metrics });

    return {
      isValid: false,
      errors,
      warnings: [],
    };
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(validationTime: number): void {
    const totalValidations = this.metrics.validEvents + this.metrics.invalidEvents;
    this.metrics.performance.averageValidationTime = 
      (this.metrics.performance.averageValidationTime * (totalValidations - 1) + validationTime) / totalValidations;
    
    this.metrics.performance.maxValidationTime = Math.max(
      this.metrics.performance.maxValidationTime,
      validationTime
    );
    
    this.metrics.performance.minValidationTime = Math.min(
      this.metrics.performance.minValidationTime,
      validationTime
    );
  }

  /**
   * Clean up rate limit store
   */
  private cleanupRateLimitStore(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.rateLimitStore.entries()) {
      if (now - entry.timestamp > 60000) { // 1 minute
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.rateLimitStore.delete(key);
    }
  }

  /**
   * Sanitize string
   */
  private sanitizeString(str: string): string {
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  /**
   * Sanitize object
   */
  private sanitizeObject(obj: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Get validation metrics
   */
  public getMetrics(): ValidationMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics.totalEvents = 0;
    this.metrics.validEvents = 0;
    this.metrics.invalidEvents = 0;
    this.metrics.rateLimitedEvents = 0;
    this.metrics.sanitizedEvents = 0;
    this.metrics.errors = {};
    this.metrics.performance = {
      averageValidationTime: 0,
      maxValidationTime: 0,
      minValidationTime: Number.MAX_SAFE_INTEGER,
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<ValidationConfig>): void {
    Object.assign(this.config, config);
  }
}

export default EventValidator;
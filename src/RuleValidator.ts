import type { FieldRule } from './DependencyGraph.js';
import type { Action } from './ActionHandler.js';
import type { Logic } from './LogicResolver.js';

// Type definitions for better type safety
export type SharedRuleMap = Record<string, Logic>;

export interface InitActionPayload {
  fieldState?: Record<string, unknown>;
  fieldValue?: unknown;
}

export interface ValidationError extends Error {
  code: string;
  field?: string;
  details?: Record<string, unknown>;
}

export type ExtractActionTargetsFunction = (action: Action) => string[];

export class RuleValidator {
  private extractActionTargets: ExtractActionTargetsFunction;

  constructor(extractActionTargets: ExtractActionTargetsFunction) {
    this.extractActionTargets = extractActionTargets;
  }

  // Type guard helper functions
  private isString(value: unknown): value is string {
    return typeof value === 'string';
  }

  private isNumber(value: unknown): value is number {
    return typeof value === 'number' && !Number.isNaN(value);
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isFieldRule(value: unknown): value is FieldRule {
    return (
      this.isObject(value) &&
      'condition' in value &&
      'action' in value &&
      'priority' in value &&
      this.isNumber(value.priority)
    );
  }

  private isInitAction(action: Action): action is { init: InitActionPayload } {
    return 'init' in action;
  }

  private createValidationError(
    message: string,
    code: string,
    field?: string,
    details?: Record<string, unknown>
  ): ValidationError {
    const error = new Error(message) as ValidationError;
    error.code = code;
    error.field = field;
    error.details = details;
    return error;
  }

  validateNoPriorityConflicts(fieldName: string, rules: FieldRule[]): void {
    if (!this.isString(fieldName)) {
      throw this.createValidationError('Field name must be a string', 'INVALID_FIELD_NAME');
    }

    if (!Array.isArray(rules)) {
      throw this.createValidationError('Rules must be an array', 'INVALID_RULES_ARRAY', fieldName);
    }

    const targetPriorityMap = new Map<string, number[]>();

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];

      if (!this.isFieldRule(rule)) {
        throw this.createValidationError(
          `Rule at index ${i} is not a valid FieldRule`,
          'INVALID_RULE_STRUCTURE',
          fieldName,
          { ruleIndex: i, rule }
        );
      }

      const targets = this.extractActionTargets(rule.action);
      for (const target of targets) {
        if (!this.isString(target)) {
          throw this.createValidationError(
            `Invalid target type at rule index ${i}`,
            'INVALID_TARGET_TYPE',
            fieldName,
            { ruleIndex: i, target }
          );
        }

        if (!targetPriorityMap.has(target)) {
          targetPriorityMap.set(target, []);
        }
        targetPriorityMap.get(target)!.push(rule.priority);
      }
    }

    for (const [target, priorities] of targetPriorityMap) {
      const priorityCounts = new Map<number, number>();
      for (const priority of priorities) {
        priorityCounts.set(priority, (priorityCounts.get(priority) ?? 0) + 1);
      }

      for (const [priority, count] of priorityCounts) {
        if (count > 1) {
          throw this.createValidationError(
            `Conflicting rules for field '${fieldName}' target '${target}' with same priority ${priority}`,
            'PRIORITY_CONFLICT',
            fieldName,
            { target, priority, conflictCount: count }
          );
        }
      }
    }
  }

  sortRulesByPriority(rules: FieldRule[]): FieldRule[] {
    if (!Array.isArray(rules)) {
      throw this.createValidationError('Rules must be an array', 'INVALID_RULES_ARRAY');
    }

    // Validate each rule before sorting
    for (let i = 0; i < rules.length; i++) {
      if (!this.isFieldRule(rules[i])) {
        throw this.createValidationError(
          `Rule at index ${i} is not a valid FieldRule`,
          'INVALID_RULE_STRUCTURE',
          undefined,
          { ruleIndex: i, rule: rules[i] }
        );
      }
    }

    return rules.sort((a, b) => a.priority - b.priority);
  }

  validateRuleStructure(rule: FieldRule): void {
    // Check individual properties with specific error messages for backward compatibility
    if (!rule.condition) {
      throw new Error('Rule must have a condition');
    }

    if (!rule.action) {
      throw new Error('Rule must have an action');
    }

    if (!this.isNumber(rule.priority)) {
      throw new Error('Rule priority must be a number');
    }

    // Check overall structure is valid FieldRule
    if (!this.isFieldRule(rule)) {
      throw this.createValidationError(
        'Invalid rule structure',
        'INVALID_RULE_STRUCTURE',
        undefined,
        { rule }
      );
    }
  }

  validateSharedRuleExists(refName: string, sharedRules: SharedRuleMap): void {
    if (!this.isString(refName)) {
      throw this.createValidationError('Reference name must be a string', 'INVALID_REF_NAME');
    }

    if (!this.isObject(sharedRules)) {
      throw this.createValidationError('Shared rules must be an object', 'INVALID_SHARED_RULES');
    }

    if (!(refName in sharedRules) || !sharedRules[refName]) {
      throw this.createValidationError(
        `Shared rule '${refName}' not found`,
        'SHARED_RULE_NOT_FOUND',
        undefined,
        { refName }
      );
    }
  }

  validateInitRules(fieldName: string, initRules: FieldRule[]): void {
    if (!this.isString(fieldName)) {
      throw this.createValidationError('Field name must be a string', 'INVALID_FIELD_NAME');
    }

    if (!Array.isArray(initRules)) {
      throw this.createValidationError(
        'Init rules must be an array',
        'INVALID_INIT_RULES_ARRAY',
        fieldName
      );
    }

    if (initRules.length === 0) {
      return;
    }

    // Validate each init rule structure
    for (let i = 0; i < initRules.length; i++) {
      const rule = initRules[i];
      if (!this.isFieldRule(rule)) {
        throw this.createValidationError(
          `Init rule at index ${i} is not a valid FieldRule`,
          'INVALID_INIT_RULE_STRUCTURE',
          fieldName,
          { ruleIndex: i, rule }
        );
      }

      // Validate that the action is an init action
      if (!this.isInitAction(rule.action)) {
        throw this.createValidationError(
          `Init rule at index ${i} does not contain an init action`,
          'MISSING_INIT_ACTION',
          fieldName,
          { ruleIndex: i, action: rule.action }
        );
      }
    }

    // Check for multiple init rules with same priority
    const priorityGroups = new Map<number, FieldRule[]>();
    for (const rule of initRules) {
      const priority = rule.priority;
      if (!priorityGroups.has(priority)) {
        priorityGroups.set(priority, []);
      }
      priorityGroups.get(priority)!.push(rule);
    }

    // Warn if multiple init rules have same priority
    for (const [priority, rules] of priorityGroups) {
      if (rules.length > 1) {
        console.warn(
          `Field '${fieldName}' has ${rules.length} init rules with priority ${priority}. ` +
            `Only the first matching rule will be applied.`
        );
      }
    }
  }

  validateInitActionStructure(action: Action): void {
    if (!this.isInitAction(action)) {
      return; // Not an init action
    }

    const initPayload = action.init;

    // Validate that at least one of fieldState or fieldValue is provided
    if (!initPayload.fieldState && initPayload.fieldValue === undefined) {
      throw this.createValidationError(
        'Init action must specify either fieldState or fieldValue',
        'INVALID_INIT_PAYLOAD',
        undefined,
        { payload: initPayload }
      );
    }

    // Validate fieldState is an object if provided
    if (initPayload.fieldState && !this.isObject(initPayload.fieldState)) {
      throw this.createValidationError(
        'Init action fieldState must be an object',
        'INVALID_FIELD_STATE',
        undefined,
        { fieldState: initPayload.fieldState }
      );
    }
  }
}

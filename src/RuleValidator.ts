import type { FieldRule } from './DependencyGraph.js';
import type { Action } from './ActionHandler.js';

export class RuleValidator {
  private extractActionTargets: (action: Action) => string[];

  constructor(extractActionTargets: (action: Action) => string[]) {
    this.extractActionTargets = extractActionTargets;
  }

  validateNoPriorityConflicts(fieldName: string, rules: FieldRule[]): void {
    const targetPriorityMap = new Map<string, number[]>();

    for (const rule of rules) {
      const targets = this.extractActionTargets(rule.action);
      for (const target of targets) {
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
          throw new Error(
            `Conflicting rules for field '${fieldName}' target '${target}' with same priority ${priority}`
          );
        }
      }
    }
  }

  sortRulesByPriority(rules: FieldRule[]): FieldRule[] {
    return rules.sort((a, b) => a.priority - b.priority);
  }

  validateRuleStructure(rule: FieldRule): void {
    if (!rule.condition) {
      throw new Error('Rule must have a condition');
    }
    if (!rule.action) {
      throw new Error('Rule must have an action');
    }
    if (typeof rule.priority !== 'number') {
      throw new Error('Rule priority must be a number');
    }
  }

  validateSharedRuleExists(refName: string, sharedRules: Record<string, any>): void {
    if (!sharedRules[refName]) {
      throw new Error(`Shared rule '${refName}' not found`);
    }
  }

  validateInitRules(fieldName: string, initRules: FieldRule[]): void {
    if (initRules.length === 0) {
      return;
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

  validateInitActionStructure(action: any): void {
    if (!('init' in action)) {
      return; // Not an init action
    }

    const initPayload = action.init;

    // Validate that at least one of fieldState or fieldValue is provided
    if (!initPayload.fieldState && initPayload.fieldValue === undefined) {
      throw new Error('Init action must specify either fieldState or fieldValue');
    }

    // Validate merge flag is boolean if provided
    // if (initPayload.merge !== undefined && typeof initPayload.merge !== 'boolean') {
    //   throw new Error('Init action merge flag must be a boolean');
    // }

    // Validate fieldState is an object if provided
    if (initPayload.fieldState && typeof initPayload.fieldState !== 'object') {
      throw new Error('Init action fieldState must be an object');
    }
  }
}

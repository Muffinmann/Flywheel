import { FieldRule } from './DependencyGraph.js';
import { Action } from './ActionHandler.js';

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
        priorityCounts.set(priority, (priorityCounts.get(priority) || 0) + 1);
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
}
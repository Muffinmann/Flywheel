import { Logic } from './LogicResolver.js';
import { Action } from './ActionHandler.js';

export interface FieldRule {
  condition: Logic;
  action: Action;
  priority: number;
  description?: string;
}

export interface RuleSet {
  [fieldName: string]: FieldRule[];
}

export class DependencyGraph {
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private reverseDependencyGraph: Map<string, Set<string>> = new Map();
  private sharedRules: Record<string, Logic> = {};

  constructor(sharedRules: Record<string, Logic> = {}) {
    this.sharedRules = sharedRules;
  }

  updateSharedRules(sharedRules: Record<string, Logic>): void {
    this.sharedRules = { ...this.sharedRules, ...sharedRules };
  }

  buildFromRuleSet(ruleSet: RuleSet, extractActionDependencies: (action: Action) => string[]): void {
    this.dependencyGraph.clear();
    this.reverseDependencyGraph.clear();

    for (const [fieldName, rules] of Object.entries(ruleSet)) {
      const dependencies = new Set<string>();

      for (const rule of rules) {
        const conditionDeps = this.extractDependencies(rule.condition);
        const actionDeps = extractActionDependencies(rule.action);

        for (const dep of [...conditionDeps, ...actionDeps]) {
          dependencies.add(dep);
        }
      }

      this.dependencyGraph.set(fieldName, dependencies);

      for (const dependency of dependencies) {
        if (!this.reverseDependencyGraph.has(dependency)) {
          this.reverseDependencyGraph.set(dependency, new Set());
        }
        this.reverseDependencyGraph.get(dependency)!.add(fieldName);
      }
    }
  }

  getDependencies(fieldName: string): string[] {
    return Array.from(this.dependencyGraph.get(fieldName) || []);
  }

  getDependents(fieldName: string): string[] {
    return Array.from(this.reverseDependencyGraph.get(fieldName) || []);
  }

  validateNoCycles(ruleSet: RuleSet): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (fieldName: string): boolean => {
      if (recursionStack.has(fieldName)) {
        return true;
      }
      if (visited.has(fieldName)) {
        return false;
      }

      visited.add(fieldName);
      recursionStack.add(fieldName);

      const dependencies = this.dependencyGraph.get(fieldName) || new Set();
      for (const dependency of dependencies) {
        if (hasCycle(dependency)) {
          return true;
        }
      }

      recursionStack.delete(fieldName);
      return false;
    };

    for (const fieldName of Object.keys(ruleSet)) {
      if (hasCycle(fieldName)) {
        throw new Error(`Circular dependency detected involving field: ${fieldName}`);
      }
    }
  }

  getInvalidatedFields(updatedFields: string[]): string[] {
    const invalidatedFields = new Set<string>();
    const toProcess = [...updatedFields];

    // Process fields transitively - if a field is invalidated, anything depending on it should also be invalidated
    while (toProcess.length > 0) {
      const fieldName = toProcess.shift()!;
      const dependentFields = this.reverseDependencyGraph.get(fieldName) || new Set();
      
      for (const dependentField of dependentFields) {
        if (!invalidatedFields.has(dependentField)) {
          invalidatedFields.add(dependentField);
          toProcess.push(dependentField); // Process this field's dependents too
        }
      }
    }

    return Array.from(invalidatedFields);
  }

  private extractDependencies(logic: Logic): string[] {
    const dependencies: string[] = [];

    if (typeof logic === 'object' && logic !== null && !Array.isArray(logic)) {
      for (const [operator, operands] of Object.entries(logic)) {
        if (operator === 'var') {
          const path = Array.isArray(operands) ? operands[0] : operands;
          if (typeof path === 'string') {
            const fieldName = path.includes('@') ? path.split('@')[0] : path.split('.')[0];
            if (fieldName !== '$') {
              dependencies.push(fieldName);
            }
          }
        } else if (operator === '$ref') {
          const refName = Array.isArray(operands) ? operands[0] : operands;
          if (this.sharedRules[refName]) {
            dependencies.push(...this.extractDependencies(this.sharedRules[refName]));
          }
        } else if (operator === 'lookup') {
          const lookupOperands = Array.isArray(operands) ? operands : [operands];
          if (lookupOperands.length > 1) {
            dependencies.push(...this.extractDependencies(lookupOperands[1]));
          }
        } else if (operator === 'varTable') {
          const operandArray = Array.isArray(operands) ? operands : [operands];
          for (const operand of operandArray) {
            if (typeof operand === 'string' && operand.includes('@')) {
              const fieldPath = operand.split('@')[0];
              if (fieldPath !== '$') {
                dependencies.push(fieldPath);
              }
            }
          }
        } else {
          const operandArray = Array.isArray(operands) ? operands : [operands];
          for (const operand of operandArray) {
            dependencies.push(...this.extractDependencies(operand));
          }
        }
      }
    } else if (Array.isArray(logic)) {
      for (const item of logic) {
        dependencies.push(...this.extractDependencies(item));
      }
    }

    return dependencies;
  }
}
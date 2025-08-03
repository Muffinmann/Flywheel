import type { Logic } from './LogicResolver.js';
import type { Action } from './ActionHandler.js';

export interface DependencyInfo {
  dependencies: string[]; // Fields this rule reads from
  dependents: string[]; // Fields this rule writes to
}

export interface DependencyVisitor {
  visitLogic(logic: Logic): DependencyInfo;
  visitAction(action: Action): DependencyInfo;
}

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

  private visitor: DependencyVisitor;

  constructor(visitor: DependencyVisitor) {
    this.visitor = visitor;
  }

  buildFromRuleSet(ruleSet: RuleSet): void {
    this.dependencyGraph.clear();
    this.reverseDependencyGraph.clear();

    for (const [fieldName, rules] of Object.entries(ruleSet)) {
      const dependencies = new Set<string>();

      for (const rule of rules) {
        const conditionInfo = this.visitor.visitLogic(rule.condition);
        const actionInfo = this.visitor.visitAction(rule.action);

        // Add all dependencies (fields read from)
        for (const dep of [...conditionInfo.dependencies, ...actionInfo.dependencies]) {
          dependencies.add(dep);
        }

        // For each dependent (field written to), mark current field as its dependency
        for (const dependent of actionInfo.dependents) {
          if (!this.reverseDependencyGraph.has(fieldName)) {
            this.reverseDependencyGraph.set(fieldName, new Set());
          }
          this.reverseDependencyGraph.get(fieldName)!.add(dependent);
        }
      }

      this.dependencyGraph.set(fieldName, dependencies);

      // Store reverse dependencies for the field's own dependencies
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
    const visited = new Set<string>(); // once a subgraph is cycle-free, we don't re-explore it.
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
}

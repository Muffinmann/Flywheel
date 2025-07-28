import { Logic } from './LogicResolver.js';
import { Action } from './ActionHandler.js';
import { DependencyVisitor } from './DependencyGraph.js';

export class DefaultDependencyVisitor implements DependencyVisitor {
  private sharedRules: Record<string, Logic> = {};

  constructor(sharedRules: Record<string, Logic> = {}) {
    this.sharedRules = sharedRules;
  }

  updateSharedRules(sharedRules: Record<string, Logic>): void {
    this.sharedRules = { ...this.sharedRules, ...sharedRules };
  }

  visitLogic(logic: Logic): string[] {
    return this.visitLogicInternal(logic, new Set());
  }

  private visitLogicInternal(logic: Logic, visited: Set<string>): string[] {
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
        } else if (operator === 'fieldState') {
          const pathArray = Array.isArray(operands) ? operands : [operands];
          for (const path of pathArray) {
            if (typeof path === 'string') {
              const fieldName = path.split('.')[0];
              dependencies.push(fieldName);
            }
          }
        } else if (operator === '$ref') {
          const refName = Array.isArray(operands) ? operands[0] : operands;
          if (this.sharedRules[refName] && !visited.has(refName)) {
            visited.add(refName);
            dependencies.push(...this.visitLogicInternal(this.sharedRules[refName], visited));
            visited.delete(refName);
          }
        } else if (operator === 'lookup') {
          const lookupOperands = Array.isArray(operands) ? operands : [operands];
          if (lookupOperands.length > 1) {
            dependencies.push(...this.visitLogicInternal(lookupOperands[1], visited));
          }
        } else if (operator === 'varTable') {
          const operandArray = Array.isArray(operands) ? operands : [operands];
          for (const operand of operandArray) {
            if (typeof operand === 'string' && operand.includes('@')) {
              const fieldPath = operand.split('@')[0];
              if (!fieldPath.startsWith('$')) {
                dependencies.push(fieldPath);
              }
            }
          }
        } else {
          const operandArray = Array.isArray(operands) ? operands : [operands];
          for (const operand of operandArray) {
            dependencies.push(...this.visitLogicInternal(operand, visited));
          }
        }
      }
    } else if (Array.isArray(logic)) {
      for (const item of logic) {
        dependencies.push(...this.visitLogicInternal(item, visited));
      }
    }

    return dependencies;
  }

  visitAction(action: Action): string[] {
    const actionType = Object.keys(action)[0];
    const payload = (action as any)[actionType];

    switch (actionType) {
      case 'copy':
        return [payload.source];
      case 'calculate':
        return this.visitLogic(payload.formula);
      case 'batch':
        return payload.flatMap((subAction: Action) => this.visitAction(subAction));
      default:
        return [];
    }
  }
}
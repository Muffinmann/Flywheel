import { Logic } from './LogicResolver.js';
import { Action } from './ActionHandler.js';
import { DependencyVisitor, DependencyInfo } from './DependencyGraph.js';

/**
 * Strategy interface for handling specific operators in dependency extraction
 */
interface OperatorHandler {
  handle(operands: any, visitor: DefaultDependencyVisitor, visited: Set<string>): DependencyInfo;
}

/**
 * Utility functions for common dependency extraction patterns
 */
class DependencyUtils {
  /**
   * Normalizes operands to array format for consistent processing
   */
  static normalizeToArray(operands: any): any[] {
    return Array.isArray(operands) ? operands : [operands];
  }

  /**
   * Extracts field name from a path string using standard field naming patterns
   * Handles both dot notation (field.property) and @ notation (field@table.property)
   */
  static extractFieldName(path: string): string | null {
    if (typeof path !== 'string') {
      return null;
    }

    // Handle @ notation first (field@table.property -> field)
    if (path.includes('@')) {
      const fieldName = path.split('@')[0];
      return fieldName !== '$' ? fieldName : null;
    }

    // Handle dot notation (field.property -> field)
    const fieldName = path.split('.')[0];
    return fieldName !== '$' ? fieldName : null;
  }

  /**
   * Processes multiple paths and extracts field names, filtering out null results
   */
  static extractFieldNamesFromPaths(paths: string[]): string[] {
    const dependencies: string[] = [];
    for (const path of paths) {
      const fieldName = this.extractFieldName(path);
      if (fieldName) {
        dependencies.push(fieldName);
      }
    }
    return dependencies;
  }
}

/**
 * Handler for 'var' operator - extracts field names from variable references
 */
class VarOperatorHandler implements OperatorHandler {
  handle(operands: any): DependencyInfo {
    const path = Array.isArray(operands) ? operands[0] : operands;
    if (typeof path === 'string') {
      const fieldName = DependencyUtils.extractFieldName(path);
      return {
        dependencies: fieldName ? [fieldName] : [],
        dependents: [],
      };
    }
    return { dependencies: [], dependents: [] };
  }
}


/**
 * Handler for '$ref' operator - resolves shared rule references
 */
class RefOperatorHandler implements OperatorHandler {
  handle(operands: any, visitor: DefaultDependencyVisitor, visited: Set<string>): DependencyInfo {
    const refName = Array.isArray(operands) ? operands[0] : operands;
    if (visitor.getSharedRule(refName) && !visited.has(refName)) {
      visited.add(refName);
      const info = visitor.visitLogicInternal(visitor.getSharedRule(refName)!, visited);
      visited.delete(refName);
      return info;
    }
    return { dependencies: [], dependents: [] };
  }
}

/**
 * Handler for 'lookup' operator - extracts dependencies from lookup key expressions
 */
class LookupOperatorHandler implements OperatorHandler {
  handle(operands: any, visitor: DefaultDependencyVisitor, visited: Set<string>): DependencyInfo {
    const lookupOperands = DependencyUtils.normalizeToArray(operands);
    if (lookupOperands.length > 1) {
      return visitor.visitLogicInternal(lookupOperands[1], visited);
    }
    return { dependencies: [], dependents: [] };
  }
}

/**
 * Handler for 'varTable' operator - extracts field names from table variable references
 */
class VarTableOperatorHandler implements OperatorHandler {
  handle(operands: any): DependencyInfo {
    const operandArray = DependencyUtils.normalizeToArray(operands);
    const dependencies: string[] = [];

    for (const operand of operandArray) {
      if (typeof operand === 'string' && operand.includes('@')) {
        const fieldPath = operand.split('@')[0];
        if (!fieldPath.startsWith('$')) {
          dependencies.push(fieldPath);
        }
      }
    }
    return { dependencies, dependents: [] };
  }
}

/**
 * Default handler for all other operators - recursively processes operands
 */
class DefaultOperatorHandler implements OperatorHandler {
  handle(operands: any, visitor: DefaultDependencyVisitor, visited: Set<string>): DependencyInfo {
    const operandArray = DependencyUtils.normalizeToArray(operands);
    const dependencies: string[] = [];
    const dependents: string[] = [];

    for (const operand of operandArray) {
      const info = visitor.visitLogicInternal(operand, visited);
      dependencies.push(...info.dependencies);
      dependents.push(...info.dependents);
    }
    return { dependencies, dependents };
  }
}

export class DefaultDependencyVisitor implements DependencyVisitor {
  private sharedRules: Record<string, Logic> = {};

  private operatorHandlers: Map<string, OperatorHandler> = new Map();

  constructor(sharedRules: Record<string, Logic> = {}) {
    this.sharedRules = sharedRules;
    this.initializeOperatorHandlers();
  }

  /**
   * Initialize the operator handler registry with all supported operators
   */
  private initializeOperatorHandlers(): void {
    this.operatorHandlers.set('var', new VarOperatorHandler());
    this.operatorHandlers.set('$ref', new RefOperatorHandler());
    this.operatorHandlers.set('lookup', new LookupOperatorHandler());
    this.operatorHandlers.set('varTable', new VarTableOperatorHandler());
  }

  /**
   * Get the appropriate handler for an operator, falling back to default handler
   */
  private getOperatorHandler(operator: string): OperatorHandler {
    return this.operatorHandlers.get(operator) || new DefaultOperatorHandler();
  }

  /**
   * Get a shared rule by name - used by RefOperatorHandler
   */
  getSharedRule(name: string): Logic | undefined {
    return this.sharedRules[name];
  }

  updateSharedRules(sharedRules: Record<string, Logic>): void {
    this.sharedRules = { ...this.sharedRules, ...sharedRules };
  }

  visitLogic(logic: Logic): DependencyInfo {
    return this.visitLogicInternal(logic, new Set());
  }

  visitLogicInternal(logic: Logic, visited: Set<string>): DependencyInfo {
    const dependencies: string[] = [];
    const dependents: string[] = [];

    // Handle primitive values (null, undefined, strings, numbers, booleans)
    if (typeof logic !== 'object' || logic === null) {
      return { dependencies, dependents };
    }

    // Handle arrays by recursively processing each item
    if (Array.isArray(logic)) {
      for (const item of logic) {
        const info = this.visitLogicInternal(item, visited);
        dependencies.push(...info.dependencies);
        dependents.push(...info.dependents);
      }
      return { dependencies, dependents };
    }

    // Handle logic objects with operators
    for (const [operator, operands] of Object.entries(logic)) {
      const handler = this.getOperatorHandler(operator);
      const info = handler.handle(operands, this, visited);
      dependencies.push(...info.dependencies);
      dependents.push(...info.dependents);
    }

    return { dependencies, dependents };
  }

  visitAction(action: Action): DependencyInfo {
    const actionType = Object.keys(action)[0];
    const payload = (action as any)[actionType];

    switch (actionType) {
      case 'set': {
        const targetField = DependencyUtils.extractFieldName(payload.target);
        return {
          dependencies: [],
          dependents: targetField ? [targetField] : [],
        };
      }
      case 'copy': {
        const sourceField = DependencyUtils.extractFieldName(payload.source);
        const targetField = DependencyUtils.extractFieldName(payload.target);
        return {
          dependencies: sourceField ? [sourceField] : [],
          dependents: targetField ? [targetField] : [],
        };
      }
      case 'calculate': {
        const targetField = DependencyUtils.extractFieldName(payload.target);
        const formulaInfo = this.visitLogic(payload.formula);
        return {
          dependencies: formulaInfo.dependencies,
          dependents: targetField ? [targetField] : [],
        };
      }
      case 'batch': {
        const dependencies: string[] = [];
        const dependents: string[] = [];
        for (const subAction of payload) {
          const info = this.visitAction(subAction);
          dependencies.push(...info.dependencies);
          dependents.push(...info.dependents);
        }
        return { dependencies, dependents };
      }
      default:
        return { dependencies: [], dependents: [] };
    }
  }
}

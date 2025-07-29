import { Logic } from './LogicResolver.js';
import { Action } from './ActionHandler.js';
import { DependencyVisitor } from './DependencyGraph.js';

/**
 * Strategy interface for handling specific operators in dependency extraction
 */
interface OperatorHandler {
  handle(operands: any, visitor: DefaultDependencyVisitor, visited: Set<string>): string[];
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
  handle(operands: any): string[] {
    const path = Array.isArray(operands) ? operands[0] : operands;
    if (typeof path === 'string') {
      const fieldName = DependencyUtils.extractFieldName(path);
      return fieldName ? [fieldName] : [];
    }
    return [];
  }
}

/**
 * Handler for 'fieldState' operator - extracts field names from field state references
 */
class FieldStateOperatorHandler implements OperatorHandler {
  handle(operands: any): string[] {
    const pathArray = DependencyUtils.normalizeToArray(operands);
    const stringPaths = pathArray.filter((path): path is string => typeof path === 'string');
    return DependencyUtils.extractFieldNamesFromPaths(stringPaths);
  }
}

/**
 * Handler for '$ref' operator - resolves shared rule references
 */
class RefOperatorHandler implements OperatorHandler {
  handle(operands: any, visitor: DefaultDependencyVisitor, visited: Set<string>): string[] {
    const refName = Array.isArray(operands) ? operands[0] : operands;
    if (visitor.getSharedRule(refName) && !visited.has(refName)) {
      visited.add(refName);
      const dependencies = visitor.visitLogicInternal(visitor.getSharedRule(refName)!, visited);
      visited.delete(refName);
      return dependencies;
    }
    return [];
  }
}

/**
 * Handler for 'lookup' operator - extracts dependencies from lookup key expressions
 */
class LookupOperatorHandler implements OperatorHandler {
  handle(operands: any, visitor: DefaultDependencyVisitor, visited: Set<string>): string[] {
    const lookupOperands = DependencyUtils.normalizeToArray(operands);
    if (lookupOperands.length > 1) {
      return visitor.visitLogicInternal(lookupOperands[1], visited);
    }
    return [];
  }
}

/**
 * Handler for 'varTable' operator - extracts field names from table variable references
 */
class VarTableOperatorHandler implements OperatorHandler {
  handle(operands: any): string[] {
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
    return dependencies;
  }
}

/**
 * Default handler for all other operators - recursively processes operands
 */
class DefaultOperatorHandler implements OperatorHandler {
  handle(operands: any, visitor: DefaultDependencyVisitor, visited: Set<string>): string[] {
    const operandArray = DependencyUtils.normalizeToArray(operands);
    const dependencies: string[] = [];

    for (const operand of operandArray) {
      dependencies.push(...visitor.visitLogicInternal(operand, visited));
    }
    return dependencies;
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
    this.operatorHandlers.set('fieldState', new FieldStateOperatorHandler());
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

  visitLogic(logic: Logic): string[] {
    return this.visitLogicInternal(logic, new Set());
  }

  visitLogicInternal(logic: Logic, visited: Set<string>): string[] {
    const dependencies: string[] = [];

    // Handle primitive values (null, undefined, strings, numbers, booleans)
    if (typeof logic !== 'object' || logic === null) {
      return dependencies;
    }

    // Handle arrays by recursively processing each item
    if (Array.isArray(logic)) {
      for (const item of logic) {
        dependencies.push(...this.visitLogicInternal(item, visited));
      }
      return dependencies;
    }

    // Handle logic objects with operators
    for (const [operator, operands] of Object.entries(logic)) {
      const handler = this.getOperatorHandler(operator);
      dependencies.push(...handler.handle(operands, this, visited));
    }

    return dependencies;
  }

  visitAction(action: Action): string[] {
    const actionType = Object.keys(action)[0];
    const payload = (action as any)[actionType];

    // Check actions that may reference other fields
    switch (actionType) {
      case 'copy':
        return [payload.source];
      case 'calculate':
        return this.visitLogic(payload.formula);
      case 'calculateState':
        return this.visitLogic(payload.formula);
      case 'batch':
        return payload.flatMap((subAction: Action) => this.visitAction(subAction));
      default:
        return [];
    }
  }
}
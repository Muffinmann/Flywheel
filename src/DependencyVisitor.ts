import type { Logic } from './LogicResolver.js';
import type { Action } from './ActionHandler.js';
import type { DependencyVisitor as IDependencyVisitor, DependencyInfo } from './DependencyGraph.js';

// Logic is just an alias for Logic since operands can be any valid Logic type

/**
 * Type for action payload based on action types
 */
export interface ActionPayloads {
  set: { target: string; value: unknown };
  copy: { source: string; target: string };
  calculate: { target: string; formula: Logic };
  trigger: { event: string; params?: unknown };
  batch: Action[];
  init: { fieldState?: Record<string, unknown>; fieldValue?: unknown };
  [key: string]: unknown; // For custom actions
}

/**
 * Interface for custom logic dependency visitors
 */
export interface CustomLogicDependencyVisitor {
  visitLogic(params: { operator: string; operands: Logic }): DependencyInfo;
}

/**
 * Interface for custom action dependency visitors
 */
export interface CustomActionDependencyVisitor {
  visitAction(params: { actionType: string; payload: unknown }): DependencyInfo;
}

/**
 * Strategy interface for handling specific operators in dependency extraction
 */
interface OperatorHandler {
  handle(operands: Logic, visitor: DependencyVisitor, visited: Set<string>): DependencyInfo;
}

/**
 * Utility functions for common dependency extraction patterns
 */
class DependencyUtils {
  /**
   * Normalizes operands to array format for consistent processing
   */
  static normalizeToArray(operands: Logic): Logic[] {
    return Array.isArray(operands) ? (operands as Logic[]) : [operands];
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
  handle(operands: Logic): DependencyInfo {
    const path = Array.isArray(operands) ? (operands[0] as string) : (operands as string);
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
  handle(operands: Logic, visitor: DependencyVisitor, visited: Set<string>): DependencyInfo {
    const refName = Array.isArray(operands) ? (operands[0] as string) : (operands as string);
    if (typeof refName === 'string') {
      const sharedRule = visitor.getSharedRule(refName);
      if (sharedRule && !visited.has(refName)) {
        visited.add(refName);
        const info = visitor.visitLogicInternal(sharedRule, visited);
        visited.delete(refName);
        return info;
      }
    }
    return { dependencies: [], dependents: [] };
  }
}

/**
 * Handler for 'lookup' operator - extracts dependencies from lookup key expressions
 */
class LookupOperatorHandler implements OperatorHandler {
  handle(operands: Logic, visitor: DependencyVisitor, visited: Set<string>): DependencyInfo {
    const lookupOperands = DependencyUtils.normalizeToArray(operands);
    if (lookupOperands.length > 1 && typeof lookupOperands[1] === 'object') {
      return visitor.visitLogicInternal(lookupOperands[1] as Logic, visited);
    }
    return { dependencies: [], dependents: [] };
  }
}

/**
 * Handler for 'varTable' operator - extracts field names from table variable references
 */
class VarTableOperatorHandler implements OperatorHandler {
  handle(operands: Logic): DependencyInfo {
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
  handle(operands: Logic, visitor: DependencyVisitor, visited: Set<string>): DependencyInfo {
    const operandArray = DependencyUtils.normalizeToArray(operands);
    const dependencies: string[] = [];
    const dependents: string[] = [];

    for (const operand of operandArray) {
      if (typeof operand === 'object' && operand !== null) {
        const info = visitor.visitLogicInternal(operand as Logic, visited);
        dependencies.push(...info.dependencies);
        dependents.push(...info.dependents);
      }
    }
    return { dependencies, dependents };
  }
}

export class DependencyVisitor implements IDependencyVisitor {
  private sharedRules: Record<string, Logic> = {};

  private operatorHandlers: Map<string, OperatorHandler> = new Map();

  private customLogicVisitors: Map<string, CustomLogicDependencyVisitor> = new Map();

  private customActionVisitors: Map<string, CustomActionDependencyVisitor> = new Map();

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
    return this.operatorHandlers.get(operator) ?? new DefaultOperatorHandler();
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

  /**
   * Register a custom logic dependency visitor
   */
  registerLogicVisitor(operator: string, visitor: CustomLogicDependencyVisitor): void {
    this.customLogicVisitors.set(operator, visitor);
  }

  /**
   * Register a custom action dependency visitor
   */
  registerActionVisitor(actionType: string, visitor: CustomActionDependencyVisitor): void {
    this.customActionVisitors.set(actionType, visitor);
  }

  visitLogic(logic: Logic): DependencyInfo {
    return this.visitLogicInternal(logic, new Set());
  }

  private deduplicate(deps: string[]): string[] {
    return Array.from(new Set(deps));
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
        const info = this.visitLogicInternal(item as Logic, visited);
        dependencies.push(...info.dependencies);
        dependents.push(...info.dependents);
      }
      return {
        dependencies: this.deduplicate(dependencies),
        dependents: this.deduplicate(dependents),
      };
    }

    // Handle logic objects with operators
    for (const [operator, operands] of Object.entries(logic)) {
      // Check for custom logic visitor first
      const customVisitor = this.customLogicVisitors.get(operator);
      if (customVisitor) {
        const info = customVisitor.visitLogic({ operator, operands });
        dependencies.push(...info.dependencies);
        dependents.push(...info.dependents);
      } else {
        // Fall back to built-in handlers
        const handler = this.getOperatorHandler(operator);
        const info = handler.handle(operands as Logic, this, visited);
        dependencies.push(...info.dependencies);
        dependents.push(...info.dependents);
      }
    }

    return {
      dependencies: this.deduplicate(dependencies),
      dependents: this.deduplicate(dependents),
    };
  }

  visitAction(action: Action): DependencyInfo {
    const actionType = Object.keys(action)[0];
    const payload = action[actionType as keyof typeof action];

    // Check for custom action visitor first
    const customVisitor = this.customActionVisitors.get(actionType);
    if (customVisitor) {
      return customVisitor.visitAction({ actionType, payload });
    }

    // Fall back to built-in action handlers with type-safe payload access
    switch (actionType) {
      case 'set': {
        const setPayload = payload as ActionPayloads['set'];
        const targetField = DependencyUtils.extractFieldName(setPayload.target);
        return {
          dependencies: [],
          dependents: targetField ? [targetField] : [],
        };
      }
      case 'copy': {
        const copyPayload = payload as ActionPayloads['copy'];
        const sourceField = DependencyUtils.extractFieldName(copyPayload.source);
        const targetField = DependencyUtils.extractFieldName(copyPayload.target);
        return {
          dependencies: sourceField ? [sourceField] : [],
          dependents: targetField ? [targetField] : [],
        };
      }
      case 'calculate': {
        const calcPayload = payload as ActionPayloads['calculate'];
        const targetField = DependencyUtils.extractFieldName(calcPayload.target);
        const formulaInfo = this.visitLogic(calcPayload.formula);
        return {
          dependencies: formulaInfo.dependencies,
          dependents: targetField ? [targetField] : [],
        };
      }
      case 'batch': {
        const batchPayload = payload as ActionPayloads['batch'];
        const dependencies: string[] = [];
        const dependents: string[] = [];
        for (const subAction of batchPayload) {
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

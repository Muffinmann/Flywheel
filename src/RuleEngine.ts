import { Logic, LogicResolver } from './LogicResolver.js';

/**
 * @fileoverview RuleEngine - simple rule evaluation with precise dependency tracking.
 * 
 * Let's start the introduction to the RuleEngine with an example:
 * ```json
 * {
 *   "foot_cup_size": [
 *     {
 *       "condition": { "==": [{ "var": "foot_guidance" }, "foot_cup"] },
 *       "action": { "set": { "target": "foot_cup_size.isVisible", "value": true } },
 *       "priority": 1,
 *       "description": "render this field only when foot_cup is selected."
 *     }
 *   ]
 * }
 * ```
 * in this example, we have defined the rule of the following logic:
 * "if the field value of 'foot_guidance' is equal to 'foot_cup', then set the visibility of the field 'foot_cup_size' to 'true'."
 * 
 * This example demonstrate the basic structure of a rule object: when the it should be applied (condition), and how it should be applied (action).
 * The "priority" property defines the execution order and by conflict (multiple rules on one field that modify the same sub-property), the rule with lower number wins.
 * The "description" property offers more human-readable interpretation of the rule.
 * 
 * **Priority Conflict Validation**: The engine validates that no two rules targeting the same field property have the same priority, throwing an error if conflicts are detected.
 * 
 * Any condition should be expressed in the form of a logic. @see LogicResolver
 * The action will take place once the condition is evaluated to "true".
 * 
 * Currently, following are built-in action types:
 * ```ts
 * interface ActionTypes {
 *   set: { target: string; value: any };           // Set field properties
 *   copy: { source: string; target: string };     // Copy between fields
 *   calculate: { target: string; formula: Logic }; // Calculate using formulas
 *   trigger: { event: string; params?: any };      // Fire custom events
 *   batch: Action[];                               // Execute multiple actions
 * }
 * ```
 * 
 * You can listen to the event via:
 * ```ts
 * const engine = new RuleEngine({
 *  onEvent: (eventType, params) => {}
 * })
 * ```
 * 
 * You can also register custom action handlers via:
 * ```ts
 * const engine = new RuleEngine()
 * const actionType = "log"
 * function customLogAction(payload: any, context: any){
 *  console.log("Rule log:", payload.message)
 * }
 * engine.registerActionHandler(actionType, customLogAction)
 * ```
 * ```json
 * {"log": {message: "rule log"}}
 * ```
 * Be careful: actions are internally managed by a `Map<ActionType, ActionHandler>`, which means if the type is same as the built-in type, it will override the built-in handler.
 * 
 * A "RuleSet" is defined as the collection of fields and their rules:
 * ```ts
 * interface RuleSet {
 *  [FieldName]: FieldRule[] 
 * }
 * ```
 * 
 * The dependencies will be tracked automatically within a "RuleSet" and the rule will be re-evaluated when dependencies change.
 * This is done via the following mechanism:
 * 1. For "loadRuleSet", the engine 
 *    a) scans the given rule set
 *    b) extracts all values of the "var" key to dependency graphs (forward and reverse).
 * ```ts
 * const engine = new RuleEngine()
 * engine.loadRuleSet(ruleSet) // a dependency graph is established internally
 * ```
 * 
 * 2. For "evaluateField", it performs dependency-first evaluation:
 *    a) Recursively evaluate all fields that this field depends on
 *    b) Evaluate the requested field using resolved dependency values
 *    c) Cache all evaluations to avoid redundant computation
 * ```ts
 * const fieldState = engine.evaluateField("foot_cup_size")
 * // Returns: { isVisible: true, isRequired: false, ... }
 * // The engine always returns the full snapshot of field state.
 * ```
 * 
 * 3. For "updateField", it:
 *    a) Updates the field value in the internally managed context
 *    b) Re-evaluates all fields depend on this field
 *    c) Invalidates all corresponding caches.
 * ```ts
 * const invalidatedFieldCaches = engine.updateField({foot_guidance: "new value"})
 * // Returns: Array of field names whose caches were invalidated.
 * 
 * // since this function accept an object, you can also update multiple fields at one time:
 * engine.updateField({
 *  foot_guidance: "new value",
 *  knee_width: 11
 * })
 * ```
 * 
 * By instantiating the RuleEngine, you should provide a field state creation function for your field state.
 * By default, only these keys are defined: "isVisible", "isRequired", "calculatedValue".
 * ```ts
 * function createFieldState(props: Record<string, unknown>) {
 *  return {
 *    "hiddenOptions": props.hiddenOptions,
 *    "readOnly": props.readOnly
 *    // ...
 *  }
 * }
 * 
 * const engine = new RuleEngine({
 *  onFieldStateCreation: createFieldState
 * })
 * ```
 * 
 * This also offers you type guard during the rule creation via:
 * ```ts
 * type ValidFieldTarget = keyof ReturnType<typeof onFieldStateCreation>; // e.g. "isVisible" | "readOnly"
 * ```
 * 
 * It ensure "target": "foo.bar" refers to a real key in the return type of createFieldState.
 *  
 * 
 * Besides the core mechanism, we also have introduced following functionalities to enhance the UX: 
 * ## Rule Reference
 * Instead of write the same rule repetitively, you can use the `{"$ref": "name_of_shared_rule"}` syntax to reference the shared rules:
 * ```json
 *{
 *  "foot_cup_size": [
 *    {
 *      "condition": { "$ref": "foot_cup_visibility" },
 *      "action": { "set": { "target": "foot_cup_size.isVisible", "value": true } },
 *      "priority": 1
 *    }
 *  ]
 *} 
 * ```
 * and these shared rules can be managed via:
 * ```ts
 * const engine = new RuleEngine()
 * engine.registerSharedRules(sharedRules)
 * engine.evaluateField("foot_cup_size") // now it will look up the shared rule by the reference "foot_cup_visibility" first and then resolve it
 * ```
 * 
 * ## Lookup table
 * It's common that front-end fields only save the key value, but by evaluation, the other properties are required, for example,
 * the field "mechanical_joint_ankle" saves only the "id" of a mechanical joint object, but in the rule, you might want:
 * ```json
 * {"var": "mechanical_joint_ankle.isBilateral"}
 * ```
 * you can use the lookup syntax:
 * ```json
 * { "lookup": ["mechanical_joints", { "var": "orthosis_ankle_joint" }, "bilateral"] }
 * ```
 * and register the table to the engine via:
 * ```ts
 * type MechanicalJointTable = {
 *  id: string, // primary key
 *  bilateral: boolean,
 *  ....
 * }
 * engine.registerLookupTables([
 *  {table: mechanicalJointTable, primaryKey: "id", name: "mechanical_joints"}
 * ])
 * ```
 * 
 * we also offer the following syntax sugar:
 * ```json
 * {"varTable": "mechanical_joint_ankle@mechanical_joints.bilateral"}
 * ```
 * 
 * ## DX
 * - There is a utility function `getDependenciesOf("fieldName")` for testing.
 * 
 * - The `debugEvaluate` can log the whole trace of evaluation (available on LogicResolver).
 * ```ts
 * const { result, trace } = engine.logicResolver.debugEvaluate(rule, context)
 * console.log(trace)
 * // {
 * //  operator: "and",
 * //  operands: [
 * //  {
 * //    operator: "equals",
 * //    operands: [
 * //      "user.age",
 * //      18,
 * //    ]
 * //    result: true
 * //  },
 * //  {
 * //    operator: "not",
 * //    operands: [
 * //      {
 * //       operator: "empty",
 * //       value: "user.name",
 * //       result: false
 * //      },
 * //    ]
 * //    result: true
 * //  },
 * //  //...
 * //  ]
 * 
 * //  result: true
 * // }
 * ```
 */
export interface FieldRule {
  condition: Logic;
  action: Action;
  priority: number;
  description?: string;
}

export interface RuleSet {
  [fieldName: string]: FieldRule[];
}

export interface ActionTypes {
  set: { target: string; value: any };
  copy: { source: string; target: string };
  calculate: { target: string; formula: Logic };
  trigger: { event: string; params?: any };
  batch: Action[];
}

export type Action = {
  [K in keyof ActionTypes]: { [P in K]: ActionTypes[K] }
}[keyof ActionTypes];

export interface LookupTable {
  table: any[];
  primaryKey: string;
}

export interface RuleEngineOptions {
  onEvent?: (eventType: string, params?: any) => void;
  onFieldStateCreation?: (props: Record<string, unknown>) => Record<string, any>;
}

export interface FieldState {
  isVisible: boolean;
  isRequired: boolean;
  calculatedValue?: any;
  [key: string]: any;
}

export class RuleEngine {
  private logicResolver: LogicResolver;
  private ruleSet: RuleSet = {};
  private sharedRules: Record<string, Logic> = {};
  private lookupTables: Map<string, LookupTable> = new Map();
  private context: Record<string, any> = {};
  private fieldStates: Map<string, FieldState> = new Map();
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private reverseDependencyGraph: Map<string, Set<string>> = new Map();
  private evaluationCache: Map<string, FieldState> = new Map();
  private customActionHandlers: Map<string, (payload: any, context: any) => void> = new Map();
  private options: RuleEngineOptions;

  constructor(options: RuleEngineOptions = {}) {
    this.logicResolver = new LogicResolver();
    this.options = options;
    this.initializeBuiltInActions();
    this.setupCustomLogic();
  }

  private initializeBuiltInActions(): void {
    this.customActionHandlers.set('set', (payload) => {
      const { target, value } = payload;
      this.setFieldProperty(target, value);
    });

    this.customActionHandlers.set('copy', (payload) => {
      const { source, target } = payload;
      const value = this.logicResolver.resolve({ var: [source] }, this.buildEvaluationContext());
      this.setFieldProperty(target, value);
    });

    this.customActionHandlers.set('calculate', (payload, context) => {
      const { target, formula } = payload;
      const value = this.logicResolver.resolve(formula, context);
      this.setFieldProperty(target, value);
    });

    this.customActionHandlers.set('trigger', (payload) => {
      const { event, params } = payload;
      this.options.onEvent?.(event, params);
    });

    this.customActionHandlers.set('batch', (payload, context) => {
      for (const action of payload) {
        this.executeAction(action, context);
      }
    });
  }

  private setupCustomLogic(): void {
    this.logicResolver.registerCustomLogic([
      {
        operator: 'varTable',
        operand: (args, context) => {
          const path = args[0];
          if (typeof path !== 'string') {
            return undefined;
          }

          if (path.includes('@')) {
            const [fieldPath, lookupSpec] = path.split('@');
            const [tableName, property] = lookupSpec.split('.');
            const keyValue = this.logicResolver.resolve({ var: [fieldPath] }, context);

            const table = this.lookupTables.get(tableName);
            if (!table) {
              throw new Error(`Lookup table '${tableName}' not found`);
            }

            const record = table.table.find(item => item[table.primaryKey] === keyValue);
            return record ? record[property] : undefined;
          }

          return this.logicResolver.resolve({ var: [path] }, context);
        }
      },
      {
        operator: 'lookup',
        operand: (args, context) => {
          if (!Array.isArray(args) || args.length < 3) {
            return undefined;
          }

          const [tableName, keyLogic, property] = args;

          if (typeof tableName !== 'string' || typeof property !== 'string') {
            return undefined;
          }

          const table = this.lookupTables.get(tableName);
          if (!table) {
            throw new Error(`Lookup table '${tableName}' not found`);
          }

          const keyValue = this.logicResolver.resolve(keyLogic, context);
          const record = table.table.find(item => item[table.primaryKey] === keyValue);

          return record ? record[property] : undefined;
        }
      }
    ]);
  }

  loadRuleSet(ruleSet: RuleSet): void {
    this.ruleSet = ruleSet;
    this.buildDependencyGraph();
    this.validateNoCycles();
  }

  registerSharedRules(sharedRules: Record<string, Logic>): void {
    this.sharedRules = { ...this.sharedRules, ...sharedRules };
  }

  registerLookupTables(tables: { table: any[]; primaryKey: string; name?: string }[]): void {
    for (const tableConfig of tables) {
      // Use explicit name if provided, otherwise derive from table structure
      const tableName = tableConfig.name || `${tableConfig.primaryKey}_table`;
      const lookupTable: LookupTable = {
        table: tableConfig.table,
        primaryKey: tableConfig.primaryKey
      };
      this.lookupTables.set(tableName, lookupTable);
    }
  }

  registerActionHandler(actionType: string, handler: (payload: any, context: any) => void): void {
    this.customActionHandlers.set(actionType, handler);
  }

  updateField(fieldUpdates: Record<string, any>): string[] {
    const invalidatedFields: string[] = [];

    for (const [fieldName, value] of Object.entries(fieldUpdates)) {
      this.context[fieldName] = value;

      const dependentFields = this.reverseDependencyGraph.get(fieldName) || new Set();
      for (const dependentField of dependentFields) {
        this.evaluationCache.delete(dependentField);
        invalidatedFields.push(dependentField);
      }
    }

    return invalidatedFields;
  }

  evaluateField(fieldName: string): FieldState {
    if (this.evaluationCache.has(fieldName)) {
      return this.evaluationCache.get(fieldName)!;
    }

    const dependencies = this.dependencyGraph.get(fieldName) || new Set();
    for (const dependency of dependencies) {
      if (dependency !== fieldName) {
        this.evaluateField(dependency);
      }
    }

    const fieldState = this.createDefaultFieldState();
    this.fieldStates.set(fieldName, fieldState);

    const rules = this.ruleSet[fieldName] || [];
    const applicableRules = this.getApplicableRules(rules);
    this.validateNoPriorityConflicts(fieldName, applicableRules);

    for (const rule of applicableRules) {
      const conditionResult = this.logicResolver.resolve(
        this.resolveSharedRules(rule.condition),
        this.buildEvaluationContext()
      );

      if (conditionResult) {
        this.executeAction(rule.action, this.buildEvaluationContext());
      }
    }

    const finalFieldState = this.fieldStates.get(fieldName)!;
    this.evaluationCache.set(fieldName, finalFieldState);
    return finalFieldState;
  }

  getDependenciesOf(fieldName: string): string[] {
    return Array.from(this.dependencyGraph.get(fieldName) || []);
  }

  private createDefaultFieldState(): FieldState {
    const defaultState: FieldState = {
      isVisible: false,
      isRequired: false,
      calculatedValue: undefined
    };

    if (this.options.onFieldStateCreation) {
      return { ...defaultState, ...this.options.onFieldStateCreation({}) };
    }

    return defaultState;
  }

  private getApplicableRules(rules: FieldRule[]): FieldRule[] {
    return rules.sort((a, b) => a.priority - b.priority);
  }

  private validateNoPriorityConflicts(fieldName: string, rules: FieldRule[]): void {
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

  private extractActionTargets(action: Action): string[] {
    const actionType = Object.keys(action)[0];
    const payload = (action as any)[actionType];

    switch (actionType) {
      case 'set':
        return [payload.target];
      case 'copy':
        return [payload.target];
      case 'calculate':
        return [payload.target];
      case 'batch':
        return payload.flatMap((subAction: Action) => this.extractActionTargets(subAction));
      default:
        return [];
    }
  }

  private buildDependencyGraph(): void {
    this.dependencyGraph.clear();
    this.reverseDependencyGraph.clear();

    for (const [fieldName, rules] of Object.entries(this.ruleSet)) {
      const dependencies = new Set<string>();

      for (const rule of rules) {
        const conditionDeps = this.extractDependencies(rule.condition);
        const actionDeps = this.extractActionDependencies(rule.action);

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

  private extractActionDependencies(action: Action): string[] {
    const actionType = Object.keys(action)[0];
    const payload = (action as any)[actionType];

    switch (actionType) {
      case 'copy':
        return [payload.source];
      case 'calculate':
        return this.extractDependencies(payload.formula);
      case 'batch':
        return payload.flatMap((subAction: Action) => this.extractActionDependencies(subAction));
      default:
        return [];
    }
  }

  private validateNoCycles(): void {
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

    for (const fieldName of Object.keys(this.ruleSet)) {
      if (hasCycle(fieldName)) {
        throw new Error(`Circular dependency detected involving field: ${fieldName}`);
      }
    }
  }

  private resolveSharedRules(logic: Logic): Logic {
    if (typeof logic === 'object' && logic !== null && !Array.isArray(logic)) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(logic)) {
        if (key === '$ref' && typeof value === 'string') {
          if (!this.sharedRules[value]) {
            throw new Error(`Shared rule '${value}' not found`);
          }
          return this.resolveSharedRules(this.sharedRules[value]);
        } else {
          resolved[key] = Array.isArray(value)
            ? value.map(item => this.resolveSharedRules(item))
            : this.resolveSharedRules(value);
        }
      }
      return resolved;
    } else if (Array.isArray(logic)) {
      return logic.map(item => this.resolveSharedRules(item)) as Logic;
    }
    return logic;
  }

  private buildEvaluationContext(): any {
    const context = { ...this.context };

    // Add field states to context so var operator can access field.isVisible etc.
    for (const [fieldName, fieldState] of this.fieldStates.entries()) {
      if (!context[fieldName] || typeof context[fieldName] !== 'object') {
        context[fieldName] = { ...fieldState };
      } else {
        context[fieldName] = { ...context[fieldName], ...fieldState };
      }
    }

    return context;
  }

  private executeAction(action: Action, context: any): void {
    const actionType = Object.keys(action)[0];
    const payload = (action as any)[actionType];

    const handler = this.customActionHandlers.get(actionType);
    if (!handler) {
      throw new Error(`Unknown action type: ${actionType}`);
    }

    handler(payload, context);
  }

  private setFieldProperty(target: string, value: any): void {
    const [fieldName, property] = target.split('.');

    if (!this.fieldStates.has(fieldName)) {
      this.fieldStates.set(fieldName, this.createDefaultFieldState());
    }

    const fieldState = this.fieldStates.get(fieldName)!;
    fieldState[property] = value;
  }

}
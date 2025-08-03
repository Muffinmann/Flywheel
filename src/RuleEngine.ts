import type { Logic } from './LogicResolver';
import { LogicResolver } from './LogicResolver';
import type { Action, ActionHandlerOptions } from './ActionHandler';
import { ActionHandler } from './ActionHandler';
import type { RuleSet } from './DependencyGraph';
import { DependencyGraph } from './DependencyGraph';
import type { FieldState } from './FieldStateManager';
import { FieldStateManager } from './FieldStateManager';
import { RuleValidator } from './RuleValidator';
import { LookupManager } from './LookupManager';
import type {
  CustomLogicDependencyVisitor,
  CustomActionDependencyVisitor,
} from './DependencyVisitor';
import { DependencyVisitor } from './DependencyVisitor';
import { CacheManager } from './CacheManager';

/**
 * @fileoverview RuleEngine - simple rule evaluation with precise dependency tracking.
 *
 * Let's start the introduction to the RuleEngine with an example:
 * ```json
 * {
 *   "foot_cup_size": [
 *     {
 *       "condition": { "==": [{ "var": "foot_guidance.value" }, "foot_cup"] },
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
 * Note: With the unified field property system, field values are accessed via "fieldName.value" and
 * field state properties via "fieldName.property" (e.g., "fieldName.isVisible").
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
 *   set: { target: string; value: any };           // Set field properties (unified for values and state)
 *   copy: { source: string; target: string };     // Copy between fields
 *   calculate: { target: string; formula: Logic }; // Calculate using formulas
 *   trigger: { event: string; params?: any };      // Fire custom events
 *   batch: Action[];                               // Execute multiple actions
 *   init: { fieldState?: Record<string, any>; fieldValue?: any }; // Initialize fields
 * }
 * ```
 *
 * ## Field Initialization
 * Fields can be initialized with default state and values using the `init` action type.
 * Init actions are processed before other rules and allow for context-aware field setup:
 *
 * ```ts
 * {
 *   "condition": { "==": [{ "var": "user.role.value" }, "premium"] },
 *   "action": {
 *     "init": {
 *       "fieldState": { "isVisible": true, "theme": "premium" },
 *       "fieldValue": "default-premium-value"
 *     }
 *   },
 *   "priority": 0  // Init actions typically use priority 0 or negative
 * }
 * ```
 *
 * The init action requires `context.currentFieldName` to identify the target field,
 * which is automatically provided during field evaluation.
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
 * 3. For "updateFieldValue", it:
 *    a) Updates the field values in the internally managed context
 *    b) Re-evaluates all fields that depend on the updated fields
 *    c) Invalidates all corresponding caches.
 * ```ts
 * const invalidatedFieldCaches = engine.updateFieldValue({foot_guidance: "new value"})
 * // Returns: Array of field names whose caches were invalidated.
 *
 * // since this function accepts an object, you can also update multiple fields at one time:
 * engine.updateFieldValue({
 *  foot_guidance: "new value",
 *  knee_width: 11
 * })
 * ```
 *
 * By instantiating the RuleEngine, you should provide a field state creation function for your field state.
 * By default, these keys are defined: "value", "isVisible", "isRequired", "calculatedValue".
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
 * {"var": "mechanical_joint_ankle.value.isBilateral"}
 * ```
 * you can use the lookup syntax:
 * ```json
 * { "lookup": ["mechanical_joints", { "var": "orthosis_ankle_joint.value" }, "bilateral"] }
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
 * {"varTable": "mechanical_joint_ankle.value@mechanical_joints.bilateral"}
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
 *
 * ## Architecture
 *
 * The RuleEngine is built with a modular architecture consisting of several key components:
 *
 * - **FieldStateManager**: Manages field states, values, and initialization tracking
 * - **CacheManager**: Handles intelligent caching and cache invalidation
 * - **DependencyGraph**: Tracks field dependencies and manages evaluation order
 * - **ActionHandler**: Processes and executes rule actions
 * - **LogicResolver**: Evaluates rule conditions and formulas
 * - **LookupManager**: Handles lookup table operations
 * - **RuleValidator**: Validates rule sets and prevents conflicts
 *
 * This separation of concerns provides better maintainability, testability, and performance.
 */
export interface RuleEngineOptions {
  onEvent?: (eventType: string, params?: any) => void;
  onFieldStateCreation?: (props: Record<string, unknown>) => Record<string, any>;
}

export class RuleEngine {
  private logicResolver: LogicResolver;

  private actionHandler: ActionHandler;

  private dependencyGraph: DependencyGraph;

  private dependencyVisitor: DependencyVisitor;

  private fieldStateManager: FieldStateManager;

  private cacheManager: CacheManager;

  private ruleValidator: RuleValidator;

  private lookupManager: LookupManager;

  private ruleSet: RuleSet = {};

  private sharedRules: Record<string, Logic> = {};

  constructor(options: RuleEngineOptions = {}) {
    this.logicResolver = new LogicResolver();

    // Initialize modules
    this.fieldStateManager = new FieldStateManager({
      onFieldStateCreation: options.onFieldStateCreation,
    });

    this.cacheManager = new CacheManager();

    this.actionHandler = new ActionHandler(this.logicResolver, {
      onEvent: options.onEvent,
      onFieldPropertySet: (target: string, value: any) => {
        const dotIndex = target.indexOf('.');

        if (dotIndex === -1) {
          throw new Error(
            `Invalid target format: ${target}. Expected format: "fieldName.property"`
          );
        }

        const fieldName = target.substring(0, dotIndex);

        // Use unified setFieldProperty for both value and state properties
        this.fieldStateManager.setFieldProperty(target, value);
        const invalidatedFields = this.dependencyGraph.getInvalidatedFields([fieldName]);
        this.cacheManager.invalidate(invalidatedFields);
      },
      onFieldInit: (fieldName: string, fieldState?: Record<string, any>, fieldValue?: any) => {
        this.fieldStateManager.initializeField(fieldName, fieldState);
        if (fieldValue !== undefined) {
          this.fieldStateManager.setFieldProperty(`${fieldName}.value`, fieldValue);
        }
      },
    });

    this.dependencyVisitor = new DependencyVisitor(this.sharedRules);
    this.dependencyGraph = new DependencyGraph(this.dependencyVisitor);
    this.ruleValidator = new RuleValidator(this.extractActionTargets.bind(this));
    this.lookupManager = new LookupManager(this.logicResolver);
  }

  getLogicResolver(): LogicResolver {
    return this.logicResolver;
  }

  loadRuleSet(ruleSet: RuleSet): void {
    this.ruleSet = ruleSet;
    this.dependencyGraph.buildFromRuleSet(ruleSet);
    this.dependencyGraph.validateNoCycles(ruleSet);
  }

  registerSharedRules(sharedRules: Record<string, Logic>): void {
    this.sharedRules = { ...this.sharedRules, ...sharedRules };
    this.dependencyVisitor.updateSharedRules(this.sharedRules);
  }

  registerLookupTables(tables: { table: any[]; primaryKey: string; name?: string }[]): void {
    this.lookupManager.registerLookupTables(tables);
  }

  registerActionHandler(params: {
    actionType: string;
    handler: (payload: any, context: any, helpers?: ActionHandlerOptions) => void;
    dependencyVisitor?: CustomActionDependencyVisitor;
  }): void {
    this.actionHandler.registerActionHandler(params.actionType, params.handler);

    // Register the dependency visitor if provided
    if (params.dependencyVisitor) {
      this.dependencyVisitor.registerActionVisitor(params.actionType, params.dependencyVisitor);
    }
  }

  registerCustomLogic(params: {
    operator: string;
    handler: (args: any[], context: any) => any;
    dependencyVisitor?: CustomLogicDependencyVisitor;
  }): void {
    // Register with LogicResolver for execution
    this.logicResolver.registerCustomLogic([
      {
        operator: params.operator,
        operand: params.handler,
      },
    ]);

    // Register the dependency visitor if provided
    if (params.dependencyVisitor) {
      this.dependencyVisitor.registerLogicVisitor(params.operator, params.dependencyVisitor);
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
      case 'init':
        // Init action doesn't have a target as it applies to the field itself
        return [];
      default:
        return [];
    }
  }

  updateFieldValue(fieldUpdates: Record<string, any>): string[] {
    for (const [fieldName, value] of Object.entries(fieldUpdates)) {
      this.fieldStateManager.setFieldProperty(`${fieldName}.value`, value);
    }

    const invalidatedFields = this.dependencyGraph.getInvalidatedFields(Object.keys(fieldUpdates));
    this.cacheManager.invalidate(invalidatedFields);

    return invalidatedFields;
  }

  getFieldValue(fieldName: string): any {
    return this.fieldStateManager.getFieldProperty(`${fieldName}.value`);
  }

  evaluateField(fieldName: string): FieldState {
    // Check if we have a valid cached evaluation
    if (this.cacheManager.isValid(fieldName)) {
      return this.fieldStateManager.getFieldState(fieldName)!;
    }

    const dependencies = this.dependencyGraph.getDependencies(fieldName);
    for (const dependency of dependencies) {
      if (dependency !== fieldName && this.ruleSet[dependency]) {
        // Only evaluate dependencies that have rules
        this.evaluateField(dependency);
      }
    }

    this.fieldStateManager.ensureFieldState(fieldName);

    const rules = this.ruleSet[fieldName] || [];
    const applicableRules = this.ruleValidator.sortRulesByPriority(rules);
    this.ruleValidator.validateNoPriorityConflicts(fieldName, applicableRules);

    // Check if field needs initialization
    if (!this.fieldStateManager.isFieldInitialized(fieldName)) {
      // Find and execute init actions first
      const initRules = applicableRules.filter((rule) => {
        const actionType = Object.keys(rule.action)[0];
        return actionType === 'init';
      });

      for (const rule of initRules) {
        // The 'init' action handler in 'ActionHandler' requires 'context.currentFieldName' to know which field it's initializing.
        const context = { ...this.buildEvaluationContext(), currentFieldName: fieldName };
        const conditionResult = this.logicResolver.resolve(
          this.resolveSharedRules(rule.condition),
          context
        );

        if (conditionResult) {
          const resolvedAction = this.resolveSharedRulesInAction(rule.action);
          this.actionHandler.executeAction(resolvedAction, context);
        }
      }
    }

    // Execute non-init actions
    const nonInitRules = applicableRules.filter((rule) => {
      const actionType = Object.keys(rule.action)[0];
      return actionType !== 'init';
    });

    for (const rule of nonInitRules) {
      const context = this.buildEvaluationContext();
      const conditionResult = this.logicResolver.resolve(
        this.resolveSharedRules(rule.condition),
        context
      );

      if (conditionResult) {
        const resolvedAction = this.resolveSharedRulesInAction(rule.action);
        this.actionHandler.executeAction(resolvedAction, context);
      }
    }

    const finalFieldState = this.fieldStateManager.getFieldState(fieldName)!;
    this.cacheManager.markAsValid(fieldName);
    return finalFieldState;
  }

  getDependenciesOf(fieldName: string): string[] {
    return this.dependencyGraph.getDependencies(fieldName);
  }

  private buildEvaluationContext(): any {
    return this.fieldStateManager.buildEvaluationContext();
  }

  private resolveSharedRules(logic: Logic): Logic {
    if (typeof logic === 'object' && logic !== null && !Array.isArray(logic)) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(logic)) {
        if (key === '$ref' && typeof value === 'string') {
          this.ruleValidator.validateSharedRuleExists(value, this.sharedRules);
          return this.resolveSharedRules(this.sharedRules[value]);
        }
        resolved[key] = Array.isArray(value)
          ? value.map((item) => this.resolveSharedRules(item))
          : this.resolveSharedRules(value);
      }
      return resolved;
    }
    if (Array.isArray(logic)) {
      return logic.map((item) => this.resolveSharedRules(item)) as Logic;
    }
    return logic;
  }

  private resolveSharedRulesInAction(action: any): any {
    if (typeof action === 'object' && action !== null && !Array.isArray(action)) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(action)) {
        if (key === 'formula' && typeof value === 'object') {
          // Resolve shared rules in formula using the same logic as conditions
          resolved[key] = this.resolveSharedRules(value);
        } else if (Array.isArray(value)) {
          // Handle batch actions
          resolved[key] = value.map((item) => this.resolveSharedRulesInAction(item));
        } else if (typeof value === 'object' && value !== null) {
          resolved[key] = this.resolveSharedRulesInAction(value);
        } else {
          resolved[key] = value;
        }
      }
      return resolved;
    }
    if (Array.isArray(action)) {
      return action.map((item) => this.resolveSharedRulesInAction(item));
    }
    return action;
  }
}

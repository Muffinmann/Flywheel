import { Logic, LogicResolver } from './LogicResolver.js';
import { ActionHandler } from './ActionHandler.js';
import { DependencyGraph, RuleSet } from './DependencyGraph.js';
import { FieldStateManager, FieldState } from './FieldStateManager.js';
import { RuleValidator } from './RuleValidator.js';
import { LookupManager } from './LookupManager.js';
import { DefaultDependencyVisitor } from './DefaultDependencyVisitor.js';

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
// Re-export interfaces from modules for backward compatibility
export { FieldRule, RuleSet } from './DependencyGraph.js';

// Re-export types from modules for backward compatibility
export { ActionTypes, Action } from './ActionHandler.js';
export { FieldState } from './FieldStateManager.js';
export { LookupTable } from './LookupManager.js';

export interface RuleEngineOptions {
  onEvent?: (eventType: string, params?: any) => void;
  onFieldStateCreation?: (props: Record<string, unknown>) => Record<string, any>;
}

export class RuleEngine {
  private logicResolver: LogicResolver;
  private actionHandler: ActionHandler;
  private dependencyGraph: DependencyGraph;
  private dependencyVisitor: DefaultDependencyVisitor;
  private fieldStateManager: FieldStateManager;
  private ruleValidator: RuleValidator;
  private lookupManager: LookupManager;
  private ruleSet: RuleSet = {};
  private sharedRules: Record<string, Logic> = {};
  private context: Record<string, any> = {};
  private options: RuleEngineOptions;

  constructor(options: RuleEngineOptions = {}) {
    this.logicResolver = new LogicResolver();
    this.options = options;

    // Initialize modules
    this.fieldStateManager = new FieldStateManager({
      onFieldStateCreation: options.onFieldStateCreation
    });

    this.actionHandler = new ActionHandler(this.logicResolver, {
      onEvent: options.onEvent,
      onFieldPropertySet: (target, value) => {
        this.fieldStateManager.setFieldProperty(target, value);

        // Extract field name from target (format: "fieldName.property") 
        const dotIndex = target.indexOf('.');
        if (dotIndex !== -1) {
          const fieldName = target.substring(0, dotIndex);
          // Invalidate cache for fields that depend on this field
          const invalidatedFields = this.dependencyGraph.getInvalidatedFields([fieldName]);
          this.fieldStateManager.invalidateCache(invalidatedFields);
        }
      }
    });

    this.dependencyVisitor = new DefaultDependencyVisitor(this.sharedRules);
    this.dependencyGraph = new DependencyGraph(this.dependencyVisitor);
    this.ruleValidator = new RuleValidator((action) => this.actionHandler.extractActionTargets(action));
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

  registerActionHandler(actionType: string, handler: (payload: any, context: any) => void): void {
    this.actionHandler.registerActionHandler(actionType, handler);
  }

  updateField(fieldUpdates: Record<string, any>): string[] {
    for (const [fieldName, value] of Object.entries(fieldUpdates)) {
      this.context[fieldName] = value;
    }

    const invalidatedFields = this.dependencyGraph.getInvalidatedFields(Object.keys(fieldUpdates));
    this.fieldStateManager.invalidateCache(invalidatedFields);

    return invalidatedFields;
  }

  evaluateField(fieldName: string): FieldState {
    const cached = this.fieldStateManager.getCachedEvaluation(fieldName);
    if (cached) {
      return cached;
    }

    const dependencies = this.dependencyGraph.getDependencies(fieldName);
    for (const dependency of dependencies) {
      if (dependency !== fieldName && this.ruleSet[dependency]) {
        // Only evaluate dependencies that have rules
        this.evaluateField(dependency);
      }
    }

    const fieldState = this.fieldStateManager.createDefaultFieldState();
    this.fieldStateManager.setFieldState(fieldName, fieldState);

    const rules = this.ruleSet[fieldName] || [];
    const applicableRules = this.ruleValidator.sortRulesByPriority(rules);
    this.ruleValidator.validateNoPriorityConflicts(fieldName, applicableRules);

    for (const rule of applicableRules) {
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
    this.fieldStateManager.setCachedEvaluation(fieldName, finalFieldState);
    return finalFieldState;
  }

  getDependenciesOf(fieldName: string): string[] {
    return this.dependencyGraph.getDependencies(fieldName);
  }

  private buildEvaluationContext(): any {
    return this.fieldStateManager.buildEvaluationContext(this.context);
  }

  private resolveSharedRules(logic: Logic): Logic {
    if (typeof logic === 'object' && logic !== null && !Array.isArray(logic)) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(logic)) {
        if (key === '$ref' && typeof value === 'string') {
          this.ruleValidator.validateSharedRuleExists(value, this.sharedRules);
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

  private resolveSharedRulesInAction(action: any): any {
    if (typeof action === 'object' && action !== null && !Array.isArray(action)) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(action)) {
        if (key === 'formula' && typeof value === 'object') {
          // Resolve shared rules in formula using the same logic as conditions
          resolved[key] = this.resolveSharedRules(value);
        } else if (Array.isArray(value)) {
          // Handle batch actions
          resolved[key] = value.map(item => this.resolveSharedRulesInAction(item));
        } else if (typeof value === 'object' && value !== null) {
          resolved[key] = this.resolveSharedRulesInAction(value);
        } else {
          resolved[key] = value;
        }
      }
      return resolved;
    } else if (Array.isArray(action)) {
      return action.map(item => this.resolveSharedRulesInAction(item));
    }
    return action;
  }
}
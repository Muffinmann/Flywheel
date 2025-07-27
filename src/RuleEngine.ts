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
 * {table: mechanicalJointTable, primaryKey: "id"}
 * ])
 * ```
 * 
 * we also offer the following syntax sugar:
 * ```json
 * {"var": "mechanical_joint_ankle@mechanical_joints.bilateral"}
 * ```
 * 
 * ## DX
 * - There is a utility function `getDependenciesOf("fieldName")` for testing.
 * 
 * - The `debugEvaluate` can log the whole trace of evaluation.
 * ```ts
 * const { result, trace } = logicResolver.debugEvaluate(rule, context)
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
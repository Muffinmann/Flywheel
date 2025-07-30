import { Logic, LogicResolver } from './LogicResolver.js';
import { ActionHandler, Action } from './ActionHandler.js';
import { DependencyGraph, RuleSet, FieldRule } from './DependencyGraph.js';
import { FieldStateProvider, FieldState } from './FieldStateProvider.js';
import { ContextProvider } from './ContextProvider.js';
import { RuleValidator } from './RuleValidator.js';
import { LookupManager } from './LookupManager.js';
import { DefaultDependencyVisitor } from './DefaultDependencyVisitor.js';
import { fieldStateOperator } from './FieldStateOperators.js';

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
 *   set: { target: string; value: any };                    // Set field values
 *   setState: { target: string; value: any };               // Set field state properties
 *   copy: { source: string; target: string };              // Copy between fields
 *   calculate: { target: string; formula: Logic };         // Calculate field values
 *   calculateState: { target: string; formula: Logic };    // Calculate field state properties
 *   trigger: { event: string; params?: any };              // Fire custom events
 *   batch: Action[];                                        // Execute multiple actions
 *   init: {                                                 // Initialize field state/value
 *     fieldState?: Record<string, any>;                    // Initial state properties
 *     fieldValue?: any;                                    // Initial field value
 *     merge?: boolean;                                     // Merge with defaults (default: true)
 *   };
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
 * You can also register custom actions via:
 * ```ts
 * const engine = new RuleEngine()
 * 
 * engine.registerCustomAction('log', {
 *   handler: (payload, context) => {
 *     console.log("Rule log:", payload.message)
 *   },
 *   targetExtractor: (payload) => [] // log actions don't target fields
 * })
 * 
 * // For actions that modify field properties
 * engine.registerCustomAction('multiSet', {
 *   handler: (payload, context) => {
 *     for (const { target, value } of payload.targets) {
 *       // Set multiple field properties
 *     }
 *   },
 *   targetExtractor: (payload) => payload.targets.map(t => t.target)
 * })
 * ```
 * ```json
 * {"log": {message: "rule log"}}
 * {"multiSet": {targets: [{target: "field1.prop", value: true}]}}
 * ```
 * Both the handler and targetExtractor are required for proper conflict detection and dependency tracking.
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
 * ## Context Provider Architecture
 * 
 * The RuleEngine now uses a modular context provider system that allows different types of context
 * to be contributed by separate modules. This makes the system more extensible and follows the
 * Open/Closed Principle.
 * 
 * ### Field State Provider
 * Field state (visibility, required status, calculated values) is now provided by the FieldStateProvider,
 * which implements the ContextProvider interface. By default, the engine includes a FieldStateProvider
 * for backward compatibility.
 * 
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
 * ### Custom Context Providers
 * You can register additional context providers to contribute different types of context:
 * 
 * ```ts
 * class PermissionProvider implements ContextProvider {
 *   getNamespace(): string {
 *     return 'permissions';
 *   }
 * 
 *   contributeToContext(baseContext: Record<string, any>): Record<string, any> {
 *     return {
 *       ...baseContext,
 *       permissions: this.getUserPermissions()
 *     };
 *   }
 * 
 *   handlePropertySet(target: string, value: any): void {
 *     // Handle permission-related property changes
 *   }
 * }
 * 
 * const permissionProvider = new PermissionProvider();
 * const engine = new RuleEngine({
 *   contextProviders: [permissionProvider]
 * });
 * 
 * // Or register after creation
 * engine.registerContextProvider(permissionProvider);
 * ```
 * 
 * This allows rules to access permission context:
 * ```json
 * {
 *   "condition": { "==": [{ "var": "permissions.canEdit" }, true] },
 *   "action": { "setState": { "target": "editButton.isVisible", "value": true } }
 * }
 * ```
 * 
 * ### Type Safety
 * Type guards can be created for field state properties:
 * ```ts
 * type ValidFieldTarget = keyof ReturnType<typeof onFieldStateCreation>; // e.g. "isVisible" | "readOnly"
 * ```
 * 
 * It ensures "target": "foo.bar" refers to a real key in the return type of createFieldState.
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
export interface RuleEngineOptions {
  onEvent?: (eventType: string, params?: any) => void;
  onFieldStateCreation?: (props: Record<string, unknown>) => Record<string, any>;
  contextProviders?: ContextProvider[];
}

export interface CustomActionConfig {
  handler: (payload: any, context: any) => void;
  targetExtractor: (payload: any) => string[];
}

export class RuleEngine {
  private logicResolver: LogicResolver;
  private actionHandler: ActionHandler;
  private dependencyGraph: DependencyGraph;
  private dependencyVisitor: DefaultDependencyVisitor;
  private contextProviders: ContextProvider[] = [];
  private fieldStateProvider: FieldStateProvider;
  private ruleValidator: RuleValidator;
  private lookupManager: LookupManager;
  private ruleSet: RuleSet = {};
  private sharedRules: Record<string, Logic> = {};
  private context: Record<string, any> = {};
  private options: RuleEngineOptions;
  private actionTargetExtractors: Map<string, (payload: any) => string[]> = new Map();
  private currentEvaluatingField: string | null = null;

  constructor(options: RuleEngineOptions = {}) {
    this.logicResolver = new LogicResolver();
    this.options = options;

    // Initialize field state provider
    this.fieldStateProvider = new FieldStateProvider({
      onFieldStateCreation: options.onFieldStateCreation
    });
    
    // Register provided context providers
    if (options.contextProviders) {
      this.contextProviders = [...options.contextProviders];
    }
    
    // Register field state provider by default for backward compatibility
    this.contextProviders.push(this.fieldStateProvider);

    this.actionHandler = new ActionHandler(this.logicResolver, {
      onEvent: options.onEvent,
      onFieldValueSet: (target, value) => {
        // Setting field values in the context
        this.context[target] = value;
        
        // Invalidate cache for fields that depend on this field
        const invalidatedFields = this.dependencyGraph.getInvalidatedFields([target]);
        this.invalidateAllCaches(invalidatedFields);
      },
      onFieldStateSet: (target, value) => {
        // Setting field state properties - delegate to context providers
        this.setFieldStateProperty(target, value);

        // Extract field name from target (format: "fieldName.property") 
        const dotIndex = target.indexOf('.');
        if (dotIndex !== -1) {
          const fieldName = target.substring(0, dotIndex);
          // Invalidate cache for fields that depend on this field
          const invalidatedFields = this.dependencyGraph.getInvalidatedFields([fieldName]);
          this.invalidateAllCaches(invalidatedFields);
        }
      }
    });

    this.dependencyVisitor = new DefaultDependencyVisitor(this.sharedRules);
    this.dependencyGraph = new DependencyGraph(this.dependencyVisitor);
    this.ruleValidator = new RuleValidator(this.extractActionTargets.bind(this));
    this.lookupManager = new LookupManager(this.logicResolver);

    // Register built-in custom operators
    this.logicResolver.registerCustomLogic([
      { operator: 'fieldState', operand: fieldStateOperator }
    ]);

    // Register built-in actions
    this.initializeBuiltInActions();
  }

  private initializeBuiltInActions(): void {
    // Register all built-in actions with their handlers and target extractors
    this.registerCustomAction('set', {
      handler: (payload) => {
        this.context[payload.target] = payload.value;
        const invalidatedFields = this.dependencyGraph.getInvalidatedFields([payload.target]);
        this.invalidateAllCaches(invalidatedFields);
      },
      targetExtractor: (payload) => [payload.target]
    });

    this.registerCustomAction('setState', {
      handler: (payload) => {
        this.setFieldStateProperty(payload.target, payload.value);
        const dotIndex = payload.target.indexOf('.');
        if (dotIndex !== -1) {
          const fieldName = payload.target.substring(0, dotIndex);
          const invalidatedFields = this.dependencyGraph.getInvalidatedFields([fieldName]);
          this.invalidateAllCaches(invalidatedFields);
        }
      },
      targetExtractor: (payload) => [payload.target]
    });

    this.registerCustomAction('copy', {
      handler: (payload, context) => {
        const value = this.getFieldValue(payload.source, context);
        this.context[payload.target] = value;
        const invalidatedFields = this.dependencyGraph.getInvalidatedFields([payload.target]);
        this.invalidateAllCaches(invalidatedFields);
      },
      targetExtractor: (payload) => [payload.target]
    });

    this.registerCustomAction('calculate', {
      handler: (payload, context) => {
        const value = this.logicResolver.resolve(payload.formula, context);
        this.context[payload.target] = value;
        const invalidatedFields = this.dependencyGraph.getInvalidatedFields([payload.target]);
        this.invalidateAllCaches(invalidatedFields);
      },
      targetExtractor: (payload) => [payload.target]
    });

    this.registerCustomAction('calculateState', {
      handler: (payload, context) => {
        const value = this.logicResolver.resolve(payload.formula, context);
        this.setFieldStateProperty(payload.target, value);
        const dotIndex = payload.target.indexOf('.');
        if (dotIndex !== -1) {
          const fieldName = payload.target.substring(0, dotIndex);
          const invalidatedFields = this.dependencyGraph.getInvalidatedFields([fieldName]);
          this.invalidateAllCaches(invalidatedFields);
        }
      },
      targetExtractor: (payload) => [payload.target]
    });

    this.registerCustomAction('trigger', {
      handler: (payload) => {
        this.options.onEvent?.(payload.event, payload.params);
      },
      targetExtractor: () => [] // trigger actions don't target fields
    });

    this.registerCustomAction('batch', {
      handler: (payload, context) => {
        for (const action of payload) {
          this.actionHandler.executeAction(action, context);
        }
      },
      targetExtractor: (payload) => payload.flatMap((subAction: Action) => this.extractActionTargets(subAction))
    });

    this.registerCustomAction('init', {
      handler: (payload) => {
        const { fieldState, fieldValue, merge = true } = payload;
        
        if (!this.currentEvaluatingField) {
          throw new Error('Init action called outside of field evaluation context');
        }
        
        const fieldName = this.currentEvaluatingField;
        
        if (fieldState) {
          const currentState = this.fieldStateProvider.getFieldState(fieldName);
          if (!currentState) {
            throw new Error(`Field state not found for ${fieldName}`);
          }
          
          let newState;
          if (merge) {
            // Merge with current state (which includes custom defaults)
            newState = { ...currentState, ...fieldState };
          } else {
            // Start with base defaults only (not custom defaults)
            const baseDefaults = {
              isVisible: false,
              isRequired: false,
              calculatedValue: undefined
            };
            newState = { ...baseDefaults, ...fieldState };
          }
          
          this.fieldStateProvider.setFieldState(fieldName, newState);
        }
        
        if (fieldValue !== undefined) {
          this.context[fieldName] = fieldValue;
        }
      },
      targetExtractor: () => [] // Init doesn't target other fields
    });
  }

  private getFieldValue(path: string, context: any): any {
    if (path.includes('@')) {
      // Handle lookup table syntax
      const [fieldPath, lookupSpec] = path.split('@');
      const [tableName, property] = lookupSpec.split('.');
      const keyValue = this.logicResolver.resolve({ var: [fieldPath] }, context);
      
      // Get lookup table and resolve the value
      const table = this.lookupManager.getLookupTable(tableName);
      if (!table) {
        throw new Error(`Lookup table '${tableName}' not found`);
      }
      
      const record = table.table.find(item => item[table.primaryKey] === keyValue);
      return record ? record[property] : undefined;
    }
    
    return this.logicResolver.resolve({ var: [path] }, context);
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

  /**
   * Register a custom action with both its handler and target extractor.
   * This ensures proper conflict detection and dependency tracking for custom actions.
   * 
   * @param actionType - The action type identifier
   * @param config - Configuration containing both handler and target extractor
   * 
   * @example
   * ```ts
   * engine.registerCustomAction('multiSet', {
   *   handler: (payload, context) => {
   *     for (const { target, value } of payload.targets) {
   *       // Set multiple field properties
   *       engine.setFieldProperty(target, value);
   *     }
   *   },
   *   targetExtractor: (payload) => payload.targets.map(t => t.target)
   * });
   * ```
   */
  registerCustomAction(actionType: string, config: CustomActionConfig): void {
    this.actionHandler.registerActionHandler(actionType, config.handler);
    this.actionTargetExtractors.set(actionType, config.targetExtractor);
  }

  private extractActionTargets(action: Action): string[] {
    const actionType = Object.keys(action)[0];
    const payload = (action as any)[actionType];

    // Use registered extractor if available
    const extractor = this.actionTargetExtractors.get(actionType);
    if (extractor) {
      return extractor(payload);
    }

    // Fallback: return empty array for unknown action types
    // This allows custom actions to exist without target extraction if not needed
    return [];
  }

  /**
   * Register a context provider with the engine.
   * Context providers can contribute additional context for rule evaluation.
   * 
   * @param provider - The context provider to register
   */
  registerContextProvider(provider: ContextProvider): void {
    this.contextProviders.push(provider);
  }

  /**
   * Get all registered context providers.
   * 
   * @returns Array of registered context providers
   */
  getContextProviders(): ContextProvider[] {
    return [...this.contextProviders];
  }

  /**
   * Set a field state property by delegating to appropriate context providers.
   * 
   * @param target - The target property path (e.g., "fieldName.property")
   * @param value - The value to set
   */
  private setFieldStateProperty(target: string, value: any): void {
    // Delegate to all context providers that handle property setting
    for (const provider of this.contextProviders) {
      if (provider.handlePropertySet) {
        provider.handlePropertySet(target, value);
      }
    }
    
  }

  /**
   * Invalidate caches across all context providers.
   * 
   * @param fieldNames - Array of field names to invalidate
   */
  private invalidateAllCaches(fieldNames: string[]): void {
    // Invalidate caches in all context providers
    for (const provider of this.contextProviders) {
      if (provider.invalidateCache) {
        provider.invalidateCache(fieldNames);
      }
    }
    
  }

  updateField(fieldUpdates: Record<string, any>): string[] {
    for (const [fieldName, value] of Object.entries(fieldUpdates)) {
      this.context[fieldName] = value;
    }

    const invalidatedFields = this.dependencyGraph.getInvalidatedFields(Object.keys(fieldUpdates));
    this.invalidateAllCaches(invalidatedFields);

    return invalidatedFields;
  }

  evaluateField(fieldName: string): FieldState {
    // Check cache in field state provider first (new architecture)
    const cachedNew = this.fieldStateProvider.getCachedValue(fieldName);
    if (cachedNew) {
      return cachedNew;
    }
    
    // Set current evaluating field
    this.currentEvaluatingField = fieldName;

    try {
      const dependencies = this.dependencyGraph.getDependencies(fieldName);
      for (const dependency of dependencies) {
        if (dependency !== fieldName && this.ruleSet[dependency]) {
          // Only evaluate dependencies that have rules
          this.evaluateField(dependency);
        }
      }

      // Create default field state using new provider
      const fieldState = this.fieldStateProvider.createDefaultFieldState();
      this.fieldStateProvider.setFieldState(fieldName, fieldState);

      const rules = this.ruleSet[fieldName] || [];
      
      // Separate init rules from regular rules
      const initRules: FieldRule[] = [];
      const regularRules: FieldRule[] = [];
      
      for (const rule of rules) {
        if ('init' in rule.action) {
          initRules.push(rule);
        } else {
          regularRules.push(rule);
        }
      }
      
      // Process init rules first (sorted by priority)
      const sortedInitRules = this.ruleValidator.sortRulesByPriority(initRules);
      this.ruleValidator.validateInitRules(fieldName, sortedInitRules);
      
      for (const rule of sortedInitRules) {
        // Validate init action structure
        this.ruleValidator.validateInitActionStructure(rule.action);
        
        const context = this.buildEvaluationContext();
        const conditionResult = this.logicResolver.resolve(
          this.resolveSharedRules(rule.condition),
          context
        );

        if (conditionResult) {
          const resolvedAction = this.resolveSharedRulesInAction(rule.action);
          this.actionHandler.executeAction(resolvedAction, context);
          break; // Only apply first matching init rule
        }
      }

      // Process regular rules
      const sortedRegularRules = this.ruleValidator.sortRulesByPriority(regularRules);
      this.ruleValidator.validateNoPriorityConflicts(fieldName, sortedRegularRules);

      for (const rule of sortedRegularRules) {
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

      // Get final field state from new provider
      const finalFieldState = this.fieldStateProvider.getFieldState(fieldName)!;
      this.fieldStateProvider.setCachedValue(fieldName, finalFieldState);
      
      return finalFieldState;
    } finally {
      // Clear current evaluating field
      this.currentEvaluatingField = null;
    }
  }

  getDependenciesOf(fieldName: string): string[] {
    return this.dependencyGraph.getDependencies(fieldName);
  }

  private buildEvaluationContext(): any {
    // Start with base context (field values)
    let context = { ...this.context };
    
    // Aggregate context from all providers
    for (const provider of this.contextProviders) {
      context = provider.contributeToContext(context);
    }
    
    return context;
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
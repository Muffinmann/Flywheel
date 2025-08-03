import type { Logic, LogicResolver } from './LogicResolver.js';

export interface ActionTypes {
  set: { target: string; value: unknown };
  copy: { source: string; target: string };
  calculate: { target: string; formula: Logic };
  trigger: { event: string; params?: unknown };
  batch: Action[];
  init: { fieldState?: Record<string, unknown>; fieldValue?: unknown };
}

// Discriminated union type for actions
export type Action = {
  [K in keyof ActionTypes]: { [P in K]: ActionTypes[K] };
}[keyof ActionTypes];

// Context type for action execution
export interface ActionContext {
  currentFieldName?: string;
  [key: string]: unknown;
}

// Type-safe action handler function signatures
export type ActionHandlerFunction<T = unknown> = (
  payload: T,
  context: ActionContext,
  helpers?: ActionHandlerOptions
) => void;

// Built-in action handler type with proper typing
type BuiltInActionHandlers = {
  [K in keyof ActionTypes]: ActionHandlerFunction<ActionTypes[K]>;
};

// Options for action execution
export interface ActionHandlerOptions {
  onEvent?: (eventType: string, params?: unknown) => void;
  onFieldPropertySet?: (target: string, value: unknown) => void;
  onFieldInit?: (
    fieldName: string,
    fieldState?: Record<string, unknown>,
    fieldValue?: unknown
  ) => void;
}

export class ActionHandler {
  private actionHandlers: Map<string, ActionHandlerFunction> = new Map();

  private logicResolver: LogicResolver;

  private options: ActionHandlerOptions;

  constructor(logicResolver: LogicResolver, options: ActionHandlerOptions = {}) {
    this.logicResolver = logicResolver;
    this.options = options;
    this.initializeBuiltInActions();
  }

  private initializeBuiltInActions(): void {
    // Type-safe built-in action handlers
    const builtInHandlers: BuiltInActionHandlers = {
      set: (payload) => {
        const { target, value } = payload;
        this.options.onFieldPropertySet?.(target, value);
      },

      copy: (payload, context) => {
        const { source, target } = payload;
        const value = this.logicResolver.resolve({ var: [source] }, context);
        this.options.onFieldPropertySet?.(target, value);
      },

      calculate: (payload, context) => {
        const { target, formula } = payload;
        const value = this.logicResolver.resolve(formula, context);
        this.options.onFieldPropertySet?.(target, value);
      },

      trigger: (payload) => {
        const { event, params } = payload;
        this.options.onEvent?.(event, params);
      },

      batch: (payload, context) => {
        for (const action of payload) {
          this.executeAction(action, context);
        }
      },

      init: (payload, context) => {
        const { fieldState, fieldValue } = payload;
        const fieldName = context.currentFieldName;
        if (!fieldName) {
          throw new Error('Init action requires field name in context.currentFieldName');
        }
        this.options.onFieldInit?.(fieldName, fieldState, fieldValue);
      },
    };

    // Register all built-in handlers
    Object.entries(builtInHandlers).forEach(([actionType, handler]) => {
      this.actionHandlers.set(actionType, handler as ActionHandlerFunction);
    });
  }

  /**
   * Register a custom action handler
   * @param actionType - The action type identifier
   * @param handler - The handler function for this action type
   */
  registerActionHandler<T = unknown>(actionType: string, handler: ActionHandlerFunction<T>): void {
    // Check if handler expects the helpers parameter by checking its length
    if (handler.length >= 3) {
      // Handler expects helpers, wrap it to pass the options
      this.actionHandlers.set(actionType, (payload, context) => {
        handler(payload as T, context, this.options);
      });
    } else {
      // Handler doesn't expect helpers, use it directly for backward compatibility
      this.actionHandlers.set(actionType, handler as ActionHandlerFunction);
    }
  }
  /**
   * Execute an action with the given context
   * @param action - The action to execute
   * @param context - The execution context
   * @throws Error if action type is unknown
   */
  executeAction(action: Action, context: ActionContext): void {
    const actionType = Object.keys(action)[0];
    const payload = action[actionType as keyof typeof action];

    const handler = this.actionHandlers.get(actionType);
    if (!handler) {
      throw new Error(`Unknown action type: ${actionType}`);
    }

    handler(payload, context);
  }

  /**
   * Check if an action type is registered
   * @param actionType - The action type to check
   * @returns true if the action type has a handler
   */
  hasActionHandler(actionType: string): boolean {
    return this.actionHandlers.has(actionType);
  }

  /**
   * Get all registered action types
   * @returns Array of registered action type names
   */
  getRegisteredActionTypes(): string[] {
    return Array.from(this.actionHandlers.keys());
  }
}

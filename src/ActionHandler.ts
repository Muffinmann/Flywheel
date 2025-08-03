import type { Logic, LogicResolver } from './LogicResolver.js';

export interface ActionTypes {
  set: { target: string; value: any };
  copy: { source: string; target: string };
  calculate: { target: string; formula: Logic };
  trigger: { event: string; params?: any };
  batch: Action[];
  init: { fieldState?: Record<string, any>; fieldValue?: any };
}

export type Action = {
  [K in keyof ActionTypes]: { [P in K]: ActionTypes[K] };
}[keyof ActionTypes];

export interface ActionHandlerOptions {
  onEvent?: (eventType: string, params?: any) => void;
  onFieldPropertySet?: (target: string, value: any) => void;
  onFieldInit?: (fieldName: string, fieldState?: Record<string, any>, fieldValue?: any) => void;
}

export class ActionHandler {
  private actionHandlers: Map<string, (payload: any, context: any) => void> = new Map();

  private logicResolver: LogicResolver;

  private options: ActionHandlerOptions;

  constructor(logicResolver: LogicResolver, options: ActionHandlerOptions = {}) {
    this.logicResolver = logicResolver;
    this.options = options;
    this.initializeBuiltInActions();
  }

  private initializeBuiltInActions(): void {
    // Unified set operation - handles both field values and state properties
    this.actionHandlers.set('set', (payload) => {
      const { target, value } = payload;
      this.options.onFieldPropertySet?.(target, value);
    });

    this.actionHandlers.set('copy', (payload, context) => {
      const { source, target } = payload;
      const value = this.logicResolver.resolve({ var: [source] }, context);
      this.options.onFieldPropertySet?.(target, value);
    });

    this.actionHandlers.set('calculate', (payload, context) => {
      const { target, formula } = payload;
      const value = this.logicResolver.resolve(formula, context);

      this.options.onFieldPropertySet?.(target, value);
    });

    this.actionHandlers.set('trigger', (payload) => {
      const { event, params } = payload;
      this.options.onEvent?.(event, params);
    });

    this.actionHandlers.set('batch', (payload, context) => {
      for (const action of payload) {
        this.executeAction(action, context);
      }
    });

    this.actionHandlers.set('init', (payload, context) => {
      const { fieldState, fieldValue } = payload;
      const fieldName = context.currentFieldName;
      if (!fieldName) {
        throw new Error('Init action requires field name in context.currentFieldName');
      }
      this.options.onFieldInit?.(fieldName, fieldState, fieldValue);
    });
  }

  registerActionHandler(
    actionType: string,
    handler: (payload: any, context: any, helpers?: ActionHandlerOptions) => void
  ): void {
    // Check if handler expects the helpers parameter by checking its length
    if (handler.length >= 3) {
      // Handler expects helpers, wrap it to pass the options
      this.actionHandlers.set(actionType, (payload, context) => {
        handler(payload, context, this.options);
      });
    } else {
      // Handler doesn't expect helpers, use it directly for backward compatibility
      this.actionHandlers.set(actionType, handler as any);
    }
  }

  executeAction(action: Action, context: any): void {
    const actionType = Object.keys(action)[0];
    const payload = (action as any)[actionType];

    const handler = this.actionHandlers.get(actionType);
    if (!handler) {
      throw new Error(`Unknown action type: ${actionType}`);
    }

    handler(payload, context);
  }
}

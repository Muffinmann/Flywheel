import { Logic, LogicResolver } from './LogicResolver.js';

export interface ActionTypes {
  set: { target: string; value: any };
  setState: { target: string; value: any };
  copy: { source: string; target: string };
  calculate: { target: string; formula: Logic };
  trigger: { event: string; params?: any };
  batch: Action[];
}

export type Action = {
  [K in keyof ActionTypes]: { [P in K]: ActionTypes[K] }
}[keyof ActionTypes];

export interface ActionHandlerOptions {  
  onEvent?: (eventType: string, params?: any) => void;
  onFieldValueSet?: (target: string, value: any) => void;
  onFieldStateSet?: (target: string, value: any) => void;
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
    // Field value operations - always set field values
    this.actionHandlers.set('set', (payload) => {
      const { target, value } = payload;
      this.options.onFieldValueSet?.(target, value);
    });

    // Field state operations - always set field state properties
    this.actionHandlers.set('setState', (payload) => {
      const { target, value } = payload;
      this.options.onFieldStateSet?.(target, value);
    });

    this.actionHandlers.set('copy', (payload, context) => {
      const { source, target } = payload;
      const value = this.logicResolver.resolve({ var: [source] }, context);
      this.options.onFieldValueSet?.(target, value);
    });

    this.actionHandlers.set('calculate', (payload, context) => {
      const { target, formula } = payload;
      const value = this.logicResolver.resolve(formula, context);
      this.options.onFieldStateSet?.(target, value);
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
  }

  registerActionHandler(actionType: string, handler: (payload: any, context: any) => void): void {
    this.actionHandlers.set(actionType, handler);
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

  extractActionTargets(action: Action): string[] {
    const actionType = Object.keys(action)[0];
    const payload = (action as any)[actionType];

    switch (actionType) {
      case 'set':
        return [payload.target];
      case 'setState':
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


}
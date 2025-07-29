import { ContextProvider } from './ContextProvider.js';

export interface FieldState {
  isVisible: boolean;
  isRequired: boolean;
  calculatedValue?: any;
  [key: string]: any;
}

export interface FieldStateProviderOptions {
  onFieldStateCreation?: (props: Record<string, unknown>) => Record<string, any>;
}

/**
 * FieldStateProvider - Provides field state context for rule evaluation.
 * 
 * This provider manages field-specific state properties like visibility, 
 * required status, calculated values, and any custom properties defined
 * through the onFieldStateCreation callback.
 * 
 * The provider contributes a "fieldStates" namespace to the evaluation context,
 * allowing rules to access field state via expressions like:
 * {"fieldState": ["fieldName.isVisible"]}
 */
export class FieldStateProvider implements ContextProvider {
  private fieldStates: Map<string, FieldState> = new Map();
  private evaluationCache: Map<string, FieldState> = new Map();
  private options: FieldStateProviderOptions;

  constructor(options: FieldStateProviderOptions = {}) {
    this.options = options;
  }

  getNamespace(): string {
    return 'fieldStates';
  }

  createDefaultFieldState(): FieldState {
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

  getFieldState(fieldName: string): FieldState | undefined {
    return this.fieldStates.get(fieldName);
  }

  setFieldState(fieldName: string, fieldState: FieldState): void {
    this.fieldStates.set(fieldName, fieldState);
  }

  ensureFieldState(fieldName: string): FieldState {
    if (!this.fieldStates.has(fieldName)) {
      this.fieldStates.set(fieldName, this.createDefaultFieldState());
    }
    return this.fieldStates.get(fieldName)!;
  }

  contributeToContext(baseContext: Record<string, any>): Record<string, any> {
    const context = { ...baseContext };

    // Add field states to context under fieldStates namespace
    const fieldStatesObj: Record<string, any> = {};
    for (const [fieldName, fieldState] of this.fieldStates.entries()) {
      fieldStatesObj[fieldName] = { ...fieldState };
    }
    context.fieldStates = fieldStatesObj;

    return context;
  }

  handlePropertySet(target: string, value: any): void {
    const dotIndex = target.indexOf('.');
    if (dotIndex === -1) {
      // No dot found, treat as field name only - not applicable for field state
      return;
    }
    
    const fieldName = target.substring(0, dotIndex);
    const propertyPath = target.substring(dotIndex + 1);
    const fieldState = this.ensureFieldState(fieldName);
    
    // Handle nested properties (e.g., "permissions.write")
    this.setNestedProperty(fieldState, propertyPath, value);
  }

  private setNestedProperty(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    
    // Navigate to the parent object
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part];
    }
    
    // Set the final property
    const finalPart = parts[parts.length - 1];
    current[finalPart] = value;
  }

  getCachedValue(fieldName: string): FieldState | undefined {
    return this.evaluationCache.get(fieldName);
  }

  setCachedValue(fieldName: string, fieldState: FieldState): void {
    this.evaluationCache.set(fieldName, fieldState);
  }

  invalidateCache(fieldNames: string[]): void {
    for (const fieldName of fieldNames) {
      this.evaluationCache.delete(fieldName);
    }
  }

  getAllFieldStates(): Map<string, FieldState> {
    return new Map(this.fieldStates);
  }

  clearAll(): void {
    this.fieldStates.clear();
    this.evaluationCache.clear();
  }
}
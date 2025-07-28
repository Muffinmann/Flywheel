export interface FieldState {
  isVisible: boolean;
  isRequired: boolean;
  calculatedValue?: any;
  [key: string]: any;
}

export interface FieldStateManagerOptions {
  onFieldStateCreation?: (props: Record<string, unknown>) => Record<string, any>;
}

export class FieldStateManager {
  private fieldStates: Map<string, FieldState> = new Map();
  private evaluationCache: Map<string, FieldState> = new Map();
  private options: FieldStateManagerOptions;

  constructor(options: FieldStateManagerOptions = {}) {
    this.options = options;
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

  setFieldProperty(target: string, value: any): void {
    const dotIndex = target.indexOf('.');
    if (dotIndex === -1) {
      // No dot found, treat as field name only
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

  getCachedEvaluation(fieldName: string): FieldState | undefined {
    return this.evaluationCache.get(fieldName);
  }

  setCachedEvaluation(fieldName: string, fieldState: FieldState): void {
    this.evaluationCache.set(fieldName, fieldState);
  }

  invalidateCache(fieldNames: string[]): void {
    for (const fieldName of fieldNames) {
      this.evaluationCache.delete(fieldName);
    }
  }

  buildEvaluationContext(baseContext: Record<string, any>): Record<string, any> {
    const context = { ...baseContext };

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

  getAllFieldStates(): Map<string, FieldState> {
    return new Map(this.fieldStates);
  }

  clearAll(): void {
    this.fieldStates.clear();
    this.evaluationCache.clear();
  }
}
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

  private initializedFields: Set<string> = new Set();

  private options: FieldStateManagerOptions;

  constructor(options: FieldStateManagerOptions = {}) {
    this.options = options;
  }

  createDefaultFieldState(): FieldState {
    const defaultState: FieldState = {
      isVisible: false,
      isRequired: false,
      calculatedValue: undefined,
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
    const context: Record<string, any> = {};

    // Create unified field objects with both value and state properties
    const allFieldNames = new Set<string>([
      ...Object.keys(baseContext),
      ...this.fieldStates.keys(),
    ]);

    for (const fieldName of allFieldNames) {
      const fieldValue = baseContext[fieldName];
      const fieldState = this.fieldStates.get(fieldName) || this.createDefaultFieldState();

      // Create unified field object
      context[fieldName] = {
        value: fieldValue,
        ...fieldState,
      };
    }

    return context;
  }

  getAllFieldStates(): Map<string, FieldState> {
    return new Map(this.fieldStates);
  }

  clearAll(): void {
    this.fieldStates.clear();
    this.evaluationCache.clear();
    this.initializedFields.clear();
  }

  isFieldInitialized(fieldName: string): boolean {
    return this.initializedFields.has(fieldName);
  }

  initializeField(fieldName: string, fieldState?: Record<string, any>): void {
    if (this.initializedFields.has(fieldName)) {
      return; // Already initialized
    }

    // Get or create the field state with defaults
    const currentState = this.ensureFieldState(fieldName);

    // Merge init fieldState with current state
    if (fieldState) {
      Object.assign(currentState, fieldState);
    }

    // Mark as initialized
    this.initializedFields.add(fieldName);
  }
}

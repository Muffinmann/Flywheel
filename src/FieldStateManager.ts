export interface FieldState {
  value?: any;
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
      value: undefined,
      isVisible: false,
      isRequired: false,
      calculatedValue: undefined,
    };

    if (this.options.onFieldStateCreation) {
      return { ...defaultState, ...this.options.onFieldStateCreation({}) };
    }

    return defaultState;
  }

  private getFieldState(fieldName: string): FieldState | undefined {
    return this.fieldStates.get(fieldName);
  }

  private setFieldState(fieldName: string, fieldState: FieldState): void {
    this.fieldStates.set(fieldName, fieldState);
    // Auto-invalidate cache when field state changes
    this.invalidateCacheForField(fieldName);
  }

  ensureFieldState(fieldName: string): FieldState {
    if (!this.fieldStates.has(fieldName)) {
      this.fieldStates.set(fieldName, this.createDefaultFieldState());
    }
    return this.fieldStates.get(fieldName)!;
  }

  getFieldProperty(path: string): any {
    const dotIndex = path.indexOf('.');
    if (dotIndex === -1) {
      throw new Error(`Invalid path format: ${path}. Expected format: "fieldName.property"`);
    }

    const fieldName = path.substring(0, dotIndex);
    const propertyPath = path.substring(dotIndex + 1);
    const fieldState = this.fieldStates.get(fieldName);

    if (!fieldState) {
      return undefined;
    }

    // Navigate nested properties
    return this.getNestedProperty(fieldState, propertyPath);
  }

  setFieldProperty(path: string, value: any): void {
    const dotIndex = path.indexOf('.');
    if (dotIndex === -1) {
      throw new Error(`Invalid path format: ${path}. Expected format: "fieldName.property"`);
    }

    const fieldName = path.substring(0, dotIndex);
    const propertyPath = path.substring(dotIndex + 1);
    const fieldState = this.ensureFieldState(fieldName);

    // Handle nested properties (e.g., "permissions.write")
    this.setNestedProperty(fieldState, propertyPath, value);
    
    // Auto-invalidate cache when any property changes
    this.invalidateCacheForField(fieldName);
  }

  private getNestedProperty(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined || !(part in current)) {
        return undefined;
      }
      current = current[part];
    }

    return current;
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

  private invalidateCacheForField(fieldName: string): void {
    this.evaluationCache.delete(fieldName);
  }

  private getCachedEvaluation(fieldName: string): FieldState | undefined {
    return this.evaluationCache.get(fieldName);
  }

  private setCachedEvaluation(fieldName: string, fieldState: FieldState): void {
    this.evaluationCache.set(fieldName, fieldState);
  }

  invalidateCache(fieldNames: string[]): void {
    for (const fieldName of fieldNames) {
      this.evaluationCache.delete(fieldName);
    }
  }

  buildEvaluationContext(): Record<string, any> {
    const context: Record<string, any> = {};

    // Build context from field states only (values are now part of state)
    for (const [fieldName, fieldState] of this.fieldStates) {
      context[fieldName] = { ...fieldState };
    }

    return context;
  }

  getAllFieldStates(): Map<string, FieldState> {
    return new Map(this.fieldStates);
  }

  // Check if field has cached evaluation
  hasCachedEvaluation(fieldName: string): boolean {
    return this.evaluationCache.has(fieldName);
  }

  // Get cached evaluation result
  getCachedFieldState(fieldName: string): FieldState | undefined {
    return this.getCachedEvaluation(fieldName);
  }

  // Get current field state (not from cache)
  getCurrentFieldState(fieldName: string): FieldState | undefined {
    return this.getFieldState(fieldName);
  }

  // Cache evaluation result
  cacheEvaluationResult(fieldName: string, fieldState: FieldState): void {
    this.setCachedEvaluation(fieldName, fieldState);
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

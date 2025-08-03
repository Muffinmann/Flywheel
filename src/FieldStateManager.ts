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

  ensureFieldState(fieldName: string): FieldState {
    if (!this.fieldStates.has(fieldName)) {
      this.fieldStates.set(fieldName, this.createDefaultFieldState());
    }
    return this.fieldStates.get(fieldName)!;
  }

  /**
   * Get the complete field state object for a field.
   * Returns undefined if the field doesn't exist.
   */
  getFieldState(fieldName: string): FieldState | undefined {
    return this.fieldStates.get(fieldName);
  }

  /**
   * Set the complete field state object for a field.
   * Replaces the entire field state.
   */
  setFieldState(fieldName: string, fieldState: FieldState): void {
    this.fieldStates.set(fieldName, fieldState);
  }

  /**
   * Get a specific property value from a field using dot notation.
   * Creates the field with defaults if it doesn't exist.
   * Example: getFieldProperty('user.value') or getFieldProperty('user.isVisible')
   */
  getFieldProperty(path: string): any {
    const dotIndex = path.indexOf('.');
    if (dotIndex === -1) {
      throw new Error(`Invalid path format: ${path}. Expected format: "fieldName.property"`);
    }

    const fieldName = path.substring(0, dotIndex);
    const propertyPath = path.substring(dotIndex + 1);
    const fieldState = this.ensureFieldState(fieldName);

    // Navigate nested properties
    return this.getNestedProperty(fieldState, propertyPath);
  }

  /**
   * Set a specific property value for a field using dot notation.
   * Creates the field with defaults if it doesn't exist.
   * Example: setFieldProperty('user.value', 'John') or setFieldProperty('user.isVisible', true)
   */
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

  buildEvaluationContext(): Record<string, any> {
    return Object.fromEntries(this.fieldStates.entries());
  }

  clearAll(): void {
    this.fieldStates.clear();
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

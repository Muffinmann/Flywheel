/**
 * @fileoverview ContextProvider - Interface for pluggable context providers.
 * 
 * Context providers allow different modules to contribute to the rule evaluation context.
 * This enables a plugin architecture where field state, permissions, validation state,
 * or any other contextual information can be provided by separate modules.
 * 
 * @example
 * ```ts
 * class CustomPermissionProvider implements ContextProvider {
 *   contributeToContext(baseContext: Record<string, any>): Record<string, any> {
 *     return {
 *       ...baseContext,
 *       permissions: this.getPermissions()
 *     };
 *   }
 *   
 *   handlePropertySet?(target: string, value: any): void {
 *     if (target.includes('permissions.')) {
 *       this.setPermission(target, value);
 *     }
 *   }
 * }
 * ```
 */

export interface ContextProvider {
  /**
   * Contributes additional context for rule evaluation.
   * 
   * @param baseContext - The base context containing field values
   * @returns The enhanced context with provider-specific data
   */
  contributeToContext(baseContext: Record<string, any>): Record<string, any>;

  /**
   * Optional: Handle property setting operations targeted at this provider.
   * 
   * @param target - The target property path (e.g., "fieldName.property")
   * @param value - The value to set
   */
  handlePropertySet?(target: string, value: any): void;

  /**
   * Optional: Get cached evaluation result for a field.
   * 
   * @param fieldName - The field name to get cached value for
   * @returns The cached value if available, undefined otherwise
   */
  getCachedValue?(fieldName: string): any;

  /**
   * Optional: Set cached evaluation result for a field.
   * 
   * @param fieldName - The field name to cache value for
   * @param value - The value to cache
   */
  setCachedValue?(fieldName: string, value: any): void;

  /**
   * Optional: Invalidate cached values for specified fields.
   * 
   * @param fieldNames - Array of field names to invalidate
   */
  invalidateCache?(fieldNames: string[]): void;

  /**
   * Optional: Clear all cached values and internal state.
   */
  clearAll?(): void;

  /**
   * Optional: Get the namespace this provider contributes to the context.
   * This helps avoid conflicts between different providers.
   * 
   * @returns The namespace key (e.g., "fieldStates", "permissions", "validation")
   */
  getNamespace?(): string;
}
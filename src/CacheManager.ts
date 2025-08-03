/**
 * CacheManager tracks the validity of field evaluations.
 * It does not store the actual field states - those remain in FieldStateManager.
 * This class simply tracks which fields have valid cached evaluations.
 */
export class CacheManager {
  private validFields: Set<string> = new Set();

  /**
   * Check if a field has a valid cached evaluation
   */
  isValid(fieldName: string): boolean {
    return this.validFields.has(fieldName);
  }

  /**
   * Mark a field as having a valid cached evaluation
   */
  markAsValid(fieldName: string): void {
    this.validFields.add(fieldName);
  }

  /**
   * Invalidate cached evaluations for specified fields
   */
  invalidate(fieldNames: string[]): void {
    for (const fieldName of fieldNames) {
      this.validFields.delete(fieldName);
    }
  }

  /**
   * Clear all cached evaluations
   */
  clearAll(): void {
    this.validFields.clear();
  }

  /**
   * Get the number of valid cached fields (useful for testing)
   */
  getValidFieldCount(): number {
    return this.validFields.size;
  }
}

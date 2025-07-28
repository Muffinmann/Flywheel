import { FieldStateManager, FieldState } from '../FieldStateManager.js';

describe('FieldStateManager', () => {
  let fieldStateManager: FieldStateManager;

  beforeEach(() => {
    fieldStateManager = new FieldStateManager();
  });

  describe('Default Field State Creation', () => {
    test('should create default field state with standard properties', () => {
      const fieldState = fieldStateManager.createDefaultFieldState();

      expect(fieldState).toEqual({
        isVisible: false,
        isRequired: false,
        calculatedValue: undefined
      });
    });

    test('should use custom field state creation function', () => {
      const customManager = new FieldStateManager({
        onFieldStateCreation: () => ({
          customProperty: 'default_value',
          readOnly: false,
          validationMessage: null
        })
      });

      const fieldState = customManager.createDefaultFieldState();

      expect(fieldState).toEqual({
        isVisible: false,
        isRequired: false,
        calculatedValue: undefined,
        customProperty: 'default_value',
        readOnly: false,
        validationMessage: null
      });
    });
  });

  describe('Field State Management', () => {
    test('should set and get field states', () => {
      const fieldState: FieldState = {
        isVisible: true,
        isRequired: false,
        calculatedValue: 'test'
      };

      fieldStateManager.setFieldState('test_field', fieldState);
      const retrieved = fieldStateManager.getFieldState('test_field');

      expect(retrieved).toEqual(fieldState);
    });

    test('should return undefined for non-existent field states', () => {
      const result = fieldStateManager.getFieldState('non_existent');
      expect(result).toBeUndefined();
    });

    test('should ensure field state exists', () => {
      const fieldState = fieldStateManager.ensureFieldState('new_field');

      expect(fieldState).toEqual({
        isVisible: false,
        isRequired: false,
        calculatedValue: undefined
      });

      // Should return the same instance on subsequent calls
      const sameFieldState = fieldStateManager.ensureFieldState('new_field');
      expect(sameFieldState).toBe(fieldState);
    });
  });

  describe('Field Property Setting', () => {
    test('should set field properties using dot notation', () => {
      fieldStateManager.setFieldProperty('test_field.isVisible', true);
      const fieldState = fieldStateManager.getFieldState('test_field');

      expect(fieldState?.isVisible).toBe(true);
      expect(fieldState?.isRequired).toBe(false); // Should maintain default
    });

    test('should set custom properties', () => {
      fieldStateManager.setFieldProperty('test_field.customProp', 'custom_value');
      const fieldState = fieldStateManager.getFieldState('test_field');

      expect(fieldState?.['customProp']).toBe('custom_value');
    });

    test('should update existing field properties', () => {
      // First set a property
      fieldStateManager.setFieldProperty('test_field.isVisible', true);
      fieldStateManager.setFieldProperty('test_field.isRequired', true);

      // Then update one of them
      fieldStateManager.setFieldProperty('test_field.isVisible', false);

      const fieldState = fieldStateManager.getFieldState('test_field');
      expect(fieldState?.isVisible).toBe(false);
      expect(fieldState?.isRequired).toBe(true); // Should remain unchanged
    });

    test('should handle nested property names', () => {
      fieldStateManager.setFieldProperty('test_field.nested.deep.property', 'nested_value');
      const fieldState = fieldStateManager.getFieldState('test_field');

      expect(fieldState?.nested?.deep?.property).toBe('nested_value');
    });
  });

  describe('Evaluation Cache Management', () => {
    test('should cache and retrieve field evaluations', () => {
      const fieldState: FieldState = {
        isVisible: true,
        isRequired: false,
        calculatedValue: 'cached'
      };

      fieldStateManager.setCachedEvaluation('cached_field', fieldState);
      const cached = fieldStateManager.getCachedEvaluation('cached_field');

      expect(cached).toEqual(fieldState);
    });

    test('should return undefined for uncached evaluations', () => {
      const result = fieldStateManager.getCachedEvaluation('uncached_field');
      expect(result).toBeUndefined();
    });

    test('should invalidate specific field caches', () => {
      const fieldState: FieldState = {
        isVisible: true,
        isRequired: false,
        calculatedValue: 'cached'
      };

      fieldStateManager.setCachedEvaluation('field1', fieldState);
      fieldStateManager.setCachedEvaluation('field2', fieldState);

      fieldStateManager.invalidateCache(['field1']);

      expect(fieldStateManager.getCachedEvaluation('field1')).toBeUndefined();
      expect(fieldStateManager.getCachedEvaluation('field2')).toEqual(fieldState);
    });

    test('should handle multiple field cache invalidation', () => {
      const fieldState: FieldState = {
        isVisible: true,
        isRequired: false,
        calculatedValue: 'cached'
      };

      fieldStateManager.setCachedEvaluation('field1', fieldState);
      fieldStateManager.setCachedEvaluation('field2', fieldState);
      fieldStateManager.setCachedEvaluation('field3', fieldState);

      fieldStateManager.invalidateCache(['field1', 'field3']);

      expect(fieldStateManager.getCachedEvaluation('field1')).toBeUndefined();
      expect(fieldStateManager.getCachedEvaluation('field2')).toEqual(fieldState);
      expect(fieldStateManager.getCachedEvaluation('field3')).toBeUndefined();
    });
  });

  describe('Evaluation Context Building', () => {
    test('should build context from base context and field states', () => {
      const baseContext = {
        field1: 'value1',
        field2: 'value2'
      };

      // Set up some field states
      fieldStateManager.setFieldProperty('field3.isVisible', true);
      fieldStateManager.setFieldProperty('field3.customProp', 'custom');

      const evaluationContext = fieldStateManager.buildEvaluationContext(baseContext);

      expect(evaluationContext).toEqual({
        field1: 'value1',
        field2: 'value2',
        field3: {
          isVisible: true,
          isRequired: false,
          calculatedValue: undefined,
          customProp: 'custom'
        }
      });
    });

    test('should merge field states with existing object contexts', () => {
      const baseContext = {
        field1: {
          existingProp: 'existing',
          customValue: 'original'
        }
      };

      fieldStateManager.setFieldProperty('field1.isVisible', true);
      fieldStateManager.setFieldProperty('field1.customValue', 'updated');

      const evaluationContext = fieldStateManager.buildEvaluationContext(baseContext);

      expect(evaluationContext.field1).toEqual({
        existingProp: 'existing',
        customValue: 'updated', // Field state should override
        isVisible: true,
        isRequired: false,
        calculatedValue: undefined
      });
    });

    test('should handle primitive values in base context', () => {
      const baseContext = {
        primitiveField: 'primitive_value',
        numberField: 42
      };

      fieldStateManager.setFieldProperty('primitiveField.isVisible', true);

      const evaluationContext = fieldStateManager.buildEvaluationContext(baseContext);

      expect(evaluationContext.primitiveField).toEqual({
        isVisible: true,
        isRequired: false,
        calculatedValue: undefined
      });
      expect(evaluationContext.numberField).toBe(42);
    });

    test('should handle null values in base context', () => {
      const baseContext = {
        nullField: null,
        undefinedField: undefined
      };

      fieldStateManager.setFieldProperty('nullField.isVisible', true);

      const evaluationContext = fieldStateManager.buildEvaluationContext(baseContext);

      expect(evaluationContext.nullField).toEqual({
        isVisible: true,
        isRequired: false,
        calculatedValue: undefined
      });
      expect(evaluationContext.undefinedField).toBeUndefined();
    });
  });

  describe('Utility Methods', () => {
    test('should return all field states', () => {
      fieldStateManager.setFieldProperty('field1.isVisible', true);
      fieldStateManager.setFieldProperty('field2.isRequired', true);

      const allStates = fieldStateManager.getAllFieldStates();

      expect(allStates.size).toBe(2);
      expect(allStates.get('field1')?.isVisible).toBe(true);
      expect(allStates.get('field2')?.isRequired).toBe(true);
    });

    test('should clear all states and caches', () => {
      fieldStateManager.setFieldProperty('field1.isVisible', true);
      fieldStateManager.setCachedEvaluation('field1', { isVisible: true, isRequired: false });

      fieldStateManager.clearAll();

      expect(fieldStateManager.getFieldState('field1')).toBeUndefined();
      expect(fieldStateManager.getCachedEvaluation('field1')).toBeUndefined();
      expect(fieldStateManager.getAllFieldStates().size).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty field names gracefully', () => {
      fieldStateManager.setFieldProperty('.isVisible', true);
      const fieldState = fieldStateManager.getFieldState('');

      expect(fieldState?.isVisible).toBe(true);
    });

    test('should handle properties without dots', () => {
      // This should not crash, though it's not a typical use case
      expect(() => {
        fieldStateManager.setFieldProperty('standalone_property', 'value');
      }).not.toThrow();
    });

    test('should handle concurrent field state operations', () => {
      // Simulate concurrent operations
      fieldStateManager.setFieldProperty('field1.isVisible', true);
      fieldStateManager.setFieldProperty('field1.isRequired', true);
      fieldStateManager.setCachedEvaluation('field1', { 
        isVisible: false, 
        isRequired: false, 
        calculatedValue: 'cached' 
      });

      const fieldState = fieldStateManager.getFieldState('field1');
      const cachedState = fieldStateManager.getCachedEvaluation('field1');

      expect(fieldState?.isVisible).toBe(true);
      expect(fieldState?.isRequired).toBe(true);
      expect(cachedState?.calculatedValue).toBe('cached');
    });
  });
});
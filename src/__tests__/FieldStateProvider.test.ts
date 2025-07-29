import { FieldStateProvider, FieldState } from '../FieldStateProvider.js';

describe('FieldStateProvider', () => {
  let fieldStateProvider: FieldStateProvider;

  beforeEach(() => {
    fieldStateProvider = new FieldStateProvider();
  });

  describe('ContextProvider Interface', () => {
    test('should return correct namespace', () => {
      expect(fieldStateProvider.getNamespace()).toBe('fieldStates');
    });

    test('should contribute field states to context', () => {
      const baseContext = { someField: 'value' };
      
      // Set up some field states
      fieldStateProvider.setFieldState('field1', {
        isVisible: true,
        isRequired: false,
        calculatedValue: 'test'
      });
      
      fieldStateProvider.setFieldState('field2', {
        isVisible: false,
        isRequired: true,
        calculatedValue: undefined
      });

      const context = fieldStateProvider.contributeToContext(baseContext);

      expect(context).toEqual({
        someField: 'value',
        fieldStates: {
          field1: {
            isVisible: true,
            isRequired: false,
            calculatedValue: 'test'
          },
          field2: {
            isVisible: false,
            isRequired: true,
            calculatedValue: undefined
          }
        }
      });
    });

    test('should handle property setting', () => {
      fieldStateProvider.handlePropertySet('testField.isVisible', true);
      
      const fieldState = fieldStateProvider.getFieldState('testField');
      expect(fieldState?.isVisible).toBe(true);
    });

    test('should handle nested property setting', () => {
      fieldStateProvider.handlePropertySet('testField.permissions.write', true);
      
      const fieldState = fieldStateProvider.getFieldState('testField');
      expect(fieldState?.permissions?.write).toBe(true);
    });

    test('should handle caching operations', () => {
      const testState: FieldState = {
        isVisible: true,
        isRequired: false,
        calculatedValue: 'cached'
      };

      // Test setCachedValue and getCachedValue
      fieldStateProvider.setCachedValue('testField', testState);
      expect(fieldStateProvider.getCachedValue('testField')).toEqual(testState);

      // Test invalidateCache
      fieldStateProvider.invalidateCache(['testField']);
      expect(fieldStateProvider.getCachedValue('testField')).toBeUndefined();
    });

    test('should clear all state and cache', () => {
      fieldStateProvider.setFieldState('field1', {
        isVisible: true,
        isRequired: false,
        calculatedValue: 'test'
      });
      
      fieldStateProvider.setCachedValue('field1', {
        isVisible: true,
        isRequired: false,
        calculatedValue: 'cached'
      });

      fieldStateProvider.clearAll();

      expect(fieldStateProvider.getFieldState('field1')).toBeUndefined();
      expect(fieldStateProvider.getCachedValue('field1')).toBeUndefined();
    });
  });

  describe('Default Field State Creation', () => {
    test('should create default field state with standard properties', () => {
      const fieldState = fieldStateProvider.createDefaultFieldState();

      expect(fieldState).toEqual({
        isVisible: false,
        isRequired: false,
        calculatedValue: undefined
      });
    });

    test('should use custom field state creation function', () => {
      const customProvider = new FieldStateProvider({
        onFieldStateCreation: () => ({
          customProperty: 'default_value',
          readOnly: false,
          validationMessage: null
        })
      });

      const fieldState = customProvider.createDefaultFieldState();

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

      fieldStateProvider.setFieldState('testField', fieldState);
      expect(fieldStateProvider.getFieldState('testField')).toEqual(fieldState);
    });

    test('should ensure field state exists', () => {
      const fieldState = fieldStateProvider.ensureFieldState('newField');
      
      expect(fieldState).toEqual({
        isVisible: false,
        isRequired: false,
        calculatedValue: undefined
      });

      // Should return same instance on subsequent calls
      const sameFieldState = fieldStateProvider.ensureFieldState('newField');
      expect(sameFieldState).toBe(fieldState);
    });

    test('should get all field states', () => {
      const state1: FieldState = { isVisible: true, isRequired: false };
      const state2: FieldState = { isVisible: false, isRequired: true };

      fieldStateProvider.setFieldState('field1', state1);
      fieldStateProvider.setFieldState('field2', state2);

      const allStates = fieldStateProvider.getAllFieldStates();
      expect(allStates.get('field1')).toEqual(state1);
      expect(allStates.get('field2')).toEqual(state2);
    });
  });

  describe('Nested Property Handling', () => {
    test('should handle single level property paths', () => {
      const fieldState = fieldStateProvider.ensureFieldState('testField');
      fieldStateProvider.handlePropertySet('testField.isVisible', true);
      
      expect(fieldState.isVisible).toBe(true);
    });

    test('should handle multi-level nested property paths', () => {
      const fieldState = fieldStateProvider.ensureFieldState('testField');
      fieldStateProvider.handlePropertySet('testField.validation.required', true);
      fieldStateProvider.handlePropertySet('testField.validation.message', 'This field is required');
      
      expect(fieldState.validation.required).toBe(true);
      expect(fieldState.validation.message).toBe('This field is required');
    });

    test('should create intermediate objects as needed', () => {
      const fieldState = fieldStateProvider.ensureFieldState('testField');
      fieldStateProvider.handlePropertySet('testField.deep.nested.property', 'value');
      
      expect(fieldState.deep.nested.property).toBe('value');
    });

    test('should ignore targets without dot notation', () => {
      // This should not crash or modify anything
      fieldStateProvider.handlePropertySet('justFieldName', 'value');
      
      // Field should not be created
      expect(fieldStateProvider.getFieldState('justFieldName')).toBeUndefined();
    });
  });
});
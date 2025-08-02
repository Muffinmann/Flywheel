import { FieldStateManager, FieldState, FieldStateManagerOptions } from '../FieldStateManager.js';

describe('FieldStateManager', () => {
  let fieldStateManager: FieldStateManager;

  beforeEach(() => {
    fieldStateManager = new FieldStateManager();
  });

  describe('Constructor and Initialization', () => {
    test('should create instance with default options', () => {
      const manager = new FieldStateManager();
      expect(manager).toBeInstanceOf(FieldStateManager);
    });

    test('should create instance with custom options', () => {
      const customOptions: FieldStateManagerOptions = {
        onFieldStateCreation: () => ({ customProp: 'value' })
      };
      const manager = new FieldStateManager(customOptions);
      expect(manager).toBeInstanceOf(FieldStateManager);
    });

    test('should handle empty options object', () => {
      const manager = new FieldStateManager({});
      expect(manager).toBeInstanceOf(FieldStateManager);
    });
  });

  describe('Default Field State Creation', () => {
    test('should create default field state with correct properties', () => {
      const defaultState = fieldStateManager.createDefaultFieldState();
      
      expect(defaultState).toEqual({
        value: undefined,
        isVisible: false,
        isRequired: false,
        calculatedValue: undefined
      });
    });

    test('should use custom field state creation function when provided', () => {
      const customOptions: FieldStateManagerOptions = {
        onFieldStateCreation: () => ({
          customProperty: 'customValue',
          readOnly: true,
          priority: 10
        })
      };
      
      const manager = new FieldStateManager(customOptions);
      const defaultState = manager.createDefaultFieldState();
      
      expect(defaultState).toEqual({
        value: undefined,
        isVisible: false,
        isRequired: false,
        calculatedValue: undefined,
        customProperty: 'customValue',
        readOnly: true,
        priority: 10
      });
    });

    test('should merge custom properties with defaults correctly', () => {
      const customOptions: FieldStateManagerOptions = {
        onFieldStateCreation: () => ({
          isVisible: true, // Override default
          customProp: 'test'
        })
      };
      
      const manager = new FieldStateManager(customOptions);
      const defaultState = manager.createDefaultFieldState();
      
      expect(defaultState.isVisible).toBe(true);
      expect(defaultState.isRequired).toBe(false);
      expect(defaultState.customProp).toBe('test');
    });
  });

  describe('Field State Management', () => {
    describe('ensureFieldState', () => {
      test('should create new field state if field does not exist', () => {
        const fieldState = fieldStateManager.ensureFieldState('newField');
        
        expect(fieldState).toEqual({
          value: undefined,
          isVisible: false,
          isRequired: false,
          calculatedValue: undefined
        });
      });

      test('should return existing field state if field already exists', () => {
        // Create initial field state
        const initialState = fieldStateManager.ensureFieldState('existingField');
        initialState.value = 'testValue';
        initialState.isVisible = true;
        
        // Get the same field state again
        const retrievedState = fieldStateManager.ensureFieldState('existingField');
        
        expect(retrievedState).toBe(initialState);
        expect(retrievedState.value).toBe('testValue');
        expect(retrievedState.isVisible).toBe(true);
      });

      test('should handle field names with special characters', () => {
        const specialFieldNames = [
          'field-with-hyphens',
          'field_with_underscores',
          'field.with.dots',
          'field123',
          'UPPERCASE_FIELD'
        ];
        
        specialFieldNames.forEach(fieldName => {
          const fieldState = fieldStateManager.ensureFieldState(fieldName);
          expect(fieldState).toBeDefined();
          expect(fieldState.isVisible).toBe(false);
        });
      });

      test('should handle empty string field name', () => {
        const fieldState = fieldStateManager.ensureFieldState('');
        expect(fieldState).toBeDefined();
        expect(fieldState.isVisible).toBe(false);
      });
    });

    describe('getFieldState', () => {
      test('should return undefined for non-existent field', () => {
        const fieldState = fieldStateManager.getFieldState('nonExistentField');
        expect(fieldState).toBeUndefined();
      });

      test('should return field state for existing field', () => {
        fieldStateManager.ensureFieldState('testField');
        const fieldState = fieldStateManager.getFieldState('testField');
        
        expect(fieldState).toBeDefined();
        expect(fieldState!.isVisible).toBe(false);
        expect(fieldState!.isRequired).toBe(false);
      });

      test('should return current state after modifications', () => {
        const originalState = fieldStateManager.ensureFieldState('modifiedField');
        originalState.value = 'modified';
        originalState.isVisible = true;
        
        const retrievedState = fieldStateManager.getFieldState('modifiedField');
        expect(retrievedState!.value).toBe('modified');
        expect(retrievedState!.isVisible).toBe(true);
      });
    });

    describe('setFieldState', () => {
      test('should set complete field state for new field', () => {
        const newState: FieldState = {
          value: 'testValue',
          isVisible: true,
          isRequired: true,
          calculatedValue: 'calculated',
          customProp: 'custom'
        };
        
        fieldStateManager.setFieldState('newField', newState);
        const retrievedState = fieldStateManager.getFieldState('newField');
        
        expect(retrievedState).toEqual(newState);
      });

      test('should replace existing field state completely', () => {
        // Create initial state
        fieldStateManager.ensureFieldState('existingField');
        const initialState = fieldStateManager.getFieldState('existingField')!;
        initialState.value = 'initial';
        initialState.customProp = 'initial';
        
        // Replace with new state
        const newState: FieldState = {
          value: 'replaced',
          isVisible: true,
          isRequired: false
        };
        
        fieldStateManager.setFieldState('existingField', newState);
        const replacedState = fieldStateManager.getFieldState('existingField');
        
        expect(replacedState).toEqual(newState);
        expect(replacedState!.customProp).toBeUndefined();
      });

      test('should handle field state with additional properties', () => {
        const stateWithExtras: FieldState = {
          value: 'test',
          isVisible: true,
          isRequired: false,
          calculatedValue: 100,
          metadata: { source: 'api' },
          permissions: { read: true, write: false }
        };
        
        fieldStateManager.setFieldState('richField', stateWithExtras);
        const retrievedState = fieldStateManager.getFieldState('richField');
        
        expect(retrievedState).toEqual(stateWithExtras);
        expect(retrievedState!.metadata.source).toBe('api');
        expect(retrievedState!.permissions.write).toBe(false);
      });
    });
  });

  describe('Field Property Management', () => {
    describe('getFieldProperty', () => {
      test('should get simple field properties', () => {
        fieldStateManager.ensureFieldState('testField');
        fieldStateManager.setFieldProperty('testField.value', 'testValue');
        fieldStateManager.setFieldProperty('testField.isVisible', true);
        
        expect(fieldStateManager.getFieldProperty('testField.value')).toBe('testValue');
        expect(fieldStateManager.getFieldProperty('testField.isVisible')).toBe(true);
        expect(fieldStateManager.getFieldProperty('testField.isRequired')).toBe(false);
      });

      test('should get nested properties', () => {
        fieldStateManager.ensureFieldState('userField');
        fieldStateManager.setFieldProperty('userField.profile.name', 'John Doe');
        fieldStateManager.setFieldProperty('userField.permissions.admin', true);
        
        expect(fieldStateManager.getFieldProperty('userField.profile.name')).toBe('John Doe');
        expect(fieldStateManager.getFieldProperty('userField.permissions.admin')).toBe(true);
      });

      test('should return undefined for non-existent nested properties', () => {
        fieldStateManager.ensureFieldState('testField');
        
        expect(fieldStateManager.getFieldProperty('testField.nonExistent')).toBeUndefined();
        expect(fieldStateManager.getFieldProperty('testField.nested.deep.property')).toBeUndefined();
      });

      test('should handle deeply nested property paths', () => {
        fieldStateManager.ensureFieldState('deepField');
        fieldStateManager.setFieldProperty('deepField.level1.level2.level3.value', 'deep');
        
        expect(fieldStateManager.getFieldProperty('deepField.level1.level2.level3.value')).toBe('deep');
      });

      test('should throw error for invalid path format', () => {
        expect(() => {
          fieldStateManager.getFieldProperty('invalidPath');
        }).toThrow('Invalid path format: invalidPath. Expected format: "fieldName.property"');
        
        expect(() => {
          fieldStateManager.getFieldProperty('');
        }).toThrow('Invalid path format: . Expected format: "fieldName.property"');
      });

      test('should handle null and undefined values in nested paths', () => {
        fieldStateManager.ensureFieldState('nullField');
        const fieldState = fieldStateManager.getFieldState('nullField')!;
        fieldState.nullProp = null;
        fieldState.undefinedProp = undefined;
        
        expect(fieldStateManager.getFieldProperty('nullField.nullProp.nested')).toBeUndefined();
        expect(fieldStateManager.getFieldProperty('nullField.undefinedProp.nested')).toBeUndefined();
      });
    });

    describe('setFieldProperty', () => {
      test('should set simple field properties', () => {
        fieldStateManager.setFieldProperty('newField.value', 'setValue');
        fieldStateManager.setFieldProperty('newField.isVisible', true);
        fieldStateManager.setFieldProperty('newField.isRequired', true);
        
        const fieldState = fieldStateManager.getFieldState('newField')!;
        expect(fieldState.value).toBe('setValue');
        expect(fieldState.isVisible).toBe(true);
        expect(fieldState.isRequired).toBe(true);
      });

      test('should set nested properties', () => {
        fieldStateManager.setFieldProperty('complexField.user.profile.name', 'Jane Doe');
        fieldStateManager.setFieldProperty('complexField.user.profile.age', 30);
        fieldStateManager.setFieldProperty('complexField.permissions.read', true);
        
        expect(fieldStateManager.getFieldProperty('complexField.user.profile.name')).toBe('Jane Doe');
        expect(fieldStateManager.getFieldProperty('complexField.user.profile.age')).toBe(30);
        expect(fieldStateManager.getFieldProperty('complexField.permissions.read')).toBe(true);
      });

      test('should create intermediate objects for nested paths', () => {
        fieldStateManager.setFieldProperty('autoField.deep.nested.value', 'created');
        
        const fieldState = fieldStateManager.getFieldState('autoField')!;
        expect(fieldState.deep).toBeDefined();
        expect(fieldState.deep.nested).toBeDefined();
        expect(fieldState.deep.nested.value).toBe('created');
      });

      test('should overwrite existing properties', () => {
        fieldStateManager.setFieldProperty('overwriteField.value', 'original');
        fieldStateManager.setFieldProperty('overwriteField.value', 'overwritten');
        
        expect(fieldStateManager.getFieldProperty('overwriteField.value')).toBe('overwritten');
      });

      test('should handle various data types', () => {
        const testValues = [
          { path: 'typeField.string', value: 'text' },
          { path: 'typeField.number', value: 42 },
          { path: 'typeField.boolean', value: true },
          { path: 'typeField.array', value: [1, 2, 3] },
          { path: 'typeField.object', value: { key: 'value' } },
          { path: 'typeField.null', value: null },
          { path: 'typeField.undefined', value: undefined }
        ];
        
        testValues.forEach(({ path, value }) => {
          fieldStateManager.setFieldProperty(path, value);
          expect(fieldStateManager.getFieldProperty(path)).toEqual(value);
        });
      });

      test('should throw error for invalid path format', () => {
        expect(() => {
          fieldStateManager.setFieldProperty('invalidPath', 'value');
        }).toThrow('Invalid path format: invalidPath. Expected format: "fieldName.property"');
        
        expect(() => {
          fieldStateManager.setFieldProperty('', 'value');
        }).toThrow('Invalid path format: . Expected format: "fieldName.property"');
      });

      test('should replace non-object intermediate values', () => {
        // Set initial primitive value
        fieldStateManager.setFieldProperty('replaceField.primitive', 'text');
        
        // Try to set nested property - should replace primitive with object
        fieldStateManager.setFieldProperty('replaceField.primitive.nested', 'value');
        
        expect(fieldStateManager.getFieldProperty('replaceField.primitive.nested')).toBe('value');
        expect(typeof fieldStateManager.getFieldProperty('replaceField.primitive')).toBe('object');
      });
    });
  });

  describe('Field Initialization Tracking', () => {
    describe('isFieldInitialized', () => {
      test('should return false for uninitialized fields', () => {
        expect(fieldStateManager.isFieldInitialized('uninitializedField')).toBe(false);
      });

      test('should return true for initialized fields', () => {
        fieldStateManager.initializeField('initializedField');
        expect(fieldStateManager.isFieldInitialized('initializedField')).toBe(true);
      });

      test('should return false for non-existent fields', () => {
        expect(fieldStateManager.isFieldInitialized('nonExistentField')).toBe(false);
      });
    });

    describe('initializeField', () => {
      test('should initialize field without initial state', () => {
        fieldStateManager.initializeField('basicField');
        
        expect(fieldStateManager.isFieldInitialized('basicField')).toBe(true);
        const fieldState = fieldStateManager.getFieldState('basicField');
        expect(fieldState).toBeDefined();
        expect(fieldState!.isVisible).toBe(false);
        expect(fieldState!.isRequired).toBe(false);
      });

      test('should initialize field with initial state', () => {
        const initialState = {
          value: 'initialValue',
          isVisible: true,
          customProp: 'custom'
        };
        
        fieldStateManager.initializeField('fieldWithState', initialState);
        
        expect(fieldStateManager.isFieldInitialized('fieldWithState')).toBe(true);
        const fieldState = fieldStateManager.getFieldState('fieldWithState')!;
        expect(fieldState.value).toBe('initialValue');
        expect(fieldState.isVisible).toBe(true);
        expect(fieldState.isRequired).toBe(false); // Default preserved
        expect(fieldState.customProp).toBe('custom');
      });

      test('should not reinitialize already initialized field', () => {
        // First initialization
        fieldStateManager.initializeField('onceField', { value: 'first' });
        expect(fieldStateManager.getFieldProperty('onceField.value')).toBe('first');
        
        // Second initialization attempt
        fieldStateManager.initializeField('onceField', { value: 'second' });
        expect(fieldStateManager.getFieldProperty('onceField.value')).toBe('first'); // Unchanged
      });

      test('should merge initial state with existing field state', () => {
        // Create field first
        fieldStateManager.ensureFieldState('mergeField');
        fieldStateManager.setFieldProperty('mergeField.value', 'existing');
        fieldStateManager.setFieldProperty('mergeField.isVisible', true);
        
        // Initialize with additional state
        fieldStateManager.initializeField('mergeField', {
          isRequired: true,
          customProp: 'added'
        });
        
        expect(fieldStateManager.isFieldInitialized('mergeField')).toBe(true);
        const fieldState = fieldStateManager.getFieldState('mergeField')!;
        expect(fieldState.value).toBe('existing');
        expect(fieldState.isVisible).toBe(true);
        expect(fieldState.isRequired).toBe(true);
        expect(fieldState.customProp).toBe('added');
      });

      test('should handle initialization with empty state object', () => {
        fieldStateManager.initializeField('emptyStateField', {});
        
        expect(fieldStateManager.isFieldInitialized('emptyStateField')).toBe(true);
        const fieldState = fieldStateManager.getFieldState('emptyStateField')!;
        expect(fieldState.isVisible).toBe(false);
        expect(fieldState.isRequired).toBe(false);
      });
    });
  });

  describe('Context Building', () => {
    test('should build empty context for no fields', () => {
      const context = fieldStateManager.buildEvaluationContext();
      expect(context).toEqual({});
    });

    test('should build context with single field', () => {
      fieldStateManager.setFieldProperty('singleField.value', 'test');
      fieldStateManager.setFieldProperty('singleField.isVisible', true);
      
      const context = fieldStateManager.buildEvaluationContext();
      
      expect(context).toEqual({
        singleField: {
          value: 'test',
          isVisible: true,
          isRequired: false,
          calculatedValue: undefined
        }
      });
    });

    test('should build context with multiple fields', () => {
      fieldStateManager.setFieldProperty('field1.value', 'value1');
      fieldStateManager.setFieldProperty('field1.isVisible', true);
      
      fieldStateManager.setFieldProperty('field2.value', 'value2');
      fieldStateManager.setFieldProperty('field2.isRequired', true);
      
      fieldStateManager.setFieldProperty('field3.calculatedValue', 100);
      
      const context = fieldStateManager.buildEvaluationContext();
      
      expect(context.field1.value).toBe('value1');
      expect(context.field1.isVisible).toBe(true);
      expect(context.field2.value).toBe('value2');
      expect(context.field2.isRequired).toBe(true);
      expect(context.field3.calculatedValue).toBe(100);
      expect(Object.keys(context)).toHaveLength(3);
    });

    test('should build context with complex field states', () => {
      fieldStateManager.setFieldProperty('complexField.value', { nested: 'object' });
      fieldStateManager.setFieldProperty('complexField.metadata.source', 'api');
      fieldStateManager.setFieldProperty('complexField.permissions.read', true);
      
      const context = fieldStateManager.buildEvaluationContext();
      
      expect(context.complexField.value.nested).toBe('object');
      expect(context.complexField.metadata.source).toBe('api');
      expect(context.complexField.permissions.read).toBe(true);
    });

    test('should reflect current field states in context', () => {
      fieldStateManager.setFieldProperty('dynamicField.value', 'initial');
      
      let context = fieldStateManager.buildEvaluationContext();
      expect(context.dynamicField.value).toBe('initial');
      
      // Update field
      fieldStateManager.setFieldProperty('dynamicField.value', 'updated');
      
      context = fieldStateManager.buildEvaluationContext();
      expect(context.dynamicField.value).toBe('updated');
    });
  });

  describe('Clear Operations', () => {
    test('should clear all field states and initialization tracking', () => {
      // Set up some fields
      fieldStateManager.setFieldProperty('field1.value', 'test1');
      fieldStateManager.setFieldProperty('field2.value', 'test2');
      fieldStateManager.initializeField('field1');
      fieldStateManager.initializeField('field2');
      
      // Verify setup
      expect(fieldStateManager.getFieldState('field1')).toBeDefined();
      expect(fieldStateManager.getFieldState('field2')).toBeDefined();
      expect(fieldStateManager.isFieldInitialized('field1')).toBe(true);
      expect(fieldStateManager.isFieldInitialized('field2')).toBe(true);
      
      // Clear all
      fieldStateManager.clearAll();
      
      // Verify cleared
      expect(fieldStateManager.getFieldState('field1')).toBeUndefined();
      expect(fieldStateManager.getFieldState('field2')).toBeUndefined();
      expect(fieldStateManager.isFieldInitialized('field1')).toBe(false);
      expect(fieldStateManager.isFieldInitialized('field2')).toBe(false);
      expect(fieldStateManager.buildEvaluationContext()).toEqual({});
    });

    test('should allow new operations after clear', () => {
      // Set up and clear
      fieldStateManager.setFieldProperty('tempField.value', 'temp');
      fieldStateManager.clearAll();
      
      // Add new fields after clear
      fieldStateManager.setFieldProperty('newField.value', 'new');
      fieldStateManager.initializeField('newField');
      
      expect(fieldStateManager.getFieldProperty('newField.value')).toBe('new');
      expect(fieldStateManager.isFieldInitialized('newField')).toBe(true);
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    test('should handle field names with dots', () => {
      fieldStateManager.setFieldProperty('field.with.dots.value', 'test');
      expect(fieldStateManager.getFieldProperty('field.with.dots.value')).toBe('test');
    });

    test('should handle numeric property names', () => {
      fieldStateManager.setFieldProperty('arrayField.0', 'first');
      fieldStateManager.setFieldProperty('arrayField.1.nested', 'second');
      
      expect(fieldStateManager.getFieldProperty('arrayField.0')).toBe('first');
      expect(fieldStateManager.getFieldProperty('arrayField.1.nested')).toBe('second');
    });

    test('should handle special characters in property paths', () => {
      fieldStateManager.setFieldProperty('field.prop-with-hyphens', 'hyphen');
      fieldStateManager.setFieldProperty('field.prop_with_underscores', 'underscore');
      
      expect(fieldStateManager.getFieldProperty('field.prop-with-hyphens')).toBe('hyphen');
      expect(fieldStateManager.getFieldProperty('field.prop_with_underscores')).toBe('underscore');
    });

    test('should handle very long property paths', () => {
      const longPath = 'field.' + 'level.'.repeat(20) + 'value';
      fieldStateManager.setFieldProperty(longPath, 'deep');
      expect(fieldStateManager.getFieldProperty(longPath)).toBe('deep');
    });

    test('should handle concurrent field operations', () => {
      // Simulate concurrent operations on same field
      const fieldName = 'concurrentField';
      
      fieldStateManager.ensureFieldState(fieldName);
      fieldStateManager.setFieldProperty(`${fieldName}.prop1`, 'value1');
      fieldStateManager.setFieldProperty(`${fieldName}.prop2`, 'value2');
      fieldStateManager.initializeField(fieldName, { prop3: 'value3' });
      
      const fieldState = fieldStateManager.getFieldState(fieldName)!;
      expect(fieldState.prop1).toBe('value1');
      expect(fieldState.prop2).toBe('value2');
      expect(fieldState.prop3).toBe('value3');
      expect(fieldStateManager.isFieldInitialized(fieldName)).toBe(true);
    });

    test('should handle null field state in setFieldState', () => {
      const nullState = null as any;
      expect(() => {
        fieldStateManager.setFieldState('nullField', nullState);
      }).not.toThrow();
      
      expect(fieldStateManager.getFieldState('nullField')).toBeNull();
    });

    test('should handle undefined values in nested property setting', () => {
      fieldStateManager.setFieldProperty('undefinedField.value', undefined);
      fieldStateManager.setFieldProperty('undefinedField.nested.deep', undefined);
      
      expect(fieldStateManager.getFieldProperty('undefinedField.value')).toBeUndefined();
      expect(fieldStateManager.getFieldProperty('undefinedField.nested.deep')).toBeUndefined();
    });

    test('should maintain field state integrity during complex operations', () => {
      const fieldName = 'integrityField';
      
      // Create initial state
      fieldStateManager.ensureFieldState(fieldName);
      const initialState = fieldStateManager.getFieldState(fieldName);
      
      // Perform various operations
      fieldStateManager.setFieldProperty(`${fieldName}.value`, 'test');
      fieldStateManager.setFieldProperty(`${fieldName}.nested.prop`, 'nested');
      fieldStateManager.initializeField(fieldName, { initialized: true });
      
      // Verify state integrity
      const finalState = fieldStateManager.getFieldState(fieldName)!;
      expect(finalState).toBe(initialState); // Same object reference
      expect(finalState.value).toBe('test');
      expect(finalState.nested.prop).toBe('nested');
      expect(finalState.initialized).toBe(true);
      expect(finalState.isVisible).toBe(false); // Default preserved
      expect(finalState.isRequired).toBe(false); // Default preserved
    });
  });

  describe('Integration with Custom Field State Creation', () => {
    test('should respect custom field state creation in ensureFieldState', () => {
      const customManager = new FieldStateManager({
        onFieldStateCreation: () => ({
          customDefault: 'custom',
          isVisible: true
        })
      });
      
      const fieldState = customManager.ensureFieldState('customField');
      
      expect(fieldState.customDefault).toBe('custom');
      expect(fieldState.isVisible).toBe(true);
      expect(fieldState.isRequired).toBe(false);
    });

    test('should use custom creation for property operations', () => {
      const customManager = new FieldStateManager({
        onFieldStateCreation: () => ({
          defaultValue: 'auto-generated',
          readOnly: false
        })
      });
      
      customManager.setFieldProperty('autoField.value', 'set');
      const fieldState = customManager.getFieldState('autoField')!;
      
      expect(fieldState.value).toBe('set');
      expect(fieldState.defaultValue).toBe('auto-generated');
      expect(fieldState.readOnly).toBe(false);
    });

    test('should handle complex custom field state creation', () => {
      const customManager = new FieldStateManager({
        onFieldStateCreation: (props) => ({
          metadata: {
            createdAt: new Date('2023-01-01'),
            version: 1
          },
          permissions: {
            read: true,
            write: true,
            delete: false
          },
          validation: {
            required: false,
            pattern: null
          }
        })
      });
      
      const fieldState = customManager.ensureFieldState('complexField');
      
      expect(fieldState.metadata.createdAt).toEqual(new Date('2023-01-01'));
      expect(fieldState.metadata.version).toBe(1);
      expect(fieldState.permissions.read).toBe(true);
      expect(fieldState.permissions.write).toBe(true);
      expect(fieldState.permissions.delete).toBe(false);
      expect(fieldState.validation.required).toBe(false);
      expect(fieldState.validation.pattern).toBeNull();
    });
  });
});
import { RuleEngine } from '../RuleEngine.js';
import { ContextProvider } from '../ContextProvider.js';
import { FieldStateProvider } from '../FieldStateProvider.js';
import { RuleSet } from '../DependencyGraph.js';

// Mock context provider for testing
class MockPermissionProvider implements ContextProvider {
  private permissions: Record<string, any> = {};

  getNamespace(): string {
    return 'permissions';
  }

  contributeToContext(baseContext: Record<string, any>): Record<string, any> {
    return {
      ...baseContext,
      permissions: { ...this.permissions }
    };
  }

  handlePropertySet(target: string, value: any): void {
    if (target.includes('permissions.')) {
      const [, property] = target.split('permissions.');
      this.permissions[property] = value;
    }
  }

  setPermission(key: string, value: any): void {
    this.permissions[key] = value;
  }

  clearAll(): void {
    this.permissions = {};
  }
}

// Mock validation provider for testing
class MockValidationProvider implements ContextProvider {
  private validationStates: Record<string, any> = {};

  getNamespace(): string {
    return 'validation';
  }

  contributeToContext(baseContext: Record<string, any>): Record<string, any> {
    return {
      ...baseContext,
      validation: { ...this.validationStates }
    };
  }

  handlePropertySet(target: string, value: any): void {
    if (target.includes('.validation')) {
      const [fieldName] = target.split('.');
      this.validationStates[fieldName] = value;
    }
  }

  clearAll(): void {
    this.validationStates = {};
  }
}

describe('RuleEngine - Context Provider System', () => {
  let engine: RuleEngine;
  let mockPermissionProvider: MockPermissionProvider;
  let mockValidationProvider: MockValidationProvider;

  beforeEach(() => {
    mockPermissionProvider = new MockPermissionProvider();
    mockValidationProvider = new MockValidationProvider();
  });

  describe('Context Provider Registration', () => {
    test('should register and use custom context providers', () => {
      engine = new RuleEngine({
        contextProviders: [mockPermissionProvider, mockValidationProvider]
      });

      // Set up some data in the providers
      mockPermissionProvider.setPermission('canEdit', true);
      mockValidationProvider.handlePropertySet('testField.validation', { required: true, message: 'Required field' });

      // Register a simple rule
      const ruleSet: RuleSet = {
        testField: [{
          condition: { '==': [1, 1] },
          action: { setState: { target: 'testField.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('testField');

      // Should have field state from default provider
      expect(fieldState.isVisible).toBe(true);

      // Verify context contains data from all providers
      const context = engine['buildEvaluationContext']();
      expect(context.permissions).toEqual({ canEdit: true });
      expect(context.validation).toEqual({ testField: { required: true, message: 'Required field' } });
      expect(context.fieldStates).toBeDefined();
    });

    test('should register additional context providers after creation', () => {
      engine = new RuleEngine();
      
      engine.registerContextProvider(mockPermissionProvider);
      engine.registerContextProvider(mockValidationProvider);

      mockPermissionProvider.setPermission('canView', false);

      const context = engine['buildEvaluationContext']();
      expect(context.permissions).toEqual({ canView: false });
      expect(context.validation).toEqual({});
    });

    test('should get all registered context providers', () => {
      engine = new RuleEngine({
        contextProviders: [mockPermissionProvider]
      });

      engine.registerContextProvider(mockValidationProvider);

      const providers = engine.getContextProviders();
      
      // Should include the field state provider (added by default), plus our custom providers
      expect(providers).toHaveLength(3);
      expect(providers).toContain(mockPermissionProvider);
      expect(providers).toContain(mockValidationProvider);
      
      // Should include the default field state provider
      const fieldStateProvider = providers.find(p => p.getNamespace && p.getNamespace() === 'fieldStates');
      expect(fieldStateProvider).toBeInstanceOf(FieldStateProvider);
    });
  });

  describe('Context Aggregation', () => {
    test('should aggregate context from multiple providers', () => {
      engine = new RuleEngine({
        contextProviders: [mockPermissionProvider, mockValidationProvider]
      });

      // Set up test data
      engine.updateField({ testField: 'testValue' });
      mockPermissionProvider.setPermission('userRole', 'admin');

      const context = engine['buildEvaluationContext']();

      expect(context).toEqual({
        testField: 'testValue',
        fieldStates: {},
        permissions: { userRole: 'admin' },
        validation: {}
      });
    });

    test('should handle providers with same namespace gracefully', () => {
      const provider1 = new MockPermissionProvider();
      const provider2 = new MockPermissionProvider();

      provider1.setPermission('key1', 'value1');
      provider2.setPermission('key2', 'value2');

      engine = new RuleEngine({
        contextProviders: [provider1, provider2]
      });

      const context = engine['buildEvaluationContext']();
      
      // Later provider should override the namespace
      expect(context.permissions).toEqual({ key2: 'value2' });
    });
  });

  describe('Property Setting Delegation', () => {
    test('should delegate property setting to appropriate providers', () => {
      engine = new RuleEngine({
        contextProviders: [mockPermissionProvider]
      });

      // Use RuleEngine's property setting functionality via actions
      const ruleSet: RuleSet = {
        testField: [{
          condition: { '==': [1, 1] },
          action: { setState: { target: 'permissions.canEdit', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      engine.evaluateField('testField');

      // Verify that the permission provider received the property setting
      const context = engine['buildEvaluationContext']();
      expect(context.permissions.canEdit).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    test('should work without any custom context providers', () => {
      engine = new RuleEngine();

      const ruleSet: RuleSet = {
        testField: [{
          condition: { '==': [1, 1] },
          action: { setState: { target: 'testField.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('testField');

      expect(fieldState.isVisible).toBe(true);
    });

    test('should maintain fieldState operator compatibility', () => {
      engine = new RuleEngine({
        contextProviders: [mockPermissionProvider]
      });

      const ruleSet: RuleSet = {
        testField: [{
          condition: { '==': [1, 1] },
          action: { setState: { target: 'testField.isVisible', value: true } },
          priority: 1
        }],
        dependentField: [{
          condition: { fieldState: ['testField.isVisible'] },
          action: { setState: { target: 'dependentField.isRequired', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      
      // Evaluate testField first to set its visibility
      engine.evaluateField('testField');
      
      // Now evaluate dependentField which depends on testField's visibility
      const dependentFieldState = engine.evaluateField('dependentField');
      
      expect(dependentFieldState.isRequired).toBe(true);
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate caches across all providers', () => {
      const mockProvider = {
        contributeToContext: jest.fn((ctx) => ctx),
        invalidateCache: jest.fn(),
        getNamespace: () => 'mock'
      };

      engine = new RuleEngine({
        contextProviders: [mockProvider]
      });

      engine.updateField({ testField: 'newValue' });

      // Verify that invalidateCache was called on the mock provider
      expect(mockProvider.invalidateCache).toHaveBeenCalled();
    });
  });
});
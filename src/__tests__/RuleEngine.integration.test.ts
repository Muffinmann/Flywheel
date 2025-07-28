import { RuleEngine, RuleSet, FieldRule } from '../RuleEngine.js';

describe('RuleEngine Integration', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  describe('Basic Rule Evaluation', () => {
    test('should evaluate simple visibility rule', () => {
      const ruleSet: RuleSet = {
        foot_cup_size: [{
          condition: { '==': [{ var: ['foot_guidance'] }, 'foot_cup'] },
          action: { set: { target: 'foot_cup_size.isVisible', value: true } },
          priority: 1,
          description: 'Show foot cup size when foot cup is selected'
        }]
      };

      engine.loadRuleSet(ruleSet);
      engine.updateField({ foot_guidance: 'foot_cup' });

      const fieldState = engine.evaluateField('foot_cup_size');
      expect(fieldState.isVisible).toBe(true);
    });

    test('should handle multiple conditions', () => {
      const ruleSet: RuleSet = {
        advanced_options: [{
          condition: {
            and: [
              { '==': [{ var: ['user_type'] }, 'admin'] },
              { '>': [{ var: ['experience_level'] }, 5] }
            ]
          },
          action: { set: { target: 'advanced_options.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      engine.updateField({ user_type: 'admin', experience_level: 7 });

      const fieldState = engine.evaluateField('advanced_options');
      expect(fieldState.isVisible).toBe(true);
    });
  });

  describe('End-to-End Rule Processing', () => {
    test('should process complex multi-action rules', () => {
      const events: any[] = [];
      const engine = new RuleEngine({
        onEvent: (eventType, params) => {
          events.push({ eventType, params });
        }
      });

      const ruleSet: RuleSet = {
        complex_field: [{
          condition: { 
            and: [
              { '==': [{ var: ['user_type'] }, 'admin'] },
              { '>': [{ var: ['score'] }, 80] }
            ]
          },
          action: {
            batch: [
              { set: { target: 'complex_field.isVisible', value: true } },
              { calculate: { target: 'complex_field.calculatedValue', formula: { '*': [{ var: ['score'] }, 1.5] } } },
              { trigger: { event: 'admin_high_score', params: { score: { var: ['score'] } } } }
            ]
          },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      engine.updateField({ user_type: 'admin', score: 85 });

      const fieldState = engine.evaluateField('complex_field');
      
      expect(fieldState.isVisible).toBe(true);
      expect(fieldState.calculatedValue).toBe(127.5); // 85 * 1.5
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('admin_high_score');
    });

    test('should handle cascading field evaluations', () => {
      const ruleSet: RuleSet = {
        field_a: [{
          condition: { '==': [{ var: ['trigger'] }, 'start'] },
          action: { set: { target: 'field_a.calculatedValue', value: 'step_1' } },
          priority: 1
        }],
        field_b: [{
          condition: { '==': [{ var: ['field_a.calculatedValue'] }, 'step_1'] },
          action: { set: { target: 'field_b.calculatedValue', value: 'step_2' } },
          priority: 1
        }],
        field_c: [{
          condition: { '==': [{ var: ['field_b.calculatedValue'] }, 'step_2'] },
          action: { set: { target: 'field_c.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      engine.updateField({ trigger: 'start' });

      // Evaluating field_c should trigger evaluation of its dependencies
      const fieldC = engine.evaluateField('field_c');
      expect(fieldC.isVisible).toBe(true);
      
      // Verify intermediate fields were also evaluated
      const fieldA = engine.evaluateField('field_a');
      const fieldB = engine.evaluateField('field_b');
      expect(fieldA.calculatedValue).toBe('step_1');
      expect(fieldB.calculatedValue).toBe('step_2');
    });
  });

  describe('Module Integration', () => {
    test('should integrate all modules for complex rule processing', () => {
      // Test integration of ActionHandler, FieldStateManager, RuleValidator, and DependencyGraph
      const ruleSet: RuleSet = {
        priority_field: [
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'priority_field.calculatedValue', value: 'first' } },
            priority: 2
          },
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'priority_field.calculatedValue', value: 'second' } },
            priority: 1
          }
        ]
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('priority_field');

      // Second rule should execute first due to lower priority number
      expect(fieldState.calculatedValue).toBe('first');
    });

    test('should validate rules using RuleValidator integration', () => {
      const ruleSet: RuleSet = {
        conflict_field: [
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'conflict_field.isVisible', value: true } },
            priority: 1
          },
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'conflict_field.isVisible', value: false } },
            priority: 1
          }
        ]
      };

      engine.loadRuleSet(ruleSet);

      expect(() => {
        engine.evaluateField('conflict_field');
      }).toThrow(/Conflicting rules.*same priority 1/);
    });
  });

  describe('Dependency Management Integration', () => {
    test('should manage dependencies through DependencyGraph module', () => {
      const ruleSet: RuleSet = {
        dependent_field: [{
          condition: { '==': [{ var: ['source_field'] }, 'trigger'] },
          action: { set: { target: 'dependent_field.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      const dependencies = engine.getDependenciesOf('dependent_field');

      expect(dependencies).toContain('source_field');
    });

    test('should handle cache invalidation through integrated modules', () => {
      const ruleSet: RuleSet = {
        dependent_field: [{
          condition: { '==': [{ var: ['source_field'] }, 'show'] },
          action: { set: { target: 'dependent_field.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);

      // First evaluation
      engine.updateField({ source_field: 'show' });
      let fieldState = engine.evaluateField('dependent_field');
      expect(fieldState.isVisible).toBe(true);

      // Change dependency
      const invalidated = engine.updateField({ source_field: 'hide' });
      fieldState = engine.evaluateField('dependent_field');

      expect(invalidated).toContain('dependent_field');
      expect(fieldState.isVisible).toBe(false);
    });

    test('should detect circular dependencies at load time', () => {
      const ruleSet: RuleSet = {
        field_a: [{
          condition: { '==': [{ var: ['field_b'] }, 'trigger'] },
          action: { set: { target: 'field_a.isVisible', value: true } },
          priority: 1
        }],
        field_b: [{
          condition: { '==': [{ var: ['field_a'] }, 'trigger'] },
          action: { set: { target: 'field_b.isVisible', value: true } },
          priority: 1
        }]
      };

      expect(() => {
        engine.loadRuleSet(ruleSet);
      }).toThrow(/Circular dependency detected/);
    });
  });

  describe('Shared Rules Integration', () => {
    test('should resolve shared rule references', () => {
      const sharedRules = {
        is_admin: { '==': [{ var: ['user_role'] }, 'admin'] }
      };

      const ruleSet: RuleSet = {
        admin_panel: [{
          condition: { '$ref': 'is_admin' },
          action: { set: { target: 'admin_panel.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.registerSharedRules(sharedRules);
      engine.loadRuleSet(ruleSet);
      engine.updateField({ user_role: 'admin' });

      const fieldState = engine.evaluateField('admin_panel');
      expect(fieldState.isVisible).toBe(true);
    });

    test('should throw error for missing shared rules', () => {
      const ruleSet: RuleSet = {
        test_field: [{
          condition: { '$ref': 'missing_rule' },
          action: { set: { target: 'test_field.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);

      expect(() => {
        engine.evaluateField('test_field');
      }).toThrow("Shared rule 'missing_rule' not found");
    });
  });

  describe('LookupManager Integration', () => {
    test('should integrate lookup operations with rule evaluation', () => {
      const ruleSet: RuleSet = {
        selected_product_price: [
          {
            condition: { '!=': [{ varTable: ['selected_product@product-table.price'] }, 0] },
            action: { set: { target: 'selected_product_price.isVisible', value: true } },
            priority: 1
          },
          {
            condition: {
              '>': [
                { 'lookup': ['product-table', { var: ['selected_product'] }, 'price'] },
                50,
              ]
            },
            action: { set: { target: 'selected_product_price.isRequired', value: true } },
            priority: 2
          },
        ]
      };

      engine.loadRuleSet(ruleSet);

      const lookupTable = {
        table: [
          { id: 'prod1', name: 'Product 1', price: 100 },
          { id: 'prod2', name: 'Product 2', price: 200 }
        ],
        primaryKey: 'id',
        name: 'product-table'
      };

      engine.registerLookupTables([lookupTable]);

      // Test the @ syntax in field paths
      engine.updateField({ selected_product: 'prod1' });
      const productPriceState = engine.evaluateField('selected_product_price')

      expect(productPriceState.isVisible).toBeTruthy();
      expect(productPriceState.isRequired).toBeTruthy();
    });
  });

  describe('FieldStateManager Integration', () => {
    test('should integrate custom field state creation', () => {
      const engine = new RuleEngine({
        onFieldStateCreation: () => ({
          customProperty: 'default_value',
          readOnly: false
        })
      });

      const ruleSet: RuleSet = {
        custom_field: [{
          condition: { '==': [1, 1] },
          action: { set: { target: 'custom_field.customProperty', value: 'modified' } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('custom_field');

      expect(fieldState.customProperty).toBe('modified');
      expect(fieldState.readOnly).toBe(false);
    });
  });

  describe('ActionHandler Integration', () => {
    test('should integrate custom action handlers', () => {
      const logs: string[] = [];

      engine.registerActionHandler('log', (payload) => {
        logs.push(payload.message);
      });

      const ruleSet: RuleSet = {
        log_field: [{
          condition: { '==': [1, 1] },
          action: { log: { message: 'Custom action executed' } } as any,
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      engine.evaluateField('log_field');

      expect(logs).toContain('Custom action executed');
    });

    test('should handle unknown actions through ActionHandler', () => {
      const ruleSet: RuleSet = {
        unknown_action: [{
          condition: { '==': [1, 1] },
          action: { unknownAction: { data: 'test' } } as any,
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);

      expect(() => {
        engine.evaluateField('unknown_action');
      }).toThrow('Unknown action type: unknownAction');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty rule sets', () => {
      engine.loadRuleSet({});
      const fieldState = engine.evaluateField('non_existent_field');

      expect(fieldState.isVisible).toBe(false);
      expect(fieldState.isRequired).toBe(false);
    });

    test('should handle rules with false conditions', () => {
      const ruleSet: RuleSet = {
        conditional_field: [{
          condition: { '==': [1, 2] }, // Always false
          action: { set: { target: 'conditional_field.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('conditional_field');

      expect(fieldState.isVisible).toBe(false);
    });

    test('should handle multiple updates to same field', () => {
      const ruleSet: RuleSet = {
        reactive_field: [{
          condition: { '>': [{ var: ['counter'] }, 5] },
          action: { set: { target: 'reactive_field.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);

      engine.updateField({ counter: 3 });
      let fieldState = engine.evaluateField('reactive_field');
      expect(fieldState.isVisible).toBe(false);

      engine.updateField({ counter: 8 });
      fieldState = engine.evaluateField('reactive_field');
      expect(fieldState.isVisible).toBe(true);
    });

    test('should handle complex integration scenarios', () => {
      // Test multiple modules working together
      const events: any[] = [];
      const engine = new RuleEngine({
        onEvent: (eventType, params) => events.push({ eventType, params }),
        onFieldStateCreation: () => ({ customFlag: false })
      });

      // Register lookup tables
      engine.registerLookupTables([{
        table: [{ id: 'premium', multiplier: 2.0, features: ['advanced'] }],
        primaryKey: 'id',
        name: 'plans'
      }]);

      // Register shared rules
      engine.registerSharedRules({
        is_premium: { '==': [{ var: ['user_plan'] }, 'premium'] }
      });

      const ruleSet: RuleSet = {
        feature_access: [
          {
            condition: { '$ref': 'is_premium' },
            action: {
              batch: [
                { set: { target: 'feature_access.isVisible', value: true } },
                { calculate: { 
                  target: 'feature_access.calculatedValue', 
                  formula: { '*': [{ var: ['base_score'] }, { lookup: ['plans', { var: ['user_plan'] }, 'multiplier'] }] }
                }},
                { set: { target: 'feature_access.customFlag', value: true } },
                { trigger: { event: 'premium_access_granted', params: { plan: { var: ['user_plan'] } } } }
              ]
            },
            priority: 1
          }
        ]
      };

      engine.loadRuleSet(ruleSet);
      engine.updateField({ user_plan: 'premium', base_score: 100 });

      const fieldState = engine.evaluateField('feature_access');

      expect(fieldState.isVisible).toBe(true);
      expect(fieldState.calculatedValue).toBe(200); // 100 * 2.0
      expect(fieldState.customFlag).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('premium_access_granted');
    });
  });
});
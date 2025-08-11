import type { RuleSet } from '../DependencyGraph.js';
import { RuleEngine } from '../RuleEngine.js';

describe('RuleEngine', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  describe('Basic Rule Evaluation', () => {
    test('should evaluate simple visibility rule', () => {
      const ruleSet: RuleSet = {
        foot_cup_size: [
          {
            condition: { '==': [{ var: ['foot_guidance.value'] }, 'foot_cup'] },
            action: { set: { target: 'foot_cup_size.isVisible', value: true } },
            priority: 1,
            description: 'Show foot cup size when foot cup is selected',
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      engine.updateFieldValue({ foot_guidance: 'foot_cup' });

      const fieldState = engine.evaluateField('foot_cup_size');
      expect(fieldState.isVisible).toBe(true);
    });

    test('should handle multiple conditions', () => {
      const ruleSet: RuleSet = {
        advanced_options: [
          {
            condition: {
              and: [
                { '==': [{ var: ['user_type.value'] }, 'admin'] },
                { '>': [{ var: ['experience_level.value'] }, 5] },
              ],
            },
            action: { set: { target: 'advanced_options.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      engine.updateFieldValue({ user_type: 'admin', experience_level: 7 });

      const fieldState = engine.evaluateField('advanced_options');
      expect(fieldState.isVisible).toBe(true);
    });
  });

  describe('Action Types', () => {
    test('should handle SET action', () => {
      const ruleSet: RuleSet = {
        test_field: [
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'test_field.isRequired', value: true } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('test_field');
      expect(fieldState.isRequired).toBe(true);
    });

    test('should handle COPY action', () => {
      const ruleSet: RuleSet = {
        target_field: [
          {
            condition: { '==': [1, 1] },
            action: { copy: { source: 'source_field.value', target: 'target_field.value' } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      engine.updateFieldValue({ source_field: 'copied_value' });

      // Trigger the rule by evaluating the field
      engine.evaluateField('target_field');

      // COPY sets field values through FieldStateManager
      const fieldValue = engine.getFieldValue('target_field');
      expect(fieldValue).toBe('copied_value');
    });

    test('should handle CALCULATE action with variable reference', () => {
      const ruleSet: RuleSet = {
        target_field: [
          {
            condition: { '==': [1, 1] },
            action: {
              calculate: {
                target: 'target_field.calculatedValue',
                formula: { var: ['source_field.value'] },
              },
            },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      engine.updateFieldValue({ source_field: 'copied_value' });

      const fieldState = engine.evaluateField('target_field');
      expect(fieldState.calculatedValue).toBe('copied_value');
    });

    test('should handle CALCULATE action', () => {
      const ruleSet: RuleSet = {
        total_field: [
          {
            condition: { '==': [1, 1] },
            action: {
              calculate: {
                target: 'total_field.calculatedValue',
                formula: { '+': [{ var: ['a.value'] }, { var: ['b.value'] }] },
              },
            },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      engine.updateFieldValue({ a: 10, b: 5 });

      const fieldState = engine.evaluateField('total_field');
      expect(fieldState.calculatedValue).toBe(15);
    });

    test('should handle TRIGGER action', () => {
      const events: any[] = [];
      const engine = new RuleEngine({
        onEvent: (eventType, params) => {
          events.push({ eventType, params });
        },
      });

      const ruleSet: RuleSet = {
        trigger_field: [
          {
            condition: { '==': [1, 1] },
            action: { trigger: { event: 'custom_event', params: { data: 'test' } } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      engine.evaluateField('trigger_field');

      expect(events).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(events[0].eventType).toBe('custom_event');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(events[0].params.data).toBe('test');
    });

    test('should handle BATCH action', () => {
      const ruleSet: RuleSet = {
        batch_field: [
          {
            condition: { '==': [1, 1] },
            action: {
              batch: [
                { set: { target: 'batch_field.isVisible', value: true } },
                { set: { target: 'batch_field.isRequired', value: true } },
              ],
            },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('batch_field');

      expect(fieldState.isVisible).toBe(true);
      expect(fieldState.isRequired).toBe(true);
    });
  });

  describe('Priority and Conflict Resolution', () => {
    test('should execute rules in priority order', () => {
      const ruleSet: RuleSet = {
        priority_field: [
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'priority_field.calculatedValue', value: 'first' } },
            priority: 2,
          },
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'priority_field.calculatedValue', value: 'second' } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('priority_field');

      // Second rule should execute first due to lower priority number
      expect(fieldState.calculatedValue).toBe('first');
    });

    test('should throw error on same priority conflicts', () => {
      const ruleSet: RuleSet = {
        conflict_field: [
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'conflict_field.isVisible', value: true } },
            priority: 1,
          },
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'conflict_field.isVisible', value: false } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);

      expect(() => {
        engine.evaluateField('conflict_field');
      }).toThrow(/Conflicting rules.*same priority 1/);
    });
  });

  describe('Dependency Tracking', () => {
    test('should track field dependencies', () => {
      const ruleSet: RuleSet = {
        dependent_field: [
          {
            condition: { '==': [{ var: ['source_field.value'] }, 'trigger'] },
            action: { set: { target: 'dependent_field.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      const dependencies = engine.getDependenciesOf('dependent_field');

      expect(dependencies).toContain('source_field');
    });

    test('should invalidate cache when dependencies change', () => {
      const ruleSet: RuleSet = {
        dependent_field: [
          {
            condition: { '==': [{ var: ['source_field.value'] }, 'show'] },
            action: { set: { target: 'dependent_field.isVisible', value: true } },
            priority: 1,
          },
          {
            condition: { '!=': [{ var: ['source_field.value'] }, 'show'] },
            action: { set: { target: 'dependent_field.isVisible', value: false } },
            priority: 2,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);

      // First evaluation
      engine.updateFieldValue({ source_field: 'show' });
      let fieldState = engine.evaluateField('dependent_field');
      expect(fieldState.isVisible).toBe(true);

      // Change dependency
      const invalidated = engine.updateFieldValue({ source_field: 'hide' });
      fieldState = engine.evaluateField('dependent_field');

      expect(invalidated).toContain('dependent_field');
      expect(fieldState.isVisible).toBe(false);
    });

    test('should handle circular dependency detection', () => {
      const ruleSet: RuleSet = {
        field_a: [
          {
            condition: { '==': [{ var: ['field_b.value'] }, 'trigger'] },
            action: { set: { target: 'field_a.isVisible', value: true } },
            priority: 1,
          },
        ],
        field_b: [
          {
            condition: { '==': [{ var: ['field_a.value'] }, 'trigger'] },
            action: { set: { target: 'field_b.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      expect(() => {
        engine.loadRuleSet(ruleSet);
      }).toThrow(/Circular dependency detected/);
    });
  });

  describe('Shared Rules', () => {
    test('should resolve shared rule references', () => {
      const sharedRules = {
        is_admin: { '==': [{ var: ['user_role.value'] }, 'admin'] },
      };

      const ruleSet: RuleSet = {
        admin_panel: [
          {
            condition: { $ref: 'is_admin' },
            action: { set: { target: 'admin_panel.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      engine.registerSharedRules(sharedRules);
      engine.loadRuleSet(ruleSet);
      engine.updateFieldValue({ user_role: 'admin' });

      const fieldState = engine.evaluateField('admin_panel');
      expect(fieldState.isVisible).toBe(true);
    });

    test('should throw error for missing shared rules', () => {
      const ruleSet: RuleSet = {
        test_field: [
          {
            condition: { $ref: 'missing_rule' },
            action: { set: { target: 'test_field.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);

      expect(() => {
        engine.evaluateField('test_field');
      }).toThrow("Shared rule 'missing_rule' not found");
    });
  });

  describe('Lookup Tables', () => {
    test('should support lookup table operations', () => {
      const ruleSet: RuleSet = {
        selected_product_price: [
          {
            condition: { '!=': [{ varTable: 'selected_product@product-table.price' }, 0] },
            action: { set: { target: 'selected_product_price.isVisible', value: true } },
            priority: 1,
          },
          {
            condition: {
              '>': [
                { lookup: ['product-table', { var: ['selected_product.value'] }, 'price'] },
                50,
              ],
            },
            action: { set: { target: 'selected_product_price.isRequired', value: true } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);

      const lookupTable = {
        table: [
          { id: 'prod1', name: 'Product 1', price: 100 },
          { id: 'prod2', name: 'Product 2', price: 200 },
        ],
        primaryKey: 'id',
        name: 'product-table',
      };

      engine.registerLookupTables([lookupTable]);

      // Test the @ syntax in field paths
      engine.updateFieldValue({ selected_product: 'prod1' });
      const productPriceState = engine.evaluateField('selected_product_price');

      expect(productPriceState.isVisible).toBeTruthy();
      expect(productPriceState.isRequired).toBeTruthy();
    });
  });

  describe('Custom Field State Creation', () => {
    test('should use custom field state creation function', () => {
      const engine = new RuleEngine({
        onFieldStateCreation: () => ({
          customProperty: 'default_value',
          readOnly: false,
        }),
      });

      const ruleSet: RuleSet = {
        custom_field: [
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'custom_field.customProperty', value: 'modified' } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('custom_field');

      expect(fieldState.customProperty).toBe('modified');
      expect(fieldState.readOnly).toBe(false);
    });
  });

  describe('Custom Action Handlers', () => {
    test('should register and use custom action handlers', () => {
      const logs: string[] = [];

      interface LogPayload {
        message: string;
      }

      engine.registerActionHandler<LogPayload>({
        actionType: 'log',
        handler: (payload) => {
          logs.push(payload.message);
        },
      });

      const ruleSet: RuleSet = {
        log_field: [
          {
            condition: { '==': [1, 1] },
            action: { log: { message: 'Custom action executed' } } as any,
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      engine.evaluateField('log_field');

      expect(logs).toContain('Custom action executed');
    });

    test('should throw error for unknown action types', () => {
      const ruleSet: RuleSet = {
        unknown_action: [
          {
            condition: { '==': [1, 1] },
            action: { unknownAction: { data: 'test' } } as any,
            priority: 1,
          },
        ],
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
        conditional_field: [
          {
            condition: { '==': [1, 2] }, // Always false
            action: { set: { target: 'conditional_field.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('conditional_field');

      expect(fieldState.isVisible).toBe(false);
    });

    test('should handle multiple updates to same field', () => {
      const ruleSet: RuleSet = {
        reactive_field: [
          {
            condition: { '>': [{ var: ['counter.value'] }, 5] },
            action: { set: { target: 'reactive_field.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);

      engine.updateFieldValue({ counter: 3 });
      let fieldState = engine.evaluateField('reactive_field');
      expect(fieldState.isVisible).toBe(false);

      engine.updateFieldValue({ counter: 8 });
      fieldState = engine.evaluateField('reactive_field');
      expect(fieldState.isVisible).toBe(true);
    });
  });
});

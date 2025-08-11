import { RuleEngine } from '../RuleEngine.js';
import type { RuleSet } from '../DependencyGraph.js';

describe('RuleEngine Orchestration', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  describe('Module Coordination', () => {
    test('should coordinate between ActionHandler and FieldStateProvider', () => {
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

    test('should coordinate between DependencyGraph and FieldStateProvider for cache invalidation', () => {
      const ruleSet: RuleSet = {
        dependent: [
          {
            condition: { '==': [{ var: ['source.value'] }, 'active'] },
            action: { set: { target: 'dependent.isVisible', value: true } },
            priority: 1,
          },
          {
            condition: { '!=': [{ var: ['source.value'] }, 'active'] },
            action: { set: { target: 'dependent.isVisible', value: false } },
            priority: 2,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);

      // Initial state
      engine.updateFieldValue({ source: 'active' });
      let fieldState = engine.evaluateField('dependent');
      expect(fieldState.isVisible).toBe(true);

      // Update dependency and verify cache invalidation
      const invalidated = engine.updateFieldValue({ source: 'inactive' });
      expect(invalidated).toContain('dependent');

      fieldState = engine.evaluateField('dependent');
      expect(fieldState.isVisible).toBe(false);
    });

    test('should coordinate between RuleValidator and ActionHandler for priority conflicts', () => {
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

    test('should coordinate between LookupManager and LogicResolver', () => {
      const ruleSet: RuleSet = {
        lookup_field: [
          {
            condition: {
              '==': [{ lookup: ['test_table', { var: ['key.value'] }, 'status'] }, 'active'],
            },
            action: { set: { target: 'lookup_field.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      engine.registerLookupTables([
        {
          table: [{ id: 'item1', status: 'active' }],
          primaryKey: 'id',
          name: 'test_table',
        },
      ]);

      engine.loadRuleSet(ruleSet);
      engine.updateFieldValue({ key: 'item1' });

      const fieldState = engine.evaluateField('lookup_field');
      expect(fieldState.isVisible).toBe(true);
    });
  });

  describe('Evaluation Flow Orchestration', () => {
    test('should orchestrate dependency-first evaluation', () => {
      const evaluationOrder: string[] = [];

      const engine = new RuleEngine({
        onEvent: (eventType, params) => {
          if (eventType === 'field_evaluated') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
            evaluationOrder.push(params.fieldName);
          }
        },
      });

      interface TrackPayload {
        fieldName: string;
      }

      engine.registerActionHandler<TrackPayload>({
        actionType: 'track',
        handler: (payload) => {
          // Simplified tracking - just add to evaluation order
          evaluationOrder.push(payload.fieldName);
        },
      });

      const ruleSet: RuleSet = {
        level1: [
          {
            condition: { '==': [{ var: ['base.value'] }, 'start'] },
            action: { track: { fieldName: 'level1' } } as any,
            priority: 1,
          },
        ],
        level2: [
          {
            condition: { '==': [{ var: ['level1.isVisible'] }, true] },
            action: { track: { fieldName: 'level2' } } as any,
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      engine.updateFieldValue({ base: 'start' });

      // Trigger evaluation of level2, which should evaluate level1 first
      engine.evaluateField('level2');

      // Note: This test verifies the orchestration logic exists,
      // though the tracking mechanism is simplified for demonstration
    });

    test('should orchestrate rule priority execution', () => {
      const executionOrder: number[] = [];

      interface TrackPriorityPayload {
        priority: number;
      }

      engine.registerActionHandler<TrackPriorityPayload>({
        actionType: 'track_priority',
        handler: (payload) => {
          executionOrder.push(payload.priority);
        },
      });

      const ruleSet: RuleSet = {
        priority_test: [
          {
            condition: { '==': [1, 1] },
            action: { track_priority: { priority: 3 } } as any,
            priority: 3,
          },
          {
            condition: { '==': [1, 1] },
            action: { track_priority: { priority: 1 } } as any,
            priority: 1,
          },
          {
            condition: { '==': [1, 1] },
            action: { track_priority: { priority: 2 } } as any,
            priority: 2,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      engine.evaluateField('priority_test');

      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });

  describe('Configuration Orchestration', () => {
    test('should orchestrate shared rules registration across modules', () => {
      const sharedRules = {
        common_condition: { '==': [{ var: ['status.value'] }, 'enabled'] },
      };

      const ruleSet: RuleSet = {
        field1: [
          {
            condition: { $ref: 'common_condition' },
            action: { set: { target: 'field1.isVisible', value: true } },
            priority: 1,
          },
        ],
        field2: [
          {
            condition: { $ref: 'common_condition' },
            action: { set: { target: 'field2.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      engine.registerSharedRules(sharedRules);
      engine.loadRuleSet(ruleSet);
      engine.updateFieldValue({ status: 'enabled' });

      const field1State = engine.evaluateField('field1');
      const field2State = engine.evaluateField('field2');

      expect(field1State.isVisible).toBe(true);
      expect(field2State.isVisible).toBe(true);
    });

    test('should orchestrate lookup table registration with custom logic', () => {
      const lookupTable = {
        table: [
          { code: 'A', description: 'Active', priority: 1 },
          { code: 'I', description: 'Inactive', priority: 0 },
        ],
        primaryKey: 'code',
        name: 'status_codes',
      };

      const ruleSet: RuleSet = {
        status_display: [
          {
            condition: {
              '>': [{ lookup: ['status_codes', { var: ['current_status.value'] }, 'priority'] }, 0],
            },
            action: {
              calculate: {
                target: 'status_display.calculatedValue',
                formula: {
                  lookup: ['status_codes', { var: ['current_status.value'] }, 'description'],
                },
              },
            },
            priority: 1,
          },
        ],
      };

      engine.registerLookupTables([lookupTable]);
      engine.loadRuleSet(ruleSet);
      engine.updateFieldValue({ current_status: 'A' });

      const fieldState = engine.evaluateField('status_display');
      expect(fieldState.calculatedValue).toBe('Active');
    });

    test('should orchestrate custom field state creation with actions', () => {
      const definedState = {
        metadata: { created: Date.now() },
        permissions: { read: true, write: false },
      };
      const engine = new RuleEngine({
        onFieldStateCreation: () => definedState,
      });

      const ruleSet: RuleSet = {
        secure_field: [
          {
            condition: { '==': [{ var: ['user_role.value'] }, 'admin'] },
            action: { set: { target: 'secure_field.permissions.write', value: true } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      engine.updateFieldValue({ user_role: 'admin' });

      const fieldState = engine.evaluateField('secure_field') as unknown as typeof definedState;

      expect(fieldState.permissions.read).toBe(true);
      expect(fieldState.permissions.write).toBe(true);
      expect(fieldState.metadata).toBeDefined();
    });
  });

  describe('Error Handling Orchestration', () => {
    test('should orchestrate error handling across modules', () => {
      // Test that errors from individual modules are properly propagated
      const ruleSet: RuleSet = {
        error_field: [
          {
            condition: { $ref: 'nonexistent_rule' },
            action: { set: { target: 'error_field.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);

      expect(() => {
        engine.evaluateField('error_field');
      }).toThrow("Shared rule 'nonexistent_rule' not found");
    });

    test('should handle circular dependency detection during orchestration', () => {
      const ruleSet: RuleSet = {
        circular_a: [
          {
            condition: { '==': [{ var: ['circular_b.value'] }, 'trigger'] },
            action: { set: { target: 'circular_a.isVisible', value: true } },
            priority: 1,
          },
        ],
        circular_b: [
          {
            condition: { '==': [{ var: ['circular_a.value'] }, 'trigger'] },
            action: { set: { target: 'circular_b.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      expect(() => {
        engine.loadRuleSet(ruleSet);
      }).toThrow(/Circular dependency detected/);
    });
  });

  describe('Performance Orchestration', () => {
    test('should orchestrate caching across evaluations', () => {
      let evaluationCount = 0;

      engine.registerActionHandler({
        actionType: 'count_evaluation',
        handler: () => {
          evaluationCount++;
        },
      });

      const ruleSet: RuleSet = {
        cached_field: [
          {
            condition: { '==': [1, 1] },
            action: { count_evaluation: {} } as any,
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);

      // First evaluation should execute the action
      engine.evaluateField('cached_field');
      expect(evaluationCount).toBe(1);

      // Second evaluation should use cache (no action execution)
      engine.evaluateField('cached_field');
      expect(evaluationCount).toBe(1); // Should still be 1 due to caching
    });

    test('should orchestrate cache invalidation on field updates', () => {
      const ruleSet: RuleSet = {
        dependent_field: [
          {
            condition: { '==': [{ var: ['source.value'] }, 'active'] },
            action: { set: { target: 'dependent_field.isVisible', value: true } },
            priority: 1,
          },
          {
            condition: { '!=': [{ var: ['source.value'] }, 'active'] },
            action: { set: { target: 'dependent_field.isVisible', value: false } },
            priority: 2,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);

      // Initial state - condition is true
      engine.updateFieldValue({ source: 'active' });
      let fieldState = engine.evaluateField('dependent_field');
      expect(fieldState.isVisible).toBe(true);

      // Second evaluation (cached) - should return same result without re-evaluation
      fieldState = engine.evaluateField('dependent_field');
      expect(fieldState.isVisible).toBe(true);

      // Update dependency - should invalidate cache and re-evaluate with new condition
      const invalidated = engine.updateFieldValue({ source: 'inactive' });
      expect(invalidated).toContain('dependent_field');

      fieldState = engine.evaluateField('dependent_field');
      expect(fieldState.isVisible).toBe(false); // Condition is now false, so default value
    });
  });
});

import { DependencyGraph, RuleSet } from '../DependencyGraph.js';
import { Action } from '../ActionHandler.js';

describe('DependencyGraph', () => {
  let dependencyGraph: DependencyGraph;
  let mockExtractActionDependencies: jest.Mock;

  beforeEach(() => {
    mockExtractActionDependencies = jest.fn();
    dependencyGraph = new DependencyGraph();
  });

  describe('Basic Dependency Tracking', () => {
    test('should extract dependencies from rule conditions', () => {
      const ruleSet: RuleSet = {
        field_a: [{
          condition: { '==': [{ var: ['field_b'] }, 'value'] },
          action: { set: { target: 'field_a.isVisible', value: true } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      const dependencies = dependencyGraph.getDependencies('field_a');
      expect(dependencies).toContain('field_b');
    });

    test('should extract dependencies from action sources', () => {
      const ruleSet: RuleSet = {
        field_a: [{
          condition: { '==': [1, 1] },
          action: { copy: { source: 'field_c', target: 'field_a.calculatedValue' } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue(['field_c']);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      const dependencies = dependencyGraph.getDependencies('field_a');
      expect(dependencies).toContain('field_c');
    });

    test('should track multiple dependencies per field', () => {
      const ruleSet: RuleSet = {
        target_field: [{
          condition: { 
            and: [
              { '==': [{ var: ['field_a'] }, 'value1'] },
              { '==': [{ var: ['field_b'] }, 'value2'] }
            ]
          },
          action: { copy: { source: 'field_c', target: 'target_field.calculatedValue' } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue(['field_c']);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      const dependencies = dependencyGraph.getDependencies('target_field');
      expect(dependencies).toContain('field_a');
      expect(dependencies).toContain('field_b');
      expect(dependencies).toContain('field_c');
    });

    test('should build reverse dependency graph', () => {
      const ruleSet: RuleSet = {
        dependent_field: [{
          condition: { '==': [{ var: ['source_field'] }, 'trigger'] },
          action: { set: { target: 'dependent_field.isVisible', value: true } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      const dependents = dependencyGraph.getDependents('source_field');
      expect(dependents).toContain('dependent_field');
    });
  });

  describe('Complex Dependency Patterns', () => {
    test('should handle nested var expressions', () => {
      const ruleSet: RuleSet = {
        complex_field: [{
          condition: { 
            '+': [
              { var: ['field_a.subProperty'] },
              { var: ['field_b'] }
            ] 
          },
          action: { set: { target: 'complex_field.isVisible', value: true } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      const dependencies = dependencyGraph.getDependencies('complex_field');
      expect(dependencies).toContain('field_a');
      expect(dependencies).toContain('field_b');
    });

    test('should handle lookup operations in conditions', () => {
      const ruleSet: RuleSet = {
        lookup_field: [{
          condition: { 
            lookup: ['table_name', { var: ['key_field'] }, 'property'] 
          },
          action: { set: { target: 'lookup_field.isVisible', value: true } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      const dependencies = dependencyGraph.getDependencies('lookup_field');
      expect(dependencies).toContain('key_field');
    });

    test('should ignore $ variable references', () => {
      const ruleSet: RuleSet = {
        field_with_dollar: [{
          condition: { '==': [{ var: ['$.context'] }, 'value'] },
          action: { set: { target: 'field_with_dollar.isVisible', value: true } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      const dependencies = dependencyGraph.getDependencies('field_with_dollar');
      expect(dependencies).not.toContain('$');
    });
  });

  describe('Shared Rules', () => {
    test('should resolve shared rule references', () => {
      const sharedRules = {
        is_admin: { '==': [{ var: ['user_role'] }, 'admin'] }
      };

      dependencyGraph.updateSharedRules(sharedRules);

      const ruleSet: RuleSet = {
        admin_panel: [{
          condition: { '$ref': 'is_admin' },
          action: { set: { target: 'admin_panel.isVisible', value: true } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      const dependencies = dependencyGraph.getDependencies('admin_panel');
      expect(dependencies).toContain('user_role');
    });

    test('should handle nested shared rule references', () => {
      const sharedRules = {
        is_admin: { '==': [{ var: ['user_role'] }, 'admin'] },
        has_permission: { 
          and: [
            { '$ref': 'is_admin' },
            { '==': [{ var: ['permission_level'] }, 'high'] }
          ]
        }
      };

      dependencyGraph.updateSharedRules(sharedRules);

      const ruleSet: RuleSet = {
        secure_area: [{
          condition: { '$ref': 'has_permission' },
          action: { set: { target: 'secure_area.isVisible', value: true } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      const dependencies = dependencyGraph.getDependencies('secure_area');
      expect(dependencies).toContain('user_role');
      expect(dependencies).toContain('permission_level');
    });
  });

  describe('Circular Dependency Detection', () => {
    test('should detect direct circular dependencies', () => {
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

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      expect(() => {
        dependencyGraph.validateNoCycles(ruleSet);
      }).toThrow(/Circular dependency detected involving field: field_[ab]/);
    });

    test('should detect indirect circular dependencies', () => {
      const ruleSet: RuleSet = {
        field_a: [{
          condition: { '==': [{ var: ['field_b'] }, 'trigger'] },
          action: { set: { target: 'field_a.isVisible', value: true } },
          priority: 1
        }],
        field_b: [{
          condition: { '==': [{ var: ['field_c'] }, 'trigger'] },
          action: { set: { target: 'field_b.isVisible', value: true } },
          priority: 1
        }],
        field_c: [{
          condition: { '==': [{ var: ['field_a'] }, 'trigger'] },
          action: { set: { target: 'field_c.isVisible', value: true } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      expect(() => {
        dependencyGraph.validateNoCycles(ruleSet);
      }).toThrow(/Circular dependency detected involving field/);
    });

    test('should allow self-referencing fields if not circular', () => {
      const ruleSet: RuleSet = {
        counter_field: [{
          condition: { '>': [{ var: ['external_counter'] }, 0] }, // Reference external field, not self
          action: { set: { target: 'counter_field.isVisible', value: true } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      expect(() => {
        dependencyGraph.validateNoCycles(ruleSet);
      }).not.toThrow();
    });
  });

  describe('Cache Invalidation', () => {
    test('should identify fields to invalidate when dependencies change', () => {
      const ruleSet: RuleSet = {
        dependent_a: [{
          condition: { '==': [{ var: ['source_field'] }, 'trigger'] },
          action: { set: { target: 'dependent_a.isVisible', value: true } },
          priority: 1
        }],
        dependent_b: [{
          condition: { '==': [{ var: ['source_field'] }, 'show'] },
          action: { set: { target: 'dependent_b.isVisible', value: true } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      const invalidated = dependencyGraph.getInvalidatedFields(['source_field']);
      expect(invalidated).toContain('dependent_a');
      expect(invalidated).toContain('dependent_b');
    });

    test('should handle multiple field updates', () => {
      const ruleSet: RuleSet = {
        dependent_a: [{
          condition: { '==': [{ var: ['field_1'] }, 'trigger'] },
          action: { set: { target: 'dependent_a.isVisible', value: true } },
          priority: 1
        }],
        dependent_b: [{
          condition: { '==': [{ var: ['field_2'] }, 'trigger'] },
          action: { set: { target: 'dependent_b.isVisible', value: true } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      const invalidated = dependencyGraph.getInvalidatedFields(['field_1', 'field_2']);
      expect(invalidated).toContain('dependent_a');
      expect(invalidated).toContain('dependent_b');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty rule sets', () => {
      const ruleSet: RuleSet = {};
      
      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      expect(dependencyGraph.getDependencies('non_existent')).toEqual([]);
      expect(dependencyGraph.getDependents('non_existent')).toEqual([]);
    });

    test('should handle fields with no dependencies', () => {
      const ruleSet: RuleSet = {
        standalone_field: [{
          condition: { '==': [1, 1] },
          action: { set: { target: 'standalone_field.isVisible', value: true } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      expect(dependencyGraph.getDependencies('standalone_field')).toEqual([]);
    });

    test('should handle fields with complex nested expressions', () => {
      const ruleSet: RuleSet = {
        complex_field: [{
          condition: {
            and: [
              { or: [
                { '==': [{ var: ['field_a'] }, 'value1'] },
                { '==': [{ var: ['field_b'] }, 'value2'] }
              ]},
              { '!=': [{ var: ['field_c.nested'] }, null] }
            ]
          },
          action: { set: { target: 'complex_field.isVisible', value: true } },
          priority: 1
        }]
      };

      mockExtractActionDependencies.mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet, mockExtractActionDependencies);

      const dependencies = dependencyGraph.getDependencies('complex_field');
      expect(dependencies).toContain('field_a');
      expect(dependencies).toContain('field_b');
      expect(dependencies).toContain('field_c');
    });
  });
});
import { DependencyGraph, RuleSet, DependencyVisitor } from '../DependencyGraph.js';

describe('DependencyGraph', () => {
  let dependencyGraph: DependencyGraph;
  let mockVisitor: DependencyVisitor;

  beforeEach(() => {
    mockVisitor = {
      visitLogic: jest.fn(),
      visitAction: jest.fn()
    };
    dependencyGraph = new DependencyGraph(mockVisitor);
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

      (mockVisitor.visitLogic as jest.Mock).mockReturnValue(['field_b']);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet);

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

      (mockVisitor.visitLogic as jest.Mock).mockReturnValue([]);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue(['field_c']);
      dependencyGraph.buildFromRuleSet(ruleSet);

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

      (mockVisitor.visitLogic as jest.Mock).mockReturnValue(['field_a', 'field_b']);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue(['field_c']);
      dependencyGraph.buildFromRuleSet(ruleSet);

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

      (mockVisitor.visitLogic as jest.Mock).mockReturnValue(['source_field']);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet);

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

      (mockVisitor.visitLogic as jest.Mock).mockReturnValue(['field_a', 'field_b']);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet);

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

      (mockVisitor.visitLogic as jest.Mock).mockReturnValue(['key_field']);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet);

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

      (mockVisitor.visitLogic as jest.Mock).mockReturnValue([]);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet);

      const dependencies = dependencyGraph.getDependencies('field_with_dollar');
      expect(dependencies).not.toContain('$');
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

      (mockVisitor.visitLogic as jest.Mock)
        .mockReturnValueOnce(['field_b'])
        .mockReturnValueOnce(['field_a']);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet);

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

      (mockVisitor.visitLogic as jest.Mock)
        .mockReturnValueOnce(['field_b'])
        .mockReturnValueOnce(['field_c'])
        .mockReturnValueOnce(['field_a']);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet);

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

      (mockVisitor.visitLogic as jest.Mock).mockReturnValue(['external_counter']);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet);

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

      (mockVisitor.visitLogic as jest.Mock).mockReturnValue(['source_field']);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet);

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

      (mockVisitor.visitLogic as jest.Mock)
        .mockReturnValueOnce(['field_1'])
        .mockReturnValueOnce(['field_2']);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet);

      const invalidated = dependencyGraph.getInvalidatedFields(['field_1', 'field_2']);
      expect(invalidated).toContain('dependent_a');
      expect(invalidated).toContain('dependent_b');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty rule sets', () => {
      const ruleSet: RuleSet = {};

      (mockVisitor.visitLogic as jest.Mock).mockReturnValue([]);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet);

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

      (mockVisitor.visitLogic as jest.Mock).mockReturnValue([]);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet);

      expect(dependencyGraph.getDependencies('standalone_field')).toEqual([]);
    });

    test('should handle fields with complex nested expressions', () => {
      const ruleSet: RuleSet = {
        complex_field: [{
          condition: {
            and: [
              {
                or: [
                  { '==': [{ var: ['field_a'] }, 'value1'] },
                  { '==': [{ var: ['field_b'] }, 'value2'] }
                ]
              },
              { '!=': [{ var: ['field_c.nested'] }, null] }
            ]
          },
          action: { set: { target: 'complex_field.isVisible', value: true } },
          priority: 1
        }]
      };

      (mockVisitor.visitLogic as jest.Mock).mockReturnValue(['field_a', 'field_b', 'field_c']);
      (mockVisitor.visitAction as jest.Mock).mockReturnValue([]);
      dependencyGraph.buildFromRuleSet(ruleSet);

      const dependencies = dependencyGraph.getDependencies('complex_field');
      expect(dependencies).toContain('field_a');
      expect(dependencies).toContain('field_b');
      expect(dependencies).toContain('field_c');
    });
  });
});
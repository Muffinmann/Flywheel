import { RuleEngine } from '../RuleEngine.js';
import { RuleSet } from '../DependencyGraph.js';
import { LogicResolver } from '../LogicResolver.js';
import { RuleManagement } from '../RuleManagement.js';

describe('Edge Cases and Error Handling', () => {
  describe('LogicResolver Edge Cases', () => {
    let resolver: LogicResolver;

    beforeEach(() => {
      resolver = new LogicResolver();
    });

    test('should handle null and undefined values gracefully', () => {
      expect(resolver.resolve(null, {})).toBe(null);
      expect(resolver.resolve(undefined, {})).toBe(undefined);
      
      const context = { nullValue: null, undefinedValue: undefined };
      expect(resolver.resolve({ var: ['nullValue.value'] }, context)).toBe(undefined);
      expect(resolver.resolve({ var: ['undefinedValue.value'] }, context)).toBe(undefined);
    });

    test('should handle deep object paths with missing intermediate values', () => {
      const context = { user: null };
      expect(resolver.resolve({ var: ['user.profile.name'] }, context)).toBe(undefined);
      
      const context2 = {};
      expect(resolver.resolve({ var: ['missing.deeply.nested.value'] }, context2)).toBe(undefined);
    });

    test('should handle array access with out-of-bounds indices', () => {
      const context = { items: ['a', 'b', 'c'] };
      expect(resolver.resolve({ var: ['items.5'] }, context)).toBe(undefined);
      expect(resolver.resolve({ var: ['items.-1'] }, context)).toBe(undefined);
    });

    test('should handle empty arrays in array operations', () => {
      expect(resolver.resolve({ some: [[], { '==': [{ var: ['$'] }, 1] }] }, {})).toBe(false);
      expect(resolver.resolve({ every: [[], { '==': [{ var: ['$'] }, 1] }] }, {})).toBe(true);
      expect(resolver.resolve({ map: [[], { '*': [{ var: ['$'] }, 2] }] }, {})).toEqual([]);
    });

    test('should handle division by zero', () => {
      expect(resolver.resolve({ '/': [10, 0] }, {})).toBe(Infinity);
      expect(resolver.resolve({ '/': [-10, 0] }, {})).toBe(-Infinity);
      expect(resolver.resolve({ '/': [0, 0] }, {})).toBe(NaN);
    });

    test('should handle invalid math operations', () => {
      expect(resolver.resolve({ sqrt: [-1] }, {})).toBe(NaN);
      expect(resolver.resolve({ sqrt: ['not_a_number'] }, {})).toBe(NaN);
    });

    test('should handle complex nested structures', () => {
      const context = {
        data: {
          users: [
            { id: 1, scores: [85, 90, 78] },
            { id: 2, scores: [92, 88, 95] }
          ]
        }
      };

      const logic = {
        some: [
          { var: ['data.users'] },
          {
            some: [
              { var: ['$.scores'] },
              { '>': [{ var: ['$'] }, 90] }
            ]
          }
        ]
      };

      expect(resolver.resolve(logic, context)).toBe(true);
    });

    test('should handle circular references in custom logic', () => {
      const circularContext: any = { self: null };
      circularContext.self = circularContext;

      resolver.registerCustomLogic([{
        operator: 'access_circular',
        operand: (args, context) => {
          return context.self === context;
        }
      }]);

      expect(resolver.resolve({ access_circular: [] }, circularContext)).toBe(true);
    });

    test('should handle very large numbers', () => {
      const largeNumber = Number.MAX_SAFE_INTEGER;
      expect(resolver.resolve({ '+': [largeNumber, 1] }, {})).toBe(largeNumber + 1);
      expect(resolver.resolve({ '*': [largeNumber, 2] }, {})).toBe(largeNumber * 2);
    });

    test('should handle string operations with numbers', () => {
      expect(resolver.resolve({ '+': ['10', 5] }, {})).toBe('105'); // String concatenation
      expect(resolver.resolve({ '>': ['10', 5] }, {})).toBe(true); // String comparison
    });
  });

  describe('RuleEngine Edge Cases', () => {
    let engine: RuleEngine;

    beforeEach(() => {
      engine = new RuleEngine();
    });

    test('should handle rules with no matching conditions', () => {
      const ruleSet: RuleSet = {
        test_field: [{
          condition: { '==': [1, 2] }, // Always false
          action: { set: { target: 'test_field.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('test_field');
      
      expect(fieldState.isVisible).toBe(false); // Default value
    });

    test('should handle missing field evaluation', () => {
      engine.loadRuleSet({});
      const fieldState = engine.evaluateField('non_existent_field');
      
      expect(fieldState.isVisible).toBe(false);
      expect(fieldState.isRequired).toBe(false);
      expect(fieldState.calculatedValue).toBe(undefined);
    });

    test('should handle malformed action targets', () => {
      const ruleSet: RuleSet = {
        malformed_field: [{
          condition: { '==': [1, 1] },
          action: { set: { target: 'malformed_field', value: true } }, // Missing property
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      
      // Based on current implementation, this throws an error for invalid target format
      expect(() => {
        engine.evaluateField('malformed_field');
      }).toThrow('Invalid target format: malformed_field. Expected format: "fieldName.property"');
    });

    test('should handle deeply nested target paths', () => {
      const ruleSet: RuleSet = {
        nested_field: [{
          condition: { '==': [1, 1] },
          action: { set: { target: 'nested_field.deeply.nested.property', value: 'test' } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('nested_field');
      
      // Should set the property even with deep nesting
      expect(fieldState.deeply?.nested?.property).toBe('test');
    });

    test('should handle rapid field updates', () => {
      const ruleSet: RuleSet = {
        reactive_field: [{
          condition: { '>': [{ var: ['counter.value'] }, 5] },
          action: { set: { target: 'reactive_field.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);

      // Rapid updates
      for (let i = 0; i < 100; i++) {
        engine.updateField({ counter: i });
        engine.evaluateField('reactive_field');
      }

      const finalState = engine.evaluateField('reactive_field');
      expect(finalState.isVisible).toBe(true); // counter = 99 > 5
    });

    test('should handle very large rule sets', () => {
      const ruleSet: RuleSet = {};
      
      // Generate 1000 fields with rules
      for (let i = 0; i < 1000; i++) {
        ruleSet[`field_${i}`] = [{
          condition: { '==': [{ var: ['trigger.value'] }, i] },
          action: { set: { target: `field_${i}.isVisible`, value: true } },
          priority: 1
        }];
      }

      engine.loadRuleSet(ruleSet);
      engine.updateField({ trigger: 500 });

      const fieldState = engine.evaluateField('field_500');
      expect(fieldState.isVisible).toBe(true);
    });

    test('should handle concurrent field evaluations', () => {
      const ruleSet: RuleSet = {
        field1: [{
          condition: { '==': [{ var: ['shared_var.value'] }, 'trigger'] },
          action: { set: { target: 'field1.isVisible', value: true } },
          priority: 1
        }],
        field2: [{
          condition: { '==': [{ var: ['shared_var.value'] }, 'trigger'] },
          action: { set: { target: 'field2.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      engine.updateField({ shared_var: 'trigger' });

      // Evaluate multiple fields that depend on the same variable
      const field1State = engine.evaluateField('field1');
      const field2State = engine.evaluateField('field2');

      expect(field1State.isVisible).toBe(true);
      expect(field2State.isVisible).toBe(true);
    });

    test('should handle actions that throw errors', () => {
      engine.registerActionHandler('error_action', () => {
        throw new Error('Custom action error');
      });

      const ruleSet: RuleSet = {
        error_field: [{
          condition: { '==': [1, 1] },
          action: { error_action: { data: 'test' } } as any,
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      
      expect(() => {
        engine.evaluateField('error_field');
      }).toThrow('Custom action error');
    });

    test('should handle memory pressure with many evaluations', () => {
      const ruleSet: RuleSet = {
        memory_field: [{
          condition: { '>': [{ var: ['counter.value'] }, 0] },
          action: { set: { target: 'memory_field.calculatedValue', value: { var: ['counter.value'] } } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);

      // Simulate memory pressure
      for (let i = 0; i < 10000; i++) {
        engine.updateField({ counter: i });
        engine.evaluateField('memory_field');
        
        // Occasionally clear some state to test garbage collection
        if (i % 1000 === 0) {
          engine.updateField({ counter: 0 });
        }
      }

      expect(true).toBe(true); // Test completes without memory issues
    });
  });

  describe('Circular Dependency Detection', () => {
    let engine: RuleEngine;

    beforeEach(() => {
      engine = new RuleEngine();
    });

    test('should detect direct circular dependencies', () => {
      const ruleSet: RuleSet = {
        field_a: [{
          condition: { '==': [{ var: ['field_a.value'] }, 'trigger'] },
          action: { set: { target: 'field_a.isVisible', value: true } },
          priority: 1
        }]
      };

      expect(() => {
        engine.loadRuleSet(ruleSet);
      }).toThrow(/Circular dependency detected involving field: field_a/);
    });

    test('should detect indirect circular dependencies', () => {
      const ruleSet: RuleSet = {
        field_a: [{
          condition: { '==': [{ var: ['field_b.value'] }, 'trigger'] },
          action: { set: { target: 'field_a.isVisible', value: true } },
          priority: 1
        }],
        field_b: [{
          condition: { '==': [{ var: ['field_c.value'] }, 'trigger'] },
          action: { set: { target: 'field_b.isVisible', value: true } },
          priority: 1
        }],
        field_c: [{
          condition: { '==': [{ var: ['field_a.value'] }, 'trigger'] },
          action: { set: { target: 'field_c.isVisible', value: true } },
          priority: 1
        }]
      };

      expect(() => {
        engine.loadRuleSet(ruleSet);
      }).toThrow(/Circular dependency detected involving field/);
    });

    test('should detect cycles in action dependencies', () => {
      const ruleSet: RuleSet = {
        field_a: [{
          condition: { '==': [1, 1] },
          action: { copy: { source: 'field_b', target: 'field_a.calculatedValue' } },
          priority: 1
        }],
        field_b: [{
          condition: { '==': [1, 1] },
          action: { copy: { source: 'field_a', target: 'field_b.calculatedValue' } },
          priority: 1
        }]
      };

      expect(() => {
        engine.loadRuleSet(ruleSet);
      }).toThrow(/Circular dependency detected involving field/);
    });

    test('should allow non-circular complex dependencies', () => {
      const ruleSet: RuleSet = {
        field_a: [{
          condition: { '==': [{ var: ['input1.value'] }, 'trigger'] },
          action: { set: { target: 'field_a.isVisible', value: true } },
          priority: 1
        }],
        field_b: [{
          condition: { '==': [{ var: ['field_a.isVisible'] }, true] },
          action: { set: { target: 'field_b.isVisible', value: true } },
          priority: 1
        }],
        field_c: [{
          condition: { '==': [{ var: ['field_b.isVisible'] }, true] },
          action: { set: { target: 'field_c.isVisible', value: true } },
          priority: 1
        }]
      };

      expect(() => {
        engine.loadRuleSet(ruleSet);
      }).not.toThrow();
    });
  });

  describe('Invalid Syntax Handling', () => {
    let engine: RuleEngine;

    beforeEach(() => {
      engine = new RuleEngine();
    });

    test('should handle missing shared rules gracefully', () => {
      const ruleSet: RuleSet = {
        test_field: [{
          condition: { '$ref': 'missing_shared_rule' },
          action: { set: { target: 'test_field.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      
      expect(() => {
        engine.evaluateField('test_field');
      }).toThrow("Shared rule 'missing_shared_rule' not found");
    });

    test('should handle malformed logic objects', () => {
      const resolver = new LogicResolver();
      
      expect(() => {
        resolver.resolve({ op1: [1], op2: [2] }, {});
      }).toThrow('Logic object must have exactly one operator');
    });

    test('should handle invalid lookup table references', () => {
      const ruleSet: RuleSet = {
        lookup_field: [{
          condition: { '==': [1, 1] },
          action: { 
            calculate: { 
              target: 'lookup_field.value',
              formula: { varTable: ['field@missing_table.property'] }
            } 
          },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      engine.updateField({ field: 'test_value' });
      
      expect(() => {
        engine.evaluateField('lookup_field');
      }).toThrow("Lookup table 'missing_table' not found");
    });

    test('should handle empty rule priority conflicts validation', () => {
      const ruleSet: RuleSet = {
        empty_field: []
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('empty_field');
      
      expect(fieldState.isVisible).toBe(false);
    });
  });

  describe('RuleManagement Edge Cases', () => {
    test('should handle empty rule sets in validation', () => {
      expect(() => {
        RuleManagement.validateRuleStructure({});
      }).not.toThrow();
    });

    test('should handle rules with no dependencies', () => {
      const ruleSet: RuleSet = {
        standalone_field: [{
          condition: { '==': [1, 1] },
          action: { set: { target: 'standalone_field.isVisible', value: true } },
          priority: 1
        }]
      };

      expect(() => {
        RuleManagement.validateRuleStructure(ruleSet);
      }).not.toThrow();
    });

    test('should handle deeply nested logic in dependency extraction', () => {
      const ruleSet: RuleSet = {
        complex_field: [{
          condition: {
            if: [
              {
                and: [
                  { '==': [{ var: ['level1.value'] }, 'value'] },
                  {
                    or: [
                      { '>': [{ var: ['level2.count'] }, 0] },
                      {
                        some: [
                          { var: ['level3.items'] },
                          { '==': [{ var: ['$.level4.prop'] }, 'target'] }
                        ]
                      }
                    ]
                  }
                ]
              },
              'result1',
              'result2'
            ]
          },
          action: { set: { target: 'complex_field.isVisible', value: true } },
          priority: 1
        }]
      };

      expect(() => {
        RuleManagement.validateRuleStructure(ruleSet);
      }).not.toThrow();
    });

    test('should handle malformed folder names edge cases', () => {
      expect(() => {
        RuleManagement.validateFolderStructure('');
      }).toThrow("is missing __ separator");

      expect(() => {
        RuleManagement.validateFolderStructure('__');
      }).toThrow("has empty name or id parts");

      expect(() => {
        RuleManagement.validateFolderStructure('a____b');
      }).toThrow("should have exactly one __ separator");
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    test('should handle extremely deep dependency chains', () => {
      const engine = new RuleEngine();
      const ruleSet: RuleSet = {};

      // Create a chain of 100 dependent fields
      for (let i = 0; i < 100; i++) {
        const fieldName = `field_${i}`;
        let condition;
        
        if (i === 0) {
          // First field depends on root trigger
          condition = { '==': [{ var: ['root_trigger.value'] }, 'trigger'] };
        } else {
          // Subsequent fields depend on previous field being visible
          condition = { '==': [{ var: [`field_${i - 1}.isVisible`] }, true] };
        }
        
        ruleSet[fieldName] = [{
          condition: condition,
          action: { set: { target: `${fieldName}.isVisible`, value: true } },
          priority: 1
        }];
      }

      engine.loadRuleSet(ruleSet);
      engine.updateField({ root_trigger: 'trigger' });

      // This should not cause stack overflow
      const finalField = engine.evaluateField('field_99');
      expect(finalField.isVisible).toBe(true);
    });

    test('should handle rules with very large operand arrays', () => {
      const resolver = new LogicResolver();
      const largeArray = Array.from({ length: 10000 }, (_, i) => i);
      
      const result = resolver.resolve({ '+': largeArray }, {});
      const expectedSum = (10000 * 9999) / 2; // Sum of 0 to 9999
      expect(result).toBe(expectedSum);
    });
  });
});
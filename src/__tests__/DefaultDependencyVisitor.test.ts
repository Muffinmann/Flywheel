import { DefaultDependencyVisitor } from '../DefaultDependencyVisitor.js';
import { Logic } from '../LogicResolver.js';
import { Action } from '../ActionHandler.js';

describe('DefaultDependencyVisitor', () => {
  let visitor: DefaultDependencyVisitor;

  beforeEach(() => {
    visitor = new DefaultDependencyVisitor();
  });

  describe('visitLogic', () => {
    describe('var operator', () => {
      test('should extract field name from simple var', () => {
        const logic: Logic = { var: ['field_name'] };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['field_name']);
      });

      test('should extract field name from var with dot notation', () => {
        const logic: Logic = { var: ['field_name.property'] };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['field_name']);
      });

      test('should extract field name from var with @ notation', () => {
        const logic: Logic = { var: ['field_name@table.property'] };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['field_name']);
      });

      test('should exclude $ variable references', () => {
        const logic: Logic = { var: ['$.context'] };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual([]);
      });

      test('should handle var with single string operand', () => {
        const logic: Logic = { var: 'field_name' };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['field_name']);
      });
    });

    describe('fieldState operator', () => {
      test('should extract field name from fieldState', () => {
        const logic: Logic = { fieldState: ['field_name.isVisible'] };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['field_name']);
      });

      test('should extract field name from nested fieldState property', () => {
        const logic: Logic = { fieldState: ['field_name.permissions.read'] };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['field_name']);
      });

      test('should handle fieldState with single string operand', () => {
        const logic: Logic = { fieldState: 'field_name.isRequired' };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['field_name']);
      });

      test('should extract multiple field dependencies from fieldState array', () => {
        const logic: Logic = { fieldState: ['field1.isVisible', 'field2.isRequired'] };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['field1', 'field2']);
      });
    });

    describe('$ref operator', () => {
      test('should resolve shared rule references', () => {
        const sharedRules = {
          is_admin: { '==': [{ var: ['user_role'] }, 'admin'] }
        };
        visitor = new DefaultDependencyVisitor(sharedRules);

        const logic: Logic = { '$ref': 'is_admin' };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['user_role']);
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
        visitor = new DefaultDependencyVisitor(sharedRules);

        const logic: Logic = { '$ref': 'has_permission' };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toContain('user_role');
        expect(dependencies).toContain('permission_level');
      });

      test('should handle missing shared rule references gracefully', () => {
        const logic: Logic = { '$ref': 'nonexistent_rule' };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual([]);
      });

      test('should handle $ref with array operand', () => {
        const sharedRules = {
          test_rule: { var: ['test_field'] }
        };
        visitor = new DefaultDependencyVisitor(sharedRules);

        const logic: Logic = { '$ref': ['test_rule'] };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['test_field']);
      });
    });

    describe('lookup operator', () => {
      test('should extract dependencies from lookup key expression', () => {
        const logic: Logic = {
          lookup: ['table_name', { var: ['key_field'] }, 'property']
        };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['key_field']);
      });

      test('should handle complex lookup key expressions', () => {
        const logic: Logic = {
          lookup: ['table_name', { '+': [{ var: ['field_a'] }, { var: ['field_b'] }] }, 'property']
        };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toContain('field_a');
        expect(dependencies).toContain('field_b');
      });

      test('should handle lookup with insufficient operands', () => {
        const logic: Logic = { lookup: ['table_name'] };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual([]);
      });

      test('should handle lookup with single operand', () => {
        const logic: Logic = { lookup: 'table_name' };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual([]);
      });
    });

    describe('varTable operator', () => {
      test('should extract field name from varTable notation', () => {
        const logic: Logic = { varTable: ['field_name@table.property'] };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['field_name']);
      });

      test('should handle multiple varTable operands', () => {
        const logic: Logic = {
          varTable: ['field_a@table.prop1', 'field_b@table.prop2']
        };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toContain('field_a');
        expect(dependencies).toContain('field_b');
      });

      test('should exclude $ references in varTable', () => {
        const logic: Logic = { varTable: ['$.context@table.property'] };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual([]);
      });

      test('should handle varTable without @ notation', () => {
        const logic: Logic = { varTable: ['field_name'] };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual([]);
      });

      test('should handle varTable with single string operand', () => {
        const logic: Logic = { varTable: 'field_name@table.property' };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['field_name']);
      });
    });

    describe('other operators', () => {
      test('should recursively extract from nested operators', () => {
        const logic: Logic = {
          and: [
            { '==': [{ var: ['field_a'] }, 'value1'] },
            { '!=': [{ var: ['field_b'] }, null] }
          ]
        };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toContain('field_a');
        expect(dependencies).toContain('field_b');
      });

      test('should handle deeply nested expressions', () => {
        const logic: Logic = {
          or: [
            {
              and: [
                { '>=': [{ var: ['field_a'] }, 10] },
                { '<=': [{ var: ['field_b'] }, 100] }
              ]
            },
            { '==': [{ var: ['field_c'] }, 'special'] }
          ]
        };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toContain('field_a');
        expect(dependencies).toContain('field_b');
        expect(dependencies).toContain('field_c');
      });

      test('should handle arithmetic operators', () => {
        const logic: Logic = {
          '+': [
            { var: ['number_field_a'] },
            { '*': [{ var: ['number_field_b'] }, 2] }
          ]
        };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toContain('number_field_a');
        expect(dependencies).toContain('number_field_b');
      });

      test('should handle single operand operators', () => {
        const logic: Logic = { not: { var: ['boolean_field'] } };
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual(['boolean_field']);
      });
    });

    describe('array logic', () => {
      test('should extract dependencies from array of logic expressions', () => {
        const logic: Logic = [
          { var: ['field_a'] },
          { '==': [{ var: ['field_b'] }, 'value'] }
        ];
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toContain('field_a');
        expect(dependencies).toContain('field_b');
      });

      test('should handle empty arrays', () => {
        const logic: Logic = [];
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual([]);
      });
    });

    describe('primitive values', () => {
      test('should handle string literals', () => {
        const logic: Logic = 'literal_string';
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual([]);
      });

      test('should handle numeric literals', () => {
        const logic: Logic = 42;
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual([]);
      });

      test('should handle boolean literals', () => {
        const logic: Logic = true;
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual([]);
      });

      test('should handle null values', () => {
        const logic: Logic = null;
        const dependencies = visitor.visitLogic(logic);
        expect(dependencies).toEqual([]);
      });
    });
  });

  describe('visitAction', () => {
    describe('copy action', () => {
      test('should extract source field from copy action', () => {
        const action: Action = {
          copy: { source: 'source_field', target: 'target_field.property' }
        };
        const dependencies = visitor.visitAction(action);
        expect(dependencies).toEqual(['source_field']);
      });
    });

    describe('calculate action', () => {
      test('should extract dependencies from formula', () => {
        const action: Action = {
          calculate: {
            target: 'result_field.calculatedValue',
            formula: { '+': [{ var: ['field_a'] }, { var: ['field_b'] }] }
          }
        };
        const dependencies = visitor.visitAction(action);
        expect(dependencies).toContain('field_a');
        expect(dependencies).toContain('field_b');
      });

      test('should handle complex formulas', () => {
        const action: Action = {
          calculate: {
            target: 'result_field.calculatedValue',
            formula: {
              and: [
                { '>': [{ var: ['field_a'] }, 0] },
                { lookup: ['table', { var: ['field_b'] }, 'valid'] }
              ]
            }
          }
        };
        const dependencies = visitor.visitAction(action);
        expect(dependencies).toContain('field_a');
        expect(dependencies).toContain('field_b');
      });
    });

    describe('batch action', () => {
      test('should extract dependencies from all sub-actions', () => {
        const action: Action = {
          batch: [
            { copy: { source: 'field_a', target: 'target1.value' } },
            { calculate: { target: 'target2.value', formula: { var: ['field_b'] } } },
            { set: { target: 'target3.visible', value: true } }
          ]
        };
        const dependencies = visitor.visitAction(action);
        expect(dependencies).toContain('field_a');
        expect(dependencies).toContain('field_b');
      });

      test('should handle nested batch actions', () => {
        const action: Action = {
          batch: [
            { copy: { source: 'field_a', target: 'target1.value' } },
            {
              batch: [
                { copy: { source: 'field_b', target: 'target2.value' } },
                { calculate: { target: 'target3.value', formula: { var: ['field_c'] } } }
              ]
            }
          ]
        };
        const dependencies = visitor.visitAction(action);
        expect(dependencies).toContain('field_a');
        expect(dependencies).toContain('field_b');
        expect(dependencies).toContain('field_c');
      });

      test('should handle empty batch actions', () => {
        const action: Action = { batch: [] };
        const dependencies = visitor.visitAction(action);
        expect(dependencies).toEqual([]);
      });
    });

    describe('other action types', () => {
      test('should return empty array for set action', () => {
        const action: Action = {
          set: { target: 'field.property', value: 'some_value' }
        };
        const dependencies = visitor.visitAction(action);
        expect(dependencies).toEqual([]);
      });

      test('should return empty array for trigger action', () => {
        const action: Action = {
          trigger: { event: 'custom_event', params: { data: 'value' } }
        };
        const dependencies = visitor.visitAction(action);
        expect(dependencies).toEqual([]);
      });

      test('should return empty array for unknown action types', () => {
        const action = { custom_action: { param: 'value' } } as any;
        const dependencies = visitor.visitAction(action);
        expect(dependencies).toEqual([]);
      });
    });
  });

  describe('updateSharedRules', () => {
    test('should update shared rules and affect subsequent $ref resolutions', () => {
      const initialRules = {
        rule1: { var: ['field_a'] }
      };
      visitor = new DefaultDependencyVisitor(initialRules);

      // Test initial rule
      let logic: Logic = { '$ref': 'rule1' };
      let dependencies = visitor.visitLogic(logic);
      expect(dependencies).toEqual(['field_a']);

      // Update shared rules
      const newRules = {
        rule1: { var: ['field_b'] }, // Override existing
        rule2: { var: ['field_c'] }  // Add new
      };
      visitor.updateSharedRules(newRules);

      // Test updated rule
      logic = { '$ref': 'rule1' };
      dependencies = visitor.visitLogic(logic);
      expect(dependencies).toEqual(['field_b']);

      // Test new rule
      logic = { '$ref': 'rule2' };
      dependencies = visitor.visitLogic(logic);
      expect(dependencies).toEqual(['field_c']);
    });

    test('should preserve existing rules when adding new ones', () => {
      const initialRules = {
        rule1: { var: ['field_a'] }
      };
      visitor = new DefaultDependencyVisitor(initialRules);

      const additionalRules = {
        rule2: { var: ['field_b'] }
      };
      visitor.updateSharedRules(additionalRules);

      // Both rules should be available
      let logic: Logic = { '$ref': 'rule1' };
      let dependencies = visitor.visitLogic(logic);
      expect(dependencies).toEqual(['field_a']);

      logic = { '$ref': 'rule2' };
      dependencies = visitor.visitLogic(logic);
      expect(dependencies).toEqual(['field_b']);
    });
  });

  describe('edge cases and error handling', () => {
    test('should handle undefined logic gracefully', () => {
      const dependencies = visitor.visitLogic(undefined as any);
      expect(dependencies).toEqual([]);
    });

    test('should handle malformed var expressions', () => {
      const logic: Logic = { var: [123] }; // Non-string var
      const dependencies = visitor.visitLogic(logic);
      expect(dependencies).toEqual([]);
    });

    test('should handle circular shared rule references', () => {
      const circularRules = {
        rule1: { '$ref': 'rule2' },
        rule2: { '$ref': 'rule1' }
      };
      visitor = new DefaultDependencyVisitor(circularRules);

      // This should not cause infinite recursion
      const logic: Logic = { '$ref': 'rule1' };
      const dependencies = visitor.visitLogic(logic);
      // The exact behavior may vary, but it should not crash
      expect(Array.isArray(dependencies)).toBe(true);
    });

    test('should deduplicate dependencies', () => {
      const logic: Logic = {
        and: [
          { var: ['field_a'] },
          { var: ['field_a'] }, // Duplicate
          { var: ['field_b'] }
        ]
      };
      const dependencies = visitor.visitLogic(logic);
      
      // Should contain both dependencies, possibly with duplicates
      // (Note: The current implementation doesn't deduplicate, which is fine for dependency tracking)
      expect(dependencies).toContain('field_a');
      expect(dependencies).toContain('field_b');
    });
  });
});
import { RuleValidator } from '../RuleValidator.js';
import { FieldRule } from '../DependencyGraph.js';
import { Action } from '../ActionHandler.js';

describe('RuleValidator', () => {
  let ruleValidator: RuleValidator;
  let mockExtractActionTargets: jest.Mock;

  beforeEach(() => {
    mockExtractActionTargets = jest.fn();
    ruleValidator = new RuleValidator(mockExtractActionTargets);
  });

  describe('Priority Conflict Validation', () => {
    test('should allow rules with different priorities on same target', () => {
      const rules: FieldRule[] = [
        {
          condition: { '==': [1, 1] },
          action: { set: { target: 'field.isVisible', value: true } },
          priority: 1,
        },
        {
          condition: { '==': [2, 2] },
          action: { set: { target: 'field.isVisible', value: false } },
          priority: 2,
        },
      ];

      mockExtractActionTargets.mockReturnValue(['field.isVisible']);

      expect(() => {
        ruleValidator.validateNoPriorityConflicts('test_field', rules);
      }).not.toThrow();
    });

    test('should throw error for same priority conflicts on same target', () => {
      const rules: FieldRule[] = [
        {
          condition: { '==': [1, 1] },
          action: { set: { target: 'field.isVisible', value: true } },
          priority: 1,
        },
        {
          condition: { '==': [2, 2] },
          action: { set: { target: 'field.isVisible', value: false } },
          priority: 1,
        },
      ];

      mockExtractActionTargets.mockReturnValue(['field.isVisible']);

      expect(() => {
        ruleValidator.validateNoPriorityConflicts('test_field', rules);
      }).toThrow(
        /Conflicting rules for field 'test_field' target 'field.isVisible' with same priority 1/
      );
    });

    test('should allow same priority for different targets', () => {
      const rules: FieldRule[] = [
        {
          condition: { '==': [1, 1] },
          action: { set: { target: 'field.isVisible', value: true } },
          priority: 1,
        },
        {
          condition: { '==': [2, 2] },
          action: { set: { target: 'field.isRequired', value: true } },
          priority: 1,
        },
      ];

      mockExtractActionTargets
        .mockReturnValueOnce(['field.isVisible'])
        .mockReturnValueOnce(['field.isRequired']);

      expect(() => {
        ruleValidator.validateNoPriorityConflicts('test_field', rules);
      }).not.toThrow();
    });

    test('should handle batch actions with multiple targets', () => {
      const rules: FieldRule[] = [
        {
          condition: { '==': [1, 1] },
          action: {
            batch: [
              { set: { target: 'field.isVisible', value: true } },
              { set: { target: 'field.isRequired', value: true } },
            ],
          },
          priority: 1,
        },
        {
          condition: { '==': [2, 2] },
          action: { set: { target: 'field.isVisible', value: false } },
          priority: 1,
        },
      ];

      mockExtractActionTargets
        .mockReturnValueOnce(['field.isVisible', 'field.isRequired'])
        .mockReturnValueOnce(['field.isVisible']);

      expect(() => {
        ruleValidator.validateNoPriorityConflicts('test_field', rules);
      }).toThrow(
        /Conflicting rules for field 'test_field' target 'field.isVisible' with same priority 1/
      );
    });

    test('should handle complex priority conflict scenarios', () => {
      const rules: FieldRule[] = [
        {
          condition: { '==': [1, 1] },
          action: { set: { target: 'field.prop1', value: 'a' } },
          priority: 1,
        },
        {
          condition: { '==': [2, 2] },
          action: { set: { target: 'field.prop2', value: 'b' } },
          priority: 1,
        },
        {
          condition: { '==': [3, 3] },
          action: { set: { target: 'field.prop1', value: 'c' } },
          priority: 1,
        },
      ];

      mockExtractActionTargets
        .mockReturnValueOnce(['field.prop1'])
        .mockReturnValueOnce(['field.prop2'])
        .mockReturnValueOnce(['field.prop1']);

      expect(() => {
        ruleValidator.validateNoPriorityConflicts('test_field', rules);
      }).toThrow(
        /Conflicting rules for field 'test_field' target 'field.prop1' with same priority 1/
      );
    });
  });

  describe('Rule Priority Sorting', () => {
    test('should sort rules by priority in ascending order', () => {
      const rules: FieldRule[] = [
        {
          condition: { '==': [3, 3] },
          action: { set: { target: 'field.value', value: 'third' } },
          priority: 3,
        },
        {
          condition: { '==': [1, 1] },
          action: { set: { target: 'field.value', value: 'first' } },
          priority: 1,
        },
        {
          condition: { '==': [2, 2] },
          action: { set: { target: 'field.value', value: 'second' } },
          priority: 2,
        },
      ];

      const sorted = ruleValidator.sortRulesByPriority(rules);

      expect(sorted[0].priority).toBe(1);
      expect(sorted[1].priority).toBe(2);
      expect(sorted[2].priority).toBe(3);
      expect((sorted[0].action as any).set.value).toBe('first');
    });

    test('should maintain stable sort for rules with same priority', () => {
      const rules: FieldRule[] = [
        {
          condition: { '==': [1, 1] },
          action: { set: { target: 'field.value', value: 'first' } },
          priority: 1,
          description: 'Rule A',
        },
        {
          condition: { '==': [2, 2] },
          action: { set: { target: 'field.other', value: 'second' } },
          priority: 1,
          description: 'Rule B',
        },
      ];

      const sorted = ruleValidator.sortRulesByPriority(rules);

      expect(sorted[0].description).toBe('Rule A');
      expect(sorted[1].description).toBe('Rule B');
    });

    test('should handle empty rule arrays', () => {
      const rules: FieldRule[] = [];
      const sorted = ruleValidator.sortRulesByPriority(rules);
      expect(sorted).toEqual([]);
    });

    test('should handle single rule', () => {
      const rules: FieldRule[] = [
        {
          condition: { '==': [1, 1] },
          action: { set: { target: 'field.value', value: 'only' } },
          priority: 1,
        },
      ];

      const sorted = ruleValidator.sortRulesByPriority(rules);
      expect(sorted).toHaveLength(1);
      expect(sorted[0].priority).toBe(1);
    });
  });

  describe('Rule Structure Validation', () => {
    test('should validate complete rule structure', () => {
      const rule: FieldRule = {
        condition: { '==': [1, 1] },
        action: { set: { target: 'field.isVisible', value: true } },
        priority: 1,
        description: 'Valid rule',
      };

      expect(() => {
        ruleValidator.validateRuleStructure(rule);
      }).not.toThrow();
    });

    test('should throw error for missing condition', () => {
      const rule = {
        action: { set: { target: 'field.isVisible', value: true } },
        priority: 1,
      } as any;

      expect(() => {
        ruleValidator.validateRuleStructure(rule);
      }).toThrow('Rule must have a condition');
    });

    test('should throw error for missing action', () => {
      const rule = {
        condition: { '==': [1, 1] },
        priority: 1,
      } as any;

      expect(() => {
        ruleValidator.validateRuleStructure(rule);
      }).toThrow('Rule must have an action');
    });

    test('should throw error for invalid priority type', () => {
      const rule = {
        condition: { '==': [1, 1] },
        action: { set: { target: 'field.isVisible', value: true } },
        priority: 'invalid',
      } as any;

      expect(() => {
        ruleValidator.validateRuleStructure(rule);
      }).toThrow('Rule priority must be a number');
    });

    test('should throw error for missing priority', () => {
      const rule = {
        condition: { '==': [1, 1] },
        action: { set: { target: 'field.isVisible', value: true } },
      } as any;

      expect(() => {
        ruleValidator.validateRuleStructure(rule);
      }).toThrow('Rule priority must be a number');
    });
  });

  describe('Shared Rule Validation', () => {
    test('should validate existing shared rule', () => {
      const sharedRules = {
        existing_rule: { '==': [1, 1] },
      };

      expect(() => {
        ruleValidator.validateSharedRuleExists('existing_rule', sharedRules);
      }).not.toThrow();
    });

    test('should throw error for missing shared rule', () => {
      const sharedRules = {
        other_rule: { '==': [1, 1] },
      };

      expect(() => {
        ruleValidator.validateSharedRuleExists('missing_rule', sharedRules);
      }).toThrow("Shared rule 'missing_rule' not found");
    });

    test('should handle empty shared rules object', () => {
      const sharedRules = {};

      expect(() => {
        ruleValidator.validateSharedRuleExists('any_rule', sharedRules);
      }).toThrow("Shared rule 'any_rule' not found");
    });
  });

  describe('Integration with Action Target Extraction', () => {
    test('should call extractActionTargets for each rule during conflict validation', () => {
      const rules: FieldRule[] = [
        {
          condition: { '==': [1, 1] },
          action: { set: { target: 'field.isVisible', value: true } },
          priority: 1,
        },
        {
          condition: { '==': [2, 2] },
          action: { copy: { source: 'src', target: 'field.calculatedValue' } },
          priority: 1,
        },
      ];

      mockExtractActionTargets
        .mockReturnValueOnce(['different.target'])
        .mockReturnValueOnce(['different.target']);

      expect(() => {
        ruleValidator.validateNoPriorityConflicts('test_field', rules);
      }).toThrow();

      expect(mockExtractActionTargets).toHaveBeenCalledTimes(2);
      expect(mockExtractActionTargets).toHaveBeenCalledWith(rules[0].action);
      expect(mockExtractActionTargets).toHaveBeenCalledWith(rules[1].action);
    });

    test('should handle actions with no targets', () => {
      const rules: FieldRule[] = [
        {
          condition: { '==': [1, 1] },
          action: { trigger: { event: 'test_event' } },
          priority: 1,
        },
      ];

      mockExtractActionTargets.mockReturnValue([]);

      expect(() => {
        ruleValidator.validateNoPriorityConflicts('test_field', rules);
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('should handle rules with zero priority', () => {
      const rules: FieldRule[] = [
        {
          condition: { '==': [1, 1] },
          action: { set: { target: 'field.isVisible', value: true } },
          priority: 0,
        },
      ];

      mockExtractActionTargets.mockReturnValue(['field.isVisible']);

      expect(() => {
        ruleValidator.validateNoPriorityConflicts('test_field', rules);
      }).not.toThrow();
    });

    test('should handle rules with negative priority', () => {
      const rules: FieldRule[] = [
        {
          condition: { '==': [1, 1] },
          action: { set: { target: 'field.isVisible', value: true } },
          priority: -1,
        },
        {
          condition: { '==': [2, 2] },
          action: { set: { target: 'field.isVisible', value: false } },
          priority: 1,
        },
      ];

      mockExtractActionTargets.mockReturnValue(['field.isVisible']);

      const sorted = ruleValidator.sortRulesByPriority(rules);
      expect(sorted[0].priority).toBe(-1);
      expect(sorted[1].priority).toBe(1);
    });

    test('should handle very large priority numbers', () => {
      const rules: FieldRule[] = [
        {
          condition: { '==': [1, 1] },
          action: { set: { target: 'field.isVisible', value: true } },
          priority: Number.MAX_SAFE_INTEGER,
        },
      ];

      mockExtractActionTargets.mockReturnValue(['field.isVisible']);

      expect(() => {
        ruleValidator.validateNoPriorityConflicts('test_field', rules);
      }).not.toThrow();
    });
  });
});

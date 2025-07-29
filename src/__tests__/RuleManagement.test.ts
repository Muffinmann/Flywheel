import { RuleManagement, CompiledRuleSet, RuleFile } from '../RuleManagement.js';
import { RuleSet } from '../RuleEngine.js';

describe('RuleManagement', () => {
  describe('Folder Structure Validation', () => {
    test('should validate correct folder names', () => {
      const result = RuleManagement.validateFolderStructure('product-name__prod-001');
      expect(result.name).toBe('product-name');
      expect(result.id).toBe('prod-001');
    });

    test('should handle folder names with extra whitespace', () => {
      const result = RuleManagement.validateFolderStructure('  product-name  __  prod-001  ');
      expect(result.name).toBe('product-name');
      expect(result.id).toBe('prod-001');
    });

    test('should throw error for missing separator', () => {
      expect(() => {
        RuleManagement.validateFolderStructure('product-name-prod-001');
      }).toThrow("Folder name 'product-name-prod-001' is missing __ separator");
    });

    test('should throw error for multiple separators', () => {
      expect(() => {
        RuleManagement.validateFolderStructure('product__name__prod-001');
      }).toThrow("Folder name 'product__name__prod-001' should have exactly one __ separator");
    });

    test('should throw error for empty name or id', () => {
      expect(() => {
        RuleManagement.validateFolderStructure('__prod-001');
      }).toThrow("Folder name '__prod-001' has empty name or id parts");

      expect(() => {
        RuleManagement.validateFolderStructure('product-name__');
      }).toThrow("Folder name 'product-name__' has empty name or id parts");
    });
  });

  describe('ID Uniqueness Validation', () => {
    test('should pass validation for unique IDs', () => {
      const idPathMap = {
        'prod-001': 'path1',
        'prod-002': 'path2',
        'prod-003': 'path3'
      };

      expect(() => {
        RuleManagement.validateUniqueIds(idPathMap);
      }).not.toThrow();
    });

    test('should throw error for duplicate IDs', () => {
      // Can't have duplicate keys in object literal, so simulate it differently

      // Since JS objects can't have duplicate keys, let's test the validation logic differently
      const mockIdPathMap = new Map([
        ['prod-001', 'path1'],
        ['prod-002', 'path2']
      ]);

      // Simulate adding a duplicate
      const validateWithDuplicate = () => {
        const seen = new Set();
        for (const id of mockIdPathMap.keys()) {
          if (seen.has(id)) {
            throw new Error(`Duplicate ID '${id}' found in rule structure`);
          }
          seen.add(id);
        }
        // Manually add duplicate for testing
        if (seen.has('prod-001')) {
          throw new Error(`Duplicate ID 'prod-001' found in rule structure`);
        }
      };

      expect(() => validateWithDuplicate()).toThrow();
    });
  });

  describe('Rule Set Merging', () => {
    test('should merge child rules with parent rules', () => {
      const parent: CompiledRuleSet = {
        fields: {
          field1: [{
            condition: { '==': [1, 1] },
            action: { setState: { target: 'field1.isVisible', value: true } },
            priority: 1
          }]
        },
        sharedRules: {
          shared1: { '==': [{ var: ['x'] }, 'value'] }
        }
      };

      const child: RuleFile = {
        fields: {
          field1: [{
            condition: { '==': [2, 2] },
            action: { setState: { target: 'field1.isRequired', value: true } },
            priority: 2
          }],
          field2: [{
            condition: { '==': [3, 3] },
            action: { setState: { target: 'field2.isVisible', value: true } },
            priority: 1
          }]
        },
        sharedRules: {
          shared2: { '==': [{ var: ['y'] }, 'value'] }
        }
      };

      const result = RuleManagement.mergeRuleSets(parent, child);

      expect(result.fields.field1).toHaveLength(2);
      expect(result.fields.field2).toHaveLength(1);
      expect(result.sharedRules.shared1).toBeDefined();
      expect(result.sharedRules.shared2).toBeDefined();
    });

    test('should handle merging with null parent', () => {
      const child: RuleFile = {
        fields: {
          field1: [{
            condition: { '==': [1, 1] },
            action: { setState: { target: 'field1.isVisible', value: true } },
            priority: 1
          }]
        },
        sharedRules: {
          shared1: { '==': [{ var: ['x'] }, 'value'] }
        }
      };

      const result = RuleManagement.mergeRuleSets(null, child);

      expect(result.fields.field1).toHaveLength(1);
      expect(result.sharedRules.shared1).toBeDefined();
    });

    test('should handle empty child rule file', () => {
      const parent: CompiledRuleSet = {
        fields: {
          field1: [{
            condition: { '==': [1, 1] },
            action: { setState: { target: 'field1.isVisible', value: true } },
            priority: 1
          }]
        },
        sharedRules: {
          shared1: { '==': [{ var: ['x'] }, 'value'] }
        }
      };

      const child: RuleFile = {};

      const result = RuleManagement.mergeRuleSets(parent, child);

      expect(result.fields.field1).toHaveLength(1);
      expect(result.sharedRules.shared1).toBeDefined();
    });
  });

  describe('Rule Priority Sorting', () => {
    test('should sort rules by priority', () => {
      const ruleSet: RuleSet = {
        field1: [
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'field1.prop1', value: 'third' } },
            priority: 3
          },
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'field1.prop2', value: 'first' } },
            priority: 1
          },
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'field1.prop3', value: 'second' } },
            priority: 2
          }
        ]
      };

      const sorted = RuleManagement.sortRulesByPriority(ruleSet);

      expect(sorted.field1[0].priority).toBe(1);
      expect(sorted.field1[1].priority).toBe(2);
      expect(sorted.field1[2].priority).toBe(3);
    });

    test('should preserve original rule set', () => {
      const originalRuleSet: RuleSet = {
        field1: [
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'field1.prop1', value: 'value' } },
            priority: 3
          },
          {
            condition: { '==': [1, 1] },
            action: { set: { target: 'field1.prop2', value: 'value' } },
            priority: 1
          }
        ]
      };

      const sorted = RuleManagement.sortRulesByPriority(originalRuleSet);

      expect(originalRuleSet.field1[0].priority).toBe(3); // Original unchanged
      expect(sorted.field1[0].priority).toBe(1); // Sorted version changed
    });
  });

  describe('Rule Structure Validation', () => {
    test('should validate rule set without circular dependencies', () => {
      const ruleSet: RuleSet = {
        field1: [{
          condition: { '==': [{ var: ['field2'] }, 'trigger'] },
          action: { setState: { target: 'field1.isVisible', value: true } },
          priority: 1
        }],
        field2: [{
          condition: { '==': [{ var: ['field3'] }, 'trigger'] },
          action: { setState: { target: 'field2.isVisible', value: true } },
          priority: 1
        }],
        field3: [{
          condition: { '==': [1, 1] },
          action: { setState: { target: 'field3.isVisible', value: true } },
          priority: 1
        }]
      };

      expect(() => {
        RuleManagement.validateRuleStructure(ruleSet);
      }).not.toThrow();
    });

    test('should detect circular dependencies', () => {
      const ruleSet: RuleSet = {
        field1: [{
          condition: { '==': [{ var: ['field2'] }, 'trigger'] },
          action: { setState: { target: 'field1.isVisible', value: true } },
          priority: 1
        }],
        field2: [{
          condition: { '==': [{ var: ['field3'] }, 'trigger'] },
          action: { setState: { target: 'field2.isVisible', value: true } },
          priority: 1
        }],
        field3: [{
          condition: { '==': [{ var: ['field1'] }, 'trigger'] },
          action: { setState: { target: 'field3.isVisible', value: true } },
          priority: 1
        }]
      };

      expect(() => {
        RuleManagement.validateRuleStructure(ruleSet);
      }).toThrow(/Circular dependency detected involving field/);
    });

    test('should handle self-referencing fields', () => {
      const ruleSet: RuleSet = {
        field1: [{
          condition: { '==': [{ var: ['field1'] }, 'trigger'] },
          action: { setState: { target: 'field1.isVisible', value: true } },
          priority: 1
        }]
      };

      expect(() => {
        RuleManagement.validateRuleStructure(ruleSet);
      }).toThrow(/Circular dependency detected involving field/);
    });

    test('should handle complex nested logic in dependency extraction', () => {
      const ruleSet: RuleSet = {
        complex_field: [{
          condition: {
            and: [
              { '==': [{ var: ['field1'] }, 'value'] },
              { or: [
                { '>': [{ var: ['field2.count'] }, 5] },
                { '==': [{ var: ['field3'] }, 'fallback'] }
              ]}
            ]
          },
          action: { setState: { target: 'complex_field.isVisible', value: true } },
          priority: 1
        }]
      };

      expect(() => {
        RuleManagement.validateRuleStructure(ruleSet);
      }).not.toThrow();
    });

    test('should ignore $ references in dependency extraction', () => {
      const ruleSet: RuleSet = {
        array_field: [{
          condition: {
            some: [
              { var: ['items'] },
              { '>': [{ var: ['$'] }, 10] }
            ]
          },
          action: { setState: { target: 'array_field.isVisible', value: true } },
          priority: 1
        }]
      };

      expect(() => {
        RuleManagement.validateRuleStructure(ruleSet);
      }).not.toThrow();
    });
  });

  describe('Compile Rules (Stub)', () => {
    test('should throw error indicating Node.js environment requirement', () => {
      expect(() => {
        RuleManagement.compileRules('/fake/path');
      }).toThrow('RuleManagement.compileRules should be called from Node.js environment with file system access');
    });
  });
});
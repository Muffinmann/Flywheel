import { LogicResolver, Logic } from '../LogicResolver.js';
import { fieldStateOperator } from '../FieldStateOperators.js';

describe('LogicResolver', () => {
  let resolver: LogicResolver;

  beforeEach(() => {
    resolver = new LogicResolver();
    // Register the fieldState custom operator for testing
    resolver.registerCustomLogic([
      { operator: 'fieldState', operand: fieldStateOperator }
    ]);
  });

  describe('Basic Operations', () => {
    test('should resolve primitive values', () => {
      expect(resolver.resolve(42, {})).toBe(42);
      expect(resolver.resolve('hello', {})).toBe('hello');
      expect(resolver.resolve(true, {})).toBe(true);
      expect(resolver.resolve(null, {})).toBe(null);
    });

    test('should handle variable references', () => {
      const context = { user: { name: 'John', age: 30 } };
      
      expect(resolver.resolve({ var: ['user.name'] }, context)).toBe('John');
      expect(resolver.resolve({ var: ['user.age'] }, context)).toBe(30);
      expect(resolver.resolve({ var: ['user.missing'] }, context)).toBeUndefined();
    });

    test('should handle $ reference in array operations', () => {
      const context = { $: 5 };
      expect(resolver.resolve({ var: ['$'] }, context)).toBe(5);
    });

    test('should handle fieldState references', () => {
      const context = {
        fieldStates: {
          user_name: {
            isVisible: true,
            isRequired: false,
            calculatedValue: 'John Doe'
          }
        }
      };
      
      expect(resolver.resolve({ fieldState: ['user_name.isVisible'] }, context)).toBe(true);
      expect(resolver.resolve({ fieldState: ['user_name.isRequired'] }, context)).toBe(false);
      expect(resolver.resolve({ fieldState: ['user_name.calculatedValue'] }, context)).toBe('John Doe');
      expect(resolver.resolve({ fieldState: ['nonexistent.isVisible'] }, context)).toBeUndefined();
    });

    test('should handle nested fieldState properties', () => {
      const context = {
        fieldStates: {
          user_info: {
            permissions: {
              read: true,
              write: false
            },
            validation: {
              message: 'Required field'
            }
          }
        }
      };
      
      expect(resolver.resolve({ fieldState: ['user_info.permissions.read'] }, context)).toBe(true);
      expect(resolver.resolve({ fieldState: ['user_info.permissions.write'] }, context)).toBe(false);
      expect(resolver.resolve({ fieldState: ['user_info.validation.message'] }, context)).toBe('Required field');
    });

    test('should throw error for invalid fieldState format', () => {
      const context = { fieldStates: {} };
      
      expect(() => resolver.resolve({ fieldState: ['fieldname'] }, context))
        .toThrow('fieldState operator requires format: fieldName.property');
    });

    test('should verify fieldState is registered as custom operator', () => {
      // Test that resolver doesn't know about fieldState without registration
      const freshResolver = new LogicResolver();
      const context = { fieldStates: { test: { isVisible: true } } };
      
      expect(() => freshResolver.resolve({ fieldState: ['test.isVisible'] }, context))
        .toThrow('Unknown operator: fieldState');
      
      // But works with registration
      expect(resolver.resolve({ fieldState: ['test.isVisible'] }, context)).toBe(true);
    });
  });

  describe('Arithmetic Operations', () => {
    test('should perform addition', () => {
      expect(resolver.resolve({ '+': [1, 2, 3] }, {})).toBe(6);
      expect(resolver.resolve({ '+': [] }, {})).toBe(0);
    });

    test('should perform subtraction', () => {
      expect(resolver.resolve({ '-': [10, 3] }, {})).toBe(7);
      expect(resolver.resolve({ '-': [5] }, {})).toBe(-5);
    });

    test('should perform multiplication', () => {
      expect(resolver.resolve({ '*': [2, 3, 4] }, {})).toBe(24);
      expect(resolver.resolve({ '*': [] }, {})).toBe(1);
    });

    test('should perform division', () => {
      expect(resolver.resolve({ '/': [10, 2] }, {})).toBe(5);
      expect(resolver.resolve({ '/': [7, 2] }, {})).toBe(3.5);
    });
  });

  describe('Math Operations', () => {
    test('should perform square root', () => {
      expect(resolver.resolve({ sqrt: [16] }, {})).toBe(4);
      expect(resolver.resolve({ sqrt: [2] }, {})).toBeCloseTo(1.414, 3);
    });

    test('should perform floor', () => {
      expect(resolver.resolve({ floor: [3.7] }, {})).toBe(3);
      expect(resolver.resolve({ floor: [-2.3] }, {})).toBe(-3);
    });

    test('should perform absolute value', () => {
      expect(resolver.resolve({ abs: [-5] }, {})).toBe(5);
      expect(resolver.resolve({ abs: [3] }, {})).toBe(3);
    });
  });

  describe('Comparison Operations', () => {
    test('should perform greater than', () => {
      expect(resolver.resolve({ '>': [5, 3] }, {})).toBe(true);
      expect(resolver.resolve({ '>': [2, 5] }, {})).toBe(false);
      expect(resolver.resolve({ '>': [3, 3] }, {})).toBe(false);
    });

    test('should perform less than', () => {
      expect(resolver.resolve({ '<': [2, 5] }, {})).toBe(true);
      expect(resolver.resolve({ '<': [5, 3] }, {})).toBe(false);
      expect(resolver.resolve({ '<': [3, 3] }, {})).toBe(false);
    });

    test('should perform equality', () => {
      expect(resolver.resolve({ '==': [5, 5] }, {})).toBe(true);
      expect(resolver.resolve({ '==': [5, 3] }, {})).toBe(false);
      expect(resolver.resolve({ '==': ['hello', 'hello'] }, {})).toBe(true);
    });

    test('should perform inequality', () => {
      expect(resolver.resolve({ '!=': [5, 3] }, {})).toBe(true);
      expect(resolver.resolve({ '!=': [5, 5] }, {})).toBe(false);
    });
  });

  describe('Logical Operations', () => {
    test('should perform AND operation', () => {
      expect(resolver.resolve({ and: [true, true, true] }, {})).toBe(true);
      expect(resolver.resolve({ and: [true, false, true] }, {})).toBe(false);
      expect(resolver.resolve({ and: [] }, {})).toBe(true);
    });

    test('should perform OR operation', () => {
      expect(resolver.resolve({ or: [false, false, true] }, {})).toBe(true);
      expect(resolver.resolve({ or: [false, false, false] }, {})).toBe(false);
      expect(resolver.resolve({ or: [] }, {})).toBe(false);
    });

    test('should perform NOT operation', () => {
      expect(resolver.resolve({ not: [true] }, {})).toBe(false);
      expect(resolver.resolve({ not: [false] }, {})).toBe(true);
    });
  });

  describe('Conditional Operations', () => {
    test('should perform IF operation', () => {
      expect(resolver.resolve({ if: [true, 'yes', 'no'] }, {})).toBe('yes');
      expect(resolver.resolve({ if: [false, 'yes', 'no'] }, {})).toBe('no');
    });

    test('should handle nested conditions', () => {
      const logic = {
        if: [
          { '>': [{ var: ['age'] }, 18] },
          'adult',
          'minor'
        ]
      };
      
      expect(resolver.resolve(logic, { age: 25 })).toBe('adult');
      expect(resolver.resolve(logic, { age: 16 })).toBe('minor');
    });
  });

  describe('Array Operations', () => {
    test('should perform SOME operation', () => {
      const array = [1, 2, 3, 4, 5];
      const logic = { some: [array, { '>': [{ var: ['$'] }, 3] }] };
      
      expect(resolver.resolve(logic, {})).toBe(true);
      
      const logic2 = { some: [array, { '>': [{ var: ['$'] }, 10] }] };
      expect(resolver.resolve(logic2, {})).toBe(false);
    });

    test('should perform EVERY operation', () => {
      const array = [2, 4, 6, 8];
      const logic = { every: [array, { '==': [{ '*': [{ var: ['$'] }, 2] }, { '*': [{ var: ['$'] }, 2] }] }] };
      
      expect(resolver.resolve(logic, {})).toBe(true);
      
      const array2 = [1, 2, 3];
      const logic2 = { every: [array2, { '>': [{ var: ['$'] }, 0] }] };
      expect(resolver.resolve(logic2, {})).toBe(true);
    });

    test('should perform MAP operation', () => {
      const array = [1, 2, 3];
      const logic = { map: [array, { '*': [{ var: ['$'] }, 2] }] };
      
      expect(resolver.resolve(logic, {})).toEqual([2, 4, 6]);
    });
  });

  describe('Custom Logic Registration', () => {
    test('should register and use custom operators', () => {
      resolver.registerCustomLogic([{
        operator: 'double',
        operand: (args) => args[0] * 2
      }]);

      expect(resolver.resolve({ double: [5] }, {})).toBe(10);
    });

    test('should override built-in operators', () => {
      resolver.registerCustomLogic([{
        operator: '+',
        operand: (args) => args.reduce((acc, val) => acc - val, 0)
      }]);

      expect(resolver.resolve({ '+': [1, 2, 3] }, {})).toBe(-6);
    });
  });

  describe('Debug Evaluation', () => {
    test('should provide debug trace', () => {
      const logic = { and: [{ '>': [5, 3] }, { '<': [2, 4] }] };
      const { result, trace } = resolver.debugEvaluate(logic, {});
      
      expect(result).toBe(true);
      expect(trace.operator).toBe('root');
      expect(trace.result).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should throw error for unknown operators', () => {
      expect(() => {
        resolver.resolve({ unknownOp: [1, 2] }, {});
      }).toThrow('Unknown operator: unknownOp');
    });

    test('should throw error for invalid logic object structure', () => {
      expect(() => {
        resolver.resolve({ op1: [1], op2: [2] }, {});
      }).toThrow('Logic object must have exactly one operator');
    });
  });

  describe('Complex Nested Logic', () => {
    test('should handle deeply nested operations', () => {
      const context = { 
        user: { age: 25, scores: [85, 90, 78] },
        threshold: 80 
      };
      
      const logic = {
        and: [
          { '>=': [{ var: ['user.age'] }, 18] },
          { some: [{ var: ['user.scores'] }, { '>': [{ var: ['$'] }, { var: ['threshold'] }] }] }
        ]
      };
      
      expect(resolver.resolve(logic, context)).toBe(true);
    });
  });
});
import { RuleEngine } from '../RuleEngine.js';
import { DependencyInfo } from '../DependencyGraph.js';
import {
  CustomLogicDependencyVisitor,
  CustomActionDependencyVisitor,
} from '../DependencyVisitor.js';

describe('Custom Dependency Tracking', () => {
  let ruleEngine: RuleEngine;

  beforeEach(() => {
    ruleEngine = new RuleEngine();
  });

  describe('Custom Action Dependency Tracking', () => {
    it('should track dependencies for custom actions', () => {
      // Create a custom action dependency visitor
      const customActionVisitor: CustomActionDependencyVisitor = {
        visitAction: ({ actionType, payload }): DependencyInfo => {
          if (actionType === 'customSet') {
            // This custom action reads from source and writes to target
            const customPayload = payload as { source?: string; target?: string };
            return {
              dependencies: customPayload.source ? [customPayload.source] : [],
              dependents: customPayload.target ? [customPayload.target] : [],
            };
          }
          return { dependencies: [], dependents: [] };
        },
      };

      interface CustomSetPayload {
        source: string;
        target: string;
      }

      // Register custom action with dependency visitor
      ruleEngine.registerActionHandler<CustomSetPayload>({
        actionType: 'customSet',
        handler: (payload, context) => {
          // Custom action implementation
          const value = context[payload.source];
          context[payload.target] = value;
        },
        dependencyVisitor: customActionVisitor,
      });

      // Load rules that use the custom action
      const ruleSet = {
        field3: [
          {
            condition: { '==': [{ var: 'field1' }, 'trigger'] },
            action: { customSet: { source: 'field2', target: 'field3' } } as any,
            priority: 1,
          },
        ],
      };

      ruleEngine.loadRuleSet(ruleSet);

      // Check dependency graph
      const field3Dependencies = ruleEngine['dependencyGraph'].getDependencies('field3');
      const field2Dependents = ruleEngine['dependencyGraph'].getDependents('field2');

      expect(field3Dependencies).toContain('field1');
      expect(field3Dependencies).toContain('field2');
      expect(field2Dependents).toContain('field3');
    });

    it('should track dependencies for batch custom actions', () => {
      const customActionVisitor: CustomActionDependencyVisitor = {
        visitAction: ({ actionType, payload }): DependencyInfo => {
          if (actionType === 'merge') {
            // Merge action reads from multiple sources and writes to target
            const mergePayload = payload as { sources?: string[]; target?: string };
            return {
              dependencies: mergePayload.sources || [],
              dependents: mergePayload.target ? [mergePayload.target] : [],
            };
          }
          return { dependencies: [], dependents: [] };
        },
      };

      interface MergePayload {
        sources: string[];
        target: string;
      }

      ruleEngine.registerActionHandler<MergePayload>({
        actionType: 'merge',
        handler: (payload, context) => {
          const merged = payload.sources.map((s: string) => context[s]).join('');
          context[payload.target] = merged;
        },
        dependencyVisitor: customActionVisitor,
      });

      const ruleSet = {
        result: [
          {
            condition: { '==': [{ var: 'trigger' }, true] },
            action: { merge: { sources: ['field1', 'field2', 'field3'], target: 'result' } } as any,
            priority: 1,
          },
        ],
      };

      ruleEngine.loadRuleSet(ruleSet);

      const resultDependencies = ruleEngine['dependencyGraph'].getDependencies('result');
      expect(resultDependencies).toContain('field1');
      expect(resultDependencies).toContain('field2');
      expect(resultDependencies).toContain('field3');

      const field1Dependents = ruleEngine['dependencyGraph'].getDependents('field1');
      expect(field1Dependents).toContain('result');
    });
  });

  describe('Custom Logic Dependency Tracking', () => {
    it('should track dependencies for custom logic operators', () => {
      // Create a custom logic dependency visitor
      const customLogicVisitor: CustomLogicDependencyVisitor = {
        visitLogic: ({ operator, operands }): DependencyInfo => {
          if (operator === 'compareFields') {
            // This custom operator compares two fields
            const operandArray = Array.isArray(operands) ? operands : [operands];
            const [field1, field2] = operandArray as string[];
            return {
              dependencies: [field1, field2],
              dependents: [],
            };
          }
          return { dependencies: [], dependents: [] };
        },
      };

      // Register custom logic with dependency visitor
      ruleEngine.registerCustomLogic({
        operator: 'compareFields',
        handler: (args, context) => {
          const [field1, field2] = args;
          return context[field1] === context[field2];
        },
        dependencyVisitor: customLogicVisitor,
      });

      // Load rules that use the custom logic
      const ruleSet = {
        output: [
          {
            condition: { compareFields: ['fieldA', 'fieldB'] },
            action: { set: { target: 'output', value: 'matched' } },
            priority: 1,
          },
        ],
      };

      ruleEngine.loadRuleSet(ruleSet);

      // Check dependency graph
      const outputDependencies = ruleEngine['dependencyGraph'].getDependencies('output');
      expect(outputDependencies).toContain('fieldA');
      expect(outputDependencies).toContain('fieldB');
    });

    it('should track nested custom logic dependencies', () => {
      const customLogicVisitor: CustomLogicDependencyVisitor = {
        visitLogic: ({ operator, operands }): DependencyInfo => {
          if (operator === 'sumFields') {
            // This operator sums multiple field values
            const operandArray = Array.isArray(operands)
              ? (operands as string[])
              : [operands as string];
            return {
              dependencies: operandArray,
              dependents: [],
            };
          }
          return { dependencies: [], dependents: [] };
        },
      };

      ruleEngine.registerCustomLogic({
        operator: 'sumFields',
        handler: (args, context) => {
          return args.reduce((sum: number, field: string) => sum + (context[field] || 0), 0);
        },
        dependencyVisitor: customLogicVisitor,
      });

      const ruleSet = {
        total: [
          {
            condition: { '>': [{ sumFields: ['val1', 'val2', 'val3'] }, 100] },
            action: { set: { target: 'total', value: 'high' } },
            priority: 1,
          },
        ],
      };

      ruleEngine.loadRuleSet(ruleSet);

      const totalDependencies = ruleEngine['dependencyGraph'].getDependencies('total');
      expect(totalDependencies).toContain('val1');
      expect(totalDependencies).toContain('val2');
      expect(totalDependencies).toContain('val3');
    });
  });

  describe('Mixed Custom Dependencies', () => {
    it('should track dependencies for rules with both custom logic and actions', () => {
      // Custom logic visitor
      const logicVisitor: CustomLogicDependencyVisitor = {
        visitLogic: ({ operator, operands }): DependencyInfo => {
          if (operator === 'hasValue') {
            const operandArray = Array.isArray(operands) ? operands : [operands];
            return {
              dependencies: operandArray[0] ? [operandArray[0] as string] : [],
              dependents: [],
            };
          }
          return { dependencies: [], dependents: [] };
        },
      };

      // Custom action visitor
      const actionVisitor: CustomActionDependencyVisitor = {
        visitAction: ({ actionType, payload }): DependencyInfo => {
          if (actionType === 'transform') {
            const transformPayload = payload as { source?: string; target?: string };
            return {
              dependencies: transformPayload.source ? [transformPayload.source] : [],
              dependents: transformPayload.target ? [transformPayload.target] : [],
            };
          }
          return { dependencies: [], dependents: [] };
        },
      };

      ruleEngine.registerCustomLogic({
        operator: 'hasValue',
        handler: (args, context) => {
          return context[args[0]] !== null && context[args[0]] !== undefined;
        },
        dependencyVisitor: logicVisitor,
      });

      interface TransformPayload {
        source: string;
        target: string;
      }

      ruleEngine.registerActionHandler<TransformPayload>({
        actionType: 'transform',
        handler: (payload, context) => {
          context[payload.target] = String(context[payload.source]).toUpperCase();
        },
        dependencyVisitor: actionVisitor,
      });

      const ruleSet = {
        transformed: [
          {
            condition: { hasValue: ['input'] },
            action: { transform: { source: 'input', target: 'transformed' } } as any,
            priority: 1,
          },
        ],
      };

      ruleEngine.loadRuleSet(ruleSet);

      const transformedDeps = ruleEngine['dependencyGraph'].getDependencies('transformed');
      expect(transformedDeps).toContain('input');

      const inputDependents = ruleEngine['dependencyGraph'].getDependents('input');
      expect(inputDependents).toContain('transformed');
    });
  });

  describe('Cache Invalidation with Custom Dependencies', () => {
    it('should properly invalidate cache when custom dependencies change', () => {
      const actionVisitor: CustomActionDependencyVisitor = {
        visitAction: ({ actionType, payload }): DependencyInfo => {
          if (actionType === 'concat') {
            const concatPayload = payload as { sources?: string[]; target?: string };
            return {
              dependencies: concatPayload.sources || [],
              dependents: concatPayload.target ? [concatPayload.target] : [],
            };
          }
          return { dependencies: [], dependents: [] };
        },
      };

      interface ConcatPayload {
        sources: string[];
        target: string;
      }

      ruleEngine.registerActionHandler<ConcatPayload>({
        actionType: 'concat',
        handler: (payload, context, helpers) => {
          const result = payload.sources
            .map((s: string) => {
              // Get field value from context
              const fieldState = context[s] as any;
              return (fieldState && fieldState.value) || '';
            })
            .join('');
          // Use the onFieldPropertySet callback to update the field
          helpers?.onFieldPropertySet?.(payload.target + '.value', result);
        },
        dependencyVisitor: actionVisitor,
      });

      const ruleSet = {
        fullName: [
          {
            condition: true,
            action: { concat: { sources: ['firstName', 'lastName'], target: 'fullName' } } as any,
            priority: 1,
          },
        ],
      };

      ruleEngine.loadRuleSet(ruleSet);

      // Set initial values
      ruleEngine.updateFieldValue({ firstName: 'John', lastName: 'Doe' });
      const result1 = ruleEngine.evaluateField('fullName');
      expect(result1.value).toBe('JohnDoe');

      // Update a dependency and check invalidation
      const invalidatedFields = ruleEngine.updateFieldValue({ firstName: 'Jane' });
      expect(invalidatedFields).toContain('fullName');

      const result2 = ruleEngine.evaluateField('fullName');
      expect(result2.value).toBe('JaneDoe');
    });
  });
});

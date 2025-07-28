import { ActionHandler, Action } from '../ActionHandler.js';
import { LogicResolver } from '../LogicResolver.js';

describe('ActionHandler', () => {
  let actionHandler: ActionHandler;
  let logicResolver: LogicResolver;
  let mockOnEvent: jest.Mock;
  let mockOnFieldPropertySet: jest.Mock;

  beforeEach(() => {
    logicResolver = new LogicResolver();
    mockOnEvent = jest.fn();
    mockOnFieldPropertySet = jest.fn();
    
    actionHandler = new ActionHandler(logicResolver, {
      onEvent: mockOnEvent,
      onFieldPropertySet: mockOnFieldPropertySet
    });
  });

  describe('Built-in Actions', () => {
    test('should handle SET action', () => {
      const action: Action = {
        set: { target: 'field.isVisible', value: true }
      };

      actionHandler.executeAction(action, {});

      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('field.isVisible', true);
    });

    test('should handle COPY action', () => {
      const action: Action = {
        copy: { source: 'sourceField', target: 'field.calculatedValue' }
      };
      const context = { sourceField: 'copied_value' };

      actionHandler.executeAction(action, context);

      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('field.calculatedValue', 'copied_value');
    });

    test('should handle CALCULATE action', () => {
      const action: Action = {
        calculate: {
          target: 'field.calculatedValue',
          formula: { '+': [{ var: ['a'] }, { var: ['b'] }] }
        }
      };
      const context = { a: 10, b: 5 };

      actionHandler.executeAction(action, context);

      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('field.calculatedValue', 15);
    });

    test('should handle TRIGGER action', () => {
      const action: Action = {
        trigger: { event: 'custom_event', params: { data: 'test' } }
      };

      actionHandler.executeAction(action, {});

      expect(mockOnEvent).toHaveBeenCalledWith('custom_event', { data: 'test' });
    });

    test('should handle BATCH action', () => {
      const action: Action = {
        batch: [
          { set: { target: 'field.isVisible', value: true } },
          { set: { target: 'field.isRequired', value: true } }
        ]
      };

      actionHandler.executeAction(action, {});

      expect(mockOnFieldPropertySet).toHaveBeenCalledTimes(2);
      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('field.isVisible', true);
      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('field.isRequired', true);
    });
  });

  describe('Custom Action Handlers', () => {
    test('should register and execute custom action handlers', () => {
      const customHandler = jest.fn();
      actionHandler.registerActionHandler('custom', customHandler);

      const action = { custom: { message: 'test' } } as any;
      const context = { data: 'context' };

      actionHandler.executeAction(action, context);

      expect(customHandler).toHaveBeenCalledWith({ message: 'test' }, context);
    });

    test('should throw error for unknown action types', () => {
      const action = { unknownAction: { data: 'test' } } as any;

      expect(() => {
        actionHandler.executeAction(action, {});
      }).toThrow('Unknown action type: unknownAction');
    });

    test('should allow overriding built-in action handlers', () => {
      const customSetHandler = jest.fn();
      actionHandler.registerActionHandler('set', customSetHandler);

      const action: Action = {
        set: { target: 'field.isVisible', value: true }
      };

      actionHandler.executeAction(action, {});

      expect(customSetHandler).toHaveBeenCalledWith({ target: 'field.isVisible', value: true }, {});
      expect(mockOnFieldPropertySet).not.toHaveBeenCalled();
    });
  });

  describe('Action Target Extraction', () => {
    test('should extract targets from SET action', () => {
      const action: Action = { set: { target: 'field.isVisible', value: true } };
      const targets = actionHandler.extractActionTargets(action);
      expect(targets).toEqual(['field.isVisible']);
    });

    test('should extract targets from COPY action', () => {
      const action: Action = { copy: { source: 'src', target: 'field.calculatedValue' } };
      const targets = actionHandler.extractActionTargets(action);
      expect(targets).toEqual(['field.calculatedValue']);
    });

    test('should extract targets from CALCULATE action', () => {
      const action: Action = { 
        calculate: { target: 'field.result', formula: { '+': [1, 2] } }
      };
      const targets = actionHandler.extractActionTargets(action);
      expect(targets).toEqual(['field.result']);
    });

    test('should extract targets from BATCH action', () => {
      const action: Action = {
        batch: [
          { set: { target: 'field1.isVisible', value: true } },
          { copy: { source: 'src', target: 'field2.calculatedValue' } }
        ]
      };
      const targets = actionHandler.extractActionTargets(action);
      expect(targets).toEqual(['field1.isVisible', 'field2.calculatedValue']);
    });

    test('should return empty array for actions without targets', () => {
      const action: Action = { trigger: { event: 'test', params: {} } };
      const targets = actionHandler.extractActionTargets(action);
      expect(targets).toEqual([]);
    });
  });

  describe('Action Dependency Extraction', () => {
    test('should extract dependencies from COPY action', () => {
      const action: Action = { copy: { source: 'sourceField', target: 'targetField' } };
      const deps = actionHandler.extractActionDependencies(action);
      expect(deps).toEqual(['sourceField']);
    });

    test('should extract dependencies from CALCULATE action', () => {
      const action: Action = {
        calculate: {
          target: 'field.result',
          formula: { '+': [{ var: ['a'] }, { var: ['b'] }] }
        }
      };
      const deps = actionHandler.extractActionDependencies(action);
      expect(deps).toEqual(['a', 'b']);
    });

    test('should extract dependencies from BATCH action', () => {
      const action: Action = {
        batch: [
          { copy: { source: 'field1', target: 'result1' } },
          { calculate: { target: 'result2', formula: { var: ['field2'] } } }
        ]
      };
      const deps = actionHandler.extractActionDependencies(action);
      expect(deps).toEqual(['field1', 'field2']);
    });

    test('should return empty array for actions without dependencies', () => {
      const action: Action = { set: { target: 'field.isVisible', value: true } };
      const deps = actionHandler.extractActionDependencies(action);
      expect(deps).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    test('should handle COPY action with complex var expressions', () => {
      const action: Action = {
        copy: { source: 'nested.field.value', target: 'field.calculatedValue' }
      };
      const context = { nested: { field: { value: 'deep_value' } } };

      actionHandler.executeAction(action, context);

      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('field.calculatedValue', 'deep_value');
    });

    test('should handle CALCULATE action with nested logic', () => {
      const action: Action = {
        calculate: {
          target: 'field.result',
          formula: {
            '+': [
              { '*': [{ var: ['a'] }, 2] },
              { var: ['b'] }
            ]
          }
        }
      };
      const context = { a: 5, b: 3 };

      actionHandler.executeAction(action, context);

      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('field.result', 13);
    });

    test('should handle TRIGGER action without params', () => {
      const action: Action = {
        trigger: { event: 'simple_event' }
      };

      actionHandler.executeAction(action, {});

      expect(mockOnEvent).toHaveBeenCalledWith('simple_event', undefined);
    });
  });
});
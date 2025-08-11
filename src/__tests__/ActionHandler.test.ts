import type { Action } from '../ActionHandler.js';
import { ActionHandler } from '../ActionHandler.js';
import { LogicResolver } from '../LogicResolver.js';

describe('ActionHandler', () => {
  let actionHandler: ActionHandler;
  let logicResolver: LogicResolver;
  let mockOnEvent: jest.Mock;
  let mockOnFieldPropertySet: jest.Mock;
  let mockOnFieldInit: jest.Mock;

  beforeEach(() => {
    logicResolver = new LogicResolver();
    mockOnEvent = jest.fn();
    mockOnFieldPropertySet = jest.fn();
    mockOnFieldInit = jest.fn();

    actionHandler = new ActionHandler(logicResolver, {
      onEvent: mockOnEvent,
      onFieldPropertySet: mockOnFieldPropertySet,
      onFieldInit: mockOnFieldInit,
    });
  });

  describe('Built-in Actions', () => {
    test('should handle SET action for field properties', () => {
      const action: Action = {
        set: { target: 'field.value', value: 'test_value' },
      };

      actionHandler.executeAction(action, {});

      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('field.value', 'test_value');
    });

    test('should handle SET action for field state properties', () => {
      const action: Action = {
        set: { target: 'field.isVisible', value: true },
      };

      actionHandler.executeAction(action, {});

      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('field.isVisible', true);
    });

    test('should handle SET action with dot notation targets', () => {
      const action: Action = {
        set: { target: 'field.nested.property', value: 'nested_value' },
      };

      actionHandler.executeAction(action, {});

      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('field.nested.property', 'nested_value');
    });

    test('should handle COPY action', () => {
      const action: Action = {
        copy: { source: 'sourceField.value', target: 'targetField.value' },
      };
      const context = { sourceField: { value: 'copied_value' } };

      actionHandler.executeAction(action, context);

      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('targetField.value', 'copied_value');
    });

    test('should handle CALCULATE action', () => {
      const action: Action = {
        calculate: {
          target: 'totalField.value',
          formula: { '+': [{ var: ['a.value'] }, { var: ['b.value'] }] },
        },
      };
      const context = { a: { value: 10 }, b: { value: 5 } };

      actionHandler.executeAction(action, context);

      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('totalField.value', 15);
    });

    test('should handle CALCULATE action for field state properties', () => {
      const action: Action = {
        calculate: {
          target: 'field.calculatedValue',
          formula: { '+': [{ var: ['a.value'] }, { var: ['b.value'] }] },
        },
      };
      const context = { a: { value: 10 }, b: { value: 5 } };

      actionHandler.executeAction(action, context);

      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('field.calculatedValue', 15);
    });

    test('should handle TRIGGER action', () => {
      const action: Action = {
        trigger: { event: 'custom_event', params: { data: 'test' } },
      };

      actionHandler.executeAction(action, {});

      expect(mockOnEvent).toHaveBeenCalledWith('custom_event', { data: 'test' });
    });

    test('should handle BATCH action', () => {
      const action: Action = {
        batch: [
          { set: { target: 'field.isVisible', value: true } },
          { set: { target: 'field.isRequired', value: true } },
        ],
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

      const action = { custom: { message: 'test' } } as Action & { custom: { message: string } };
      const context = { data: 'context' };

      actionHandler.executeAction(action, context);

      expect(customHandler).toHaveBeenCalledWith({ message: 'test' }, context);
    });

    test('should throw error for unknown action types', () => {
      const action = { unknownAction: { data: 'test' } } as Action & {
        unknownAction: { data: string };
      };

      expect(() => {
        actionHandler.executeAction(action, {});
      }).toThrow('Unknown action type: unknownAction');
    });

    test('should allow overriding built-in action handlers', () => {
      const customSetHandler = jest.fn();
      actionHandler.registerActionHandler('set', customSetHandler);

      const action: Action = {
        set: { target: 'field.value', value: 'test' },
      };

      actionHandler.executeAction(action, {});

      expect(customSetHandler).toHaveBeenCalledWith({ target: 'field.value', value: 'test' }, {});
      expect(mockOnFieldPropertySet).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    test('should handle COPY action with complex nested paths', () => {
      const action: Action = {
        copy: { source: 'nested.field.value', target: 'targetField.value' },
      };
      const context = { nested: { field: { value: 'deep_value' } } };

      actionHandler.executeAction(action, context);

      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('targetField.value', 'deep_value');
    });

    test('should handle CALCULATE action with nested logic', () => {
      const action: Action = {
        calculate: {
          target: 'field.result',
          formula: {
            '+': [{ '*': [{ var: ['a.value'] }, 2] }, { var: ['b.value'] }],
          },
        },
      };
      const context = { a: { value: 5 }, b: { value: 3 } };

      actionHandler.executeAction(action, context);

      expect(mockOnFieldPropertySet).toHaveBeenCalledWith('field.result', 13);
    });

    test('should handle TRIGGER action without params', () => {
      const action: Action = {
        trigger: { event: 'simple_event' },
      };

      actionHandler.executeAction(action, {});

      expect(mockOnEvent).toHaveBeenCalledWith('simple_event', undefined);
    });
  });
});

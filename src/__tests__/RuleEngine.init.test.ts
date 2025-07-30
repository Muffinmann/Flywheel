import { RuleEngine } from '../RuleEngine.js';
import { RuleSet } from '../DependencyGraph.js';

describe('RuleEngine - Init Action', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  describe('Basic Init Action', () => {
    test('should initialize field state with init action', () => {
      const ruleSet: RuleSet = {
        payment_form: [{
          condition: { '==': [1, 1] },
          action: {
            init: {
              fieldState: {
                isVisible: true,
                currency: 'USD',
                paymentMethods: ['card', 'paypal']
              }
            }
          },
          priority: 0,
          description: 'Initialize payment form'
        }]
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('payment_form');
      
      expect(fieldState.isVisible).toBe(true);
      expect(fieldState.currency).toBe('USD');
      expect(fieldState.paymentMethods).toEqual(['card', 'paypal']);
    });

    test('should initialize field value with init action', () => {
      const ruleSet: RuleSet = {
        user_preference: [{
          condition: { '==': [1, 1] },
          action: {
            init: {
              fieldValue: 'dark-mode'
            }
          },
          priority: 0
        }]
      };

      engine.loadRuleSet(ruleSet);
      engine.evaluateField('user_preference');
      
      // Update the engine to get field value
      engine.updateField({ dummy: 'trigger' }); // Trigger context rebuild
      const context = (engine as any).context;
      expect(context.user_preference).toBe('dark-mode');
    });

    test('should initialize both field state and value', () => {
      const ruleSet: RuleSet = {
        subscription: [{
          condition: { '==': [1, 1] },
          action: {
            init: {
              fieldState: {
                isVisible: true,
                plans: ['basic', 'pro', 'enterprise']
              },
              fieldValue: 'pro'
            }
          },
          priority: 0
        }]
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('subscription');
      
      expect(fieldState.isVisible).toBe(true);
      expect(fieldState.plans).toEqual(['basic', 'pro', 'enterprise']);
      
      engine.updateField({ dummy: 'trigger' });
      const context = (engine as any).context;
      expect(context.subscription).toBe('pro');
    });
  });

  describe('Conditional Initialization', () => {
    test('should apply init based on user role', () => {
      const ruleSet: RuleSet = {
        payment_options: [
          {
            condition: { '==': [{ var: 'user.role' }, 'premium'] },
            action: {
              init: {
                fieldState: {
                  isVisible: true,
                  methods: ['card', 'paypal', 'crypto'],
                  allowSavedCards: true
                }
              }
            },
            priority: 0
          },
          {
            condition: { '==': [{ var: 'user.role' }, 'basic'] },
            action: {
              init: {
                fieldState: {
                  isVisible: true,
                  methods: ['card', 'paypal'],
                  allowSavedCards: false
                }
              }
            },
            priority: 0
          }
        ]
      };

      // Test premium user
      engine.updateField({ user: { role: 'premium' } });
      engine.loadRuleSet(ruleSet);
      let fieldState = engine.evaluateField('payment_options');
      
      expect(fieldState.methods).toEqual(['card', 'paypal', 'crypto']);
      expect(fieldState.allowSavedCards).toBe(true);

      // Test basic user
      engine = new RuleEngine(); // Reset engine
      engine.updateField({ user: { role: 'basic' } });
      engine.loadRuleSet(ruleSet);
      fieldState = engine.evaluateField('payment_options');
      
      expect(fieldState.methods).toEqual(['card', 'paypal']);
      expect(fieldState.allowSavedCards).toBe(false);
    });

    test('should apply first matching init rule only', () => {
      const ruleSet: RuleSet = {
        feature_flag: [
          {
            condition: { var: 'beta.enabled' },
            action: {
              init: {
                fieldState: {
                  version: 'beta',
                  features: ['new-ui', 'advanced-analytics']
                }
              }
            },
            priority: 0
          },
          {
            condition: { '==': [1, 1] }, // Always true fallback
            action: {
              init: {
                fieldState: {
                  version: 'stable',
                  features: ['basic-ui']
                }
              }
            },
            priority: 1
          }
        ]
      };

      // Test beta enabled
      engine.updateField({ beta: { enabled: true } });
      engine.loadRuleSet(ruleSet);
      let fieldState = engine.evaluateField('feature_flag');
      
      expect(fieldState.version).toBe('beta');
      expect(fieldState.features).toEqual(['new-ui', 'advanced-analytics']);

      // Test beta disabled
      engine = new RuleEngine();
      engine.updateField({ beta: { enabled: false } });
      engine.loadRuleSet(ruleSet);
      fieldState = engine.evaluateField('feature_flag');
      
      expect(fieldState.version).toBe('stable');
      expect(fieldState.features).toEqual(['basic-ui']);
    });
  });

  describe('Merge Behavior', () => {
    test('should merge with default state when merge is true', () => {
      const engine = new RuleEngine({
        onFieldStateCreation: () => ({
          isVisible: false,
          isRequired: false,
          defaultProp: 'default'
        })
      });

      const ruleSet: RuleSet = {
        test_field: [{
          condition: { '==': [1, 1] },
          action: {
            init: {
              fieldState: {
                isVisible: true,
                customProp: 'custom'
              },
              merge: true
            }
          },
          priority: 0
        }]
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('test_field');
      
      expect(fieldState.isVisible).toBe(true); // Overridden
      expect(fieldState.isRequired).toBe(false); // Kept from default
      expect(fieldState.defaultProp).toBe('default'); // Kept from default
      expect(fieldState.customProp).toBe('custom'); // Added
    });

    test('should replace default state when merge is false', () => {
      const engine = new RuleEngine({
        onFieldStateCreation: () => ({
          isVisible: false,
          isRequired: false,
          defaultProp: 'default'
        })
      });

      const ruleSet: RuleSet = {
        test_field: [{
          condition: { '==': [1, 1] },
          action: {
            init: {
              fieldState: {
                isVisible: true,
                customProp: 'custom'
              },
              merge: false
            }
          },
          priority: 0
        }]
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('test_field');
      
      expect(fieldState.isVisible).toBe(true); // From init
      expect(fieldState.isRequired).toBe(false); // From base default (not custom default)
      expect(fieldState.defaultProp).toBeUndefined(); // Not included
      expect(fieldState.customProp).toBe('custom'); // Added
    });
  });

  describe('Priority Handling', () => {
    test('should process init rules by priority order', () => {
      const mockWarn = jest.spyOn(console, 'warn').mockImplementation();
      
      const ruleSet: RuleSet = {
        priority_test: [
          {
            condition: { '==': [1, 1] },
            action: {
              init: {
                fieldState: { value: 'third' }
              }
            },
            priority: 2
          },
          {
            condition: { '==': [1, 1] },
            action: {
              init: {
                fieldState: { value: 'first' }
              }
            },
            priority: 0
          },
          {
            condition: { '==': [1, 1] },
            action: {
              init: {
                fieldState: { value: 'second' }
              }
            },
            priority: 1
          }
        ]
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('priority_test');
      
      // Should apply first rule (priority 0)
      expect(fieldState.value).toBe('first');
      
      mockWarn.mockRestore();
    });

    test('should warn about multiple init rules with same priority', () => {
      const mockWarn = jest.spyOn(console, 'warn').mockImplementation();
      
      const ruleSet: RuleSet = {
        conflict_test: [
          {
            condition: { '==': [1, 1] },
            action: {
              init: {
                fieldState: { value: 'rule1' }
              }
            },
            priority: 0
          },
          {
            condition: { '==': [1, 1] },
            action: {
              init: {
                fieldState: { value: 'rule2' }
              }
            },
            priority: 0
          }
        ]
      };

      engine.loadRuleSet(ruleSet);
      engine.evaluateField('conflict_test');
      
      expect(mockWarn).toHaveBeenCalledWith(
        expect.stringContaining("Field 'conflict_test' has 2 init rules with priority 0")
      );
      
      mockWarn.mockRestore();
    });
  });

  describe('Integration with Regular Rules', () => {
    test('should apply init rules before regular rules', () => {
      const ruleSet: RuleSet = {
        integration_test: [
          {
            condition: { '==': [1, 1] },
            action: {
              init: {
                fieldState: {
                  isVisible: true,
                  counter: 0
                }
              }
            },
            priority: 0
          },
          {
            condition: { '==': [1, 1] },
            action: {
              setState: {
                target: 'integration_test.modified',
                value: true
              }
            },
            priority: 10
          }
        ]
      };

      engine.loadRuleSet(ruleSet);
      const fieldState = engine.evaluateField('integration_test');
      
      expect(fieldState.isVisible).toBe(true);
      expect(fieldState.counter).toBe(0); // From init
      expect(fieldState.modified).toBe(true); // From regular rule
    });

    test('should process init rule once and regular rules normally', () => {
      let initCount = 0;
      let regularCount = 0;

      const customEngine = new RuleEngine();
      
      // Track action executions
      customEngine.registerCustomAction('trackInit', {
        handler: () => { initCount++; },
        targetExtractor: () => []
      });
      
      customEngine.registerCustomAction('trackRegular', {
        handler: () => { regularCount++; },
        targetExtractor: () => []
      });

      const ruleSet: RuleSet = {
        tracking_test: [
          {
            condition: { '==': [1, 1] },
            action: {
              batch: [
                {
                  init: {
                    fieldState: { initialized: true }
                  }
                },
                { trackInit: {} } as any
              ]
            },
            priority: 0
          },
          {
            condition: { '==': [1, 1] },
            action: { trackRegular: {} } as any,
            priority: 1
          }
        ]
      };

      customEngine.loadRuleSet(ruleSet);
      customEngine.evaluateField('tracking_test');
      
      expect(initCount).toBe(1);
      expect(regularCount).toBe(1);
    });
  });

  describe('Validation', () => {
    test('should throw error if init action has neither fieldState nor fieldValue', () => {
      const ruleSet: RuleSet = {
        invalid_init: [{
          condition: { '==': [1, 1] },
          action: {
            init: {}
          },
          priority: 0
        }]
      };

      engine.loadRuleSet(ruleSet);
      
      expect(() => {
        engine.evaluateField('invalid_init');
      }).toThrow('Init action must specify either fieldState or fieldValue');
    });

    test('should throw error if merge is not boolean', () => {
      const ruleSet: RuleSet = {
        invalid_merge: [{
          condition: { '==': [1, 1] },
          action: {
            init: {
              fieldState: { test: true },
              merge: 'yes' as any
            }
          },
          priority: 0
        }]
      };

      engine.loadRuleSet(ruleSet);
      
      expect(() => {
        engine.evaluateField('invalid_merge');
      }).toThrow('Init action merge flag must be a boolean');
    });

    test('should throw error if fieldState is not an object', () => {
      const ruleSet: RuleSet = {
        invalid_state: [{
          condition: { '==': [1, 1] },
          action: {
            init: {
              fieldState: 'invalid' as any
            }
          },
          priority: 0
        }]
      };

      engine.loadRuleSet(ruleSet);
      
      expect(() => {
        engine.evaluateField('invalid_state');
      }).toThrow('Init action fieldState must be an object');
    });
  });

  describe('Cache Behavior', () => {
    test('should cache field state after init', () => {
      const ruleSet: RuleSet = {
        cached_field: [{
          condition: { '==': [1, 1] },
          action: {
            init: {
              fieldState: { initialized: true }
            }
          },
          priority: 0
        }]
      };

      engine.loadRuleSet(ruleSet);
      
      // First evaluation
      const fieldState1 = engine.evaluateField('cached_field');
      expect(fieldState1.initialized).toBe(true);
      
      // Second evaluation should return cached result
      const fieldState2 = engine.evaluateField('cached_field');
      expect(fieldState2).toBe(fieldState1); // Same object reference
    });
  });
});
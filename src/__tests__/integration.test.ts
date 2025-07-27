import { RuleEngine, RuleSet } from '../RuleEngine.js';
import { LogicResolver } from '../LogicResolver.js';

describe('Integration Tests', () => {
  describe('E-commerce Product Configuration', () => {
    let engine: RuleEngine;

    beforeEach(() => {
      engine = new RuleEngine({
        onFieldStateCreation: () => ({
          options: [],
          price: 0,
          description: ''
        })
      });
    });

    test('should handle complex product configuration rules', () => {
      const sharedRules = {
        is_premium_user: { '==': [{ var: ['user.tier'] }, 'premium'] },
        has_discount_code: { '!=': [{ var: ['discount_code'] }, null] },
        product_is_clothing: { '==': [{ var: ['product.category'] }, 'clothing'] }
      };

      const ruleSet: RuleSet = {
        // Size options only visible for clothing
        size_selector: [{
          condition: { '$ref': 'product_is_clothing' },
          action: { set: { target: 'size_selector.isVisible', value: true } },
          priority: 1,
          description: 'Show size selector for clothing items'
        }],

        // Premium options only for premium users
        premium_customization: [{
          condition: { '$ref': 'is_premium_user' },
          action: { set: { target: 'premium_customization.isVisible', value: true } },
          priority: 1,
          description: 'Show premium customization for premium users'
        }],

        // Discount field visible when user has discount code
        discount_field: [{
          condition: { '$ref': 'has_discount_code' },
          action: { set: { target: 'discount_field.isVisible', value: true } },
          priority: 1
        }],

        // Calculate total price
        total_price: [
          {
            condition: { '==': [1, 1] }, // Always true
            action: {
              calculate: {
                target: 'total_price.calculatedValue',
                formula: {
                  '+': [
                    { var: ['product.base_price'] },
                    { var: ['shipping_cost'] }
                  ]
                }
              }
            },
            priority: 1,
            description: 'Calculate base total'
          },
          {
            condition: {
              and: [
                { '$ref': 'has_discount_code' },
                { '>': [{ var: ['discount_percentage'] }, 0] }
              ]
            },
            action: {
              calculate: {
                target: 'total_price.calculatedValue',
                formula: {
                  '*': [
                    { var: ['total_price.calculatedValue'] },
                    { '-': [1, { '/': [{ var: ['discount_percentage'] }, 100] }] }
                  ]
                }
              }
            },
            priority: 2,
            description: 'Apply discount'
          }
        ],

        // Express shipping for high-value orders
        express_shipping: [{
          condition: { '>': [{ var: ['total_price.calculatedValue'] }, 100] },
          action: { set: { target: 'express_shipping.isVisible', value: true } },
          priority: 1,
          description: 'Show express shipping for orders over $100'
        }]
      };

      engine.registerSharedRules(sharedRules);
      engine.loadRuleSet(ruleSet);

      // Test scenario: Premium user buying clothing with discount
      engine.updateField({
        user: { tier: 'premium' },
        product: { 
          category: 'clothing', 
          base_price: 80 
        },
        discount_code: 'SAVE20',
        discount_percentage: 20,
        shipping_cost: 10
      });

      // Evaluate all fields
      const sizeSelector = engine.evaluateField('size_selector');
      const premiumCustomization = engine.evaluateField('premium_customization');
      const discountField = engine.evaluateField('discount_field');
      const totalPrice = engine.evaluateField('total_price');
      const expressShipping = engine.evaluateField('express_shipping');

      expect(sizeSelector.isVisible).toBe(true);
      expect(premiumCustomization.isVisible).toBe(true);
      expect(discountField.isVisible).toBe(true);
      expect(totalPrice.calculatedValue).toBe(72); // (80 + 10) * 0.8 = 72
      expect(expressShipping.isVisible).toBe(false); // 72 < 100
    });

    test('should handle dependency cascade updates', () => {
      const ruleSet: RuleSet = {
        shipping_cost: [{
          condition: { '==': [{ var: ['shipping_method'] }, 'express'] },
          action: { set: { target: 'shipping_cost.calculatedValue', value: 25 } },
          priority: 1
        }, {
          condition: { '==': [{ var: ['shipping_method'] }, 'standard'] },
          action: { set: { target: 'shipping_cost.calculatedValue', value: 5 } },
          priority: 2
        }],

        total_cost: [{
          condition: { '==': [1, 1] },
          action: {
            calculate: {
              target: 'total_cost.calculatedValue',
              formula: {
                '+': [
                  { var: ['product_price'] },
                  { var: ['shipping_cost.calculatedValue'] }
                ]
              }
            }
          },
          priority: 1
        }],

        free_shipping_notice: [{
          condition: { '==': [{ var: ['shipping_cost.calculatedValue'] }, 0] },
          action: { set: { target: 'free_shipping_notice.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      engine.updateField({ 
        product_price: 50,
        shipping_method: 'express'
      });

      let totalCost = engine.evaluateField('total_cost');
      let freeShippingNotice = engine.evaluateField('free_shipping_notice');

      expect(totalCost.calculatedValue).toBe(75); // 50 + 25
      expect(freeShippingNotice.isVisible).toBe(false);

      // Change to free shipping
      engine.updateField({ shipping_method: 'free' });
      
      // This should cascade: shipping_cost -> total_cost -> free_shipping_notice
      totalCost = engine.evaluateField('total_cost');
      freeShippingNotice = engine.evaluateField('free_shipping_notice');

      expect(totalCost.calculatedValue).toBe(50); // 50 + 0 (no matching rule for 'free')
      expect(freeShippingNotice.isVisible).toBe(true);
    });
  });

  describe('Form Validation Workflow', () => {
    let engine: RuleEngine;
    const validationEvents: any[] = [];

    beforeEach(() => {
      validationEvents.length = 0;
      engine = new RuleEngine({
        onEvent: (eventType, params) => {
          validationEvents.push({ eventType, params });
        },
        onFieldStateCreation: () => ({
          errorMessage: '',
          isValid: true
        })
      });
    });

    test('should handle multi-step form validation', () => {
      const ruleSet: RuleSet = {
        // Email validation
        email_field: [
          {
            condition: { '!=': [{ var: ['email'] }, ''] },
            action: { set: { target: 'email_field.isRequired', value: false } },
            priority: 1
          },
          {
            condition: {
              and: [
                { '!=': [{ var: ['email'] }, ''] },
                { '!=': [{ var: ['email'] }, null] }
              ]
            },
            action: { trigger: { event: 'validate_email', params: { email: { var: ['email'] } } } },
            priority: 2
          }
        ],

        // Password confirmation
        password_confirm: [
          {
            condition: { '!=': [{ var: ['password'] }, ''] },
            action: { set: { target: 'password_confirm.isVisible', value: true } },
            priority: 1
          },
          {
            condition: {
              and: [
                { '!=': [{ var: ['password'] }, ''] },
                { '!=': [{ var: ['password_confirm'] }, { var: ['password'] }] }
              ]
            },
            action: {
              batch: [
                { set: { target: 'password_confirm.isValid', value: false } },
                { set: { target: 'password_confirm.errorMessage', value: 'Passwords do not match' } }
              ]
            },
            priority: 2
          }
        ],

        // Submit button
        submit_button: [{
          condition: {
            and: [
              { '!=': [{ var: ['email'] }, ''] },
              { '!=': [{ var: ['password'] }, ''] },
              { '==': [{ var: ['password_confirm.isValid'] }, true] }
            ]
          },
          action: { set: { target: 'submit_button.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);

      // Step 1: Enter email
      engine.updateField({ email: 'user@example.com' });
      engine.evaluateField('email_field');

      expect(validationEvents).toHaveLength(1);
      expect(validationEvents[0].eventType).toBe('validate_email');

      // Step 2: Enter password
      engine.updateField({ password: 'secret123' });
      const passwordConfirm = engine.evaluateField('password_confirm');
      expect(passwordConfirm.isVisible).toBe(true);

      // Step 3: Enter mismatched password confirmation
      engine.updateField({ password_confirm: 'secret456' });
      const invalidConfirm = engine.evaluateField('password_confirm');
      expect(invalidConfirm.isValid).toBe(false);
      expect(invalidConfirm.errorMessage).toBe('Passwords do not match');

      // Submit button should not be visible
      let submitButton = engine.evaluateField('submit_button');
      expect(submitButton.isVisible).toBe(false);

      // Step 4: Fix password confirmation
      engine.updateField({ password_confirm: 'secret123' });
      const validConfirm = engine.evaluateField('password_confirm');
      expect(validConfirm.isValid).toBe(true);

      // Now submit button should be visible
      submitButton = engine.evaluateField('submit_button');
      expect(submitButton.isVisible).toBe(true);
    });
  });

  describe('Medical Device Configuration', () => {
    let engine: RuleEngine;

    beforeEach(() => {
      engine = new RuleEngine();

      // Setup lookup tables for medical devices
      const deviceTable = {
        table: [
          { id: 'dev001', name: 'Knee Brace', bilateral: true, category: 'orthotic' },
          { id: 'dev002', name: 'Ankle Support', bilateral: false, category: 'orthotic' },
          { id: 'dev003', name: 'Prosthetic Leg', bilateral: false, category: 'prosthetic' }
        ],
        primaryKey: 'id'
      };

      engine.registerLookupTables([deviceTable]);
    });

    test('should handle lookup-based configurations', () => {
      const ruleSet: RuleSet = {
        bilateral_option: [{
          condition: { '==': [{ var: ['selected_device@table.bilateral'] }, true] },
          action: { set: { target: 'bilateral_option.isVisible', value: true } },
          priority: 1,
          description: 'Show bilateral option for bilateral devices'
        }],

        prosthetic_options: [{
          condition: { '==': [{ var: ['selected_device@table.category'] }, 'prosthetic'] },
          action: { set: { target: 'prosthetic_options.isVisible', value: true } },
          priority: 1,
          description: 'Show prosthetic-specific options'
        }],

        device_name_display: [{
          condition: { '!=': [{ var: ['selected_device'] }, null] },
          action: {
            copy: {
              source: 'selected_device@table.name',
              target: 'device_name_display.calculatedValue'
            }
          },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);

      // Test with bilateral knee brace
      engine.updateField({ selected_device: 'dev001' });

      const bilateralOption = engine.evaluateField('bilateral_option');
      const prostheticOptions = engine.evaluateField('prosthetic_options');
      const deviceNameDisplay = engine.evaluateField('device_name_display');

      expect(bilateralOption.isVisible).toBe(true);
      expect(prostheticOptions.isVisible).toBe(false);
      expect(deviceNameDisplay.calculatedValue).toBe('Knee Brace');

      // Test with prosthetic leg
      engine.updateField({ selected_device: 'dev003' });

      const bilateralOption2 = engine.evaluateField('bilateral_option');
      const prostheticOptions2 = engine.evaluateField('prosthetic_options');
      const deviceNameDisplay2 = engine.evaluateField('device_name_display');

      expect(bilateralOption2.isVisible).toBe(false);
      expect(prostheticOptions2.isVisible).toBe(true);
      expect(deviceNameDisplay2.calculatedValue).toBe('Prosthetic Leg');
    });
  });

  describe('Performance and Caching', () => {
    let engine: RuleEngine;
    let evaluationCount = 0;

    beforeEach(() => {
      evaluationCount = 0;
      engine = new RuleEngine();

      // Register a custom operator that counts evaluations
      const resolver = engine['logicResolver'];
      resolver.registerCustomLogic([{
        operator: 'track_eval',
        operand: (args) => {
          evaluationCount++;
          return args[0];
        }
      }]);
    });

    test('should cache evaluation results', () => {
      const ruleSet: RuleSet = {
        cached_field: [{
          condition: { track_eval: [{ var: ['trigger'] }] },
          action: { set: { target: 'cached_field.isVisible', value: true } },
          priority: 1
        }]
      };

      engine.loadRuleSet(ruleSet);
      engine.updateField({ trigger: true });

      // First evaluation
      engine.evaluateField('cached_field');
      expect(evaluationCount).toBe(1);

      // Second evaluation should use cache
      engine.evaluateField('cached_field');
      expect(evaluationCount).toBe(1); // Still 1, not 2

      // Change dependency should invalidate cache
      engine.updateField({ trigger: false });
      engine.evaluateField('cached_field');
      expect(evaluationCount).toBe(2); // Now 2
    });
  });
});
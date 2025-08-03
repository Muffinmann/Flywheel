import { RuleEngine } from '../RuleEngine.js';
import { RuleSet } from '../DependencyGraph.js';

describe('Integration Tests', () => {
  describe('E-commerce Product Configuration', () => {
    let engine: RuleEngine;

    beforeEach(() => {
      engine = new RuleEngine({
        onFieldStateCreation: () => ({
          options: [],
          price: 0,
          description: '',
        }),
      });
    });

    test('should handle complex product configuration rules', () => {
      const sharedRules = {
        is_premium_user: { '==': [{ var: ['user.value.tier'] }, 'premium'] },
        has_discount_code: { '!=': [{ var: ['discount_code.value'] }, null] },
        product_is_clothing: { '==': [{ var: ['product.value.category'] }, 'clothing'] },
      };

      const ruleSet: RuleSet = {
        // Size options only visible for clothing
        size_selector: [
          {
            condition: { '==': [{ var: ['product.value.category'] }, 'clothing'] },
            action: { set: { target: 'size_selector.isVisible', value: true } },
            priority: 1,
            description: 'Show size selector for clothing items',
          },
        ],

        // Premium options only for premium users
        premium_customization: [
          {
            condition: { '==': [{ var: ['user.value.tier'] }, 'premium'] },
            action: { set: { target: 'premium_customization.isVisible', value: true } },
            priority: 1,
            description: 'Show premium customization for premium users',
          },
        ],

        // Discount field visible when user has discount code
        discount_field: [
          {
            condition: { $ref: 'has_discount_code' },
            action: { set: { target: 'discount_field.isVisible', value: true } },
            priority: 1,
          },
        ],

        // Calculate base total price
        base_total: [
          {
            condition: { '==': [1, 1] }, // Always true
            action: {
              calculate: {
                target: 'base_total.calculatedValue',
                formula: {
                  '+': [{ var: ['product.value.base_price'] }, { var: ['shipping_cost.value'] }],
                },
              },
            },
            priority: 1,
            description: 'Calculate base total',
          },
        ],

        // Calculate final total price with discount
        total_price: [
          {
            condition: { '==': [1, 1] }, // Always true
            action: {
              calculate: {
                target: 'total_price.calculatedValue',
                formula: {
                  if: [
                    {
                      and: [
                        { $ref: 'has_discount_code' },
                        { '>': [{ var: ['discount_percentage.value'] }, 0] },
                      ],
                    },
                    {
                      '*': [
                        { var: ['base_total.calculatedValue'] },
                        { '-': [1, { '/': [{ var: ['discount_percentage.value'] }, 100] }] },
                      ],
                    },
                    { var: ['base_total.calculatedValue'] },
                  ],
                },
              },
            },
            priority: 1,
            description: 'Calculate final total with optional discount',
          },
        ],

        // Express shipping for high-value orders
        express_shipping: [
          {
            condition: { '>': [{ var: ['total_price.calculatedValue'] }, 100] },
            action: { set: { target: 'express_shipping.isVisible', value: true } },
            priority: 1,
            description: 'Show express shipping for orders over $100',
          },
        ],
      };

      engine.registerSharedRules(sharedRules);
      engine.loadRuleSet(ruleSet);

      // Test scenario: Premium user buying clothing with discount
      engine.updateFieldValue({
        user: { tier: 'premium' },
        product: {
          category: 'clothing',
          base_price: 80,
        },
        discount_code: 'SAVE20',
        discount_percentage: 20,
        shipping_cost: 10,
      });

      // Evaluate all fields
      const sizeSelector = engine.evaluateField('size_selector');
      const premiumCustomization = engine.evaluateField('premium_customization');
      const discountField = engine.evaluateField('discount_field');
      const baseTotal = engine.evaluateField('base_total');
      const totalPrice = engine.evaluateField('total_price');
      const expressShipping = engine.evaluateField('express_shipping');

      expect(sizeSelector.isVisible).toBe(true);
      expect(premiumCustomization.isVisible).toBe(true);
      expect(discountField.isVisible).toBe(true);
      expect(baseTotal.calculatedValue).toBe(90); // 80 + 10 = 90
      expect(totalPrice.calculatedValue).toBe(72); // (80 + 10) * 0.8 = 72
      expect(expressShipping.isVisible).toBe(false); // 72 < 100
    });

    test('should handle dependency cascade updates', () => {
      const ruleSet: RuleSet = {
        shipping_cost: [
          {
            condition: { '==': [{ var: ['shipping_method.value'] }, 'express'] },
            action: { set: { target: 'shipping_cost.calculatedValue', value: 25 } },
            priority: 1,
          },
          {
            condition: { '==': [{ var: ['shipping_method.value'] }, 'standard'] },
            action: { set: { target: 'shipping_cost.calculatedValue', value: 5 } },
            priority: 2,
          },
          {
            condition: { '==': [{ var: ['shipping_method.value'] }, 'free'] },
            action: { set: { target: 'shipping_cost.calculatedValue', value: 0 } },
            priority: 3,
          },
        ],

        total_cost: [
          {
            condition: { '==': [1, 1] },
            action: {
              calculate: {
                target: 'total_cost.calculatedValue',
                formula: {
                  '+': [
                    { var: ['product_price.value'] },
                    { var: ['shipping_cost.calculatedValue'] },
                  ],
                },
              },
            },
            priority: 1,
          },
        ],

        free_shipping_notice: [
          {
            condition: { '==': [{ var: ['shipping_cost.calculatedValue'] }, 0] },
            action: { set: { target: 'free_shipping_notice.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      engine.updateFieldValue({
        product_price: 50,
        shipping_method: 'express',
      });

      // Evaluate initial state
      let shippingCost = engine.evaluateField('shipping_cost');
      let totalCost = engine.evaluateField('total_cost');
      let freeShippingNotice = engine.evaluateField('free_shipping_notice');

      expect(shippingCost.calculatedValue).toBe(25); // Express shipping
      expect(totalCost.calculatedValue).toBe(75); // 50 + 25
      expect(freeShippingNotice.isVisible).toBe(false);

      // Change to free shipping
      engine.updateFieldValue({ shipping_method: 'free' });

      // Re-evaluate after update - should cascade: shipping_cost -> total_cost -> free_shipping_notice
      shippingCost = engine.evaluateField('shipping_cost');
      totalCost = engine.evaluateField('total_cost');
      freeShippingNotice = engine.evaluateField('free_shipping_notice');

      expect(shippingCost.calculatedValue).toBe(0); // Free shipping
      expect(totalCost.calculatedValue).toBe(50); // 50 + 0
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
          isValid: true,
        }),
      });
    });

    test('should handle multi-step form validation', () => {
      const ruleSet: RuleSet = {
        // Email validation
        email_field: [
          {
            condition: { '!=': [{ var: ['email.value'] }, ''] },
            action: { set: { target: 'email_field.isRequired', value: false } },
            priority: 1,
          },
          {
            condition: {
              and: [
                { '!=': [{ var: ['email.value'] }, ''] },
                { '!=': [{ var: ['email.value'] }, null] },
              ],
            },
            action: {
              trigger: { event: 'validate_email', params: { email: { var: ['email.value'] } } },
            },
            priority: 2,
          },
        ],

        // Password confirmation visibility
        password_confirm: [
          {
            condition: { '!=': [{ var: ['password.value'] }, ''] },
            action: { set: { target: 'password_confirm.isVisible', value: true } },
            priority: 1,
          },
        ],

        // Password validation (separate field to avoid circular dependency)
        password_validation: [
          {
            condition: {
              and: [
                { '!=': [{ var: ['password.value'] }, ''] },
                { '!=': [{ var: ['password_confirm_input.value'] }, ''] },
                { '!=': [{ var: ['password_confirm_input.value'] }, { var: ['password.value'] }] },
              ],
            },
            action: {
              batch: [
                { set: { target: 'password_confirm.isValid', value: false } },
                {
                  set: { target: 'password_confirm.errorMessage', value: 'Passwords do not match' },
                },
              ],
            },
            priority: 1,
          },
          {
            condition: {
              and: [
                { '!=': [{ var: ['password.value'] }, ''] },
                { '!=': [{ var: ['password_confirm_input.value'] }, ''] },
                { '==': [{ var: ['password_confirm_input.value'] }, { var: ['password.value'] }] },
              ],
            },
            action: {
              batch: [
                { set: { target: 'password_confirm.isValid', value: true } },
                { set: { target: 'password_confirm.errorMessage', value: '' } },
              ],
            },
            priority: 2,
          },
        ],

        // Submit button
        submit_button: [
          {
            condition: {
              and: [
                { '!=': [{ var: ['email.value'] }, ''] },
                { '!=': [{ var: ['password.value'] }, ''] },
                { '==': [{ var: ['password_confirm.isValid'] }, true] },
              ],
            },
            action: { set: { target: 'submit_button.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);

      // Step 1: Enter email
      engine.updateFieldValue({ email: 'user@example.com' });
      engine.evaluateField('email_field');

      expect(validationEvents).toHaveLength(1);
      expect(validationEvents[0].eventType).toBe('validate_email');

      // Step 2: Enter password
      engine.updateFieldValue({ password: 'secret123' });
      const passwordConfirm = engine.evaluateField('password_confirm');
      expect(passwordConfirm.isVisible).toBe(true);

      // Step 3: Enter mismatched password confirmation
      engine.updateFieldValue({ password_confirm_input: 'secret456' });
      engine.evaluateField('password_validation'); // Trigger validation
      const invalidConfirm = engine.evaluateField('password_confirm');
      expect(invalidConfirm.isValid).toBe(false);
      expect(invalidConfirm.errorMessage).toBe('Passwords do not match');

      // Submit button should not be visible
      let submitButton = engine.evaluateField('submit_button');
      expect(submitButton.isVisible).toBe(false);

      // Step 4: Fix password confirmation
      engine.updateFieldValue({ password_confirm_input: 'secret123' });
      engine.evaluateField('password_validation'); // Trigger validation
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
          { id: 'dev003', name: 'Prosthetic Leg', bilateral: false, category: 'prosthetic' },
        ],
        primaryKey: 'id',
        name: 'devices',
      };

      engine.registerLookupTables([deviceTable]);
    });

    test('should handle lookup-based configurations', () => {
      const ruleSet: RuleSet = {
        bilateral_option: [
          {
            condition: { '==': [{ varTable: ['selected_device@devices.bilateral'] }, true] },
            action: { set: { target: 'bilateral_option.isVisible', value: true } },
            priority: 1,
            description: 'Show bilateral option for bilateral devices',
          },
          {
            condition: { '!=': [{ varTable: ['selected_device@devices.bilateral'] }, true] },
            action: { set: { target: 'bilateral_option.isVisible', value: false } },
            priority: 2,
            description: 'Hide bilateral option for non-bilateral devices',
          },
        ],

        prosthetic_options: [
          {
            condition: { '==': [{ varTable: ['selected_device@devices.category'] }, 'prosthetic'] },
            action: { set: { target: 'prosthetic_options.isVisible', value: true } },
            priority: 1,
            description: 'Show prosthetic-specific options',
          },
        ],

        device_name_display: [
          {
            condition: { '!=': [{ var: ['selected_device.value'] }, null] },
            action: {
              calculate: {
                target: 'device_name_display.calculatedValue',
                formula: { varTable: ['selected_device@devices.name'] },
              },
            },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);

      // Test with bilateral knee brace
      engine.updateFieldValue({ selected_device: 'dev001' });

      const bilateralOption = engine.evaluateField('bilateral_option');
      const prostheticOptions = engine.evaluateField('prosthetic_options');
      const deviceNameDisplay = engine.evaluateField('device_name_display');

      expect(bilateralOption.isVisible).toBe(true);
      expect(prostheticOptions.isVisible).toBe(false);
      expect(deviceNameDisplay.calculatedValue).toBe('Knee Brace');

      // Test with prosthetic leg
      engine.updateFieldValue({ selected_device: 'dev003' });

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
      resolver.registerCustomLogic([
        {
          operator: 'track_eval',
          operand: (args) => {
            evaluationCount++;
            return args[0];
          },
        },
      ]);
    });

    test('should cache evaluation results', () => {
      const ruleSet: RuleSet = {
        cached_field: [
          {
            condition: { track_eval: [{ var: ['trigger.value'] }] },
            action: { set: { target: 'cached_field.isVisible', value: true } },
            priority: 1,
          },
        ],
      };

      engine.loadRuleSet(ruleSet);
      engine.updateFieldValue({ trigger: true });

      // First evaluation
      engine.evaluateField('cached_field');
      expect(evaluationCount).toBe(1);

      // Second evaluation should use cache
      engine.evaluateField('cached_field');
      expect(evaluationCount).toBe(1); // Still 1, not 2

      // Change dependency should invalidate cache
      engine.updateFieldValue({ trigger: false });
      engine.evaluateField('cached_field');
      expect(evaluationCount).toBe(2); // Now 2
    });
  });
});

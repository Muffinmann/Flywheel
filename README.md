# Flywheel

A powerful, hierarchical rule engine for dynamic field configuration using a condition-action pattern. Flywheel enables complex form logic, calculations, and field state management with automatic dependency tracking and intelligent caching.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
- [Logic Operators](#logic-operators)
- [Action Types](#action-types)
- [Examples](#examples)
- [Advanced Features](#advanced-features)

## Features

- 🎯 **Condition-Action Rules**: Define when conditions trigger specific actions
- 🔄 **Automatic Dependency Tracking**: Intelligent evaluation order and caching
- ⚡ **Performance Optimized**: Smart caching with dependency-based invalidation
- 🧩 **Extensible**: Custom operators, actions, and field state properties
- 🔍 **Debug-Friendly**: Comprehensive validation and evaluation tracing
- 📊 **Rich Logic System**: 25+ built-in operators with unlimited nesting
- 🏗️ **Type-Safe**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install flywheel-rules
```

## Quick Start

```typescript
import { RuleEngine } from 'flywheel-rules';

// Initialize the rule engine
const engine = new RuleEngine({
  onEvent: (eventType, params) => {
    console.log(`Event: ${eventType}`, params);
  }
});

// Define rules
const ruleSet = {
  field1: [
    {
      condition: { ">": [{ "var": ["age"] }, 18] },
      action: { setState: { target: "field1.isVisible", value: true } },
      priority: 1
    }
  ]
};

// Load rules and evaluate
engine.loadRuleSet(ruleSet);
engine.updateField({ age: 25 });
const fieldState = engine.evaluateField("field1");
console.log(fieldState); // { isVisible: true, isRequired: false, ... }
```

## Core Concepts

### Rules Structure

Rules follow a condition-action pattern with priority-based execution:

```typescript
interface FieldRule {
  condition: Logic;    // When to execute
  action: Action;      // What to execute  
  priority: number;    // Execution order (lower = first)
}

interface RuleSet {
  [fieldName: string]: FieldRule[];
}
```

### Field State

Each field maintains state properties that can be modified by rules:

```typescript
interface FieldState {
  isVisible: boolean;    // Field visibility
  isRequired: boolean;   // Field requirement
  calculatedValue?: any; // Computed values
  // ... extensible via onFieldStateCreation
}
```

## API Reference

### RuleEngine

#### Constructor

```typescript
constructor(options?: RuleEngineOptions)
```

**Options:**
- `onEvent?`: Handler for custom events triggered by rules
- `onFieldStateCreation?`: Customize default field state properties

#### Core Methods

```typescript
// Load and validate rule set
loadRuleSet(ruleSet: RuleSet): void

// Update field values and trigger re-evaluation
updateField(fieldUpdates: Record<string, any>): string[]

// Evaluate specific field and return complete state
evaluateField(fieldName: string): FieldState

// Register reusable condition logic
registerSharedRules(sharedRules: Record<string, Logic>): void

// Register lookup tables for data relationships
registerLookupTables(tables: LookupTable[]): void

// Register custom action types
registerActionHandler(actionType: string, handler: Function): void

// Debug utilities
getDependenciesOf(fieldName: string): string[]
getLogicResolver(): LogicResolver
```

### LookupTable

```typescript
interface LookupTable {
  table: any[];           // Array of lookup records
  primaryKey: string;     // Field to match against
  name?: string;          // Optional table name
}
```

## Logic Operators

### Variable Access
```typescript
{ "var": ["fieldName"] }              // Access field value
{ "var": ["field.nested.property"] }  // Dot notation support
{ "var": ["$"] }                      // Current item in array operations
```

### Arithmetic Operations
```typescript
{ "+": [1, 2, 3] }           // Addition: 6
{ "-": [10, 3] }             // Subtraction: 7
{ "*": [4, 5] }              // Multiplication: 20
{ "/": [15, 3] }             // Division: 5
{ "sqrt": [16] }             // Square root: 4
{ "floor": [3.7] }           // Floor: 3
{ "abs": [-5] }              // Absolute: 5
```

### Comparison Operations
```typescript
{ ">": [5, 3] }              // Greater than: true
{ "<": [2, 7] }              // Less than: true
{ ">=": [5, 5] }             // Greater or equal: true
{ "<=": [3, 5] }             // Less or equal: true
{ "==": ["hello", "hello"] } // Equal: true
{ "!=": [1, 2] }             // Not equal: true
```

### Logical Operations
```typescript
{ "and": [true, false] }     // Logical AND: false
{ "or": [true, false] }      // Logical OR: true
{ "not": [true] }            // Logical NOT: false
```

### Conditional Logic
```typescript
{ "if": [condition, trueValue, falseValue] }

// Example
{ "if": [
    { ">": [{ "var": ["age"] }, 18] },
    "Adult",
    "Minor"
]}
```

### Array Operations
```typescript
// Test if any element matches condition
{ "some": [
    { "var": ["items"] },
    { ">": [{ "var": ["$"] }, 10] }
]}

// Test if all elements match condition  
{ "every": [
    { "var": ["scores"] },
    { ">=": [{ "var": ["$"] }, 60] }
]}

// Transform array elements
{ "map": [
    { "var": ["prices"] },
    { "*": [{ "var": ["$"] }, 1.1] }
]}
```

### Field State Access
```typescript
{ "fieldState": ["otherField.isVisible"] }  // Access other field's state
{ "fieldState": ["field.calculatedValue"] } // Access calculated values
```

### Lookup Operations
```typescript
// Lookup table syntax sugar
{ "varTable": "userId@users.name" }

// Explicit lookup operation
{ "lookup": ["users", { "var": ["userId"] }, "name"] }
```

### Shared Rules
```typescript
// Reference shared rule
{ "$ref": "isAdult" }

// Register shared rules
engine.registerSharedRules({
  "isAdult": { ">=": [{ "var": ["age"] }, 18] },
  "hasEmail": { "!=": [{ "var": ["email"] }, ""] }
});
```

## Action Types

### Field Value Actions
```typescript
// Set field value directly
{ "set": { target: "fieldName", value: "Hello World" } }

// Copy value from another field
{ "copy": { source: "sourceField", target: "targetField" } }
```

### Field State Actions
```typescript
// Set field state properties
{ "setState": { target: "field.isVisible", value: true } }
{ "setState": { target: "field.isRequired", value: false } }
{ "setState": { target: "field.calculatedValue", value: 42 } }
```

### Calculation Actions
```typescript
// Calculate using logic formula
{ "calculate": { 
    target: "field.calculatedValue",
    formula: { "+": [{ "var": ["price"] }, { "var": ["tax"] }] }
}}
```

### Event Actions
```typescript
// Trigger custom events
{ "trigger": { event: "validation_failed", params: { field: "email" } } }
```

### Batch Actions
```typescript
// Execute multiple actions
{ "batch": [
    { "setState": { target: "field1.isVisible", value: true } },
    { "calculate": { target: "total", formula: { "+": [1, 2] } } },
    { "trigger": { event: "form_updated" } }
]}
```

## Examples

### Dynamic Form Visibility

```typescript
const engine = new RuleEngine();

const formRules = {
  "spouseInfo": [
    {
      condition: { "==": [{ "var": ["maritalStatus"] }, "married"] },
      action: { "setState": { target: "spouseInfo.isVisible", value: true } },
      priority: 1
    }
  ],
  "dependentCount": [
    {
      condition: { ">": [{ "var": ["children"] }, 0] },
      action: { "setState": { target: "dependentCount.isVisible", value: true } },
      priority: 1
    }
  ]
};

engine.loadRuleSet(formRules);

// User selects "married" - spouse info becomes visible
engine.updateField({ maritalStatus: "married" });
console.log(engine.evaluateField("spouseInfo").isVisible); // true

// User enters children count - dependent section appears
engine.updateField({ children: 2 });
console.log(engine.evaluateField("dependentCount").isVisible); // true
```

### Complex Calculations

```typescript
const calculationRules = {
  "totalPrice": [
    {
      condition: true, // Always execute
      action: {
        "calculate": {
          target: "totalPrice.calculatedValue",
          formula: {
            "+": [
              { "*": [{ "var": ["quantity"] }, { "var": ["unitPrice"] }] },
              { "if": [
                  { ">=": [{ "var": ["quantity"] }, 10] },
                  0,  // No tax for bulk orders
                  { "*": [
                      { "*": [{ "var": ["quantity"] }, { "var": ["unitPrice"] }] },
                      0.08
                  ]}
              ]}
            ]
          }
        }
      },
      priority: 1
    }
  ],
  "submitButton": [
    {
      condition: { ">": [{ "fieldState": ["totalPrice.calculatedValue"] }, 0] },
      action: { "setState": { target: "submitButton.isVisible", value: true } },
      priority: 1
    }
  ]
};

engine.loadRuleSet(calculationRules);
engine.updateField({ quantity: 5, unitPrice: 20.00 });

const totalField = engine.evaluateField("totalPrice");
console.log(totalField.calculatedValue); // 108.00 (100 + 8% tax)

const submitButton = engine.evaluateField("submitButton");
console.log(submitButton.isVisible); // true
```

### Lookup Table Integration

```typescript
// Register product catalog
engine.registerLookupTables([
  {
    name: "products",
    primaryKey: "id",
    table: [
      { id: "P001", name: "Laptop", category: "electronics", price: 999.99 },
      { id: "P002", name: "Book", category: "media", price: 15.99 },
      { id: "P003", name: "Shirt", category: "clothing", price: 29.99 }
    ]
  }
]);

const productRules = {
  "productName": [
    {
      condition: { "!=": [{ "var": ["selectedProductId"] }, ""] },
      action: {
        "calculate": {
          target: "productName.calculatedValue",
          formula: { "varTable": "selectedProductId@products.name" }
        }
      },
      priority: 1
    }
  ],
  "shippingSection": [
    {
      condition: { "==": [{ "varTable": "selectedProductId@products.category" }, "electronics"] },
      action: { "setState": { target: "shippingSection.isVisible", value: true } },
      priority: 1
    }
  ]
};

engine.loadRuleSet(productRules);
engine.updateField({ selectedProductId: "P001" });

console.log(engine.evaluateField("productName").calculatedValue); // "Laptop"
console.log(engine.evaluateField("shippingSection").isVisible);   // true
```

### Shared Rules and Complex Logic

```typescript
// Register reusable business logic
engine.registerSharedRules({
  "isAdult": { ">=": [{ "var": ["age"] }, 18] },
  "hasValidEmail": { "and": [
      { "!=": [{ "var": ["email"] }, ""] },
      { "like": [{ "var": ["email"] }, "*@*.*"] }
  ]},
  "isEligibleForDiscount": { "and": [
      { "$ref": "isAdult" },
      { ">": [{ "var": ["membershipYears"] }, 2] }
  ]}
});

const membershipRules = {
  "discountField": [
    {
      condition: { "$ref": "isEligibleForDiscount" },
      action: { "setState": { target: "discountField.isVisible", value: true } },
      priority: 1
    },
    {
      condition: { "$ref": "isEligibleForDiscount" },
      action: {
        "calculate": {
          target: "discountField.calculatedValue",
          formula: { "*": [{ "var": ["orderTotal"] }, 0.1] }
        }
      },
      priority: 2
    }
  ],
  "emailRequired": [
    {
      condition: { "not": [{ "$ref": "hasValidEmail" }] },
      action: { "setState": { target: "email.isRequired", value: true } },
      priority: 1
    }
  ]
};

engine.loadRuleSet(membershipRules);
engine.updateField({ 
  age: 25, 
  membershipYears: 3, 
  orderTotal: 100,
  email: ""
});

console.log(engine.evaluateField("discountField").isVisible);      // true
console.log(engine.evaluateField("discountField").calculatedValue); // 10
console.log(engine.evaluateField("email").isRequired);             // true
```

### Event Handling and Custom Actions

```typescript
const engine = new RuleEngine({
  onEvent: (eventType, params) => {
    switch (eventType) {
      case 'validation_error':
        console.error('Validation failed:', params);
        break;
      case 'calculation_complete':
        console.log('Calculation result:', params.result);
        break;
      case 'audit_log':
        // Log to external system
        break;
    }
  }
});

// Register custom action
engine.registerActionHandler('validate', (payload, context) => {
  const { field, rules } = payload;
  const isValid = validateField(context[field], rules);
  
  if (!isValid) {
    engine.getLogicResolver().triggerEvent('validation_error', { field });
  }
});

const validationRules = {
  "passwordConfirm": [
    {
      condition: { "!=": [{ "var": ["password"] }, { "var": ["confirmPassword"] }] },
      action: { "trigger": { 
        event: "validation_error", 
        params: { field: "confirmPassword", message: "Passwords do not match" }
      }},
      priority: 1
    }
  ],
  "emailField": [
    {
      condition: { "!=": [{ "var": ["email"] }, ""] },
      action: { "validate": { 
        field: "email", 
        rules: ["required", "email_format"] 
      }},
      priority: 1
    }
  ],
  "submitButton": [
    {
      condition: { "==": [{ "var": ["password"] }, { "var": ["confirmPassword"] }] },
      action: { "setState": { target: "submitButton.isVisible", value: true } },
      priority: 1
    }
  ]
};

engine.loadRuleSet(validationRules);

// Trigger validation when email is entered
engine.updateField({ 
  email: "invalid-email", 
  password: "secret123", 
  confirmPassword: "secret123" 
});
// This will trigger the custom 'validate' action for emailField
```

## Advanced Features

### Custom Field State Properties

```typescript
const engine = new RuleEngine({
  onFieldStateCreation: (props) => ({
    ...props,
    // Add custom properties
    permissions: { read: true, write: true },
    validation: { errors: [], warnings: [] },
    metadata: { lastModified: null }
  })
});

// Rules can now target custom properties
const customRules = {
  "adminField": [
    {
      condition: { "==": [{ "var": ["userRole"] }, "admin"] },
      action: { "setState": { 
        target: "adminField.permissions.write", 
        value: true 
      }},
      priority: 1
    }
  ]
};
```

### Custom Logic Operators

```typescript
// Register custom operators
const logicResolver = engine.getLogicResolver();

logicResolver.registerCustomLogic([
  {
    operator: 'contains',
    operand: (args, context) => {
      const [haystack, needle] = args;
      return String(haystack).includes(String(needle));
    }
  },
  {
    operator: 'currency',
    operand: (args, context) => {
      const [amount] = args;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount);
    }
  }
]);

// Use in rules
const customLogicRules = {
  "warningMessage": [
    {
      condition: { "contains": [{ "var": ["description"] }, "urgent"] },
      action: { "setState": { target: "warningMessage.isVisible", value: true } },
      priority: 1
    }
  ]
};
```

### Performance Optimization

```typescript
// Flywheel automatically optimizes performance through:

// 1. Dependency-based caching
engine.updateField({ age: 25 }); // Only age-dependent fields re-evaluate

// 2. Intelligent invalidation
const invalidatedFields = engine.updateField({ name: "John" });
console.log(invalidatedFields); // ['displayName', 'greeting', ...]

// 3. Debug utilities for performance analysis
console.log(engine.getDependenciesOf("calculatedTotal"));
// ['price', 'quantity', 'taxRate', 'discountPercent']
```

### Debugging and Testing

```typescript
// Comprehensive debugging utilities
const dependencies = engine.getDependenciesOf("totalPrice");
console.log("totalPrice depends on:", dependencies);

const dependents = engine.getDependencyGraph().getDependents("quantity");
console.log("Fields that depend on quantity:", dependents);

// Validation utilities
try {
  engine.loadRuleSet(ruleSet);
} catch (error) {
  console.error("Rule validation failed:", error.message);
}

// Test rule evaluation
const testContext = { age: 30, email: "test@example.com" };
const result = engine.evaluateField("userProfile", testContext);
expect(result.isVisible).toBe(true);
```

---

**Flywheel** provides a comprehensive solution for complex dynamic form logic, business rule management, and field state orchestration. Its powerful yet intuitive API makes it easy to build sophisticated, reactive user interfaces with minimal code.

For more examples and advanced usage patterns, see the test files in the repository.
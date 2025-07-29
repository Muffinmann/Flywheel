# Test Structure Documentation

This document describes the modular test structure that corresponds to the refactored RuleEngine architecture.

## Test Organization

### Modular Tests (Individual Modules)

#### `ActionHandler.test.ts`
Tests the ActionHandler module in isolation:
- **Built-in Actions**: SET, COPY, CALCULATE, TRIGGER, BATCH
- **Custom Action Handlers**: Registration and execution
- **Action Target Extraction**: Finding which fields actions modify
- **Action Dependency Extraction**: Finding which fields actions depend on
- **Edge Cases**: Complex expressions, nested logic

#### `DependencyGraph.test.ts` 
Tests the DependencyGraph module:
- **Basic Dependency Tracking**: Forward and reverse dependencies
- **Complex Dependency Patterns**: Nested expressions, lookups
- **Shared Rules**: Resolution and nested references
- **Circular Dependency Detection**: Direct and indirect cycles
- **Cache Invalidation**: Finding fields to invalidate
- **Edge Cases**: Empty rule sets, complex expressions

#### `FieldStateProvider.test.ts`
Tests the FieldStateProvider module:
- **Default Field State Creation**: Standard and custom states
- **Field State Management**: Set, get, ensure operations
- **Field Property Setting**: Dot notation, nested properties
- **Evaluation Cache Management**: Caching and invalidation
- **Context Provider Interface**: Contributing to rule evaluation context
- **Utility Methods**: Get all states, clear operations

#### `RuleValidator.test.ts`
Tests the RuleValidator module:
- **Priority Conflict Validation**: Same vs different priorities
- **Rule Priority Sorting**: Ascending order, stable sort
- **Rule Structure Validation**: Required fields and types
- **Shared Rule Validation**: Existence checks
- **Integration with Action Target Extraction**: Mock integration
- **Edge Cases**: Zero/negative priorities, large numbers

#### `LookupManager.test.ts`
Tests the LookupManager module:
- **Lookup Table Registration**: Explicit and auto-generated names
- **varTable Custom Logic**: @ syntax for lookups
- **lookup Custom Logic**: Array-based lookup operations
- **Advanced Lookup Scenarios**: Chained lookups, complex expressions
- **Utility Methods**: Clear, get all tables
- **Edge Cases**: Empty tables, null values, duplicates

### Integration Tests

#### `RuleEngine.integration.test.ts`
Tests the integration of all modules through the main RuleEngine:
- **Basic Rule Evaluation**: Simple and complex conditions
- **End-to-End Rule Processing**: Multi-action rules, cascading evaluations
- **Module Integration**: Coordination between all modules
- **Dependency Management Integration**: Cache invalidation, circular detection
- **Shared Rules Integration**: Reference resolution
- **LookupManager Integration**: Lookup table operations
- **FieldStateProvider Integration**: Custom field states
- **ActionHandler Integration**: Custom actions
- **Edge Cases**: Complex scenarios with multiple modules

#### `RuleEngine.orchestration.test.ts`
Tests the orchestration capabilities of the main RuleEngine:
- **Module Coordination**: How modules work together
- **Evaluation Flow Orchestration**: Dependency-first evaluation
- **Configuration Orchestration**: Shared rules, lookup tables
- **Error Handling Orchestration**: Cross-module error propagation
- **Performance Orchestration**: Caching, cache invalidation

### Legacy Tests (Maintained for Compatibility)

#### `RuleEngine.test.ts`
The original comprehensive test suite - maintained for backward compatibility and regression testing.

#### `LogicResolver.test.ts`
Tests for the LogicResolver module (unchanged from original).

#### `integration.test.ts`
Large-scale integration tests with real-world scenarios.

#### `edge-cases.test.ts`
Edge case testing for various scenarios.

#### `RuleManagement.test.ts`
Rule management and validation scenarios.

## Test Execution

### Run All Tests
```bash
npm test
```

### Run Modular Tests Only
```bash
npx jest src/__tests__/ActionHandler.test.ts src/__tests__/DependencyGraph.test.ts src/__tests__/FieldStateProvider.test.ts src/__tests__/RuleValidator.test.ts src/__tests__/LookupManager.test.ts
```

### Run Integration Tests Only
```bash
npx jest src/__tests__/RuleEngine.integration.test.ts src/__tests__/RuleEngine.orchestration.test.ts
```

### Run Legacy Tests Only
```bash
npx jest src/__tests__/RuleEngine.test.ts src/__tests__/integration.test.ts src/__tests__/edge-cases.test.ts
```

## Benefits of Modular Testing

1. **Isolation**: Each module can be tested independently
2. **Clarity**: Tests are organized by responsibility
3. **Maintainability**: Changes to one module don't affect other tests
4. **Debugging**: Easier to identify which module has issues
5. **Coverage**: More comprehensive testing of individual components
6. **Documentation**: Tests serve as documentation for module behavior

## Test Coverage

The modular tests provide comprehensive coverage for:
- ✅ All action types and custom actions
- ✅ Dependency tracking and circular detection
- ✅ Field state management and caching
- ✅ Rule validation and priority handling
- ✅ Lookup table operations and custom logic
- ✅ Module integration and orchestration
- ✅ Error handling and edge cases

This structure ensures that both individual modules and their integration are thoroughly tested.
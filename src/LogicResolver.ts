/**
 * @fileoverview LogicResolver - resolving logic written in a AST-like JSON format.
 * A logic operation consists of two parts: **operator** and **operand**.
 * The operator defines which kind of operation is used, while the operand defines the arguments for that operation.
 * For example:
 * ```json
 * {
 *  "operator": "<",
 *  "operand": [3, 10]
 * }
 * ```
 *
 * For convenience, we ignore the key "operator" and "operand" since they are same as a key-value pair.
 * So, the rule above can be re-written as:
 * ```json
 * {"<": [3, 10]}
 * ```
 *
 * Much simpler, isn't it?
 * In real cases, a logic is usually dependent on some context value, this value can be reference like this:
 * ```json
 * {
 *   "<":[
 *      {"var": "user_input_field"},
 *      10
 *  ]
 * }
 * ```
 *
 * As you may observe, logic can be nested infinitely in the "operand" and they will be resolved recursively
 * starting from deepest node. In this case, the resolver first read the value of reference, and then compare
 * it with the number 10.
 * The "var" operator uses a path based approach with dot(.) as separator.
 * This means, you can access the prop of an object as it is in JavaScript:
 * ```json
 * {"var": "form_object.field_a"}
 * ```
 *
 * As you may have guessed it, array element can be accessed via index:
 * ```json
 * {"var": "array_input.1"}
 * ```
 *
 * Since it is common to have some operations on an array, this resolver also support following syntax:
 * ```json
 * {
 *   "some": [
 *     {"var": "array_or_array_ref"},
 *     {">": [{"var": "$"}, 10]}
 *   ]
 * }
 * ```
 *
 * Here the operator "some" is one kind of array operations. Its first operand MUST be an array or a reference to an array.
 * Its second operand is the operation on each element, where you can use the pattern `{"var": "$"}` to refer to the iterated element
 * in this array.
 * You may also refer to properties of the array element using paths like: {"var": "$.field.subfield.0"}, where $ acts as the base for the current iterated item.
 * Other supported array operations include: "every" and "map".
 *
 * Conditions can be defined using "if" operator, where the first operand is the condition, and the other two are the corresponding outcomes,
 * for example, if you want to express the logic "if user_weight > 60 then 'truthy result', else 'falsy result'", it can be written as:
 * ```
 * {
 *  "if": [
 *     {">": [{"var": "user_weight"}, 60]},
 *     "truthy result",
 *     "falsy result"
 *  ]
 * }
 * ```
 *
 * The resolver has built-in operations include the following:
 * - arithmetic operations: "+", "-", "*", "/"
 * - JS built-in math operations: "sqrt", "floor", "abs", ...etc.
 * - comparisons: ">", "<", "<=", ">=", "==", "!=", ...etc, equality are compared strictly!
 * - array operations: "some", "every", "map"
 * - conditional operations: "if", "and", "or"
 *
 * You can also register custom logic via:
 * ```ts
 * function custom_function_reference(args: unknown[], context: EvaluationContext) {}
 * const customLogic = [
 *  {
 *    "operator": "my_custom_operator",
 *    "operand": custom_function_reference
 *  }
 * ]
 * const resolver = new LogicResolver()
 *
 * resolver.registerCustomLogic(customLogic)
 *
 * const contextValue = {
 *  field_a: "val_a",
 *  field_b: "val_b",
 *  // ...
 * }
 * resolver.resolve(condition, contextValue)
 * ```
 */

type EvaluationContext = Record<string, unknown>;
type PrimitiveValue = string | number | boolean | null | undefined | symbol | bigint;
export type Logic = { [operator: string]: Logic | Logic[] } | Logic[] | PrimitiveValue;

export interface CustomLogicRegistration {
  operator: string;
  operand: (args: unknown[], context: EvaluationContext) => unknown;
}

export interface DebugTrace {
  operator: string;
  operands: unknown[];
  result: unknown;
  children?: DebugTrace[];
}

export class LogicResolver {
  private customLogic: Map<string, (args: unknown[], context: EvaluationContext) => unknown> =
    new Map();

  registerCustomLogic(customLogic: CustomLogicRegistration[]): void {
    for (const { operator, operand } of customLogic) {
      this.customLogic.set(operator, operand);
    }
  }

  resolve(logic: Logic, context: EvaluationContext): unknown {
    return this.evaluateLogic(logic, context);
  }

  debugEvaluate(logic: Logic, context: EvaluationContext): { result: unknown; trace: DebugTrace } {
    const trace: DebugTrace = { operator: 'root', operands: [], result: null };
    const result = this.evaluateLogic(logic, context, trace);

    // If the trace was overwritten by the actual operation, wrap it in the root
    if (trace.operator !== 'root') {
      const rootTrace: DebugTrace = {
        operator: 'root',
        operands: [logic],
        result: result,
        children: [trace],
      };
      return { result, trace: rootTrace };
    }

    trace.result = result;
    return { result, trace };
  }

  private evaluateLogic(
    logic: Logic,
    context: EvaluationContext,
    trace?: DebugTrace
  ): PrimitiveValue | PrimitiveValue[] {
    if (logic === null || logic === undefined) {
      return logic;
    }

    if (typeof logic !== 'object') {
      return logic;
    }

    if (Array.isArray(logic)) {
      return logic.map((item) => this.evaluateLogic(item, context)) as PrimitiveValue[];
    }

    const entries = Object.entries(logic);
    if (entries.length !== 1) {
      throw new Error('Logic object must have exactly one operator');
    }

    const [operator, operands] = entries[0] as [string, Logic];

    // Handle array operations specially before general evaluation
    if (operator === 'some' || operator === 'every' || operator === 'map') {
      const operandArray = Array.isArray(operands) ? operands : [operands];
      const arrayOperand = operandArray[0];
      const condition = operandArray[1];

      // Evaluate only the array part
      const evaluatedArray = this.evaluateLogic(arrayOperand, context);

      if (trace) {
        trace.operator = operator;
        trace.operands = [evaluatedArray, condition];
      }

      if (!Array.isArray(evaluatedArray)) {
        // Return appropriate default for non-array input
        if (operator === 'some') {
          return false;
        }
        if (operator === 'every') {
          return true;
        }
        if (operator === 'map') {
          return [];
        }
      }

      if (!condition) {
        // Return appropriate default when no condition provided
        if (operator === 'some') {
          return false;
        }
        if (operator === 'every') {
          return true;
        }
        if (operator === 'map') {
          return [];
        }
      }

      // At this point, evaluatedArray is definitely an array and condition exists
      const arrayToProcess = evaluatedArray as unknown[];

      // Handle the iteration logic here in evaluateLogic
      switch (operator) {
        case 'some':
          return arrayToProcess.some((item: unknown) =>
            this.evaluateLogic(condition, { ...context, $: item })
          );
        case 'every':
          return arrayToProcess.every((item: unknown) =>
            this.evaluateLogic(condition, { ...context, $: item })
          );
        case 'map':
          return arrayToProcess.map((item: unknown) =>
            this.evaluateLogic(condition, { ...context, $: item })
          ) as PrimitiveValue[];
      }
    }

    // Normal evaluation for all other operators
    const resolvedOperands = Array.isArray(operands)
      ? operands.map((op) => this.evaluateLogic(op, context))
      : [this.evaluateLogic(operands, context)];

    if (trace) {
      trace.operator = operator;
      trace.operands = resolvedOperands;
    }

    return this.executeOperation(operator, resolvedOperands, context);
  }

  private executeOperation(
    operator: string,
    operands: unknown[],
    context: EvaluationContext
  ): PrimitiveValue | PrimitiveValue[] {
    if (this.customLogic.has(operator)) {
      return this.customLogic.get(operator)!(operands, context) as PrimitiveValue;
    }

    switch (operator) {
      // Variable access
      case 'var':
        return this.getVariable(operands[0] as string, context);

      // Arithmetic operations
      case '+':
        // Handle string concatenation vs numeric addition
        if (operands.length === 0) {
          return 0;
        }
        if (!operands.every((op) => typeof op === 'number')) {
          throw new TypeError('Add operation requires all operands to be numbers');
        }
        return operands.reduce((acc, val) => acc + val, 0);
      case '-':
        if (!operands.every((op) => typeof op === 'number')) {
          throw new TypeError('Subtraction operation requires all operands to be numbers');
        }
        return operands.length === 1 ? -operands[0] : operands[0] - operands[1];
      case '*':
        if (!operands.every((op) => typeof op === 'number')) {
          throw new TypeError('Multiplication operation requires all operands to be numbers');
        }
        return operands.reduce((acc, val) => acc * val, 1);
      case '/':
        if (!operands.every((op) => typeof op === 'number')) {
          throw new TypeError('Division operation requires all operands to be numbers');
        }
        return operands[0] / operands[1];

      // Math operations
      case 'sqrt':
        if (typeof operands[0] !== 'number') {
          throw new TypeError('sqrt operation requires a number');
        }
        return Math.sqrt(operands[0]);
      case 'floor':
        if (typeof operands[0] !== 'number') {
          throw new TypeError('floor operation requires a number');
        }
        return Math.floor(operands[0]);
      case 'abs':
        if (typeof operands[0] !== 'number') {
          throw new TypeError('abs operation requires a number');
        }
        return Math.abs(operands[0]);

      // Comparison operations
      case '>':
        return (operands[0] as string | number) > (operands[1] as string | number);
      case '<':
        return (operands[0] as string | number) < (operands[1] as string | number);
      case '>=':
        return (operands[0] as string | number) >= (operands[1] as string | number);
      case '<=':
        return (operands[0] as string | number) <= (operands[1] as string | number);
      case '==':
        return operands[0] === operands[1];
      case '!=':
        return operands[0] !== operands[1];

      // Logical operations
      case 'and':
        return operands.every(Boolean);
      case 'or':
        return operands.some(Boolean);
      case 'not':
        return !operands[0];

      // Conditional operations
      case 'if':
        return operands[0]
          ? (operands[1] as PrimitiveValue | PrimitiveValue[])
          : (operands[2] as PrimitiveValue | PrimitiveValue[]);

      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  private getVariable(path: string, context: EvaluationContext): PrimitiveValue {
    if (path === '$') {
      return context['$'] as PrimitiveValue;
    }

    const keys = path.split('.');
    let value: PrimitiveValue | EvaluationContext = context;

    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      if (typeof value === 'object') {
        value = value[key] as PrimitiveValue | EvaluationContext;
      }
    }

    return value as PrimitiveValue;
  }
}

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
 * function custom_function_reference(args: any[], context: any) {}
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

export type Logic =
  | { [operator: string]: any[] | any }
  | string
  | number
  | boolean
  | null
  | undefined
  | Logic[];

export interface CustomLogicRegistration {
  operator: string;
  operand: (args: any[], context: any) => any;
}

export interface DebugTrace {
  operator: string;
  operands: any[];
  result: any;
  children?: DebugTrace[];
}

export class LogicResolver {
  private customLogic: Map<string, (args: any[], context: any) => any> = new Map();

  registerCustomLogic(customLogic: CustomLogicRegistration[]): void {
    for (const { operator, operand } of customLogic) {
      this.customLogic.set(operator, operand);
    }
  }

  resolve(logic: Logic, context: any): any {
    return this.evaluateLogic(logic, context);
  }

  debugEvaluate(logic: Logic, context: any): { result: any; trace: DebugTrace } {
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

  private evaluateLogic(logic: Logic, context: any, trace?: DebugTrace): any {
    if (logic === null || logic === undefined) {
      return logic;
    }

    if (typeof logic !== 'object') {
      return logic;
    }

    if (Array.isArray(logic)) {
      return logic.map((item) => this.evaluateLogic(item, context));
    }

    const entries = Object.entries(logic);
    if (entries.length !== 1) {
      throw new Error('Logic object must have exactly one operator');
    }

    const [operator, operands] = entries[0];
    const resolvedOperands = Array.isArray(operands)
      ? operands.map((op) => this.evaluateLogic(op, context))
      : [this.evaluateLogic(operands, context)];

    if (trace) {
      trace.operator = operator;
      trace.operands = resolvedOperands;
    }

    return this.executeOperation(operator, resolvedOperands, context, operands);
  }

  private executeOperation(
    operator: string,
    operands: any[],
    context: any,
    originalOperands?: any
  ): any {
    if (this.customLogic.has(operator)) {
      return this.customLogic.get(operator)!(operands, context);
    }

    switch (operator) {
      // Variable access
      case 'var':
        return this.getVariable(operands[0], context);

      // Arithmetic operations
      case '+':
        // Handle string concatenation vs numeric addition
        if (operands.length === 0) {
          return 0;
        }
        if (operands.some((op) => typeof op === 'string')) {
          return operands.reduce((acc, val) => String(acc) + String(val), '');
        }
        return operands.reduce((acc, val) => acc + val, 0);
      case '-':
        return operands.length === 1 ? -operands[0] : operands[0] - operands[1];
      case '*':
        return operands.reduce((acc, val) => acc * val, 1);
      case '/':
        return operands[0] / operands[1];

      // Math operations
      case 'sqrt':
        return Math.sqrt(operands[0]);
      case 'floor':
        return Math.floor(operands[0]);
      case 'abs':
        return Math.abs(operands[0]);

      // Comparison operations
      case '>':
        return operands[0] > operands[1];
      case '<':
        return operands[0] < operands[1];
      case '>=':
        return operands[0] >= operands[1];
      case '<=':
        return operands[0] <= operands[1];
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
        return operands[0] ? operands[1] : operands[2];

      // Array operations
      case 'some':
        const someArray = operands[0];
        const someCondition =
          originalOperands && originalOperands.length > 1 ? originalOperands[1] : null;
        if (!someCondition || !Array.isArray(someArray)) {
          return false;
        }
        return someArray.some((item: any) =>
          this.evaluateLogic(someCondition, { ...context, $: item })
        );
      case 'every':
        const everyArray = operands[0];
        const everyCondition =
          originalOperands && originalOperands.length > 1 ? originalOperands[1] : null;
        if (!everyCondition || !Array.isArray(everyArray)) {
          return true;
        }
        return everyArray.every((item: any) =>
          this.evaluateLogic(everyCondition, { ...context, $: item })
        );
      case 'map':
        const mapArray = operands[0];
        const mapExpression =
          originalOperands && originalOperands.length > 1 ? originalOperands[1] : null;
        if (!mapExpression || !Array.isArray(mapArray)) {
          return [];
        }
        return mapArray.map((item: any) =>
          this.evaluateLogic(mapExpression, { ...context, $: item })
        );

      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  private getVariable(path: string, context: any): any {
    if (path === '$') {
      return context['$'];
    }

    const keys = path.split('.');
    let value = context;

    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }
}

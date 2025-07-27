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
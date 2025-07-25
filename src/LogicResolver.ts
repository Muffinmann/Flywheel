/**
 * @fileoverview LogicResolver - resolving logic written in a AST-like JSON format.
 * A logic operation consists of two pars: operator and operand.
 * The operator defines which kind of operation is used while the operand defines the arguments of that operation.
 * For example:
 * ```json
 * {
 *  "operator": "<",
 *  "operand": [3, 10]
 * }
 * ```
 * For convenience, we ignore the key "operator" and "operand" since they are same as a key-value pair.
 * So, the rule above can be re-written as:
 * ```json
 * {"<": [3, 10]}
 * ```
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
 * As you may observe, logic can be nested infinitely in the "operand" and they will be resolved recursively
 * starting from deepest node. In this case, the resolver first read the value of reference, and then compare
 * it with the number 10.
 * The "var" operator uses a path based approach with dot(.) as separator.
 * This means, you can access the prop of an object as it is in JavaScript:
 * ```json
 * {"var": "form_object.field_a"}
 * ```
 * As you may have guessed it, array element can be accessed via index:
 * ```json
 * {"var": "array_input.1"}
 * ```
 * Since it is common to have some operations on an array, this resolver also support following syntax:
 * 
 * ```json
 * {
 *   "some": [
 *     {"var": "array_or_array_ref"},
 *     {">": [{"var": "$"}, 10]}
 *   ]
 * }
 * ```
 * Here the operator "some" is one kind of array operations. Its first operand MUST be an array or a reference to an array.
 * Its second operand is the operation on each element, where you can use the pattern `{"var": "$"}` to refer to the element
 * in this array.
 * Other supported array operation includes: "every" and "map".
 */
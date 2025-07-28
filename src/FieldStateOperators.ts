/**
 * Custom operators for field state access
 */

export function fieldStateOperator(args: any[], context: any): any {
  const path = args[0];
  
  if (typeof path !== 'string') {
    throw new Error('fieldState operator requires a string path');
  }

  const keys = path.split('.');
  if (keys.length < 2) {
    throw new Error('fieldState operator requires format: fieldName.property');
  }

  const fieldName = keys[0];
  const propertyPath = keys.slice(1).join('.');
  
  // Look for field state in context under fieldStates
  const fieldStates = context.fieldStates;
  if (!fieldStates || !fieldStates[fieldName]) {
    return undefined;
  }

  let value = fieldStates[fieldName];
  const propertyKeys = propertyPath.split('.');

  for (const key of propertyKeys) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[key];
  }

  return value;
}
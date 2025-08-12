import type { LogicResolver, Logic } from './LogicResolver.js';

export type TableRecord = Record<string, unknown>;

export interface LookupTable<T extends TableRecord = TableRecord> {
  table: T[];
  primaryKey: string;
}

export interface TableConfig<T extends TableRecord = TableRecord> {
  table: T[];
  primaryKey: string;
  name?: string;
}

export class LookupManager {
  private lookupTables: Map<string, LookupTable> = new Map();

  private logicResolver: LogicResolver;

  constructor(logicResolver: LogicResolver) {
    this.logicResolver = logicResolver;
    this.setupCustomLogic();
  }

  private isString(value: unknown): value is string {
    return typeof value === 'string';
  }

  private isTableRecord(value: unknown): value is TableRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private validateTableConfig(config: TableConfig): void {
    if (!Array.isArray(config.table)) {
      throw new Error('Table must be an array');
    }

    if (!this.isString(config.primaryKey)) {
      throw new Error('Primary key must be a string');
    }

    // Validate that all records have the primary key
    for (let i = 0; i < config.table.length; i++) {
      const record = config.table[i];
      if (!this.isTableRecord(record)) {
        throw new Error(`Table record at index ${i} must be an object`);
      }
      if (!(config.primaryKey in record)) {
        throw new Error(`Table record at index ${i} is missing primary key '${config.primaryKey}'`);
      }
    }
  }

  registerLookupTables(tables: TableConfig[]): void {
    for (const tableConfig of tables) {
      this.validateTableConfig(tableConfig);

      // Use explicit name if provided, otherwise derive from table structure
      const tableName = tableConfig.name ?? `${tableConfig.primaryKey}_table`;
      const lookupTable: LookupTable = {
        table: tableConfig.table,
        primaryKey: tableConfig.primaryKey,
      };
      this.lookupTables.set(tableName, lookupTable);
    }
  }

  getLookupTable(tableName: string): LookupTable | undefined {
    return this.lookupTables.get(tableName);
  }

  private setupCustomLogic(): void {
    this.logicResolver.registerCustomLogic([
      {
        operator: 'varTable',
        operand: (args, context) => {
          // The varTable operator supports two syntax forms:
          // 1. Simple: "fieldName" - resolves to context.fieldName.value
          // 2. Lookup: "fieldName@tableName.property" - uses fieldName.value as key to lookup property from tableName

          // Validate input arguments - expect array with at least one string argument
          if (!Array.isArray(args) || args.length === 0) {
            return undefined;
          }

          const path = args[0];
          if (!this.isString(path)) {
            return undefined;
          }

          // Check if this is a lookup operation (contains @ symbol)
          if (path.includes('@')) {
            // Parse lookup syntax: "fieldPath@tableName.property"
            // Example: "selectedProduct@products.price" means:
            // - Get value from context.selectedProduct.value
            // - Use that value to find record in 'products' table
            // - Return the 'price' property from that record

            const [fieldPath, lookupSpec] = path.split('@');
            if (!fieldPath || !lookupSpec) {
              return undefined; // Invalid format - missing field path or lookup specification
            }

            // Parse the lookup specification: "tableName.property"
            const lookupParts = lookupSpec.split('.');
            if (lookupParts.length < 2) {
              return undefined; // Invalid format - need both table name and property
            }

            const [tableName, property] = lookupParts;
            if (!this.isString(tableName) || !this.isString(property)) {
              return undefined; // Both table name and property must be strings
            }

            // Get the key value from the context using the field path
            // This resolves something like context.selectedProduct.value
            const keyValue = this.logicResolver.resolve({ var: `${fieldPath}.value` }, context);

            // Find the lookup table
            const table = this.lookupTables.get(tableName);
            if (!table) {
              throw new Error(`Lookup table '${tableName}' not found`);
            }

            // Find the record in the table where primaryKey matches keyValue
            const record = table.table.find(
              (item) => this.isTableRecord(item) && item[table.primaryKey] === keyValue
            );

            // Return the requested property from the found record, or undefined if not found
            return record && this.isTableRecord(record) ? record[property] : undefined;
          }

          // Simple case: no lookup, just resolve as regular variable with .value suffix
          // This converts "fieldName" to context.fieldName.value
          return this.logicResolver.resolve({ var: `${path}.value` }, context);
        },
      },
      {
        operator: 'lookup',
        operand: (args, context) => {
          // The lookup operator performs table lookups with dynamic key resolution
          // Usage: { lookup: [tableName, keyLogic, propertyName] }
          // Example: { lookup: ["users", { var: "selectedUserId" }, "name"] }
          // This finds the user record where primaryKey matches selectedUserId, then returns the name property

          // Validate input - requires exactly 3 arguments: [tableName, keyLogic, property]
          if (!Array.isArray(args) || args.length < 3) {
            return undefined; // Invalid arguments - need table name, key logic, and property name
          }

          const [tableName, keyLogic, property] = args;

          // Validate that tableName and property are strings
          if (!this.isString(tableName) || !this.isString(property)) {
            return undefined; // Table name and property must be strings
          }

          // Find the requested lookup table
          const table = this.lookupTables.get(tableName);
          if (!table) {
            throw new Error(`Lookup table '${tableName}' not found`);
          }

          // Validate that keyLogic is a valid Logic expression before resolving
          if (keyLogic === null || keyLogic === undefined) {
            return undefined; // Invalid key logic
          }

          // Resolve the key logic to get the actual key value
          // keyLogic can be any valid Logic expression like { var: "field" }, literal values, or complex expressions
          const keyValue = this.logicResolver.resolve(keyLogic as Logic, context);

          // Find the record in the table where the primary key matches the resolved key value
          const record = table.table.find(
            (item) => this.isTableRecord(item) && item[table.primaryKey] === keyValue
          );

          // Return the requested property from the found record, or undefined if record not found
          return record && this.isTableRecord(record) ? record[property] : undefined;
        },
      },
    ]);
  }

  clearTables(): void {
    this.lookupTables.clear();
  }

  getAllTables(): Map<string, LookupTable> {
    return new Map(this.lookupTables);
  }
}

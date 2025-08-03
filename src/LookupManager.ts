import type { LogicResolver } from './LogicResolver.js';

export interface LookupTable {
  table: any[];
  primaryKey: string;
}

export class LookupManager {
  private lookupTables: Map<string, LookupTable> = new Map();

  private logicResolver: LogicResolver;

  constructor(logicResolver: LogicResolver) {
    this.logicResolver = logicResolver;
    this.setupCustomLogic();
  }

  registerLookupTables(tables: { table: any[]; primaryKey: string; name?: string }[]): void {
    for (const tableConfig of tables) {
      // Use explicit name if provided, otherwise derive from table structure
      const tableName = tableConfig.name || `${tableConfig.primaryKey}_table`;
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
          const path = args[0];
          if (typeof path !== 'string') {
            return undefined;
          }

          if (path.includes('@')) {
            const [fieldPath, lookupSpec] = path.split('@');
            const [tableName, property] = lookupSpec.split('.');
            const keyValue = this.logicResolver.resolve({ var: `${fieldPath}.value` }, context);

            const table = this.lookupTables.get(tableName);
            if (!table) {
              throw new Error(`Lookup table '${tableName}' not found`);
            }

            const record = table.table.find((item) => item[table.primaryKey] === keyValue);
            return record ? record[property] : undefined;
          }

          return this.logicResolver.resolve({ var: `${path}.value` }, context);
        },
      },
      {
        operator: 'lookup',
        operand: (args, context) => {
          if (!Array.isArray(args) || args.length < 3) {
            return undefined;
          }

          const [tableName, keyLogic, property] = args;

          if (typeof tableName !== 'string' || typeof property !== 'string') {
            return undefined;
          }

          const table = this.lookupTables.get(tableName);
          if (!table) {
            throw new Error(`Lookup table '${tableName}' not found`);
          }

          const keyValue = this.logicResolver.resolve(keyLogic, context);
          const record = table.table.find((item) => item[table.primaryKey] === keyValue);

          return record ? record[property] : undefined;
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

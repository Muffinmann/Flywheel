import { LookupManager, LookupTable } from '../LookupManager.js';
import { LogicResolver } from '../LogicResolver.js';

describe('LookupManager', () => {
  let lookupManager: LookupManager;
  let logicResolver: LogicResolver;

  beforeEach(() => {
    logicResolver = new LogicResolver();
    lookupManager = new LookupManager(logicResolver);
  });

  describe('Lookup Table Registration', () => {
    test('should register lookup tables with explicit names', () => {
      const tableConfig = {
        table: [
          { id: 'prod1', name: 'Product 1', price: 100 },
          { id: 'prod2', name: 'Product 2', price: 200 },
        ],
        primaryKey: 'id',
        name: 'products',
      };

      lookupManager.registerLookupTables([tableConfig]);

      const retrievedTable = lookupManager.getLookupTable('products');
      expect(retrievedTable).toBeDefined();
      expect(retrievedTable?.table).toEqual(tableConfig.table);
      expect(retrievedTable?.primaryKey).toBe('id');
    });

    test('should register lookup tables with auto-generated names', () => {
      const tableConfig = {
        table: [
          { userId: 'user1', role: 'admin' },
          { userId: 'user2', role: 'editor' },
        ],
        primaryKey: 'userId',
      };

      lookupManager.registerLookupTables([tableConfig]);

      const retrievedTable = lookupManager.getLookupTable('userId_table');
      expect(retrievedTable).toBeDefined();
      expect(retrievedTable?.table).toEqual(tableConfig.table);
      expect(retrievedTable?.primaryKey).toBe('userId');
    });

    test('should register multiple lookup tables', () => {
      const tableConfigs = [
        {
          table: [{ id: 'p1', name: 'Product 1' }],
          primaryKey: 'id',
          name: 'products',
        },
        {
          table: [{ code: 'cat1', description: 'Category 1' }],
          primaryKey: 'code',
          name: 'categories',
        },
      ];

      lookupManager.registerLookupTables(tableConfigs);

      expect(lookupManager.getLookupTable('products')).toBeDefined();
      expect(lookupManager.getLookupTable('categories')).toBeDefined();
    });

    test('should return undefined for non-existent tables', () => {
      const result = lookupManager.getLookupTable('non_existent_table');
      expect(result).toBeUndefined();
    });
  });

  describe('varTable Custom Logic', () => {
    beforeEach(() => {
      const tableConfig = {
        table: [
          { id: 'prod1', name: 'Product 1', price: 100, category: 'electronics' },
          { id: 'prod2', name: 'Product 2', price: 200, category: 'clothing' },
        ],
        primaryKey: 'id',
        name: 'products',
      };
      lookupManager.registerLookupTables([tableConfig]);
    });

    test('should resolve varTable syntax with lookup', () => {
      const context = { selectedProduct: { value: 'prod1' } };

      const result = logicResolver.resolve(
        { varTable: ['selectedProduct@products.price'] },
        context
      );

      expect(result).toBe(100);
    });

    test('should resolve varTable syntax for different properties', () => {
      const context = { selectedProduct: { value: 'prod2' } };

      const nameResult = logicResolver.resolve(
        { varTable: ['selectedProduct@products.name'] },
        context
      );
      const categoryResult = logicResolver.resolve(
        { varTable: ['selectedProduct@products.category'] },
        context
      );

      expect(nameResult).toBe('Product 2');
      expect(categoryResult).toBe('clothing');
    });

    test('should return undefined for non-existent records', () => {
      const context = { selectedProduct: { value: 'non_existent' } };

      const result = logicResolver.resolve(
        { varTable: ['selectedProduct@products.price'] },
        context
      );

      expect(result).toBeUndefined();
    });

    test('should return undefined for non-existent properties', () => {
      const context = { selectedProduct: { value: 'prod1' } };

      const result = logicResolver.resolve(
        { varTable: ['selectedProduct@products.nonExistentProperty'] },
        context
      );

      expect(result).toBeUndefined();
    });

    test('should throw error for non-existent table', () => {
      const context = { selectedProduct: { value: 'prod1' } };

      expect(() => {
        logicResolver.resolve({ varTable: ['selectedProduct@missing_table.price'] }, context);
      }).toThrow("Lookup table 'missing_table' not found");
    });

    test('should handle varTable syntax without @ (fallback to regular var)', () => {
      const context = { simpleField: { value: 'simple_value' } };

      const result = logicResolver.resolve({ varTable: ['simpleField'] }, context);

      expect(result).toBe('simple_value');
    });

    test('should handle invalid varTable path format', () => {
      const context = { field: { value: 'value' } };

      const result = logicResolver.resolve(
        { varTable: [123] }, // Invalid path type
        context
      );

      expect(result).toBeUndefined();
    });
  });

  describe('lookup Custom Logic', () => {
    beforeEach(() => {
      const tableConfig = {
        table: [
          { id: 'prod1', name: 'Product 1', price: 100, specs: { weight: '1kg', color: 'red' } },
          { id: 'prod2', name: 'Product 2', price: 200, specs: { weight: '2kg', color: 'blue' } },
        ],
        primaryKey: 'id',
        name: 'products',
      };
      lookupManager.registerLookupTables([tableConfig]);
    });

    test('should resolve basic lookup operations', () => {
      const context = { selectedId: { value: 'prod1' } };

      const result = logicResolver.resolve(
        { lookup: ['products', { var: ['selectedId.value'] }, 'price'] },
        context
      );

      expect(result).toBe(100);
    });

    test('should resolve lookup with complex key logic', () => {
      const context = { selectedKey: { value: 'prod2' } };

      const result = logicResolver.resolve(
        { lookup: ['products', { var: ['selectedKey.value'] }, 'name'] },
        context
      );

      expect(result).toBe('Product 2');
    });

    test('should resolve lookup for nested properties', () => {
      const context = { selectedId: { value: 'prod1' } };

      const result = logicResolver.resolve(
        { lookup: ['products', { var: ['selectedId.value'] }, 'specs'] },
        context
      );

      expect(result).toEqual({ weight: '1kg', color: 'red' });
    });

    test('should return undefined for non-existent records in lookup', () => {
      const context = { selectedId: { value: 'non_existent' } };

      const result = logicResolver.resolve(
        { lookup: ['products', { var: ['selectedId.value'] }, 'price'] },
        context
      );

      expect(result).toBeUndefined();
    });

    test('should return undefined for non-existent properties in lookup', () => {
      const context = { selectedId: { value: 'prod1' } };

      const result = logicResolver.resolve(
        { lookup: ['products', { var: ['selectedId.value'] }, 'nonExistentProperty'] },
        context
      );

      expect(result).toBeUndefined();
    });

    test('should throw error for non-existent table in lookup', () => {
      const context = { selectedId: { value: 'prod1' } };

      expect(() => {
        logicResolver.resolve(
          { lookup: ['missing_table', { var: ['selectedId.value'] }, 'price'] },
          context
        );
      }).toThrow("Lookup table 'missing_table' not found");
    });

    test('should handle invalid lookup arguments', () => {
      const context = {};

      // Missing arguments
      let result = logicResolver.resolve({ lookup: ['products'] }, context);
      expect(result).toBeUndefined();

      // Invalid table name type
      result = logicResolver.resolve({ lookup: [123, { var: ['id.value'] }, 'property'] }, context);
      expect(result).toBeUndefined();

      // Invalid property type
      result = logicResolver.resolve({ lookup: ['products', { var: ['id.value'] }, 123] }, context);
      expect(result).toBeUndefined();
    });
  });

  describe('Advanced Lookup Scenarios', () => {
    beforeEach(() => {
      lookupManager.registerLookupTables([
        {
          table: [
            { id: 'user1', name: 'John', departmentId: 'dept1' },
            { id: 'user2', name: 'Jane', departmentId: 'dept2' },
          ],
          primaryKey: 'id',
          name: 'users',
        },
        {
          table: [
            { id: 'dept1', name: 'Engineering', budget: 100000 },
            { id: 'dept2', name: 'Marketing', budget: 50000 },
          ],
          primaryKey: 'id',
          name: 'departments',
        },
      ]);
    });

    test('should handle chained lookups', () => {
      const context = { currentUser: { value: 'user1' } };

      // First lookup: get user's department ID
      const departmentId = logicResolver.resolve(
        { lookup: ['users', { var: ['currentUser.value'] }, 'departmentId'] },
        context
      );

      // Second lookup: get department budget
      const departmentBudget = logicResolver.resolve(
        { lookup: ['departments', departmentId, 'budget'] },
        context
      );

      expect(departmentId).toBe('dept1');
      expect(departmentBudget).toBe(100000);
    });

    test('should work in complex logical expressions', () => {
      const context = { currentUser: { value: 'user2' } };

      const result = logicResolver.resolve(
        {
          '>': [
            {
              lookup: [
                'departments',
                { lookup: ['users', { var: ['currentUser.value'] }, 'departmentId'] },
                'budget',
              ],
            },
            75000,
          ],
        },
        context
      );

      expect(result).toBe(false); // Marketing budget (50000) is not > 75000
    });

    test('should handle lookup in conditional logic', () => {
      const context = { currentUser: { value: 'user1' } };

      const result = logicResolver.resolve(
        {
          if: [
            {
              '==': [
                { lookup: ['users', { var: ['currentUser.value'] }, 'departmentId'] },
                'dept1',
              ],
            },
            'Engineering User',
            'Other User',
          ],
        },
        context
      );

      expect(result).toBe('Engineering User');
    });
  });

  describe('Utility Methods', () => {
    test('should clear all lookup tables', () => {
      const tableConfig = {
        table: [{ id: 'test', name: 'Test' }],
        primaryKey: 'id',
        name: 'test_table',
      };

      lookupManager.registerLookupTables([tableConfig]);
      expect(lookupManager.getLookupTable('test_table')).toBeDefined();

      lookupManager.clearTables();
      expect(lookupManager.getLookupTable('test_table')).toBeUndefined();
    });

    test('should get all lookup tables', () => {
      const tableConfigs = [
        {
          table: [{ id: 'p1', name: 'Product 1' }],
          primaryKey: 'id',
          name: 'products',
        },
        {
          table: [{ code: 'cat1', description: 'Category 1' }],
          primaryKey: 'code',
          name: 'categories',
        },
      ];

      lookupManager.registerLookupTables(tableConfigs);

      const allTables = lookupManager.getAllTables();
      expect(allTables.size).toBe(2);
      expect(allTables.has('products')).toBe(true);
      expect(allTables.has('categories')).toBe(true);
    });

    test('should return empty map when no tables are registered', () => {
      const allTables = lookupManager.getAllTables();
      expect(allTables.size).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty table data', () => {
      const tableConfig = {
        table: [],
        primaryKey: 'id',
        name: 'empty_table',
      };

      lookupManager.registerLookupTables([tableConfig]);

      const context = { key: { value: 'any_key' } };
      const result = logicResolver.resolve(
        { lookup: ['empty_table', { var: ['key.value'] }, 'property'] },
        context
      );

      expect(result).toBeUndefined();
    });

    test('should handle null/undefined values in table data', () => {
      const tableConfig = {
        table: [
          { id: 'item1', value: null },
          { id: 'item2', value: undefined },
          { id: 'item3', value: 'valid' },
        ],
        primaryKey: 'id',
        name: 'nullable_table',
      };

      lookupManager.registerLookupTables([tableConfig]);

      const context1 = { key: { value: 'item1' } };
      const context2 = { key: { value: 'item2' } };
      const context3 = { key: { value: 'item3' } };

      const result1 = logicResolver.resolve(
        { lookup: ['nullable_table', { var: ['key.value'] }, 'value'] },
        context1
      );
      const result2 = logicResolver.resolve(
        { lookup: ['nullable_table', { var: ['key.value'] }, 'value'] },
        context2
      );
      const result3 = logicResolver.resolve(
        { lookup: ['nullable_table', { var: ['key.value'] }, 'value'] },
        context3
      );

      expect(result1).toBeNull();
      expect(result2).toBeUndefined();
      expect(result3).toBe('valid');
    });

    test('should handle duplicate primary keys (last one wins)', () => {
      const tableConfig = {
        table: [
          { id: 'dup', name: 'First' },
          { id: 'dup', name: 'Second' },
        ],
        primaryKey: 'id',
        name: 'duplicate_table',
      };

      lookupManager.registerLookupTables([tableConfig]);

      const context = { key: { value: 'dup' } };
      const result = logicResolver.resolve(
        { lookup: ['duplicate_table', { var: ['key.value'] }, 'name'] },
        context
      );

      // Array.find returns the first match
      expect(result).toBe('First');
    });

    test('should handle complex primary key values', () => {
      const tableConfig = {
        table: [
          { complexId: 'user:123:profile', data: 'user_data' },
          { complexId: 'admin:456:settings', data: 'admin_data' },
        ],
        primaryKey: 'complexId',
        name: 'complex_keys',
      };

      lookupManager.registerLookupTables([tableConfig]);

      const context = { lookupKey: { value: 'user:123:profile' } };
      const result = logicResolver.resolve(
        { lookup: ['complex_keys', { var: ['lookupKey.value'] }, 'data'] },
        context
      );

      expect(result).toBe('user_data');
    });
  });
});

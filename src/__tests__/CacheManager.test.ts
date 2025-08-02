import { CacheManager } from '../CacheManager';

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager();
  });

  test('should track field validity', () => {
    expect(cacheManager.isValid('field1')).toBe(false);
    
    cacheManager.markAsValid('field1');
    expect(cacheManager.isValid('field1')).toBe(true);
  });

  test('should invalidate fields', () => {
    cacheManager.markAsValid('field1');
    cacheManager.markAsValid('field2');
    cacheManager.markAsValid('field3');
    
    expect(cacheManager.isValid('field1')).toBe(true);
    expect(cacheManager.isValid('field2')).toBe(true);
    expect(cacheManager.isValid('field3')).toBe(true);
    
    cacheManager.invalidate(['field1', 'field3']);
    
    expect(cacheManager.isValid('field1')).toBe(false);
    expect(cacheManager.isValid('field2')).toBe(true);
    expect(cacheManager.isValid('field3')).toBe(false);
  });

  test('should clear all cached fields', () => {
    cacheManager.markAsValid('field1');
    cacheManager.markAsValid('field2');
    
    expect(cacheManager.getValidFieldCount()).toBe(2);
    
    cacheManager.clearAll();
    
    expect(cacheManager.getValidFieldCount()).toBe(0);
    expect(cacheManager.isValid('field1')).toBe(false);
    expect(cacheManager.isValid('field2')).toBe(false);
  });

  test('should handle marking same field as valid multiple times', () => {
    cacheManager.markAsValid('field1');
    cacheManager.markAsValid('field1');
    
    expect(cacheManager.getValidFieldCount()).toBe(1);
  });

  test('should handle invalidating non-existent fields gracefully', () => {
    cacheManager.markAsValid('field1');
    
    cacheManager.invalidate(['field1', 'field2', 'field3']);
    
    expect(cacheManager.isValid('field1')).toBe(false);
    expect(cacheManager.getValidFieldCount()).toBe(0);
  });
});
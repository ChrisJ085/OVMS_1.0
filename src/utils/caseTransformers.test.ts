import { describe, it, expect } from 'vitest';
import { getTableName } from './caseTransformers';
import { getFallbackTableName } from '../services/dbService';

describe('caseTransformers table mappings', () => {
  it('maps snp87 import collections to public.snp87_planning_imports', () => {
    expect(getTableName('snp87Imports')).toBe('snp87_planning_imports');
    expect(getTableName('snp87_imports')).toBe('snp87_planning_imports');
    expect(getTableName('snp87PlanningImports')).toBe('snp87_planning_imports');
    expect(getTableName('snp87_planning_imports')).toBe('snp87_planning_imports');
  });

  it('maps snp87 planning rows to public.snp87_planning_rows', () => {
    expect(getTableName('snp87PlanningRows')).toBe('snp87_planning_rows');
    expect(getTableName('snp87_planning_rows')).toBe('snp87_planning_rows');
    expect(getTableName('snp87Rows')).toBe('snp87_planning_rows');
    expect(getTableName('snp87_rows')).toBe('snp87_planning_rows');
  });

  it('provides seamless fallback table names for PGRST205 resilience', () => {
    expect(getFallbackTableName('snp87_planning_imports')).toBe('snp87_imports');
    expect(getFallbackTableName('snp87_imports')).toBe('snp87_planning_imports');
    expect(getFallbackTableName('snp87_planning_rows')).toBe('snp87_rows');
    expect(getFallbackTableName('snp87_rows')).toBe('snp87_planning_rows');
    expect(getFallbackTableName('products')).toBeNull();
  });
});

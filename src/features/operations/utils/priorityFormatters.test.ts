import { describe, it, expect } from 'vitest';
import { 
  isRawId, 
  getDestinationLabel, 
  getDestinationCodeLabel, 
  getActionTypeLabel, 
  getPriorityLevelLabel,
  formatQuantityInPallets,
  isManualInstruction
} from './priorityFormatters';
import { Destination, ActionType, PriorityLevel } from '../../../types/configuration';

describe('priorityFormatters', () => {
  describe('isRawId', () => {
    it('identifies standard alphanumeric generated IDs as raw IDs', () => {
      expect(isRawId('abcdefghijklmnop')).toBe(true);
      expect(isRawId('abc123xyz4567890abc')).toBe(true);
    });

    it('identifies UUIDs with dashes as raw IDs', () => {
      expect(isRawId('3C44B714-420F-4AC3-97AB-6166159D8A2D')).toBe(true);
      expect(isRawId('3c44b714-420f-4ac3-97ab-6166159d8a2d')).toBe(true);
    });

    it('identifies prefixed keys as raw IDs', () => {
      expect(isRawId('prio_12345')).toBe(true);
      expect(isRawId('dest_67890')).toBe(true);
    });

    it('does not identify plain text names or words as raw IDs', () => {
      expect(isRawId('CRITICAL')).toBe(false);
      expect(isRawId('URGENT')).toBe(false);
      expect(isRawId('NORMAL')).toBe(false);
      expect(isRawId('Release to Warehouse')).toBe(false);
    });
  });

  describe('getPriorityLevelLabel', () => {
    const mockPriorityLevels: PriorityLevel[] = [
      {
        id: 'prio-1',
        tenantId: 't1',
        code: 'CRITICAL',
        label: 'Critical Priority',
        numericWeight: 4,
        colourToken: 'red',
        sortOrder: 1,
        status: 'active',
        createdBy: 'u1',
        createdDate: {} as any,
        modifiedBy: 'u1',
        modifiedDate: {} as any
      },
      {
        id: '3C44B714-420F-4AC3-97AB-6166159D8A2D',
        tenantId: 't1',
        code: 'HIGH',
        label: 'High Priority',
        numericWeight: 3,
        colourToken: 'amber',
        sortOrder: 2,
        status: 'active',
        createdBy: 'u1',
        createdDate: {} as any,
        modifiedBy: 'u1',
        modifiedDate: {} as any
      }
    ];

    it('returns the label when matching ID is found', () => {
      const label = getPriorityLevelLabel('prio-1', mockPriorityLevels);
      expect(label).toBe('CRITICAL PRIORITY');
    });

    it('returns the label when matching UUID is found', () => {
      const label = getPriorityLevelLabel('3C44B714-420F-4AC3-97AB-6166159D8A2D', mockPriorityLevels);
      expect(label).toBe('HIGH PRIORITY');
    });

    it('uses NORMAL as fallback if ID is raw and not found in list', () => {
      const label = getPriorityLevelLabel('99999999-9999-9999-9999-999999999999', mockPriorityLevels);
      expect(label).toBe('NORMAL');
    });

    it('returns snapshot if snapshot is a clean label', () => {
      const label = getPriorityLevelLabel('some-id', mockPriorityLevels, 'URGENT');
      expect(label).toBe('URGENT');
    });

    it('ignores snapshot if snapshot is a raw ID/UUID and instead returns matching label or fallback', () => {
      const label = getPriorityLevelLabel('prio-1', mockPriorityLevels, '3C44B714-420F-4AC3-97AB-6166159D8A2D');
      expect(label).toBe('CRITICAL PRIORITY');
    });
  });
});

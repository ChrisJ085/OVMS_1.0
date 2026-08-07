import { Destination, ActionType, PriorityLevel } from '../../../types/configuration';

export const isRawId = (str: string | null | undefined): boolean => {
  if (!str) return false;
  return /^[a-zA-Z0-9]{16,30}$/.test(str.trim());
};

export const getDestinationLabel = (
  id: string | null | undefined, 
  destinations: Destination[],
  snapshot?: string
): string => {
  if (!id) return '-';
  if (snapshot && !isRawId(snapshot)) return snapshot;
  const match = destinations.find(d => d.id === id || d.destinationCode === id || d.destinationName === id);
  if (match) {
    return match.destinationName 
      ? `${match.destinationName} (${match.destinationCode})` 
      : match.destinationCode;
  }
  return isRawId(id) ? 'Destination' : id;
};

export const getActionTypeLabel = (
  id: string | null | undefined, 
  actionTypes: ActionType[],
  snapshot?: string
): string => {
  if (!id) return '-';
  if (snapshot && !isRawId(snapshot)) return snapshot;
  const match = actionTypes.find(a => a.id === id || a.code === id || a.label === id);
  if (match) {
    return match.label || match.code;
  }
  return isRawId(id) ? 'Release' : id.replace(/_/g, ' ');
};

export const getPriorityLevelLabel = (
  id: string | null | undefined, 
  priorityLevels: PriorityLevel[],
  snapshot?: string
): string => {
  if (!id) return 'NORMAL';
  if (snapshot && !isRawId(snapshot)) return snapshot.toUpperCase();
  const match = priorityLevels.find(l => l.id === id || l.code === id || l.label === id);
  if (match) {
    return (match.label || match.code || 'NORMAL').toUpperCase();
  }
  if (isRawId(id)) {
    return 'NORMAL';
  }
  return id.replace(/_/g, ' ').toUpperCase();
};

export const formatQuantityInPallets = (
  cases: number | null | undefined,
  casesPerPallet: number | null | undefined
): string => {
  if (cases === null || cases === undefined || cases <= 0) return '0 Pallets';
  const cpp = casesPerPallet && casesPerPallet > 0 ? casesPerPallet : 100;
  const rawPallets = cases / cpp;
  const floored = Math.floor(rawPallets);
  // Round down to nearest even number
  const evenPallets = Math.floor(floored / 2) * 2;
  return `${evenPallets} ${evenPallets === 1 ? 'Pallet' : 'Pallets'}`;
};

export const isManualInstruction = (instruction?: string | null): boolean => {
  if (!instruction) return false;
  const trimmed = instruction.trim();
  if (!trimmed) return false;
  if (trimmed === 'Instruction') return false;
  if (trimmed.includes('--- CURRENT FACTS ---')) return false;
  if (trimmed.toLowerCase().startsWith('auto-generated')) return false;
  if (trimmed.toLowerCase().startsWith('system recommendation')) return false;
  return true;
};


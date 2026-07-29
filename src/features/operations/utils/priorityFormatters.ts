import { Destination, ActionType, PriorityLevel } from '../../../types/configuration';

export const getDestinationLabel = (
  id: string | null | undefined, 
  destinations: Destination[],
  snapshot?: string
): string => {
  if (!id) return '-';
  if (snapshot) return snapshot;
  const match = destinations.find(d => d.id === id || d.destinationCode === id || d.destinationName === id);
  if (match) {
    return match.destinationName 
      ? `${match.destinationName} (${match.destinationCode})` 
      : match.destinationCode;
  }
  return id;
};

export const getActionTypeLabel = (
  id: string | null | undefined, 
  actionTypes: ActionType[],
  snapshot?: string
): string => {
  if (!id) return '-';
  if (snapshot) return snapshot;
  const match = actionTypes.find(a => a.id === id || a.code === id || a.label === id);
  if (match) {
    return match.label || match.code;
  }
  return id.replace(/_/g, ' ');
};

export const getPriorityLevelLabel = (
  id: string | null | undefined, 
  priorityLevels: PriorityLevel[],
  snapshot?: string
): string => {
  if (!id) return 'Normal';
  if (snapshot) return snapshot;
  const match = priorityLevels.find(l => l.id === id || l.code === id || l.label === id);
  if (match) {
    return match.label || match.code;
  }
  return id;
};

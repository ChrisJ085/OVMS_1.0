export function getCurrentRecommendationId(tenantId: string, siteId: string, productId: string): string {
  return `${tenantId}_${siteId}_${productId}`;
}

export function getEffectivePriorityId(tenantId: string, siteId: string, productId: string): string {
  return `prio_auto_${tenantId}_${siteId}_${productId}`;
}

export function getDisplayPriorityId(priorityId: string): string {
  return priorityId;
}

export function buildDisplayPriorityDoc(p: any, priorityId?: string): any {
  const docId = priorityId || p.id || '';
  const projection: any = {
    tenantId: p.tenantId || '',
    siteId: p.siteId || '',
    sourcePriorityId: docId,
    priorityCode: p.productCodeSnapshot || p.productId || '',
    productCodeSnapshot: p.productCodeSnapshot || '',
    descriptionSnapshot: p.descriptionSnapshot || '',
    title: p.title || p.productCodeSnapshot || p.productId || '',
    instruction: p.instruction || '',
    priorityStatus: p.priorityStatus || p.status || 'ACTIVE',
    priorityLevelId: p.priorityLevelId || 'NORMAL',
    actionTypeId: p.actionTypeId || 'RELEASE',
    requestedQuantity: p.quantity !== undefined ? p.quantity : (p.requestedQuantity || 0),
    progressQuantity: p.progressQuantity || 0,
    progressPercent: p.progressPercent || 0,
    destinationId: p.destinationId || null,
    createdDate: p.createdDate || p.createdAt || null,
    modifiedDate: p.modifiedDate || p.updatedAt || null
  };
  
  // Add optional allowed fields if they exist
  if ('priorityLevelLabel' in p) projection.priorityLevelLabel = p.priorityLevelLabel;
  if ('actionTypeLabel' in p) projection.actionTypeLabel = p.actionTypeLabel;
  if ('destinationLabel' in p) projection.destinationLabel = p.destinationLabel;
  if ('overflowDestinationId' in p) projection.overflowDestinationId = p.overflowDestinationId;
  if ('overflowDestinationLabel' in p) projection.overflowDestinationLabel = p.overflowDestinationLabel;
  if ('startAt' in p) projection.startAt = p.startAt;
  if ('completedAt' in p) projection.completedAt = p.completedAt;
  if ('expireAt' in p) projection.expireAt = p.expireAt;
  if ('untilSwitchedOff' in p) projection.untilSwitchedOff = p.untilSwitchedOff;

  return projection;
}

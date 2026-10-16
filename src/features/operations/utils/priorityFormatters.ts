import { Destination, ActionType, PriorityLevel } from '../../../types/configuration';
import { Priority } from '../../../types/priority';
import { Product } from '../../../types/product';

export const isRawId = (str: string | null | undefined): boolean => {
  if (!str) return false;
  const s = str.trim();
  // Alphanumeric with length between 16 and 40 (covers Firebase push IDs, MongoDB ObjectIds, etc)
  if (/^[a-zA-Z0-9_-]{16,40}$/.test(s)) return true;
  // Standard UUID format (with or without hyphens)
  if (/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(s)) return true;
  if (/^[a-fA-F0-9]{32}$/.test(s)) return true;
  // Prefix keys (e.g. prio_xxx)
  if (/^(prio|dest|uom|cat|act|user|site|tenant|prod)_[a-zA-Z0-9_-]+$/.test(s)) return true;
  return false;
};

export const getDestinationLabel = (
  id: string | null | undefined, 
  destinations: Destination[],
  snapshot?: string
): string => {
  if (!id) return '-';
  if (snapshot && !isRawId(snapshot)) return snapshot;
  const targetId = id.trim().toLowerCase();
  const match = destinations.find(d => 
    (d.id && d.id.toLowerCase() === targetId) || 
    (d.destinationCode && d.destinationCode.toLowerCase() === targetId) || 
    (d.destinationName && d.destinationName.toLowerCase() === targetId)
  );
  if (match) {
    return match.destinationName 
      ? `${match.destinationName} (${match.destinationCode})` 
      : match.destinationCode;
  }
  return isRawId(id) ? 'Destination' : id;
};

export const getDestinationCodeLabel = (
  id: string | null | undefined, 
  destinations: Destination[],
  snapshot?: string
): string => {
  if (!id) return '-';
  const targetId = id.trim().toLowerCase();
  const match = destinations.find(d => 
    (d.id && d.id.toLowerCase() === targetId) || 
    (d.destinationCode && d.destinationCode.toLowerCase() === targetId) || 
    (d.destinationName && d.destinationName.toLowerCase() === targetId)
  );
  if (match && match.destinationCode) {
    return match.destinationCode.toUpperCase();
  }
  if (snapshot && !isRawId(snapshot)) {
    const matchParen = snapshot.match(/\(([^)]+)\)/);
    if (matchParen && matchParen[1]) return matchParen[1].trim().toUpperCase();
    return snapshot.toUpperCase();
  }
  return isRawId(id) ? 'DEST' : id.toUpperCase();
};

export const getActionTypeLabel = (
  id: string | null | undefined, 
  actionTypes: ActionType[],
  snapshot?: string
): string => {
  if (!id) return '-';
  if (snapshot && !isRawId(snapshot)) return snapshot;
  const targetId = id.trim().toLowerCase();
  const match = actionTypes.find(a => 
    (a.id && a.id.toLowerCase() === targetId) || 
    (a.code && a.code.toLowerCase() === targetId) || 
    (a.label && a.label.toLowerCase() === targetId)
  );
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
  const targetId = id.trim().toLowerCase();
  const match = priorityLevels.find(l => 
    (l.id && l.id.toLowerCase() === targetId) || 
    (l.code && l.code.toLowerCase() === targetId) || 
    (l.label && l.label.toLowerCase() === targetId)
  );
  if (match) {
    return (match.label || match.code || 'NORMAL').toUpperCase();
  }
  if (isRawId(id)) {
    // If it is a raw ID (UUID) and we couldn't match it, let's look for common keyword indicators
    const idLower = id.toLowerCase();
    if (idLower.includes('critical')) return 'CRITICAL';
    if (idLower.includes('urgent')) return 'URGENT';
    if (idLower.includes('high')) return 'HIGH';
    if (idLower.includes('medium')) return 'MEDIUM';
    if (idLower.includes('low')) return 'LOW';
    return 'NORMAL';
  }
  return id.replace(/_/g, ' ').toUpperCase();
};

export const formatQuantityInPallets = (
  cases: number | null | undefined,
  casesPerPallet: number | null | undefined
): string => {
  if (cases === null || cases === undefined || cases <= 0) return '0 Pallets';
  if (!casesPerPallet || casesPerPallet <= 0) return `${cases.toLocaleString()} Cases`;
  const rawPallets = Math.round(cases / casesPerPallet);
  return `${rawPallets} ${rawPallets === 1 ? 'Pallet' : 'Pallets'}`;
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

export interface PrioritySelectionExplanation {
  summaryBlurb: string;
  actionReason: string;
  quantityReason: string;
  calculationFormula: string;
  breakdown: {
    qohCases?: number | null;
    qohPallets?: number | null;
    totalProtectedCases?: number | null;
    totalProtectedPallets?: number | null;
    ddxmRetentionCases?: number | null;
    minRetentionCases?: number | null;
    stoProtectedCases?: number | null;
    surplusCases?: number | null;
    surplusPallets?: number | null;
    allocatedCases?: number | null;
    allocatedPallets?: number | null;
    bandStatus?: string | null;
    destinationLabel?: string;
    actionLabel?: string;
  };
  structuredLines: string[];
}

export const extractPrioritySelectionLogic = (
  priority: Partial<Priority>,
  product?: Product | null,
  destinations: Destination[] = [],
  actionTypes: ActionType[] = []
): PrioritySelectionExplanation => {
  const destLabel = getDestinationLabel(priority.destinationId, destinations, priority.destinationLabel);
  const actionLabel = getActionTypeLabel(priority.actionTypeId, actionTypes, priority.actionTypeLabel);
  const cpp = product?.casesPerPallet || product?.configurations?.[0]?.casesPerPallet || 45;
  const reqCases = Number(priority.requestedQuantity) || 0;
  const reqPallets = cpp > 0 ? Math.round(reqCases / cpp) : 0;

  // 1. Check if structured breakdown is pre-stored
  if (priority.sizingRationaleBreakdown && priority.selectionLogicSummary) {
    const sb = priority.sizingRationaleBreakdown;
    return {
      summaryBlurb: priority.selectionLogicSummary,
      actionReason: sb.actionReason || `${actionLabel} triggered by inventory band status (${sb.planningBandStatus || 'ABOVE_TARGET'}).`,
      quantityReason: sb.quantityReason || `Surplus of ${reqCases.toLocaleString()} cases (${reqPallets} plts) above protected stock.`,
      calculationFormula: sb.calculationFormula || `${sb.qohCases ? sb.qohCases.toLocaleString() + ' c' : 'Stock'} - ${sb.controllingRetentionCases ? sb.controllingRetentionCases.toLocaleString() + ' c' : 'Protected'} = ${reqCases.toLocaleString()} c to ${destLabel}`,
      breakdown: {
        qohCases: sb.qohCases,
        qohPallets: sb.qohPallets,
        totalProtectedCases: sb.controllingRetentionCases,
        totalProtectedPallets: sb.controllingRetentionCases && cpp > 0 ? Math.round(sb.controllingRetentionCases / cpp) : null,
        ddxmRetentionCases: sb.ddxmRetentionCases,
        minRetentionCases: sb.minRetentionCases,
        stoProtectedCases: sb.stoProtectedCases,
        surplusCases: reqCases,
        surplusPallets: reqPallets,
        allocatedCases: reqCases,
        allocatedPallets: reqPallets,
        bandStatus: sb.planningBandStatus,
        destinationLabel: destLabel,
        actionLabel
      },
      structuredLines: priority.supportingReasons || []
    };
  }

  // 2. Parse text lines from supportingReasons and instruction
  const lines: string[] = [];
  if (Array.isArray(priority.supportingReasons)) {
    lines.push(...priority.supportingReasons);
  }
  if (priority.instruction && typeof priority.instruction === 'string' && priority.instruction.includes('\n')) {
    lines.push(...priority.instruction.split('\n'));
  }

  let parsedQoh: number | null = null;
  let parsedMin: number | null = null;
  let parsedDdxm: number | null = null;
  let parsedStoProtected: number | null = null;
  let parsedTotalProtected: number | null = null;
  let parsedAvailableToOverflow: number | null = null;
  let parsedBandStatus: string | null = null;

  for (const line of lines) {
    const qohMatch = line.match(/(?:Stock on Hand \(QOH\)|Evaluated QOH)\s*[:(]?\s*([0-9,.]+)/i);
    if (qohMatch && parsedQoh === null) {
      parsedQoh = parseFloat(qohMatch[1].replace(/,/g, ''));
    }

    const minMatch = line.match(/Minimum Retention\s*[:=]?\s*([0-9,.]+)/i);
    if (minMatch && parsedMin === null) {
      parsedMin = parseFloat(minMatch[1].replace(/,/g, ''));
    }

    const ddxmMatch = line.match(/DDXM Retention\s*[:=]?\s*([0-9,.]+)/i);
    if (ddxmMatch && parsedDdxm === null) {
      parsedDdxm = parseFloat(ddxmMatch[1].replace(/,/g, ''));
    }

    const stoMatch = line.match(/Northfleet STO Protected Stock\s*[:=]?\s*([0-9,.]+)/i);
    if (stoMatch && parsedStoProtected === null) {
      parsedStoProtected = parseFloat(stoMatch[1].replace(/,/g, ''));
    }

    const protMatch = line.match(/(?:Total Protected Stock|Controlling Retention)\s*[^:]*[:(]?\s*([0-9,.]+)/i);
    if (protMatch && parsedTotalProtected === null) {
      parsedTotalProtected = parseFloat(protMatch[1].replace(/,/g, ''));
    }

    const availMatch = line.match(/(?:Available to Overflow|Available\s*=)\s*[:=]?\s*([0-9,.]+)/i);
    if (availMatch && parsedAvailableToOverflow === null) {
      parsedAvailableToOverflow = parseFloat(availMatch[1].replace(/,/g, ''));
    }

    const bandMatch = line.match(/(?:Planning Band Status|Band Status resolved to)\s*[:=]?\s*([A-Za-z_]+)/i);
    if (bandMatch && parsedBandStatus === null) {
      parsedBandStatus = bandMatch[1].toUpperCase();
    }
  }

  // Also check planningContextSnapshot if available
  if (priority.planningContextSnapshot) {
    const ctx = priority.planningContextSnapshot;
    if (parsedQoh === null && ctx.inventoryTotal !== undefined) parsedQoh = ctx.inventoryTotal;
    if (parsedMin === null && ctx.planningRule?.minimumQuantity !== undefined) parsedMin = ctx.planningRule.minimumQuantity;
    if (parsedDdxm === null && ctx.planningRule?.ddxmRetentionQuantity !== undefined) parsedDdxm = ctx.planningRule.ddxmRetentionQuantity;
    if (parsedStoProtected === null && ctx.outstandingStoCases !== undefined) parsedStoProtected = ctx.outstandingStoCases;
  }

  // If parsedQoh or totalProtected weren't explicitly extracted:
  if (parsedTotalProtected === null && (parsedDdxm !== null || parsedMin !== null)) {
    parsedTotalProtected = Math.max(parsedMin || 0, parsedDdxm || 0) + (parsedStoProtected || 0);
  }
  if (parsedQoh === null && parsedTotalProtected !== null && reqCases > 0) {
    parsedQoh = parsedTotalProtected + reqCases;
  } else if (parsedTotalProtected === null && parsedQoh !== null && reqCases > 0) {
    parsedTotalProtected = Math.max(0, parsedQoh - reqCases);
  }

  const isSystemRec = priority.sourceType === 'RECOMMENDATION' || (!priority.sourceType && Boolean(priority.sourceRecommendationId));
  const isRelease = actionLabel.toLowerCase().includes('release') || (priority.actionTypeId && priority.actionTypeId.toLowerCase().includes('release'));
  const isHold = actionLabel.toLowerCase().includes('hold') || (priority.actionTypeId && priority.actionTypeId.toLowerCase().includes('hold'));
  const isProd = actionLabel.toLowerCase().includes('prod') || (priority.actionTypeId && priority.actionTypeId.toLowerCase().includes('prod'));

  let summaryBlurb = '';
  let actionReason = '';
  let quantityReason = '';
  let calculationFormula = '';

  const qohDisplay = parsedQoh !== null ? `${parsedQoh.toLocaleString()} c` : null;
  const protectedDisplay = parsedTotalProtected !== null ? `${parsedTotalProtected.toLocaleString()} c` : null;

  if (priority.selectionLogicSummary) {
    summaryBlurb = priority.selectionLogicSummary;
  } else if (isSystemRec) {
    if (isRelease) {
      summaryBlurb = `Physical inventory at Barrow warehouse exceeds the protected retention threshold. The system selected this product to release surplus stock (${reqCases.toLocaleString()} cases / ${reqPallets} pallets) to ${destLabel} to relieve warehouse floor storage pressure while preserving 100% of Barrow protected DDXM and customer commitments.`;
      actionReason = `Stock is in ${parsedBandStatus || 'ABOVE_TARGET'} band. Release action prevents warehouse congestion and routes excess stock to configured overflow destination ${destLabel}.`;
      quantityReason = `Sizing formula: Physical On-Hand (${qohDisplay || 'Current QOH'}) minus Total Barrow Protected Stock (${protectedDisplay || 'DDXM/Min'}) = ${reqCases.toLocaleString()} cases (${reqPallets} pallets) net surplus.`;
      calculationFormula = `${qohDisplay ? qohDisplay + ' (On Hand)' : 'Stock on Hand'} - ${protectedDisplay ? protectedDisplay + ' (Protected)' : 'Protected Stock'} = ${reqCases.toLocaleString()} cases (${reqPallets} plts) to ${destLabel}`;
    } else if (isHold) {
      summaryBlurb = `Physical stock is at or below the Barrow safety baseline (DDXM retention / mandatory minimum). The system placed this product on HOLD (0 cases released) to prevent stockouts and safeguard local retail and committed Northfleet demand.`;
      actionReason = `Stock is in ${parsedBandStatus || 'BELOW_CONTROL'} band. Holding inventory protects critical customer availability at Barrow.`;
      quantityReason = `Quantity set to 0 cases because available stock does not exceed protected baseline (${protectedDisplay || 'DDXM'}).`;
      calculationFormula = `On Hand (${qohDisplay || '0 c'}) ≤ Protected Baseline (${protectedDisplay || '0 c'}) → 0 cases released`;
    } else if (isProd) {
      summaryBlurb = `Inventory has dropped below the minimum controlling safety threshold with insufficient incoming production. The system requested production replenishment to restore safe operating stock.`;
      actionReason = `Deficit detected below safety control thresholds. Production requested to replenish safety stock.`;
      quantityReason = `Replenishment target calculated to bring Barrow inventory back to target buffer level.`;
      calculationFormula = `Target Buffer - Current Stock = ${reqCases.toLocaleString()} cases requested`;
    } else {
      summaryBlurb = `The OVMS recommendation engine selected this product for ${actionLabel} based on current warehouse inventory balances, DDXM retention rules, and active scheduling constraints.`;
      actionReason = `Triggered by decision engine under ${parsedBandStatus || 'ACTIVE'} operational planning band.`;
      quantityReason = `Sized to ${reqCases.toLocaleString()} cases (${reqPallets} pallets) per configured operational planning policies.`;
      calculationFormula = `Sized at ${reqCases.toLocaleString()} cases (${reqPallets} pallets)`;
    }
  } else {
    summaryBlurb = `Manual operational priority created by planner for ${actionLabel} of ${reqCases.toLocaleString()} cases (${reqPallets} pallets) to ${destLabel}.`;
    actionReason = `Manual operator instruction entered by planner.`;
    quantityReason = `Manual quantity specified as ${reqCases.toLocaleString()} cases (${reqPallets} pallets).`;
    calculationFormula = `Manual quantity: ${reqCases.toLocaleString()} cases (${reqPallets} pallets)`;
  }

  return {
    summaryBlurb,
    actionReason,
    quantityReason,
    calculationFormula,
    breakdown: {
      qohCases: parsedQoh,
      qohPallets: parsedQoh !== null && cpp > 0 ? Math.round(parsedQoh / cpp) : null,
      totalProtectedCases: parsedTotalProtected,
      totalProtectedPallets: parsedTotalProtected !== null && cpp > 0 ? Math.round(parsedTotalProtected / cpp) : null,
      ddxmRetentionCases: parsedDdxm,
      minRetentionCases: parsedMin,
      stoProtectedCases: parsedStoProtected,
      surplusCases: reqCases,
      surplusPallets: reqPallets,
      allocatedCases: reqCases,
      allocatedPallets: reqPallets,
      bandStatus: parsedBandStatus || 'ABOVE_TARGET',
      destinationLabel: destLabel,
      actionLabel
    },
    structuredLines: lines
  };
};

export const cleanOperatorInstruction = (
  instruction: string | undefined | null,
  priority: Partial<Priority>,
  actionLabel: string,
  destLabel: string,
  cpp: number = 45
): string => {
  if (instruction && isManualInstruction(instruction)) {
    return instruction;
  }
  const reqCases = Number(priority.requestedQuantity) || 0;
  const pallets = cpp > 0 ? Math.round(reqCases / cpp) : 0;
  return `${actionLabel} ${reqCases.toLocaleString()} cases (${pallets} ${pallets === 1 ? 'Pallet' : 'Pallets'}) to ${destLabel}`;
};



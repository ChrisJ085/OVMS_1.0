import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { DecisionInputSnapshot, DecisionOutput, ReasonCode } from '../../../types/decision';
import { evaluateDecision } from '../services/decisionEngine';
import { ProductPlanningRule, ControllingThresholdMode } from '../../../types/planning';
import { ProductProductionContext } from '../../../types/production';
import { PromotionProductRule, PromotionWithPhase } from '../../../types/promotion';
import { AlertCircle, Target, CheckCircle2, Factory, TrendingUp, HelpCircle } from 'lucide-react';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useSiteContext } from '../../../contexts/SiteContext';
import { collections } from '../../configuration/services/configurationService';
import { ActionType, Destination, PriorityLevel } from '../../../types/configuration';
import { getActionTypeLabel, getDestinationLabel, getPriorityLevelLabel } from '../../operations/utils/priorityFormatters';
import { subscribeToCollection, where } from '../../../services/dbService';

export const DecisionEngineScenariosPage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  const [selectedScenario, setSelectedScenario] = useState<number>(0);
  const [output, setOutput] = useState<DecisionOutput | null>(null);

  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [priorityLevels, setPriorityLevels] = useState<PriorityLevel[]>([]);

  useEffect(() => {
    if (!tenantId) return;

    const unsubActions = subscribeToCollection<ActionType>(
      collections.ACTION_TYPES,
      [where('tenantId', '==', tenantId)],
      setActionTypes,
      console.error
    );

    const unsubDest = subscribeToCollection<Destination>(
      collections.DESTINATIONS,
      [where('tenantId', '==', tenantId)],
      (items) => {
        const filtered = items.filter(d => !d.siteId || d.siteId === '' || d.siteId === siteId);
        setDestinations(filtered);
      },
      console.error
    );

    const unsubPriorities = subscribeToCollection<PriorityLevel>(
      collections.PRIORITY_LEVELS,
      [where('tenantId', '==', tenantId)],
      setPriorityLevels,
      console.error
    );

    return () => {
      unsubActions();
      unsubDest();
      unsubPriorities();
    };
  }, [tenantId, siteId]);

  // Mock Scenarios Setup
  const basePlanningRule: ProductPlanningRule = {
    id: 'rule-1',
    tenantId,
    siteId,
    productId: 'prod-1',
    productCodeSnapshot: 'TEST-PROD-01',
    descriptionSnapshot: 'Test Product',
    minimumQuantity: 100,
    targetQuantity: 200,
    maximumQuantity: 500,
    ddxmRetentionQuantity: 50,
    controllingThresholdMode: 'HIGHEST_MANDATORY',
    customControllingRetentionQuantity: null,
    preferredDestinationId: 'dest-1',
    secondaryDestinationId: null,
    defaultActionTypeId: 'ACTION_HOLD',
    defaultPriorityLevelId: 'PRIORITY_NORMAL',
    allowQuantityOverride: true,
    allowDestinationOverride: true,
    overrideRequiresReason: true,
    effectiveFrom: new Date().toISOString(),
    effectiveTo: null,
    notes: '',
    status: 'active',
    createdDate: new Date().toISOString(),
    modifiedDate: new Date().toISOString(),
    createdBy: 'system',
    modifiedBy: 'system'
  };

  const createMockProductionContext = (partial: Partial<ProductProductionContext>): ProductProductionContext => {
    return {
      productId: 'prod-1',
      isScheduled: false,
      isCurrentlyInProduction: false,
      currentProductionLine: null,
      currentProductionDate: null,
      plannedCasesToday: 0,
      plannedPalletsToday: 0,
      plannedCasesNext7Days: 0,
      plannedPalletsNext7Days: 0,
      nextProductionDate: null,
      daysUntilNextProduction: null,
      lastProductionDate: null,
      plannerProductionStatus: null,
      activeProductionNotes: [],
      hasDelay: false,
      hasShutdown: false,
      hasMaintenance: false,
      hasTrial: false,
      sourceImportId: null,
      sourceUpdatedAt: null,
      dataFreshnessStatus: 'FRESH',
      productionRiskStatus: 'NORMAL',
      currentProductionEvent: null,
      currentLine: null,
      currentExpectedFinish: null,
      nextProductionEvent: null,
      nextProductionStart: null,
      hoursUntilNextProduction: null,
      ...partial
    };
  };

  const scenarios: { name: string, input: DecisionInputSnapshot }[] = [
    {
      name: '1. Below DDXM (Shortfall)',
      input: {
        tenantId, siteId, productId: 'prod-1', productCodeSnapshot: 'TEST-PROD-01',
        inventoryTotal: 40,
        inventoryByLocation: [],
        inventoryUpdatedAt: new Date(),
        planningRule: basePlanningRule,
        productionContext: createMockProductionContext({ isCurrentlyInProduction: false, productionRiskStatus: 'NORMAL' }),
        activePromotionImpacts: [],
        existingActivePriorities: [],
        evaluationTime: new Date()
      }
    },
    {
      name: '2. At Controlling Retention',
      input: {
        tenantId, siteId, productId: 'prod-1', productCodeSnapshot: 'TEST-PROD-01',
        inventoryTotal: 100, // Min is 100, DDXM is 50. Controlling is 100.
        inventoryByLocation: [],
        inventoryUpdatedAt: new Date(),
        planningRule: basePlanningRule,
        productionContext: createMockProductionContext({ isCurrentlyInProduction: false, productionRiskStatus: 'NORMAL' }),
        activePromotionImpacts: [],
        existingActivePriorities: [],
        evaluationTime: new Date()
      }
    },
    {
      name: '3. Above Target (Healthy)',
      input: {
        tenantId, siteId, productId: 'prod-1', productCodeSnapshot: 'TEST-PROD-01',
        inventoryTotal: 250,
        inventoryByLocation: [],
        inventoryUpdatedAt: new Date(),
        planningRule: basePlanningRule,
        productionContext: createMockProductionContext({ isCurrentlyInProduction: false, productionRiskStatus: 'NORMAL' }),
        activePromotionImpacts: [],
        existingActivePriorities: [],
        evaluationTime: new Date()
      }
    },
    {
      name: '4. Above Maximum',
      input: {
        tenantId, siteId, productId: 'prod-1', productCodeSnapshot: 'TEST-PROD-01',
        inventoryTotal: 600,
        inventoryByLocation: [],
        inventoryUpdatedAt: new Date(),
        planningRule: basePlanningRule,
        productionContext: createMockProductionContext({ isCurrentlyInProduction: false, productionRiskStatus: 'NORMAL' }),
        activePromotionImpacts: [],
        existingActivePriorities: [],
        evaluationTime: new Date()
      }
    },
    {
      name: '5. Promotion Active (Retention Uplift)',
      input: {
        tenantId, siteId, productId: 'prod-1', productCodeSnapshot: 'TEST-PROD-01',
        inventoryTotal: 120, // Normally healthy (above min 100), but promo raises min
        inventoryByLocation: [],
        inventoryUpdatedAt: new Date(),
        planningRule: basePlanningRule,
        productionContext: createMockProductionContext({ isCurrentlyInProduction: false, productionRiskStatus: 'NORMAL' }),
        activePromotionImpacts: [
          {
            rule: { retentionUpliftQuantity: 50, expectedVolumeUpliftQuantity: null, expectedVolumeUpliftPercent: null, promotionMinimumOverride: null, promotionTargetOverride: null, promotionMaximumOverride: null, destinationOverrideId: null, priorityWeightUplift: 0, actionTypeOverrideId: null } as any,
            promotion: { promotionName: 'Summer Sale', phase: 'ACTIVE' } as any
          }
        ],
        existingActivePriorities: [],
        evaluationTime: new Date()
      }
    },
    {
      name: '6. Promotion Destination Override',
      input: {
        tenantId, siteId, productId: 'prod-1', productCodeSnapshot: 'TEST-PROD-01',
        inventoryTotal: 300,
        inventoryByLocation: [],
        inventoryUpdatedAt: new Date(),
        planningRule: basePlanningRule,
        productionContext: createMockProductionContext({ isCurrentlyInProduction: false, productionRiskStatus: 'NORMAL' }),
        activePromotionImpacts: [
          {
            rule: { retentionUpliftQuantity: null, expectedVolumeUpliftQuantity: null, expectedVolumeUpliftPercent: null, promotionMinimumOverride: null, promotionTargetOverride: null, promotionMaximumOverride: null, destinationOverrideId: 'PROMO_DC_1', priorityWeightUplift: 0, actionTypeOverrideId: null } as any,
            promotion: { promotionName: 'Regional Push', phase: 'PRE_BUILD' } as any
          }
        ],
        existingActivePriorities: [],
        evaluationTime: new Date()
      }
    },
    {
      name: '7. Production Delayed',
      input: {
        tenantId, siteId, productId: 'prod-1', productCodeSnapshot: 'TEST-PROD-01',
        inventoryTotal: 150,
        inventoryByLocation: [],
        inventoryUpdatedAt: new Date(),
        planningRule: basePlanningRule,
        productionContext: createMockProductionContext({ isCurrentlyInProduction: true, currentProductionEvent: {} as any, currentLine: 'Line 1', currentExpectedFinish: new Date(), productionRiskStatus: 'DELAYED', hasDelay: true }),
        activePromotionImpacts: [],
        existingActivePriorities: [],
        evaluationTime: new Date()
      }
    },
    {
      name: '8. Missing Planning Rule',
      input: {
        tenantId, siteId, productId: 'prod-1', productCodeSnapshot: 'TEST-PROD-01',
        inventoryTotal: 100,
        inventoryByLocation: [],
        inventoryUpdatedAt: new Date(),
        planningRule: null,
        productionContext: createMockProductionContext({ isCurrentlyInProduction: false, productionRiskStatus: 'NORMAL' }),
        activePromotionImpacts: [],
        existingActivePriorities: [],
        evaluationTime: new Date()
      }
    },
    {
      name: '9. Stale Inventory',
      input: {
        tenantId, siteId, productId: 'prod-1', productCodeSnapshot: 'TEST-PROD-01',
        inventoryTotal: 100,
        inventoryByLocation: [],
        inventoryUpdatedAt: new Date(new Date().getTime() - (48 * 60 * 60 * 1000)), // 48 hrs ago
        planningRule: basePlanningRule,
        productionContext: createMockProductionContext({ isCurrentlyInProduction: false, productionRiskStatus: 'NORMAL' }),
        activePromotionImpacts: [],
        existingActivePriorities: [],
        evaluationTime: new Date()
      }
    },
    {
      name: '10. Existing Active Priority',
      input: {
        tenantId, siteId, productId: 'prod-1', productCodeSnapshot: 'TEST-PROD-01',
        inventoryTotal: 100,
        inventoryByLocation: [],
        inventoryUpdatedAt: new Date(),
        planningRule: basePlanningRule,
        productionContext: createMockProductionContext({ isCurrentlyInProduction: false, productionRiskStatus: 'NORMAL' }),
        activePromotionImpacts: [],
        existingActivePriorities: [{ id: 'priority-1', status: 'ACTIVE' }],
        evaluationTime: new Date()
      }
    }
  ];

  useEffect(() => {
    // Run engine when scenario changes
    const result = evaluateDecision(scenarios[selectedScenario].input);
    setOutput(result);
  }, [selectedScenario]);

  return (
    <div className="pb-12">
      <PageHeader 
        title="Decision Engine Developer Harness" 
        description="Test determinism and view explainable outputs from the engine foundation."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Scenarios List */}
        <div className="space-y-4">
          <SectionCard title="Test Scenarios">
            <div className="flex flex-col gap-2">
              {scenarios.map((scen, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedScenario(idx)}
                  className={`text-left px-4 py-3 rounded-md text-sm transition-colors border ${
                    selectedScenario === idx 
                      ? 'bg-brand-900/20 border-brand-500 text-brand-400 font-medium' 
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {scen.name}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Render Input Summary */}
          {scenarios[selectedScenario] && (
            <SectionCard title="Input Snapshot">
              <pre className="text-xs text-slate-400 bg-slate-900 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify({
                  inventoryTotal: scenarios[selectedScenario].input.inventoryTotal,
                  baseRule: scenarios[selectedScenario].input.planningRule ? {
                    min: scenarios[selectedScenario].input.planningRule?.minimumQuantity,
                    target: scenarios[selectedScenario].input.planningRule?.targetQuantity,
                    max: scenarios[selectedScenario].input.planningRule?.maximumQuantity,
                    mode: scenarios[selectedScenario].input.planningRule?.controllingThresholdMode
                  } : null,
                  promotions: scenarios[selectedScenario].input.activePromotionImpacts.map(p => ({
                    name: p.promotion.promotionName,
                    phase: p.promotion.phase,
                    retentionUplift: p.rule.retentionUpliftQuantity,
                    destOverride: p.rule.destinationOverrideId
                  })),
                  production: scenarios[selectedScenario].input.productionContext ? {
                    running: scenarios[selectedScenario].input.productionContext?.isCurrentlyInProduction,
                    risk: scenarios[selectedScenario].input.productionContext?.productionRiskStatus
                  } : null,
                  isStale: scenarios[selectedScenario].input.inventoryUpdatedAt ? 
                    (new Date().getTime() - scenarios[selectedScenario].input.inventoryUpdatedAt!.getTime()) > 24*60*60*1000 : false
                }, null, 2)}
              </pre>
            </SectionCard>
          )}
        </div>

        {/* Output Panel */}
        <div className="col-span-2 space-y-6">
          {output && (
            <>
              {/* Top Banner */}
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-slate-100 flex items-center gap-3">
                    Engine Output
                    {output.dataQualityStatus !== 'COMPLETE' && (
                      <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-medium border border-amber-500/30 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {output.dataQualityStatus}
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
                    <span className="flex items-center gap-1.5"><Target className="w-4 h-4" /> {output.planningBandStatus}</span>
                    <span className="flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Qty: {output.sourceSnapshot.inventoryTotal}</span>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-sm text-slate-400 mb-1">Recommended Action</div>
                  <div className="text-xl font-bold text-brand-400">
                    {getActionTypeLabel(output.recommendedActionTypeId, actionTypes)} {output.recommendedQuantity > 0 ? `(${output.recommendedQuantity})` : ''}
                  </div>
                </div>
              </div>

              {/* Threshold Breakdown */}
              <SectionCard title="Effective Thresholds Calculation">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="pb-2 font-medium">Metric</th>
                      <th className="pb-2 font-medium">Base Rule</th>
                      <th className="pb-2 font-medium">Promo Adjust</th>
                      <th className="pb-2 font-medium text-brand-400">Effective</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    <tr>
                      <td className="py-3 text-slate-300">Minimum</td>
                      <td className="py-3 text-slate-400">{output.effectiveMinimum.baseValue}</td>
                      <td className="py-3 text-indigo-400">{output.effectiveMinimum.promotionAdjustment || '-'}</td>
                      <td className="py-3 text-brand-400 font-semibold">{output.effectiveMinimum.effectiveValue}</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-slate-300">Target</td>
                      <td className="py-3 text-slate-400">{output.effectiveTarget.baseValue}</td>
                      <td className="py-3 text-indigo-400">{output.effectiveTarget.promotionAdjustment || '-'}</td>
                      <td className="py-3 text-brand-400 font-semibold">{output.effectiveTarget.effectiveValue}</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-slate-300">Maximum</td>
                      <td className="py-3 text-slate-400">{output.effectiveMaximum.baseValue}</td>
                      <td className="py-3 text-indigo-400">{output.effectiveMaximum.promotionAdjustment || '-'}</td>
                      <td className="py-3 text-brand-400 font-semibold">{output.effectiveMaximum.effectiveValue}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="mt-4 p-3 bg-slate-900 rounded border border-slate-700 flex justify-between items-center text-sm">
                  <span className="text-slate-300">Controlling Retention</span>
                  <span className="text-lg font-bold text-brand-400">{output.controllingRetention}</span>
                </div>
              </SectionCard>

              {/* Explanations & Exceptions */}
              <div className="grid grid-cols-2 gap-6">
                <SectionCard title="Engine Explanation">
                  <ul className="space-y-3">
                    {output.explanationLines.map((line, i) => {
                      let renderedLine = line;
                      actionTypes.forEach(act => {
                        if (act.id && renderedLine.includes(act.id)) {
                          renderedLine = renderedLine.replaceAll(act.id, act.label || act.code);
                        }
                      });
                      destinations.forEach(dest => {
                        if (dest.id && renderedLine.includes(dest.id)) {
                          const label = dest.destinationName ? `${dest.destinationName} (${dest.destinationCode})` : dest.destinationCode;
                          renderedLine = renderedLine.replaceAll(dest.id, label);
                        }
                      });
                      priorityLevels.forEach(pl => {
                        if (pl.id && renderedLine.includes(pl.id)) {
                          renderedLine = renderedLine.replaceAll(pl.id, pl.label || pl.code);
                        }
                      });
                      return (
                        <li key={i} className="flex gap-3 text-sm text-slate-300 items-start">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                          <span>{renderedLine}</span>
                        </li>
                      );
                    })}
                    {output.explanationLines.length === 0 && (
                      <li className="text-slate-500 text-sm italic">No explanation generated.</li>
                    )}
                  </ul>
                  
                  <div className="mt-6 pt-4 border-t border-slate-800">
                    <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Reason Codes</h4>
                    <div className="flex flex-wrap gap-2">
                      {output.reasonCodes.map((code, i) => (
                        <span key={i} className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300">
                          {code}
                        </span>
                      ))}
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Exceptions & Context">
                  {output.exceptions.length > 0 ? (
                    <ul className="space-y-3">
                      {output.exceptions.map((ex, i) => (
                        <li key={i} className="flex gap-3 text-sm text-slate-300 bg-slate-900 p-3 rounded border border-slate-700">
                          <AlertCircle className={`w-4 h-4 mt-0.5 shrink-0 ${ex.severity === 'ERROR' ? 'text-red-500' : 'text-amber-500'}`} />
                          <div>
                            <div className={`font-medium mb-1 ${ex.severity === 'ERROR' ? 'text-red-400' : 'text-amber-400'}`}>{ex.severity}</div>
                            <span className="text-xs text-slate-400">{ex.message}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500">
                      <CheckCircle2 className="w-8 h-8 text-slate-700 mb-2" />
                      <p className="text-sm">No exceptions detected.</p>
                    </div>
                  )}

                  <div className="mt-6 pt-4 border-t border-slate-800">
                     <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Derived Metrics</h4>
                     <dl className="grid grid-cols-2 gap-y-2 text-sm">
                       <dt className="text-slate-400">Available to Release</dt>
                       <dd className="text-indigo-400 font-medium text-right">{output.availableToRelease}</dd>
                       <dt className="text-slate-400">Shortfall Qty</dt>
                       <dd className="text-red-400 font-medium text-right">{output.shortfallQuantity}</dd>
                       <dt className="text-slate-400">Headroom to Max</dt>
                       <dd className="text-slate-200 font-medium text-right">{output.headroomToMaximum}</dd>
                       <dt className="text-slate-400">Destination</dt>
                       <dd className="text-slate-200 font-medium text-right">{getDestinationLabel(output.recommendedDestinationId, destinations)}</dd>
                       <dt className="text-slate-400">Priority</dt>
                       <dd className="text-slate-200 font-medium text-right">{getPriorityLevelLabel(output.recommendedPriorityLevelId, priorityLevels)}</dd>
                     </dl>
                  </div>
                </SectionCard>
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  );
};

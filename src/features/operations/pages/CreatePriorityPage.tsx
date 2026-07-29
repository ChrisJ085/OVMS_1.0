import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { doc, getDoc, Timestamp, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { Recommendation } from '../../../types/recommendation';
import { Priority } from '../../../types/priority';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { ArrowLeft, AlertTriangle, Infinity } from 'lucide-react';
import { createPriority, updatePriority, checkDuplicatePriority } from '../services/priorityService';
import { getProduct } from '../../inventory/services/productService';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';
import { subscribeToCollection } from '../../../services/firestoreBase';
import { collections } from '../../configuration/services/configurationService';
import { ProductLookup } from '../../inventory/components/ProductLookup';
import { Destination, ActionType, PriorityLevel } from '../../../types/configuration';
import { getActionTypeLabel, getDestinationLabel, getPriorityLevelLabel } from '../utils/priorityFormatters';

export const CreatePriorityPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { tenantId, siteId } = useSiteContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: editPriorityId } = useParams<{ id: string }>();
  const isEditMode = !!editPriorityId;
  const recommendationId = searchParams.get('recommendationId');
  
  const [loading, setLoading] = useState(!!recommendationId || isEditMode);
  const [submitting, setSubmitting] = useState(false);
  
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  
  // Form State
  const [productId, setProductId] = useState('');
  const [actionTypeId, setActionTypeId] = useState('RELEASE_TO_DESPATCH');
  const [requestedQuantity, setRequestedQuantity] = useState<number | ''>('');
  const [destinationId, setDestinationId] = useState('');
  const [overflowDestinationId, setOverflowDestinationId] = useState('');
  const [priorityLevelId, setPriorityLevelId] = useState('NORMAL');
  const [instruction, setInstruction] = useState('');
  const [plannerReason, setPlannerReason] = useState('');
  const [startAt, setStartAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [untilSwitchedOff, setUntilSwitchedOff] = useState(true);
  const [expireAt, setExpireAt] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'SCHEDULED' | 'ACTIVE'>('ACTIVE');
  
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState('');

  // Dynamic config collections loaded from database
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  const [priorityLevels, setPriorityLevels] = useState<PriorityLevel[]>([]);

  // Load priority if in edit mode
  useEffect(() => {
    if (!editPriorityId || !tenantId) return;

    const fetchExistingPriority = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'priorities', editPriorityId));
        if (snap.exists()) {
          const p = { id: snap.id, ...snap.data() } as Priority;
          setProductId(p.productId || '');
          setActionTypeId(p.actionTypeId || 'RELEASE_TO_DESPATCH');
          setRequestedQuantity(p.requestedQuantity ?? '');
          setDestinationId(p.destinationId || '');
          setOverflowDestinationId(p.overflowDestinationId || '');
          setPriorityLevelId(p.priorityLevelId || 'NORMAL');
          setInstruction(p.instruction || '');
          setPlannerReason(p.plannerReason || '');
          setUntilSwitchedOff(p.untilSwitchedOff ?? !p.expireAt);
          if (['DRAFT', 'SCHEDULED', 'ACTIVE'].includes(p.priorityStatus)) {
            setStatus(p.priorityStatus as any);
          } else {
            setStatus('ACTIVE');
          }

          if (p.startAt) {
            const startD = (p.startAt as any)?.toDate?.() || new Date(p.startAt as any);
            const local = new Date(startD.getTime() - startD.getTimezoneOffset() * 60000);
            setStartAt(local.toISOString().slice(0, 16));
          }

          if (p.expireAt) {
            const expD = (p.expireAt as any)?.toDate?.() || new Date(p.expireAt as any);
            const localExp = new Date(expD.getTime() - expD.getTimezoneOffset() * 60000);
            setExpireAt(localExp.toISOString().slice(0, 16));
          }
        }
      } catch (err) {
        console.error('Error loading priority for edit:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchExistingPriority();
  }, [editPriorityId, tenantId]);

  // Subscribe to dynamic configurations from Firestore
  useEffect(() => {
    if (!tenantId) return;

    const unsubDest = subscribeToCollection<Destination>(
      collections.DESTINATIONS,
      [where('tenantId', '==', tenantId)],
      (items) => {
        const filtered = items
          .filter(d => !d.siteId || d.siteId === '' || d.siteId === siteId)
          .sort((a, b) => {
            if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
            if (a.sortOrder !== undefined && b.sortOrder !== undefined) return a.sortOrder - b.sortOrder;
            return (a.destinationName || '').localeCompare(b.destinationName || '');
          });
        setDestinations(filtered);
      },
      console.error
    );

    const unsubActions = subscribeToCollection<ActionType>(
      collections.ACTION_TYPES,
      [where('tenantId', '==', tenantId)],
      (items) => {
        const sorted = [...items].sort((a, b) => {
          if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
          if (a.sortOrder !== undefined && b.sortOrder !== undefined) return a.sortOrder - b.sortOrder;
          return (a.label || '').localeCompare(b.label || '');
        });
        setActionTypes(sorted);
      },
      console.error
    );

    const unsubPriorities = subscribeToCollection<PriorityLevel>(
      collections.PRIORITY_LEVELS,
      [where('tenantId', '==', tenantId)],
      (items) => {
        const sorted = [...items].sort((a, b) => {
          if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
          if (a.sortOrder !== undefined && b.sortOrder !== undefined) return a.sortOrder - b.sortOrder;
          return (a.label || '').localeCompare(b.label || '');
        });
        setPriorityLevels(sorted);
      },
      console.error
    );

    return () => {
      unsubDest();
      unsubActions();
      unsubPriorities();
    };
  }, [tenantId, siteId]);

  // Set default actionTypeId and priorityLevelId if not using a recommendation
  useEffect(() => {
    if (recommendationId) return;

    if (actionTypes.length > 0 && !actionTypes.some(a => a.id === actionTypeId || a.code === actionTypeId)) {
      const activeActions = actionTypes.filter(a => a.status === 'active');
      if (activeActions.length > 0) {
        setActionTypeId(activeActions[0].id);
      }
    }
  }, [actionTypes, recommendationId]);

  useEffect(() => {
    if (recommendationId) return;

    if (priorityLevels.length > 0 && !priorityLevels.some(l => l.id === priorityLevelId || l.code === priorityLevelId)) {
      const activeLevels = priorityLevels.filter(l => l.status === 'active');
      if (activeLevels.length > 0) {
        setPriorityLevelId(activeLevels[0].id);
      }
    }
  }, [priorityLevels, recommendationId]);

  useEffect(() => {
    if (!recommendationId || !tenantId) return;
    
    const fetchRec = async () => {
      try {
        const d = await getDoc(doc(db, 'recommendations', recommendationId));
        if (d.exists()) {
          const rec = { id: d.id, ...d.data() } as Recommendation;
          setRecommendation(rec);
          
          if (rec.linkedPriorityId) {
            alert('This recommendation already has a linked priority.');
            navigate('/operations/priorities');
            return;
          }
          
          setProductId(rec.productId);
          
          // Use planner decision if it exists (which it should for APPROVED/OVERRIDDEN), else fallback
          if (rec.decisionOutput.recommendedActionTypeId) {
            setActionTypeId(rec.decisionOutput.recommendedActionTypeId);
          }
          
          setRequestedQuantity(rec.plannerDecision?.quantity ?? rec.decisionOutput.recommendedQuantity ?? '');
          setDestinationId(rec.plannerDecision?.destinationId || rec.decisionOutput.recommendedDestinationId || '');
          setPriorityLevelId(rec.plannerDecision?.priorityLevelId || rec.decisionOutput.recommendedPriorityLevelId || 'NORMAL');
          
          // Generate a default instruction
          setInstruction(`Generated from Recommendation ${rec.id.slice(-6)}`);
          setPlannerReason(rec.plannerDecision?.notes || 'Approved system recommendation');
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRec();
  }, [recommendationId, tenantId, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !siteId || !currentUser) return;
    if (!productId) {
      alert("Product ID is required for manual entries.");
      return;
    }

    setSubmitting(true);
    
    try {
      // For manual entries, we need to fetch product snapshot details
      let productCodeSnapshot = 'UNKNOWN';
      let descriptionSnapshot = 'UNKNOWN';
      
      if (recommendation) {
        productCodeSnapshot = recommendation.productCodeSnapshot;
        descriptionSnapshot = recommendation.descriptionSnapshot;
      } else {
        const prod = await getProduct(productId);
        if (prod) {
          productCodeSnapshot = prod.productCode;
          descriptionSnapshot = prod.description;
        }
      }
      
      const startAtDate = new Date(startAt);
      // Auto-schedule if start time is in the future
      const calculatedStatus = startAtDate > new Date() && status === 'ACTIVE' ? 'SCHEDULED' : status;

      const actLabel = getActionTypeLabel(actionTypeId, actionTypes);
      const destLabel = getDestinationLabel(destinationId, destinations);
      const overflowDestLabel = overflowDestinationId ? getDestinationLabel(overflowDestinationId, destinations) : null;
      const levelLabel = getPriorityLevelLabel(priorityLevelId, priorityLevels);

      if (isEditMode && editPriorityId) {
        const updateData: any = {
          productId,
          productCodeSnapshot,
          descriptionSnapshot,
          actionTypeId,
          actionTypeLabel: actLabel,
          requestedQuantity: typeof requestedQuantity === 'number' ? requestedQuantity : null,
          destinationId: destinationId || null,
          destinationLabel: destLabel,
          overflowDestinationId: overflowDestinationId || null,
          overflowDestinationLabel: overflowDestLabel,
          priorityLevelId,
          priorityLevelLabel: levelLabel,
          instruction: instruction || '',
          plannerReason: plannerReason || '',
          startAt: Timestamp.fromDate(startAtDate),
          expireAt: (!untilSwitchedOff && expireAt) ? Timestamp.fromDate(new Date(expireAt)) : null,
          untilSwitchedOff: untilSwitchedOff,
          priorityStatus: calculatedStatus as any,
        };

        const result = await updatePriority(editPriorityId, updateData, currentUser || 'Planner', 'Priority updated by planner');
        if (result.success) {
          navigate('/operations/priorities');
        } else {
          alert(`Error: ${result.error}`);
        }
      } else {
        const isDuplicate = await checkDuplicatePriority(tenantId, siteId, productId, actionTypeId, destinationId);
        if (isDuplicate && !duplicateWarning) {
          setDuplicateWarning(true);
          setSubmitting(false);
          return; // Pause for user to provide reason
        }

        if (duplicateWarning && !duplicateOverrideReason.trim()) {
           alert("Please provide a reason for creating a duplicate priority.");
           setSubmitting(false);
           return;
        }

        const priorityData = {
          tenantId,
          siteId,
          sourceType: (recommendation ? 'RECOMMENDATION' : 'MANUAL') as 'RECOMMENDATION' | 'MANUAL',
          sourceRecommendationId: recommendation?.id || null,
          productId,
          productCodeSnapshot,
          descriptionSnapshot,
          actionTypeId,
          actionTypeLabel: actLabel,
          requestedQuantity: typeof requestedQuantity === 'number' ? requestedQuantity : null,
          destinationId: destinationId || null,
          destinationLabel: destLabel,
          overflowDestinationId: overflowDestinationId || null,
          overflowDestinationLabel: overflowDestLabel,
          priorityLevelId,
          priorityLevelLabel: levelLabel,
          instruction: instruction || '',
          plannerReason: plannerReason || '',
          supportingReasons: recommendation ? recommendation.decisionOutput.explanationLines : [],
          planningContextSnapshot: recommendation ? recommendation.sourceSnapshot : null,
          startAt: Timestamp.fromDate(startAtDate),
          expireAt: (!untilSwitchedOff && expireAt) ? Timestamp.fromDate(new Date(expireAt)) : null,
          untilSwitchedOff: untilSwitchedOff,
          priorityStatus: calculatedStatus as any,
        };

        const result = await createPriority(priorityData, currentUser, duplicateOverrideReason);
        
        if (result.success) {
          navigate('/operations/priorities');
        } else {
          alert(`Error: ${result.error}`);
        }
      }
    } catch (e) {
      console.error(e);
      alert('Failed to save priority');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading details...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex items-center gap-4">
        <button 
          className="flex items-center text-slate-400 hover:text-white transition-colors"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>
      </div>

      <PageHeader 
        title={isEditMode ? "Edit Priority" : recommendation ? "Create Priority from Recommendation" : "Create Manual Priority"} 
        description={isEditMode ? "Update operational priority parameters and instructions." : "Convert approved decisions into clear warehouse instructions."}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard title="Priority Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Product ID/Code <span className="text-red-500">*</span></label>
                {recommendation ? (
                  <>
                    <input 
                      type="text"
                      required
                      disabled
                      value={recommendation.productCodeSnapshot}
                      className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200 disabled:opacity-50"
                    />
                    <p className="text-xs text-slate-500 mt-1">{recommendation.descriptionSnapshot}</p>
                  </>
                ) : (
                  <ProductLookup 
                    value={productId}
                    onChange={(product) => setProductId(product.id)}
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Action Type <span className="text-red-500">*</span></label>
                <select 
                  required
                  value={actionTypeId}
                  onChange={(e) => setActionTypeId(e.target.value)}
                  className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                >
                  {actionTypes.length === 0 ? (
                    <>
                      <option value="RELEASE_TO_DESPATCH">Release to Despatch</option>
                      <option value="REQUEST_PRODUCTION">Request Production</option>
                      <option value="HOLD_INVENTORY">Hold Inventory</option>
                      <option value="QUALITY_INSPECTION">Quality Inspection</option>
                      <option value="LOCATION_TRANSFER">Location Transfer</option>
                    </>
                  ) : (
                    actionTypes.filter(act => act.status === 'active' || act.id === actionTypeId || act.code === actionTypeId).map(act => (
                      <option key={act.id} value={act.id}>{act.label}</option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Quantity</label>
                <input 
                  type="number"
                  min="0"
                  value={requestedQuantity}
                  onChange={(e) => setRequestedQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Destination ID</label>
                <select 
                  value={destinationId}
                  onChange={(e) => setDestinationId(e.target.value)}
                  className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                >
                  <option value="">Select Destination (Optional)</option>
                  {destinations.filter(d => d.status === 'active' || d.id === destinationId).map(d => (
                    <option key={d.id} value={d.id}>{d.destinationName} ({d.destinationCode})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Overflow Destination ID</label>
                <select 
                  value={overflowDestinationId}
                  onChange={(e) => setOverflowDestinationId(e.target.value)}
                  className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                >
                  <option value="">Select Overflow Destination (Optional)</option>
                  {destinations.filter(d => d.status === 'active' || d.id === overflowDestinationId).map(d => (
                    <option key={d.id} value={d.id}>{d.destinationName} ({d.destinationCode})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Priority Level <span className="text-red-500">*</span></label>
                <select 
                  required
                  value={priorityLevelId}
                  onChange={(e) => setPriorityLevelId(e.target.value)}
                  className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                >
                  {priorityLevels.length === 0 ? (
                    <>
                      <option value="LOW">Low</option>
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </>
                  ) : (
                    priorityLevels.filter(lvl => lvl.status === 'active' || lvl.id === priorityLevelId).map(lvl => (
                      <option key={lvl.id} value={lvl.id}>{lvl.label}</option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Warehouse Instruction</label>
                <textarea 
                  rows={2}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                  placeholder="Clear instruction for operators..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Planner Reason</label>
                <textarea 
                  rows={2}
                  value={plannerReason}
                  onChange={(e) => setPlannerReason(e.target.value)}
                  className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                />
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Scheduling & Lifecycle">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Status on Save <span className="text-red-500">*</span></label>
              <select 
                required
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
              >
                <option value="DRAFT">Save as Draft</option>
                <option value="ACTIVE">Publish (Active/Scheduled)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Start At <span className="text-red-500">*</span></label>
              <input 
                type="datetime-local"
                required
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Duration & Expiry</label>
              <div className="space-y-2">
                <div className="flex items-center gap-4 pt-1">
                  <label className="inline-flex items-center text-xs text-slate-200 cursor-pointer select-none">
                    <input 
                      type="radio" 
                      name="durationOption"
                      checked={untilSwitchedOff}
                      onChange={() => {
                        setUntilSwitchedOff(true);
                        setExpireAt('');
                      }}
                      className="form-radio text-brand-500 focus:ring-brand-500 bg-slate-900 border-slate-700 mr-2"
                    />
                    Until Switched Off
                  </label>
                  <label className="inline-flex items-center text-xs text-slate-200 cursor-pointer select-none">
                    <input 
                      type="radio" 
                      name="durationOption"
                      checked={!untilSwitchedOff}
                      onChange={() => setUntilSwitchedOff(false)}
                      className="form-radio text-brand-500 focus:ring-brand-500 bg-slate-900 border-slate-700 mr-2"
                    />
                    Expire At Date
                  </label>
                </div>

                {untilSwitchedOff ? (
                  <div className="p-2.5 bg-slate-900 border border-slate-700/80 rounded-md text-xs text-emerald-400/90 flex items-center gap-2">
                    <Infinity className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>Priority remains active continuously until manually switched off or completed.</span>
                  </div>
                ) : (
                  <div>
                    <input 
                      type="datetime-local"
                      required={!untilSwitchedOff}
                      value={expireAt}
                      onChange={(e) => setExpireAt(e.target.value)}
                      className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </SectionCard>

        {duplicateWarning && (
          <SectionCard title="Duplicate Warning">
            <div className="bg-amber-900/20 border border-amber-900/50 p-4 rounded-md">
              <div className="flex items-center text-amber-500 mb-3">
                <AlertTriangle className="w-5 h-5 mr-2" />
                <span className="font-medium">An active or scheduled priority already exists for this product and action/destination.</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Reason for Duplicate Override <span className="text-red-500">*</span></label>
                <textarea 
                  required
                  rows={2}
                  value={duplicateOverrideReason}
                  onChange={(e) => setDuplicateOverrideReason(e.target.value)}
                  className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                  placeholder="Explain why another identical priority is needed..."
                />
              </div>
            </div>
          </SectionCard>
        )}

        <div className="flex justify-end pt-4 gap-4">
          <button 
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 border border-slate-700 rounded-md text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit"
            disabled={submitting || (duplicateWarning && !duplicateOverrideReason.trim())}
            className="px-6 py-2 bg-brand-500 rounded-md text-sm font-medium text-slate-900 hover:bg-brand-400 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving...' : duplicateWarning ? 'Confirm Duplicate' : isEditMode ? 'Save Changes' : 'Create Priority'}
          </button>
        </div>
      </form>
    </div>
  );
};

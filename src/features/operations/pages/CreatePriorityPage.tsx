import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { Recommendation } from '../../../types/recommendation';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { createPriority, checkDuplicatePriority } from '../services/priorityService';
import { getProduct } from '../../inventory/services/productService';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';

export const CreatePriorityPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { tenantId, siteId } = useSiteContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const recommendationId = searchParams.get('recommendationId');
  
  const [loading, setLoading] = useState(!!recommendationId);
  const [submitting, setSubmitting] = useState(false);
  
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  
  // Form State
  const [productId, setProductId] = useState('');
  const [actionTypeId, setActionTypeId] = useState('RELEASE_TO_DESPATCH');
  const [requestedQuantity, setRequestedQuantity] = useState<number | ''>('');
  const [destinationId, setDestinationId] = useState('');
  const [priorityLevelId, setPriorityLevelId] = useState('NORMAL');
  const [instruction, setInstruction] = useState('');
  const [plannerReason, setPlannerReason] = useState('');
  const [startAt, setStartAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [expireAt, setExpireAt] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'SCHEDULED' | 'ACTIVE'>('ACTIVE');
  
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState('');

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
        requestedQuantity: typeof requestedQuantity === 'number' ? requestedQuantity : null,
        destinationId: destinationId || null,
        priorityLevelId,
        instruction,
        plannerReason,
        supportingReasons: recommendation ? recommendation.decisionOutput.explanationLines : [],
        planningContextSnapshot: recommendation ? recommendation.sourceSnapshot : null,
        startAt: Timestamp.fromDate(startAtDate),
        expireAt: expireAt ? Timestamp.fromDate(new Date(expireAt)) : null,
        priorityStatus: calculatedStatus as any,
      };

      const result = await createPriority(priorityData, currentUser.id, duplicateOverrideReason);
      
      if (result.success) {
        navigate('/operations/priorities');
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to create priority');
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
        title={recommendation ? "Create Priority from Recommendation" : "Create Manual Priority"} 
        description="Convert approved decisions into clear warehouse instructions."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard title="Priority Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Product ID/Code <span className="text-red-500">*</span></label>
                <input 
                  type="text"
                  required
                  disabled={!!recommendation}
                  value={recommendation ? recommendation.productCodeSnapshot : productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200 disabled:opacity-50"
                  placeholder="e.g. prod-1"
                />
                {recommendation && <p className="text-xs text-slate-500 mt-1">{recommendation.descriptionSnapshot}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Action Type <span className="text-red-500">*</span></label>
                <select 
                  required
                  value={actionTypeId}
                  onChange={(e) => setActionTypeId(e.target.value)}
                  className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                >
                  <option value="RELEASE_TO_DESPATCH">Release to Despatch</option>
                  <option value="REQUEST_PRODUCTION">Request Production</option>
                  <option value="HOLD_INVENTORY">Hold Inventory</option>
                  <option value="QUALITY_INSPECTION">Quality Inspection</option>
                  <option value="LOCATION_TRANSFER">Location Transfer</option>
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
                <input 
                  type="text"
                  value={destinationId}
                  onChange={(e) => setDestinationId(e.target.value)}
                  className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                  placeholder="e.g. WH-OUT-1"
                />
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
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Warehouse Instruction <span className="text-red-500">*</span></label>
                <textarea 
                  required
                  rows={2}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                  placeholder="Clear instruction for operators..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Planner Reason <span className="text-red-500">*</span></label>
                <textarea 
                  required
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
              <label className="block text-sm font-medium text-slate-400 mb-1">Expire At (Optional)</label>
              <input 
                type="datetime-local"
                value={expireAt}
                onChange={(e) => setExpireAt(e.target.value)}
                className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
              />
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
            {submitting ? 'Saving...' : duplicateWarning ? 'Confirm Duplicate' : 'Create Priority'}
          </button>
        </div>
      </form>
    </div>
  );
};

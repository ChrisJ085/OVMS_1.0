import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { FormField } from '../../../../components/ui/FormField';
import { ProductionEvent } from '../../../../types/production';
import { UnitOfMeasure } from '../../../../types/configuration';
import { useDevelopmentContext } from '../../../../contexts/DevelopmentContext';
import { updateProductionEvent } from '../../services/productionService';
import { Timestamp } from 'firebase/firestore';

interface ProductionActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: ProductionEvent;
  actionType?: string;
  uoms: UnitOfMeasure[];
}

export const ProductionActionModal: React.FC<ProductionActionModalProps> = ({ 
  isOpen, onClose, item, actionType, uoms 
}) => {
  const { tenantId, siteId } = useDevelopmentContext();
  const [submitting, setSubmitting] = useState(false);
  const [actualQuantity, setActualQuantity] = useState<string>('');
  const [delayReason, setDelayReason] = useState<string>('');
  const [actionTime, setActionTime] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (isOpen && item) {
      setActualQuantity(item.actualQuantity?.toString() || '');
      setDelayReason(item.delayReason || '');
      setNotes(item.notes || '');
      setActionTime(new Date().toISOString().slice(0, 16));
    }
  }, [isOpen, item]);

  if (!isOpen || !item || !actionType) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    const payload: Partial<ProductionEvent> = {
      notes: notes
    };

    const time = new Date(actionTime);

    switch (actionType) {
      case 'START':
        payload.productionStatus = 'RUNNING';
        payload.actualStart = Timestamp.fromDate(time);
        payload.delayReason = null;
        break;
      case 'MARK_ENDING':
        payload.productionStatus = 'ENDING';
        payload.delayReason = null;
        break;
      case 'DELAY':
        payload.productionStatus = 'DELAYED';
        payload.delayReason = delayReason;
        break;
      case 'STOP':
        payload.productionStatus = 'STOPPED';
        payload.delayReason = delayReason;
        break;
      case 'COMPLETE':
        payload.productionStatus = 'COMPLETE';
        payload.actualFinish = Timestamp.fromDate(time);
        payload.actualQuantity = actualQuantity ? Number(actualQuantity) : null;
        payload.delayReason = null;
        break;
      case 'UPDATE_QTY':
        payload.actualQuantity = actualQuantity ? Number(actualQuantity) : null;
        break;
    }

    const result = await updateProductionEvent(item.id!, payload, tenantId, siteId);
    
    setSubmitting(false);
    if (result.success) {
      onClose();
    } else {
      alert(result.error);
    }
  };

  const getTitle = () => {
    switch (actionType) {
      case 'START': return 'Start Production';
      case 'MARK_ENDING': return 'Mark as Ending';
      case 'DELAY': return 'Mark as Delayed';
      case 'STOP': return 'Stop Production';
      case 'COMPLETE': return 'Complete Production';
      case 'UPDATE_QTY': return 'Update Actual Quantity';
      default: return 'Production Action';
    }
  };

  const uomCode = uoms.find(u => u.id === item.unitOfMeasureId)?.code || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-lg font-medium text-slate-100">
            {getTitle()}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto">
            
            <div className="text-sm text-slate-300 bg-slate-800/50 p-3 rounded-md">
              <span className="font-semibold text-slate-200">{item.productCodeSnapshot}</span>
              <br/>
              {item.descriptionSnapshot}
            </div>

            {['START', 'COMPLETE'].includes(actionType) && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">
                  {actionType === 'START' ? 'Actual Start Time *' : 'Actual Finish Time *'}
                </label>
                <input 
                  type="datetime-local" 
                  value={actionTime}
                  onChange={(e) => setActionTime(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                  required
                />
              </div>
            )}

            {['DELAY', 'STOP'].includes(actionType) && (
              <FormField 
                label="Reason *" 
                value={delayReason} 
                onChange={(e) => setDelayReason(e.target.value)} 
                required 
              />
            )}

            {['COMPLETE', 'UPDATE_QTY'].includes(actionType) && (
              <FormField 
                label={`Actual Quantity (${uomCode})`} 
                type="number"
                value={actualQuantity} 
                onChange={(e) => setActualQuantity(e.target.value)} 
              />
            )}

            <FormField 
              label="Notes" 
              value={notes} 
              onChange={(e) => setNotes(e.target.value)} 
              isTextArea
            />
            
          </div>
          
          <div className="px-5 py-4 bg-slate-800/50 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-600 rounded-md hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-900 bg-brand-500 rounded-md hover:bg-brand-400 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

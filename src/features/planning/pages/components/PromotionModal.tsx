import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { FormField } from '../../../../components/ui/FormField';
import { Promotion, PromotionImportance, PromotionStatus } from '../../../../types/promotion';
import { useDevelopmentContext } from '../../../../contexts/DevelopmentContext';
import { createPromotion, updatePromotion } from '../../services/promotionService';
import { Timestamp } from 'firebase/firestore';

interface PromotionModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: Promotion;
}

export const PromotionModal: React.FC<PromotionModalProps> = ({ 
  isOpen, onClose, item
}) => {
  const { tenantId } = useDevelopmentContext();
  const [formData, setFormData] = useState<Partial<Promotion>>({});
  const [submitting, setSubmitting] = useState(false);
  
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [preBuildInput, setPreBuildInput] = useState('');
  const [runDownInput, setRunDownInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setFormData({ ...item });
        const start = (item.startDate as any).toDate ? (item.startDate as any).toDate() : new Date(item.startDate as any);
        const end = (item.endDate as any).toDate ? (item.endDate as any).toDate() : new Date(item.endDate as any);
        setStartInput(start.toISOString().slice(0, 16));
        setEndInput(end.toISOString().slice(0, 16));
        
        if (item.preBuildStartDate) {
          const pre = (item.preBuildStartDate as any).toDate ? (item.preBuildStartDate as any).toDate() : new Date(item.preBuildStartDate as any);
          setPreBuildInput(pre.toISOString().slice(0, 16));
        } else {
          setPreBuildInput('');
        }

        if (item.runDownEndDate) {
          const run = (item.runDownEndDate as any).toDate ? (item.runDownEndDate as any).toDate() : new Date(item.runDownEndDate as any);
          setRunDownInput(run.toISOString().slice(0, 16));
        } else {
          setRunDownInput('');
        }

      } else {
        setFormData({
          promotionCode: '',
          promotionName: '',
          description: '',
          importance: 'STANDARD',
          promotionStatus: 'DRAFT',
          notes: ''
        });
        
        const now = new Date();
        now.setMinutes(0);
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        
        setStartInput(now.toISOString().slice(0, 16));
        setEndInput(tomorrow.toISOString().slice(0, 16));
        setPreBuildInput('');
        setRunDownInput('');
      }
    }
  }, [isOpen, item]);

  if (!isOpen) return null;

  const handleChange = (field: keyof Promotion, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    const start = new Date(startInput);
    const end = new Date(endInput);
    
    const payload = {
      ...formData,
      startDate: Timestamp.fromDate(start),
      endDate: Timestamp.fromDate(end),
      preBuildStartDate: preBuildInput ? Timestamp.fromDate(new Date(preBuildInput)) : null,
      runDownEndDate: runDownInput ? Timestamp.fromDate(new Date(runDownInput)) : null,
    };
    
    let result;
    if (item?.id) {
      result = await updatePromotion(item.id, payload);
    } else {
      result = await createPromotion({
        ...payload,
        tenantId,
      } as Omit<Promotion, 'id' | 'status' | 'createdDate' | 'modifiedDate'>);
    }
    
    setSubmitting(false);
    if (result.success) {
      onClose();
    } else {
      alert(result.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-lg font-medium text-slate-100">
            {item ? 'Edit Promotion' : 'Create Promotion'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto">
            
            <div className="grid grid-cols-2 gap-4">
              <FormField 
                label="Promotion Code *" 
                value={formData.promotionCode || ''} 
                onChange={(e) => handleChange('promotionCode', e.target.value)} 
                required 
              />
              <FormField 
                label="Promotion Name *" 
                value={formData.promotionName || ''} 
                onChange={(e) => handleChange('promotionName', e.target.value)} 
                required 
              />
            </div>

            <FormField 
              label="Description" 
              value={formData.description || ''} 
              onChange={(e) => handleChange('description', e.target.value)} 
              isTextArea
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">Importance *</label>
                <select 
                  value={formData.importance || 'STANDARD'} 
                  onChange={(e) => handleChange('importance', e.target.value as PromotionImportance)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                  required
                >
                  <option value="STANDARD">Standard</option>
                  <option value="HIGH">High</option>
                  <option value="NATIONAL">National</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">Status *</label>
                <select 
                  value={formData.promotionStatus || 'DRAFT'} 
                  onChange={(e) => handleChange('promotionStatus', e.target.value as PromotionStatus)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                  required
                >
                  <option value="DRAFT">Draft</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">Pre-build Start</label>
                <input 
                  type="datetime-local" 
                  value={preBuildInput}
                  onChange={(e) => setPreBuildInput(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">Start Date *</label>
                <input 
                  type="datetime-local" 
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600 border-brand-500/30"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">End Date *</label>
                <input 
                  type="datetime-local" 
                  value={endInput}
                  onChange={(e) => setEndInput(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600 border-brand-500/30"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">Run-down End</label>
                <input 
                  type="datetime-local" 
                  value={runDownInput}
                  onChange={(e) => setRunDownInput(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                />
              </div>
            </div>

            <FormField 
              label="Notes" 
              value={formData.notes || ''} 
              onChange={(e) => handleChange('notes', e.target.value)} 
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
              {submitting ? 'Saving...' : 'Save Promotion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

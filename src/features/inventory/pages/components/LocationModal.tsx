import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { FormField } from '../../../../components/ui/FormField';
import { Location } from '../../../../types/inventory';
import { StorageArea } from '../../../../types/configuration';
import { useDevelopmentContext } from '../../../../contexts/DevelopmentContext';
import { createLocation, updateLocation } from '../../services/locationService';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: Location;
  storageAreas: StorageArea[];
}

export const LocationModal: React.FC<LocationModalProps> = ({ 
  isOpen, onClose, item, storageAreas 
}) => {
  const { tenantId, siteId } = useDevelopmentContext();
  const [formData, setFormData] = useState<Partial<Location>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setFormData({ ...item });
      } else {
        const activeAreas = storageAreas.filter(a => a.status === 'active');
        setFormData({
          locationCode: '',
          locationName: '',
          storageAreaId: activeAreas.length > 0 ? activeAreas[0].id : '',
        });
      }
    }
  }, [isOpen, item, storageAreas]);

  if (!isOpen) return null;

  const handleChange = (field: keyof Location, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    let result;
    if (item?.id) {
      result = await updateLocation(item.id, formData, tenantId, siteId);
    } else {
      result = await createLocation({
        ...formData,
        tenantId,
        siteId,
      } as Omit<Location, 'id' | 'status' | 'createdDate' | 'modifiedDate'>);
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
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-lg font-medium text-slate-100">
            {item ? 'Edit Location' : 'Create Location'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto">
            <FormField 
              label="Location Code" 
              value={formData.locationCode || ''} 
              onChange={(e) => handleChange('locationCode', e.target.value.toUpperCase())} 
              required 
              disabled={!!item}
            />
            
            <FormField 
              label="Location Name" 
              value={formData.locationName || ''} 
              onChange={(e) => handleChange('locationName', e.target.value)} 
              required 
            />
            
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-300">Storage Area *</label>
              <select 
                value={formData.storageAreaId || ''} 
                onChange={(e) => handleChange('storageAreaId', e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                required
              >
                <option value="" disabled>Select a storage area</option>
                {storageAreas
                  .filter(a => a.status === 'active' || a.id === formData.storageAreaId)
                  .map(a => (
                  <option key={a.id} value={a.id}>{a.areaName} ({a.areaCode})</option>
                ))}
              </select>
            </div>
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
              {submitting ? 'Saving...' : 'Save Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

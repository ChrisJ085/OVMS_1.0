import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { FormField } from '../../../components/ui/FormField';

interface ConfigItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  item?: any;
  tabId: string;
}

export const ConfigItemModal: React.FC<ConfigItemModalProps> = ({ isOpen, onClose, onSave, item, tabId }) => {
  const [formData, setFormData] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData(item || {});
    }
  }, [isOpen, item]);

  if (!isOpen) return null;

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onSave(formData);
    setSubmitting(false);
  };

  const renderFields = () => {
    switch (tabId) {
      case 'sites':
        return (
          <>
            <FormField label="Site Code" value={formData.siteCode || ''} onChange={(e) => handleChange('siteCode', e.target.value)} required disabled={!!item} />
            <FormField label="Site Name" value={formData.siteName || ''} onChange={(e) => handleChange('siteName', e.target.value)} required />
            <FormField label="Timezone" value={formData.timezone || ''} onChange={(e) => handleChange('timezone', e.target.value)} required />
          </>
        );
      case 'destinations':
        return (
          <>
            <FormField label="Destination Code" value={formData.destinationCode || ''} onChange={(e) => handleChange('destinationCode', e.target.value)} required disabled={!!item} />
            <FormField label="Destination Name" value={formData.destinationName || ''} onChange={(e) => handleChange('destinationName', e.target.value)} required />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-300">Type</label>
              <select 
                value={formData.destinationType || 'INTERNAL_SITE'} 
                onChange={(e) => handleChange('destinationType', e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
              >
                <option value="INTERNAL_SITE">Internal Site</option>
                <option value="EXTERNAL_SITE">External Site</option>
                <option value="CUSTOMER">Customer</option>
                <option value="OVERFLOW">Overflow</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <FormField label="Sort Order" type="number" value={formData.sortOrder || 0} onChange={(e) => handleChange('sortOrder', parseInt(e.target.value))} required />
          </>
        );
      case 'units':
      case 'categories':
        return (
          <>
            <FormField label="Code" value={formData.code || ''} onChange={(e) => handleChange('code', e.target.value)} required disabled={!!item} />
            <FormField label="Name" value={formData.name || ''} onChange={(e) => handleChange('name', e.target.value)} required />
            {tabId === 'categories' && (
              <FormField label="Description" value={formData.description || ''} onChange={(e) => handleChange('description', e.target.value)} />
            )}
            {tabId === 'units' && (
              <FormField label="Quantity Precision" type="number" value={formData.quantityPrecision || 0} onChange={(e) => handleChange('quantityPrecision', parseInt(e.target.value))} required />
            )}
          </>
        );
      case 'areas':
        return (
          <>
            <FormField label="Area Code" value={formData.areaCode || ''} onChange={(e) => handleChange('areaCode', e.target.value)} required disabled={!!item} />
            <FormField label="Area Name" value={formData.areaName || ''} onChange={(e) => handleChange('areaName', e.target.value)} required />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-300">Type</label>
              <select 
                value={formData.areaType || 'HIGH_BAY'} 
                onChange={(e) => handleChange('areaType', e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
              >
                <option value="HIGH_BAY">High Bay</option>
                <option value="BULK">Bulk</option>
                <option value="MARSHALLING">Marshalling</option>
                <option value="STAGING">Staging</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <FormField label="Sort Order" type="number" value={formData.sortOrder || 0} onChange={(e) => handleChange('sortOrder', parseInt(e.target.value))} required />
          </>
        );
      case 'lines':
        return (
          <>
            <FormField label="Line Code" value={formData.lineCode || ''} onChange={(e) => handleChange('lineCode', e.target.value)} required disabled={!!item} />
            <FormField label="Line Name" value={formData.lineName || ''} onChange={(e) => handleChange('lineName', e.target.value)} required />
            <FormField label="SAP Resource Code" value={formData.sapResourceCode || ''} onChange={(e) => handleChange('sapResourceCode', e.target.value)} placeholder="e.g. FCL5_3200_001" />
            <FormField 
              label="SAP Resource Aliases (Comma separated)" 
              value={Array.isArray(formData.sapResourceAliases) ? formData.sapResourceAliases.join(', ') : (formData.sapResourceAliases || '')} 
              onChange={(e) => handleChange('sapResourceAliases', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))} 
              placeholder="e.g. FCL5, LINE5" 
            />
          </>
        );
      case 'actions':
        return (
          <>
            <FormField label="Code" value={formData.code || ''} onChange={(e) => handleChange('code', e.target.value)} required disabled={!!item} />
            <FormField label="Label" value={formData.label || ''} onChange={(e) => handleChange('label', e.target.value)} required />
            <FormField label="Meaning" value={formData.meaning || ''} onChange={(e) => handleChange('meaning', e.target.value)} required />
            <FormField label="Colour Token" value={formData.colourToken || ''} onChange={(e) => handleChange('colourToken', e.target.value)} required />
            <FormField label="Icon Key" value={formData.iconKey || ''} onChange={(e) => handleChange('iconKey', e.target.value)} required />
            <FormField label="Sort Order" type="number" value={formData.sortOrder || 0} onChange={(e) => handleChange('sortOrder', parseInt(e.target.value))} required />
          </>
        );
      case 'priorities':
        return (
          <>
            <FormField label="Code" value={formData.code || ''} onChange={(e) => handleChange('code', e.target.value)} required disabled={!!item} />
            <FormField label="Label" value={formData.label || ''} onChange={(e) => handleChange('label', e.target.value)} required />
            <FormField label="Numeric Weight" type="number" value={formData.numericWeight || 0} onChange={(e) => handleChange('numericWeight', parseInt(e.target.value))} required />
            <FormField label="Colour Token" value={formData.colourToken || ''} onChange={(e) => handleChange('colourToken', e.target.value)} required />
            <FormField label="Sort Order" type="number" value={formData.sortOrder || 0} onChange={(e) => handleChange('sortOrder', parseInt(e.target.value))} required />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-lg font-medium text-slate-100">
            {item ? 'Edit Record' : 'Create Record'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {renderFields()}
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
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

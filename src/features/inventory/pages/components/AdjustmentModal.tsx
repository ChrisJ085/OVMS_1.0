import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { FormField } from '../../../../components/ui/FormField';
import { ProductLookup } from '../../components/ProductLookup';
import { LocationLookup } from '../../components/LocationLookup';
import { adjustInventory, transferInventory } from '../../services/inventoryService';
import { UnitOfMeasure } from '../../../../types/configuration';
import { useAuth } from '../../../auth/context/AuthContext';
import { useSiteContext } from '../../../../contexts/SiteContext';

export type AdjustmentType = 'INCREASE' | 'DECREASE' | 'TRANSFER';

interface AdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: AdjustmentType;
  defaultProductId?: string;
  defaultProductCode?: string;
  defaultProductDesc?: string;
  units: UnitOfMeasure[];
}

export const AdjustmentModal: React.FC<AdjustmentModalProps> = ({ 
  isOpen, onClose, defaultType = 'INCREASE', defaultProductId, defaultProductCode, defaultProductDesc, units
}) => {
  const { user } = useAuth();
  const { tenantId, siteId } = useSiteContext();
  const [type, setType] = useState<AdjustmentType>(defaultType);
  const [submitting, setSubmitting] = useState(false);
  
  const [productId, setProductId] = useState(defaultProductId || '');
  const [productCode, setProductCode] = useState(defaultProductCode || '');
  const [productDesc, setProductDesc] = useState(defaultProductDesc || '');
  const [unitId, setUnitId] = useState('');
  
  const [locationId, setLocationId] = useState('');
  const [locationCode, setLocationCode] = useState('');
  
  const [toLocationId, setToLocationId] = useState('');
  const [toLocationCode, setToLocationCode] = useState('');
  
  const [quantity, setQuantity] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');

  useEffect(() => {
    if (isOpen) {
      setType(defaultType);
      setProductId(defaultProductId || '');
      setProductCode(defaultProductCode || '');
      setProductDesc(defaultProductDesc || '');
      setLocationId('');
      setLocationCode('');
      setToLocationId('');
      setToLocationCode('');
      setQuantity('');
      setReason('');
      setReference('');
      setUnitId(units.length > 0 ? units[0].id as string : '');
    }
  }, [isOpen, defaultType, defaultProductId, defaultProductCode, defaultProductDesc, units]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantity || quantity <= 0) {
      alert("Quantity must be greater than 0");
      return;
    }
    
    setSubmitting(true);
    let result;
    
    if (type === 'TRANSFER') {
      result = await transferInventory({
        tenantId,
        siteId,
        productId,
        productCodeSnapshot: productCode,
        descriptionSnapshot: productDesc,
        fromLocationId: locationId,
        fromLocationCodeSnapshot: locationCode,
        toLocationId,
        toLocationCodeSnapshot: toLocationCode,
        quantity: Number(quantity),
        unitOfMeasureId: unitId,
        reason,
        reference,
        performedBy: user?.name || 'System User'
      });
    } else {
      result = await adjustInventory({
        tenantId,
        siteId,
        productId,
        productCodeSnapshot: productCode,
        descriptionSnapshot: productDesc,
        locationId: type === 'DECREASE' ? locationId : (type === 'INCREASE' ? toLocationId : locationId),
        locationCodeSnapshot: type === 'DECREASE' ? locationCode : (type === 'INCREASE' ? toLocationCode : locationCode),
        quantity: Number(quantity),
        unitOfMeasureId: unitId,
        reason,
        reference,
        performedBy: user?.name || 'System User'
      }, type);
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
            Stock Adjustment
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 bg-slate-800/50 border-b border-slate-800">
          <div className="flex bg-slate-900 p-1 rounded-md">
            <button
              onClick={() => setType('INCREASE')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-colors ${type === 'INCREASE' ? 'bg-brand-500 text-slate-900' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
            >
              Increase
            </button>
            <button
              onClick={() => setType('DECREASE')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-colors ${type === 'DECREASE' ? 'bg-brand-500 text-slate-900' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
            >
              Decrease
            </button>
            <button
              onClick={() => setType('TRANSFER')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-colors ${type === 'TRANSFER' ? 'bg-brand-500 text-slate-900' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
            >
              Transfer
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-300">Product *</label>
              <ProductLookup 
                value={productId}
                onChange={(id, code, desc) => {
                  setProductId(id);
                  setProductCode(code);
                  setProductDesc(desc);
                }}
                disabled={!!defaultProductId}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <FormField 
                label="Quantity" 
                type="number"
                value={quantity} 
                onChange={(e) => setQuantity(e.target.value ? Number(e.target.value) : '')} 
                required 
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">Unit *</label>
                <select 
                  value={unitId} 
                  onChange={(e) => setUnitId(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                  required
                >
                  <option value="" disabled>Select unit</option>
                  {units.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {(type === 'DECREASE' || type === 'TRANSFER') && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">Source Location *</label>
                <LocationLookup 
                  value={locationId}
                  onChange={(id, code) => {
                    setLocationId(id);
                    setLocationCode(code);
                  }}
                />
              </div>
            )}

            {(type === 'INCREASE' || type === 'TRANSFER') && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">Destination Location *</label>
                <LocationLookup 
                  value={toLocationId}
                  onChange={(id, code) => {
                    setToLocationId(id);
                    setToLocationCode(code);
                  }}
                />
              </div>
            )}

            <FormField 
              label="Reason" 
              value={reason} 
              onChange={(e) => setReason(e.target.value)} 
              required 
            />
            
            <FormField 
              label="Reference" 
              value={reference} 
              onChange={(e) => setReference(e.target.value)} 
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
              disabled={submitting || !productId || ((type === 'DECREASE' || type === 'TRANSFER') && !locationId) || ((type === 'INCREASE' || type === 'TRANSFER') && !toLocationId)}
              className="px-4 py-2 text-sm font-medium text-slate-900 bg-brand-500 rounded-md hover:bg-brand-400 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Processing...' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useDevelopmentContext } from '../../../contexts/DevelopmentContext';
import { getProductProductionContext } from '../services/productionService';
import { ProductProductionContext, ProductionRiskStatus } from '../../../types/production';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Factory, AlertCircle, Clock } from 'lucide-react';
import { LoadingState } from '../../../components/ui/States';
import { subscribeToCollection } from '../../../services/firestoreBase';
import { collections } from '../../configuration/services/configurationService';
import { ProductionLine } from '../../../types/configuration';
import { where } from 'firebase/firestore';

interface ProductProductionContextPanelProps {
  productId: string;
}

export const ProductProductionContextPanel: React.FC<ProductProductionContextPanelProps> = ({ productId }) => {
  const { tenantId, siteId } = useDevelopmentContext();
  const [context, setContext] = useState<ProductProductionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<ProductionLine[]>([]);

  useEffect(() => {
    const unsubLines = subscribeToCollection<ProductionLine>(
      collections.PRODUCTION_LINES,
      [where('tenantId', '==', tenantId), where('siteId', '==', siteId)],
      setLines,
      console.error
    );
    return () => unsubLines();
  }, [tenantId, siteId]);

  useEffect(() => {
    let mounted = true;
    const fetchContext = async () => {
      setLoading(true);
      try {
        const result = await getProductProductionContext(tenantId, siteId, productId);
        if (mounted) {
          setContext(result);
        }
      } catch (err) {
        console.error('Failed to load production context:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    // In a real app we might subscribe to this, but context is derived from multiple events.
    // For now, simple fetch is enough or we could poll/refresh on demand.
    fetchContext();

    return () => { mounted = false; };
  }, [tenantId, siteId, productId]);

  if (loading) {
    return <div className="h-24"><LoadingState message="Loading context..." /></div>;
  }

  if (!context) {
    return null;
  }

  const getLineName = (id: string | null) => {
    if (!id) return '-';
    return lines.find(l => l.id === id)?.lineName || id;
  };

  const renderDate = (dateVal: Date | null) => {
    if (!dateVal) return '-';
    return dateVal.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getRiskBadge = (status: ProductionRiskStatus) => {
    switch(status) {
      case 'NORMAL': return <StatusBadge variant="completed" label="Normal" />;
      case 'DELAYED': return <StatusBadge variant="warning" label="Delayed" />;
      case 'STOPPED': return <StatusBadge variant="blocked" label="Stopped" />;
      case 'NO_FUTURE_RUN': return <StatusBadge variant="default" label="No Planned Runs" />;
      default: return <span className="text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="bg-slate-800/30 rounded-lg p-5 border border-slate-800">
      <h3 className="text-sm font-medium text-brand-400 border-b border-slate-800 pb-2 mb-4 flex items-center gap-2">
        <Factory className="w-4 h-4" />
        Production Context
      </h3>
      
      <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
        <div className="col-span-2 flex items-center justify-between mb-2">
          <span className="text-slate-300">Status</span>
          {context.isCurrentlyInProduction ? (
             <span className="flex items-center gap-1.5 text-brand-400 font-medium">
               <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-500"></span>
               </span>
               Currently Running
             </span>
          ) : (
            <span className="text-slate-500">Not Running</span>
          )}
        </div>

        <div>
          <dt className="text-slate-400 mb-1">Risk Status</dt>
          <dd>{getRiskBadge(context.productionRiskStatus)}</dd>
        </div>
        
        {context.isCurrentlyInProduction ? (
          <>
            <div>
              <dt className="text-slate-400 mb-1">Current Line</dt>
              <dd className="text-slate-100 font-medium">{getLineName(context.currentLine)}</dd>
            </div>
            <div>
              <dt className="text-slate-400 mb-1">Expected Finish</dt>
              <dd className="text-slate-100 font-medium">{renderDate(context.currentExpectedFinish)}</dd>
            </div>
          </>
        ) : context.nextProductionEvent ? (
          <>
            <div>
              <dt className="text-slate-400 mb-1">Next Run</dt>
              <dd className="text-slate-100 font-medium">{renderDate(context.nextProductionStart)}</dd>
            </div>
            <div>
              <dt className="text-slate-400 mb-1">Time to Run</dt>
              <dd className="text-slate-100 font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                {context.hoursUntilNextProduction !== null ? `${context.hoursUntilNextProduction}h` : '-'}
              </dd>
            </div>
          </>
        ) : (
          <div className="col-span-2 flex items-start gap-2 p-3 bg-slate-800 rounded mt-2">
            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-300">
              There is no active production and no future runs planned for this product. If inventory falls short, it will not be replenished organically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

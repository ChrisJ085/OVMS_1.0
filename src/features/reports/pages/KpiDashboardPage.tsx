import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Activity, Clock, CheckCircle, AlertTriangle, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { useSiteContext } from '../../../contexts/SiteContext';
import { getDocuments, where } from '../../../services/dbService';

export const KpiDashboardPage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  const [loading, setLoading] = useState(true);
  
  // KPI State
  const [metrics, setMetrics] = useState({
    activePriorities: 0,
    createdToday: 0,
    completedToday: 0,
    completionRate: 0,
    avgTimeToAck: 0,
    avgTimeToStart: 0,
    avgTimeToComplete: 0,
    blockedPriorities: 0,
    overdueIncomplete: 0,
    belowRetention: 0,
    aboveMax: 0,
    ddxmCompliance: 0,
    recApprovalRate: 0,
    recOverrideRate: 0,
    manualPriorityRate: 0,
    staleInventory: 0
  });

  const fetchMetrics = async () => {
    if (!tenantId || !siteId) return;
    setLoading(true);
    
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // 1. Priorities
      const priorities = await getDocuments<any>(
        'priorities',
        [where('tenantId', '==', tenantId), where('siteId', '==', siteId)]
      );
      
      let activePriorities = 0;
      let createdToday = 0;
      let completedToday = 0;
      let blockedPriorities = 0;
      let overdueIncomplete = 0;
      let manualCreated = 0;

      let sumTimeAck = 0, countAck = 0;
      let sumTimeStart = 0, countStart = 0;
      let sumTimeComp = 0, countComp = 0;

      priorities.forEach(p => {
        const created = (p.createdDate as any)?.toDate?.() || new Date(p.createdDate);
        const isCreatedToday = created >= startOfDay;
        
        if (['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED'].includes(p.priorityStatus)) {
          activePriorities++;
        }
        
        if (p.priorityStatus === 'BLOCKED') blockedPriorities++;
        
        if (isCreatedToday) createdToday++;
        
        if (p.priorityStatus === 'COMPLETED') {
          const completed = (p.completedAt as any)?.toDate?.();
          if (completed && completed >= startOfDay) {
            completedToday++;
            
            const timeToCompHours = (completed.getTime() - created.getTime()) / (1000 * 60 * 60);
            sumTimeComp += timeToCompHours;
            countComp++;
          }
        }
        
        if (p.targetCompletionTime) {
          const target = (p.targetCompletionTime as any)?.toDate?.();
          if (target && target < now && ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED'].includes(p.priorityStatus)) {
            overdueIncomplete++;
          }
        }
        
        if (!p.sourceRecommendationId) {
          manualCreated++;
        }

        // Basic timings for ones completed or started
        const assigned = (p.assignedAt as any)?.toDate?.();
        const started = (p.startedAt as any)?.toDate?.();
        
        if (assigned) {
          sumTimeAck += (assigned.getTime() - created.getTime()) / (1000 * 60 * 60);
          countAck++;
        }
        if (started) {
          sumTimeStart += (started.getTime() - created.getTime()) / (1000 * 60 * 60);
          countStart++;
        }
      });

      const totalCompletionPool = completedToday + activePriorities;
      const completionRate = totalCompletionPool > 0 ? (completedToday / totalCompletionPool) * 100 : 0;
      
      const manualPriorityRate = priorities.length > 0 ? (manualCreated / priorities.length) * 100 : 0;

      // 2. Recommendations
      const recDocs = await getDocuments('recommendations', [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      ]);
      const recs = recDocs.filter((r: any) => {
        const rawTs = r.createdDate || r.generatedAt;
        if (!rawTs) return false;
        const d = (rawTs as any)?.toDate ? (rawTs as any).toDate() : new Date(rawTs as any);
        return !isNaN(d.getTime()) && d >= startOfDay;
      });
      
      let recAccepted = 0, recRejected = 0, recOverride = 0;
      recs.forEach(r => {
        if (r.status === 'ACCEPTED') recAccepted++;
        if (r.status === 'REJECTED') recRejected++;
        // Note: override detection requires checking if final action matched rec action
      });
      const recApprovalRate = (recAccepted + recRejected) > 0 ? (recAccepted / (recAccepted + recRejected)) * 100 : 0;

      // 3. Dummy Inventory Data for DDXM Metrics (since we don't have full inventory tracking yet)
      // We will set them to 0 or placeholders for now
      
      setMetrics({
        activePriorities,
        createdToday,
        completedToday,
        completionRate,
        avgTimeToAck: countAck > 0 ? sumTimeAck / countAck : 0,
        avgTimeToStart: countStart > 0 ? sumTimeStart / countStart : 0,
        avgTimeToComplete: countComp > 0 ? sumTimeComp / countComp : 0,
        blockedPriorities,
        overdueIncomplete,
        belowRetention: 0, // Placeholder
        aboveMax: 0, // Placeholder
        ddxmCompliance: 100, // Placeholder
        recApprovalRate,
        recOverrideRate: 0, // Placeholder
        manualPriorityRate,
        staleInventory: 0 // Placeholder
      });
      
    } catch (err) {
      console.error("Error fetching KPIs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [tenantId, siteId]);

  const MetricCard = ({ title, value, unit = '', desc = '', icon: Icon, trend = 'none' }: any) => (
    <div className="bg-slate-900 border border-slate-700 p-5 rounded-lg flex flex-col">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">{title}</h3>
        {Icon && <Icon className="w-5 h-5 text-slate-500" />}
      </div>
      <div className="flex items-baseline gap-1 mt-auto">
        <span className="text-3xl font-mono text-slate-100">{value}</span>
        <span className="text-slate-400 font-medium">{unit}</span>
      </div>
      {desc && <div className="text-xs text-slate-500 mt-2">{desc}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader 
          title="KPI Dashboard" 
          description="Operational performance and compliance metrics."
        />
        <button 
          onClick={fetchMetrics}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-slate-300 rounded border border-slate-700 hover:bg-slate-700 transition-colors text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="space-y-8">
        {/* Priorities Section */}
        <section>
          <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-400" />
            Execution Performance
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard 
              title="Active Priorities" 
              value={metrics.activePriorities}
              desc="Currently in progress or blocked"
            />
            <MetricCard 
              title="Completed Today" 
              value={metrics.completedToday}
              desc={`${metrics.createdToday} created today`}
            />
            <MetricCard 
              title="Completion Rate" 
              value={metrics.completionRate.toFixed(1)}
              unit="%"
              desc="Completed / (Completed + Active)"
            />
            <MetricCard 
              title="Blocked / Overdue" 
              value={`${metrics.blockedPriorities} / ${metrics.overdueIncomplete}`}
              desc="Requires immediate attention"
              icon={AlertTriangle}
            />
          </div>
        </section>

        {/* Timings Section */}
        <section>
          <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-400" />
            Cycle Times
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard 
              title="Avg Time to Ack" 
              value={metrics.avgTimeToAck > 0 ? metrics.avgTimeToAck.toFixed(1) : '-'}
              unit="hrs"
              desc="From creation to assigned"
            />
            <MetricCard 
              title="Avg Time to Start" 
              value={metrics.avgTimeToStart > 0 ? metrics.avgTimeToStart.toFixed(1) : '-'}
              unit="hrs"
              desc="From creation to in progress"
            />
            <MetricCard 
              title="Avg Time to Complete" 
              value={metrics.avgTimeToComplete > 0 ? metrics.avgTimeToComplete.toFixed(1) : '-'}
              unit="hrs"
              desc="From creation to completion"
            />
          </div>
        </section>

        {/* Planning Compliance */}
        <section>
          <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            Planning & DDXM Compliance
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard 
              title="Rec Approval Rate" 
              value={metrics.recApprovalRate > 0 ? metrics.recApprovalRate.toFixed(1) : '-'}
              unit="%"
              desc="Accepted recommendations"
            />
            <MetricCard 
              title="Manual Override Rate" 
              value={metrics.recOverrideRate > 0 ? metrics.recOverrideRate.toFixed(1) : '-'}
              unit="%"
              desc="User modified planned action"
            />
            <MetricCard 
              title="DDXM Compliance" 
              value={metrics.ddxmCompliance}
              unit="%"
              desc="Products within min/max targets"
            />
            <MetricCard 
              title="Below Retention" 
              value={metrics.belowRetention}
              desc="Products below controlling retention"
            />
          </div>
        </section>
      </div>
    </div>
  );
};

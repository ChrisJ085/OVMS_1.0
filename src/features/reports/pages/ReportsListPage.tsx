import React, { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Download, FileText, Calendar, Filter } from 'lucide-react';
import { useSiteContext } from '../../../contexts/SiteContext';
import { getDocuments, where } from '../../../services/dbService';

type ReportType = 'PRIORITY_PERFORMANCE' | 'DDXM_STOCK' | 'RECOMMENDATION_OVERRIDE' | 'INVENTORY_MOVEMENT' | 'EXCEPTION_REPORT' | 'PRODUCTION_CONTEXT';

export const ReportsListPage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  
  const [selectedReport, setSelectedReport] = useState<ReportType>('PRIORITY_PERFORMANCE');
  
  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() - 7);
  const [startDate, setStartDate] = useState(defaultStart.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [productCode, setProductCode] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportColumns, setReportColumns] = useState<string[]>([]);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const runReport = async () => {
    if (!tenantId || !siteId) return;
    setLoading(true);
    setReportData([]);
    setGeneratedAt(null);
    
    try {
      const startMs = new Date(startDate + 'T00:00:00').getTime();
      const endMs = new Date(endDate + 'T23:59:59').getTime();
      
      let data: any[] = [];
      let cols: string[] = [];
      
      if (selectedReport === 'PRIORITY_PERFORMANCE') {
        const priorities = await getDocuments<any>(
          'priorities',
          [where('tenantId', '==', tenantId), where('siteId', '==', siteId)]
        );
        
        cols = ['ID', 'Level', 'Status', 'Product', 'Assigned To', 'Created', 'Completed', 'Cycle Time (hrs)'];
        data = priorities.map(d => {
          const created = new Date(d.createdDate as any);
          const cMs = created.getTime();
          if (isNaN(cMs) || cMs < startMs || cMs > endMs) return null;

          const pCode = d.productCodeSnapshot || '-';
          if (productCode && !pCode.toLowerCase().includes(productCode.toLowerCase())) return null;
          
          const comp = d.completedAt ? new Date(d.completedAt) : null;
          let cycleTime = '-';
          if (comp) {
            cycleTime = ((comp.getTime() - created.getTime()) / (1000 * 60 * 60)).toFixed(2);
          }
          
          return {
            ID: d.id,
            Level: d.priorityLevelId,
            Status: d.priorityStatus,
            Product: pCode,
            'Assigned To': d.assignedUserId || '-',
            Created: created.toLocaleString(),
            Completed: comp ? comp.toLocaleString() : '-',
            'Cycle Time (hrs)': cycleTime
          };
        }).filter(Boolean);
      } else if (selectedReport === 'EXCEPTION_REPORT') {
        const exceptions = await getDocuments<any>(
          'exceptions',
          [where('tenantId', '==', tenantId), where('siteId', '==', siteId)]
        );
        
        cols = ['ID', 'Type', 'Severity', 'Status', 'Entity', 'Message', 'Created'];
        data = exceptions.map(d => {
          const created = new Date(d.createdDate as any);
          const cMs = created.getTime();
          if (isNaN(cMs) || cMs < startMs || cMs > endMs) return null;
          return {
            ID: d.id,
            Type: d.exceptionType,
            Severity: d.severity,
            Status: d.exceptionStatus,
            Entity: `${d.entityType}:${d.entityId}`,
            Message: d.message,
            Created: created.toLocaleString()
          };
        });
      } else {
        // Placeholder for other reports
        cols = ['Status', 'Message'];
        data = [{ Status: 'Pending Implementation', Message: `${selectedReport} is not fully implemented in this phase.` }];
      }

      setReportColumns(cols);
      setReportData(data);
      setGeneratedAt(new Date());
    } catch (err) {
      console.error(err);
      alert('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (reportData.length === 0 || reportColumns.length === 0) return;
    
    // Create CSV content
    const headers = reportColumns.join(',');
    const rows = reportData.map(row => {
      return reportColumns.map(col => {
        let val = row[col] || '';
        // Escape quotes and wrap in quotes if contains comma
        if (typeof val === 'string') {
          val = val.replace(/"/g, '""');
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            val = `"${val}"`;
          }
        }
        return val;
      }).join(',');
    });
    
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ovms_${selectedReport.toLowerCase()}_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)]">
      <PageHeader 
        title="Reports" 
        description="Generate and export operational reports."
      />
      
      <div className="bg-slate-900 border border-slate-700 p-4 rounded-lg flex flex-col md:flex-row gap-4 flex-shrink-0">
        <select 
          value={selectedReport}
          onChange={e => setSelectedReport(e.target.value as ReportType)}
          className="bg-slate-950 border-slate-700 rounded-md text-sm text-slate-200"
        >
          <option value="PRIORITY_PERFORMANCE">Priority Performance Report</option>
          <option value="DDXM_STOCK">DDXM / Stock Position Report</option>
          <option value="RECOMMENDATION_OVERRIDE">Recommendation & Override Report</option>
          <option value="INVENTORY_MOVEMENT">Inventory Movement Report</option>
          <option value="EXCEPTION_REPORT">Exception Report</option>
          <option value="PRODUCTION_CONTEXT">Production & Promotion Context Report</option>
        </select>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input 
            type="date" 
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-slate-950 border-slate-700 rounded-md text-sm text-slate-200"
          />
          <span className="text-slate-500">to</span>
          <input 
            type="date" 
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="bg-slate-950 border-slate-700 rounded-md text-sm text-slate-200"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Product (Optional)"
            value={productCode}
            onChange={e => setProductCode(e.target.value)}
            className="bg-slate-950 border-slate-700 rounded-md text-sm text-slate-200 w-40"
          />
        </div>

        <button 
          onClick={runReport}
          disabled={loading}
          className="ml-auto px-4 py-2 bg-brand-500 text-slate-900 rounded-md font-medium text-sm hover:bg-brand-400 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          {loading ? 'Running...' : 'Generate Report'}
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-lg flex flex-col flex-1 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-slate-200">Report Results</h3>
            {generatedAt && (
              <p className="text-xs text-slate-500 mt-1">
                Generated {generatedAt.toLocaleString()} | {reportData.length} records
              </p>
            )}
          </div>
          <button 
            onClick={exportCsv}
            disabled={reportData.length === 0}
            className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded border border-slate-700 hover:bg-slate-700 transition-colors disabled:opacity-50 text-sm flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          {reportData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              {generatedAt ? 'No data found for the selected criteria.' : 'Select criteria and click Generate Report.'}
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0">
                <tr>
                  {reportColumns.map(col => (
                    <th key={col} className="px-4 py-3 font-medium bg-slate-900">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {reportData.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                    {reportColumns.map(col => (
                      <td key={col} className="px-4 py-2 text-slate-300">{row[col]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

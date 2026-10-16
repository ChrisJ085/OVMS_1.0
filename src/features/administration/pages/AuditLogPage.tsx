import React, { useState, useEffect } from 'react';
import { AuditEvent, RecommendationAuditSnapshot } from '../../../types/audit';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { DataTable } from '../../../components/ui/DataTable';
import { useSiteContext } from '../../../contexts/SiteContext';
import { FileText, ChevronRight, X, Clock, CheckCircle2, AlertTriangle, Layers, Activity, ChevronDown, ChevronUp, FileSpreadsheet, Package, ShieldCheck } from 'lucide-react';
import { supabase } from '../../../config/supabase';
import { toCamelCase } from '../../../utils/caseTransformers';

export const AuditLogPage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAudit, setSelectedAudit] = useState<AuditEvent | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSnapshotIdx, setExpandedSnapshotIdx] = useState<number | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      if (!tenantId || !siteId) return;
      setLoading(true);
      try {
        let query = supabase.from('audit_logs').select('*');
        if (tenantId !== 'GLOBAL') {
          query = query.eq('tenant_id', tenantId);
        }
        if (siteId !== 'GLOBAL') {
          query = query.eq('site_id', siteId);
        }
        const { data, error } = await query
          .order('timestamp', { ascending: false })
          .limit(100);

        if (error) throw error;
        setLogs((data || []).map(row => toCamelCase<AuditEvent>(row)));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [tenantId, siteId]);

  const columns: any[] = [
    {
      header: 'Timestamp',
      accessor: (row: AuditEvent) => {
        if (!row.timestamp) return '-';
        const date = row.timestamp.toDate ? row.timestamp.toDate() : new Date(row.timestamp);
        return date.toLocaleString();
      }
    },
    { 
      header: 'Event Type', 
      accessor: (row: AuditEvent) => (
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
          row.eventType === 'RECOMMENDATIONS_GENERATED' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-slate-700/50 text-slate-300'
        }`}>
          {row.eventType}
        </span>
      )
    },
    { header: 'Entity', accessor: (row: AuditEvent) => `${row.entityType}: ${row.entityId}` },
    { header: 'Summary', accessor: 'summary' },
    { header: 'Performed By', accessor: (row: AuditEvent) => row.performedByName || row.performedBy },
    {
      header: 'Actions',
      accessor: (row: AuditEvent) => row.recommendationSnapshots && row.recommendationSnapshots.length > 0 ? (
        <button
          onClick={() => setSelectedAudit(row)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-md border border-indigo-500/20 transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          View Snapshots ({row.recommendationSnapshots.length})
        </button>
      ) : (
        <span className="text-slate-500 text-xs">No snapshots</span>
      )
    }
  ];

  const filteredSnapshots = selectedAudit?.recommendationSnapshots?.filter(s => 
    s.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.productDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.instruction.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Audit Log" 
        description="View a read-only history of material configuration and operational changes, including recommendation generation snapshots."
      />
      
      <SectionCard title="Recent Audit Events">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading audit logs...</div>
        ) : error ? (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md">
            {error}
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={logs}
            keyExtractor={(row: any) => row.id!}
            emptyMessage="No audit logs found for this site."
          />
        )}
      </SectionCard>

      {/* Detail Modal for Recommendation Generation Snapshots */}
      {selectedAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Recommendation Generation Audit Details</h3>
                  <p className="text-xs text-slate-400">Generation ID: {selectedAudit.generationId || selectedAudit.id}</p>
                </div>
              </div>
              <button
                onClick={() => { setSelectedAudit(null); setSearchTerm(''); }}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className="text-xs text-slate-400 font-medium">Status</div>
                  <div className="text-base font-semibold text-white mt-1 flex items-center gap-1.5">
                    {selectedAudit.generationStatus === 'COMPLETED' ? (
                      <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Completed</span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {selectedAudit.generationStatus || 'FAILED'}</span>
                    )}
                  </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className="text-xs text-slate-400 font-medium">Duration</div>
                  <div className="text-base font-semibold text-white mt-1 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-indigo-400" />
                    {selectedAudit.generationDurationMs ? `${(selectedAudit.generationDurationMs / 1000).toFixed(2)}s` : 'N/A'}
                  </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className="text-xs text-slate-400 font-medium">Candidates Evaluated</div>
                  <div className="text-base font-semibold text-white mt-1">{selectedAudit.candidateProductsCount ?? 0}</div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className="text-xs text-slate-400 font-medium">Actionable Recs</div>
                  <div className="text-base font-semibold text-indigo-400 mt-1">{selectedAudit.actionableRecommendationsCount ?? 0}</div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                  <div className="text-xs text-slate-400 font-medium">Priorities Created</div>
                  <div className="text-base font-semibold text-emerald-400 mt-1">{selectedAudit.operationalPrioritiesCreatedCount ?? 0}</div>
                </div>
              </div>

              {selectedAudit.errorMessage && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">
                  <strong>Error:</strong> {selectedAudit.errorMessage}
                </div>
              )}

              {/* Snapshots Table Section */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    Recommendation Snapshots ({selectedAudit.recommendationSnapshots?.length || 0})
                  </h4>
                  <div className="w-full sm:w-72">
                    <input
                      type="text"
                      placeholder="Search product, code, action..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="border border-slate-700/60 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-xs text-left text-slate-300">
                      <thead className="bg-slate-800 text-slate-400 uppercase font-medium sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3">Product</th>
                          <th className="px-4 py-3">Action</th>
                          <th className="px-4 py-3">Qty</th>
                          <th className="px-4 py-3">Destination</th>
                          <th className="px-4 py-3">Priority</th>
                          <th className="px-4 py-3">Instruction / Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {filteredSnapshots.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                              No snapshots match the search filter.
                            </td>
                          </tr>
                        ) : (
                          filteredSnapshots.map((snap, idx) => {
                            const isExpanded = expandedSnapshotIdx === idx;
                            return (
                              <React.Fragment key={idx}>
                                <tr 
                                  onClick={() => setExpandedSnapshotIdx(isExpanded ? null : idx)}
                                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                                >
                                  <td className="px-4 py-3 font-medium text-white">
                                    <div className="flex items-center gap-1.5">
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-indigo-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                                      <div>{snap.productCode}</div>
                                    </div>
                                    <div className="text-slate-400 text-[11px] truncate max-w-xs ml-5">{snap.productDescription}</div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 rounded font-semibold border border-indigo-500/20">
                                      {snap.action}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 font-semibold text-white">
                                    {snap.requestedQuantity} <span className="text-slate-400 font-normal">{snap.quantityUnit}</span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-300">
                                    {snap.destinationName || snap.destinationCode || 'N/A'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="px-2 py-0.5 bg-slate-800 text-slate-200 rounded border border-slate-700">
                                      {snap.priorityLevel}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-300 space-y-1">
                                    <div className="font-medium">{snap.instruction}</div>
                                    {snap.reason && <div className="text-slate-400 text-[11px]">{snap.reason}</div>}
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr className="bg-slate-950/60 border-t border-b border-indigo-500/20">
                                    <td colSpan={6} className="p-4 space-y-3">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                                        {/* 1. Inventory Seen */}
                                        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg space-y-1">
                                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Package className="w-3.5 h-3.5 text-blue-400" /> Inventory Seen
                                          </div>
                                          <div className="text-lg font-bold text-white font-mono">
                                            {snap.inventorySnapshot?.totalCases ?? snap.decisionContext?.inventoryTotal ?? 0} cs
                                          </div>
                                          <div className="text-[11px] text-slate-500">
                                            {snap.inventorySnapshot?.updatedAt ? `Updated ${new Date(snap.inventorySnapshot.updatedAt).toLocaleTimeString()}` : 'Snapshot at run time'}
                                          </div>
                                        </div>

                                        {/* 2. SNP87 Forecast */}
                                        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg space-y-1">
                                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" /> SNP87 Forecast
                                          </div>
                                          <div className="text-sm font-semibold text-slate-200">
                                            Today: <span className="font-mono text-white">{snap.snp87SourceSnapshot?.forecastCasesToday ?? 0}</span> cs
                                          </div>
                                          <div className="text-sm font-semibold text-slate-200">
                                            7 Days: <span className="font-mono text-white">{snap.snp87SourceSnapshot?.forecastCasesNext7Days ?? snap.decisionContext?.snp87ForecastCases7Days ?? 0}</span> cs
                                          </div>
                                        </div>

                                        {/* 3. SNP87 Confirmed Supply */}
                                        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg space-y-1">
                                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Activity className="w-3.5 h-3.5 text-emerald-400" /> Confirmed Production
                                          </div>
                                          <div className="text-sm font-semibold text-slate-200">
                                            Today: <span className="font-mono text-white">{snap.snp87SourceSnapshot?.confirmedProductionCasesToday ?? 0}</span> cs
                                          </div>
                                          <div className="text-sm font-semibold text-slate-200">
                                            7 Days: <span className="font-mono text-white">{snap.snp87SourceSnapshot?.confirmedProductionCasesNext7Days ?? snap.decisionContext?.snp87ConfirmedProductionCases7Days ?? 0}</span> cs
                                          </div>
                                        </div>

                                        {/* 4. Northfleet STO Protected */}
                                        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg space-y-1">
                                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Northfleet Protected
                                          </div>
                                          <div className="text-lg font-bold text-amber-400 font-mono">
                                            {snap.northfleetProtectionSnapshot?.outstandingCases ?? snap.decisionContext?.outstandingStoCases ?? 0} cs
                                          </div>
                                          <div className="text-[11px] text-slate-500">
                                            {snap.northfleetProtectionSnapshot?.requirementCount ? `${snap.northfleetProtectionSnapshot.requirementCount} active STOs` : 'Protected requirement'}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Source & Configuration Footprint */}
                                      <div className="bg-slate-900/60 border border-slate-800/80 p-3 rounded-lg flex flex-wrap items-center justify-between text-xs gap-3">
                                        <div className="space-y-0.5">
                                          <span className="text-slate-400 font-medium">SNP87 Source: </span>
                                          <span className="text-slate-200 font-semibold">{snap.snp87SourceSnapshot?.sourceReportName || 'SNP87 Report'}</span>
                                          <span className="text-slate-500 ml-1.5">({snap.snp87SourceSnapshot?.sourceImportId ? `Import ID: ${snap.snp87SourceSnapshot.sourceImportId}` : 'Snapshot ID'})</span>
                                          <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                            (snap.snp87SourceSnapshot?.dataFreshnessStatus || snap.decisionContext?.snp87Freshness) === 'FRESH'
                                              ? 'bg-emerald-500/20 text-emerald-400'
                                              : (snap.snp87SourceSnapshot?.dataFreshnessStatus || snap.decisionContext?.snp87Freshness) === 'STALE'
                                              ? 'bg-amber-500/20 text-amber-400'
                                              : 'bg-red-500/20 text-red-400'
                                          }`}>
                                            {snap.snp87SourceSnapshot?.dataFreshnessStatus || snap.decisionContext?.snp87Freshness || 'FRESH'}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
                                          <div>Preferred Dest: <span className="text-slate-200">{snap.configurationSnapshot?.preferredDestinationName || snap.destinationName || 'None'}</span></div>
                                          <div>Generation: <span className="text-indigo-300">{snap.generationId || selectedAudit.generationId || 'N/A'}</span></div>
                                          <div>Fingerprint: <span className="text-slate-300">{snap.fingerprint || snap.sourceFingerprint || 'N/A'}</span></div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end px-6 py-4 border-t border-slate-800 bg-slate-800/40">
              <button
                onClick={() => { setSelectedAudit(null); setSearchTerm(''); }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


import React, { useState } from 'react';
import { ProductionLine } from '../../../types/configuration';
import { addSapAliasToLine, createProductionLineFromImport, CreateProductionLineInput } from '../services/productionLineMappingService';
import { AlertCircle, CheckCircle2, Plus, X } from 'lucide-react';

interface MissingProductionLineResolutionProps {
  sapResourceCode: string;
  affectedRows: {
    productCode: string;
    sourceProductDescription: string;
    productionDate: any;
    plannedQuantity: number;
  }[];
  existingLines: ProductionLine[];
  tenantId: string;
  siteId: string;
  userProfileName: string;
  onClose: () => void;
  onResolved: () => void;
}

export const MissingProductionLineResolution: React.FC<MissingProductionLineResolutionProps> = ({
  sapResourceCode,
  affectedRows,
  existingLines,
  tenantId,
  siteId,
  userProfileName,
  onClose,
  onResolved
}) => {
  const [mode, setMode] = useState<'MAP_EXISTING' | 'CREATE_NEW'>('MAP_EXISTING');
  
  // MAP_EXISTING state
  const [selectedLineId, setSelectedLineId] = useState<string>('');

  // CREATE_NEW state
  const [lineCode, setLineCode] = useState<string>(sapResourceCode.toUpperCase());
  const [lineName, setLineName] = useState<string>('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    setSubmitting(true);

    if (mode === 'MAP_EXISTING') {
      if (!selectedLineId) {
        setError('Please select an existing production line to alias.');
        setSubmitting(false);
        return;
      }

      const res = await addSapAliasToLine(selectedLineId, sapResourceCode, tenantId, siteId, userProfileName);
      setSubmitting(false);
      if (res.success) {
        onResolved();
      } else {
        setError(res.error || 'Failed to map SAP alias to line.');
      }
    } else {
      if (!lineCode.trim()) {
        setError('Production line code is required.');
        setSubmitting(false);
        return;
      }
      if (!lineName.trim()) {
        setError('Production line name is required.');
        setSubmitting(false);
        return;
      }

      const input: CreateProductionLineInput = {
        lineCode: lineCode.trim().toUpperCase(),
        lineName: lineName.trim(),
        sapResourceCode: sapResourceCode.trim().toUpperCase(),
        sapResourceAliases: [sapResourceCode.trim().toUpperCase()],
        status
      };

      const res = await createProductionLineFromImport(input, tenantId, siteId, userProfileName);
      setSubmitting(false);
      if (res.success) {
        onResolved();
      } else {
        setError(res.error || 'Failed to create production line.');
      }
    }
  };

  const totalCasesAffected = affectedRows.reduce((acc, r) => acc + (r.plannedQuantity || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 shadow-2xl text-slate-100 my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Resolve Unknown Production Line</h3>
            <p className="text-xs text-slate-400">
              SAP Resource Code <strong className="text-cyan-400 font-mono">{sapResourceCode}</strong> is not configured.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Impact warning */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4 text-xs text-amber-300">
          <div className="font-semibold mb-1 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            Impact on Current Import
          </div>
          <div>
            This resource code affects <strong>{affectedRows.length} import rows</strong> with a total volume of{' '}
            <strong>{totalCasesAffected.toLocaleString()} cases</strong>.
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Mode Selector */}
        <div className="flex border-b border-slate-800 mb-4">
          <button
            type="button"
            onClick={() => setMode('MAP_EXISTING')}
            className={`pb-2 px-4 text-xs font-medium border-b-2 transition-colors ${
              mode === 'MAP_EXISTING'
                ? 'border-cyan-500 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Map to Existing Line (Add Alias)
          </button>
          <button
            type="button"
            onClick={() => setMode('CREATE_NEW')}
            className={`pb-2 px-4 text-xs font-medium border-b-2 transition-colors ${
              mode === 'CREATE_NEW'
                ? 'border-cyan-500 text-cyan-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Create New Production Line
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'MAP_EXISTING' ? (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Select Existing Production Line <span className="text-red-400">*</span>
              </label>
              <select
                value={selectedLineId}
                onChange={e => setSelectedLineId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                required
              >
                <option value="">-- Choose Line --</option>
                {existingLines.map(line => (
                  <option key={line.id} value={line.id}>
                    {line.lineCode} - {line.lineName} (SAP Code: {line.sapResourceCode || 'None'})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-2">
                This will save <span className="font-mono text-cyan-400">{sapResourceCode}</span> as an explicit SAP resource alias for the selected line.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Line Code <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={lineCode}
                    onChange={e => setLineCode(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    SAP Resource Code <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={sapResourceCode}
                    disabled
                    className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-400 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Line Display Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={lineName}
                  onChange={e => setLineName(e.target.value)}
                  placeholder="e.g. Packing Line 1"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Line Status</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting
                ? 'Saving Line Mapping...'
                : mode === 'MAP_EXISTING'
                ? 'Add Alias & Revalidate'
                : 'Create Line & Revalidate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

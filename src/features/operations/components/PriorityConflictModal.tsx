import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, ShieldAlert, X, ArrowRight, User, Sparkles } from 'lucide-react';
import { PriorityConflict, ConflictResolutionChoice } from '../../../types/priority';
import { resolveAllPriorityConflicts } from '../services/priorityService';
import { useAuth } from '../../auth/context/AuthContext';
import { ActionType, Destination, PriorityLevel } from '../../../types/configuration';
import { getActionTypeLabel, getDestinationLabel, getPriorityLevelLabel } from '../utils/priorityFormatters';

interface PriorityConflictModalProps {
  isOpen: boolean;
  tenantId: string;
  siteId: string;
  conflicts: PriorityConflict[];
  actionTypes?: ActionType[];
  destinations?: Destination[];
  priorityLevels?: PriorityLevel[];
  onClose: () => void;
  onResolved: () => void;
}

export const PriorityConflictModal: React.FC<PriorityConflictModalProps> = ({
  isOpen,
  tenantId,
  siteId,
  conflicts,
  actionTypes = [],
  destinations = [],
  priorityLevels = [],
  onClose,
  onResolved,
}) => {
  const { userProfile, currentUser } = useAuth();
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolutionChoice>>(() => {
    const initial: Record<string, ConflictResolutionChoice> = {};
    conflicts.forEach((c) => {
      // Default to keeping manual priority unless planner changes it
      initial[c.id] = 'KEEP_MANUAL_IGNORE_SYSTEM';
    });
    return initial;
  });

  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || conflicts.length === 0) return null;

  const handleSelectChoice = (conflictId: string, choice: ConflictResolutionChoice) => {
    setResolutions((prev) => ({
      ...prev,
      [conflictId]: choice,
    }));
  };

  const handleSelectAll = (choice: ConflictResolutionChoice) => {
    const updated: Record<string, ConflictResolutionChoice> = {};
    conflicts.forEach((c) => {
      updated[c.id] = choice;
    });
    setResolutions(updated);
  };

  const handleApplyResolutions = async () => {
    setSubmitting(true);
    try {
      const itemsToResolve = conflicts.map((c) => ({
        manualPriorityId: c.manualPriority.id,
        systemPriorityId: c.systemPriority.id,
        resolution: resolutions[c.id] || 'KEEP_MANUAL_IGNORE_SYSTEM',
      }));

      const res = await resolveAllPriorityConflicts(
        tenantId,
        siteId,
        itemsToResolve,
        userProfile?.displayName || userProfile?.email || currentUser || 'Planner'
      );

      if (res.success) {
        onResolved();
        onClose();
      } else {
        alert(`Failed to resolve conflicts: ${res.error}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Error resolving priority conflicts: ${e?.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">
                  Operational Priority Conflicts ({conflicts.length})
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                A new Recommendation Workspace generation created system-driven priorities that match existing manually created operational priorities. Choose whether to replace the manual priority or keep the manual priority and ignore the system recommendation.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Selection Toolbar */}
        <div className="px-6 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-slate-400 font-medium">Batch Quick Select:</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSelectAll('KEEP_MANUAL_IGNORE_SYSTEM')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 font-semibold transition-colors flex items-center gap-1.5"
            >
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span>Keep All Manual Priorities</span>
            </button>
            <button
              onClick={() => handleSelectAll('REPLACE_MANUAL_WITH_SYSTEM')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 font-semibold transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Replace All with System Recommendations</span>
            </button>
          </div>
        </div>

        {/* Conflicts List */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-950/40">
          {conflicts.map((conflict, idx) => {
            const manual = conflict.manualPriority;
            const system = conflict.systemPriority;
            const currentChoice = resolutions[conflict.id] || 'KEEP_MANUAL_IGNORE_SYSTEM';

            const manualAction = getActionTypeLabel(manual.actionTypeId, actionTypes, manual.actionTypeLabel);
            const manualDest = getDestinationLabel(manual.destinationId, destinations, manual.destinationLabel);
            const manualLevel = getPriorityLevelLabel(manual.priorityLevelId, priorityLevels, manual.priorityLevelLabel);

            const systemAction = getActionTypeLabel(system.actionTypeId, actionTypes, system.actionTypeLabel);
            const systemDest = getDestinationLabel(system.destinationId, destinations, system.destinationLabel);
            const systemLevel = getPriorityLevelLabel(system.priorityLevelId, priorityLevels, system.priorityLevelLabel);

            return (
              <div
                key={conflict.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-md"
              >
                {/* Conflict Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold bg-slate-800 text-slate-200 px-2.5 py-1 rounded border border-slate-700">
                      #{idx + 1} SKU: {conflict.productCodeSnapshot}
                    </span>
                    <span className="text-sm font-semibold text-slate-200 truncate max-w-md">
                      {conflict.descriptionSnapshot}
                    </span>
                  </div>
                  <span className="text-xs text-amber-400 font-mono font-semibold bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                    Conflict Identified
                  </span>
                </div>

                {/* Comparison Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Manual Priority Box */}
                  <div
                    onClick={() => handleSelectChoice(conflict.id, 'KEEP_MANUAL_IGNORE_SYSTEM')}
                    className={`p-4 rounded-lg border-2 transition-all cursor-pointer relative ${
                      currentChoice === 'KEEP_MANUAL_IGNORE_SYSTEM'
                        ? 'border-blue-500 bg-blue-950/20 shadow-lg shadow-blue-950/30'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5 uppercase tracking-wider">
                        <User className="w-3.5 h-3.5 text-blue-400" />
                        <span>Manually Created Priority</span>
                      </span>
                      {currentChoice === 'KEEP_MANUAL_IGNORE_SYSTEM' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-500 text-slate-950 rounded-full flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Selected (Keep Manual)
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-300">
                      <div>
                        <span className="text-slate-500">Action:</span>{' '}
                        <span className="font-bold text-slate-100">{manualAction}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Requested Qty:</span>{' '}
                        <span className="font-mono text-slate-200">{manual.requestedQuantity ?? 'N/A'} plts</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Destination:</span>{' '}
                        <span className="font-medium text-slate-200">{manualDest}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Priority Level:</span>{' '}
                        <span className="font-semibold text-slate-200 uppercase">{manualLevel}</span>
                      </div>
                      {manual.instruction && (
                        <div className="mt-2 text-[11px] text-slate-400 bg-slate-900 p-2 rounded border border-slate-800 italic">
                          "{manual.instruction}"
                        </div>
                      )}
                      <div className="text-[10px] text-slate-500 mt-2">
                        Created by {manual.createdBy || 'Planner'} on{' '}
                        {manual.createdDate ? new Date((manual.createdDate as any)?.toDate?.() || manual.createdDate).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* System Priority Box */}
                  <div
                    onClick={() => handleSelectChoice(conflict.id, 'REPLACE_MANUAL_WITH_SYSTEM')}
                    className={`p-4 rounded-lg border-2 transition-all cursor-pointer relative ${
                      currentChoice === 'REPLACE_MANUAL_WITH_SYSTEM'
                        ? 'border-amber-500 bg-amber-950/20 shadow-lg shadow-amber-950/30'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>System Driven Priority</span>
                      </span>
                      {currentChoice === 'REPLACE_MANUAL_WITH_SYSTEM' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-500 text-slate-950 rounded-full flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Selected (Replace Manual)
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-300">
                      <div>
                        <span className="text-slate-500">Action:</span>{' '}
                        <span className="font-bold text-slate-100">{systemAction}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Recommended Qty:</span>{' '}
                        <span className="font-mono text-slate-200">{system.requestedQuantity ?? 'N/A'} plts</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Destination:</span>{' '}
                        <span className="font-medium text-slate-200">{systemDest}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Priority Level:</span>{' '}
                        <span className="font-semibold text-slate-200 uppercase">{systemLevel}</span>
                      </div>
                      {system.instruction && (
                        <div className="mt-2 text-[11px] text-slate-400 bg-slate-900 p-2 rounded border border-slate-800">
                          {system.instruction}
                        </div>
                      )}
                      <div className="text-[10px] text-amber-400/80 mt-2 font-mono">
                        Generated by Decision Engine
                      </div>
                    </div>
                  </div>
                </div>

                {/* Resolution Choice Bar */}
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span className="text-slate-400 font-semibold">Planner Decision for this SKU:</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-100">
                      <input
                        type="radio"
                        name={`conflict_${conflict.id}`}
                        checked={currentChoice === 'KEEP_MANUAL_IGNORE_SYSTEM'}
                        onChange={() => handleSelectChoice(conflict.id, 'KEEP_MANUAL_IGNORE_SYSTEM')}
                        className="text-blue-500 focus:ring-blue-500"
                      />
                      <span className="font-medium">Keep Manual Priority (Ignore System)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-slate-100">
                      <input
                        type="radio"
                        name={`conflict_${conflict.id}`}
                        checked={currentChoice === 'REPLACE_MANUAL_WITH_SYSTEM'}
                        onChange={() => handleSelectChoice(conflict.id, 'REPLACE_MANUAL_WITH_SYSTEM')}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      <span className="font-medium">Replace Manual with System Recommendation</span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-5 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Resolving conflicts will automatically update the Operational Priority board.
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition-colors"
            >
              Decide Later
            </button>
            <button
              onClick={handleApplyResolutions}
              disabled={submitting}
              className="px-5 py-2 bg-brand-500 hover:bg-brand-400 text-slate-950 text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? 'Applying Decisions...' : 'Confirm & Apply Resolutions'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

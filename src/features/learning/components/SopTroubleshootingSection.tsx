import React, { useState } from 'react';
import { SopTroubleshootingItem } from '../../../types/learning';
import { AlertCircle, ChevronDown, ChevronUp, CheckCircle, Wrench, ArrowRight } from 'lucide-react';
import { useLearning } from '../context/LearningContext';

interface SopTroubleshootingSectionProps {
  items: SopTroubleshootingItem[];
  onOpenSop?: (sopId: string) => void;
}

export const SopTroubleshootingSection: React.FC<SopTroubleshootingSectionProps> = ({
  items,
  onOpenSop
}) => {
  const [expandedIndices, setExpandedIndices] = useState<number[]>([0]);
  const { allSops, openHelpDrawer } = useLearning();

  const toggleIndex = (index: number) => {
    setExpandedIndices(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
        <Wrench className="w-4 h-4 text-orange-400" />
        <span>Common Issues & Troubleshooting</span>
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => {
          const isExpanded = expandedIndices.includes(idx);
          return (
            <div
              key={idx}
              className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-lg overflow-hidden transition-all"
            >
              <button
                type="button"
                onClick={() => toggleIndex(idx)}
                className="w-full flex items-center justify-between p-3.5 text-left text-xs md:text-sm font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />
                  <span>{item.problem}</span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {isExpanded && (
                <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-slate-800/80 text-xs">
                  {/* Causes */}
                  {item.possibleCauses && item.possibleCauses.length > 0 && (
                    <div className="space-y-1">
                      <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                        Possible Causes:
                      </span>
                      <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
                        {item.possibleCauses.map((cause, cIdx) => (
                          <li key={cIdx} className="leading-relaxed">
                            {cause}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Solutions */}
                  {item.solutions && item.solutions.length > 0 && (
                    <div className="space-y-1.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5">
                      <span className="font-semibold text-emerald-400 uppercase tracking-wider text-[10px] flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Recommended Solutions:
                      </span>
                      <ul className="space-y-1 text-emerald-200/90">
                        {item.solutions.map((sol, sIdx) => (
                          <li key={sIdx} className="flex items-start gap-1.5 leading-relaxed">
                            <span className="text-emerald-400 font-bold">•</span>
                            <span>{sol}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Related SOPs */}
                  {item.relatedSopIds && item.relatedSopIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase">
                        Related Guides:
                      </span>
                      {item.relatedSopIds.map(relId => {
                        const relSop = allSops.find(s => s.id === relId);
                        if (!relSop) return null;
                        return (
                          <button
                            key={relId}
                            type="button"
                            onClick={() => (onOpenSop ? onOpenSop(relId) : openHelpDrawer(relId))}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                          >
                            <span>{relSop.title}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

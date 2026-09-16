import React from 'react';
import { useNavigate } from 'react-router-dom';
import { WhatsNewItem } from '../../../types/learning';
import { Sparkles, Calendar, ArrowRight, BookOpen, AlertCircle, RefreshCw } from 'lucide-react';
import { useLearning } from '../context/LearningContext';

interface WhatsNewFeedProps {
  items: WhatsNewItem[];
  maxItems?: number;
}

export const WhatsNewFeed: React.FC<WhatsNewFeedProps> = ({ items, maxItems = 5 }) => {
  const navigate = useNavigate();
  const { openHelpDrawer } = useLearning();
  const displayItems = items.slice(0, maxItems);

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'NEW_FEATURE':
        return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30';
      case 'CHANGED_FEATURE':
        return 'text-blue-300 bg-blue-500/15 border-blue-500/30';
      case 'UPDATED_SOP':
        return 'text-purple-300 bg-purple-500/15 border-purple-500/30';
      case 'ANNOUNCEMENT':
        return 'text-amber-300 bg-amber-500/15 border-amber-500/30';
      default:
        return 'text-slate-300 bg-slate-500/15 border-slate-500/30';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'NEW_FEATURE':
        return <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'CHANGED_FEATURE':
        return <RefreshCw className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
      case 'UPDATED_SOP':
        return <BookOpen className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
      default:
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }
  };

  return (
    <div className="space-y-3">
      {displayItems.map(item => (
        <div
          key={item.id}
          className="bg-slate-900 border border-slate-800 hover:border-slate-700/90 rounded-xl p-4 transition-all space-y-2.5 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getBadgeColor(item.type)}`}>
                {getIcon(item.type)}
                {item.badgeText || item.type.replace('_', ' ')}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-500" />
              {new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-200">
              {item.title}
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {item.description}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
            {item.sopId && (
              <button
                type="button"
                onClick={() => openHelpDrawer(item.sopId)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300 hover:underline cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Read SOP Guide
              </button>
            )}

            {item.appRoute && (
              <button
                type="button"
                onClick={() => navigate(item.appRoute!)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white hover:underline ml-auto cursor-pointer"
              >
                <span>View Screen</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

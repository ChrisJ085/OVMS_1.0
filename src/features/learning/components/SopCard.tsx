import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SopDocument } from '../../../types/learning';
import { 
  Clock, 
  Star, 
  CheckCircle2, 
  Bookmark, 
  ArrowRight, 
  Layers, 
  Shield, 
  BookOpen,
  Sparkles
} from 'lucide-react';
import { useLearning } from '../context/LearningContext';
import { SOP_CATEGORIES } from '../data/seedSops';

interface SopCardProps {
  sop: SopDocument;
  onSelect?: (sop: SopDocument) => void;
  isCompact?: boolean;
}

export const SopCard: React.FC<SopCardProps> = ({
  sop,
  onSelect,
  isCompact = false
}) => {
  const navigate = useNavigate();
  const { userProgress, favorites, toggleFavorite, openHelpDrawer } = useLearning();

  const isFavorite = favorites.includes(sop.id);
  const progress = userProgress[sop.id];
  const isCompleted = progress?.status === 'COMPLETED';
  const isInProgress = progress?.status === 'IN_PROGRESS';
  const categoryMeta = SOP_CATEGORIES.find(c => c.id === sop.category);

  const getDifficultyBadge = (diff: string) => {
    switch (diff) {
      case 'BEGINNER':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'INTERMEDIATE':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'ADVANCED':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(sop);
    } else {
      navigate(`/learning/sop/${sop.id}`);
    }
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(sop.id);
  };

  const handleOpenHelpDrawerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openHelpDrawer(sop.id);
  };

  if (isCompact) {
    return (
      <div
        onClick={handleCardClick}
        className="group relative bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 transition-all cursor-pointer shadow-sm space-y-2.5"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${categoryMeta?.colorClass || 'text-slate-400 bg-slate-800'}`}>
              {categoryMeta?.title || sop.category}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${getDifficultyBadge(sop.difficulty)}`}>
              {sop.difficulty.toLowerCase()}
            </span>
          </div>

          <button
            type="button"
            onClick={handleFavoriteClick}
            title={isFavorite ? 'Remove from bookmarks' : 'Add to bookmarks'}
            className="text-slate-500 hover:text-amber-400 p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Bookmark className={`w-3.5 h-3.5 ${isFavorite ? 'text-amber-400 fill-amber-400' : ''}`} />
          </button>
        </div>

        <div>
          <h4 className="text-xs md:text-sm font-semibold text-slate-200 group-hover:text-brand-300 transition-colors line-clamp-1">
            {sop.title}
          </h4>
          <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
            {sop.shortDescription}
          </p>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/80">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              {sop.estimatedDurationMinutes}m
            </span>
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-400" />
              {sop.steps.length} steps
            </span>
          </div>

          {isCompleted ? (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Done
            </span>
          ) : isInProgress ? (
            <span className="text-amber-400 font-medium">
              Step {progress?.currentStepNumber || 1}/{sop.steps.length}
            </span>
          ) : (
            <span className="text-slate-500 group-hover:text-slate-300 transition-colors flex items-center gap-0.5">
              Read <ArrowRight className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleCardClick}
      className="group relative bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-slate-700/90 rounded-xl p-5 transition-all cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between space-y-4"
    >
      <div className="space-y-3">
        {/* Header Badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border ${categoryMeta?.colorClass || 'text-slate-400 bg-slate-800'}`}>
              {categoryMeta?.title || sop.category}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${getDifficultyBadge(sop.difficulty)}`}>
              {sop.difficulty.toLowerCase()}
            </span>
            {sop.isCustomOrOverridden && (
              <span className="text-[10px] font-semibold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Custom SOP
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleFavoriteClick}
              title={isFavorite ? 'Remove from favorites' : 'Bookmark this SOP'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Bookmark className={`w-4 h-4 ${isFavorite ? 'text-amber-400 fill-amber-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Title & Description */}
        <div>
          <h3 className="text-base font-bold text-slate-100 group-hover:text-brand-300 transition-colors">
            {sop.title}
          </h3>
          <p className="text-xs md:text-sm text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">
            {sop.shortDescription}
          </p>
        </div>

        {/* Target Roles */}
        {sop.applicableRoles && sop.applicableRoles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {sop.applicableRoles.map(role => (
              <span
                key={role}
                className="text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded font-mono"
              >
                {role.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer Meta */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            {sop.estimatedDurationMinutes} min read
          </span>
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            {sop.steps.length} steps
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isCompleted ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completed
            </span>
          ) : isInProgress ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              In Progress ({progress?.currentStepNumber}/{sop.steps.length})
            </span>
          ) : (
            <button
              type="button"
              onClick={handleOpenHelpDrawerClick}
              title="Open step-by-step guidance in right panel"
              className="text-xs font-semibold text-brand-400 group-hover:text-brand-300 flex items-center gap-1 hover:underline cursor-pointer"
            >
              Open Guide <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

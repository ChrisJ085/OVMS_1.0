import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLearning } from '../context/LearningContext';
import { SopStepViewer } from '../components/SopStepViewer';
import { SopTroubleshootingSection } from '../components/SopTroubleshootingSection';
import { SopCard } from '../components/SopCard';
import { SOP_CATEGORIES } from '../data/seedSops';
import { useAuth } from '../../auth/context/AuthContext';
import { 
  ArrowLeft, 
  Clock, 
  Bookmark, 
  CheckCircle2, 
  Layers, 
  ShieldCheck, 
  Calendar, 
  User, 
  FileText,
  AlertCircle,
  Sparkles,
  HelpCircle,
  ExternalLink,
  Edit,
  Printer
} from 'lucide-react';

export const SopReaderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { 
    allSops, 
    userProgress, 
    favorites, 
    toggleFavorite, 
    updateProgress, 
    acknowledgeSop, 
    recordView,
    openHelpDrawer
  } = useLearning();

  const [currentStepNumber, setCurrentStepNumber] = useState(1);
  const [showAckSuccess, setShowAckSuccess] = useState(false);

  const sop = allSops.find(s => s.id === id || s.slug === id);

  useEffect(() => {
    if (sop) {
      recordView(sop.id);
      const existingProgress = userProgress[sop.id];
      if (existingProgress?.currentStepNumber) {
        setCurrentStepNumber(existingProgress.currentStepNumber);
      } else {
        setCurrentStepNumber(1);
      }
    }
  }, [sop?.id]);

  if (!sop) {
    return (
      <div className="text-center py-20 space-y-4">
        <HelpCircle className="w-12 h-12 text-slate-600 mx-auto" />
        <h2 className="text-xl font-bold text-slate-200">Procedure Not Found</h2>
        <p className="text-sm text-slate-400">The requested standard operating procedure could not be located.</p>
        <button
          type="button"
          onClick={() => navigate('/learning')}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
        >
          Return to Learning Centre
        </button>
      </div>
    );
  }

  const categoryMeta = SOP_CATEGORIES.find(c => c.id === sop.category);
  const isFavorite = favorites.includes(sop.id);
  const progress = userProgress[sop.id];
  const isCompleted = progress?.status === 'COMPLETED';
  const isAcknowledged = Boolean(progress?.acknowledgedVersion);
  const canEdit = userProfile?.role === 'PLATFORM_SUPERUSER' || userProfile?.role === 'TENANT_ADMIN';

  const relatedSops = allSops.filter(s => sop.relatedSopIds?.includes(s.id));

  const handleAcknowledge = () => {
    acknowledgeSop(sop.id, sop.version);
    setShowAckSuccess(true);
    setTimeout(() => setShowAckSuccess(false), 4000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => navigate('/learning')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Learning Centre
        </button>

        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => navigate(`/learning/editor/${sop.id}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              <Edit className="w-3.5 h-3.5" />
              Edit SOP
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            title="Print SOP reference card"
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => toggleFavorite(sop.id)}
            title={isFavorite ? 'Remove from bookmarks' : 'Bookmark this SOP'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
              isFavorite
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isFavorite ? 'text-amber-400 fill-amber-400' : ''}`} />
            <span>{isFavorite ? 'Saved' : 'Bookmark'}</span>
          </button>

          <button
            type="button"
            onClick={() => openHelpDrawer(sop.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Open in Side Panel
          </button>
        </div>
      </div>

      {/* Main SOP Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-4 shadow-lg">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${categoryMeta?.colorClass || 'text-slate-400 bg-slate-800'}`}>
            {categoryMeta?.title || sop.category}
          </span>
          <span className="text-xs font-medium text-slate-300 bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700">
            Module: {sop.module}
          </span>
          <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded-md border border-slate-800">
            v{sop.version}
          </span>
          {isCompleted && (
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completed
            </span>
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            {sop.title}
          </h1>
          <p className="text-sm md:text-base text-slate-300 leading-relaxed max-w-4xl">
            {sop.fullDescription || sop.shortDescription}
          </p>
        </div>

        {/* Target Roles & Metadata Pills */}
        <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              {sop.estimatedDurationMinutes} min read
            </span>
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              {sop.steps.length} procedural steps
            </span>
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-500" />
              Author: {sop.author}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Updated: {new Date(sop.updatedDate as string).toLocaleDateString()}
            </span>
          </div>

          {sop.applicableRoles && sop.applicableRoles.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[11px] font-semibold uppercase">Roles:</span>
              {sop.applicableRoles.map(r => (
                <span key={r} className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                  {r.replace('_', ' ')}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Two Column Layout: Table of Contents / Stepper on Left, Interactive Step Viewer on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Step Navigator (4 Cols) */}
        <div className="lg:col-span-4 space-y-4 sticky top-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-brand-400" />
              Table of Contents
            </h3>

            <div className="space-y-1">
              {sop.steps.map((step, idx) => {
                const isCurrent = step.stepNumber === currentStepNumber;
                return (
                  <button
                    key={step.stepNumber}
                    type="button"
                    onClick={() => {
                      setCurrentStepNumber(step.stepNumber);
                      updateProgress(sop.id, { currentStepNumber: step.stepNumber, status: 'IN_PROGRESS' });
                    }}
                    className={`w-full text-left p-2.5 rounded-lg text-xs font-semibold transition-all flex items-start gap-2.5 cursor-pointer ${
                      isCurrent
                        ? 'bg-brand-500/15 text-brand-200 border border-brand-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                      isCurrent ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {step.stepNumber}
                    </span>
                    <span className="line-clamp-2 leading-relaxed">{step.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SOP Tips & Notes */}
          {sop.tips && sop.tips.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2 text-xs">
              <span className="font-bold text-amber-300 block uppercase tracking-wider text-[11px]">
                Key Best Practices:
              </span>
              <ul className="space-y-1.5 text-amber-200/90 list-disc list-inside">
                {sop.tips.map((tip, tIdx) => (
                  <li key={tIdx} className="leading-relaxed">{tip}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Acknowledgement Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-200">
                Procedure Compliance
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Confirm you have reviewed and understood this standard procedure for your operational role.
            </p>

            {isAcknowledged ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-2.5 rounded-lg text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Acknowledged on v{progress?.acknowledgedVersion || sop.version}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAcknowledge}
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-sm"
              >
                Acknowledge Understanding
              </button>
            )}

            {showAckSuccess && (
              <p className="text-[11px] text-emerald-400 font-semibold animate-pulse">
                Acknowledgment recorded in compliance log.
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Step-by-Step Interactive Viewer (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          <SopStepViewer
            sop={sop}
            currentStepNumber={currentStepNumber}
            onStepChange={setCurrentStepNumber}
            onComplete={() => {
              handleAcknowledge();
            }}
          />

          {/* Troubleshooting Section */}
          {sop.troubleshooting && sop.troubleshooting.length > 0 && (
            <SopTroubleshootingSection
              items={sop.troubleshooting}
              onOpenSop={targetId => navigate(`/learning/sop/${targetId}`)}
            />
          )}

          {/* Related Procedures Grid */}
          {relatedSops.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Related Standard Operating Procedures
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {relatedSops.map(rel => (
                  <SopCard key={rel.id} sop={rel} isCompact />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

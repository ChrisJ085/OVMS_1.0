import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SopDocument, SopStep } from '../../../types/learning';
import { 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight, 
  Lightbulb, 
  AlertTriangle, 
  HelpCircle, 
  ExternalLink,
  Check,
  RotateCcw
} from 'lucide-react';
import { useLearning } from '../context/LearningContext';

interface SopStepViewerProps {
  sop: SopDocument;
  currentStepNumber: number;
  onStepChange: (stepNumber: number) => void;
  onComplete?: () => void;
  isCompact?: boolean;
}

export const SopStepViewer: React.FC<SopStepViewerProps> = ({
  sop,
  currentStepNumber,
  onStepChange,
  onComplete,
  isCompact = false
}) => {
  const navigate = useNavigate();
  const { userProgress, updateProgress, closeHelpDrawer } = useLearning();

  const totalSteps = sop.steps.length;
  const clampedStepIndex = Math.max(0, Math.min(currentStepNumber - 1, totalSteps - 1));
  const currentStep: SopStep = sop.steps[clampedStepIndex] || sop.steps[0];
  const progress = userProgress[sop.id];
  const isCompleted = progress?.status === 'COMPLETED';

  const handlePrev = () => {
    if (clampedStepIndex > 0) {
      const prevStep = clampedStepIndex;
      onStepChange(prevStep);
      updateProgress(sop.id, { currentStepNumber: prevStep, status: 'IN_PROGRESS' });
    }
  };

  const handleNext = () => {
    if (clampedStepIndex < totalSteps - 1) {
      const nextStep = clampedStepIndex + 2;
      onStepChange(nextStep);
      updateProgress(sop.id, { currentStepNumber: nextStep, status: 'IN_PROGRESS' });
    } else {
      // Completed all steps
      updateProgress(sop.id, { status: 'COMPLETED', currentStepNumber: totalSteps });
      if (onComplete) onComplete();
    }
  };

  const handleReset = () => {
    onStepChange(1);
    updateProgress(sop.id, { currentStepNumber: 1, status: 'IN_PROGRESS' });
  };

  const handleActionClick = (url?: string) => {
    if (!url) return;
    if (isCompact) {
      // In drawer mode, user can navigate to the page and keep drawer open
      navigate(url);
    } else {
      navigate(url);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/60 rounded-xl border border-slate-800 p-4 space-y-4">
      {/* Step Progress Tracker */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">
              Step {currentStep.stepNumber} of {totalSteps}
            </span>
            {isCompleted && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" />
                Completed
              </span>
            )}
          </div>
          <span className="text-slate-400 font-medium">
            {Math.round((currentStep.stepNumber / totalSteps) * 100)}%
          </span>
        </div>

        {/* Step Progress Segments */}
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}>
          {sop.steps.map((step, idx) => {
            const isDone = idx < currentStep.stepNumber;
            const isCurrent = idx === clampedStepIndex;
            return (
              <button
                key={step.stepNumber}
                type="button"
                onClick={() => onStepChange(step.stepNumber)}
                title={`Jump to Step ${step.stepNumber}: ${step.title}`}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-brand-400 ring-2 ring-brand-400/40'
                    : isDone
                    ? 'bg-brand-600'
                    : 'bg-slate-800 hover:bg-slate-700'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Step Content Area */}
      <div className="flex-1 space-y-3.5 overflow-y-auto pr-1">
        <div className="space-y-1">
          <h3 className="text-base md:text-lg font-bold text-white tracking-tight">
            {currentStep.title}
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
            {currentStep.instruction}
          </p>
        </div>

        {/* Action Link Button if provided */}
        {currentStep.actionUrl && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => handleActionClick(currentStep.actionUrl)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow transition-colors cursor-pointer"
            >
              <span>{currentStep.actionLabel || 'Go to target screen'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tip Box */}
        {currentStep.tip && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-200 flex items-start gap-2.5">
            <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-amber-300 block">Pro Tip</span>
              <p className="text-amber-200/90 leading-normal">{currentStep.tip}</p>
            </div>
          </div>
        )}

        {/* Warning Box */}
        {currentStep.warning && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-red-300 block">Operational Warning</span>
              <p className="text-red-200/90 leading-normal">{currentStep.warning}</p>
            </div>
          </div>
        )}

        {/* Troubleshooting Box */}
        {currentStep.troubleshooting && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-xs text-blue-200 flex items-start gap-2.5">
            <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-blue-300 block">Troubleshooting Note</span>
              <p className="text-blue-200/90 leading-normal">{currentStep.troubleshooting}</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-800 shrink-0">
        <button
          type="button"
          onClick={handlePrev}
          disabled={clampedStepIndex === 0}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            clampedStepIndex === 0
              ? 'opacity-40 cursor-not-allowed border-slate-800 text-slate-500 bg-slate-900'
              : 'border-slate-700 hover:border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        <div className="flex items-center gap-2">
          {isCompleted && (
            <button
              type="button"
              onClick={handleReset}
              title="Restart procedure from Step 1"
              className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-all shadow-sm cursor-pointer"
          >
            {clampedStepIndex === totalSteps - 1 ? (
              <>
                <Check className="w-4 h-4" />
                Mark Complete
              </>
            ) : (
              <>
                Next Step
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

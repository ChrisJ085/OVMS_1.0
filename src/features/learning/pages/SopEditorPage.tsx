import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLearning } from '../context/LearningContext';
import { SOP_CATEGORIES } from '../data/seedSops';
import { useAuth } from '../../auth/context/AuthContext';
import { 
  ArrowLeft, 
  Save, 
  Trash2, 
  Plus, 
  Layers, 
  Lightbulb, 
  AlertTriangle, 
  HelpCircle,
  Clock,
  Sparkles,
  Check
} from 'lucide-react';
import { SopDocument, SopStep, SopCategory, SopDifficulty } from '../../../types/learning';
import { UserRole } from '../../../types/auth';

const ALL_ROLES: UserRole[] = [
  'PLATFORM_SUPERUSER',
  'TENANT_ADMIN',
  'PLANNER',
  'WAREHOUSE_OPERATOR',
  'VIEWER',
  'DISPLAY'
];

export const SopEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { allSops, saveCustomSop, deleteCustomSop } = useLearning();

  const isEditing = Boolean(id);
  const existingSop = isEditing ? allSops.find(s => s.id === id) : null;

  const [formData, setFormData] = useState<Partial<SopDocument>>({
    id: existingSop?.id || `sop-custom-${Date.now()}`,
    slug: existingSop?.slug || '',
    title: existingSop?.title || '',
    shortDescription: existingSop?.shortDescription || '',
    fullDescription: existingSop?.fullDescription || '',
    category: existingSop?.category || 'GETTING_STARTED',
    difficulty: existingSop?.difficulty || 'BEGINNER',
    estimatedDurationMinutes: existingSop?.estimatedDurationMinutes || 5,
    applicableRoles: existingSop?.applicableRoles || ['PLANNER', 'WAREHOUSE_OPERATOR'],
    module: existingSop?.module || 'General',
    version: existingSop?.version || '1.0',
    status: existingSop?.status || 'PUBLISHED',
    author: existingSop?.author || userProfile?.name || 'Operations Admin',
    keywords: existingSop?.keywords || [],
    steps: existingSop?.steps || [
      {
        stepNumber: 1,
        title: 'Step 1 Title',
        instruction: 'Detailed instruction for step 1...',
        tip: '',
        warning: ''
      }
    ],
    tips: existingSop?.tips || [],
    troubleshooting: existingSop?.troubleshooting || []
  });

  const [keywordsText, setKeywordsText] = useState(
    existingSop?.keywords?.join(', ') || ''
  );
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (existingSop) {
      setFormData({ ...existingSop });
      setKeywordsText(existingSop.keywords?.join(', ') || '');
    }
  }, [existingSop]);

  const handleStepChange = (index: number, field: keyof SopStep, value: any) => {
    const updatedSteps = [...(formData.steps || [])];
    updatedSteps[index] = {
      ...updatedSteps[index],
      [field]: value
    };
    setFormData(prev => ({ ...prev, steps: updatedSteps }));
  };

  const handleAddStep = () => {
    const nextStepNum = (formData.steps?.length || 0) + 1;
    const newStep: SopStep = {
      stepNumber: nextStepNum,
      title: `Step ${nextStepNum}`,
      instruction: '',
      tip: '',
      warning: ''
    };
    setFormData(prev => ({
      ...prev,
      steps: [...(prev.steps || []), newStep]
    }));
  };

  const handleRemoveStep = (index: number) => {
    const updated = (formData.steps || [])
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, stepNumber: i + 1 }));
    setFormData(prev => ({ ...prev, steps: updated }));
  };

  const handleRoleToggle = (role: UserRole) => {
    const curRoles = formData.applicableRoles || [];
    if (curRoles.includes(role)) {
      setFormData(prev => ({
        ...prev,
        applicableRoles: curRoles.filter(r => r !== role)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        applicableRoles: [...curRoles, role]
      }));
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title?.trim()) {
      alert('Please provide a valid SOP title.');
      return;
    }

    const keywords = keywordsText
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);

    const fullSop: SopDocument = {
      id: formData.id || `sop-custom-${Date.now()}`,
      slug: formData.slug || formData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title: formData.title,
      shortDescription: formData.shortDescription || '',
      fullDescription: formData.fullDescription || '',
      category: formData.category || 'GETTING_STARTED',
      difficulty: formData.difficulty || 'BEGINNER',
      estimatedDurationMinutes: Number(formData.estimatedDurationMinutes) || 5,
      applicableRoles: formData.applicableRoles || ['PLANNER'],
      module: formData.module || 'General',
      version: formData.version || '1.0',
      status: formData.status || 'PUBLISHED',
      author: formData.author || userProfile?.name || 'Operations Admin',
      publishedDate: existingSop?.publishedDate || new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      keywords,
      steps: formData.steps || [],
      relatedSopIds: formData.relatedSopIds || [],
      tips: formData.tips || [],
      troubleshooting: formData.troubleshooting || [],
      isCustomOrOverridden: true
    };

    saveCustomSop(fullSop);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      navigate(`/learning/sop/${fullSop.id}`);
    }, 1000);
  };

  const handleDelete = () => {
    if (!formData.id) return;
    if (window.confirm('Are you sure you want to delete/revert this custom SOP?')) {
      deleteCustomSop(formData.id);
      navigate('/learning');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate('/learning')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Cancel & Return
        </button>

        <div className="flex items-center gap-2">
          {isEditing && formData.isCustomOrOverridden && (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Custom SOP
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-all shadow cursor-pointer"
          >
            {saveSuccess ? (
              <>
                <Check className="w-4 h-4" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Procedure
              </>
            )}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Core Metadata Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-400" />
            <h2 className="text-base font-bold text-slate-100">
              {isEditing ? 'Edit Procedure' : 'Create Custom Procedure'}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300">
                Procedure Title *
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Resolving Staging Bay Overflows"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                Category
              </label>
              <select
                value={formData.category}
                onChange={e => setFormData(prev => ({ ...prev, category: e.target.value as SopCategory }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              >
                {SOP_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                Difficulty Level
              </label>
              <select
                value={formData.difficulty}
                onChange={e => setFormData(prev => ({ ...prev, difficulty: e.target.value as SopDifficulty }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="ADVANCED">Advanced</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                Estimated Reading Time (Minutes)
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={formData.estimatedDurationMinutes}
                onChange={e => setFormData(prev => ({ ...prev, estimatedDurationMinutes: Number(e.target.value) }))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                System Module / Subsystem
              </label>
              <input
                type="text"
                value={formData.module}
                onChange={e => setFormData(prev => ({ ...prev, module: e.target.value }))}
                placeholder="e.g., Inventory, Planning, Priorities"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300">
                Short Summary (1-2 sentences)
              </label>
              <input
                type="text"
                value={formData.shortDescription}
                onChange={e => setFormData(prev => ({ ...prev, shortDescription: e.target.value }))}
                placeholder="Brief summary shown on cards and search results"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300">
                Detailed Overview & Objective
              </label>
              <textarea
                rows={3}
                value={formData.fullDescription}
                onChange={e => setFormData(prev => ({ ...prev, fullDescription: e.target.value }))}
                placeholder="Detailed explanation of what this procedure achieves..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-slate-300">
                Keywords & Synonyms (comma separated)
              </label>
              <input
                type="text"
                value={keywordsText}
                onChange={e => setKeywordsText(e.target.value)}
                placeholder="e.g., shortfall, staging, fork truck, pallet error"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Applicable Roles */}
            <div className="space-y-2 md:col-span-2 pt-2 border-t border-slate-800">
              <label className="text-xs font-semibold text-slate-300 block">
                Target Roles:
              </label>
              <div className="flex flex-wrap gap-2">
                {ALL_ROLES.map(role => {
                  const isChecked = formData.applicableRoles?.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => handleRoleToggle(role)}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
                        isChecked
                          ? 'bg-brand-600 text-white border-brand-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {role.replace('_', ' ')}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Steps Management Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand-400" />
              <h3 className="text-base font-bold text-slate-100">
                Procedural Steps ({formData.steps?.length || 0})
              </h3>
            </div>
            <button
              type="button"
              onClick={handleAddStep}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Step
            </button>
          </div>

          <div className="space-y-4">
            {formData.steps?.map((step, idx) => (
              <div
                key={idx}
                className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 relative"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-400 font-mono">
                    Step {step.stepNumber}
                  </span>
                  {formData.steps && formData.steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveStep(idx)}
                      className="text-red-400 hover:text-red-300 p-1 text-xs cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">
                    Step Title
                  </label>
                  <input
                    type="text"
                    required
                    value={step.title}
                    onChange={e => handleStepChange(idx, 'title', e.target.value)}
                    placeholder="e.g., Navigate to Exception Centre"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">
                    Step Instructions
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={step.instruction}
                    onChange={e => handleStepChange(idx, 'instruction', e.target.value)}
                    placeholder="Clear instructions on what to do..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">
                      Direct Action Route (optional)
                    </label>
                    <input
                      type="text"
                      value={step.actionUrl || ''}
                      onChange={e => handleStepChange(idx, 'actionUrl', e.target.value)}
                      placeholder="/operations/priorities"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">
                      Action Button Label (optional)
                    </label>
                    <input
                      type="text"
                      value={step.actionLabel || ''}
                      onChange={e => handleStepChange(idx, 'actionLabel', e.target.value)}
                      placeholder="Open Priorities"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" />
                      Pro Tip (optional)
                    </label>
                    <input
                      type="text"
                      value={step.tip || ''}
                      onChange={e => handleStepChange(idx, 'tip', e.target.value)}
                      placeholder="Helpful shortcut or advice"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Warning (optional)
                    </label>
                    <input
                      type="text"
                      value={step.warning || ''}
                      onChange={e => handleStepChange(idx, 'warning', e.target.value)}
                      placeholder="Safety note or critical operational hazard"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
};

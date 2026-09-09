import React, { useState, useEffect } from 'react';
import { useAuth } from '../../features/auth/context/AuthContext';
import { useSiteContext } from '../../contexts/SiteContext';
import { useSiteOnboarding } from '../../hooks/useSiteOnboarding';
import { 
  updateSiteOnboardingStep, 
  completeSiteOnboarding, 
  runSiteReadinessChecks, 
  ReadinessCheckResult,
  dismissOnboardingModal,
  resetSiteOnboarding
} from '../../features/configuration/services/siteOnboardingService';
import { 
  autoConfigureDecisionSettings, 
  getDecisionConfiguration 
} from '../../features/planning/services/decisionConfigurationService';
import { getSiteSettings, updateSiteSettings } from '../../features/administration/services/settingsService';
import { getDocument, getDocuments, createDocument, updateDocument, deleteDocument, where } from '../../services/dbService';
import { 
  CheckCircle,
  Circle, 
  Lock, 
  AlertCircle, 
  Info, 
  ArrowRight, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Sparkles, 
  X, 
  Compass, 
  Settings, 
  LineChart, 
  MapPin, 
  Tag, 
  Sliders, 
  HelpCircle,
  Activity,
  UserCheck
} from 'lucide-react';

interface SiteOnboardingWizardProps {
  onClose?: () => void;
}

const STEPS = [
  { id: 0, title: 'Site Details', icon: Compass, description: 'Verify name, code, and timezone.' },
  { id: 1, title: 'Production Lines', icon: Activity, description: 'Set up active production resources.' },
  { id: 2, title: 'Destinations', icon: MapPin, description: 'Define operational destinations.' },
  { id: 3, title: 'Action Types', icon: Tag, description: 'Create HOLD, SEND, and other action types.' },
  { id: 4, title: 'Priority Levels', icon: Sliders, description: 'Establish level weights and colors.' },
  { id: 5, title: 'Operational Settings', icon: Settings, description: 'Configure inventory and TV settings.' },
  { id: 6, title: 'Decision Settings', icon: Sparkles, description: 'Map actions, priorities, and default destinations.' },
  { id: 7, title: 'Products', icon: Tag, description: 'Add or import products.' },
  { id: 8, title: 'Planning Rules', icon: LineChart, description: 'Define product planning rules.' },
  { id: 9, title: 'Readiness Review', icon: CheckCircle, description: 'Run checks and complete setup.' }
];

export const SiteOnboardingWizard: React.FC<SiteOnboardingWizardProps> = ({ onClose }) => {
  const { userProfile } = useAuth();
  const { tenantId, siteId, site, setSite } = useSiteContext();
  const { onboarding, loading: onboardingLoading, canComplete, canModifyConfig } = useSiteOnboarding();

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [skippedSteps, setSkippedSteps] = useState<number[]>([]);
  
  // Forms & list states
  const [siteForm, setSiteForm] = useState({ siteName: '', siteCode: '', timezone: '' });
  const [lines, setLines] = useState<any[]>([]);
  const [newLineForm, setNewLineForm] = useState({ lineCode: '', lineName: '', sapResourceCode: '', sortOrder: '1' });
  
  const [destinations, setDestinations] = useState<any[]>([]);
  const [newDestForm, setNewDestForm] = useState({ destinationCode: '', destinationName: '', destinationType: 'EXTERNAL_SITE', sortOrder: '1' });
  
  const [actions, setActions] = useState<any[]>([]);
  const [newActionForm, setNewActionForm] = useState({ code: '', label: '', meaning: '', colourToken: 'hold', iconKey: 'Clock', sortOrder: '1' });
  
  const [priorities, setPriorities] = useState<any[]>([]);
  const [newPriorityForm, setNewPriorityForm] = useState({ code: '', label: '', level: '1', description: '', severity: 'MEDIUM', colourToken: 'normal' });

  const [settingsForm, setSettingsForm] = useState({
    dashboardTitle: '',
    timezone: '',
    dashboardRotationSeconds: 15,
    tickerSpeed: 3,
    inventoryFreshMinutes: 240,
    inventoryAgingMinutes: 720,
    inventoryStaleMinutes: 1440,
    upcomingProductionWindowHours: 24,
    promotionLookAheadDays: 7
  });

  const [decisionConfig, setDecisionConfig] = useState<any>(null);
  const [autoConfigLog, setAutoConfigLog] = useState<{ created: string[], reused: string[], version: string } | null>(null);

  const [products, setProducts] = useState<any[]>([]);
  const [newProductForm, setNewProductForm] = useState({ productCode: '', description: '', categoryId: '', unitOfMeasureId: 'KG', casesPerPallet: '100', unitsPerCase: '1' });

  const [rules, setRules] = useState<any[]>([]);
  const [ruleOverride, setRuleOverride] = useState<boolean>(false);

  // Readiness Review states
  const [readiness, setReadiness] = useState<ReadinessCheckResult | null>(null);
  const [runningChecks, setRunningChecks] = useState<boolean>(false);
  const [isDone, setIsDone] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uiError, setUiError] = useState<string | null>(null);

  // Sync state from onboarding record
  useEffect(() => {
    if (onboarding) {
      setCurrentStep(onboarding.currentStep || 0);
      setCompletedSteps(onboarding.completedSteps || []);
      setSkippedSteps(onboarding.skippedOptionalSteps || []);
    }
  }, [onboarding]);

  // Load Step Data on transition
  useEffect(() => {
    if (!tenantId || !siteId) return;
    loadStepData(currentStep);
  }, [currentStep, tenantId, siteId]);

  const loadStepData = async (stepId: number) => {
    setUiError(null);
    try {
      if (stepId === 0) {
        // Site Details
        if (site) {
          setSiteForm({
            siteName: site.siteName || '',
            siteCode: site.siteId || '',
            timezone: site.timezone || 'Europe/London'
          });
        } else {
          const siteData = await getDocument<any>('sites', siteId);
          if (siteData) {
            setSiteForm({
              siteName: siteData.siteName || '',
              siteCode: siteData.id || siteId,
              timezone: siteData.timezone || 'Europe/London'
            });
          }
        }
      } else if (stepId === 1) {
        // Production lines
        const lineDocs = await getDocuments<any>('productionLines', [where('tenantId', '==', tenantId), where('siteId', '==', siteId)]);
        setLines(lineDocs);
      } else if (stepId === 2) {
        // Destinations
        const destDocs = await getDocuments<any>('destinations', [where('tenantId', '==', tenantId)]);
        const list = destDocs.filter((d: any) => !d.siteId || d.siteId === siteId);
        setDestinations(list);
      } else if (stepId === 3) {
        // Action Types
        const actionDocs = await getDocuments<any>('actionTypes', [where('tenantId', '==', tenantId)]);
        setActions(actionDocs);
      } else if (stepId === 4) {
        // Priority Levels
        const priorityDocs = await getDocuments<any>('priorityLevels', [where('tenantId', '==', tenantId)]);
        setPriorities(priorityDocs);
      } else if (stepId === 5) {
        // Operational Settings
        const settings = await getSiteSettings(tenantId, siteId);
        if (settings) {
          setSettingsForm({
            dashboardTitle: settings.dashboardTitle || '',
            timezone: settings.timezone || 'Europe/London',
            dashboardRotationSeconds: settings.dashboardRotationSeconds || 15,
            tickerSpeed: settings.tickerSpeed || 3,
            inventoryFreshMinutes: settings.inventoryFreshMinutes || 240,
            inventoryAgingMinutes: settings.inventoryAgingMinutes || 720,
            inventoryStaleMinutes: settings.inventoryStaleMinutes || 1440,
            upcomingProductionWindowHours: settings.upcomingProductionWindowHours || 24,
            promotionLookAheadDays: settings.promotionLookAheadDays || 7
          });
        }
      } else if (stepId === 6) {
        // Decision Settings
        const config = await getDecisionConfiguration(tenantId, siteId, false);
        setDecisionConfig(config);
      } else if (stepId === 7) {
        // Products
        const prodDocs = await getDocuments<any>('products', [where('tenantId', '==', tenantId)]);
        const list = prodDocs.filter((p: any) => !p.siteId || p.siteId === siteId);
        setProducts(list);
      } else if (stepId === 8) {
        // Planning rules
        const ruleDocs = await getDocuments<any>('planningRules', [where('tenantId', '==', tenantId), where('siteId', '==', siteId)]);
        setRules(ruleDocs);
      } else if (stepId === 9) {
        // Readiness Review
        setRunningChecks(true);
        const result = await runSiteReadinessChecks(tenantId, siteId);
        setReadiness(result);
        setRunningChecks(false);
      }
    } catch (err: any) {
      console.error(`Failed to load step ${stepId} data:`, err);
      setUiError(err.message || 'Failed to load step details.');
    }
  };

  const docSnapId = (id: string) => id;

  const markStepComplete = async (stepId: number, skip = false) => {
    if (!tenantId || !siteId || !userProfile?.uid) return;
    try {
      let updatedCompleted = [...completedSteps];
      let updatedSkipped = [...skippedSteps];

      if (skip) {
        updatedSkipped = Array.from(new Set([...updatedSkipped, stepId]));
        updatedCompleted = updatedCompleted.filter(id => id !== stepId);
      } else {
        updatedCompleted = Array.from(new Set([...updatedCompleted, stepId]));
        updatedSkipped = updatedSkipped.filter(id => id !== stepId);
      }

      setCompletedSteps(updatedCompleted);
      setSkippedSteps(updatedSkipped);

      const nextStep = Math.min(stepId + 1, STEPS.length - 1);
      setCurrentStep(nextStep);

      await updateSiteOnboardingStep(
        tenantId,
        siteId,
        nextStep,
        updatedCompleted,
        updatedSkipped,
        userProfile.uid,
        'IN_PROGRESS'
      );
    } catch (err: any) {
      console.error('Failed to update onboarding step:', err);
      setUiError(err.message || 'Failed to save progress.');
    }
  };

  // Step 0: Save Site Details
  const handleSaveSiteDetails = async () => {
    if (!siteForm.siteName.trim()) {
      setUiError('Site name is required.');
      return;
    }
    setSubmitting(true);
    try {
      // Update site document
      await updateDocument('sites', siteId, {
        siteName: siteForm.siteName,
        timezone: siteForm.timezone
      });

      // Update SiteSettings as well
      const settings = await getSiteSettings(tenantId, siteId);
      if (settings) {
        await updateSiteSettings(tenantId, siteId, { timezone: siteForm.timezone }, userProfile?.uid || 'system');
      } else {
        await updateSiteSettings(tenantId, siteId, {
          timezone: siteForm.timezone,
          siteName: siteForm.siteName,
          dashboardTitle: `${siteForm.siteName} TV Dashboard`,
          defaultUnitOfMeasureId: 'KG',
          defaultDestinationId: '',
          completedPriorityTvRetentionMinutes: 10,
          dashboardRotationSeconds: 15,
          tickerSpeed: 3,
          inventoryFreshMinutes: 240,
          inventoryAgingMinutes: 720,
          inventoryStaleMinutes: 1440,
          upcomingProductionWindowHours: 24,
          promotionLookAheadDays: 7,
          activeDecisionEngineVersion: 'v1.0.0'
        }, userProfile?.uid || 'system');
      }

      // If setSite function exists from context, trigger context sync
      if (site) {
        setSite({
          ...site,
          siteName: siteForm.siteName,
          timezone: siteForm.timezone
        });
      }

      await markStepComplete(0);
    } catch (err: any) {
      setUiError(err.message || 'Failed to save site details.');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 1: Add Production Line
  const handleAddLine = async () => {
    if (!newLineForm.lineCode.trim() || !newLineForm.lineName.trim()) {
      setUiError('Code and Name are required.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        tenantId,
        siteId,
        lineCode: newLineForm.lineCode.toUpperCase(),
        lineName: newLineForm.lineName,
        sapResourceCode: newLineForm.sapResourceCode || null,
        sortOrder: parseInt(newLineForm.sortOrder, 10) || 1,
        status: 'active',
        createdBy: userProfile?.uid || 'system',
        createdDate: new Date(),
        modifiedBy: userProfile?.uid || 'system',
        modifiedDate: new Date()
      };
      await createDocument('productionLines', payload);
      setNewLineForm({ lineCode: '', lineName: '', sapResourceCode: '', sortOrder: '1' });
      await loadStepData(1);
    } catch (err: any) {
      setUiError(err.message || 'Failed to add production line.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLine = async (id: string) => {
    try {
      await deleteDocument('productionLines', id);
      await loadStepData(1);
    } catch (err: any) {
      setUiError(err.message || 'Failed to delete production line.');
    }
  };

  // Step 2: Add Destination
  const handleAddDest = async () => {
    if (!newDestForm.destinationCode.trim() || !newDestForm.destinationName.trim()) {
      setUiError('Code and Name are required.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        tenantId,
        siteId,
        destinationCode: newDestForm.destinationCode.toUpperCase(),
        destinationName: newDestForm.destinationName,
        destinationType: newDestForm.destinationType,
        sortOrder: parseInt(newDestForm.sortOrder, 10) || 1,
        status: 'active',
        createdBy: userProfile?.uid || 'system',
        createdDate: new Date(),
        modifiedBy: userProfile?.uid || 'system',
        modifiedDate: new Date()
      };
      await createDocument('destinations', payload);
      setNewDestForm({ destinationCode: '', destinationName: '', destinationType: 'EXTERNAL_SITE', sortOrder: '1' });
      await loadStepData(2);
    } catch (err: any) {
      setUiError(err.message || 'Failed to add destination.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDest = async (id: string) => {
    try {
      await deleteDocument('destinations', id);
      await loadStepData(2);
    } catch (err: any) {
      setUiError(err.message || 'Failed to delete destination.');
    }
  };

  // Step 3: Add Action Type
  const handleAddAction = async () => {
    if (!newActionForm.code.trim() || !newActionForm.label.trim()) {
      setUiError('Code and Label are required.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        tenantId,
        siteId: '', // Action types are tenant-wide by default
        code: newActionForm.code.toUpperCase(),
        label: newActionForm.label,
        meaning: newActionForm.meaning,
        colourToken: newActionForm.colourToken,
        iconKey: newActionForm.iconKey,
        sortOrder: parseInt(newActionForm.sortOrder, 10) || 1,
        status: 'active',
        createdBy: userProfile?.uid || 'system',
        createdDate: new Date(),
        modifiedBy: userProfile?.uid || 'system',
        modifiedDate: new Date()
      };
      await createDocument('actionTypes', payload);
      setNewActionForm({ code: '', label: '', meaning: '', colourToken: 'hold', iconKey: 'Clock', sortOrder: '1' });
      await loadStepData(3);
    } catch (err: any) {
      setUiError(err.message || 'Failed to add action type.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAction = async (id: string) => {
    try {
      await deleteDocument('actionTypes', id);
      await loadStepData(3);
    } catch (err: any) {
      setUiError(err.message || 'Failed to delete action type.');
    }
  };

  // Step 4: Add Priority Level
  const handleAddPriority = async () => {
    if (!newPriorityForm.code.trim() || !newPriorityForm.label.trim()) {
      setUiError('Code and Label are required.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        tenantId,
        siteId: '', // Tenant-wide priority levels
        code: newPriorityForm.code.toUpperCase(),
        label: newPriorityForm.label,
        level: parseInt(newPriorityForm.level, 10) || 1,
        description: newPriorityForm.description,
        severity: newPriorityForm.severity,
        colourToken: newPriorityForm.colourToken,
        status: 'active',
        createdBy: userProfile?.uid || 'system',
        createdDate: new Date(),
        modifiedBy: userProfile?.uid || 'system',
        modifiedDate: new Date()
      };
      await createDocument('priorityLevels', payload);
      setNewPriorityForm({ code: '', label: '', level: '1', description: '', severity: 'MEDIUM', colourToken: 'normal' });
      await loadStepData(4);
    } catch (err: any) {
      setUiError(err.message || 'Failed to add priority level.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePriority = async (id: string) => {
    try {
      await deleteDocument('priorityLevels', id);
      await loadStepData(4);
    } catch (err: any) {
      setUiError(err.message || 'Failed to delete priority level.');
    }
  };

  // Step 5: Save Operational Settings
  const handleSaveOperationalSettings = async () => {
    setSubmitting(true);
    try {
      await updateSiteSettings(tenantId, siteId, {
        dashboardTitle: settingsForm.dashboardTitle,
        dashboardRotationSeconds: settingsForm.dashboardRotationSeconds,
        tickerSpeed: settingsForm.tickerSpeed,
        inventoryFreshMinutes: settingsForm.inventoryFreshMinutes,
        inventoryAgingMinutes: settingsForm.inventoryAgingMinutes,
        inventoryStaleMinutes: settingsForm.inventoryStaleMinutes,
        upcomingProductionWindowHours: settingsForm.upcomingProductionWindowHours,
        promotionLookAheadDays: settingsForm.promotionLookAheadDays
      }, userProfile?.uid || 'system');
      await markStepComplete(5);
    } catch (err: any) {
      setUiError(err.message || 'Failed to save operational settings.');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 6: Decision Settings Recommended Configuration
  const handleApplyRecommendedDecisionSettings = async () => {
    setSubmitting(true);
    try {
      const result = await autoConfigureDecisionSettings(tenantId, siteId, { overwriteExisting: true });
      if (result) {
        setAutoConfigLog({
          created: result.recordsCreated,
          reused: result.recordsReused,
          version: result.version
        });
        setDecisionConfig(result.configuration);
      } else {
        setUiError('Recommended decision setup failed. Verify action types and priority levels exist.');
      }
    } catch (err: any) {
      setUiError(err.message || 'Recommended setup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 7: Add Product
  const handleAddProduct = async () => {
    if (!newProductForm.productCode.trim() || !newProductForm.description.trim()) {
      setUiError('Product Code and Description are required.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        tenantId,
        siteId,
        productCode: newProductForm.productCode.toUpperCase(),
        description: newProductForm.description,
        categoryId: newProductForm.categoryId || 'default',
        unitOfMeasureId: newProductForm.unitOfMeasureId,
        casesPerPallet: parseInt(newProductForm.casesPerPallet, 10) || null,
        unitsPerCase: parseInt(newProductForm.unitsPerCase, 10) || null,
        configurations: [
          {
            unitOfMeasureId: newProductForm.unitOfMeasureId,
            casesPerPallet: parseInt(newProductForm.casesPerPallet, 10) || null,
            unitsPerCase: parseInt(newProductForm.unitsPerCase, 10) || null
          }
        ],
        operationallyRelevant: true,
        notes: 'Manually added during site onboarding setup.',
        status: 'active',
        createdBy: userProfile?.uid || 'system',
        createdDate: new Date(),
        modifiedBy: userProfile?.uid || 'system',
        modifiedDate: new Date()
      };
      await createDocument('products', payload);
      setNewProductForm({ productCode: '', description: '', categoryId: '', unitOfMeasureId: 'KG', casesPerPallet: '100', unitsPerCase: '1' });
      await loadStepData(7);
    } catch (err: any) {
      setUiError(err.message || 'Failed to add product.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await deleteDocument('products', id);
      await loadStepData(7);
    } catch (err: any) {
      setUiError(err.message || 'Failed to delete product.');
    }
  };

  // Step 8: Complete Planning Rules
  const handleSavePlanningRulesStep = async () => {
    if (rules.length === 0 && !ruleOverride) {
      setUiError('At least one active Product Planning Rule is required, or check the confirmation checkbox.');
      return;
    }
    await markStepComplete(8);
  };

  // Step 9: Final Complete Onboarding
  const handleCompleteOnboardingFlow = async () => {
    if (!readiness) return;
    const hasBlockers = Object.values(readiness.blockers).some(val => val === true);
    if (hasBlockers) {
      setUiError('Please resolve all onboarding blockers before completing the setup.');
      return;
    }
    setSubmitting(true);
    try {
      await completeSiteOnboarding(tenantId, siteId, userProfile?.uid || 'system');
      setIsDone(true);
    } catch (err: any) {
      setUiError(err.message || 'Failed to complete site onboarding.');
    } finally {
      setSubmitting(false);
    }
  };

  if (onboardingLoading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-300 font-medium text-sm">Retrieving setup tracker...</p>
      </div>
    );
  }

  const isStepDisabled = (stepId: number) => {
    // Basic progression locks:
    // Decision settings (6) is locked until site settings are completed
    if (stepId === 6) {
      return !completedSteps.includes(5);
    }
    // Review (9) is locked until decision config is complete
    if (stepId === 9) {
      return !completedSteps.includes(6);
    }
    return false;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-6xl w-full h-[88vh] flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Header bar */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Guided Site Onboarding</h2>
              <p className="text-xs text-slate-400">
                Setup checklist for <strong className="text-slate-300 font-medium">{site?.siteName || siteId}</strong>
              </p>
            </div>
          </div>
          
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-slate-800 border border-transparent hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
            title="Minimize and close setup wizard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isDone ? (
          /* Completion Success View */
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center max-w-2xl mx-auto space-y-6">
            <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 text-green-400 rounded-full flex items-center justify-center animate-bounce">
              <CheckCircle className="w-10 h-10" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-slate-100">Onboarding Complete!</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Congratulations, <strong className="text-slate-300">{site?.siteName || siteId}</strong> is now operationally ready. All core configurations, decision frameworks, and product profiles have been validated successfully.
              </p>
            </div>

            <div className="p-4 bg-slate-950/40 rounded-lg border border-slate-800 w-full text-left space-y-2">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Completed By:</span>
                <span className="text-slate-300 font-mono">{userProfile?.displayName || userProfile?.email}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Operational Status:</span>
                <span className="text-green-400 font-medium">READY</span>
              </div>
            </div>

            <div className="flex gap-4 w-full">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 font-medium text-sm rounded-lg transition-colors border border-slate-750"
              >
                Close Wizard
              </button>
            </div>
          </div>
        ) : (
          /* Main Layout Split Screen */
          <div className="flex-1 flex overflow-hidden">
            
            {/* Left Rail / Sidebar */}
            <div className="w-80 border-r border-slate-800 bg-slate-950/30 overflow-y-auto p-4 space-y-1">
              <div className="px-3 pb-3 pt-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Setup Progress Rails
              </div>
              
              {STEPS.map((step) => {
                const IconComponent = step.icon;
                const isCurrent = step.id === currentStep;
                const isDone = completedSteps.includes(step.id);
                const isSkipped = skippedSteps.includes(step.id);
                const isDisabled = isStepDisabled(step.id);

                return (
                  <button
                    key={step.id}
                    disabled={isDisabled}
                    onClick={() => setCurrentStep(step.id)}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all ${
                      isCurrent 
                        ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500' 
                        : isDisabled
                          ? 'opacity-40 cursor-not-allowed text-slate-600'
                          : 'hover:bg-slate-800/40 text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <div className="mt-0.5">
                      {isDone ? (
                        <CheckCircle className="w-4.5 h-4.5 text-green-500" />
                      ) : isSkipped ? (
                        <Circle className="w-4.5 h-4.5 text-slate-500 stroke-dasharray-4" />
                      ) : isDisabled ? (
                        <Lock className="w-4 h-4 text-slate-600" />
                      ) : (
                        <Circle className={`w-4.5 h-4.5 ${isCurrent ? 'text-amber-500' : 'text-slate-600'}`} />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium leading-none mb-1 flex items-center gap-1.5">
                        {step.title}
                        {isCurrent && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>}
                      </div>
                      <p className="text-xs text-slate-500 leading-tight">{step.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Pane / Step Content Workspace */}
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Step Title & Info eyebrow */}
                <div>
                  <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">
                    Step {currentStep + 1} of 10
                  </div>
                  <h3 className="text-xl font-bold text-slate-100">{STEPS[currentStep].title}</h3>
                  <p className="text-sm text-slate-400 mt-1">{STEPS[currentStep].description}</p>
                </div>

                {uiError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{uiError}</span>
                  </div>
                )}

                {/* STEP-SPECIFIC CONTENT INTERFACES */}

                {currentStep === 0 && (
                  /* Step 0: Site Details */
                  <div className="space-y-4 max-w-xl">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                        Site Name
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={siteForm.siteName}
                        onChange={(e) => setSiteForm({ ...siteForm, siteName: e.target.value })}
                        placeholder="e.g. Chester Distribution"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                        disabled={!canModifyConfig}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                        Site Code (ID)
                      </label>
                      <input
                        type="text"
                        value={siteForm.siteCode}
                        disabled
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-500 cursor-not-allowed"
                      />
                      <p className="text-xs text-slate-500">The site code is immutable and represents the secure identifier.</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                        Timezone
                        <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={siteForm.timezone}
                        onChange={(e) => setSiteForm({ ...siteForm, timezone: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                        disabled={!canModifyConfig}
                      >
                        <option value="Europe/London">Europe/London</option>
                        <option value="Europe/Paris">Europe/Paris</option>
                        <option value="America/New_York">America/New_York</option>
                        <option value="Asia/Tokyo">Asia/Tokyo</option>
                      </select>
                    </div>

                    {canModifyConfig && (
                      <div className="pt-4">
                        <button
                          onClick={handleSaveSiteDetails}
                          disabled={submitting}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          {submitting ? 'Saving...' : 'Save & Continue'}
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {currentStep === 1 && (
                  /* Step 1: Production Lines */
                  <div className="space-y-6">
                    {canModifyConfig && (
                      <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800 space-y-4">
                        <h4 className="text-sm font-semibold text-slate-300">Add Production Resource</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <input
                            type="text"
                            placeholder="Line Code (e.g. L1)"
                            value={newLineForm.lineCode}
                            onChange={(e) => setNewLineForm({ ...newLineForm, lineCode: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            placeholder="Line Name (e.g. Pack Line 1)"
                            value={newLineForm.lineName}
                            onChange={(e) => setNewLineForm({ ...newLineForm, lineName: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-sans"
                          />
                          <input
                            type="text"
                            placeholder="SAP Code (Optional)"
                            value={newLineForm.sapResourceCode}
                            onChange={(e) => setNewLineForm({ ...newLineForm, sapResourceCode: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                          <button
                            onClick={handleAddLine}
                            disabled={submitting}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-lg px-3 py-2 transition-colors flex items-center justify-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Line
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-300">Configured Resources ({lines.length})</h4>
                      {lines.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">No production lines configured yet. Add at least one.</p>
                      ) : (
                        <div className="border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800 bg-slate-950/20">
                          {lines.map((item) => (
                            <div key={item.id} className="flex justify-between items-center p-3 text-xs">
                              <div>
                                <span className="font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded mr-2">{item.lineCode}</span>
                                <span className="text-slate-200">{item.lineName}</span>
                                {item.sapResourceCode && <span className="text-slate-500 ml-2 font-mono">(SAP: {item.sapResourceCode})</span>}
                              </div>
                              {canModifyConfig && (
                                <button onClick={() => handleDeleteLine(item.id)} className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-slate-800 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 flex gap-3">
                      <button onClick={() => markStepComplete(1)} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center gap-1.5">
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  /* Step 2: Destinations */
                  <div className="space-y-6">
                    {canModifyConfig && (
                      <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800 space-y-4">
                        <h4 className="text-sm font-semibold text-slate-300">Add Destination</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <input
                            type="text"
                            placeholder="Code (e.g. NF)"
                            value={newDestForm.destinationCode}
                            onChange={(e) => setNewDestForm({ ...newDestForm, destinationCode: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            placeholder="Name (e.g. North Fleet)"
                            value={newDestForm.destinationName}
                            onChange={(e) => setNewDestForm({ ...newDestForm, destinationName: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-sans"
                          />
                          <select
                            value={newDestForm.destinationType}
                            onChange={(e) => setNewDestForm({ ...newDestForm, destinationType: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                          >
                            <option value="INTERNAL_SITE">Internal Site</option>
                            <option value="EXTERNAL_SITE">External Site</option>
                            <option value="CUSTOMER">Customer</option>
                          </select>
                          <button
                            onClick={handleAddDest}
                            disabled={submitting}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-lg px-3 py-2 transition-colors flex items-center justify-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Destination
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-300">Configured Destinations ({destinations.length})</h4>
                      {destinations.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">No operational destinations configured. Add at least one.</p>
                      ) : (
                        <div className="border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800 bg-slate-950/20">
                          {destinations.map((item) => (
                            <div key={item.id} className="flex justify-between items-center p-3 text-xs">
                              <div>
                                <span className="font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded mr-2">{item.destinationCode}</span>
                                <span className="text-slate-200">{item.destinationName}</span>
                                <span className="text-slate-500 ml-2 font-medium bg-slate-900 px-1 py-0.5 rounded text-[10px]">{item.destinationType}</span>
                              </div>
                              {canModifyConfig && (
                                <button onClick={() => handleDeleteDest(item.id)} className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-slate-800 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 flex gap-3">
                      <button
                        onClick={() => markStepComplete(2)}
                        disabled={destinations.length === 0}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  /* Step 3: Action Types */
                  <div className="space-y-6">
                    {canModifyConfig && (
                      <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800 space-y-4">
                        <h4 className="text-sm font-semibold text-slate-300">Add Action Type</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <input
                            type="text"
                            placeholder="Code (e.g. HOLD)"
                            value={newActionForm.code}
                            onChange={(e) => setNewActionForm({ ...newActionForm, code: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            placeholder="Label (e.g. Hold)"
                            value={newActionForm.label}
                            onChange={(e) => setNewActionForm({ ...newActionForm, label: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-sans"
                          />
                          <input
                            type="text"
                            placeholder="Description"
                            value={newActionForm.meaning}
                            onChange={(e) => setNewActionForm({ ...newActionForm, meaning: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-sans"
                          />
                          <button
                            onClick={handleAddAction}
                            disabled={submitting}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-lg px-3 py-2 transition-colors flex items-center justify-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Action
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-300">Configured Action Types ({actions.length})</h4>
                      {actions.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">No action types configured yet. Add at least one (e.g. HOLD, RELEASE).</p>
                      ) : (
                        <div className="border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800 bg-slate-950/20">
                          {actions.map((item) => (
                            <div key={item.id} className="flex justify-between items-center p-3 text-xs">
                              <div>
                                <span className="font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded mr-2">{item.code}</span>
                                <span className="text-slate-200">{item.label}</span>
                                <span className="text-slate-500 ml-2 italic">{item.meaning}</span>
                              </div>
                              {canModifyConfig && (
                                <button onClick={() => handleDeleteAction(item.id)} className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-slate-800 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 flex gap-3">
                      <button
                        onClick={() => markStepComplete(3)}
                        disabled={actions.length === 0}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {currentStep === 4 && (
                  /* Step 4: Priority Levels */
                  <div className="space-y-6">
                    {canModifyConfig && (
                      <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800 space-y-4">
                        <h4 className="text-sm font-semibold text-slate-300">Add Priority Level</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <input
                            type="text"
                            placeholder="Code (e.g. HIGH)"
                            value={newPriorityForm.code}
                            onChange={(e) => setNewPriorityForm({ ...newPriorityForm, code: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            placeholder="Label (e.g. High Priority)"
                            value={newPriorityForm.label}
                            onChange={(e) => setNewPriorityForm({ ...newPriorityForm, label: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-sans"
                          />
                          <input
                            type="number"
                            placeholder="Weight Level (e.g. 1)"
                            value={newPriorityForm.level}
                            onChange={(e) => setNewPriorityForm({ ...newPriorityForm, level: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                          <button
                            onClick={handleAddPriority}
                            disabled={submitting}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-lg px-3 py-2 transition-colors flex items-center justify-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Priority
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-300">Configured Priority Levels ({priorities.length})</h4>
                      {priorities.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">No priority levels configured yet. Add at least one.</p>
                      ) : (
                        <div className="border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800 bg-slate-950/20">
                          {priorities.map((item) => (
                            <div key={item.id} className="flex justify-between items-center p-3 text-xs">
                              <div>
                                <span className="font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded mr-2">{item.code}</span>
                                <span className="text-slate-200">{item.label}</span>
                                <span className="text-slate-500 ml-2 font-mono">(Rank Weight: {item.level})</span>
                              </div>
                              {canModifyConfig && (
                                <button onClick={() => handleDeletePriority(item.id)} className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-slate-800 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 flex gap-3">
                      <button
                        onClick={() => markStepComplete(4)}
                        disabled={priorities.length === 0}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {currentStep === 5 && (
                  /* Step 5: Operational Settings */
                  <div className="space-y-6 max-w-xl">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5 col-span-2">
                        <label className="text-xs font-semibold text-slate-400">Dashboard UI Title</label>
                        <input
                          type="text"
                          value={settingsForm.dashboardTitle}
                          onChange={(e) => setSettingsForm({ ...settingsForm, dashboardTitle: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-sans"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400">Fresh Inventory Window (min)</label>
                        <input
                          type="number"
                          value={settingsForm.inventoryFreshMinutes}
                          onChange={(e) => setSettingsForm({ ...settingsForm, inventoryFreshMinutes: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400">Aging Inventory Window (min)</label>
                        <input
                          type="number"
                          value={settingsForm.inventoryAgingMinutes}
                          onChange={(e) => setSettingsForm({ ...settingsForm, inventoryAgingMinutes: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400">Stale Inventory Window (min)</label>
                        <input
                          type="number"
                          value={settingsForm.inventoryStaleMinutes}
                          onChange={(e) => setSettingsForm({ ...settingsForm, inventoryStaleMinutes: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-400">TV Rotation Interval (sec)</label>
                        <input
                          type="number"
                          value={settingsForm.dashboardRotationSeconds}
                          onChange={(e) => setSettingsForm({ ...settingsForm, dashboardRotationSeconds: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                      <button onClick={handleSaveOperationalSettings} disabled={submitting} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center gap-1.5">
                        {submitting ? 'Saving...' : 'Save & Continue'}
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {currentStep === 6 && (
                  /* Step 6: Decision Settings Mapping */
                  <div className="space-y-6 max-w-2xl">
                    <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800 space-y-4">
                      <h4 className="text-sm font-semibold text-slate-300">Decision Engine Framework</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        The decision engine routes suggestions automatically. You can bootstrap a default mapping containing common parameters (HOLD, REVIEW, RELEASE mappings) with a single click.
                      </p>
                      
                      {canModifyConfig && (
                        <button
                          onClick={handleApplyRecommendedDecisionSettings}
                          disabled={submitting}
                          className="py-2 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <Sparkles className="w-4 h-4" />
                          Apply Recommended Starting Configuration
                        </button>
                      )}
                    </div>

                    {autoConfigLog && (
                      <div className="p-4 bg-slate-950 border border-slate-850 rounded-lg space-y-3">
                        <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Setup Log (Version {autoConfigLog.version})</h5>
                        
                        <div className="space-y-2 text-xs leading-relaxed">
                          {autoConfigLog.created.length > 0 && (
                            <div>
                              <span className="text-green-400 font-medium">Created:</span>
                              <ul className="list-disc pl-5 mt-1 text-slate-400 space-y-0.5">
                                {autoConfigLog.created.map((log, idx) => <li key={idx}>{log}</li>)}
                              </ul>
                            </div>
                          )}
                          {autoConfigLog.reused.length > 0 && (
                            <div>
                              <span className="text-amber-400 font-medium">Mapped (Reused):</span>
                              <ul className="list-disc pl-5 mt-1 text-slate-400 space-y-0.5">
                                {autoConfigLog.reused.map((log, idx) => <li key={idx}>{log}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {decisionConfig ? (
                      <div className="p-4 border border-green-500/20 bg-green-500/5 rounded-lg space-y-2 text-xs">
                        <div className="flex items-center gap-1.5 text-green-400 font-medium">
                          <CheckCircle className="w-4 h-4" />
                          <span>Decision Settings are mapped successfully!</span>
                        </div>
                        <div className="text-slate-400 grid grid-cols-2 gap-2 mt-1 font-mono text-[11px]">
                          <div>Hold Action ID: {decisionConfig.holdActionId || 'None'}</div>
                          <div>Review Action ID: {decisionConfig.reviewActionId || 'None'}</div>
                          <div>Release Action ID: {decisionConfig.releaseActionId || 'None'}</div>
                          <div>Urgent Priority ID: {decisionConfig.urgentPriorityId || 'None'}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 border border-amber-500/20 bg-amber-500/5 rounded-lg text-xs text-amber-400 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span>No decision configuration is loaded for this site yet. Apply the recommended setup above.</span>
                      </div>
                    )}

                    <div className="pt-4 flex gap-3">
                      <button
                        onClick={() => markStepComplete(6)}
                        disabled={!decisionConfig}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {currentStep === 7 && (
                  /* Step 7: Products */
                  <div className="space-y-6">
                    {canModifyConfig && (
                      <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800 space-y-4">
                        <h4 className="text-sm font-semibold text-slate-300">Add Product Manually</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <input
                            type="text"
                            placeholder="Product Code (e.g. P100)"
                            value={newProductForm.productCode}
                            onChange={(e) => setNewProductForm({ ...newProductForm, productCode: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                          <input
                            type="text"
                            placeholder="Description (e.g. Widget A)"
                            value={newProductForm.description}
                            onChange={(e) => setNewProductForm({ ...newProductForm, description: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-sans"
                          />
                          <input
                            type="text"
                            placeholder="Cases Per Pallet"
                            value={newProductForm.casesPerPallet}
                            onChange={(e) => setNewProductForm({ ...newProductForm, casesPerPallet: e.target.value })}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                          />
                          <button
                            onClick={handleAddProduct}
                            disabled={submitting}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-lg px-3 py-2 transition-colors flex items-center justify-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Product
                          </button>
                        </div>
                        
                        <div className="p-3 bg-slate-950 border border-slate-850 rounded-lg flex items-start gap-2 text-xs text-slate-400">
                          <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-slate-300">Quick tip:</span> Products can also be bulk imported through the inventory snapshot uploads screen inside the main Inventory workspace once onboarding is complete.
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-300">Configured Products ({products.length})</h4>
                      {products.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">No products exist in the database for this site. Add at least one manual product to continue.</p>
                      ) : (
                        <div className="border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800 bg-slate-950/20 max-h-60 overflow-y-auto">
                          {products.slice(0, 15).map((item) => (
                            <div key={item.id} className="flex justify-between items-center p-3 text-xs">
                              <div>
                                <span className="font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded mr-2">{item.productCode}</span>
                                <span className="text-slate-200">{item.description}</span>
                                <span className="text-slate-500 ml-2 font-mono">({item.casesPerPallet || 'No'} cases/pallet)</span>
                              </div>
                              {canModifyConfig && (
                                <button onClick={() => handleDeleteProduct(item.id)} className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-slate-800 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          {products.length > 15 && (
                            <div className="p-3 text-[11px] text-slate-500 italic text-center">
                              Showing first 15 of {products.length} products.
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 flex gap-3">
                      <button
                        onClick={() => markStepComplete(7)}
                        disabled={products.length === 0}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {currentStep === 8 && (
                  /* Step 8: Planning Rules */
                  <div className="space-y-6 max-w-xl">
                    <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800 space-y-3">
                      <h4 className="text-sm font-semibold text-slate-300">Product Planning Rules</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Product Planning Rules dictate holding windows, warehouse routing, and release exceptions. The system is designed to check for active rules scoped to your products.
                      </p>

                      <div className="flex items-center gap-2.5 p-3 bg-slate-950 border border-slate-850 rounded-lg">
                        <input
                          type="checkbox"
                          id="rule-override"
                          checked={ruleOverride}
                          onChange={(e) => setRuleOverride(e.target.checked)}
                          className="rounded border-slate-800 text-amber-500 focus:ring-amber-500/20 bg-slate-900"
                        />
                        <label htmlFor="rule-override" className="text-xs text-slate-300 cursor-pointer select-none">
                          Confirm that site-wide planning rules are sufficient for now
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-300">Active Planning Rules ({rules.length})</h4>
                      {rules.length === 0 ? (
                        <div className="p-4 border border-dashed border-slate-800 rounded-lg text-center text-xs text-slate-500">
                          No active planning rules created yet. You can configure rules later inside the main Product Planning Rules dashboard.
                        </div>
                      ) : (
                        <div className="border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800 bg-slate-950/20">
                          {rules.map((rule) => (
                            <div key={rule.id} className="p-3 text-xs flex justify-between items-center">
                              <div>
                                <span className="font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded mr-2">{rule.productCode || 'GLOBAL'}</span>
                                <span className="text-slate-200">Rule config: hold {rule.holdPeriodDays || 0} days</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 flex gap-3">
                      <button
                        onClick={handleSavePlanningRulesStep}
                        disabled={rules.length === 0 && !ruleOverride}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {currentStep === 9 && (
                  /* Step 9: Readiness Review & Complete */
                  <div className="space-y-6 max-w-2xl">
                    {runningChecks ? (
                      <div className="p-12 text-center space-y-3">
                        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        <p className="text-xs text-slate-400">Performing validation checks...</p>
                      </div>
                    ) : readiness ? (
                      <div className="space-y-6">
                        {/* BLOCKER CHECKS */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-slate-300">Operational Blockers (Must Resolve)</h4>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className={`p-3.5 border rounded-lg flex items-start gap-3 ${readiness.blockers.siteInactive ? 'bg-red-500/5 border-red-500/20' : 'bg-green-500/5 border-green-500/20'}`}>
                              <div className="mt-0.5 shrink-0">
                                {readiness.blockers.siteInactive ? (
                                  <AlertCircle className="w-4.5 h-4.5 text-red-500" />
                                ) : (
                                  <CheckCircle className="w-4.5 h-4.5 text-green-500" />
                                )}
                              </div>
                              <div>
                                <div className={`text-xs font-semibold ${readiness.blockers.siteInactive ? 'text-red-400' : 'text-green-400'}`}>Site Active Status</div>
                                <p className="text-[11px] text-slate-500 mt-0.5">Site must be set to active in order to log operations.</p>
                              </div>
                            </div>

                            <div className={`p-3.5 border rounded-lg flex items-start gap-3 ${readiness.blockers.noActiveDestination ? 'bg-red-500/5 border-red-500/20' : 'bg-green-500/5 border-green-500/20'}`}>
                              <div className="mt-0.5 shrink-0">
                                {readiness.blockers.noActiveDestination ? (
                                  <AlertCircle className="w-4.5 h-4.5 text-red-500" />
                                ) : (
                                  <CheckCircle className="w-4.5 h-4.5 text-green-500" />
                                )}
                              </div>
                              <div>
                                <div className={`text-xs font-semibold ${readiness.blockers.noActiveDestination ? 'text-red-400' : 'text-green-400'}`}>Operational Destination</div>
                                <p className="text-[11px] text-slate-500 mt-0.5">At least 1 active destination code is required. (Currently: {readiness.counts.destinations})</p>
                              </div>
                            </div>

                            <div className={`p-3.5 border rounded-lg flex items-start gap-3 ${readiness.blockers.decisionSettingsIncomplete ? 'bg-red-500/5 border-red-500/20' : 'bg-green-500/5 border-green-500/20'}`}>
                              <div className="mt-0.5 shrink-0">
                                {readiness.blockers.decisionSettingsIncomplete ? (
                                  <AlertCircle className="w-4.5 h-4.5 text-red-500" />
                                ) : (
                                  <CheckCircle className="w-4.5 h-4.5 text-green-500" />
                                )}
                              </div>
                              <div>
                                <div className={`text-xs font-semibold ${readiness.blockers.decisionSettingsIncomplete ? 'text-red-400' : 'text-green-400'}`}>Decision Parameters Mapping</div>
                                <p className="text-[11px] text-slate-500 mt-0.5">Hold, Review, and Release action codes must be mapped to decision parameters.</p>
                              </div>
                            </div>

                            <div className={`p-3.5 border rounded-lg flex items-start gap-3 ${readiness.blockers.noProducts ? 'bg-red-500/5 border-red-500/20' : 'bg-green-500/5 border-green-500/20'}`}>
                              <div className="mt-0.5 shrink-0">
                                {readiness.blockers.noProducts ? (
                                  <AlertCircle className="w-4.5 h-4.5 text-red-500" />
                                ) : (
                                  <CheckCircle className="w-4.5 h-4.5 text-green-500" />
                                )}
                              </div>
                              <div>
                                <div className={`text-xs font-semibold ${readiness.blockers.noProducts ? 'text-red-400' : 'text-green-400'}`}>Product Core Master Data</div>
                                <p className="text-[11px] text-slate-500 mt-0.5">At least 1 product code must exist. (Currently: {readiness.counts.products})</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* RECOMMENDATIONS CHECKS */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-slate-300">Operational Best Practices (Recommendations)</h4>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className={`p-3.5 border rounded-lg flex items-start gap-3 ${readiness.recommendations.noDisplayAccount ? 'bg-amber-500/5 border-amber-500/10' : 'bg-green-500/5 border-green-500/15'}`}>
                              <div className="mt-0.5 shrink-0">
                                {readiness.recommendations.noDisplayAccount ? (
                                  <Info className="w-4.5 h-4.5 text-amber-500" />
                                ) : (
                                  <CheckCircle className="w-4.5 h-4.5 text-green-500" />
                                )}
                              </div>
                              <div>
                                <div className={`text-xs font-semibold ${readiness.recommendations.noDisplayAccount ? 'text-amber-500/90' : 'text-green-400'}`}>TV Display Screen User Account</div>
                                <p className="text-[11px] text-slate-500 mt-0.5">Recommended to set up a dedicated account with the DISPLAY role for the warehouse TV screen.</p>
                              </div>
                            </div>

                             <div className={`p-3.5 border rounded-lg flex items-start gap-3 ${readiness.recommendations.noWarehouseOperator ? 'bg-amber-500/5 border-amber-500/10' : 'bg-green-500/5 border-green-500/15'}`}>
                              <div className="mt-0.5 shrink-0">
                                {readiness.recommendations.noWarehouseOperator ? (
                                  <Info className="w-4.5 h-4.5 text-amber-500" />
                                ) : (
                                  <CheckCircle className="w-4.5 h-4.5 text-green-500" />
                                )}
                              </div>
                              <div>
                                <div className={`text-xs font-semibold ${readiness.recommendations.noWarehouseOperator ? 'text-amber-500/90' : 'text-green-400'}`}>Warehouse execution operators</div>
                                <p className="text-[11px] text-slate-500 mt-0.5">Setup at least 1 user with the WAREHOUSE_OPERATOR role to acknowledge and complete tasks.</p>
                              </div>
                            </div>

                            <div className={`p-3.5 border rounded-lg flex items-start gap-3 ${readiness.recommendations.noPlanningRules ? 'bg-amber-500/5 border-amber-500/10' : 'bg-green-500/5 border-green-500/15'}`}>
                              <div className="mt-0.5 shrink-0">
                                {readiness.recommendations.noPlanningRules ? (
                                  <Info className="w-4.5 h-4.5 text-amber-500" />
                                ) : (
                                  <CheckCircle className="w-4.5 h-4.5 text-green-500" />
                                )}
                              </div>
                              <div>
                                <div className={`text-xs font-semibold ${readiness.recommendations.noPlanningRules ? 'text-amber-500/90' : 'text-green-400'}`}>Product Planning Rules</div>
                                <p className="text-[11px] text-slate-500 mt-0.5">No custom planning rules found. Standard site-wide default planning rules will apply.</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* COMPLETION TRIGGER BANNER */}
                        <div className="pt-4 flex items-center justify-between p-4 bg-slate-950/40 rounded-xl border border-slate-800">
                          <div>
                            <span className="text-xs text-slate-500">All blockers are resolved?</span>
                            <p className="text-xs text-slate-300 font-medium">Verify settings and commit operational readiness.</p>
                          </div>
                          
                          {canComplete && (
                            <button
                              onClick={handleCompleteOnboardingFlow}
                              disabled={submitting || Object.values(readiness.blockers).some(val => val === true)}
                              className="px-5 py-2.5 bg-green-500 hover:bg-green-600 text-slate-950 font-bold text-sm rounded-lg transition-all flex items-center gap-1.5 shadow-lg shadow-green-500/10 disabled:opacity-45 disabled:cursor-not-allowed"
                            >
                              <UserCheck className="w-4 h-4" />
                              {submitting ? 'Completing Setup...' : 'Complete Site Onboarding'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

              </div>

              {/* Sidebar bottom pagination controller */}
              <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
                <button
                  disabled={currentStep === 0}
                  onClick={() => setCurrentStep(prev => prev - 1)}
                  className="px-3 py-1.5 border border-slate-800 hover:bg-slate-800 hover:border-slate-750 text-xs text-slate-400 hover:text-slate-200 font-medium rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Previous
                </button>

                <div className="text-xs text-slate-500 font-medium">
                  {STEPS[currentStep].title}
                </div>

                <button
                  disabled={currentStep === STEPS.length - 1}
                  onClick={() => markStepComplete(currentStep, true)}
                  className="px-3 py-1.5 border border-slate-800 hover:bg-slate-800 hover:border-slate-750 text-xs text-slate-400 hover:text-slate-200 font-medium rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Skip Step
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
};

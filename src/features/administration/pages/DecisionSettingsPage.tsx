import React, { useState, useEffect } from 'react';
import { getSiteSettings, updateSiteSettings } from '../services/settingsService';
import { SiteSettings } from '../../../types/settings';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { Save, Wand2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';
import { 
  getDecisionConfiguration, 
  saveDecisionConfiguration, 
  ensureDefaultDecisionConfiguration 
} from '../../planning/services/decisionConfigurationService';
import { DecisionConfiguration } from '../../../types/decision';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../config/firebase';

export const DecisionSettingsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { tenantId, siteId } = useSiteContext();
  const [settings, setSettings] = useState<Partial<SiteSettings>>({
    upcomingProductionWindowHours: 12,
    promotionLookAheadDays: 7,
    activeDecisionEngineVersion: 'v1.0'
  });

  const [decisionConfig, setDecisionConfig] = useState<Partial<DecisionConfiguration>>({
    holdActionId: '',
    reviewActionId: '',
    releaseActionId: '',
    urgentPriorityId: '',
    normalPriorityId: '',
    lowPriorityId: '',
    defaultDestinationRules: {
      defaultDestinationId: '',
      allowFallbackDestination: true
    }
  });

  const [actionTypesOptions, setActionTypesOptions] = useState<{ id: string; label: string; code: string }[]>([]);
  const [priorityLevelsOptions, setPriorityLevelsOptions] = useState<{ id: string; label: string; code: string }[]>([]);
  const [destinationsOptions, setDestinationsOptions] = useState<{ id: string; name: string; code: string }[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoConfiguring, setAutoConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = async () => {
    if (!tenantId || !siteId) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch site settings
      const siteData = await getSiteSettings(tenantId, siteId);
      if (siteData) {
        setSettings(prev => ({ ...prev, ...siteData }));
      }

      // 2. Fetch options
      const [actionsSnap, prioritiesSnap, destsSnap] = await Promise.all([
        getDocs(query(collection(db, 'actionTypes'), where('tenantId', '==', tenantId))),
        getDocs(query(collection(db, 'priorityLevels'), where('tenantId', '==', tenantId))),
        getDocs(query(collection(db, 'destinations'), where('tenantId', '==', tenantId)))
      ]);

      const actions = actionsSnap.docs
        .filter(d => d.data().status === 'active')
        .map(d => ({ id: d.id, label: d.data().label || d.data().code, code: d.data().code }));
      
      const priorities = prioritiesSnap.docs
        .filter(d => d.data().status === 'active')
        .map(d => ({ id: d.id, label: d.data().label || d.data().code, code: d.data().code }));

      const dests = destsSnap.docs
        .filter(d => d.data().status === 'active' && (!d.data().siteId || d.data().siteId === siteId))
        .map(d => ({ id: d.id, name: d.data().destinationName || d.data().destinationCode || d.id, code: d.data().destinationCode }));

      setActionTypesOptions(actions);
      setPriorityLevelsOptions(priorities);
      setDestinationsOptions(dests);

      // 3. Fetch decision configuration
      const config = await getDecisionConfiguration(tenantId, siteId, false);
      if (config) {
        setDecisionConfig({
          configurationVersion: config.configurationVersion,
          holdActionId: config.holdActionId || '',
          reviewActionId: config.reviewActionId || '',
          releaseActionId: config.releaseActionId || '',
          urgentPriorityId: config.urgentPriorityId || '',
          normalPriorityId: config.normalPriorityId || '',
          lowPriorityId: config.lowPriorityId || '',
          defaultDestinationRules: {
            defaultDestinationId: config.defaultDestinationRules?.defaultDestinationId || '',
            allowFallbackDestination: config.defaultDestinationRules?.allowFallbackDestination !== false
          }
        });
      } else {
        // Auto initialize if not existing
        const auto = await ensureDefaultDecisionConfiguration(tenantId, siteId);
        if (auto) {
          setDecisionConfig({
            configurationVersion: auto.configurationVersion,
            holdActionId: auto.holdActionId || '',
            reviewActionId: auto.reviewActionId || '',
            releaseActionId: auto.releaseActionId || '',
            urgentPriorityId: auto.urgentPriorityId || '',
            normalPriorityId: auto.normalPriorityId || '',
            lowPriorityId: auto.lowPriorityId || '',
            defaultDestinationRules: {
              defaultDestinationId: auto.defaultDestinationRules?.defaultDestinationId || '',
              allowFallbackDestination: auto.defaultDestinationRules?.allowFallbackDestination !== false
            }
          });
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tenantId, siteId]);

  const handleSave = async () => {
    if (!tenantId || !siteId) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // 1. Save site settings
      const result1 = await updateSiteSettings(tenantId, siteId, settings, currentUser);
      if (!result1.success) {
        throw new Error(result1.error);
      }

      // 2. Save decision configuration
      const result2 = await saveDecisionConfiguration(tenantId, siteId, decisionConfig);
      if (!result2.success) {
        throw new Error(result2.error);
      }

      setSuccessMessage('Decision settings and action/priority mappings saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAutoConfigure = async () => {
    if (!tenantId || !siteId) return;
    setAutoConfiguring(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await ensureDefaultDecisionConfiguration(tenantId, siteId);
      await loadData();
      setSuccessMessage('Auto-configuration completed successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to auto-configure settings');
    } finally {
      setAutoConfiguring(false);
    }
  };

  const isConfigComplete = Boolean(
    decisionConfig.holdActionId &&
    decisionConfig.reviewActionId &&
    decisionConfig.releaseActionId &&
    decisionConfig.urgentPriorityId &&
    decisionConfig.normalPriorityId &&
    decisionConfig.lowPriorityId
  );

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Decision Settings" 
        description="Configure parameters, action mappings, and priority rules for the Recommendation & Decision Engine."
        actions={
          <button
            onClick={handleAutoConfigure}
            disabled={autoConfiguring || loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Wand2 className="w-4 h-4 text-brand-400" />
            {autoConfiguring ? 'Auto-Configuring...' : 'Auto-Configure Default Mappings'}
          </button>
        }
      />
      
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 rounded-md flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
          <div>{successMessage}</div>
        </div>
      )}

      {!loading && !isConfigComplete && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-md flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold text-sm">Decision Engine Configuration Incomplete</div>
            <div className="text-xs text-amber-400/80 mt-0.5">
              Please assign valid Action Types and Priority Levels below or click "Auto-Configure Default Mappings" so recommendations can be evaluated and approved.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engine Parameters */}
        <SectionCard title="Engine Parameters">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading parameters...</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Upcoming Production Window (Hours)</label>
                <input 
                  type="number" 
                  value={settings.upcomingProductionWindowHours || 12}
                  onChange={e => setSettings(p => ({ ...p, upcomingProductionWindowHours: parseInt(e.target.value) || 0 }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                />
                <p className="text-xs text-slate-500">How far ahead to look for upcoming production runs when calculating recommendations.</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Promotion Look-Ahead (Days)</label>
                <input 
                  type="number" 
                  value={settings.promotionLookAheadDays || 7}
                  onChange={e => setSettings(p => ({ ...p, promotionLookAheadDays: parseInt(e.target.value) || 0 }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                />
                <p className="text-xs text-slate-500">How many days to look ahead for active or upcoming promotions.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Active Decision Engine Version</label>
                <select 
                  value={settings.activeDecisionEngineVersion || 'v1.0'}
                  onChange={e => setSettings(p => ({ ...p, activeDecisionEngineVersion: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                >
                  <option value="v1.0">v1.0 (Standard Rules)</option>
                  <option value="v1.1">v1.1 (Aggressive Fulfillment)</option>
                  <option value="v2.0-beta">v2.0 Beta (AI Enhanced)</option>
                </select>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Action Type Mappings */}
        <SectionCard title="Action Type Mappings">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading action mappings...</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Hold Action Type <span className="text-red-400">*</span></label>
                <select 
                  value={decisionConfig.holdActionId || ''}
                  onChange={e => setDecisionConfig(p => ({ ...p, holdActionId: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                >
                  <option value="">-- Select Hold Action --</option>
                  {actionTypesOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label} ({opt.code})</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Action type applied when inventory/production requires holding.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Review Action Type <span className="text-red-400">*</span></label>
                <select 
                  value={decisionConfig.reviewActionId || ''}
                  onChange={e => setDecisionConfig(p => ({ ...p, reviewActionId: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                >
                  <option value="">-- Select Review Action --</option>
                  {actionTypesOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label} ({opt.code})</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Action type applied when manual planner review is needed.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Release Action Type <span className="text-red-400">*</span></label>
                <select 
                  value={decisionConfig.releaseActionId || ''}
                  onChange={e => setDecisionConfig(p => ({ ...p, releaseActionId: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                >
                  <option value="">-- Select Release Action --</option>
                  {actionTypesOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label} ({opt.code})</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Action type applied when releasing products for movement/picking.</p>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Priority Level Mappings */}
        <SectionCard title="Priority Level Mappings">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading priority mappings...</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Urgent Priority Level <span className="text-red-400">*</span></label>
                <select 
                  value={decisionConfig.urgentPriorityId || ''}
                  onChange={e => setDecisionConfig(p => ({ ...p, urgentPriorityId: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                >
                  <option value="">-- Select Urgent Priority --</option>
                  {priorityLevelsOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label} ({opt.code})</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Priority level assigned to critical stockout / urgent recommendations.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Normal Priority Level <span className="text-red-400">*</span></label>
                <select 
                  value={decisionConfig.normalPriorityId || ''}
                  onChange={e => setDecisionConfig(p => ({ ...p, normalPriorityId: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                >
                  <option value="">-- Select Normal Priority --</option>
                  {priorityLevelsOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label} ({opt.code})</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Priority level assigned to standard replenishment recommendations.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Low Priority Level <span className="text-red-400">*</span></label>
                <select 
                  value={decisionConfig.lowPriorityId || ''}
                  onChange={e => setDecisionConfig(p => ({ ...p, lowPriorityId: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                >
                  <option value="">-- Select Low Priority --</option>
                  {priorityLevelsOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label} ({opt.code})</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Priority level assigned to low urgency / advisory recommendations.</p>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Default Destination & Advanced Rules */}
        <SectionCard title="Destination Rules">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading destination rules...</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Default Destination</label>
                <select 
                  value={decisionConfig.defaultDestinationRules?.defaultDestinationId || ''}
                  onChange={e => setDecisionConfig(p => ({
                    ...p,
                    defaultDestinationRules: {
                      ...p.defaultDestinationRules,
                      defaultDestinationId: e.target.value
                    }
                  }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                >
                  <option value="">-- Optional: No Default Destination --</option>
                  {destinationsOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.name} ({opt.code})</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Default destination attached when creating operational priorities from recommendations.</p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox"
                  id="allowFallbackDestination"
                  checked={decisionConfig.defaultDestinationRules?.allowFallbackDestination !== false}
                  onChange={e => setDecisionConfig(p => ({
                    ...p,
                    defaultDestinationRules: {
                      ...p.defaultDestinationRules,
                      allowFallbackDestination: e.target.checked
                    }
                  }))}
                  className="rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500"
                />
                <label htmlFor="allowFallbackDestination" className="text-sm text-slate-300">
                  Allow Fallback Destination if rule destination is unspecified
                </label>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="flex justify-end pt-4">
        <button 
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 px-6 py-2.5 bg-brand-500 text-slate-900 rounded-md text-sm font-semibold hover:bg-brand-400 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Decision Settings'}
        </button>
      </div>
    </div>
  );
};


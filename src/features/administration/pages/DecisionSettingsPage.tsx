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
  autoConfigureDecisionSettings,
  incrementVersion
} from '../../planning/services/decisionConfigurationService';
import { DecisionConfiguration } from '../../../types/decision';
import { logAuditEvent } from '../../../services/auditService';
import { getDocuments, where } from '../../../services/dbService';

export const DecisionSettingsPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
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

  const [allActions, setAllActions] = useState<any[]>([]);
  const [allPriorities, setAllPriorities] = useState<any[]>([]);
  const [allDests, setAllDests] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoConfiguring, setAutoConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [isConfigMissing, setIsConfigMissing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [autoConfigStats, setAutoConfigStats] = useState<{
    created: string[];
    reused: string[];
    version: string;
  } | null>(null);

  const isAuthorizedToAutoConfigure = Boolean(
    userProfile && (userProfile.role === 'PLATFORM_SUPERUSER' || userProfile.role === 'TENANT_ADMIN')
  );

  const getRecordStatus = (id: string, type: 'action' | 'priority' | 'destination') => {
    if (!id) return null;
    if (type === 'action') {
      const match = allActions.find(a => a.id === id);
      return match ? match.status : 'missing';
    } else if (type === 'priority') {
      const match = allPriorities.find(p => p.id === id);
      return match ? match.status : 'missing';
    } else {
      const match = allDests.find(d => d.id === id);
      return match ? match.status : 'missing';
    }
  };

  const loadData = async () => {
    if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch site settings
      const siteData = await getSiteSettings(tenantId, siteId);
      if (siteData) {
        setSettings(prev => ({ ...prev, ...siteData }));
      }

      // 2. Fetch options (all status, to detect inactive references)
      const [actionsDocs, prioritiesDocs, destsDocs] = await Promise.all([
        getDocuments<any>('actionTypes', [where('tenantId', '==', tenantId)]),
        getDocuments<any>('priorityLevels', [where('tenantId', '==', tenantId)]),
        getDocuments<any>('destinations', [where('tenantId', '==', tenantId)])
      ]);

      const actionsList = actionsDocs.map(d => ({ id: d.id, label: d.label || d.code, code: d.code, status: d.status }));
      const prioritiesList = prioritiesDocs.map(d => ({ id: d.id, label: d.label || d.code, code: d.code, status: d.status }));
      const destsList = destsDocs.map(d => ({ id: d.id, name: d.destinationName || d.destinationCode || d.id, code: d.destinationCode, status: d.status, siteId: d.siteId }));

      setAllActions(actionsList);
      setAllPriorities(prioritiesList);
      setAllDests(destsList);

      const activeActions = actionsList.filter(a => a.status === 'active');
      const activePriorities = prioritiesList.filter(p => p.status === 'active');
      const activeDests = destsList.filter(d => d.status === 'active' && (!d.siteId || d.siteId === siteId));

      setActionTypesOptions(activeActions);
      setPriorityLevelsOptions(activePriorities);
      setDestinationsOptions(activeDests);

      // 3. Fetch decision configuration
      const config = await getDecisionConfiguration(tenantId, siteId, false);
      if (config) {
        setIsConfigMissing(false);
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
        setIsConfigMissing(true);
        setDecisionConfig({
          configurationVersion: '',
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
    setAutoConfigStats(null);

    try {
      const holdStatus = getRecordStatus(decisionConfig.holdActionId || '', 'action');
      const reviewStatus = getRecordStatus(decisionConfig.reviewActionId || '', 'action');
      const releaseStatus = getRecordStatus(decisionConfig.releaseActionId || '', 'action');
      const urgentStatus = getRecordStatus(decisionConfig.urgentPriorityId || '', 'priority');
      const normalStatus = getRecordStatus(decisionConfig.normalPriorityId || '', 'priority');
      const lowStatus = getRecordStatus(decisionConfig.lowPriorityId || '', 'priority');
      const destId = decisionConfig.defaultDestinationRules?.defaultDestinationId;
      const destStatus = destId ? getRecordStatus(destId, 'destination') : 'active';

      // Validate referenced records exist and are active
      if (!decisionConfig.holdActionId || holdStatus !== 'active' ||
          !decisionConfig.reviewActionId || reviewStatus !== 'active' ||
          !decisionConfig.releaseActionId || releaseStatus !== 'active' ||
          !decisionConfig.urgentPriorityId || urgentStatus !== 'active' ||
          !decisionConfig.normalPriorityId || normalStatus !== 'active' ||
          !decisionConfig.lowPriorityId || lowStatus !== 'active' ||
          (destId && destStatus !== 'active')) {
        setError('Cannot save configuration: One or more referenced records are missing or inactive.');
        setSaving(false);
        return;
      }

      const prevConfig = await getDecisionConfiguration(tenantId, siteId, false);
      const newVersion = incrementVersion(prevConfig?.configurationVersion || 'v1.0.0');

      // 1. Save site settings
      const result1 = await updateSiteSettings(tenantId, siteId, settings, currentUser);
      if (!result1.success) {
        throw new Error(result1.error);
      }

      // 2. Save decision configuration
      const updatedConfig = {
        ...decisionConfig,
        configurationVersion: newVersion
      };
      const result2 = await saveDecisionConfiguration(tenantId, siteId, updatedConfig);
      if (!result2.success) {
        throw new Error(result2.error);
      }

      // 3. Log Audit Event
      await logAuditEvent({
        tenantId,
        siteId,
        eventType: 'CONFIG_UPDATE',
        entityType: 'DecisionConfiguration',
        entityId: `${tenantId}_${siteId}`,
        summary: `Decision settings and mappings manually updated by ${userProfile?.email || currentUser?.email || 'Authorized User'}`,
        previousValue: prevConfig,
        newValue: updatedConfig,
        metadata: {
          authenticatedUser: userProfile?.email || currentUser?.email || 'Unknown',
          tenantId,
          siteId,
          configurationVersion: newVersion
        },
        performedBy: userProfile?.email || currentUser?.email || 'Unknown'
      });

      setSuccessMessage('Decision settings and action/priority mappings saved successfully.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAutoConfigureClick = () => {
    if (!isAuthorizedToAutoConfigure) {
      setError('Auto-configuration failed: You are not authorised to auto-configure the engine. Only Platform Superusers and Tenant Admins can perform this action.');
      return;
    }
    setShowConfirmModal(true);
  };

  const executeAutoConfigure = async () => {
    if (!tenantId || !siteId) return;
    setAutoConfiguring(true);
    setError(null);
    setSuccessMessage(null);
    setAutoConfigStats(null);

    try {
      const prevConfig = await getDecisionConfiguration(tenantId, siteId, false);

      const result = await autoConfigureDecisionSettings(tenantId, siteId, {
        overwriteExisting
      });

      if (result) {
        await logAuditEvent({
          tenantId,
          siteId,
          eventType: 'CONFIG_AUTO_CONFIGURE',
          entityType: 'DecisionConfiguration',
          entityId: `${tenantId}_${siteId}`,
          summary: `Decision settings auto-configured by ${userProfile?.email || currentUser?.email || 'Authorized User'}`,
          previousValue: prevConfig,
          newValue: result.configuration,
          metadata: {
            authenticatedUser: userProfile?.email || currentUser?.email || 'Unknown',
            tenantId,
            siteId,
            configurationCreated: true,
            recordsCreated: result.recordsCreated,
            recordsReused: result.recordsReused,
            configurationVersion: result.version
          },
          performedBy: userProfile?.email || currentUser?.email || 'Unknown'
        });

        setAutoConfigStats({
          created: result.recordsCreated,
          reused: result.recordsReused,
          version: result.version
        });

        setSuccessMessage('Auto-configuration completed successfully.');
        await loadData();
      } else {
        throw new Error('Auto-configuration utility execution returned empty result.');
      }
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

  const hasInactiveReferences = Boolean(
    !isConfigMissing &&
    isConfigComplete && (
      getRecordStatus(decisionConfig.holdActionId || '', 'action') !== 'active' ||
      getRecordStatus(decisionConfig.reviewActionId || '', 'action') !== 'active' ||
      getRecordStatus(decisionConfig.releaseActionId || '', 'action') !== 'active' ||
      getRecordStatus(decisionConfig.urgentPriorityId || '', 'priority') !== 'active' ||
      getRecordStatus(decisionConfig.normalPriorityId || '', 'priority') !== 'active' ||
      getRecordStatus(decisionConfig.lowPriorityId || '', 'priority') !== 'active' ||
      (decisionConfig.defaultDestinationRules?.defaultDestinationId && getRecordStatus(decisionConfig.defaultDestinationRules.defaultDestinationId, 'destination') !== 'active')
    )
  );

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Decision Settings" 
        description="Configure parameters, action mappings, and priority rules for the Recommendation & Decision Engine."
        actions={
          <button
            onClick={handleAutoConfigureClick}
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

      {autoConfigStats && (
        <div className="p-4 bg-brand-500/10 border border-brand-500/20 text-brand-300 rounded-md space-y-2 text-sm">
          <div className="font-semibold text-slate-200">Auto-Configuration Summary (Version {autoConfigStats.version})</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-medium text-slate-300 mb-1">Records Created ({autoConfigStats.created.length}):</p>
              {autoConfigStats.created.length > 0 ? (
                <ul className="list-disc pl-4 space-y-1 text-slate-400">
                  {autoConfigStats.created.map((item, idx) => <li key={idx}>{item}</li>)}
                </ul>
              ) : (
                <p className="text-slate-500 italic">None</p>
              )}
            </div>
            <div>
              <p className="font-medium text-slate-300 mb-1">Existing Records Reused ({autoConfigStats.reused.length}):</p>
              {autoConfigStats.reused.length > 0 ? (
                <ul className="list-disc pl-4 space-y-1 text-slate-400">
                  {autoConfigStats.reused.map((item, idx) => <li key={idx}>{item}</li>)}
                </ul>
              ) : (
                <p className="text-slate-500 italic">None</p>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && isConfigMissing && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold text-sm">Decision Configuration Missing</div>
            <div className="text-xs text-red-400/80 mt-0.5">
              Recommendations cannot be fully evaluated or approved until the configuration is completed. Please click "Auto-Configure Default Mappings" or manually select active references below and save.
            </div>
          </div>
        </div>
      )}

      {!loading && !isConfigMissing && !isConfigComplete && (
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

      {!loading && !isConfigMissing && isConfigComplete && hasInactiveReferences && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold text-sm">Decision Engine Configuration contains inactive references</div>
            <div className="text-xs text-red-400/80 mt-0.5">
              One or more mapped Action Types, Priority Levels, or Destinations are inactive or missing. Recommendations remain blocked.
            </div>
          </div>
        </div>
      )}

      {!loading && !isConfigMissing && isConfigComplete && !hasInactiveReferences && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 rounded-md flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold text-sm">Decision Engine Configuration is active and valid</div>
            <div className="text-xs text-green-400/80 mt-0.5">
              Recommendation evaluation and approval are fully enabled.
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
                <label htmlFor="holdActionId" className="text-sm font-medium text-slate-300">Hold Action Type <span className="text-red-400">*</span></label>
                <select 
                  id="holdActionId"
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
                <label htmlFor="reviewActionId" className="text-sm font-medium text-slate-300">Review Action Type <span className="text-red-400">*</span></label>
                <select 
                  id="reviewActionId"
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
                <label htmlFor="releaseActionId" className="text-sm font-medium text-slate-300">Release Action Type <span className="text-red-400">*</span></label>
                <select 
                  id="releaseActionId"
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
                <label htmlFor="urgentPriorityId" className="text-sm font-medium text-slate-300">Urgent Priority Level <span className="text-red-400">*</span></label>
                <select 
                  id="urgentPriorityId"
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
                <label htmlFor="normalPriorityId" className="text-sm font-medium text-slate-300">Normal Priority Level <span className="text-red-400">*</span></label>
                <select 
                  id="normalPriorityId"
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
                <label htmlFor="lowPriorityId" className="text-sm font-medium text-slate-300">Low Priority Level <span className="text-red-400">*</span></label>
                <select 
                  id="lowPriorityId"
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

      {/* Confirmation Modal overlay */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" id="confirm-modal">
          <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-brand-500/10 rounded-full text-brand-400">
                <Wand2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Confirm Auto-Configuration</h3>
                <p className="text-sm text-slate-400 mt-1">
                  This action will automatically configure or map the required parameters for the Decision Engine:
                </p>
              </div>
            </div>

            <div className="bg-slate-950/40 p-3 rounded border border-slate-800 space-y-2 text-xs text-slate-300">
              <p className="font-medium text-brand-300">The engine will create or map:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Hold, Review, and Release</strong> action types.</li>
                <li><strong>Urgent, Normal, and Low</strong> priority levels.</li>
                <li>A default <strong>Chester Hub (CH)</strong> destination and rules.</li>
              </ul>
              <p className="text-slate-400 mt-2">
                Only missing configuration items will be created. Existing valid action types, priorities, or destinations will be reused and won't be duplicated.
              </p>
            </div>

            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id="overwriteExisting"
                checked={overwriteExisting}
                onChange={(e) => setOverwriteExisting(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500"
              />
              <label htmlFor="overwriteExisting" className="text-xs text-slate-300">
                Overwrite existing manually configured mappings with defaults
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-md text-sm font-medium transition-colors"
                id="cancel-auto-config"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowConfirmModal(false);
                  await executeAutoConfigure();
                }}
                className="px-4 py-2 bg-brand-500 text-slate-900 hover:bg-brand-400 rounded-md text-sm font-semibold transition-colors"
                id="confirm-auto-config"
              >
                Yes, Auto-Configure
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

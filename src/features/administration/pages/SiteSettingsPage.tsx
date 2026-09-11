import React, { useState, useEffect } from 'react';
import { getSiteSettings, updateSiteSettings } from '../services/settingsService';
import { SiteSettings } from '../../../types/settings';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { Save, Building2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';
import { getDocuments } from '../../../services/dbService';

export const SiteSettingsPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const { tenantId, siteId, siteName: activeSiteName, timezone: activeTimezone, availableSites, setSite } = useSiteContext();
  const canEditConfig = userProfile?.role === 'TENANT_ADMIN' || userProfile?.role === 'PLATFORM_SUPERUSER';
  
  // Real sites available (excluding placeholders)
  const realSites = availableSites.filter(s => s.siteId !== 'GLOBAL' && s.siteId !== 'SETUP_REQUIRED');
  const [selectedSiteId, setSelectedSiteId] = useState<string>(
    (siteId && siteId !== 'GLOBAL' && siteId !== 'SETUP_REQUIRED') 
      ? siteId 
      : (realSites[0]?.siteId || '')
  );

  const effectiveSite = realSites.find(s => s.siteId === selectedSiteId) || realSites[0];
  const effectiveTenantId = effectiveSite?.tenantId || tenantId;
  const effectiveSiteId = effectiveSite?.siteId || '';

  const [settings, setSettings] = useState<Partial<SiteSettings>>({
    siteName: '',
    timezone: '',
    defaultUnitOfMeasureId: '',
    defaultDestinationId: ''
  });

  const [uomOptions, setUomOptions] = useState<{ id: string; code: string; name: string }[]>([]);
  const [destOptions, setDestOptions] = useState<{ id: string; code: string; name: string }[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Update selectedSiteId when active siteId changes
  useEffect(() => {
    if (siteId && siteId !== 'GLOBAL' && siteId !== 'SETUP_REQUIRED') {
      setSelectedSiteId(siteId);
    } else if (realSites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(realSites[0].siteId);
    }
  }, [siteId, realSites]);

  // Load UOM and Destination options
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [uoms, dests] = await Promise.all([
          getDocuments<any>('units_of_measure'),
          getDocuments<any>('destinations')
        ]);
        setUomOptions((uoms || []).map(u => ({ id: u.id, code: u.code, name: u.name || u.code })));
        setDestOptions((dests || []).map(d => ({ id: d.id, code: d.destinationCode || d.code, name: d.destinationName || d.name || d.code })));
      } catch (err) {
        console.error('Failed to load lookup options for site settings', err);
      }
    };
    loadOptions();
  }, [effectiveTenantId]);

  // Load site settings for effective site
  useEffect(() => {
    const fetchSettings = async () => {
      if (!effectiveTenantId || !effectiveSiteId || effectiveTenantId === 'GLOBAL' || effectiveSiteId === 'GLOBAL' || effectiveSiteId === 'SETUP_REQUIRED') {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setSaveSuccess(false);
      try {
        const data = await getSiteSettings(effectiveTenantId, effectiveSiteId);
        if (data) {
          setSettings({
            siteName: data.siteName || effectiveSite?.siteName || '',
            timezone: data.timezone || effectiveSite?.timezone || 'Europe/London',
            defaultUnitOfMeasureId: data.defaultUnitOfMeasureId || '',
            defaultDestinationId: data.defaultDestinationId || ''
          });
        } else {
          // Pre-populate defaults from site metadata
          setSettings({
            siteName: effectiveSite?.siteName || '',
            timezone: effectiveSite?.timezone || 'Europe/London',
            defaultUnitOfMeasureId: '',
            defaultDestinationId: ''
          });
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [effectiveTenantId, effectiveSiteId]);

  const handleSiteSelectChange = (newSiteId: string) => {
    setSelectedSiteId(newSiteId);
    const newSite = realSites.find(s => s.siteId === newSiteId);
    if (newSite) {
      setSite(newSite);
    }
  };

  const handleSave = async () => {
    if (!effectiveTenantId || !effectiveSiteId || effectiveSiteId === 'GLOBAL' || effectiveSiteId === 'SETUP_REQUIRED') {
      setError('Please select a valid site before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    
    const result = await updateSiteSettings(effectiveTenantId, effectiveSiteId, settings, currentUser);
    setSaving(false);
    if (!result.success) {
      setError(result.error || 'Failed to update site settings');
    } else {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    }
  };

  const handleChange = (field: keyof SiteSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const hasValidSite = Boolean(effectiveSiteId && effectiveSiteId !== 'GLOBAL' && effectiveSiteId !== 'SETUP_REQUIRED');

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Site Settings" 
        description="Configure general parameters, defaults, and timezone for the selected site."
      />
      
      {!canEditConfig && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-md text-sm">
          Notice: Setting up app configuration requires Tenant Admin or Superuser permissions. Planners and Viewers can view configuration in read-only mode.
        </div>
      )}

      {/* Site Selector Header */}
      {realSites.length > 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-500/10 rounded-lg border border-brand-500/20 text-brand-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Configuring Site</div>
              <div className="text-sm font-medium text-slate-200">{effectiveSite?.siteName} ({effectiveSite?.siteId})</div>
            </div>
          </div>

          {realSites.length > 1 && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-xs text-slate-400 whitespace-nowrap">Switch Site:</label>
              <select
                value={selectedSiteId}
                onChange={(e) => handleSiteSelectChange(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              >
                {realSites.map((s) => (
                  <option key={s.siteId} value={s.siteId}>
                    {s.siteName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <div className="font-semibold">No Operational Sites Found</div>
            <div className="text-xs text-amber-400/80 mt-0.5">
              To configure site settings, first create an operational site under <strong>Configuration &gt; Sites</strong>.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Site settings saved successfully.</span>
        </div>
      )}

      <SectionCard title="General Configuration">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading settings...</div>
        ) : !hasValidSite ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            Please add a site in the Configuration page to manage site-specific settings.
          </div>
        ) : (
          <div className="space-y-4 max-w-2xl">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Site Name</label>
              <input 
                type="text" 
                disabled={!canEditConfig}
                value={settings.siteName || ''}
                onChange={e => handleChange('siteName', e.target.value)}
                placeholder="e.g. Barrow Mill"
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed focus:border-brand-500 focus:outline-none"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Timezone</label>
              <input 
                type="text" 
                disabled={!canEditConfig}
                value={settings.timezone || ''}
                onChange={e => handleChange('timezone', e.target.value)}
                placeholder="e.g. Europe/London"
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Default Unit of Measure</label>
              {uomOptions.length > 0 ? (
                <select
                  disabled={!canEditConfig}
                  value={settings.defaultUnitOfMeasureId || ''}
                  onChange={e => handleChange('defaultUnitOfMeasureId', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed focus:border-brand-500 focus:outline-none"
                >
                  <option value="">-- None Selected --</option>
                  {uomOptions.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </select>
              ) : (
                <input 
                  type="text" 
                  disabled={!canEditConfig}
                  value={settings.defaultUnitOfMeasureId || ''}
                  onChange={e => handleChange('defaultUnitOfMeasureId', e.target.value)}
                  placeholder="Unit of measure ID"
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed focus:border-brand-500 focus:outline-none"
                />
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Default Destination</label>
              {destOptions.length > 0 ? (
                <select
                  disabled={!canEditConfig}
                  value={settings.defaultDestinationId || ''}
                  onChange={e => handleChange('defaultDestinationId', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed focus:border-brand-500 focus:outline-none"
                >
                  <option value="">-- None Selected --</option>
                  {destOptions.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              ) : (
                <input 
                  type="text" 
                  disabled={!canEditConfig}
                  value={settings.defaultDestinationId || ''}
                  onChange={e => handleChange('defaultDestinationId', e.target.value)}
                  placeholder="Destination ID"
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed focus:border-brand-500 focus:outline-none"
                />
              )}
            </div>
            
            {canEditConfig && (
              <div className="pt-4 flex justify-end">
                <button 
                  onClick={handleSave}
                  disabled={saving || !hasValidSite}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-slate-900 rounded-md text-sm font-medium hover:bg-brand-400 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

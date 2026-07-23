import React, { useState, useEffect } from 'react';
import { useDevelopmentContext } from '../../../contexts/DevelopmentContext';
import { getSiteSettings, updateSiteSettings } from '../services/settingsService';
import { SiteSettings } from '../../../types/settings';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { Save } from 'lucide-react';

export const SiteSettingsPage: React.FC = () => {
  const { tenantId, siteId, currentUser, userProfile } = useDevelopmentContext();
  const canEditConfig = userProfile?.role === 'TENANT_ADMIN' || userProfile?.role === 'PLATFORM_SUPERUSER';
  const [settings, setSettings] = useState<Partial<SiteSettings>>({
    siteName: '',
    timezone: '',
    defaultUnitOfMeasureId: '',
    defaultDestinationId: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!tenantId || !siteId) return;
      setLoading(true);
      try {
        const data = await getSiteSettings(tenantId, siteId);
        if (data) {
          setSettings(data);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [tenantId, siteId]);

  const handleSave = async () => {
    if (!tenantId || !siteId) return;
    setSaving(true);
    const result = await updateSiteSettings(tenantId, siteId, settings, currentUser);
    setSaving(false);
    if (!result.success) {
      alert(result.error);
    } else {
      alert('Site settings saved successfully.');
    }
  };

  const handleChange = (field: keyof SiteSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Site Settings" 
        description="Configure general settings for the current site."
      />
      
      {!canEditConfig && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-md text-sm">
          Notice: Setting up app configuration requires Tenant Admin or Superuser permissions. Planners and Viewers can view configuration in read-only mode.
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md text-sm">
          {error}
        </div>
      )}

      <SectionCard title="General Configuration">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : (
          <div className="space-y-4 max-w-2xl">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Site Name</label>
              <input 
                type="text" 
                disabled={!canEditConfig}
                value={settings.siteName || ''}
                onChange={e => handleChange('siteName', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Timezone</label>
              <input 
                type="text" 
                disabled={!canEditConfig}
                value={settings.timezone || ''}
                onChange={e => handleChange('timezone', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Default Unit of Measure (ID)</label>
              <input 
                type="text" 
                disabled={!canEditConfig}
                value={settings.defaultUnitOfMeasureId || ''}
                onChange={e => handleChange('defaultUnitOfMeasureId', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Default Destination (ID)</label>
              <input 
                type="text" 
                disabled={!canEditConfig}
                value={settings.defaultDestinationId || ''}
                onChange={e => handleChange('defaultDestinationId', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            
            {canEditConfig && (
              <div className="pt-4 flex justify-end">
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-slate-900 rounded-md text-sm font-medium hover:bg-brand-400 transition-colors disabled:opacity-50"
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

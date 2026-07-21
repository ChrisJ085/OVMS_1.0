import React, { useState, useEffect } from 'react';
import { useDevelopmentContext } from '../../../contexts/DevelopmentContext';
import { getSiteSettings, updateSiteSettings } from '../services/settingsService';
import { SiteSettings } from '../../../types/settings';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { Save } from 'lucide-react';

export const DashboardSettingsPage: React.FC = () => {
  const { tenantId, siteId, currentUser } = useDevelopmentContext();
  const [settings, setSettings] = useState<Partial<SiteSettings>>({
    dashboardTitle: '',
    dashboardRotationSeconds: 30,
    priorityPageSize: 10,
    announcementTickerActive: true,
    tickerSpeed: 2,
    completedPriorityTvRetentionMinutes: 60
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
          setSettings(prev => ({ ...prev, ...data }));
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
      alert('Dashboard settings saved successfully.');
    }
  };

  const handleChange = (field: keyof SiteSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Dashboard Settings" 
        description="Configure display settings for the TV Operations Dashboard."
      />
      
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md">
          {error}
        </div>
      )}

      <SectionCard title="TV Dashboard Configuration">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : (
          <div className="space-y-4 max-w-2xl">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Dashboard Title</label>
              <input 
                type="text" 
                value={settings.dashboardTitle || ''}
                onChange={e => handleChange('dashboardTitle', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Rotation Interval (Seconds)</label>
                <input 
                  type="number" 
                  value={settings.dashboardRotationSeconds || 30}
                  onChange={e => handleChange('dashboardRotationSeconds', parseInt(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Priorities Per Page</label>
                <input 
                  type="number" 
                  value={settings.priorityPageSize || 10}
                  onChange={e => handleChange('priorityPageSize', parseInt(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Completed Retention (Minutes)</label>
                <input 
                  type="number" 
                  value={settings.completedPriorityTvRetentionMinutes || 60}
                  onChange={e => handleChange('completedPriorityTvRetentionMinutes', parseInt(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Ticker Speed (1-5)</label>
                <input 
                  type="number" 
                  min="1" max="5"
                  value={settings.tickerSpeed || 2}
                  onChange={e => handleChange('tickerSpeed', parseInt(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-3 py-2">
              <input
                type="checkbox"
                id="tickerActive"
                checked={settings.announcementTickerActive !== false}
                onChange={e => handleChange('announcementTickerActive', e.target.checked)}
                className="w-4 h-4 bg-slate-900 border-slate-700 rounded text-brand-500 focus:ring-brand-500 focus:ring-offset-slate-950"
              />
              <label htmlFor="tickerActive" className="text-sm font-medium text-slate-300">
                Show Announcement Ticker
              </label>
            </div>
            
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
          </div>
        )}
      </SectionCard>
    </div>
  );
};

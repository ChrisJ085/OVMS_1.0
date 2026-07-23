import React, { useState, useEffect } from 'react';
import { getSiteSettings, updateSiteSettings } from '../services/settingsService';
import { SiteSettings } from '../../../types/settings';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { Save } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';

export const DataFreshnessSettingsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { tenantId, siteId } = useSiteContext();
  const [settings, setSettings] = useState<Partial<SiteSettings>>({
    inventoryFreshMinutes: 15,
    inventoryAgingMinutes: 60,
    inventoryStaleMinutes: 120
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
      alert('Data freshness settings saved successfully.');
    }
  };

  const handleChange = (field: keyof SiteSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Data Freshness" 
        description="Configure thresholds for data freshness warnings and alerts."
      />
      
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md">
          {error}
        </div>
      )}

      <SectionCard title="Inventory Freshness Thresholds">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : (
          <div className="space-y-4 max-w-2xl">
            <div className="space-y-2">
              <label className="text-sm font-medium text-green-400">Fresh (Minutes)</label>
              <input 
                type="number" 
                value={settings.inventoryFreshMinutes || 15}
                onChange={e => handleChange('inventoryFreshMinutes', parseInt(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
              />
              <p className="text-xs text-slate-500">Inventory data newer than this is considered fully accurate and fresh.</p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-amber-400">Aging (Minutes)</label>
              <input 
                type="number" 
                value={settings.inventoryAgingMinutes || 60}
                onChange={e => handleChange('inventoryAgingMinutes', parseInt(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
              />
              <p className="text-xs text-slate-500">Inventory data older than this will trigger a warning.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-red-400">Stale (Minutes)</label>
              <input 
                type="number" 
                value={settings.inventoryStaleMinutes || 120}
                onChange={e => handleChange('inventoryStaleMinutes', parseInt(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
              />
              <p className="text-xs text-slate-500">Inventory data older than this will trigger a critical alert and may suppress automated decisions.</p>
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

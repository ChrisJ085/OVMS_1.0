import React, { useState, useEffect } from 'react';
import { getSiteSettings, updateSiteSettings } from '../services/settingsService';
import { SiteSettings } from '../../../types/settings';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { Save } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';

export const DecisionSettingsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { tenantId, siteId } = useSiteContext();
  const [settings, setSettings] = useState<Partial<SiteSettings>>({
    upcomingProductionWindowHours: 12,
    promotionLookAheadDays: 7,
    activeDecisionEngineVersion: 'v1.0'
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
      alert('Decision settings saved successfully.');
    }
  };

  const handleChange = (field: keyof SiteSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Decision Settings" 
        description="Configure parameters for the Recommendation & Decision Engine."
      />
      
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md">
          {error}
        </div>
      )}

      <SectionCard title="Engine Parameters">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : (
          <div className="space-y-4 max-w-2xl">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Upcoming Production Window (Hours)</label>
              <input 
                type="number" 
                value={settings.upcomingProductionWindowHours || 12}
                onChange={e => handleChange('upcomingProductionWindowHours', parseInt(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
              />
              <p className="text-xs text-slate-500">How far ahead to look for upcoming production runs when calculating recommendations.</p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Promotion Look-Ahead (Days)</label>
              <input 
                type="number" 
                value={settings.promotionLookAheadDays || 7}
                onChange={e => handleChange('promotionLookAheadDays', parseInt(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
              />
              <p className="text-xs text-slate-500">How many days to look ahead for active or upcoming promotions.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Active Decision Engine Version</label>
              <select 
                value={settings.activeDecisionEngineVersion || 'v1.0'}
                onChange={e => handleChange('activeDecisionEngineVersion', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
              >
                <option value="v1.0">v1.0 (Standard Rules)</option>
                <option value="v1.1">v1.1 (Aggressive Fulfillment)</option>
                <option value="v2.0-beta">v2.0 Beta (AI Enhanced)</option>
              </select>
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

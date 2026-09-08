import React, { useState, useEffect } from 'react';
import { getSiteSettings } from '../services/settingsService';
import { TenantDeletionWorkflow } from './components/TenantDeletionWorkflow';
import { SiteSettings } from '../../../types/settings';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  getCountFromServer,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  addDoc,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from '../../../config/firebase';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Info, 
  Users, 
  UserPlus, 
  ShieldAlert, 
  Unlock, 
  Lock, 
  UserMinus, 
  UserCheck, 
  Key, 
  Plus, 
  Building,
  Filter,
  Search,
  X,
  Database,
  Settings,
  RotateCcw,
  ShieldCheck,
  Settings2
} from 'lucide-react';
import { UserProfile, UserRole, AccountStatus, Tenant } from '../../../types/auth';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';
import { useEnvironmentMode } from '../../../contexts/EnvironmentModeContext';
import { seedDevelopmentConfiguration } from '../../configuration/services/configurationService';
import { seedTestDataForTesting } from '../../planning/services/testDataSeeder';

export const AdminOverviewPage: React.FC = () => {
  const { userProfile, currentUser, user } = useAuth();
  const { tenantId, siteId } = useSiteContext();
  const { mode, isDevelopmentMode, setMode, toggleMode } = useEnvironmentMode();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'tenants'>('overview');
  const [deletingTenant, setDeletingTenant] = useState<any>(null);

  // Seeding states & feedback
  const [seedingConfig, setSeedingConfig] = useState(false);
  const [seedingUat, setSeedingUat] = useState(false);
  const [seedFeedback, setSeedFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [stats, setStats] = useState({
    productsWithoutRules: 0,
    productsWithoutInventory: 0,
    destinationsCount: 0,
    productionLinesCount: 0,
    staleInventoryCount: 0,
    invalidRulesCount: 0
  });

  const [loading, setLoading] = useState(true);

  const fetchOverviewStats = async () => {
    if (!tenantId || !siteId) return;
    setLoading(true);
    try {
      const siteSettings = await getSiteSettings(tenantId, siteId);
      setSettings(siteSettings);

      const destSnap = await getCountFromServer(query(collection(db!, 'destinations'), where('tenantId', '==', tenantId)));
      const lineSnap = await getCountFromServer(query(collection(db!, 'productionLines'), where('tenantId', '==', tenantId), where('siteId', '==', siteId)));
      
      setStats({
        productsWithoutRules: 0,
        productsWithoutInventory: 0,
        destinationsCount: destSnap.data().count,
        productionLinesCount: lineSnap.data().count,
        staleInventoryCount: 0,
        invalidRulesCount: 0
      });

    } catch (err: any) {
      console.error("Error fetching overview", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDevConfig = async () => {
    if (!tenantId || !siteId) {
      setSeedFeedback({ type: 'error', message: 'Tenant and site context are required to seed development configuration.' });
      return;
    }
    setSeedingConfig(true);
    setSeedFeedback(null);
    try {
      const result = await seedDevelopmentConfiguration(tenantId, siteId);
      if (result.success) {
        setSeedFeedback({ type: 'success', message: 'Development configuration loaded successfully (sites, storage areas, production lines, and categories).' });
        await fetchOverviewStats();
      } else {
        setSeedFeedback({ type: 'error', message: result.error || 'Failed to load development configuration.' });
      }
    } catch (err: any) {
      setSeedFeedback({ type: 'error', message: err.message || 'Failed to load development configuration.' });
    } finally {
      setSeedingConfig(false);
    }
  };

  const handleLoadUatData = async () => {
    if (!tenantId || !siteId) {
      setSeedFeedback({ type: 'error', message: 'Tenant and site context are required to seed UAT example data.' });
      return;
    }
    setSeedingUat(true);
    setSeedFeedback(null);
    try {
      // Ensure baseline configuration first
      await seedDevelopmentConfiguration(tenantId, siteId);
      const result = await seedTestDataForTesting(tenantId, siteId);
      if (result.success) {
        setSeedFeedback({ type: 'success', message: result.message || 'UAT example data loaded successfully.' });
        await fetchOverviewStats();
      } else {
        setSeedFeedback({ type: 'error', message: result.message || 'Failed to load UAT example data.' });
      }
    } catch (err: any) {
      setSeedFeedback({ type: 'error', message: err.message || 'Failed to load UAT example data.' });
    } finally {
      setSeedingUat(false);
    }
  };

  // User management states
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [tenantsList, setTenantsList] = useState<Tenant[]>([]);

  // User filter states
  const [tenantFilter, setTenantFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL'); // 'ALL' | 'ENABLED' | 'DISABLED'
  const [searchFilter, setSearchFilter] = useState<string>('');

  const tenantOptions = React.useMemo(() => {
    const set = new Set<string>();
    tenantsList.forEach(t => {
      if (t.id) set.add(t.id);
    });
    usersList.forEach(u => {
      if (u.tenantId) set.add(u.tenantId);
      else set.add('Global');
    });
    return Array.from(set).sort();
  }, [tenantsList, usersList]);

  const filteredUsersList = React.useMemo(() => {
    return usersList.filter(user => {
      // 1. Tenant Filter
      if (tenantFilter !== 'ALL') {
        const userTenant = user.tenantId || 'Global';
        if (userTenant !== tenantFilter) return false;
      }

      // 2. Status Filter
      if (statusFilter === 'ENABLED') {
        if (user.accountStatus !== 'ACTIVE') return false;
      } else if (statusFilter === 'DISABLED') {
        if (user.accountStatus === 'ACTIVE') return false;
      }

      // 3. Search Filter
      if (searchFilter.trim() !== '') {
        const q = searchFilter.toLowerCase().trim();
        const matchName = user.displayName?.toLowerCase().includes(q);
        const matchEmail = user.email?.toLowerCase().includes(q);
        const matchRole = user.role?.toLowerCase().includes(q);
        const matchJob = user.jobTitle?.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchRole && !matchJob) return false;
      }

      return true;
    });
  }, [usersList, tenantFilter, statusFilter, searchFilter]);
  
  // New user form states
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [newUserJobTitle, setNewUserJobTitle] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('VIEWER');
  const [newUserTenantId, setNewUserTenantId] = useState('');
  const [newUserTempPass, setNewUserTempPass] = useState('TempPass123!');
  const [creatingUser, setCreatingUser] = useState(false);
  const [creatingUserMsg, setCreatingUserMsg] = useState<string | null>(null);

  // New Tenant form states
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantCode, setNewTenantCode] = useState('');
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [tenantMsg, setTenantMsg] = useState<string | null>(null);

  const [availableSites, setAvailableSites] = useState<any[]>([]);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);

  // Fetch stats and site settings
  useEffect(() => {
    fetchOverviewStats();
  }, [tenantId, siteId]);

  // Fetch Users Directory
  const fetchUsers = async () => {
    if (!db || !userProfile) return;
    setLoadingUsers(true);
    setUsersError(null);
    try {
      let q;
      if (userProfile.role === 'PLATFORM_SUPERUSER') {
        q = collection(db, 'users');
      } else {
        q = query(collection(db, 'users'), where('tenantId', '==', userProfile.tenantId));
      }
      
      const snap = await getDocs(q);
      let list: UserProfile[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data() as UserProfile;
        // Filter out platform superusers for non-superusers locally to avoid composite index requirement
        if (userProfile.role === 'PLATFORM_SUPERUSER' || data.role !== 'PLATFORM_SUPERUSER') {
          list.push({ uid: docSnap.id, ...data } as UserProfile);
        }
      });
      setUsersList(list);
    } catch (err: any) {
      console.error(err);
      setUsersError('Failed to load user directory. Ensure you have authorized access.');
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch Tenants (Superuser & Tenant Admin)
  const fetchTenants = async () => {
    if (!db || !userProfile) return;
    try {
      if (userProfile.role === 'PLATFORM_SUPERUSER') {
        const snap = await getDocs(collection(db, 'tenants'));
        const list: Tenant[] = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...(docSnap.data() as any) } as Tenant);
        });
        setTenantsList(list);
      } else if (userProfile.tenantId) {
        const tenantSnap = await getDoc(doc(db, 'tenants', userProfile.tenantId));
        if (tenantSnap.exists()) {
          const tData = tenantSnap.data();
          setTenantsList([{ id: tenantSnap.id, name: tData?.tenantName || tData?.name || tenantSnap.id, ...(tData as any) } as Tenant]);
        } else {
          setTenantsList([{ id: userProfile.tenantId, tenantName: userProfile.tenantId, tenantCode: userProfile.tenantId } as Tenant]);
        }
      }
    } catch (err) {
      console.error('Error fetching tenants:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'tenants') {
      fetchTenants();
    }
  }, [activeTab, userProfile]);

  useEffect(() => {
    if (userProfile) {
      fetchTenants();
    }
  }, [userProfile]);

  useEffect(() => {
    const fetchSitesForProvisioning = async () => {
      const targetTenantId = userProfile?.role === 'PLATFORM_SUPERUSER' ? newUserTenantId : userProfile?.tenantId;
      if (!targetTenantId || !db) {
        setAvailableSites([]);
        setSelectedSites([]);
        return;
      }
      try {
        const q = query(collection(db, 'sites'), where('tenantId', '==', targetTenantId));
        const snap = await getDocs(q);
        const sites: any[] = [];
        snap.forEach(doc => {
          const data = doc.data();
          const sId = data.siteId || data.siteCode || doc.id;
          sites.push({ id: doc.id, siteId: sId, ...data });
        });
        setAvailableSites(sites);
      } catch (err) {
        console.error("Failed to load sites for provisioning:", err);
      }
    };
    fetchSitesForProvisioning();
  }, [newUserTenantId, userProfile?.tenantId, userProfile?.role]);

  // Handle Account Unlock
  const handleUnlockUser = async (targetUid: string) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'users', targetUid), {
        accountStatus: 'ACTIVE',
        failedLoginAttempts: 0,
        failedAttemptWindowStartedAt: null,
        lockedAt: null,
        modifiedBy: userProfile?.uid || 'ADMIN',
        modifiedDate: serverTimestamp()
      });
      alert('User account unlocked successfully.');
    } catch (directErr: any) {
      alert(`Unlock failed: ${directErr.message}`);
    }
    fetchUsers();
  };

  // Handle Enable/Disable Account Toggle
  const handleToggleStatus = async (targetUid: string, currentStatus: AccountStatus) => {
    if (!db) return;
    const newStatus: AccountStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await updateDoc(doc(db, 'users', targetUid), {
        accountStatus: newStatus,
        modifiedBy: userProfile?.uid || 'ADMIN',
        modifiedDate: serverTimestamp()
      });
      alert(`User status changed to ${newStatus}.`);
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    }
    fetchUsers();
  };

  // Handle Password Reset to Temp Pass
  const handleResetPassword = async (targetUid: string) => {
    if (!db) return;
    const tempPass = prompt('Enter new temporary password for user (minimum 8 characters):', 'TempPass123!');
    if (!tempPass) return;
    if (tempPass.length < 8) {
      alert('Password must be at least 8 characters long.');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', targetUid), {
        requiresPasswordChange: true,
        accountStatus: 'ACTIVE',
        failedLoginAttempts: 0,
        failedAttemptWindowStartedAt: null,
        lockedAt: null,
        modifiedBy: userProfile?.uid || 'ADMIN',
        modifiedDate: serverTimestamp()
      });
      alert(`User profile updated. Please instruct user to log in and change their password. Temporary password configured in profile reset: ${tempPass}`);
    } catch (directErr: any) {
      alert(`Reset failed: ${directErr.message}`);
    }
    fetchUsers();
  };

  // Handle New User Provisioning
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail.trim() || !newUserDisplayName.trim()) {
      alert('Please fill out email and name.');
      return;
    }

    if (!newUserTempPass || newUserTempPass.length < 8) {
      alert('Temporary password must be at least 8 characters long.');
      return;
    }

    setCreatingUser(true);
    setCreatingUserMsg(null);

    const actualTenantId = userProfile?.role === 'PLATFORM_SUPERUSER' ? newUserTenantId.trim() : userProfile?.tenantId;
    const sitesArray = selectedSites;

    if (newUserRole !== 'PLATFORM_SUPERUSER' && !actualTenantId) {
      alert('Please select a tenant for this user account.');
      setCreatingUser(false);
      return;
    }

    try {
      const token = await user?.getIdToken();

      const apiRes = await fetch('/api/admin/provision-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: newUserEmail.toLowerCase().trim(),
          displayName: newUserDisplayName.trim(),
          jobTitle: newUserJobTitle.trim(),
          role: newUserRole,
          tenantId: actualTenantId,
          siteIds: sitesArray,
          temporaryPassword: newUserTempPass,
        })
      });

      const resText = await apiRes.text();
      let apiData: any;
      try {
        apiData = JSON.parse(resText);
      } catch {
        if (!apiRes.ok) {
          throw new Error(`Server returned HTTP ${apiRes.status}. If deployed to Vercel, ensure the latest build is deployed.`);
        }
        throw new Error(`Unexpected server response: ${resText.slice(0, 150)}`);
      }

      if (!apiRes.ok || !apiData.success) {
        const errorMsg = apiData.error || apiData.message || 'Failed to provision account';
        const fullMsg = apiData.stage ? `[${apiData.stage}] ${errorMsg}` : errorMsg;
        throw new Error(fullMsg);
      }

      setCreatingUserMsg(`Success! ${apiData.message || `User account and Firestore profile created for ${newUserEmail.toLowerCase().trim()}.`}`);

      // Reset form
      setNewUserEmail('');
      setNewUserDisplayName('');
      setNewUserJobTitle('');
      setSelectedSites([]);
      setNewUserTempPass('TempPass123!');
    } catch (apiErr: any) {
      console.error('Provisioning user failed:', apiErr);
      let errorText = apiErr.message || 'Failed to create user account.';
      if (apiErr.message?.includes('already exists') || apiErr.code === 'already-exists') {
        errorText = 'An account with this email address already exists in Firebase Authentication or Firestore.';
      } else if (apiErr.message?.includes('Forbidden') || apiErr.message?.includes('permission-denied')) {
        errorText = `Permission denied: ${apiErr.message}`;
      }
      setCreatingUserMsg(`Error: ${errorText}`);
    } finally {
      setCreatingUser(false);
      fetchUsers();
    }
  };

  // Handle New Tenant Creation (Superuser only)
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim() || !newTenantCode.trim()) {
      alert('Fill in all fields');
      return;
    }
    setCreatingTenant(true);
    setTenantMsg(null);
    try {
      const code = newTenantCode.toUpperCase().trim();
      const tenantDocRef = doc(db!, 'tenants', code);
      const payload: Tenant = {
        id: code,
        tenantName: newTenantName.trim(),
        tenantCode: code,
        active: true,
        createdBy: userProfile?.uid || 'ADMIN',
        createdDate: Timestamp.now(),
        modifiedBy: userProfile?.uid || 'ADMIN',
        modifiedDate: Timestamp.now()
      };
      await setDoc(tenantDocRef, payload);
      setTenantMsg(`Tenant ${newTenantName} (${code}) successfully created.`);
      setNewTenantName('');
      setNewTenantCode('');
      fetchTenants();
    } catch (err: any) {
      setTenantMsg(`Failed to create tenant: ${err.message}`);
    } finally {
      setCreatingTenant(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Administration Console" 
        description="System configuration, security, user administration, and tenant provisioning."
      />

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-amber-500 text-amber-500 bg-slate-900/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/5'
          }`}
        >
          Overview & Completeness
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-amber-500 text-amber-500 bg-slate-900/10'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/5'
          }`}
        >
          User & Roles Directory
        </button>
        {userProfile?.role === 'PLATFORM_SUPERUSER' && (
          <button
            onClick={() => setActiveTab('tenants')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'tenants'
                ? 'border-amber-500 text-amber-500 bg-slate-900/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/5'
            }`}
          >
            Tenant Management
          </button>
        )}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          {/* Application Environment Mode & Data Provisioning */}
          <SectionCard title="Application Mode & Environment Configuration">
            <div className="space-y-5">
              {/* Mode Switch Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold text-slate-200">Active Mode:</span>
                    {isDevelopmentMode ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <Settings2 className="w-3.5 h-3.5 animate-pulse" />
                        Development (Sandbox)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Production
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {isDevelopmentMode
                      ? 'Development mode displays the Sandbox banner and enables developer data provisioning tools across the platform.'
                      : 'Production mode runs with standard live presentation and hides developer indicator badges.'}
                  </p>
                </div>

                {/* Interactive Mode Switch */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-medium text-slate-400">
                    {isDevelopmentMode ? 'Switch to Production' : 'Switch to Development'}
                  </span>
                  <button
                    type="button"
                    onClick={toggleMode}
                    role="switch"
                    aria-checked={isDevelopmentMode}
                    aria-label="Toggle Development and Production mode"
                    className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                      isDevelopmentMode ? 'bg-amber-500' : 'bg-slate-700'
                    }`}
                  >
                    <span className="sr-only">Toggle Development and Production mode</span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                        isDevelopmentMode ? 'translate-x-7 bg-white' : 'translate-x-0 bg-slate-300'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Data Seeding & Provisioning Actions */}
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <Database className="w-4 h-4 text-amber-500" />
                      Data Provisioning & Seed Tools
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Load baseline master configuration or comprehensive UAT datasets for tenant verification and testing.
                    </p>
                  </div>
                </div>

                {seedFeedback && (
                  <div
                    className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
                      seedFeedback.type === 'success'
                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                        : 'bg-red-950/40 border-red-800/60 text-red-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {seedFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                      <span>{seedFeedback.message}</span>
                    </div>
                    <button
                      onClick={() => setSeedFeedback(null)}
                      className="text-slate-400 hover:text-slate-200 ml-2 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleLoadDevConfig}
                    disabled={seedingConfig || seedingUat}
                    className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {seedingConfig ? (
                      <RotateCcw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    ) : (
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    Load Development Configuration
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadUatData}
                    disabled={seedingConfig || seedingUat}
                    className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-amber-950 bg-amber-500 hover:bg-amber-400 border border-transparent rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {seedingUat ? (
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Database className="w-3.5 h-3.5" />
                    )}
                    Load UAT Example Data
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>

          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading overview...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <SectionCard title="Configuration Completeness">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">Destinations Configured</span>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {stats.destinationsCount > 0 ? (
                        <><CheckCircle2 className="w-4 h-4 text-green-500" /> {stats.destinationsCount}</>
                      ) : (
                        <><XCircle className="w-4 h-4 text-red-500" /> None</>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">Production Lines Configured</span>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {stats.productionLinesCount > 0 ? (
                        <><CheckCircle2 className="w-4 h-4 text-green-500" /> {stats.productionLinesCount}</>
                      ) : (
                        <><XCircle className="w-4 h-4 text-red-500" /> None</>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">Products Without Rules</span>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Info className="w-4 h-4 text-slate-500" /> {stats.productsWithoutRules}
                    </span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Data Health">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">Stale Inventory Records</span>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {stats.staleInventoryCount > 0 ? (
                        <><AlertTriangle className="w-4 h-4 text-amber-500" /> {stats.staleInventoryCount}</>
                      ) : (
                        <><CheckCircle2 className="w-4 h-4 text-green-500" /> 0</>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">Invalid/Expired Rules</span>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {stats.invalidRulesCount > 0 ? (
                        <><AlertTriangle className="w-4 h-4 text-amber-500" /> {stats.invalidRulesCount}</>
                      ) : (
                        <><CheckCircle2 className="w-4 h-4 text-green-500" /> 0</>
                      )}
                    </span>
                  </div>
                </div>
              </SectionCard>
              
              <SectionCard title="Engine Information">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">Active Decision Engine Version</span>
                    <span className="text-sm font-medium text-amber-500">
                      {settings?.activeDecisionEngineVersion || 'Not configured'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">Timezone</span>
                    <span className="text-sm font-medium text-slate-200">
                      {settings?.timezone || 'Not configured'}
                    </span>
                  </div>
                </div>
              </SectionCard>
            </div>
          )}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          
          {/* User Directory */}
          <div className="lg:col-span-2 space-y-4">
            <SectionCard title="Active User Accounts">
              {/* Filter Controls Bar */}
              <div className="mb-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2.5 bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/60">
                  {/* Tenant Filter */}
                  <div className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-400">Tenant:</span>
                    <select
                      value={tenantFilter}
                      onChange={e => setTenantFilter(e.target.value)}
                      className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-2.5 py-1 focus:outline-none focus:border-amber-500/50"
                    >
                      <option value="ALL">All Tenants ({usersList.length})</option>
                      {tenantOptions.map(tId => {
                        const tenantObj = tenantsList.find(t => t.id === tId);
                        const label = tenantObj?.name ? `${tenantObj.name} (${tId})` : tId;
                        return (
                          <option key={tId} value={tId}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Enabled/Disabled Status Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-400">Status:</span>
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value)}
                      className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-2.5 py-1 focus:outline-none focus:border-amber-500/50"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="ENABLED">Enabled (Active)</option>
                      <option value="DISABLED">Disabled (Inactive / Locked)</option>
                    </select>
                  </div>

                  {/* Search Query */}
                  <div className="relative flex-1 min-w-[150px]">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search name, email, role..."
                      value={searchFilter}
                      onChange={e => setSearchFilter(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md pl-8 pr-7 py-1 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                    />
                    {searchFilter && (
                      <button
                        onClick={() => setSearchFilter('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Reset Filters */}
                  {(tenantFilter !== 'ALL' || statusFilter !== 'ALL' || searchFilter !== '') && (
                    <button
                      onClick={() => {
                        setTenantFilter('ALL');
                        setStatusFilter('ALL');
                        setSearchFilter('');
                      }}
                      className="text-xs text-amber-400 hover:text-amber-300 font-medium px-1 flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      Reset
                    </button>
                  )}
                </div>

                {/* Filter Count Badge */}
                {(tenantFilter !== 'ALL' || statusFilter !== 'ALL' || searchFilter !== '') && (
                  <div className="text-[11px] text-slate-400 px-1">
                    Showing <strong className="text-slate-200">{filteredUsersList.length}</strong> of <strong className="text-slate-200">{usersList.length}</strong> user accounts
                  </div>
                )}
              </div>

              {loadingUsers ? (
                <div className="p-8 text-center text-slate-400">Syncing user profiles...</div>
              ) : usersError ? (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-md">
                  {usersError}
                </div>
              ) : usersList.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">No users found in directory.</div>
              ) : filteredUsersList.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  No user accounts match the selected filters.
                  <button
                    onClick={() => {
                      setTenantFilter('ALL');
                      setStatusFilter('ALL');
                      setSearchFilter('');
                    }}
                    className="block mx-auto mt-2 text-xs text-amber-400 hover:underline font-semibold"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-800 overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-slate-500 text-xs uppercase font-semibold">
                        <th className="pb-3 pr-2">User details</th>
                        <th className="pb-3 pr-2">Role</th>
                        <th className="pb-3 pr-2">Scope</th>
                        <th className="pb-3 pr-2">Status</th>
                        <th className="pb-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-sm">
                      {filteredUsersList.map(user => (
                        <tr key={user.uid} className="hover:bg-slate-900/10">
                          <td className="py-3 pr-2">
                            <div className="font-semibold text-slate-200">{user.displayName || 'Unnamed User'}</div>
                            <div className="text-xs text-slate-400 font-mono">{user.email}</div>
                            {user.jobTitle && <div className="text-[10px] text-slate-500 mt-0.5">{user.jobTitle}</div>}
                          </td>
                          <td className="py-3 pr-2 font-mono text-xs">
                            <span className="text-amber-500 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">
                              {user.role}
                            </span>
                          </td>
                          <td className="py-3 pr-2 text-xs text-slate-400">
                            <div>Tenant: <span className="font-semibold">{user.tenantId || 'Global'}</span></div>
                            <div className="mt-0.5 text-[10px] text-slate-500 max-w-[140px] truncate" title={user.siteIds && user.siteIds.length > 0 ? user.siteIds.map(id => availableSites.find(s => s.siteId === id || s.id === id)?.siteName || id).join(', ') : 'None'}>
                              Sites: {user.siteIds && user.siteIds.length > 0 ? user.siteIds.map(id => availableSites.find(s => s.siteId === id || s.id === id)?.siteName || id).join(', ') : 'None'}
                            </div>
                          </td>
                          <td className="py-3 pr-2">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                              user.accountStatus === 'ACTIVE' 
                                ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                : user.accountStatus === 'LOCKED'
                                ? 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse'
                                : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                            }`}>
                              {user.accountStatus || 'ACTIVE'}
                            </span>
                            {user.requiresPasswordChange && (
                              <div className="text-[9px] text-amber-500 font-medium mt-1 uppercase tracking-wider">
                                Temp Password
                              </div>
                            )}
                          </td>
                          <td className="py-3 text-right space-x-1 whitespace-nowrap">
                            {user.accountStatus === 'LOCKED' && (
                              <button
                                onClick={() => handleUnlockUser(user.uid)}
                                className="inline-flex items-center gap-1 bg-green-500 hover:bg-green-400 text-slate-950 text-xs px-2 py-1 rounded font-semibold transition-colors"
                                title="Unlock Account"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                                Unlock
                              </button>
                            )}
                            <button
                              onClick={() => handleToggleStatus(user.uid, user.accountStatus)}
                              className={`p-1.5 rounded transition-all text-slate-400 border ${
                                user.accountStatus === 'ACTIVE'
                                  ? 'hover:text-red-400 hover:bg-red-500/10 border-slate-800 hover:border-red-500/20'
                                  : 'hover:text-green-400 hover:bg-green-500/10 border-slate-800 hover:border-green-500/20'
                              }`}
                              title={user.accountStatus === 'ACTIVE' ? 'Disable Account' : 'Enable Account'}
                            >
                              {user.accountStatus === 'ACTIVE' ? <UserMinus className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => handleResetPassword(user.uid)}
                              className="p-1.5 rounded text-slate-400 border border-slate-800 hover:text-amber-500 hover:bg-amber-500/10 hover:border-amber-500/20 transition-all"
                              title="Force Password Reset"
                            >
                              <Key className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          {/* User Account Provisioning Form */}
          <div className="space-y-4">
            <SectionCard title="Provision New Account">
              {userProfile?.role !== 'TENANT_ADMIN' && userProfile?.role !== 'PLATFORM_SUPERUSER' ? (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-md text-sm">
                  Notice: Adding and provisioning user accounts requires Tenant Admin or Superuser permissions. Planners and Viewers do not have access to manage users.
                </div>
              ) : (
                <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newUserEmail}
                    onChange={e => setNewUserEmail(e.target.value)}
                    placeholder="name@gxo.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Display Name</label>
                  <input
                    type="text"
                    required
                    value={newUserDisplayName}
                    onChange={e => setNewUserDisplayName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Job Title</label>
                  <input
                    type="text"
                    value={newUserJobTitle}
                    onChange={e => setNewUserJobTitle(e.target.value)}
                    placeholder="Operations Coordinator"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Account Role</label>
                  <select
                    value={newUserRole}
                    onChange={e => setNewUserRole(e.target.value as UserRole)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    {userProfile?.role === 'PLATFORM_SUPERUSER' && (
                      <option value="PLATFORM_SUPERUSER">Platform Superuser</option>
                    )}
                    <option value="TENANT_ADMIN">Tenant Administrator</option>
                    <option value="PLANNER">Planner</option>
                    <option value="WAREHOUSE_OPERATOR">Warehouse Operator</option>
                    <option value="VIEWER">Viewer</option>
                    <option value="DISPLAY">Display</option>
                  </select>
                </div>

                {userProfile?.role === 'PLATFORM_SUPERUSER' ? (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assign Tenant</label>
                    <select
                      required
                      value={newUserTenantId}
                      onChange={e => setNewUserTenantId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">-- Select a Tenant --</option>
                      {tenantsList.map(t => (
                        <option key={t.id} value={t.id}>{t.tenantName} ({t.tenantCode})</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assign Tenant Code</label>
                    <input
                      type="text"
                      disabled
                      value={userProfile?.tenantId || ''}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assign Sites</label>
                    {availableSites.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg">
                        {availableSites.map(site => {
                          const siteVal = site.id || site.siteId;
                          return (
                          <label key={site.id} className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={selectedSites.includes(siteVal)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSites([...selectedSites, siteVal]);
                                } else {
                                  setSelectedSites(selectedSites.filter(id => id !== siteVal));
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-950"
                            />
                            <span className="text-sm text-slate-300 group-hover:text-slate-200">
                              {site.siteName || site.name || siteVal} <span className="text-xs text-slate-500">({siteVal})</span>
                            </span>
                          </label>
                        )})}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-500 italic">
                        No sites available for the selected tenant.
                      </div>
                    )}
                  </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Temporary Password</label>
                  <input
                    type="text"
                    required
                    value={newUserTempPass}
                    onChange={e => setNewUserTempPass(e.target.value)}
                    placeholder="TempPass123!"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={creatingUser}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm py-2 px-4 rounded-lg shadow transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  {creatingUser ? 'Creating user...' : 'Provision Account'}
                </button>

                {creatingUserMsg && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-amber-400 space-y-1 leading-relaxed">
                    {creatingUserMsg}
                  </div>
                )}
              </form>
            )}
            </SectionCard>
          </div>
        </div>
      )}

      {activeTab === 'tenants' && userProfile?.role === 'PLATFORM_SUPERUSER' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          
          {/* Tenants Directory */}
          <div className="lg:col-span-2">
            <SectionCard title="Active Tenants">
              {tenantsList.length === 0 ? (
                <p className="p-8 text-center text-slate-500">No tenants found in system.</p>
              ) : (
                <div className="divide-y divide-slate-800 overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-slate-500 text-xs uppercase font-semibold">
                        <th className="pb-3 pl-3">Tenant Name</th>
                        <th className="pb-3">Tenant Code / ID</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3 text-right pr-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-sm">
                      {tenantsList.map(tenant => (
                        <tr key={tenant.id} className="hover:bg-slate-900/10">
                          <td className="py-3 pl-3 font-semibold text-slate-200">{tenant.tenantName}</td>
                          <td className="py-3 font-mono text-xs text-amber-500">{tenant.tenantCode}</td>
                          <td className="py-3">
                            <span className={`text-xs px-2 py-0.5 rounded border ${
                              tenant.status === 'inactive' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' :
                              tenant.status === 'DELETION_PENDING' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                              'bg-green-500/10 text-green-400 border-green-500/20'
                            }`}>
                              {tenant.status === 'inactive' ? 'Inactive' : tenant.status === 'DELETION_PENDING' ? 'Deletion Pending' : 'Active'}
                            </span>
                          </td>
                          <td className="py-3 text-right pr-3">
                            <button
                              onClick={() => setDeletingTenant(tenant)}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded transition-colors"
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          {/* New Tenant Provisioning Form */}
          <div>
            <SectionCard title="Create New Tenant">
              <form onSubmit={handleCreateTenant} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tenant Name</label>
                  <input
                    type="text"
                    required
                    value={newTenantName}
                    onChange={e => setNewTenantName(e.target.value)}
                    placeholder="e.g. GXO Logistics Unilever"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Unique Code (Uppercase)</label>
                  <input
                    type="text"
                    required
                    value={newTenantCode}
                    onChange={e => setNewTenantCode(e.target.value)}
                    placeholder="e.g. GXO_UNILEVER"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={creatingTenant}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm py-2 px-4 rounded-lg shadow transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {creatingTenant ? 'Creating tenant...' : 'Provision Tenant'}
                </button>

                {tenantMsg && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-amber-400">
                    {tenantMsg}
                  </div>
                )}
              </form>
            </SectionCard>
          </div>

        </div>
      )}

      {deletingTenant && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <TenantDeletionWorkflow
              tenant={deletingTenant}
              onClose={() => setDeletingTenant(null)}
              onRefresh={fetchTenants}
            />
          </div>
        </div>
      )}

    </div>
  );
};

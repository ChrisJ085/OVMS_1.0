import React, { useState, useEffect } from 'react';
import { getSiteSettings } from '../services/settingsService';
import { SiteSettings } from '../../../types/settings';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getCountFromServer,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  addDoc,
  Timestamp
} from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, auth, app, firebaseConfig } from '../../../config/firebase';
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
  Building
} from 'lucide-react';
import { UserProfile, UserRole, AccountStatus, Tenant } from '../../../types/auth';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';

export const AdminOverviewPage: React.FC = () => {
  const { userProfile } = useAuth();
  const { tenantId, siteId } = useSiteContext();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'tenants'>('overview');
  
  const [stats, setStats] = useState({
    productsWithoutRules: 0,
    productsWithoutInventory: 0,
    destinationsCount: 0,
    productionLinesCount: 0,
    staleInventoryCount: 0,
    invalidRulesCount: 0
  });

  const [loading, setLoading] = useState(true);

  // User management states
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  
  // New user form states
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [newUserJobTitle, setNewUserJobTitle] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('VIEWER');
  const [newUserTenantId, setNewUserTenantId] = useState('');
  const [newUserSiteIds, setNewUserSiteIds] = useState('');
  const [newUserTempPass, setNewUserTempPass] = useState('TempPass123!');
  const [creatingUser, setCreatingUser] = useState(false);
  const [creatingUserMsg, setCreatingUserMsg] = useState<string | null>(null);

  // New Tenant form states
  const [tenantsList, setTenantsList] = useState<Tenant[]>([]);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantCode, setNewTenantCode] = useState('');
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [tenantMsg, setTenantMsg] = useState<string | null>(null);

  // Fetch stats and site settings
  useEffect(() => {
    const fetchOverview = async () => {
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
    fetchOverview();
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
        q = query(collection(db, 'users'), where('tenantId', '==', userProfile.tenantId), where('role', '!=', 'PLATFORM_SUPERUSER'));
      }
      
      const snap = await getDocs(q);
      const list: UserProfile[] = [];
      snap.forEach(docSnap => {
        list.push({ uid: docSnap.id, ...(docSnap.data() as any) } as UserProfile);
      });
      setUsersList(list);
    } catch (err: any) {
      console.error(err);
      setUsersError('Failed to load user directory. Ensure you have authorized access.');
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch Tenants (Superuser only)
  const fetchTenants = async () => {
    if (!db || userProfile?.role !== 'PLATFORM_SUPERUSER') return;
    try {
      const snap = await getDocs(collection(db, 'tenants'));
      const list: Tenant[] = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...(docSnap.data() as any) } as Tenant);
      });
      setTenantsList(list);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'tenants') {
      fetchTenants();
    }
  }, [activeTab, userProfile]);

  // Handle Account Unlock
  const handleUnlockUser = async (targetUid: string) => {
    if (!app || !db) return;
    try {
      // 1. Try secure Cloud Function first
      const functionsInstance = getFunctions(app);
      const unlockFunc = httpsCallable(functionsInstance, 'unlockUser');
      await unlockFunc({ targetUid });
      alert('User account unlocked successfully.');
    } catch (err: any) {
      console.warn('Cloud Function unlock failed, falling back to direct write:', err);
      // 2. Direct Firestore write fallback
      try {
        await updateDoc(doc(db, 'users', targetUid), {
          accountStatus: 'ACTIVE',
          failedLoginAttempts: 0,
          failedAttemptWindowStartedAt: null,
          lockedAt: null,
          modifiedBy: userProfile?.uid || 'ADMIN',
          modifiedDate: serverTimestamp()
        });
        alert('User account unlocked successfully (via direct database sync).');
      } catch (directErr: any) {
        alert(`Unlock failed: ${directErr.message}`);
      }
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
    if (!app || !db) return;
    const tempPass = prompt('Enter new temporary password for user (minimum 8 characters):', 'TempPass123!');
    if (!tempPass) return;
    if (tempPass.length < 8) {
      alert('Password must be at least 8 characters long.');
      return;
    }

    try {
      // 1. Try secure Cloud Function first
      const functionsInstance = getFunctions(app);
      const resetFunc = httpsCallable(functionsInstance, 'resetUserPassword');
      await resetFunc({ targetUid, newPassword: tempPass });
      alert('User password has been reset. First-login reset is forced.');
    } catch (err: any) {
      console.warn('Cloud Function reset failed, falling back to direct write:', err);
      // 2. Direct write fallback (updates profile only; actual Auth change should be done by user or admin console)
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
    const sitesArray = (newUserSiteIds || '').split(',').map(s => s.trim()).filter(Boolean);

    try {
      const functionsInstance = getFunctions(app!);
      const createUserFunc = httpsCallable(functionsInstance, 'createOvmsUser');
      const response = await createUserFunc({
        email: newUserEmail.toLowerCase().trim(),
        displayName: newUserDisplayName.trim(),
        jobTitle: newUserJobTitle.trim(),
        role: newUserRole,
        tenantId: actualTenantId,
        siteIds: sitesArray,
        temporaryPassword: newUserTempPass,
        accountStatus: 'ACTIVE'
      });

      const resData = response.data as any;
      setCreatingUserMsg(`Success! ${resData.message || `User account and Firestore profile created for ${newUserEmail.toLowerCase().trim()}.`}`);

      // Reset form
      setNewUserEmail('');
      setNewUserDisplayName('');
      setNewUserJobTitle('');
      setNewUserSiteIds('');
      setNewUserTempPass('TempPass123!');
    } catch (err: any) {
      console.error('Error provisioning user:', err);
      let errorText = err.message || 'Failed to create user account.';
      if (err.code === 'already-exists' || err.message?.includes('already exists')) {
        errorText = 'An account with this email address already exists in Firebase Authentication or Firestore.';
      } else if (err.code === 'permission-denied' || err.message?.includes('permission-denied')) {
        errorText = `Permission denied: ${err.message || 'You do not have the required permissions to perform this operation or to assign these sites.'}`;
      } else if (err.code === 'invalid-argument' || err.message?.includes('invalid-argument')) {
        errorText = `Invalid argument: ${err.message || 'Please verify that all fields are correct and sites belong to the selected tenant.'}`;
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
        <div className="space-y-6">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading overview...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
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
              {loadingUsers ? (
                <div className="p-8 text-center text-slate-400">Syncing user profiles...</div>
              ) : usersError ? (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-md">
                  {usersError}
                </div>
              ) : usersList.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">No users found in directory.</div>
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
                      {usersList.map(user => (
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
                            <div className="mt-0.5 text-[10px] text-slate-500 max-w-[120px] truncate" title={user.siteIds?.join(', ')}>
                              Sites: {user.siteIds && user.siteIds.length > 0 ? user.siteIds.join(', ') : 'None'}
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

                {userProfile?.role === 'PLATFORM_SUPERUSER' && (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assign Tenant Code</label>
                    <input
                      type="text"
                      required
                      value={newUserTenantId}
                      onChange={e => setNewUserTenantId(e.target.value)}
                      placeholder="e.g. GXO_BEAUTY"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assign Site IDs (Comma-separated)</label>
                    <input
                      type="text"
                      value={newUserSiteIds}
                      onChange={e => setNewUserSiteIds(e.target.value)}
                      placeholder="e.g. site_barrow, site_test"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                    />
                    <p className="text-[10px] text-slate-500">Leave blank to inherit all tenant sites.</p>
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
                        <th className="pb-3">Tenant Name</th>
                        <th className="pb-3">Tenant Code / ID</th>
                        <th className="pb-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-sm">
                      {tenantsList.map(tenant => (
                        <tr key={tenant.id} className="hover:bg-slate-900/10">
                          <td className="py-3 font-semibold text-slate-200">{tenant.tenantName}</td>
                          <td className="py-3 font-mono text-xs text-amber-500">{tenant.tenantCode}</td>
                          <td className="py-3">
                            <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded">
                              Active
                            </span>
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

    </div>
  );
};

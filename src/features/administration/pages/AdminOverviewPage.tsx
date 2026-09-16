import React, { useState, useEffect } from 'react';
import { getSiteSettings } from '../services/settingsService';
import { TenantDeletionWorkflow } from './components/TenantDeletionWorkflow';
import { SiteSettings } from '../../../types/settings';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { supabase } from '../../../config/supabase';
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
  Settings2,
  Compass,
  ArrowRight,
  Sparkles,
  Play,
  CheckCircle,
  Activity,
  MapPin,
  Tag,
  Sliders,
  LineChart,
  ListChecks,
  RefreshCw,
  Copy,
  Check,
  Eye,
  EyeOff,
  Mail,
  ExternalLink,
  Trash2,
  UserCog
} from 'lucide-react';
import { UserProfile, UserRole, AccountStatus, Tenant } from '../../../types/auth';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';
import { useEnvironmentMode } from '../../../contexts/EnvironmentModeContext';
import { useSiteOnboarding } from '../../../hooks/useSiteOnboarding';
import { SiteOnboardingWizard } from '../../../components/onboarding/SiteOnboardingWizard';
import { 
  completeSiteOnboarding, 
  reopenSiteOnboarding, 
  resetSiteOnboarding, 
  initializeSiteOnboarding,
  runSiteReadinessChecks,
  ReadinessCheckResult
} from '../../configuration/services/siteOnboardingService';
import { isValidUuid } from '../services/settingsService';
import { seedDevelopmentConfiguration } from '../../configuration/services/configurationService';
import { seedTestDataForTesting } from '../../planning/services/testDataSeeder';
import { getDocument, getDocuments, where } from '../../../services/dbService';
import { toSnakeCase } from '../../../utils/caseTransformers';

const ONBOARDING_STEPS = [
  { id: 0, title: 'Site Details', icon: Compass, description: 'Verify name, code, and timezone' },
  { id: 1, title: 'Production Lines', icon: Activity, description: 'Active line resources' },
  { id: 2, title: 'Destinations', icon: MapPin, description: 'Operational destinations' },
  { id: 3, title: 'Action Types', icon: Tag, description: 'Hold, Review, Release actions' },
  { id: 4, title: 'Priority Levels', icon: Sliders, description: 'Priority weights & severity' },
  { id: 5, title: 'Operational Settings', icon: Settings, description: 'Inventory & TV parameters' },
  { id: 6, title: 'Decision Settings', icon: Sparkles, description: 'Decision matrix mappings' },
  { id: 7, title: 'Products', icon: Tag, description: 'Product catalog & units' },
  { id: 8, title: 'Planning Rules', icon: LineChart, description: 'Production planning constraints' },
  { id: 9, title: 'Readiness Review', icon: CheckCircle, description: 'Readiness checks & completion' }
];

// Helper to generate strong system-generated temporary password
const generateSecureTemporaryPassword = (): string => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%*?";
  
  let pwd = "";
  // 3 upper, 4 lower, 3 digits, 2 symbols = 12 chars
  for (let i = 0; i < 3; i++) pwd += upper[Math.floor(Math.random() * upper.length)];
  for (let i = 0; i < 4; i++) pwd += lower[Math.floor(Math.random() * lower.length)];
  for (let i = 0; i < 3; i++) pwd += digits[Math.floor(Math.random() * digits.length)];
  for (let i = 0; i < 2; i++) pwd += symbols[Math.floor(Math.random() * symbols.length)];
  
  return pwd.split('').sort(() => 0.5 - Math.random()).join('');
};

export interface ProvisionedWelcomeModalData {
  email: string;
  displayName: string;
  temporaryPassword: string;
  role: string;
  tenantName: string;
  assignedSites: string[];
  loginUrl: string;
  type?: 'PROVISION' | 'RESET';
}

const buildWelcomeEmailText = (data: ProvisionedWelcomeModalData): string => {
  const isReset = data.type === 'RESET';
  const sitesLine = data.assignedSites && data.assignedSites.length > 0
    ? `Assigned Sites: ${data.assignedSites.join(', ')}\n`
    : '';

  if (isReset) {
    return `Subject: OpsVis - Your Password Has Been Reset

Hi ${data.displayName || 'there'},

Your password for the Operational Visibility Management System (OpsVis) has been reset by your system administrator.

Below are your updated account login credentials:
--------------------------------------------------
Portal URL: ${data.loginUrl}
Username / Email: ${data.email}
New Temporary Password: ${data.temporaryPassword}
Role: ${data.role.replace(/_/g, ' ')}
Organization: ${data.tenantName}
${sitesLine}--------------------------------------------------

SECURITY NOTICE:
For security reasons, you will be prompted to set a new password upon your next log in.

Getting Started:
1. Visit ${data.loginUrl}
2. Log in using your email address and the new temporary password above.
3. You will be prompted to create your new secure personal password.

If you did not request this password reset or have any questions, please contact your system administrator.

Best regards,
OpsVis Administration`;
  }

  return `Subject: Welcome to OpsVis - Your Account Login Credentials

Hi ${data.displayName || 'there'},

Your user account for the Operational Visibility Management System (OpsVis) has been created.

Below are your account login credentials:
--------------------------------------------------
Portal URL: ${data.loginUrl}
Username / Email: ${data.email}
Temporary Password: ${data.temporaryPassword}
Role: ${data.role.replace(/_/g, ' ')}
Organization: ${data.tenantName}
${sitesLine}--------------------------------------------------

SECURITY NOTICE:
For security reasons, you will be prompted to set a new password upon your initial log in.

Getting Started:
1. Visit ${data.loginUrl}
2. Log in using your email address and the temporary password above.
3. You will be prompted to create your new secure personal password.

If you have any questions or require assistance, please contact your system administrator.

Best regards,
OpsVis Administration`;
};

export const AdminOverviewPage: React.FC = () => {
  const { userProfile, currentUser, user } = useAuth();
  const { tenantId, siteId, site, siteName } = useSiteContext();
  const { mode, isDevelopmentMode, setMode, toggleMode } = useEnvironmentMode();
  const { onboarding, isComplete: isOnboardingComplete, canComplete, canModifyConfig } = useSiteOnboarding();

  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'tenants'>('overview');
  const [deletingTenant, setDeletingTenant] = useState<any>(null);

  // Onboarding modal & actions
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [onboardingActionLoading, setOnboardingActionLoading] = useState(false);
  const [onboardingFeedback, setOnboardingFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [readinessResult, setReadinessResult] = useState<ReadinessCheckResult | null>(null);

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
    if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL' || siteId === 'SETUP_REQUIRED' || !isValidUuid(tenantId) || !isValidUuid(siteId)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const siteSettings = await getSiteSettings(tenantId, siteId);
      setSettings(siteSettings);

      const destDocs = await getDocuments('destinations', [where('tenantId', '==', tenantId)]);
      const lineDocs = await getDocuments('productionLines', [where('tenantId', '==', tenantId), where('siteId', '==', siteId)]);
      
      setStats({
        productsWithoutRules: 0,
        productsWithoutInventory: 0,
        destinationsCount: destDocs.length,
        productionLinesCount: lineDocs.length,
        staleInventoryCount: 0,
        invalidRulesCount: 0
      });

      try {
        const checkRes = await runSiteReadinessChecks(tenantId, siteId);
        setReadinessResult(checkRes);
      } catch (checkErr) {
        console.warn('Readiness check failed:', checkErr);
      }

    } catch (err: any) {
      console.error("Error fetching overview", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartOrContinueOnboarding = () => {
    if (!tenantId || !siteId || siteId === 'SETUP_REQUIRED') {
      setOnboardingFeedback({ type: 'error', message: 'Please select a valid site to start onboarding.' });
      return;
    }
    setOnboardingFeedback(null);
    setShowOnboardingWizard(true);
  };

  const handleCompleteOnboardingDirectly = async () => {
    if (!tenantId || !siteId || siteId === 'SETUP_REQUIRED') return;
    if (!window.confirm('Are you sure you want to complete onboarding for this site? This will transition the site to active operational mode.')) {
      return;
    }
    setOnboardingActionLoading(true);
    setOnboardingFeedback(null);
    try {
      await completeSiteOnboarding(tenantId, siteId, userProfile?.uid || 'ADMIN');
      setOnboardingFeedback({ type: 'success', message: 'Site onboarding completed successfully! The site is now marked fully operational.' });
      await fetchOverviewStats();
    } catch (err: any) {
      setOnboardingFeedback({ type: 'error', message: err?.message || 'Error completing onboarding.' });
    } finally {
      setOnboardingActionLoading(false);
    }
  };

  const handleReopenOnboardingDirectly = async () => {
    if (!tenantId || !siteId || siteId === 'SETUP_REQUIRED') return;
    if (!window.confirm('Are you sure you want to reopen onboarding for this site? This will set the site status back to ONBOARDING mode to permit guided adjustments.')) {
      return;
    }
    setOnboardingActionLoading(true);
    setOnboardingFeedback(null);
    try {
      await reopenSiteOnboarding(tenantId, siteId, userProfile?.uid || 'ADMIN');
      setOnboardingFeedback({ type: 'success', message: 'Site onboarding reopened. You can now step through and adjust onboarding settings.' });
      await fetchOverviewStats();
    } catch (err: any) {
      setOnboardingFeedback({ type: 'error', message: err?.message || 'Error reopening onboarding.' });
    } finally {
      setOnboardingActionLoading(false);
    }
  };

  const handleResetOnboardingDirectly = async () => {
    if (!tenantId || !siteId || siteId === 'SETUP_REQUIRED') return;
    if (!window.confirm('Are you sure you want to reset site onboarding progress? This will reset all steps back to Step 1 (Site Details).')) {
      return;
    }
    setOnboardingActionLoading(true);
    setOnboardingFeedback(null);
    try {
      await resetSiteOnboarding(tenantId, siteId, userProfile?.uid || 'ADMIN');
      setOnboardingFeedback({ type: 'success', message: 'Site onboarding progress reset to Step 1.' });
      await fetchOverviewStats();
    } catch (err: any) {
      setOnboardingFeedback({ type: 'error', message: err?.message || 'Error resetting onboarding.' });
    } finally {
      setOnboardingActionLoading(false);
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
      const result = await seedDevelopmentConfiguration(tenantId, siteId, userProfile?.uid || 'ADMIN');
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
      await seedDevelopmentConfiguration(tenantId, siteId, userProfile?.uid || 'ADMIN');
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
  const [newUserTempPass, setNewUserTempPass] = useState(() => generateSecureTemporaryPassword());
  const [showNewUserTempPass, setShowNewUserTempPass] = useState(true);
  const [copiedFormTempPass, setCopiedFormTempPass] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [creatingUserMsg, setCreatingUserMsg] = useState<string | null>(null);

  // Welcome modal after provisioning / password reset state
  const [provisionedUserModal, setProvisionedUserModal] = useState<ProvisionedWelcomeModalData | null>(null);
  const [copiedWelcomeEmail, setCopiedWelcomeEmail] = useState(false);
  const [copiedWelcomePass, setCopiedWelcomePass] = useState(false);

  // Password reset modal states
  const [resettingPasswordUser, setResettingPasswordUser] = useState<UserProfile | null>(null);
  const [tempPassToReset, setTempPassToReset] = useState<string>('');
  const [showTempPassToReset, setShowTempPassToReset] = useState(true);
  const [copiedResetPass, setCopiedResetPass] = useState(false);
  const [resettingPassLoading, setResettingPassLoading] = useState(false);
  const [resetPassMsg, setResetPassMsg] = useState<string | null>(null);

  // User deletion modal states (Platform Superuser Only)
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [deletingUserLoading, setDeletingUserLoading] = useState(false);
  const [deletingUserMsg, setDeletingUserMsg] = useState<string | null>(null);

  // User role change modal states
  const [changingRoleUser, setChangingRoleUser] = useState<UserProfile | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<UserRole>('VIEWER');
  const [changingRoleLoading, setChangingRoleLoading] = useState(false);
  const [changingRoleMsg, setChangingRoleMsg] = useState<string | null>(null);

  // New Tenant form states
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantCode, setNewTenantCode] = useState('');
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [tenantMsg, setTenantMsg] = useState<string | null>(null);

  const [availableSites, setAvailableSites] = useState<any[]>([]);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);

  // Managing Assigned Sites for Existing User Modal State
  const [managingUserSites, setManagingUserSites] = useState<UserProfile | null>(null);
  const [editingUserSitesList, setEditingUserSitesList] = useState<string[]>([]);
  const [savingUserSites, setSavingUserSites] = useState(false);
  const [manageSitesMsg, setManageSitesMsg] = useState<string | null>(null);

  // Fetch stats and site settings
  useEffect(() => {
    fetchOverviewStats();
  }, [tenantId, siteId]);

  // Fetch Users Directory with user_sites mapping
  const fetchUsers = async () => {
    if (!userProfile) return;
    setLoadingUsers(true);
    setUsersError(null);
    try {
      let usersDocs: UserProfile[];
      if (userProfile.role === 'PLATFORM_SUPERUSER') {
        usersDocs = await getDocuments<UserProfile>('users');
      } else {
        usersDocs = await getDocuments<UserProfile>('users', [where('tenantId', '==', userProfile.tenantId)]);
      }

      // Fetch user site assignments from user_sites table
      const userSitesMap: Record<string, string[]> = {};
      try {
        const { data: userSitesData } = await supabase.from('user_sites').select('user_id, site_id');
        if (userSitesData) {
          userSitesData.forEach((row: any) => {
            if (!userSitesMap[row.user_id]) userSitesMap[row.user_id] = [];
            userSitesMap[row.user_id].push(row.site_id);
          });
        }
      } catch (siteErr) {
        console.warn('Could not query user_sites table:', siteErr);
      }

      // Determine current user's assigned site IDs
      const currentUserSitesFromMap = userSitesMap[userProfile.uid] || [];
      const currentUserSitesFromProfile = Array.isArray(userProfile.siteIds) ? userProfile.siteIds : [];
      const currentUserSiteIds = currentUserSitesFromMap.length > 0 ? currentUserSitesFromMap : currentUserSitesFromProfile;
      
      let list: UserProfile[] = [];
      usersDocs.forEach(data => {
        // Filter out platform superusers for non-superusers locally to avoid composite index requirement
        if (userProfile.role === 'PLATFORM_SUPERUSER' || data.role !== 'PLATFORM_SUPERUSER') {
          const mappedSites = userSitesMap[data.id];
          const directSites = (data as any).siteIds || (data as any).site_ids || [];
          const userSiteIds = (mappedSites && mappedSites.length > 0) ? mappedSites : directSites;
          
          // Site-scoped user visibility:
          // A user who isn't a PLATFORM_SUPERUSER should only be able to see users associated with the sites they are associated with.
          if (userProfile.role !== 'PLATFORM_SUPERUSER' && currentUserSiteIds.length > 0) {
            const isSelf = data.id === userProfile.uid;
            const sharesSite = Array.isArray(userSiteIds) && userSiteIds.some((sId: string) => currentUserSiteIds.includes(sId));
            if (!isSelf && !sharesSite) {
              return; // Skip user who does not share any assigned sites with current user
            }
          }

          list.push({
            uid: data.id,
            ...data,
            siteIds: userSiteIds
          } as UserProfile);
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

  const handleOpenManageSites = (targetUser: UserProfile) => {
    setManagingUserSites(targetUser);
    setEditingUserSitesList(targetUser.siteIds || []);
    setManageSitesMsg(null);
  };

  const handleSaveUserSites = async () => {
    if (!managingUserSites) return;
    setSavingUserSites(true);
    setManageSitesMsg(null);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const apiRes = await fetch('/api/admin/update-user-sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          targetUserId: managingUserSites.uid || managingUserSites.id,
          siteIds: editingUserSitesList
        })
      });

      const resData = await apiRes.json();
      if (!apiRes.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to update site assignments');
      }

      setManageSitesMsg('Site assignments saved successfully!');
      await fetchUsers();
      setTimeout(() => {
        setManagingUserSites(null);
      }, 1200);
    } catch (err: any) {
      console.error('Error saving user sites:', err);
      setManageSitesMsg(`Error: ${err.message || 'Failed to update sites'}`);
    } finally {
      setSavingUserSites(false);
    }
  };

  // Fetch Tenants (Superuser & Tenant Admin)
  const fetchTenants = async () => {
    if (!userProfile) return;
    try {
      if (userProfile.role === 'PLATFORM_SUPERUSER') {
        const tenantsDocs = await getDocuments<any>('tenants');
        const list: Tenant[] = [];
        tenantsDocs.forEach(data => {
          list.push({ id: data.id, ...data } as Tenant);
        });
        setTenantsList(list);
      } else if (userProfile.tenantId) {
        const tData = await getDocument<any>('tenants', userProfile.tenantId);
        if (tData) {
          setTenantsList([{ id: userProfile.tenantId, name: tData?.tenantName || tData?.name || userProfile.tenantId, ...(tData as any) } as Tenant]);
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
    const fetchSitesForAdmin = async () => {
      if (!userProfile) return;
      try {
        let sitesDocs: any[];
        if (userProfile.role === 'PLATFORM_SUPERUSER') {
          sitesDocs = await getDocuments<any>('sites');
        } else if (userProfile.tenantId) {
          sitesDocs = await getDocuments<any>('sites', [where('tenantId', '==', userProfile.tenantId)]);
        } else {
          sitesDocs = [];
        }

        // Determine current user's permitted site IDs
        let currentUserAssignedSiteIds: string[] = [];
        if (userProfile.role !== 'PLATFORM_SUPERUSER') {
          try {
            const { data: userSitesData } = await supabase.from('user_sites').select('site_id').eq('user_id', userProfile.uid);
            if (userSitesData && userSitesData.length > 0) {
              currentUserAssignedSiteIds = userSitesData.map((r: any) => r.site_id);
            } else if (Array.isArray(userProfile.siteIds) && userProfile.siteIds.length > 0) {
              currentUserAssignedSiteIds = userProfile.siteIds;
            }
          } catch (e) {
            if (Array.isArray(userProfile.siteIds)) {
              currentUserAssignedSiteIds = userProfile.siteIds;
            }
          }
        }

        const sites: any[] = [];
        sitesDocs.forEach(data => {
          const siteIdentifierMatches = currentUserAssignedSiteIds.length === 0 ||
            currentUserAssignedSiteIds.includes(data.id) ||
            currentUserAssignedSiteIds.includes(data.siteId) ||
            currentUserAssignedSiteIds.includes(data.siteCode) ||
            currentUserAssignedSiteIds.includes(data.code);

          if (userProfile.role === 'PLATFORM_SUPERUSER' || siteIdentifierMatches) {
            sites.push({
              id: data.id,
              siteId: data.id,
              siteCode: data.siteCode || data.code || '',
              siteName: data.siteName || data.name || data.siteCode || data.id,
              tenantId: data.tenantId || data.tenant_id,
              ...data
            });
          }
        });
        setAvailableSites(sites);
      } catch (err) {
        console.error("Failed to load sites for admin:", err);
      }
    };
    fetchSitesForAdmin();
  }, [userProfile]);

  // Handle Account Unlock
  const handleUnlockUser = async (targetUid: string) => {
    try {
      const { error: updateErr } = await supabase
        .from('users')
        .update(toSnakeCase({
          accountStatus: 'ACTIVE',
          failedLoginAttempts: 0,
          failedAttemptWindowStartedAt: null,
          lockedAt: null,
          modifiedBy: userProfile?.uid || 'ADMIN',
          modifiedDate: new Date().toISOString()
        }))
        .eq('id', targetUid);
      if (updateErr) throw updateErr;

      alert('User account unlocked successfully.');
    } catch (directErr: any) {
      alert(`Unlock failed: ${directErr.message}`);
    }
    fetchUsers();
  };

  // Handle Enable/Disable Account Toggle
  const handleToggleStatus = async (targetUid: string, currentStatus: AccountStatus) => {
    const newStatus: AccountStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      const { error: updateErr } = await supabase
        .from('users')
        .update(toSnakeCase({
          accountStatus: newStatus,
          modifiedBy: userProfile?.uid || 'ADMIN',
          modifiedDate: new Date().toISOString()
        }))
        .eq('id', targetUid);
      if (updateErr) throw updateErr;

      alert(`User status changed to ${newStatus}.`);
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    }
    fetchUsers();
  };

  // Handle Password Reset Modal Opening
  const handleOpenResetPassword = (user: UserProfile) => {
    setResettingPasswordUser(user);
    setTempPassToReset(generateSecureTemporaryPassword());
    setShowTempPassToReset(true);
    setCopiedResetPass(false);
    setResetPassMsg(null);
  };

  // Handle Confirming Password Reset via Backend API
  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingPasswordUser) return;
    if (!tempPassToReset || tempPassToReset.trim().length < 8) {
      setResetPassMsg('Temporary password must be at least 8 characters long.');
      return;
    }

    setResettingPassLoading(true);
    setResetPassMsg(null);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const targetUid = resettingPasswordUser.uid || resettingPasswordUser.id;

      const res = await fetch('/api/admin/reset-user-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: targetUid,
          temporaryPassword: tempPassToReset.trim()
        })
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to reset password');
      }

      // Capture information for notification modal
      const targetTenantObj = tenantsList.find(t => t.id === resettingPasswordUser.tenantId);
      const tenantName = targetTenantObj?.tenantName || (resettingPasswordUser.tenantId ? 'Assigned Organization' : 'Global (Superuser)');
      const assignedSitesFormatted = (resettingPasswordUser.siteIds || []).map(sId => {
        const s = availableSites.find(site => site.id === sId || site.siteId === sId);
        return s ? `${s.siteName || s.name || sId} (${s.siteCode || s.code || sId})` : sId;
      });

      // Close reset prompt modal and immediately open credential copy modal with RESET type
      setResettingPasswordUser(null);
      setProvisionedUserModal({
        email: resettingPasswordUser.email,
        displayName: resettingPasswordUser.displayName || resettingPasswordUser.email,
        temporaryPassword: tempPassToReset.trim(),
        role: resettingPasswordUser.role,
        tenantName,
        assignedSites: assignedSitesFormatted,
        loginUrl: 'https://www.opsvis.uk/',
        type: 'RESET'
      });

      await fetchUsers();
    } catch (err: any) {
      console.error('Password reset failed:', err);
      setResetPassMsg(`Error: ${err.message || 'Failed to reset password'}`);
    } finally {
      setResettingPassLoading(false);
    }
  };

  // Handle User Deletion Modal Opening (Superuser only)
  const handleOpenDeleteUser = (user: UserProfile) => {
    setDeletingUser(user);
    setDeletingUserMsg(null);
  };

  // Handle Confirming User Deletion via Backend API
  const handleConfirmDeleteUser = async () => {
    if (!deletingUser) return;
    setDeletingUserLoading(true);
    setDeletingUserMsg(null);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const targetUid = deletingUser.uid || deletingUser.id;

      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: targetUid
        })
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to delete user account');
      }

      setDeletingUser(null);
      await fetchUsers();
    } catch (err: any) {
      console.error('User deletion failed:', err);
      setDeletingUserMsg(`Error: ${err.message || 'Failed to delete user account'}`);
    } finally {
      setDeletingUserLoading(false);
    }
  };

  // Check if current user has permission to change a target user's role
  const canModifyRole = (target: UserProfile) => {
    if (!userProfile) return false;
    if (userProfile.role === 'PLATFORM_SUPERUSER') return true;
    if (userProfile.role === 'TENANT_ADMIN') {
      // Cannot modify PLATFORM_SUPERUSER accounts
      if (target.role === 'PLATFORM_SUPERUSER') return false;
      // Must belong to the same tenant
      if (target.tenantId !== userProfile.tenantId) return false;
      // Must share at least one assigned site with caller (unless admin has no site restrictions)
      const currentUserSites = Array.isArray(userProfile.siteIds) ? userProfile.siteIds : [];
      const targetUserSites = Array.isArray(target.siteIds) ? target.siteIds : [];
      if (currentUserSites.length > 0) {
        const isSelf = (target.uid || (target as any).id) === userProfile.uid;
        const sharesSite = targetUserSites.some(sId => currentUserSites.includes(sId));
        return isSelf || sharesSite;
      }
      return true;
    }
    return false;
  };

  // Handle Opening Change Role Modal
  const handleOpenChangeRole = (user: UserProfile) => {
    setChangingRoleUser(user);
    setSelectedNewRole(user.role);
    setChangingRoleMsg(null);
  };

  // Handle Confirming Role Change via Backend API
  const handleConfirmChangeRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changingRoleUser) return;
    if (selectedNewRole === changingRoleUser.role) {
      setChangingRoleMsg(`User already holds the ${selectedNewRole} role.`);
      return;
    }

    setChangingRoleLoading(true);
    setChangingRoleMsg(null);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const targetUid = changingRoleUser.uid || (changingRoleUser as any).id;

      const res = await fetch('/api/admin/change-user-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          targetUserId: targetUid,
          newRole: selectedNewRole
        })
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to update user role');
      }

      setChangingRoleUser(null);
      await fetchUsers();
    } catch (err: any) {
      console.error('Role update failed:', err);
      setChangingRoleMsg(`Error: ${err.message || 'Failed to update user role'}`);
    } finally {
      setChangingRoleLoading(false);
    }
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
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;

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
        const cleanSnippet = resText ? resText.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) : '';
        if (!apiRes.ok) {
          throw new Error(`Server returned HTTP ${apiRes.status}${cleanSnippet ? `: ${cleanSnippet}` : ''}. If deployed to Vercel, ensure the latest build is deployed.`);
        }
        throw new Error(`Unexpected server response: ${cleanSnippet || resText.slice(0, 150)}`);
      }

      if (!apiRes.ok || !apiData.success) {
        const errorMsg = apiData.error || apiData.message || 'Failed to provision account';
        const fullMsg = apiData.stage ? `[${apiData.stage}] ${errorMsg}` : errorMsg;
        throw new Error(fullMsg);
      }

      const provisionedEmail = newUserEmail.toLowerCase().trim();
      const provisionedName = newUserDisplayName.trim();
      const provisionedPass = newUserTempPass;
      const provisionedRole = newUserRole;
      const targetTenantObj = tenantsList.find(t => t.id === actualTenantId);
      const tenantName = targetTenantObj?.tenantName || (actualTenantId ? 'Assigned Organization' : 'Global (Superuser)');
      
      const assignedSitesFormatted = sitesArray.map(sId => {
        const s = availableSites.find(site => site.id === sId || site.siteId === sId);
        return s ? `${s.siteName || s.name || sId} (${s.siteCode || s.code || sId})` : sId;
      });

      // Show welcome email modal with credentials
      setProvisionedUserModal({
        email: provisionedEmail,
        displayName: provisionedName,
        temporaryPassword: provisionedPass,
        role: provisionedRole,
        tenantName,
        assignedSites: assignedSitesFormatted,
        loginUrl: 'https://www.opsvis.uk/'
      });
      setCopiedWelcomeEmail(false);
      setCopiedWelcomePass(false);

      setCreatingUserMsg(`Success! ${apiData.message || `User account and database profile created for ${provisionedEmail}.`}`);

      // Reset form with a newly generated password for the next user
      setNewUserEmail('');
      setNewUserDisplayName('');
      setNewUserJobTitle('');
      setSelectedSites([]);
      setNewUserTempPass(generateSecureTemporaryPassword());
    } catch (apiErr: any) {
      console.error('Provisioning user failed:', apiErr);
      let errorText = apiErr.message || 'Failed to create user account.';
      if (apiErr.message?.includes('already exists') || apiErr.code === 'already-exists') {
        errorText = 'An account with this email address already exists in Supabase.';
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
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;

      if (!token) {
        throw new Error('Authentication session not found. Please log in as Platform Superuser.');
      }

      const code = newTenantCode.toUpperCase().trim();
      const apiRes = await fetch('/api/admin/provision-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tenantName: newTenantName.trim(),
          tenantCode: code
        })
      });

      const resText = await apiRes.text();
      let apiData: any;
      try {
        apiData = JSON.parse(resText);
      } catch {
        const cleanSnippet = resText ? resText.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) : '';
        if (!apiRes.ok) {
          throw new Error(`Server returned HTTP ${apiRes.status}${cleanSnippet ? `: ${cleanSnippet}` : ''}.`);
        }
        throw new Error(`Unexpected server response: ${cleanSnippet || resText.slice(0, 150)}`);
      }

      if (!apiRes.ok || !apiData.success) {
        const errorMsg = apiData.error || apiData.message || 'Failed to provision tenant';
        const fullMsg = apiData.stage ? `[${apiData.stage}] ${errorMsg}` : errorMsg;
        throw new Error(fullMsg);
      }

      setTenantMsg(apiData.message || `Tenant ${newTenantName} (${code}) successfully created.`);
      setNewTenantName('');
      setNewTenantCode('');
      fetchTenants();
    } catch (err: any) {
      console.error('Failed to create tenant:', err);
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
          {/* Site Onboarding & Operational Readiness Console */}
          <SectionCard 
            title="Site Onboarding & Operational Readiness"
            actions={
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${
                  isOnboardingComplete
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : onboarding?.status === 'IN_PROGRESS'
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                }`}>
                  {isOnboardingComplete ? (
                    <><CheckCircle2 className="w-3.5 h-3.5" /> Operational (Complete)</>
                  ) : onboarding?.status === 'IN_PROGRESS' ? (
                    <><Activity className="w-3.5 h-3.5 animate-pulse" /> Step {(onboarding?.currentStep ?? 0) + 1} of 10: {ONBOARDING_STEPS[onboarding?.currentStep ?? 0]?.title}</>
                  ) : (
                    <><Compass className="w-3.5 h-3.5" /> Setup Required</>
                  )}
                </span>
              </div>
            }
          >
            <div className="space-y-5">
              {/* Onboarding Feedback Banner */}
              {onboardingFeedback && (
                <div
                  className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
                    onboardingFeedback.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : 'bg-red-950/40 border-red-800/60 text-red-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {onboardingFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <span className="font-medium">{onboardingFeedback.message}</span>
                  </div>
                  <button
                    onClick={() => setOnboardingFeedback(null)}
                    className="text-slate-400 hover:text-slate-200 ml-2 shrink-0 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Status Header & Progress Overview */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200">
                      Active Site: <span className="text-amber-400">{siteName || siteId || 'No Site Selected'}</span>
                    </span>
                    {site?.siteCode && (
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                        {site.siteCode}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {isOnboardingComplete
                      ? 'All mandatory configuration steps, resources, and decision tables are active. Site is ready for production planning.'
                      : onboarding?.status === 'IN_PROGRESS'
                      ? 'Onboarding wizard is currently in progress. Complete all mandatory steps to transition this site into live production mode.'
                      : 'This site has not completed initial onboarding. Follow the guided 10-step wizard to configure master data, production lines, and decision matrices.'}
                  </p>
                </div>

                {/* Progress Meter */}
                <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0 min-w-[200px]">
                  <div className="flex items-center justify-between w-full text-xs font-semibold">
                    <span className="text-slate-400">Setup Progress</span>
                    <span className={isOnboardingComplete ? 'text-emerald-400' : 'text-amber-400'}>
                      {isOnboardingComplete 
                        ? '100% (10/10)' 
                        : `${Math.round(((onboarding?.completedSteps?.length || 0) / 10) * 100)}% (${onboarding?.completedSteps?.length || 0}/10)`}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isOnboardingComplete ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{
                        width: isOnboardingComplete
                          ? '100%'
                          : `${Math.max(5, Math.round(((onboarding?.completedSteps?.length || 0) / 10) * 100))}%`
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* 10-Step Journey Map */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <ListChecks className="w-3.5 h-3.5 text-amber-500" />
                    Onboarding Milestones
                  </h4>
                  <span className="text-[11px] text-slate-500">Click any step to launch setup wizard</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                  {ONBOARDING_STEPS.map((step) => {
                    const isStepComplete = isOnboardingComplete || (onboarding?.completedSteps || []).includes(step.id);
                    const isCurrentStep = !isOnboardingComplete && (onboarding?.currentStep ?? 0) === step.id;
                    const StepIcon = step.icon;

                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={handleStartOrContinueOnboarding}
                        className={`p-2.5 rounded-lg border text-left transition-all group flex flex-col justify-between relative ${
                          isStepComplete
                            ? 'bg-emerald-950/20 border-emerald-800/40 hover:border-emerald-700/60'
                            : isCurrentStep
                            ? 'bg-amber-950/20 border-amber-500/50 shadow-sm shadow-amber-500/10 hover:border-amber-400'
                            : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isStepComplete 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : isCurrentStep 
                              ? 'bg-amber-500/20 text-amber-400' 
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            Step {step.id + 1}
                          </span>
                          {isStepComplete ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : isCurrentStep ? (
                            <Activity className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                          ) : (
                            <StepIcon className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                          )}
                        </div>
                        <div>
                          <div className={`text-xs font-semibold truncate ${
                            isStepComplete ? 'text-slate-200' : isCurrentStep ? 'text-amber-300' : 'text-slate-400'
                          }`}>
                            {step.title}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">
                            {step.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Readiness Blockers & Checks Display */}
              {readinessResult && (
                <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                      Operational Readiness Status:
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {Object.values(readinessResult.blockers).some(b => b === true) ? (
                        <span className="text-amber-400 font-medium">Pending items require attention</span>
                      ) : (
                        <span className="text-emerald-400 font-medium">All core prerequisites met</span>
                      )}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1 text-xs">
                    <div className="flex items-center gap-2 p-2 rounded bg-slate-950/40 border border-slate-800/60">
                      {readinessResult.blockers.noActiveDestination ? (
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span className="text-slate-300">
                        Destinations: <strong className="text-slate-200">{readinessResult.counts.destinations} active</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 p-2 rounded bg-slate-950/40 border border-slate-800/60">
                      {readinessResult.blockers.noActiveProductionLine ? (
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span className="text-slate-300">
                        Production Lines: <strong className="text-slate-200">{readinessResult.counts.lines} active</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 p-2 rounded bg-slate-950/40 border border-slate-800/60">
                      {readinessResult.blockers.decisionSettingsIncomplete ? (
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span className="text-slate-300">
                        Decision Matrix: <strong className="text-slate-200">{readinessResult.blockers.decisionSettingsIncomplete ? 'Incomplete' : 'Ready'}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 p-2 rounded bg-slate-950/40 border border-slate-800/60">
                      {readinessResult.recommendations.noProducts ? (
                        <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span className="text-slate-300">
                        Products: <strong className="text-slate-200">{readinessResult.counts.products} cataloged</strong>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons Hub */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Primary Start / Continue / Review Button */}
                  <button
                    type="button"
                    onClick={handleStartOrContinueOnboarding}
                    disabled={onboardingActionLoading || !tenantId || !siteId || siteId === 'SETUP_REQUIRED'}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 border border-transparent rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isOnboardingComplete ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Review / Adjust Onboarding Wizard
                      </>
                    ) : onboarding?.status === 'IN_PROGRESS' ? (
                      <>
                        <Play className="w-3.5 h-3.5 fill-slate-950" />
                        Continue Site Onboarding (Step {(onboarding?.currentStep ?? 0) + 1})
                      </>
                    ) : (
                      <>
                        <Compass className="w-3.5 h-3.5" />
                        Start Site Onboarding Wizard
                      </>
                    )}
                  </button>

                  {/* Complete Onboarding Button (if in-progress or not completed) */}
                  {!isOnboardingComplete && canComplete && (
                    <button
                      type="button"
                      onClick={handleCompleteOnboardingDirectly}
                      disabled={onboardingActionLoading || !tenantId || !siteId || siteId === 'SETUP_REQUIRED'}
                      className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 hover:border-emerald-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {onboardingActionLoading ? (
                        <RotateCcw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      Complete Site Onboarding
                    </button>
                  )}

                  {/* Reopen Onboarding Button (if already completed) */}
                  {isOnboardingComplete && canComplete && (
                    <button
                      type="button"
                      onClick={handleReopenOnboardingDirectly}
                      disabled={onboardingActionLoading || !tenantId || !siteId || siteId === 'SETUP_REQUIRED'}
                      className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {onboardingActionLoading ? (
                        <RotateCcw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      Reopen Site Onboarding
                    </button>
                  )}
                </div>

                {/* Reset Progress Button (subtle) */}
                {onboarding && !isOnboardingComplete && canComplete && (
                  <button
                    type="button"
                    onClick={handleResetOnboardingDirectly}
                    disabled={onboardingActionLoading || !tenantId || !siteId || siteId === 'SETUP_REQUIRED'}
                    className="text-xs text-slate-400 hover:text-red-400 font-medium transition-colors px-2 py-1 flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Progress
                  </button>
                )}
              </div>
            </div>
          </SectionCard>

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
                            {canModifyRole(user) ? (
                              <button
                                type="button"
                                onClick={() => handleOpenChangeRole(user)}
                                className="group inline-flex items-center gap-1.5 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/20 hover:border-amber-500/40 transition-all cursor-pointer text-left"
                                title="Click to Change Role"
                              >
                                <span>{user.role}</span>
                                <UserCog className="w-3 h-3 text-amber-500/60 group-hover:text-amber-400" />
                              </button>
                            ) : (
                              <span className="text-amber-500 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">
                                {user.role}
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-2 text-xs text-slate-400">
                            <div>
                              Tenant: <span className="font-semibold text-slate-300">{tenantsList.find(t => t.id === user.tenantId)?.tenantName || user.tenantId || 'Global'}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1 max-w-[200px]">
                              {user.siteIds && user.siteIds.length > 0 ? (
                                user.siteIds.map(sId => {
                                  const matchedSite = availableSites.find(s => s.id === sId || s.siteId === sId);
                                  const display = matchedSite ? `${matchedSite.siteName} (${matchedSite.siteCode || ''})` : sId;
                                  return (
                                    <span 
                                      key={sId}
                                      className="inline-flex items-center text-[10px] bg-slate-900 text-slate-300 px-1.5 py-0.5 rounded border border-slate-800 truncate"
                                      title={display}
                                    >
                                      {matchedSite?.siteName || display}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-[10px] text-slate-500 italic">No sites assigned</span>
                              )}
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
                            <button
                              onClick={() => handleOpenManageSites(user)}
                              className="p-1.5 rounded text-slate-400 border border-slate-800 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/20 transition-all cursor-pointer"
                              title="Manage Assigned Sites"
                            >
                              <Building className="w-4 h-4" />
                            </button>
                            {canModifyRole(user) && (
                              <button
                                onClick={() => handleOpenChangeRole(user)}
                                className="p-1.5 rounded text-slate-400 border border-slate-800 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/20 transition-all cursor-pointer"
                                title="Change User Role"
                              >
                                <UserCog className="w-4 h-4" />
                              </button>
                            )}
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
                              onClick={() => handleOpenResetPassword(user)}
                              className="p-1.5 rounded text-slate-400 border border-slate-800 hover:text-amber-500 hover:bg-amber-500/10 hover:border-amber-500/20 transition-all cursor-pointer"
                              title="Reset Temporary Password"
                            >
                              <Key className="w-4 h-4" />
                            </button>
                            {userProfile?.role === 'PLATFORM_SUPERUSER' && (
                              <button
                                onClick={() => handleOpenDeleteUser(user)}
                                disabled={user.uid === userProfile.uid}
                                className={`p-1.5 rounded transition-all border ${
                                  user.uid === userProfile.uid
                                    ? 'opacity-30 cursor-not-allowed text-slate-600 border-slate-800'
                                    : 'text-slate-400 hover:text-red-400 hover:bg-red-500/10 border-slate-800 hover:border-red-500/20 cursor-pointer'
                                }`}
                                title={user.uid === userProfile.uid ? "Cannot delete your own active superuser account" : "Delete User Account"}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Change User Role Modal */}
              {changingRoleUser && (
                <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-5 space-y-4">
                    <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <UserCog className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">Change User Role</h3>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">{changingRoleUser.displayName || changingRoleUser.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setChangingRoleUser(null)}
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {changingRoleMsg && (
                      <div className={`p-3 rounded-lg text-xs border ${
                        changingRoleMsg.startsWith('Error') 
                          ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                          : 'bg-green-500/10 border-green-500/20 text-green-400'
                      }`}>
                        {changingRoleMsg}
                      </div>
                    )}

                    {/* User Info Overview */}
                    <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg text-xs space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-slate-500 block">Email</span>
                          <span className="text-slate-200 font-mono truncate block" title={changingRoleUser.email}>{changingRoleUser.email}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-slate-500 block">Current Role</span>
                          <span className="text-amber-400 font-mono font-semibold">{changingRoleUser.role}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-slate-500 block">Tenant</span>
                          <span className="text-slate-300 truncate block">
                            {tenantsList.find(t => t.id === changingRoleUser.tenantId)?.tenantName || changingRoleUser.tenantId || 'Global / Platform'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-slate-500 block">Assigned Sites</span>
                          <span className="text-slate-300 truncate block" title={changingRoleUser.siteIds?.join(', ')}>
                            {changingRoleUser.siteIds && changingRoleUser.siteIds.length > 0 
                              ? changingRoleUser.siteIds.map(sId => {
                                  const matchedSite = availableSites.find(s => s.id === sId || s.siteId === sId);
                                  return matchedSite?.siteName || sId;
                                }).join(', ')
                              : 'All Tenant Sites / None'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Role Selection */}
                    <form onSubmit={handleConfirmChangeRole} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                          <span>Select New Role</span>
                          <span className="text-[10px] text-slate-500 font-normal">
                            Authorized by {userProfile?.role === 'PLATFORM_SUPERUSER' ? 'Platform Superuser' : 'Tenant Admin'}
                          </span>
                        </label>

                        <select
                          value={selectedNewRole}
                          onChange={(e) => setSelectedNewRole(e.target.value as UserRole)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-200 font-medium focus:outline-none focus:border-amber-500"
                        >
                          {userProfile?.role === 'PLATFORM_SUPERUSER' && (
                            <option value="PLATFORM_SUPERUSER">PLATFORM_SUPERUSER — Full Cross-Tenant & Platform Superuser</option>
                          )}
                          <option value="TENANT_ADMIN">TENANT_ADMIN — Tenant & Site Administrator</option>
                          <option value="PLANNER">PLANNER — Operational Planning & Wave Management</option>
                          <option value="WAREHOUSE_OPERATOR">WAREHOUSE_OPERATOR — Task Execution & Operations</option>
                          <option value="VIEWER">VIEWER — Read-Only Dashboard & Reports</option>
                          <option value="DISPLAY">DISPLAY — Wall Terminal Display Screen</option>
                        </select>
                      </div>

                      {/* Informational callouts */}
                      {userProfile?.role === 'TENANT_ADMIN' && (
                        <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-400 flex items-start gap-2">
                          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span>Tenant Admins can assign any operational or site admin role within their assigned site(s). Tenant Admins cannot promote users to Platform Superuser.</span>
                        </div>
                      )}

                      {changingRoleUser.role === 'TENANT_ADMIN' && selectedNewRole !== 'TENANT_ADMIN' && (
                        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-300 flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-amber-200">Sole Admin Invariant:</span> If this user is the only TENANT_ADMIN assigned to any of their sites, the server will block the role change until another user is designated as TENANT_ADMIN for that site.
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setChangingRoleUser(null)}
                          disabled={changingRoleLoading}
                          className="px-3.5 py-1.5 rounded-lg border border-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={changingRoleLoading || selectedNewRole === changingRoleUser.role}
                          className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-950/40"
                        >
                          {changingRoleLoading ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Updating Role...
                            </>
                          ) : (
                            <>
                              <UserCog className="w-3.5 h-3.5" /> Update Role
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Manage Assigned Sites Modal */}
              {managingUserSites && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Building className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">Manage Assigned Sites</h3>
                          <p className="text-xs text-slate-400 font-mono">{managingUserSites.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setManagingUserSites(null)}
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {manageSitesMsg && (
                      <div className={`p-3 rounded-lg text-xs border ${
                        manageSitesMsg.startsWith('Error') 
                          ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                          : 'bg-green-500/10 border-green-500/20 text-green-400'
                      }`}>
                        {manageSitesMsg}
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Sites for {tenantsList.find(t => t.id === managingUserSites.tenantId)?.tenantName || 'Tenant'}
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const allTenantSiteIds = availableSites
                                .filter(s => !managingUserSites.tenantId || s.tenantId === managingUserSites.tenantId)
                                .map(s => s.id);
                              setEditingUserSitesList(allTenantSiteIds);
                            }}
                            className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                          >
                            Select All
                          </button>
                          <span className="text-slate-600 text-xs">•</span>
                          <button
                            type="button"
                            onClick={() => setEditingUserSitesList([])}
                            className="text-[10px] text-slate-400 hover:underline cursor-pointer"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 max-h-56 overflow-y-auto p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                        {availableSites
                          .filter(s => !managingUserSites.tenantId || s.tenantId === managingUserSites.tenantId)
                          .map(site => {
                            const isChecked = editingUserSitesList.includes(site.id);
                            return (
                              <label 
                                key={site.id} 
                                className="flex items-center justify-between p-2 rounded hover:bg-slate-900/60 cursor-pointer group"
                              >
                                <div className="flex items-center gap-2.5">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setEditingUserSitesList([...editingUserSitesList, site.id]);
                                      } else {
                                        setEditingUserSitesList(editingUserSitesList.filter(id => id !== site.id));
                                      }
                                    }}
                                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-950 cursor-pointer"
                                  />
                                  <div>
                                    <div className="text-xs font-semibold text-slate-200 group-hover:text-white">
                                      {site.siteName || site.name}
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-mono">
                                      Code: {site.siteCode || site.code || site.id}
                                    </div>
                                  </div>
                                </div>
                                {isChecked && (
                                  <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-medium">
                                    Assigned
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        {availableSites.filter(s => !managingUserSites.tenantId || s.tenantId === managingUserSites.tenantId).length === 0 && (
                          <div className="p-3 text-center text-xs text-slate-500 italic">
                            No sites found for this tenant.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
                      <button
                        type="button"
                        onClick={() => setManagingUserSites(null)}
                        disabled={savingUserSites}
                        className="px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveUserSites}
                        disabled={savingUserSites}
                        className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        {savingUserSites ? 'Saving...' : 'Save Assignments'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Reset Password Modal */}
              {resettingPasswordUser && (
                <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Key className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">Reset Temporary Password</h3>
                          <p className="text-xs text-slate-400 font-mono">{resettingPasswordUser.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setResettingPasswordUser(null)}
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {resetPassMsg && (
                      <div className={`p-3 rounded-lg text-xs border ${
                        resetPassMsg.startsWith('Error') 
                          ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                          : 'bg-green-500/10 border-green-500/20 text-green-400'
                      }`}>
                        {resetPassMsg}
                      </div>
                    )}

                    <form onSubmit={handleConfirmResetPassword} className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            New Temporary Password
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const newP = generateSecureTemporaryPassword();
                              setTempPassToReset(newP);
                            }}
                            className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" /> Generate New
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            type={showTempPassToReset ? "text" : "password"}
                            value={tempPassToReset}
                            onChange={(e) => setTempPassToReset(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-3 pr-20 text-xs font-mono text-amber-300 tracking-wider focus:outline-none focus:border-amber-500"
                            placeholder="Enter 8+ character password"
                            required
                            minLength={8}
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setShowTempPassToReset(!showTempPassToReset)}
                              className="p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                              title={showTempPassToReset ? "Hide password" : "Show password"}
                            >
                              {showTempPassToReset ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(tempPassToReset);
                                setCopiedResetPass(true);
                                setTimeout(() => setCopiedResetPass(false), 2000);
                              }}
                              className="p-1 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                              title="Copy temporary password"
                            >
                              {copiedResetPass ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Setting this password will update Supabase Auth and flag the account to require a password change on next login.
                        </p>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setResettingPasswordUser(null)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={resettingPassLoading}
                          className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                        >
                          {resettingPassLoading ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Resetting...
                            </>
                          ) : (
                            <>
                              <Key className="w-3.5 h-3.5" /> Reset & Notify
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Permanent User Deletion Confirmation Modal (Platform Superuser Only) */}
              {deletingUser && (
                <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-red-500/30 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
                    <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                          <Trash2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white leading-tight">Delete User Account</h3>
                          <p className="text-xs text-red-400/90 font-medium">Permanent Platform Action</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setDeletingUser(null)}
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {deletingUserMsg && (
                      <div className="p-3 rounded-lg text-xs bg-red-500/10 border border-red-500/20 text-red-400">
                        {deletingUserMsg}
                      </div>
                    )}

                    <div className="p-3 bg-red-500/5 border border-red-500/15 rounded-lg text-xs text-slate-300 space-y-2 leading-relaxed">
                      <p>
                        Are you sure you want to permanently delete the user account for <strong className="text-white font-mono">{deletingUser.email}</strong>?
                      </p>
                      <p className="text-slate-400">
                        This will remove the user from Supabase Authentication (<span className="font-mono text-slate-300">auth.users</span>), user profiles (<span className="font-mono text-slate-300">public.users</span>), and all site associations (<span className="font-mono text-slate-300">public.user_sites</span>).
                      </p>
                      <div className="text-[11px] text-red-400 font-semibold flex items-center gap-1.5 pt-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        This action cannot be undone.
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setDeletingUser(null)}
                        disabled={deletingUserLoading}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDeleteUser}
                        disabled={deletingUserLoading}
                        className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-lg shadow-red-950/40"
                      >
                        {deletingUserLoading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-3.5 h-3.5" /> Permanently Delete
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Welcome / User Provisioned & Password Reset Credentials Modal */}
              {provisionedUserModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full p-6 space-y-5 my-8">
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white leading-snug">
                            {provisionedUserModal.type === 'RESET' ? 'Password Reset Successfully' : 'User Provisioned Successfully'}
                          </h3>
                          <p className="text-xs text-slate-400">
                            {provisionedUserModal.type === 'RESET' ? 'Temporary password updated for ' : 'Account created for '}
                            <span className="text-amber-400 font-mono font-medium">{provisionedUserModal.email}</span>
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProvisionedUserModal(null)}
                        className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Close modal"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Quick Credentials Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-950 border border-slate-800 rounded-lg text-xs">
                      <div>
                        <span className="text-slate-500 block uppercase text-[10px] font-semibold tracking-wider">Portal Login URL</span>
                        <a
                          href="https://www.opsvis.uk/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400 hover:underline inline-flex items-center gap-1 font-mono font-medium mt-0.5"
                        >
                          https://www.opsvis.uk/ <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div>
                        <span className="text-slate-500 block uppercase text-[10px] font-semibold tracking-wider">Temporary Password</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-amber-300 font-bold select-all bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                            {provisionedUserModal.temporaryPassword}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(provisionedUserModal.temporaryPassword);
                              setCopiedWelcomePass(true);
                              setTimeout(() => setCopiedWelcomePass(false), 2000);
                            }}
                            className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white flex items-center gap-1 transition-colors cursor-pointer border border-slate-700"
                            title="Copy temporary password"
                          >
                            {copiedWelcomePass ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                            {copiedWelcomePass ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500 block uppercase text-[10px] font-semibold tracking-wider">Assigned Role</span>
                        <span className="text-slate-200 font-medium capitalize mt-0.5 block">
                          {provisionedUserModal.role.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block uppercase text-[10px] font-semibold tracking-wider">Assigned Sites</span>
                        <span className="text-slate-200 mt-0.5 block truncate" title={provisionedUserModal.assignedSites.join(', ')}>
                          {provisionedUserModal.assignedSites.length > 0 ? provisionedUserModal.assignedSites.join(', ') : 'All Tenant Sites'}
                        </span>
                      </div>
                    </div>

                    {/* Notice Banner */}
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300 flex items-start gap-2 leading-relaxed">
                      <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-amber-200">First Login Notice:</span> The user will be required to change this temporary password immediately upon their log in to <span className="font-mono text-amber-400">https://www.opsvis.uk/</span>.
                      </div>
                    </div>

                    {/* Welcome / Reset Email Text Template */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-amber-400" />
                          {provisionedUserModal.type === 'RESET' ? 'Password Reset Email Template' : 'Welcome Email Template'}
                        </label>
                        <span className="text-[11px] text-slate-400">Ready to copy & paste into an email</span>
                      </div>

                      <div className="relative">
                        <textarea
                          readOnly
                          rows={11}
                          value={buildWelcomeEmailText(provisionedUserModal)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 leading-relaxed resize-none focus:outline-none focus:border-amber-500 select-all"
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-800">
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => {
                            const text = buildWelcomeEmailText(provisionedUserModal);
                            navigator.clipboard.writeText(text);
                            setCopiedWelcomeEmail(true);
                            setTimeout(() => setCopiedWelcomeEmail(false), 2500);
                          }}
                          className={`w-full sm:w-auto px-4 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            copiedWelcomeEmail 
                              ? 'bg-green-600 text-white shadow-lg shadow-green-900/40' 
                              : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-950/40'
                          }`}
                        >
                          {copiedWelcomeEmail ? (
                            <>
                              <Check className="w-4 h-4" /> Copied Email Text!
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" /> Copy Email Text
                            </>
                          )}
                        </button>

                        <a
                          href={`mailto:${provisionedUserModal.email}?subject=${encodeURIComponent(provisionedUserModal.type === 'RESET' ? 'OpsVis - Your Password Has Been Reset' : 'Welcome to OpsVis - Your Account Login Credentials')}&body=${encodeURIComponent(buildWelcomeEmailText(provisionedUserModal).replace(/^Subject:.*\n\n/, ''))}`}
                          className="w-full sm:w-auto px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                        >
                          <Mail className="w-3.5 h-3.5" /> Open in Mail App
                        </a>
                      </div>

                      <button
                        type="button"
                        onClick={() => setProvisionedUserModal(null)}
                        className="w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs transition-colors cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
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
                      required={newUserRole !== 'PLATFORM_SUPERUSER'}
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
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Assign Sites</label>
                      {(() => {
                        const targetTId = userProfile?.role === 'PLATFORM_SUPERUSER' ? newUserTenantId : userProfile?.tenantId;
                        const filtered = availableSites.filter(s => !targetTId || s.tenantId === targetTId);
                        if (filtered.length === 0) return null;
                        return (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedSites(filtered.map(s => s.id))}
                              className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                            >
                              Select All
                            </button>
                            <span className="text-slate-600 text-xs">•</span>
                            <button
                              type="button"
                              onClick={() => setSelectedSites([])}
                              className="text-[10px] text-slate-400 hover:underline cursor-pointer"
                            >
                              Clear
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    {(() => {
                      const targetTId = userProfile?.role === 'PLATFORM_SUPERUSER' ? newUserTenantId : userProfile?.tenantId;
                      const filtered = availableSites.filter(s => !targetTId || s.tenantId === targetTId);
                      return filtered.length > 0 ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-lg">
                          {filtered.map(site => {
                            const siteVal = site.id;
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
                                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-950 cursor-pointer"
                              />
                              <span className="text-sm text-slate-300 group-hover:text-slate-200">
                                {site.siteName || site.name || siteVal} <span className="text-xs text-slate-500 font-mono">({site.siteCode || site.code || siteVal})</span>
                              </span>
                            </label>
                          )})}
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-500 italic">
                          No sites available for the selected tenant.
                        </div>
                      );
                    })()}
                  </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Temporary Password</label>
                    <button
                      type="button"
                      onClick={() => setNewUserTempPass(generateSecureTemporaryPassword())}
                      className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                      title="Generate a new secure temporary password"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Generate New
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type={showNewUserTempPass ? "text" : "password"}
                      value={newUserTempPass}
                      onChange={e => setNewUserTempPass(e.target.value)}
                      placeholder="Enter or auto-generate password"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-20 py-2 text-sm font-mono text-amber-300 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                    />
                    <div className="absolute right-2 flex items-center gap-1 text-slate-400">
                      <button
                        type="button"
                        onClick={() => setShowNewUserTempPass(!showNewUserTempPass)}
                        className="p-1 hover:text-slate-200 transition-colors cursor-pointer rounded hover:bg-slate-800"
                        title={showNewUserTempPass ? "Hide password" : "Show password"}
                      >
                        {showNewUserTempPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (newUserTempPass) {
                            navigator.clipboard.writeText(newUserTempPass);
                            setCopiedFormTempPass(true);
                            setTimeout(() => setCopiedFormTempPass(false), 2000);
                          }
                        }}
                        className="p-1 hover:text-slate-200 transition-colors cursor-pointer rounded hover:bg-slate-800"
                        title="Copy password"
                      >
                        {copiedFormTempPass ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500/80" /> System-generated password (min 8 chars). Prompt user to change upon first login.
                  </p>
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

      {showOnboardingWizard && (
        <SiteOnboardingWizard 
          onClose={() => {
            setShowOnboardingWizard(false);
            fetchOverviewStats();
          }} 
        />
      )}

    </div>
  );
};

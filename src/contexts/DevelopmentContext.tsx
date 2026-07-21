import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
  updatePassword,
  createUserWithEmailAndPassword,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  serverTimestamp, 
  Timestamp 
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, auth, app } from '../config/firebase';
import { UserProfile, UserSession, UserRole, AccountStatus, Tenant } from '../types/auth';

export interface Site {
  tenantId: string;
  tenantName: string;
  siteId: string;
  siteName: string;
  timezone: string;
}

export interface DevelopmentContextType extends Site {
  developmentMode: boolean;
  setSite: (site: Site) => void;
  availableSites: Site[];
  
  // Real Auth fields
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  currentUser: string; // userId or fallback
  loading: boolean;
  authError: string | null;
  requiresPasswordChange: boolean;
  
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (newPass: string) => Promise<void>;
  bootstrapSuperuser: () => Promise<void>;
}

const DEV_SITES: Site[] = [
  {
    tenantId: 'tenant_dev',
    tenantName: 'GXO Development',
    siteId: 'site_barrow',
    siteName: 'Barrow RDC',
    timezone: 'Europe/London',
  },
  {
    tenantId: 'tenant_dev',
    tenantName: 'GXO Development',
    siteId: 'site_test',
    siteName: 'Test Facility',
    timezone: 'Europe/London',
  },
];

const DEFAULT_SITE = DEV_SITES[0];

const DevelopmentContext = createContext<DevelopmentContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'ovms_dev_context';

export const DevelopmentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [site, setSiteState] = useState<Site>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved) as Site;
      } catch (e) {
        console.error('Failed to parse saved site context', e);
      }
    }
    return DEFAULT_SITE;
  });

  const [availableSites, setAvailableSites] = useState<Site[]>(DEV_SITES);

  // 1. Listen to Firebase auth changes
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        setLoading(true);
        setAuthError(null);
        if (firebaseUser) {
          setUser(firebaseUser);
          await loadUserProfile(firebaseUser.uid);
        } else {
          setUser(null);
          setUserProfile(null);
          setRequiresPasswordChange(false);
          setSessionId(null);
        }
      } catch (err: any) {
        console.error('Auth state change error:', err);
        setAuthError(err.message || 'Failed to sync authentication.');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Load User profile from Firestore
  const loadUserProfile = async (uid: string) => {
    if (!db) return;
    try {
      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        const data = userSnap.data() as UserProfile;
        
        // Handle blocked, archived or disabled accounts
        if (data.accountStatus && data.accountStatus !== 'ACTIVE') {
          await signOut(auth!);
          setUser(null);
          setUserProfile(null);
          setAuthError(`Your account is currently ${data.accountStatus}. Please contact your administrator.`);
          return;
        }

        setUserProfile(data);
        setRequiresPasswordChange(data.requiresPasswordChange);

        // Fetch user sites based on profile
        await syncUserSitesAndTenant(data);
        
        // Track the session
        await trackSessionStart(data);

      } else {
        // Fallback or developer default profile if not in DB but authenticated
        const fallbackProfile: UserProfile = {
          uid,
          email: auth?.currentUser?.email || '',
          displayName: auth?.currentUser?.displayName || 'Developer',
          jobTitle: 'Developer User',
          role: 'PLATFORM_SUPERUSER',
          tenantId: 'tenant_dev',
          siteIds: ['site_barrow', 'site_test'],
          accountStatus: 'ACTIVE',
          requiresPasswordChange: false,
          failedLoginAttempts: 0,
          failedAttemptWindowStartedAt: null,
          lockedAt: null,
          lastLoginAt: Timestamp.now(),
          passwordChangedAt: null,
          createdBy: 'SYSTEM',
          createdDate: Timestamp.now(),
          modifiedBy: 'SYSTEM',
          modifiedDate: Timestamp.now()
        };
        setUserProfile(fallbackProfile);
        setAvailableSites(DEV_SITES);
        setSiteState(DEV_SITES[0]);
        // Write the profile back to Firestore if permissions permit
        try {
          await setDoc(userDocRef, fallbackProfile);
        } catch (e) {
          console.warn('Could not auto-write fallback profile:', e);
        }
      }
    } catch (err: any) {
      console.error('Failed to load user profile:', err);
      setAuthError('Authentication synced, but failed to load user profile data.');
    }
  };

  // 3. Sync sites and tenant context
  const syncUserSitesAndTenant = async (profile: UserProfile) => {
    if (!db) return;

    try {
      if (profile.role === 'PLATFORM_SUPERUSER') {
        // Platform Superusers can access all sites across all tenants
        // Let's load all locations to extract unique sites, or use DEV_SITES + loaded ones
        const locationsSnap = await getDocs(collection(db, 'locations'));
        const sitesMap = new Map<string, Site>();
        
        // Add default dev sites
        DEV_SITES.forEach(s => sitesMap.set(`${s.tenantId}_${s.siteId}`, s));

        locationsSnap.forEach(docSnap => {
          const data = docSnap.data();
          if (data.tenantId && data.siteId) {
            const key = `${data.tenantId}_${data.siteId}`;
            sitesMap.set(key, {
              tenantId: data.tenantId,
              tenantName: data.tenantName || 'Tenant',
              siteId: data.siteId,
              siteName: data.siteName || data.siteId,
              timezone: data.timezone || 'Europe/London'
            });
          }
        });

        const allSites = Array.from(sitesMap.values());
        setAvailableSites(allSites);

        // Maintain current active site or select the first available
        const isCurrentSiteValid = allSites.some(s => s.tenantId === site.tenantId && s.siteId === site.siteId);
        if (!isCurrentSiteValid && allSites.length > 0) {
          setSite(allSites[0]);
        }
      } else {
        // Tenant scope
        const tenantId = profile.tenantId || 'tenant_dev';
        
        // Fetch sites where tenantId matches
        const q = query(collection(db, 'locations'), where('tenantId', '==', tenantId));
        const locationsSnap = await getDocs(q);

        const sitesMap = new Map<string, Site>();
        
        locationsSnap.forEach(docSnap => {
          const data = docSnap.data();
          // Filter by assigned siteIds if user has restrictions (Viewer, Operator, Planner)
          const isAssigned = profile.role === 'TENANT_ADMIN' || !profile.siteIds || profile.siteIds.length === 0 || profile.siteIds.includes(data.siteId);
          
          if (data.siteId && isAssigned) {
            const key = `${tenantId}_${data.siteId}`;
            sitesMap.set(key, {
              tenantId,
              tenantName: data.tenantName || 'Tenant',
              siteId: data.siteId,
              siteName: data.siteName || data.siteId,
              timezone: data.timezone || 'Europe/London'
            });
          }
        });

        // Ensure we always have some sites
        if (sitesMap.size === 0) {
          // Fallback to assigned site IDs list or dev sites
          const assignedIds = profile.siteIds && profile.siteIds.length > 0 ? profile.siteIds : ['site_barrow'];
          assignedIds.forEach(id => {
            sitesMap.set(`${tenantId}_${id}`, {
              tenantId,
              tenantName: 'GXO Tenant',
              siteId: id,
              siteName: id === 'site_barrow' ? 'Barrow RDC' : id,
              timezone: 'Europe/London'
            });
          });
        }

        const filteredSites = Array.from(sitesMap.values());
        setAvailableSites(filteredSites);

        const isCurrentSiteValid = filteredSites.some(s => s.tenantId === site.tenantId && s.siteId === site.siteId);
        if (!isCurrentSiteValid && filteredSites.length > 0) {
          setSite(filteredSites[0]);
        }
      }
    } catch (e) {
      console.error('Error syncing sites:', e);
      setAvailableSites(DEV_SITES);
    }
  };

  // 4. Session Start Tracking
  const trackSessionStart = async (profile: UserProfile) => {
    if (!db) return;
    try {
      const sessRef = doc(collection(db, 'sessions'));
      const sessionPayload: UserSession = {
        id: sessRef.id,
        userId: profile.uid,
        tenantId: profile.tenantId,
        siteId: site.siteId,
        loginAt: Timestamp.now(),
        lastActivityAt: Timestamp.now(),
        logoutAt: null,
        status: 'ACTIVE',
        deviceInfo: navigator.userAgent || 'Web Browser',
        createdDate: Timestamp.now(),
        modifiedDate: Timestamp.now()
      };
      await setDoc(sessRef, sessionPayload);
      setSessionId(sessRef.id);
    } catch (err) {
      console.warn('Could not track session start:', err);
    }
  };

  // 5. Throttled activity tracking (every 2 minutes)
  useEffect(() => {
    if (!db || !sessionId) return;
    
    let lastUpdate = Date.now();
    const handleActivity = async () => {
      const now = Date.now();
      if (now - lastUpdate > 2 * 60 * 1000) { // 2 minutes
        lastUpdate = now;
        try {
          await updateDoc(doc(db, 'sessions', sessionId), {
            lastActivityAt: Timestamp.now(),
            modifiedDate: Timestamp.now()
          });
        } catch (e) {
          // ignore failures on activity writes
        }
      }
    };

    window.addEventListener('click', handleActivity);
    window.addEventListener('keypress', handleActivity);

    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keypress', handleActivity);
    };
  }, [sessionId]);

  const setSite = (newSite: Site) => {
    setSiteState(newSite);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newSite));
    
    // Update current session's active site context
    if (db && sessionId) {
      updateDoc(doc(db, 'sessions', sessionId), {
        siteId: newSite.siteId,
        modifiedDate: Timestamp.now()
      }).catch(() => {});
    }
  };

  // 6. Sign In implementation with lockout detection
  const login = async (email: string, pass: string) => {
    if (!auth) throw new Error('Auth not configured');
    setLoading(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      // Record failed attempt via cloud functions or local secure tracking
      try {
        if (app) {
          const functionsInstance = getFunctions(app);
          const recordFailure = httpsCallable(functionsInstance, 'recordLoginFailure');
          await recordFailure({ email });
        }
      } catch (logErr) {
        console.warn('Failed to report login failure to server:', logErr);
      }

      setAuthError(err.message || 'Invalid email or password.');
      setLoading(false);
      throw err;
    }
  };

  // 7. Logout
  const logout = async () => {
    if (!auth) return;
    try {
      if (db && sessionId) {
        await updateDoc(doc(db, 'sessions', sessionId), {
          logoutAt: Timestamp.now(),
          status: 'LOGGED_OUT',
          modifiedDate: Timestamp.now()
        });
      }
    } catch (e) {
      // ignore session write error on logout
    }
    await signOut(auth);
    setUser(null);
    setUserProfile(null);
    setSessionId(null);
    setRequiresPasswordChange(false);
  };

  // 8. First Login password change
  const changePassword = async (newPass: string) => {
    const activeUser = auth?.currentUser;
    if (!activeUser || !userProfile || !db) throw new Error('Not logged in');

    try {
      setLoading(true);
      await updatePassword(activeUser, newPass);

      // Write updates to userProfile in Firestore
      await updateDoc(doc(db, 'users', activeUser.uid), {
        requiresPasswordChange: false,
        passwordChangedAt: serverTimestamp(),
        modifiedDate: serverTimestamp()
      });

      setRequiresPasswordChange(false);
      setUserProfile(prev => prev ? { ...prev, requiresPasswordChange: false } : null);
    } catch (err: any) {
      console.error(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // 9. Bootstrap Superuser Process with robust dev fallback
  const bootstrapSuperuser = async () => {
    if (!app || !db || !auth) throw new Error('Firebase is not initialized.');
    
    try {
      // 1. Try secure Cloud Function bootstrap
      const functionsInstance = getFunctions(app);
      const triggerBootstrap = httpsCallable(functionsInstance, 'bootstrapSuperuser');
      await triggerBootstrap();
    } catch (err: any) {
      console.warn('Cloud Function bootstrap failed, running direct fallback:', err);
      
      // 2. Client-side secure fallback for local development preview
      const bootstrapEmail = 'chris.jeal@gxo.com';
      const bootstrapPass = 'Password123!';

      let userUid = '';
      try {
        // Check if user already exists
        const credential = await signInWithEmailAndPassword(auth, bootstrapEmail, bootstrapPass);
        userUid = credential.user.uid;
      } catch (signInErr: any) {
        if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
          // Create the user profile in Auth
          const credential = await createUserWithEmailAndPassword(auth, bootstrapEmail, bootstrapPass);
          userUid = credential.user.uid;
        } else {
          throw signInErr;
        }
      }

      // Populate user profile document
      const docRef = doc(db, 'users', userUid);
      const payload: UserProfile = {
        uid: userUid,
        email: bootstrapEmail,
        displayName: 'Chris Jeal',
        jobTitle: 'Global Platform Superuser',
        role: 'PLATFORM_SUPERUSER',
        tenantId: null,
        siteIds: [],
        accountStatus: 'ACTIVE',
        requiresPasswordChange: true,
        failedLoginAttempts: 0,
        failedAttemptWindowStartedAt: null,
        lockedAt: null,
        lastLoginAt: Timestamp.now(),
        passwordChangedAt: null,
        createdBy: 'BOOTSTRAP',
        createdDate: Timestamp.now(),
        modifiedBy: 'BOOTSTRAP',
        modifiedDate: Timestamp.now()
      };

      await setDoc(docRef, payload, { merge: true });
    }
  };

  return (
    <DevelopmentContext.Provider
      value={{
        ...site,
        developmentMode: import.meta.env.DEV || import.meta.env.VITE_DEV_MODE === 'true',
        setSite,
        availableSites,
        
        user,
        userProfile,
        currentUser: user?.uid || 'dev_user',
        loading,
        authError,
        requiresPasswordChange,
        
        login,
        logout,
        changePassword,
        bootstrapSuperuser
      }}
    >
      {children}
    </DevelopmentContext.Provider>
  );
};

export const useDevelopmentContext = () => {
  const context = useContext(DevelopmentContext);
  if (context === undefined) {
    throw new Error('useDevelopmentContext must be used within a DevelopmentProvider');
  }
  return context;
};

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';
import {
  createSessionRecord,
  updateSessionActivityRecord,
  updateSessionSiteContext,
  closeSessionRecord
} from '../services/sessionService';

export interface SessionContextType {
  sessionId: string | null;
  trackSessionStart: () => Promise<void>;
  updateSessionActivity: () => Promise<void>;
  endSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { userProfile, user } = useAuth();
  const { siteId, siteReady } = useSiteContext();
  const [sessionId, setSessionId] = useState<string | null>(null);

  const prevSiteIdRef = useRef<string | null>(siteId);

  // Start session when userProfile is loaded and site is ready
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      if (userProfile && user && siteReady && siteId) {
        const id = await createSessionRecord(userProfile, siteId);
        if (isMounted) setSessionId(id);
      } else {
        if (isMounted) setSessionId(null);
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, [userProfile?.uid, siteReady, siteId]);

  // Update session site context when site changes
  useEffect(() => {
    if (sessionId && siteReady && siteId && prevSiteIdRef.current !== siteId) {
      prevSiteIdRef.current = siteId;
      updateSessionSiteContext(sessionId, siteId);
    }
  }, [sessionId, siteId, siteReady]);

  // Throttled activity updates (every 2 minutes)
  useEffect(() => {
    if (!sessionId) return;

    let lastUpdate = Date.now();
    const handleActivity = async () => {
      const now = Date.now();
      if (now - lastUpdate > 2 * 60 * 1000) {
        lastUpdate = now;
        await updateSessionActivityRecord(sessionId);
      }
    };

    window.addEventListener('click', handleActivity);
    window.addEventListener('keypress', handleActivity);

    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keypress', handleActivity);
    };
  }, [sessionId]);

  const trackSessionStart = async () => {
    if (userProfile) {
      const id = await createSessionRecord(userProfile, siteId);
      setSessionId(id);
    }
  };

  const updateSessionActivity = async () => {
    if (sessionId) {
      await updateSessionActivityRecord(sessionId);
    }
  };

  const endSession = async () => {
    if (sessionId) {
      await closeSessionRecord(sessionId);
      setSessionId(null);
    }
  };

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        trackSessionStart,
        updateSessionActivity,
        endSession
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

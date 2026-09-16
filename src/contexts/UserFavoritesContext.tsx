import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../features/auth/context/AuthContext';
import { UserFavorite } from '../types/favorites';
import { UserFavoritesService } from '../services/userFavoritesService';

interface UserFavoritesContextType {
  favorites: UserFavorite[];
  loading: boolean;
  isFavorite: (path: string) => boolean;
  toggleFavorite: (item: { path: string; title: string; iconName?: string; groupTitle?: string }) => Promise<boolean>;
  removeFavorite: (path: string) => Promise<void>;
  refreshFavorites: () => Promise<void>;
}

const UserFavoritesContext = createContext<UserFavoritesContextType | undefined>(undefined);

export const UserFavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile } = useAuth();
  const [favorites, setFavorites] = useState<UserFavorite[]>([]);
  const [loading, setLoading] = useState(true);

  const tenantId = userProfile?.tenantId || '';
  const userId = userProfile?.id || '';

  const refreshFavorites = useCallback(async () => {
    if (!tenantId || !userId) {
      setFavorites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const favs = await UserFavoritesService.getFavorites(tenantId, userId);
      setFavorites(favs);
    } catch (err) {
      console.error('[UserFavoritesContext] Error loading favorites:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, userId]);

  useEffect(() => {
    refreshFavorites();
  }, [refreshFavorites]);

  const isFavorite = useCallback(
    (path: string) => {
      return favorites.some(f => f.path === path);
    },
    [favorites]
  );

  const toggleFavorite = useCallback(
    async (item: { path: string; title: string; iconName?: string; groupTitle?: string }): Promise<boolean> => {
      if (!tenantId || !userId) return false;
      const { isFavorite: newStatus, favorites: updatedList } = await UserFavoritesService.toggleFavorite(
        tenantId,
        userId,
        item
      );
      setFavorites(updatedList);
      return newStatus;
    },
    [tenantId, userId]
  );

  const removeFavorite = useCallback(
    async (path: string) => {
      if (!tenantId || !userId) return;
      const updatedList = await UserFavoritesService.removeFavorite(tenantId, userId, path);
      setFavorites(updatedList);
    },
    [tenantId, userId]
  );

  return (
    <UserFavoritesContext.Provider
      value={{
        favorites,
        loading,
        isFavorite,
        toggleFavorite,
        removeFavorite,
        refreshFavorites,
      }}
    >
      {children}
    </UserFavoritesContext.Provider>
  );
};

export const useUserFavorites = () => {
  const context = useContext(UserFavoritesContext);
  if (!context) {
    throw new Error('useUserFavorites must be used within a UserFavoritesProvider');
  }
  return context;
};

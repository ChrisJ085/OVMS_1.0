import { supabase } from '../config/supabase';
import { UserFavorite } from '../types/favorites';
import { toSnakeCase, toCamelCase } from '../utils/caseTransformers';

const STORAGE_KEY = (tenantId: string, userId: string) => `ovms_user_favs_${tenantId}_${userId}`;

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export class UserFavoritesService {
  /**
   * Get all favorites for the active user & tenant.
   */
  public static async getFavorites(tenantId: string, userId: string): Promise<UserFavorite[]> {
    const effectiveTenant = tenantId || 'DEFAULT_TENANT';
    const effectiveUser = userId || 'guest_user';

    // 1. Try fetching local storage first for instant load
    let cachedFavs: UserFavorite[] = [];
    try {
      const local = localStorage.getItem(STORAGE_KEY(effectiveTenant, effectiveUser));
      if (local) {
        cachedFavs = JSON.parse(local);
      }
    } catch {
      cachedFavs = [];
    }

    // 2. Try fetching from Supabase table `user_favorites`
    try {
      const { data, error } = await supabase
        .from('user_favorites')
        .select('*')
        .eq('tenant_id', effectiveTenant)
        .eq('user_id', effectiveUser)
        .order('order_index', { ascending: true });

      if (!error && data && Array.isArray(data)) {
        const camelData = toCamelCase<UserFavorite[]>(data);
        localStorage.setItem(STORAGE_KEY(effectiveTenant, effectiveUser), JSON.stringify(camelData));
        return camelData;
      }
    } catch (err) {
      console.warn('[UserFavoritesService] Supabase fetch fallback to local storage:', err);
    }

    return cachedFavs;
  }

  /**
   * Toggle a favorite item for the user.
   */
  public static async toggleFavorite(
    tenantId: string,
    userId: string,
    item: { path: string; title: string; iconName?: string; groupTitle?: string }
  ): Promise<{ isFavorite: boolean; favorites: UserFavorite[] }> {
    const effectiveTenant = tenantId || 'DEFAULT_TENANT';
    const effectiveUser = userId || 'guest_user';

    const currentFavs = await this.getFavorites(effectiveTenant, effectiveUser);
    const existingIndex = currentFavs.findIndex(f => f.path === item.path);

    let updatedFavs: UserFavorite[] = [];
    let isFavorite = false;

    if (existingIndex >= 0) {
      // Remove favorite
      updatedFavs = currentFavs.filter(f => f.path !== item.path);
      isFavorite = false;

      // LocalStorage sync immediately
      try {
        localStorage.setItem(STORAGE_KEY(effectiveTenant, effectiveUser), JSON.stringify(updatedFavs));
      } catch (err) {
        console.warn('[UserFavoritesService] LocalStorage write error:', err);
      }

      // Delete from Supabase in background
      try {
        const { error } = await supabase
          .from('user_favorites')
          .delete()
          .eq('tenant_id', effectiveTenant)
          .eq('user_id', effectiveUser)
          .eq('path', item.path);

        if (error) {
          console.warn('[UserFavoritesService] Supabase delete warning:', error.message);
        }
      } catch (err) {
        console.warn('[UserFavoritesService] Supabase delete exception:', err);
      }
    } else {
      // Add favorite
      const newFav: UserFavorite = {
        id: generateUUID(),
        tenantId: effectiveTenant,
        userId: effectiveUser,
        path: item.path,
        title: item.title || 'Page',
        iconName: item.iconName,
        groupTitle: item.groupTitle,
        orderIndex: currentFavs.length,
        createdAt: new Date().toISOString()
      };

      updatedFavs = [...currentFavs, newFav];
      isFavorite = true;

      // LocalStorage sync immediately
      try {
        localStorage.setItem(STORAGE_KEY(effectiveTenant, effectiveUser), JSON.stringify(updatedFavs));
      } catch (err) {
        console.warn('[UserFavoritesService] LocalStorage write error:', err);
      }

      // Insert to Supabase in background
      try {
        const payload = toSnakeCase(newFav);
        const { error } = await supabase
          .from('user_favorites')
          .upsert(payload, { onConflict: 'tenant_id,user_id,path' });

        if (error) {
          console.warn('[UserFavoritesService] Supabase upsert warning:', error.message);
        }
      } catch (err) {
        console.warn('[UserFavoritesService] Supabase upsert exception:', err);
      }
    }

    return { isFavorite, favorites: updatedFavs };
  }

  /**
   * Remove a favorite by ID or Path.
   */
  public static async removeFavorite(tenantId: string, userId: string, path: string): Promise<UserFavorite[]> {
    const { favorites } = await this.toggleFavorite(tenantId, userId, { path, title: '' });
    return favorites;
  }
}

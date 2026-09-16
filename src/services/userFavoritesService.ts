import { supabase } from '../config/supabase';
import { UserFavorite } from '../types/favorites';
import { toSnakeCase, toCamelCase } from '../utils/caseTransformers';

const STORAGE_KEY = (tenantId: string, userId: string) => `ovms_user_favs_${tenantId}_${userId}`;

export class UserFavoritesService {
  /**
   * Get all favorites for the active user & tenant.
   */
  public static async getFavorites(tenantId: string, userId: string): Promise<UserFavorite[]> {
    if (!tenantId || !userId) return [];

    // 1. Try fetching from Supabase table `user_favorites`
    try {
      const { data, error } = await supabase
        .from('user_favorites')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .order('order_index', { ascending: true });

      if (!error && data && data.length >= 0) {
        const camelData = toCamelCase<UserFavorite[]>(data);
        // Sync local cache
        localStorage.setItem(STORAGE_KEY(tenantId, userId), JSON.stringify(camelData));
        return camelData;
      }
    } catch (err) {
      // Fallback to local storage if table doesn't exist yet
      console.warn('[UserFavoritesService] Supabase fetch fallback to local storage:', err);
    }

    // 2. Fallback to LocalStorage
    try {
      const local = localStorage.getItem(STORAGE_KEY(tenantId, userId));
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  }

  /**
   * Toggle a favorite item for the user.
   */
  public static async toggleFavorite(
    tenantId: string,
    userId: string,
    item: { path: string; title: string; iconName?: string; groupTitle?: string }
  ): Promise<{ isFavorite: boolean; favorites: UserFavorite[] }> {
    const currentFavs = await this.getFavorites(tenantId, userId);
    const existingIndex = currentFavs.findIndex(f => f.path === item.path);

    let updatedFavs: UserFavorite[] = [];
    let isFavorite = false;

    if (existingIndex >= 0) {
      // Remove favorite
      const toRemove = currentFavs[existingIndex];
      updatedFavs = currentFavs.filter(f => f.path !== item.path);
      isFavorite = false;

      // Delete from Supabase
      try {
        await supabase
          .from('user_favorites')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('user_id', userId)
          .eq('path', item.path);
      } catch (err) {
        console.warn('[UserFavoritesService] Supabase delete warning:', err);
      }
    } else {
      // Add favorite
      const newFav: UserFavorite = {
        id: crypto.randomUUID ? crypto.randomUUID() : `fav-${Date.now()}`,
        tenantId,
        userId,
        path: item.path,
        title: item.title,
        iconName: item.iconName,
        groupTitle: item.groupTitle,
        orderIndex: currentFavs.length,
        createdAt: new Date().toISOString()
      };

      updatedFavs = [...currentFavs, newFav];
      isFavorite = true;

      // Insert to Supabase
      try {
        const payload = toSnakeCase(newFav);
        await supabase.from('user_favorites').upsert(payload, { onConflict: 'tenant_id,user_id,path' });
      } catch (err) {
        console.warn('[UserFavoritesService] Supabase insert warning:', err);
      }
    }

    // Update LocalStorage
    try {
      localStorage.setItem(STORAGE_KEY(tenantId, userId), JSON.stringify(updatedFavs));
    } catch (err) {
      console.warn('[UserFavoritesService] LocalStorage write error:', err);
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

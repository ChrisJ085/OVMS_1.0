import { SopDocument, SopCategory, SopDifficulty, UserSopProgress, WhatsNewItem, SopProgressStatus } from '../../../types/learning';
import { UserRole } from '../../../types/auth';
import { SEED_SOPS } from '../data/seedSops';
import { SEED_WHATS_NEW } from '../data/whatsNew';

const STORAGE_KEYS = {
  CUSTOM_SOPS: (tenantId: string) => `ovms_custom_sops_${tenantId}`,
  USER_PROGRESS: (tenantId: string, userId: string) => `ovms_sop_progress_${tenantId}_${userId}`,
  USER_FAVORITES: (tenantId: string, userId: string) => `ovms_sop_favs_${tenantId}_${userId}`,
  USER_RECENTS: (tenantId: string, userId: string) => `ovms_sop_recents_${tenantId}_${userId}`,
};

export class LearningService {
  /**
   * Get all SOPs (seed SOPs merged with tenant custom/overridden SOPs).
   */
  public static getAllSops(tenantId?: string | null): SopDocument[] {
    const sopsMap = new Map<string, SopDocument>();

    // 1. Load seed SOPs
    SEED_SOPS.forEach(sop => {
      sopsMap.set(sop.id, { ...sop });
    });

    // 2. Load tenant custom / overridden SOPs if tenant exists
    if (tenantId) {
      try {
        const customSopsRaw = localStorage.getItem(STORAGE_KEYS.CUSTOM_SOPS(tenantId));
        if (customSopsRaw) {
          const customSops: SopDocument[] = JSON.parse(customSopsRaw);
          customSops.forEach(customSop => {
            if (customSop.status !== 'ARCHIVED') {
              sopsMap.set(customSop.id, customSop);
            } else {
              // If marked archived, remove from general visibility unless admin explicitly asks
              sopsMap.delete(customSop.id);
            }
          });
        }
      } catch (err) {
        console.warn('Error reading custom SOPs from storage:', err);
      }
    }

    return Array.from(sopsMap.values());
  }

  /**
   * Get a single SOP by ID or slug.
   */
  public static getSopById(idOrSlug: string, tenantId?: string | null): SopDocument | null {
    const all = this.getAllSops(tenantId);
    return all.find(s => s.id === idOrSlug || s.slug === idOrSlug) || null;
  }

  /**
   * Search SOPs with ranked relevance scoring.
   */
  public static searchSops(
    query: string,
    options?: {
      category?: SopCategory | 'ALL';
      role?: UserRole;
      difficulty?: SopDifficulty | 'ALL';
      tenantId?: string | null;
    }
  ): SopDocument[] {
    const all = this.getAllSops(options?.tenantId);
    const cleanQuery = query.trim().toLowerCase();

    return all
      .filter(sop => {
        // Category filter
        if (options?.category && options.category !== 'ALL' && sop.category !== options.category) {
          return false;
        }

        // Difficulty filter
        if (options?.difficulty && options.difficulty !== 'ALL' && sop.difficulty !== options.difficulty) {
          return false;
        }

        // Role filter (if specified, user's role must be allowed)
        if (options?.role && !sop.applicableRoles.includes(options.role) && !sop.applicableRoles.includes('PLATFORM_SUPERUSER')) {
          // Allow superuser and tenant admin to see everything
          if (options.role !== 'PLATFORM_SUPERUSER' && options.role !== 'TENANT_ADMIN') {
            return false;
          }
        }

        // Text query filter
        if (!cleanQuery) return true;

        const titleMatch = sop.title.toLowerCase().includes(cleanQuery);
        const descMatch = sop.shortDescription.toLowerCase().includes(cleanQuery) || sop.fullDescription.toLowerCase().includes(cleanQuery);
        const keywordsMatch = sop.keywords.some(k => k.toLowerCase().includes(cleanQuery));
        const stepsMatch = sop.steps.some(step => 
          step.title.toLowerCase().includes(cleanQuery) || 
          step.instruction.toLowerCase().includes(cleanQuery) ||
          (step.tip && step.tip.toLowerCase().includes(cleanQuery)) ||
          (step.warning && step.warning.toLowerCase().includes(cleanQuery))
        );
        const troubleshootingMatch = sop.troubleshooting?.some(t =>
          t.problem.toLowerCase().includes(cleanQuery) ||
          t.solutions.some(sol => sol.toLowerCase().includes(cleanQuery))
        );

        return titleMatch || descMatch || keywordsMatch || stepsMatch || troubleshootingMatch;
      })
      .sort((a, b) => {
        if (!cleanQuery) return 0;
        // Calculate relevance rank
        const scoreA = this.calculateRelevance(a, cleanQuery);
        const scoreB = this.calculateRelevance(b, cleanQuery);
        return scoreB - scoreA;
      });
  }

  private static calculateRelevance(sop: SopDocument, q: string): number {
    let score = 0;
    const titleLower = sop.title.toLowerCase();
    if (titleLower === q) score += 100;
    else if (titleLower.startsWith(q)) score += 50;
    else if (titleLower.includes(q)) score += 30;

    if (sop.keywords.some(k => k.toLowerCase() === q)) score += 25;
    if (sop.keywords.some(k => k.toLowerCase().includes(q))) score += 15;

    if (sop.shortDescription.toLowerCase().includes(q)) score += 10;
    if (sop.fullDescription.toLowerCase().includes(q)) score += 5;
    if (sop.steps.some(s => s.title.toLowerCase().includes(q))) score += 10;
    if (sop.steps.some(s => s.instruction.toLowerCase().includes(q))) score += 5;

    return score;
  }

  /**
   * Get User Progress for all SOPs.
   */
  public static getUserProgressMap(tenantId: string, userId: string): Record<string, UserSopProgress> {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_PROGRESS(tenantId, userId));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  /**
   * Update SOP Progress for a user.
   */
  public static updateSopProgress(
    tenantId: string,
    userId: string,
    sopId: string,
    updates: Partial<UserSopProgress>
  ): UserSopProgress {
    const map = this.getUserProgressMap(tenantId, userId);
    const existing = map[sopId] || {
      sopId,
      userId,
      tenantId,
      status: 'NOT_STARTED',
      currentStepNumber: 1,
      lastViewedAt: new Date().toISOString()
    };

    const updated: UserSopProgress = {
      ...existing,
      ...updates,
      lastViewedAt: new Date().toISOString()
    };

    if (updates.status === 'IN_PROGRESS' && !existing.startedAt) {
      updated.startedAt = new Date().toISOString();
    }
    if (updates.status === 'COMPLETED' && !existing.completedAt) {
      updated.completedAt = new Date().toISOString();
    }

    map[sopId] = updated;
    localStorage.setItem(STORAGE_KEYS.USER_PROGRESS(tenantId, userId), JSON.stringify(map));
    return updated;
  }

  /**
   * Acknowledge reading an SOP version.
   */
  public static acknowledgeSop(
    tenantId: string,
    userId: string,
    sopId: string,
    version: string
  ): UserSopProgress {
    return this.updateSopProgress(tenantId, userId, sopId, {
      status: 'COMPLETED',
      acknowledgedVersion: version,
      acknowledgedAt: new Date().toISOString()
    });
  }

  /**
   * Get User Favorites.
   */
  public static getUserFavorites(tenantId: string, userId: string): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_FAVORITES(tenantId, userId));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Toggle SOP Favorite.
   */
  public static toggleFavorite(tenantId: string, userId: string, sopId: string): boolean {
    const favs = this.getUserFavorites(tenantId, userId);
    const idx = favs.indexOf(sopId);
    let isFav = false;
    if (idx >= 0) {
      favs.splice(idx, 1);
      isFav = false;
    } else {
      favs.push(sopId);
      isFav = true;
    }
    localStorage.setItem(STORAGE_KEYS.USER_FAVORITES(tenantId, userId), JSON.stringify(favs));
    return isFav;
  }

  /**
   * Get Recently Viewed SOP IDs.
   */
  public static getRecentlyViewed(tenantId: string, userId: string): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_RECENTS(tenantId, userId));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Record viewing an SOP.
   */
  public static recordView(tenantId: string, userId: string, sopId: string): void {
    const recents = this.getRecentlyViewed(tenantId, userId).filter(id => id !== sopId);
    recents.unshift(sopId);
    // Keep top 10
    const trimmed = recents.slice(0, 10);
    localStorage.setItem(STORAGE_KEYS.USER_RECENTS(tenantId, userId), JSON.stringify(trimmed));
  }

  /**
   * Admin: Save (Create or Update) custom or overridden SOP.
   */
  public static saveCustomSop(tenantId: string, sop: SopDocument): SopDocument {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_SOPS(tenantId));
      const list: SopDocument[] = raw ? JSON.parse(raw) : [];
      const index = list.findIndex(s => s.id === sop.id);

      const toSave: SopDocument = {
        ...sop,
        tenantId,
        isCustomOrOverridden: true,
        updatedDate: new Date().toISOString()
      };

      if (index >= 0) {
        list[index] = toSave;
      } else {
        list.push(toSave);
      }

      localStorage.setItem(STORAGE_KEYS.CUSTOM_SOPS(tenantId), JSON.stringify(list));
      return toSave;
    } catch (err) {
      console.error('Error saving custom SOP:', err);
      throw err;
    }
  }

  /**
   * Admin: Delete/Archive custom SOP.
   */
  public static deleteCustomSop(tenantId: string, sopId: string): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_SOPS(tenantId));
      if (!raw) return;
      const list: SopDocument[] = JSON.parse(raw);
      const filtered = list.filter(s => s.id !== sopId);
      localStorage.setItem(STORAGE_KEYS.CUSTOM_SOPS(tenantId), JSON.stringify(filtered));
    } catch (err) {
      console.error('Error deleting custom SOP:', err);
    }
  }

  /**
   * Get What's New items.
   */
  public static getWhatsNew(): WhatsNewItem[] {
    return SEED_WHATS_NEW;
  }
}

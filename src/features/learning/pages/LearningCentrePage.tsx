import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLearning } from '../context/LearningContext';
import { SOP_CATEGORIES } from '../data/seedSops';
import { SopCard } from '../components/SopCard';
import { WhatsNewFeed } from '../components/WhatsNewFeed';
import { LearningService } from '../services/learningService';
import { useAuth } from '../../auth/context/AuthContext';
import { 
  BookOpen, 
  Search, 
  Sparkles, 
  GraduationCap, 
  Bookmark, 
  Clock, 
  Plus, 
  CheckCircle2, 
  SlidersHorizontal,
  Filter,
  Compass,
  Layers,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  X
} from 'lucide-react';
import { SopCategory, SopDifficulty, SopDocument } from '../../../types/learning';
import { UserRole } from '../../../types/auth';

export const LearningCentrePage: React.FC = () => {
  const { allSops, favorites, recentSops, userProgress, whatsNewItems, openHelpDrawer } = useLearning();
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SopCategory | 'ALL'>('ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState<SopDifficulty | 'ALL'>('ALL');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [activeTab, setActiveTab] = useState<'CATALOG' | 'MY_LEARNING' | 'WHATS_NEW'>('CATALOG');

  const canManageSops = userProfile?.role === 'PLATFORM_SUPERUSER' || userProfile?.role === 'TENANT_ADMIN';

  // Calculate user learning progress
  const totalSops = allSops.length;
  const completedCount = useMemo(() => {
    return Object.values(userProgress).filter(p => p.status === 'COMPLETED').length;
  }, [userProgress]);

  const inProgressCount = useMemo(() => {
    return Object.values(userProgress).filter(p => p.status === 'IN_PROGRESS').length;
  }, [userProgress]);

  const completionPercent = totalSops > 0 ? Math.round((completedCount / totalSops) * 100) : 0;

  // Filtered SOPs list
  const filteredSops = useMemo(() => {
    return LearningService.searchSops(searchQuery, {
      category: selectedCategory,
      difficulty: selectedDifficulty,
      role: selectedRoleFilter === 'ALL' ? undefined : selectedRoleFilter,
      tenantId: userProfile?.tenantId
    });
  }, [searchQuery, selectedCategory, selectedDifficulty, selectedRoleFilter, userProfile]);

  // Getting started quick guides
  const gettingStartedSops = useMemo(() => {
    return allSops.filter(s => s.category === 'GETTING_STARTED').slice(0, 4);
  }, [allSops]);

  // Favorite SOPs
  const favoriteSops = useMemo(() => {
    return allSops.filter(s => favorites.includes(s.id));
  }, [allSops, favorites]);

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Banner with Search */}
      <div className="relative rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-brand-950/40 border border-slate-800 p-6 md:p-8 shadow-xl overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-brand-500/5 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <GraduationCap className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-400">
              OVMS Learning & SOP Centre
            </span>
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Standard Operating Procedures & System Mastery
            </h1>
            <p className="text-sm md:text-base text-slate-300 leading-relaxed">
              Step-by-step guides, troubleshooting procedures, and role playbooks to run warehouse operations smoothly.
            </p>
          </div>

          {/* Search Input */}
          <div className="pt-2">
            <div className="relative max-w-2xl">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-3.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search procedures, problem remedies, SKUs, rules, or workflows..."
                className="w-full bg-slate-950/90 border border-slate-700 hover:border-slate-600 focus:border-brand-500 rounded-xl pl-12 pr-10 py-3 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 shadow-lg transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Learning Stats Pill Header */}
        <div className="mt-6 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-slate-400 block text-[11px]">Total SOPs</span>
              <span className="text-base font-bold text-slate-100">{totalSops}</span>
            </div>
            <div className="h-7 w-px bg-slate-800" />
            <div>
              <span className="text-slate-400 block text-[11px]">Completed</span>
              <span className="text-base font-bold text-emerald-400">{completedCount}</span>
            </div>
            <div className="h-7 w-px bg-slate-800" />
            <div>
              <span className="text-slate-400 block text-[11px]">In Progress</span>
              <span className="text-base font-bold text-amber-400">{inProgressCount}</span>
            </div>
            <div className="h-7 w-px bg-slate-800" />
            <div>
              <span className="text-slate-400 block text-[11px]">Completion Rate</span>
              <span className="text-base font-bold text-brand-400">{completionPercent}%</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canManageSops && (
              <button
                type="button"
                onClick={() => navigate('/learning/editor')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-brand-400" />
                Create Custom SOP
              </button>
            )}

            <button
              type="button"
              onClick={() => openHelpDrawer()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-colors shadow-sm cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Open Help Panel
            </button>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('CATALOG')}
            className={`px-4 py-2 rounded-lg font-bold transition-all cursor-pointer ${
              activeTab === 'CATALOG'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            SOP Catalog ({totalSops})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MY_LEARNING')}
            className={`px-4 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'MY_LEARNING'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            My Learning & Saved ({favorites.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('WHATS_NEW')}
            className={`px-4 py-2 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'WHATS_NEW'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            What's New ({whatsNewItems.length})
          </button>
        </div>

        {/* Global Help Hint */}
        <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-slate-500">
          Tip: Press <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[11px] font-mono text-slate-300">?</kbd> anywhere to open instant Help
        </span>
      </div>

      {/* TAB CONTENT 1: SOP CATALOG */}
      {activeTab === 'CATALOG' && (
        <div className="space-y-8">
          {/* Quick Categories Bento Grid (shown when not actively searching) */}
          {!searchQuery && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                  Browse by Category
                </h3>
                {selectedCategory !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('ALL')}
                    className="text-xs text-brand-400 hover:text-brand-300 font-semibold cursor-pointer"
                  >
                    Clear category filter
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {SOP_CATEGORIES.map(cat => {
                  const isSelected = selectedCategory === cat.id;
                  const count = allSops.filter(s => s.category === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat.id)}
                      className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                        isSelected
                          ? 'bg-brand-500/15 border-brand-500 shadow-md'
                          : 'bg-slate-900/80 hover:bg-slate-850 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${cat.colorClass}`}>
                          {cat.title}
                        </span>
                        <span className="text-xs font-bold text-slate-400 font-mono">
                          {count}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {cat.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Getting Started Fast-Track (shown when not searching & ALL categories) */}
          {!searchQuery && selectedCategory === 'ALL' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                    Getting Started Fast-Track
                  </h3>
                </div>
                <span className="text-xs text-slate-400">Essential onboarding for all roles</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {gettingStartedSops.map(sop => (
                  <SopCard key={sop.id} sop={sop} isCompact />
                ))}
              </div>
            </div>
          )}

          {/* SOP Filtering Toolbar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-400 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" />
                  Filters:
                </span>

                {/* Role Filter */}
                <select
                  value={selectedRoleFilter}
                  onChange={e => setSelectedRoleFilter(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-brand-500 cursor-pointer"
                >
                  <option value="ALL">All Roles</option>
                  <option value="PLANNER">Planner</option>
                  <option value="WAREHOUSE_OPERATOR">Warehouse Operator</option>
                  <option value="TENANT_ADMIN">Tenant Admin</option>
                  <option value="PLATFORM_SUPERUSER">Superuser</option>
                  <option value="VIEWER">Viewer</option>
                  <option value="DISPLAY">Display Screen</option>
                </select>

                {/* Difficulty Filter */}
                <select
                  value={selectedDifficulty}
                  onChange={e => setSelectedDifficulty(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-brand-500 cursor-pointer"
                >
                  <option value="ALL">All Difficulties</option>
                  <option value="BEGINNER">Beginner</option>
                  <option value="INTERMEDIATE">Intermediate</option>
                  <option value="ADVANCED">Advanced</option>
                </select>

                {/* Category Filter */}
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-brand-500 cursor-pointer"
                >
                  <option value="ALL">All Categories</option>
                  {SOP_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-slate-400">
                Showing <span className="font-bold text-slate-200">{filteredSops.length}</span> of {totalSops} procedures
              </div>
            </div>
          </div>

          {/* SOP Catalog Grid */}
          <div className="space-y-4">
            {filteredSops.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/40 border border-slate-800/80 rounded-2xl space-y-3">
                <BookOpen className="w-10 h-10 text-slate-600 mx-auto" />
                <h4 className="text-base font-bold text-slate-300">No procedures match your filters</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Try adjusting your search terms, role filters, or category selections.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('ALL');
                    setSelectedDifficulty('ALL');
                    setSelectedRoleFilter('ALL');
                  }}
                  className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSops.map(sop => (
                  <SopCard key={sop.id} sop={sop} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: MY LEARNING & SAVED */}
      {activeTab === 'MY_LEARNING' && (
        <div className="space-y-8">
          {/* Learning Progress Summary Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-100">
                  Your Learning & Execution Progress
                </h3>
                <p className="text-xs text-slate-400">
                  Track your mastery across all OVMS operational modules.
                </p>
              </div>
              <span className="text-2xl font-extrabold text-brand-400 font-mono">
                {completionPercent}%
              </span>
            </div>

            {/* Overall Progress Bar */}
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-brand-500 h-full transition-all duration-500 rounded-full"
                style={{ width: `${completionPercent}%` }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs">
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-400 block">Completed SOPs</span>
                <span className="text-lg font-bold text-emerald-400">{completedCount}</span>
              </div>
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-400 block">In Progress</span>
                <span className="text-lg font-bold text-amber-400">{inProgressCount}</span>
              </div>
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-400 block">Bookmarked Favorites</span>
                <span className="text-lg font-bold text-brand-400">{favorites.length}</span>
              </div>
            </div>
          </div>

          {/* Bookmarked Favorites */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Bookmarked Procedures ({favoriteSops.length})
                </h3>
              </div>
            </div>

            {favoriteSops.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/40 border border-slate-800 rounded-xl space-y-2 text-slate-500">
                <Bookmark className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-sm font-semibold text-slate-400">No bookmarked procedures yet</p>
                <p className="text-xs">Click the bookmark icon on any SOP card to pin it here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {favoriteSops.map(sop => (
                  <SopCard key={sop.id} sop={sop} />
                ))}
              </div>
            )}
          </div>

          {/* Recently Viewed */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Recently Viewed ({recentSops.length})
                </h3>
              </div>
            </div>

            {recentSops.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/40 border border-slate-800 rounded-xl space-y-2 text-slate-500">
                <Clock className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-sm font-semibold text-slate-400">No recently viewed procedures</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentSops.map(sop => (
                  <SopCard key={sop.id} sop={sop} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: WHAT'S NEW & RELEASES */}
      {activeTab === 'WHATS_NEW' && (
        <div className="space-y-4 max-w-4xl">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-100">
              System Releases & Procedural Updates
            </h3>
            <p className="text-xs text-slate-400">
              Stay up-to-date with new feature rollouts, updated SOP guidelines, and operational notices.
            </p>
          </div>

          <WhatsNewFeed items={whatsNewItems} maxItems={20} />
        </div>
      )}
    </div>
  );
};

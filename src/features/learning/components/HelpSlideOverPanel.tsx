import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLearning } from '../context/LearningContext';
import { SOP_CATEGORIES } from '../data/seedSops';
import { SopStepViewer } from './SopStepViewer';
import { SopTroubleshootingSection } from './SopTroubleshootingSection';
import { LearningService } from '../services/learningService';
import { 
  X, 
  Search, 
  BookOpen, 
  Bookmark, 
  Clock, 
  Maximize2, 
  Compass, 
  ChevronRight, 
  ArrowLeft,
  Filter,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { SopCategory, SopDocument } from '../../../types/learning';
import { useAuth } from '../../auth/context/AuthContext';

export const HelpSlideOverPanel: React.FC = () => {
  const {
    isHelpDrawerOpen,
    closeHelpDrawer,
    activeSop,
    setActiveSopId,
    activeStepNumber,
    setActiveStepNumber,
    allSops,
    favorites,
    toggleFavorite,
    recentSops,
    contextualHelp,
    userProgress
  } = useLearning();

  const { userProfile } = useAuth();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SopCategory | 'ALL'>('ALL');
  const [activeTab, setActiveTab] = useState<'CURRENT' | 'ALL' | 'FAVORITES' | 'RECENTS'>('CURRENT');

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() && selectedCategory === 'ALL') {
      return [];
    }
    return LearningService.searchSops(searchQuery, {
      category: selectedCategory,
      role: userProfile?.role,
      tenantId: userProfile?.tenantId
    });
  }, [searchQuery, selectedCategory, userProfile]);

  const favoriteSops = useMemo(() => {
    return allSops.filter(sop => favorites.includes(sop.id));
  }, [allSops, favorites]);

  // When drawer opens and activeSop changes, sync view
  const currentViewingSop = activeSop || contextualHelp.defaultSop;

  const handleSelectSop = (sop: SopDocument) => {
    setActiveSopId(sop.id);
    setActiveTab('CURRENT');
    setSearchQuery('');
  };

  const handleOpenFullPage = () => {
    if (currentViewingSop) {
      closeHelpDrawer();
      navigate(`/learning/sop/${currentViewingSop.id}`);
    } else {
      closeHelpDrawer();
      navigate('/learning');
    }
  };

  if (!isHelpDrawerOpen) return null;

  return (
    <div
      id="ovms-help-slideover"
      className="fixed inset-0 z-50 overflow-hidden flex justify-end"
      aria-labelledby="slide-over-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Background Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={closeHelpDrawer}
      />

      {/* Slide-out Container */}
      <div className="relative w-full max-w-lg bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
        {/* Header Bar */}
        <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 id="slide-over-title" className="text-sm font-bold text-slate-100 tracking-tight flex items-center gap-2">
                <span>Learning & SOP Help</span>
                <span className="text-[10px] bg-brand-500/20 text-brand-300 font-semibold px-2 py-0.5 rounded-full border border-brand-500/30">
                  Live Guidance
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                In-app guidance while you work
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleOpenFullPage}
              title="Open in Full Learning Centre"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={closeHelpDrawer}
              title="Close Help Panel (Esc)"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Navigation Toolbar */}
        <div className="p-4 border-b border-slate-800/80 space-y-3 bg-slate-900/40">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search all SOPs, problems, terms..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Tab Navigation */}
          {!searchQuery && (
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('CURRENT')}
                className={`flex-1 py-1.5 rounded-md font-semibold text-center transition-all cursor-pointer ${
                  activeTab === 'CURRENT'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                This Screen
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ALL')}
                className={`flex-1 py-1.5 rounded-md font-semibold text-center transition-all cursor-pointer ${
                  activeTab === 'ALL'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                All SOPs
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('FAVORITES')}
                className={`flex-1 py-1.5 rounded-md font-semibold text-center transition-all cursor-pointer ${
                  activeTab === 'FAVORITES'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                Saved ({favorites.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('RECENTS')}
                className={`flex-1 py-1.5 rounded-md font-semibold text-center transition-all cursor-pointer ${
                  activeTab === 'RECENTS'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                Recent
              </button>
            </div>
          )}
        </div>

        {/* Panel Main Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* SEARCH RESULTS VIEW */}
          {searchQuery ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{searchResults.length} search result{searchResults.length !== 1 ? 's' : ''}</span>
                <span className="text-[11px] text-brand-400 font-mono">Ranked by relevance</span>
              </div>

              {searchResults.length === 0 ? (
                <div className="text-center py-10 space-y-2 text-slate-500">
                  <HelpCircle className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-sm font-semibold text-slate-400">No procedures found</p>
                  <p className="text-xs">Try searching for generic terms like "priority", "import", "inventory", or "login".</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map(sop => (
                    <div
                      key={sop.id}
                      onClick={() => handleSelectSop(sop)}
                      className="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-lg p-3 transition-all cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-brand-300">
                          {sop.title}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {sop.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2">
                        {sop.shortDescription}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'CURRENT' ? (
            /* ACTIVE / CURRENT CONTEXT VIEW */
            <div className="space-y-4">
              {/* Context Recommendation Banner */}
              <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-brand-400" />
                    <span className="text-xs font-bold text-brand-200">
                      {contextualHelp.contextTitle}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-brand-200/80 leading-relaxed">
                  {contextualHelp.contextDescription}
                </p>

                {/* Switch Between Contextual Guides */}
                {contextualHelp.recommendedSops.length > 1 && (
                  <div className="pt-2 border-t border-brand-500/20 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-brand-300 uppercase">Related to this page:</span>
                    {contextualHelp.recommendedSops.map(rec => {
                      const isCur = rec.id === currentViewingSop?.id;
                      return (
                        <button
                          key={rec.id}
                          type="button"
                          onClick={() => handleSelectSop(rec)}
                          className={`text-[11px] font-medium px-2 py-0.5 rounded transition-colors cursor-pointer ${
                            isCur
                              ? 'bg-brand-500 text-white font-semibold'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                          }`}
                        >
                          {rec.title}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active SOP Details and Step Viewer */}
              {currentViewingSop ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-brand-400 uppercase tracking-wider">
                        {currentViewingSop.category.replace('_', ' ')}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleFavorite(currentViewingSop.id)}
                          title="Bookmark"
                          className="p-1 rounded text-slate-400 hover:text-amber-400 cursor-pointer"
                        >
                          <Bookmark
                            className={`w-4 h-4 ${
                              favorites.includes(currentViewingSop.id)
                                ? 'text-amber-400 fill-amber-400'
                                : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      {currentViewingSop.title}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {currentViewingSop.shortDescription}
                    </p>
                  </div>

                  {/* Interactive Step Viewer */}
                  <SopStepViewer
                    sop={currentViewingSop}
                    currentStepNumber={activeStepNumber}
                    onStepChange={setActiveStepNumber}
                    isCompact
                  />

                  {/* Troubleshooting Items */}
                  {currentViewingSop.troubleshooting && currentViewingSop.troubleshooting.length > 0 && (
                    <SopTroubleshootingSection
                      items={currentViewingSop.troubleshooting}
                      onOpenSop={sopId => {
                        const s = allSops.find(x => x.id === sopId);
                        if (s) handleSelectSop(s);
                      }}
                    />
                  )}

                  {/* Related SOPs */}
                  {currentViewingSop.relatedSopIds && currentViewingSop.relatedSopIds.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <span className="text-xs font-bold text-slate-300 block">
                        Related Standard Operating Procedures
                      </span>
                      <div className="space-y-1.5">
                        {currentViewingSop.relatedSopIds.map(relId => {
                          const relSop = allSops.find(s => s.id === relId);
                          if (!relSop) return null;
                          return (
                            <button
                              key={relId}
                              type="button"
                              onClick={() => handleSelectSop(relSop)}
                              className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-left text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                            >
                              <span>{relSop.title}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-10 text-slate-500">
                  <BookOpen className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                  <p className="text-xs">No active SOP selected.</p>
                </div>
              )}
            </div>
          ) : activeTab === 'ALL' ? (
            /* ALL SOPS / CATEGORY BROWSER */
            <div className="space-y-4">
              {/* Category Filter Pills */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Filter by Category:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('ALL')}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                      selectedCategory === 'ALL'
                        ? 'bg-brand-600 text-white border-brand-500'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                    }`}
                  >
                    All Categories ({allSops.length})
                  </button>
                  {SOP_CATEGORIES.map(cat => {
                    const count = allSops.filter(s => s.category === cat.id).length;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                          selectedCategory === cat.id
                            ? 'bg-brand-600 text-white border-brand-500'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        {cat.title} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SOP List */}
              <div className="space-y-2 pt-2">
                {allSops
                  .filter(s => selectedCategory === 'ALL' || s.category === selectedCategory)
                  .map(sop => {
                    const isCompleted = userProgress[sop.id]?.status === 'COMPLETED';
                    return (
                      <div
                        key={sop.id}
                        onClick={() => handleSelectSop(sop)}
                        className="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-lg p-3 transition-all cursor-pointer flex items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-200 hover:text-brand-300 truncate">
                              {sop.title}
                            </h4>
                            {isCompleted && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-1">
                            {sop.shortDescription}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : activeTab === 'FAVORITES' ? (
            /* SAVED / BOOKMARKED SOPS */
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Your Saved Bookmarks ({favoriteSops.length})
              </span>

              {favoriteSops.length === 0 ? (
                <div className="text-center py-10 space-y-2 text-slate-500">
                  <Bookmark className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-sm font-semibold text-slate-400">No saved procedures</p>
                  <p className="text-xs">Click the bookmark star on any SOP to pin it here for rapid access.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {favoriteSops.map(sop => (
                    <div
                      key={sop.id}
                      onClick={() => handleSelectSop(sop)}
                      className="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-lg p-3 transition-all cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-200 hover:text-brand-300 truncate">
                          {sop.title}
                        </h4>
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          {sop.shortDescription}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          toggleFavorite(sop.id);
                        }}
                        className="text-amber-400 hover:text-slate-400 p-1 cursor-pointer"
                      >
                        <Bookmark className="w-4 h-4 fill-amber-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* RECENTS VIEW */
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Recently Viewed ({recentSops.length})
              </span>

              {recentSops.length === 0 ? (
                <div className="text-center py-10 space-y-2 text-slate-500">
                  <Clock className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-sm font-semibold text-slate-400">No recent history</p>
                  <p className="text-xs">Procedures you inspect will appear here automatically.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentSops.map(sop => (
                    <div
                      key={sop.id}
                      onClick={() => handleSelectSop(sop)}
                      className="bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-lg p-3 transition-all cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-200 hover:text-brand-300 truncate">
                          {sop.title}
                        </h4>
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          {sop.shortDescription}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Quick Action */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0 text-xs">
          <button
            type="button"
            onClick={handleOpenFullPage}
            className="flex items-center gap-1.5 text-brand-400 hover:text-brand-300 font-semibold cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Full Learning Centre
          </button>
          <span className="text-slate-500 font-mono text-[11px]">OVMS v1.0.0</span>
        </div>
      </div>
    </div>
  );
};

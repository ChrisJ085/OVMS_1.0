import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Star, ArrowRight } from 'lucide-react';

interface SidebarItemTooltipProps {
  children: React.ReactNode;
  label: string;
  path: string;
  groupTitle?: string;
  isCollapsed: boolean;
  isFavorited?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
}

export const SidebarItemTooltip: React.FC<SidebarItemTooltipProps> = ({
  children,
  label,
  path,
  groupTitle,
  isCollapsed,
  isFavorited = false,
  onToggleFavorite
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (!isCollapsed) return;
    
    // Clear any existing close timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top + rect.height / 2,
        left: rect.right + 10
      });
      setIsOpen(true);
    }
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 100);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // If sidebar is expanded, just render children directly
  if (!isCollapsed) {
    return <>{children}</>;
  }

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative w-full"
    >
      {children}

      {isOpen && coords && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            transform: 'translateY(-50%)',
            zIndex: 99999
          }}
          onMouseEnter={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setIsOpen(true);
          }}
          onMouseLeave={() => setIsOpen(false)}
          className="bg-slate-900/98 border border-slate-750 text-slate-100 rounded-lg shadow-2xl px-3 py-2 pointer-events-auto select-none min-w-[160px] max-w-[280px] animate-in fade-in zoom-in-95 duration-100 backdrop-blur-sm"
        >
          {/* Subtle pointer arrow */}
          <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-900 border-l border-b border-slate-750 rotate-45" />

          <div className="relative z-10 space-y-1">
            {/* Header / Group & Favorite Button */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1">
              <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-400">
                {groupTitle || 'Navigation'}
              </span>

              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleFavorite(e);
                  }}
                  title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                  className="p-0.5 rounded text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                >
                  <Star className={`w-3 h-3 ${isFavorited ? 'fill-amber-400 text-amber-400' : ''}`} />
                </button>
              )}
            </div>

            {/* Page Label */}
            <div className="text-xs font-bold text-white leading-tight">
              {label}
            </div>

            {/* Leads to / Route Path info */}
            <div className="flex items-center gap-1 text-[11px] text-slate-400 pt-0.5">
              <ArrowRight className="w-3 h-3 text-brand-400 shrink-0" />
              <span className="font-mono text-[10px] text-slate-300 truncate">
                {path}
              </span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

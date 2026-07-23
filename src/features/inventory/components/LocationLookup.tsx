import React, { useState, useEffect, useRef } from 'react';
import { subscribeToLocations } from '../services/locationService';
import { Location } from '../../../types/inventory';
import { Search } from 'lucide-react';
import { useSiteContext } from '../../../contexts/SiteContext';

interface LocationLookupProps {
  value?: string; // locationId
  onChange: (locationId: string, locationCode: string) => void;
  disabled?: boolean;
}

export const LocationLookup: React.FC<LocationLookupProps> = ({ value, onChange, disabled }) => {
  const { tenantId, siteId } = useSiteContext();
  const [locations, setLocations] = useState<Location[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = subscribeToLocations(
      tenantId,
      siteId,
      (items) => {
        // Only active locations
        setLocations(items.filter(p => p.status === 'active'));
      },
      (err) => console.error('Failed to load locations for lookup', err)
    );
    return () => unsubscribe();
  }, [tenantId, siteId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLocation = locations.find(l => l.id === value);
  const displayValue = selectedLocation ? `${selectedLocation.locationCode} - ${selectedLocation.locationName}` : searchTerm;

  const filteredLocations = locations.filter(l => 
    l.locationCode.toLowerCase().includes(searchTerm.toLowerCase()) || 
    l.locationName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-slate-500" />
        </div>
        <input
          type="text"
          value={isOpen ? searchTerm : displayValue}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setSearchTerm('');
            setIsOpen(true);
          }}
          disabled={disabled}
          className="block w-full pl-10 pr-3 py-2 border border-slate-700 rounded-md leading-5 bg-slate-900 text-slate-200 placeholder-slate-500 focus:outline-none focus:bg-slate-800 focus:border-brand-500 sm:text-sm transition-colors disabled:opacity-50"
          placeholder="Search locations..."
        />
      </div>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-700 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          {filteredLocations.length === 0 ? (
            <div className="px-4 py-2 text-slate-400 italic">No matching location found</div>
          ) : (
            filteredLocations.map((loc) => (
              <div
                key={loc.id}
                className="cursor-pointer select-none relative px-4 py-2 hover:bg-slate-700 text-slate-200 flex flex-col"
                onClick={() => {
                  onChange(loc.id as string, loc.locationCode);
                  setIsOpen(false);
                }}
              >
                <span className="font-medium text-slate-100">{loc.locationCode}</span>
                <span className="text-xs text-slate-400 truncate">{loc.locationName}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useDevelopmentContext } from '../../../contexts/DevelopmentContext';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Search, Filter, Calendar, Download } from 'lucide-react';
import { Priority } from '../../../types/priority';
import { Recommendation } from '../../../types/recommendation';
import { OperationalException } from '../../../types/exception';
import { Announcement } from '../../../types/announcement';

// Normalised history item
interface HistoryEvent {
  id: string;
  sourceId: string;
  type: 'PRIORITY' | 'RECOMMENDATION' | 'EXCEPTION' | 'ANNOUNCEMENT';
  timestamp: Date;
  title: string;
  description: string;
  status: string;
  actor?: string;
  metadata?: any;
}

export const OperationalHistoryPage: React.FC = () => {
  const { tenantId, siteId } = useDevelopmentContext();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('ALL');
  
  // Simple date range (last 7 days by default)
  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() - 7);
  const [startDate, setStartDate] = useState(defaultStart.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!tenantId || !siteId) return;
    
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const startTimestamp = Timestamp.fromDate(new Date(startDate + 'T00:00:00'));
        const endTimestamp = Timestamp.fromDate(new Date(endDate + 'T23:59:59'));
        
        const history: HistoryEvent[] = [];

        // Fetch Priorities
        if (eventTypeFilter === 'ALL' || eventTypeFilter === 'PRIORITY') {
          const qPriorities = query(
            collection(db, 'priorities'),
            where('tenantId', '==', tenantId),
            where('siteId', '==', siteId),
            where('createdDate', '>=', startTimestamp),
            where('createdDate', '<=', endTimestamp)
          );
          const pSnap = await getDocs(qPriorities);
          pSnap.docs.forEach(doc => {
            const data = doc.data() as Priority;
            const ts = (data.createdDate as any)?.toDate?.() || new Date(data.createdDate as any);
            history.push({
              id: `p-${doc.id}`,
              sourceId: doc.id,
              type: 'PRIORITY',
              timestamp: ts,
              title: `Priority: ${data.priorityLevelId}`,
              description: data.latestProgressNote || `Created priority for ${data.productCodeSnapshot}`,
              status: data.priorityStatus,
              actor: 'System',
              metadata: data
            });
          });
        }

        // Fetch Recommendations
        if (eventTypeFilter === 'ALL' || eventTypeFilter === 'RECOMMENDATION') {
          const qRecs = query(
            collection(db, 'recommendations'),
            where('tenantId', '==', tenantId),
            where('siteId', '==', siteId),
            where('createdDate', '>=', startTimestamp),
            where('createdDate', '<=', endTimestamp)
          );
          const rSnap = await getDocs(qRecs);
          rSnap.docs.forEach(doc => {
            const data = doc.data() as Recommendation;
            const ts = (data.createdDate as any)?.toDate?.() || new Date(data.createdDate as any);
            history.push({
              id: `r-\${doc.id}`,
              sourceId: doc.id,
              type: 'RECOMMENDATION',
              timestamp: ts,
              title: `Recommendation: \${data.reasonCode}`,
              description: `Recommended \${data.recommendedAction.type} for \${data.productId}`,
              status: data.status,
              actor: 'System',
              metadata: data
            });
          });
        }

        // Fetch Exceptions
        if (eventTypeFilter === 'ALL' || eventTypeFilter === 'EXCEPTION') {
          const qExceptions = query(
            collection(db, 'exceptions'),
            where('tenantId', '==', tenantId),
            where('siteId', '==', siteId),
            where('createdDate', '>=', startTimestamp),
            where('createdDate', '<=', endTimestamp)
          );
          const eSnap = await getDocs(qExceptions);
          eSnap.docs.forEach(doc => {
            const data = doc.data() as OperationalException;
            const ts = (data.createdDate as any)?.toDate?.() || new Date(data.createdDate as any);
            history.push({
              id: `e-\${doc.id}`,
              sourceId: doc.id,
              type: 'EXCEPTION',
              timestamp: ts,
              title: `Exception: \${data.title}`,
              description: data.message,
              status: data.exceptionStatus,
              actor: 'System',
              metadata: data
            });
          });
        }

        // Fetch Announcements
        if (eventTypeFilter === 'ALL' || eventTypeFilter === 'ANNOUNCEMENT') {
          const qAnn = query(
            collection(db, 'announcements'),
            where('tenantId', '==', tenantId),
            where('siteId', '==', siteId),
            where('createdDate', '>=', startTimestamp),
            where('createdDate', '<=', endTimestamp)
          );
          const aSnap = await getDocs(qAnn);
          aSnap.docs.forEach(doc => {
            const data = doc.data() as Announcement;
            const ts = (data.createdDate as any)?.toDate?.() || new Date(data.createdDate as any);
            history.push({
              id: `a-\${doc.id}`,
              sourceId: doc.id,
              type: 'ANNOUNCEMENT',
              timestamp: ts,
              title: `Announcement: \${data.title}`,
              description: data.message,
              status: data.active ? 'ACTIVE' : 'INACTIVE',
              actor: 'System',
              metadata: data
            });
          });
        }

        // Sort by timestamp desc
        history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setEvents(history);
      } catch (err) {
        console.error('Error fetching history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [tenantId, siteId, startDate, endDate, eventTypeFilter]);

  const filteredEvents = useMemo(() => {
    if (!searchTerm) return events;
    const lower = searchTerm.toLowerCase();
    return events.filter(e => 
      e.title.toLowerCase().includes(lower) || 
      e.description.toLowerCase().includes(lower) ||
      e.sourceId.toLowerCase().includes(lower)
    );
  }, [events, searchTerm]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Operational History" 
        description="Unified searchable history of operational events."
      />
      
      <div className="bg-slate-900 border border-slate-700 p-4 rounded-lg flex flex-col md:flex-row gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input 
            type="date" 
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-slate-950 border-slate-700 rounded-md text-sm text-slate-200"
          />
          <span className="text-slate-500">to</span>
          <input 
            type="date" 
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="bg-slate-950 border-slate-700 rounded-md text-sm text-slate-200"
          />
        </div>
        
        <select 
          value={eventTypeFilter}
          onChange={e => setEventTypeFilter(e.target.value)}
          className="bg-slate-950 border-slate-700 rounded-md text-sm text-slate-200 min-w-[150px]"
        >
          <option value="ALL">All Event Types</option>
          <option value="PRIORITY">Priorities</option>
          <option value="RECOMMENDATION">Recommendations</option>
          <option value="EXCEPTION">Exceptions</option>
          <option value="ANNOUNCEMENT">Announcements</option>
        </select>
        
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="Search history..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border-slate-700 rounded-md pl-9 text-sm text-slate-200 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading history...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No events found in this period.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Type & Status</th>
                <th className="px-4 py-3 font-medium">Event Details</th>
                <th className="px-4 py-3 font-medium">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredEvents.map(event => (
                <tr key={event.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-300 font-mono text-xs">
                    {event.timestamp.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-slate-300">{event.type}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 w-max border border-slate-700">
                        {event.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-200 mb-0.5">{event.title}</div>
                    <div className="text-slate-400 text-xs">{event.description}</div>
                    <div className="text-[10px] text-slate-600 font-mono mt-1">ID: {event.sourceId}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {event.actor}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { Announcement, AnnouncementType, AnnouncementSeverity } from '../../../types/announcement';
import { PageHeader } from '../../../components/ui/PageHeader';
import { createAnnouncement, updateAnnouncement } from '../services/announcementService';
import { Megaphone, AlertTriangle, Clock, Activity, CheckCircle, Ban, Edit, Plus } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useSiteContext } from '../../../contexts/SiteContext';
import { useAuth } from '../../auth/context/AuthContext';
import { hasPermission } from '../../../config/rolePermissions';

const DEV_OPERATOR_KEY = 'ovms_dev_operator_name';

export const AnnouncementsPage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  const { userProfile } = useAuth();
  const canManage = hasPermission(userProfile?.role, 'MANAGE_ANNOUNCEMENTS');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [operatorName, setOperatorName] = useState(() => localStorage.getItem(DEV_OPERATOR_KEY) || 'Dev Operator');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [type, setType] = useState<AnnouncementType>('GENERAL');
  const [severity, setSeverity] = useState<AnnouncementSeverity>('INFO');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [displayOnTv, setDisplayOnTv] = useState(true);
  const [active, setActive] = useState(true);
  const [startAt, setStartAt] = useState<string>(''); // YYYY-MM-DDTHH:mm
  const [expireAt, setExpireAt] = useState<string>('');

  useEffect(() => {
    localStorage.setItem(DEV_OPERATOR_KEY, operatorName);
  }, [operatorName]);

  useEffect(() => {
    if (!tenantId || !siteId) return;

    const q = query(
      collection(db, 'announcements'),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
      fetched.sort((a, b) => {
        const tA = a.createdDate ? (typeof a.createdDate === 'string' ? new Date(a.createdDate).getTime() : ((a.createdDate as any).toMillis ? (a.createdDate as any).toMillis() : new Date(a.createdDate as any).getTime())) : 0;
        const tB = b.createdDate ? (typeof b.createdDate === 'string' ? new Date(b.createdDate).getTime() : ((b.createdDate as any).toMillis ? (b.createdDate as any).toMillis() : new Date(b.createdDate as any).getTime())) : 0;
        return tB - tA;
      });
      setAnnouncements(fetched);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId, siteId]);

  const handleOpenModal = (ann?: Announcement) => {
    if (ann) {
      setEditingId(ann.id);
      setType(ann.type);
      setSeverity(ann.severity);
      setTitle(ann.title);
      setMessage(ann.message);
      setDisplayOnTv(ann.displayOnTv);
      setActive(ann.active);
      
      const toLocalString = (ts: Timestamp | null | undefined) => {
        if (!ts) return '';
        const d = (ts as any).toDate?.() || new Date(ts as any);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
      };
      
      setStartAt(toLocalString(ann.startAt));
      setExpireAt(toLocalString(ann.expireAt));
    } else {
      setEditingId(null);
      setType('GENERAL');
      setSeverity('INFO');
      setTitle('');
      setMessage('');
      setDisplayOnTv(true);
      setActive(true);
      
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setStartAt(now.toISOString().slice(0, 16));
      setExpireAt('');
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !siteId) return;

    if (displayOnTv && message.length > 200) {
      alert('TV Announcements must be 200 characters or less');
      return;
    }

    try {
      const startAtDate = startAt ? Timestamp.fromDate(new Date(startAt)) : Timestamp.now();
      const expireAtDate = expireAt ? Timestamp.fromDate(new Date(expireAt)) : null;

      if (editingId) {
        await updateAnnouncement(editingId, {
          type, severity, title, message, displayOnTv, active, startAt: startAtDate, expireAt: expireAtDate
        }, operatorName);
      } else {
        await createAnnouncement({
          tenantId,
          siteId,
          type,
          severity,
          title,
          message,
          displayOnTv,
          active,
          startAt: startAtDate,
          expireAt: expireAtDate
        }, operatorName);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader 
          title="Announcements" 
          description="Manage operational messaging and TV dashboard ticker."
        />
        <div className="flex gap-4">
          <div className="flex items-center gap-2 text-sm bg-slate-900 p-2 rounded-lg border border-slate-700">
            <span className="text-slate-400">Dev User:</span>
            <input 
              type="text" 
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              className="bg-transparent border-none text-brand-300 focus:ring-0 w-32 px-1"
            />
          </div>
          {canManage && (
            <button 
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-slate-900 rounded-md font-medium hover:bg-brand-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Announcement
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : announcements.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No announcements found.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Severity & Type</th>
                <th className="px-4 py-3 font-medium">Title & Message</th>
                <th className="px-4 py-3 font-medium">TV</th>
                <th className="px-4 py-3 font-medium">Schedule</th>
                {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {announcements.map(ann => {
                const now = new Date();
                const start = ann.startAt ? ((ann.startAt as any)?.toDate?.() || new Date(ann.startAt as any)) : null;
                const end = ann.expireAt ? ((ann.expireAt as any)?.toDate?.() || new Date(ann.expireAt as any)) : null;
                
                let isCurrent = ann.active;
                if (start && start > now) isCurrent = false;
                if (end && end < now) isCurrent = false;

                return (
                  <tr key={ann.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-3 align-top pt-4">
                      {isCurrent ? (
                        <span className="flex items-center gap-1 text-green-400 text-xs font-medium">
                          <CheckCircle className="w-4 h-4" /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-500 text-xs font-medium">
                          <Ban className="w-4 h-4" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top pt-4">
                      <div className="flex flex-col gap-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded inline-block w-max ${
                          ann.severity === 'CRITICAL' ? 'bg-red-900/30 text-red-400 border border-red-900' :
                          ann.severity === 'WARNING' ? 'bg-amber-900/30 text-amber-400 border border-amber-900' :
                          'bg-blue-900/30 text-blue-400 border border-blue-900'
                        }`}>
                          {ann.severity}
                        </span>
                        <span className="text-slate-400 text-xs">{ann.type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200 mb-1">{ann.title}</div>
                      <div className="text-slate-400 line-clamp-2">{ann.message}</div>
                    </td>
                    <td className="px-4 py-3 align-top pt-4">
                      {ann.displayOnTv ? (
                        <span className="px-2 py-0.5 rounded bg-brand-900/30 text-brand-400 text-xs font-medium border border-brand-900/50">
                          TV Ticker
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">Hidden</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top pt-4 text-xs font-mono text-slate-400">
                      <div><span className="text-slate-500">S:</span> {start ? start.toLocaleDateString() : 'Now'}</div>
                      <div><span className="text-slate-500">E:</span> {end ? end.toLocaleDateString() : 'Never'}</div>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 align-top pt-4 text-right">
                        <button 
                          onClick={() => handleOpenModal(ann)}
                          className="p-1.5 text-slate-400 hover:text-brand-400 hover:bg-slate-800 rounded transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                {editingId ? 'Edit Announcement' : 'Create Announcement'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Type</label>
                  <select 
                    value={type}
                    onChange={e => setType(e.target.value as any)}
                    className="w-full bg-slate-950 border-slate-700 rounded-md text-slate-200 focus:ring-brand-500 focus:border-brand-500"
                  >
                    <option value="GENERAL">General</option>
                    <option value="SAFETY">Safety</option>
                    <option value="ENGINEERING">Engineering</option>
                    <option value="PRODUCTION">Production</option>
                    <option value="HR">HR</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Severity</label>
                  <select 
                    value={severity}
                    onChange={e => setSeverity(e.target.value as any)}
                    className="w-full bg-slate-950 border-slate-700 rounded-md text-slate-200 focus:ring-brand-500 focus:border-brand-500"
                  >
                    <option value="INFO">Info</option>
                    <option value="WARNING">Warning</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Title</label>
                <input 
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border-slate-700 rounded-md text-slate-200 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="Short title..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Message 
                  {displayOnTv && <span className={`ml-2 text-xs ${message.length > 200 ? 'text-red-400' : 'text-slate-500'}`}>({message.length}/200 chars for TV)</span>}
                </label>
                <textarea 
                  required
                  rows={3}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  className="w-full bg-slate-950 border-slate-700 rounded-md text-slate-200 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="Message content..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Start Time (Optional)</label>
                  <input 
                    type="datetime-local"
                    value={startAt}
                    onChange={e => setStartAt(e.target.value)}
                    className="w-full bg-slate-950 border-slate-700 rounded-md text-slate-200 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Expire Time (Optional)</label>
                  <input 
                    type="datetime-local"
                    value={expireAt}
                    onChange={e => setExpireAt(e.target.value)}
                    className="w-full bg-slate-950 border-slate-700 rounded-md text-slate-200 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="flex gap-6 pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={displayOnTv}
                    onChange={e => setDisplayOnTv(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-brand-500 focus:ring-brand-500 focus:ring-offset-slate-900"
                  />
                  <span className="text-sm text-slate-300">Display on TV Ticker</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={active}
                    onChange={e => setActive(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-brand-500 focus:ring-brand-500 focus:ring-offset-slate-900"
                  />
                  <span className="text-sm text-slate-300">Is Active</span>
                </label>
              </div>

              <div className="flex justify-end pt-4 gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-700 rounded-md text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-brand-500 rounded-md text-sm font-medium text-slate-900 hover:bg-brand-400 transition-colors disabled:opacity-50"
                >
                  Save Announcement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { useDevelopmentContext } from '../../../contexts/DevelopmentContext';
import { AuditEvent } from '../../../types/audit';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { DataTable } from '../../../components/ui/DataTable';

export const AuditLogPage: React.FC = () => {
  const { tenantId, siteId } = useDevelopmentContext();
  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      if (!tenantId || !siteId) return;
      setLoading(true);
      try {
        const q = query(
          collection(db, 'auditLogs'),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          orderBy('timestamp', 'desc'),
          limit(100)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditEvent));
        setLogs(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [tenantId, siteId]);

  const columns: any[] = [
    {
      header: 'Timestamp',
      accessor: (row: AuditEvent) => {
        if (!row.timestamp) return '-';
        const date = row.timestamp.toDate ? row.timestamp.toDate() : new Date(row.timestamp);
        return date.toLocaleString();
      }
    },
    { header: 'Event Type', accessor: 'eventType' },
    { header: 'Entity', accessor: (row: AuditEvent) => `${row.entityType}: ${row.entityId}` },
    { header: 'Summary', accessor: 'summary' },
    { header: 'Performed By', accessor: 'performedBy' }
  ];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Audit Log" 
        description="View a read-only history of material configuration and operational changes."
      />
      
      <SectionCard title="Recent Audit Events">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading audit logs...</div>
        ) : error ? (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md">
            {error}
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={logs}
            keyExtractor={(row: any) => row.id!}
            emptyMessage="No audit logs found for this site."
          />
        )}
      </SectionCard>
    </div>
  );
};

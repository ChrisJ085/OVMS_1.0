import { ProductionLinePlanNote } from '../../../types/production';
import { toAppError } from '../../../types/error';
import { logAuditEvent } from '../../../services/auditService';
import { toEpochMillis } from '../../../utils/timeFormatters';
import { supabase } from '../../../config/supabase';
import { toCamelCase, toSnakeCase } from '../../../utils/caseTransformers';

export const productionNotesRepository = {
  /**
   * Fetches notes active within a specific date range (for grid view).
   */
  async fetchGridNotes(tenantId: string, siteId: string, startTimestamp: string, endTimestamp: string): Promise<ProductionLinePlanNote[]> {
    try {
      const { data, error } = await supabase
        .from('production_events')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('site_id', siteId)
        .eq('active', true);

      if (error) throw error;
      const allNotes = (data || []).map(row => toCamelCase<ProductionLinePlanNote>(row));

      return allNotes.filter(note => {
        if (note.noteType === 'LINE_NOTE') {
          if (!note.endAt) return true;
          const endMs = toEpochMillis(note.endAt);
          return endMs ? endMs >= Date.now() : true;
        }
        if (!note.noteDate) return false;
        const nMillis = toEpochMillis(note.noteDate) || 0;
        const startMs = toEpochMillis(startTimestamp) || 0;
        const endMs = toEpochMillis(endTimestamp) || 0;
        return nMillis >= startMs && nMillis < endMs;
      });
    } catch (err) {
      throw toAppError(err, 'FETCH_GRID_NOTES_FAILED');
    }
  },

  /**
   * Fetches latest planner notes list.
   */
  async fetchNotesList(tenantId: string, siteId: string, limitCount = 50): Promise<ProductionLinePlanNote[]> {
    try {
      const { data, error } = await supabase
        .from('production_events')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('site_id', siteId);

      if (error) throw error;
      const notes = (data || []).map(row => toCamelCase<ProductionLinePlanNote>(row));
      
      notes.sort((a, b) => {
        const timeA = toEpochMillis(a.noteDate) || 0;
        const timeB = toEpochMillis(b.noteDate) || 0;
        return timeB - timeA;
      });

      return notes.slice(0, limitCount);
    } catch (err) {
      throw toAppError(err, 'FETCH_NOTES_LIST_FAILED');
    }
  },

  /**
   * Creates a new production line plan note.
   */
  async addNote(noteData: Omit<ProductionLinePlanNote, 'id'>): Promise<string> {
    try {
      if (!noteData.createdBy) {
        throw new Error('Audit field error: createdBy is required but not provided.');
      }
      const snakeData = toSnakeCase({
        ...noteData,
        createdBy: noteData.createdBy,
        createdDate: new Date().toISOString(),
        modifiedBy: noteData.modifiedBy || noteData.createdBy,
        modifiedDate: new Date().toISOString(),
      });

      const { data, error } = await supabase
        .from('production_events')
        .insert(snakeData)
        .select('id')
        .single();

      if (error) throw error;

      await logAuditEvent({
        tenantId: noteData.tenantId,
        siteId: noteData.siteId,
        eventType: noteData.noteType === 'LINE_NOTE' ? 'PRODUCTION_LINE_NOTE_CREATE' : 'PLANNING_EVENT_CREATE',
        entityType: 'ProductionLinePlanNote',
        entityId: data.id,
        summary: `Created ${noteData.noteType === 'LINE_NOTE' ? 'Production Line Note' : 'Planning Event'} for line ${noteData.productionLineId || 'all'}: "${noteData.title}"`,
        newValue: noteData,
        performedBy: noteData.createdBy || 'System'
      });

      return data.id;
    } catch (err) {
      throw toAppError(err, 'ADD_NOTE_FAILED');
    }
  },

  /**
   * Archives (deactivates) a production line note.
   */
  async deactivateNote(noteId: string, performedBy?: string): Promise<void> {
    try {
      const { data: noteSnap, error: getErr } = await supabase
        .from('production_events')
        .select('*')
        .eq('id', noteId)
        .maybeSingle();

      if (getErr) throw getErr;

      let tenantId = 'default-tenant';
      let siteId = 'default-site';
      let title = 'Unknown Note';
      let noteType = 'LINE_NOTE';
      
      if (noteSnap) {
        const camelNote = toCamelCase<any>(noteSnap);
        tenantId = camelNote.tenantId || tenantId;
        siteId = camelNote.siteId || siteId;
        title = camelNote.title || title;
        noteType = camelNote.noteType || noteType;
      }

      const { error: updErr } = await supabase
        .from('production_events')
        .update({ active: false, modified_date: new Date().toISOString() })
        .eq('id', noteId);

      if (updErr) throw updErr;

      await logAuditEvent({
        tenantId,
        siteId,
        eventType: noteType === 'LINE_NOTE' ? 'PRODUCTION_LINE_NOTE_DELETE' : 'PLANNING_EVENT_DELETE',
        entityType: 'ProductionLinePlanNote',
        entityId: noteId,
        summary: `Deleted ${noteType === 'LINE_NOTE' ? 'Production Line Note' : 'Planning Event'}: "${title}"`,
        newValue: { active: false },
        performedBy: performedBy || 'System'
      });
    } catch (err) {
      throw toAppError(err, 'DEACTIVATE_NOTE_FAILED');
    }
  },

  /**
   * Updates an existing production line note.
   */
  async updateNote(noteId: string, updates: Partial<Omit<ProductionLinePlanNote, 'id'>>, performedBy?: string): Promise<void> {
    try {
      const { data: noteSnap, error: getErr } = await supabase
        .from('production_events')
        .select('*')
        .eq('id', noteId)
        .maybeSingle();

      if (getErr) throw getErr;

      let tenantId = 'default-tenant';
      let siteId = 'default-site';
      let title = 'Unknown Note';
      let noteType = 'LINE_NOTE';
      
      if (noteSnap) {
        const camelNote = toCamelCase<any>(noteSnap);
        tenantId = camelNote.tenantId || tenantId;
        siteId = camelNote.siteId || siteId;
        title = camelNote.title || title;
        noteType = camelNote.noteType || noteType;
      }

      const snakeUpdates = toSnakeCase({
        ...updates,
        modifiedDate: new Date().toISOString()
      });

      const { error: updErr } = await supabase
        .from('production_events')
        .update(snakeUpdates)
        .eq('id', noteId);

      if (updErr) throw updErr;

      await logAuditEvent({
        tenantId,
        siteId,
        eventType: noteType === 'LINE_NOTE' ? 'PRODUCTION_LINE_NOTE_UPDATE' : 'PLANNING_EVENT_UPDATE',
        entityType: 'ProductionLinePlanNote',
        entityId: noteId,
        summary: `Updated ${noteType === 'LINE_NOTE' ? 'Production Line Note' : 'Planning Event'}: "${title}"`,
        newValue: updates,
        performedBy: performedBy || 'System'
      });
    } catch (err) {
      throw toAppError(err, 'UPDATE_NOTE_FAILED');
    }
  }
};

import { collection, query, where, getDocs, getDoc, addDoc, doc, updateDoc, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { ProductionLinePlanNote } from '../../../types/production';
import { toAppError } from '../../../types/error';
import { logAuditEvent } from '../../../services/auditService';

export const productionNotesRepository = {
  /**
   * Fetches notes active within a specific date range (for grid view).
   */
  async fetchGridNotes(tenantId: string, siteId: string, startTimestamp: Timestamp, endTimestamp: Timestamp): Promise<ProductionLinePlanNote[]> {
    if (!db) return [];
    try {
      const notesRef = collection(db, 'productionLinePlanNotes');
      const qNotes = query(
        notesRef,
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('active', '==', true)
      );
      const snapNotes = await getDocs(qNotes);
      const allNotes = snapNotes.docs.map(d => ({ id: d.id, ...d.data() } as any as ProductionLinePlanNote));
      return allNotes.filter(note => {
        if (note.noteType === 'LINE_NOTE') {
          // Keep line notes if they are not expired
          if (!note.endAt) return true; // no expiry
          return note.endAt.toMillis() >= Date.now();
        }
        if (!note.noteDate) return false;
        const nMillis = note.noteDate.toMillis();
        return nMillis >= startTimestamp.toMillis() && nMillis < endTimestamp.toMillis();
      });
    } catch (err) {
      throw toAppError(err, 'FETCH_GRID_NOTES_FAILED');
    }
  },

  /**
   * Fetches latest planner notes list.
   */
  async fetchNotesList(tenantId: string, siteId: string, limitCount = 50): Promise<ProductionLinePlanNote[]> {
    if (!db) return [];
    try {
      const notesRef = collection(db, 'productionLinePlanNotes');
      const q = query(
        notesRef,
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      );
      const snap = await getDocs(q);
      const notes = snap.docs.map(d => ({ id: d.id, ...d.data() } as any as ProductionLinePlanNote));
      
      // Sort client-side by noteDate desc to avoid composite index requirement in Firestore
      notes.sort((a, b) => {
        const timeA = a.noteDate ? (typeof a.noteDate.toMillis === 'function' ? a.noteDate.toMillis() : new Date(a.noteDate as any).getTime()) : 0;
        const timeB = b.noteDate ? (typeof b.noteDate.toMillis === 'function' ? b.noteDate.toMillis() : new Date(b.noteDate as any).getTime()) : 0;
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
    if (!db) throw new Error('Firestore instance not available');
    try {
      const notesRef = collection(db, 'productionLinePlanNotes');
      const docRef = await addDoc(notesRef, noteData);

      // Log Audit Event
      await logAuditEvent({
        tenantId: noteData.tenantId,
        siteId: noteData.siteId,
        eventType: noteData.noteType === 'LINE_NOTE' ? 'PRODUCTION_LINE_NOTE_CREATE' : 'PLANNING_EVENT_CREATE',
        entityType: 'ProductionLinePlanNote',
        entityId: docRef.id,
        summary: `Created ${noteData.noteType === 'LINE_NOTE' ? 'Production Line Note' : 'Planning Event'} for line ${noteData.productionLineId || 'all'}: "${noteData.title}"`,
        newValue: noteData,
        performedBy: noteData.createdBy || 'System'
      });

      return docRef.id;
    } catch (err) {
      throw toAppError(err, 'ADD_NOTE_FAILED');
    }
  },

  /**
   * Archives (deactivates) a production line note.
   */
  async deactivateNote(noteId: string, performedBy?: string): Promise<void> {
    if (!db) throw new Error('Firestore instance not available');
    try {
      const noteRef = doc(db, 'productionLinePlanNotes', noteId);
      const noteSnap = await getDoc(noteRef);
      let tenantId = 'default-tenant';
      let siteId = 'default-site';
      let title = 'Unknown Note';
      let noteType = 'LINE_NOTE';
      if (noteSnap.exists()) {
        const data = noteSnap.data();
        tenantId = data.tenantId || tenantId;
        siteId = data.siteId || siteId;
        title = data.title || title;
        noteType = data.noteType || noteType;
      }

      await updateDoc(noteRef, { active: false, modifiedDate: Timestamp.fromDate(new Date()) });

      // Log Audit Event
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
    if (!db) throw new Error('Firestore instance not available');
    try {
      const noteRef = doc(db, 'productionLinePlanNotes', noteId);
      const noteSnap = await getDoc(noteRef);
      let tenantId = 'default-tenant';
      let siteId = 'default-site';
      let title = 'Unknown Note';
      let noteType = 'LINE_NOTE';
      if (noteSnap.exists()) {
        const data = noteSnap.data();
        tenantId = data.tenantId || tenantId;
        siteId = data.siteId || siteId;
        title = data.title || title;
        noteType = data.noteType || noteType;
      }

      await updateDoc(noteRef, {
        ...updates,
        modifiedDate: Timestamp.now()
      });

      // Log Audit Event
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

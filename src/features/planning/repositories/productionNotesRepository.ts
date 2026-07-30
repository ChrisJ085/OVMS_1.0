import { collection, query, where, getDocs, addDoc, doc, updateDoc, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { ProductionLinePlanNote } from '../../../types/production';
import { toAppError } from '../../../types/error';

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
      return docRef.id;
    } catch (err) {
      throw toAppError(err, 'ADD_NOTE_FAILED');
    }
  },

  /**
   * Archives (deactivates) a production line note.
   */
  async deactivateNote(noteId: string): Promise<void> {
    if (!db) throw new Error('Firestore instance not available');
    try {
      const noteRef = doc(db, 'productionLinePlanNotes', noteId);
      await updateDoc(noteRef, { active: false, modifiedDate: Timestamp.fromDate(new Date()) });
    } catch (err) {
      throw toAppError(err, 'DEACTIVATE_NOTE_FAILED');
    }
  }
};

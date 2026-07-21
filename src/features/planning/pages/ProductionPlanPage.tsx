import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../../../config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  limit,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { useDevelopmentContext } from '../../../contexts/DevelopmentContext';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { LoadingState, ErrorState } from '../../../components/ui/States';
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  FileSpreadsheet, 
  ArrowRight, 
  RefreshCw, 
  Settings, 
  Calendar,
  Layers,
  StickyNote,
  Plus,
  Trash2,
  Info,
  ExternalLink,
  BookOpen
} from 'lucide-react';
import { 
  calculateFileHash, 
  createImportPreview, 
  commitProductionPlanImport,
  matchProductionLines,
  ParsedPlanPreview
} from '../services/mpps7ImportService';
import { 
  ProductionPlanImport, 
  ProductionPlanRow, 
  ProductionPlanEntry, 
  ProductionLinePlanNote,
  ProductionLinePlanNoteType,
  ProductionLinePlanNoteSeverity,
  ProductionPlanImportStatus,
  ProductionPlanRowStatus
} from '../../../types/production';
import { ProductionLine } from '../../../types/configuration';
import { Product } from '../../../types/product';

type TabId = 'current-plan' | 'import-sap' | 'import-history' | 'planner-notes';

export const ProductionPlanPage: React.FC = () => {
  const { tenantId, siteId, userProfile } = useDevelopmentContext();
  const [activeTab, setActiveTab] = useState<TabId>('current-plan');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // General Master Data State
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // ----------------------------------------------------
  // 1. Tab - Current Plan Grid State
  // ----------------------------------------------------
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    // Default to the start of current week (Monday)
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });
  const [activeEntries, setActiveEntries] = useState<ProductionPlanEntry[]>([]);
  const [gridNotes, setGridNotes] = useState<ProductionLinePlanNote[]>([]);

  // ----------------------------------------------------
  // 2. Tab - Import SAP Plan State
  // ----------------------------------------------------
  const [importStep, setImportStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [previewData, setPreviewData] = useState<ParsedPlanPreview | null>(null);
  const [reviewFilter, setReviewFilter] = useState<'ALL' | 'VALID' | 'WARNING' | 'ERROR'>('ALL');
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewLineFilter, setReviewLineFilter] = useState('ALL');
  
  // Confirmations
  const [confirmReviewed, setConfirmReviewed] = useState(false);
  const [confirmSupersede, setConfirmSupersede] = useState(false);
  const [importNotesText, setImportNotesText] = useState('');
  const [committedImportId, setCommittedImportId] = useState<string | null>(null);

  // Auto-Registration Configuration Assistant State
  const [masterDataRefreshTrigger, setMasterDataRefreshTrigger] = useState(0);
  const [selectedMissingProducts, setSelectedMissingProducts] = useState<Record<string, boolean>>({});
  const [selectedMissingLines, setSelectedMissingLines] = useState<Record<string, boolean>>({});
  const [productCasesPerPallet, setProductCasesPerPallet] = useState<Record<string, number>>({});
  const [customLineNames, setCustomLineNames] = useState<Record<string, string>>({});
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);

  // Extract unique missing products and lines from previewData
  const missingProducts = useMemo(() => {
    if (!previewData) return [];
    const map = new Map<string, string>();
    previewData.rows.forEach(r => {
      if (r.validationCodes.includes('PRODUCT_NOT_FOUND')) {
        map.set(r.productCode, r.sourceProductDescription);
      }
    });
    return Array.from(map.entries()).map(([code, desc]) => ({
      code,
      desc: desc || 'Imported SAP SKU'
    }));
  }, [previewData]);

  const missingLines = useMemo(() => {
    if (!previewData) return [];
    const set = new Set<string>();
    previewData.rows.forEach(r => {
      if (r.validationCodes.includes('PRODUCTION_LINE_NOT_CONFIGURED')) {
        set.add(r.productionLineCode);
      }
    });
    return Array.from(set).map(code => ({
      code,
      name: `Line ${code}`
    }));
  }, [previewData]);

  // Sync state defaults whenever previewData changes
  useEffect(() => {
    if (previewData) {
      const prodSelected: Record<string, boolean> = {};
      const prodPallets: Record<string, number> = {};
      previewData.rows.forEach(r => {
        if (r.validationCodes.includes('PRODUCT_NOT_FOUND')) {
          prodSelected[r.productCode] = true;
          prodPallets[r.productCode] = 100;
        }
      });
      setSelectedMissingProducts(prodSelected);
      setProductCasesPerPallet(prodPallets);

      const lineSelected: Record<string, boolean> = {};
      const lineNames: Record<string, string> = {};
      previewData.rows.forEach(r => {
        if (r.validationCodes.includes('PRODUCTION_LINE_NOT_CONFIGURED')) {
          lineSelected[r.productionLineCode] = true;
          lineNames[r.productionLineCode] = `Line ${r.productionLineCode}`;
        }
      });
      setSelectedMissingLines(lineSelected);
      setCustomLineNames(lineNames);
      
      setRegisterSuccess(false);
      setRegisterError(null);
    }
  }, [previewData]);

  const handleRegisterMissingMappings = async () => {
    if (!db) return;
    setIsRegistering(true);
    setRegisterError(null);
    try {
      // 1. Create missing products in Firestore
      const productsToCreate = missingProducts.filter(p => selectedMissingProducts[p.code]);
      for (const p of productsToCreate) {
        const casesPallet = productCasesPerPallet[p.code] || 100;
        await addDoc(collection(db, 'products'), {
          tenantId,
          productCode: p.code,
          description: p.desc,
          categoryId: 'default',
          unitOfMeasureId: 'CS',
          casesPerPallet: casesPallet,
          unitsPerCase: 12,
          defaultDestinationId: null,
          operationallyRelevant: true,
          notes: 'Automatically added from SAP MPPS7 Ingestion Mapping Assistant',
          status: 'active',
          createdBy: userProfile?.fullName || 'Production Planner',
          createdDate: Timestamp.now(),
          modifiedBy: userProfile?.fullName || 'Production Planner',
          modifiedDate: Timestamp.now()
        });
      }

      // 2. Create missing production lines in Firestore
      const linesToCreate = missingLines.filter(l => selectedMissingLines[l.code]);
      for (const l of linesToCreate) {
        const lineName = customLineNames[l.code] || `Line ${l.code}`;
        await addDoc(collection(db, 'productionLines'), {
          tenantId,
          siteId,
          lineCode: l.code,
          lineName: lineName,
          sapResourceCode: l.code,
          sapResourceAliases: [l.code],
          status: 'active',
          createdBy: userProfile?.fullName || 'Production Planner',
          createdDate: Timestamp.now(),
          modifiedBy: userProfile?.fullName || 'Production Planner',
          modifiedDate: Timestamp.now()
        });
      }

      setRegisterSuccess(true);
      setMasterDataRefreshTrigger(prev => prev + 1);

      // Re-run validation to update spreadsheet rows live
      setTimeout(() => {
        handleStartValidation();
      }, 500);

    } catch (err: any) {
      console.error('Failed to register mappings:', err);
      setRegisterError('Registration failed: ' + err.message);
    } finally {
      setIsRegistering(false);
    }
  };

  // Drag and Drop Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------
  // 3. Tab - Import History State
  // ----------------------------------------------------
  const [historyImports, setHistoryImports] = useState<ProductionPlanImport[]>([]);
  const [selectedHistoryImport, setSelectedHistoryImport] = useState<ProductionPlanImport | null>(null);
  const [historyRows, setHistoryRows] = useState<ProductionPlanRow[]>([]);
  const [loadingHistoryDetails, setLoadingHistoryDetails] = useState(false);

  // ----------------------------------------------------
  // 4. Tab - Planner Notes State
  // ----------------------------------------------------
  const [notesList, setNotesList] = useState<ProductionLinePlanNote[]>([]);
  const [noteForm, setNoteForm] = useState({
    productionLineId: '',
    noteDate: new Date().toISOString().split('T')[0],
    noteType: 'GENERAL' as ProductionLinePlanNoteType,
    title: '',
    note: '',
    severity: 'INFORMATION' as ProductionLinePlanNoteSeverity
  });
  const [submittingNote, setSubmittingNote] = useState(false);

  // ----------------------------------------------------
  // Global Loader for master data
  // ----------------------------------------------------
  useEffect(() => {
    const loadMasterData = async () => {
      if (!db) return;
      try {
        setLoading(true);
        // Load production lines
        const linesRef = collection(db, 'productionLines');
        const qLines = query(linesRef, where('tenantId', '==', tenantId), where('siteId', '==', siteId), where('status', '==', 'active'));
        const snapLines = await getDocs(qLines);
        const fetchedLines = snapLines.docs.map(d => ({ id: d.id, ...d.data() } as ProductionLine));
        setProductionLines(fetchedLines);

        // Load active products
        const productsRef = collection(db, 'products');
        const qProducts = query(productsRef, where('tenantId', '==', tenantId), where('status', '==', 'active'));
        const snapProducts = await getDocs(qProducts);
        const fetchedProducts = snapProducts.docs.map(d => ({ id: d.id, ...d.data() } as Product));
        setProducts(fetchedProducts);

        setLoading(false);
      } catch (err: any) {
        setError('Failed to sync master data catalog: ' + err.message);
        setLoading(false);
      }
    };
    loadMasterData();
  }, [tenantId, siteId, masterDataRefreshTrigger]);

  // Load Current Plan Entries when week changes or tab changes
  useEffect(() => {
    if (activeTab !== 'current-plan' || !db) return;
    const fetchCurrentPlanEntries = async () => {
      try {
        const startTimestamp = Timestamp.fromDate(currentWeekStart);
        const endWeek = new Date(currentWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const endTimestamp = Timestamp.fromDate(endWeek);

        const entriesRef = collection(db, 'productionPlanEntries');
        const q = query(
          entriesRef,
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId)
        );
        const snap = await getDocs(q);
        const allFetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as any as ProductionPlanEntry));
        const fetched = allFetched.filter(entry => {
          if (!entry.productionDate) return false;
          const pMillis = entry.productionDate.toMillis();
          return pMillis >= startTimestamp.toMillis() && pMillis < endTimestamp.toMillis();
        });
        setActiveEntries(fetched);

        // Fetch notes for the same range
        const notesRef = collection(db, 'productionLinePlanNotes');
        const qNotes = query(
          notesRef,
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          where('active', '==', true)
        );
        const snapNotes = await getDocs(qNotes);
        const allNotes = snapNotes.docs.map(d => ({ id: d.id, ...d.data() } as any as ProductionLinePlanNote));
        const fetchedNotes = allNotes.filter(note => {
          if (!note.noteDate) return false;
          const nMillis = note.noteDate.toMillis();
          return nMillis >= startTimestamp.toMillis() && nMillis < endTimestamp.toMillis();
        });
        setGridNotes(fetchedNotes);
      } catch (err: any) {
        console.error('Failed to load plan entries:', err);
      }
    };
    fetchCurrentPlanEntries();
  }, [activeTab, currentWeekStart, tenantId, siteId]);

  // Load Import History
  useEffect(() => {
    if (activeTab !== 'import-history' || !db) return;
    const fetchHistory = async () => {
      try {
        const importsRef = collection(db, 'productionPlanImports');
        const q = query(
          importsRef,
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          orderBy('uploadedAt', 'desc'),
          limit(30)
        );
        const snap = await getDocs(q);
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionPlanImport));
        setHistoryImports(fetched);
      } catch (err: any) {
        console.error('Failed to load history:', err);
      }
    };
    fetchHistory();
  }, [activeTab, tenantId, siteId]);

  // Load Notes List
  useEffect(() => {
    if (activeTab !== 'planner-notes' || !db) return;
    const fetchNotes = async () => {
      try {
        const notesRef = collection(db, 'productionLinePlanNotes');
        const q = query(
          notesRef,
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          orderBy('noteDate', 'desc'),
          limit(50)
        );
        const snap = await getDocs(q);
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as any as ProductionLinePlanNote));
        setNotesList(fetched);
      } catch (err: any) {
        console.error('Failed to load notes list:', err);
      }
    };
    fetchNotes();
  }, [activeTab, tenantId, siteId]);

  // Handle selected history import change (load rows subcollection)
  useEffect(() => {
    if (!selectedHistoryImport || !db) {
      setHistoryRows([]);
      return;
    }
    const fetchHistoryRows = async () => {
      try {
        setLoadingHistoryDetails(true);
        const rowsRef = collection(db, `productionPlanImports/${selectedHistoryImport.id}/rows`);
        const snap = await getDocs(rowsRef);
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as any as ProductionPlanRow));
        // Sort by row number
        fetched.sort((a, b) => a.sourceRowNumber - b.sourceRowNumber);
        setHistoryRows(fetched);
        setLoadingHistoryDetails(false);
      } catch (err: any) {
        console.error('Failed to load history rows:', err);
        setLoadingHistoryDetails(false);
      }
    };
    fetchHistoryRows();
  }, [selectedHistoryImport]);

  // Helper: Dates array for current plan
  const gridDates = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(currentWeekStart.getDate() + i);
    return d;
  });

  // ----------------------------------------------------
  // FILE SELECTION & UPLOAD HANDLERS
  // ----------------------------------------------------
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'xlsx' && ext !== 'xls') {
        alert('Supported format is strictly Microsoft Excel (.xlsx, .xls) workbook files.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'xlsx' && ext !== 'xls') {
        alert('Supported format is strictly Microsoft Excel (.xlsx, .xls) workbook files.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setImportStep(1);
    setConfirmReviewed(false);
    setConfirmSupersede(false);
    setImportNotesText('');
    setCommittedImportId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Run Step 2: Validate Excel File
  const handleStartValidation = async () => {
    if (!selectedFile) return;
    setFileLoading(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          if (!data || !(data instanceof ArrayBuffer)) {
            throw new Error('Could not read file data as buffer.');
          }
          
          // Generate file MD5 or SHA-256 hash approximation
          const fileHash = await calculateFileHash(selectedFile);

          // Parse workbook
          const workbook = XLSX.read(data, { type: 'array' });

          // Create Import Preview
          const preview = await createImportPreview(
            workbook,
            selectedFile.name,
            selectedFile.size,
            fileHash,
            tenantId,
            siteId,
            userProfile?.fullName || 'Production Planner'
          );

          setPreviewData(preview);
          setImportStep(2);
          setFileLoading(false);
        } catch (err: any) {
          setError(err.message || 'Verification of workbook structure failed. Please ensure the Excel contains a sheet starting with "MPPS7" with headers: Resource, Product Number, Product Short Description, Base Unit of Measure, Total.');
          setFileLoading(false);
        }
      };
      reader.readAsArrayBuffer(selectedFile);
    } catch (err: any) {
      setError('Import process crashed: ' + err.message);
      setFileLoading(false);
    }
  };

  // Run Step 4: Commit transaction
  const handleCommitImport = async () => {
    if (!previewData) return;
    setFileLoading(true);
    setError(null);
    try {
      const importId = await commitProductionPlanImport(previewData, importNotesText);
      setCommittedImportId(importId);
      setImportStep(4);
      setFileLoading(false);
    } catch (err: any) {
      setError('Database transaction failed while committing production plan: ' + err.message);
      setFileLoading(false);
    }
  };

  // Notes Form Handler
  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteForm.productionLineId || !noteForm.title || !noteForm.note) {
      alert('Please fill out all required fields.');
      return;
    }
    setSubmittingNote(true);
    try {
      if (!db) return;
      const targetDate = new Date(noteForm.noteDate);
      targetDate.setHours(0, 0, 0, 0);

      const noteRef = collection(db, 'productionLinePlanNotes');
      const newNote: Omit<ProductionLinePlanNote, 'id'> = {
        tenantId,
        siteId,
        productionLineId: noteForm.productionLineId,
        noteDate: Timestamp.fromDate(targetDate),
        noteType: noteForm.noteType,
        title: noteForm.title,
        note: noteForm.note,
        startAt: null,
        endAt: null,
        severity: noteForm.severity,
        source: 'PLANNER',
        active: true,
        createdBy: userProfile?.fullName || 'Planner',
        createdDate: Timestamp.fromDate(new Date()),
        modifiedBy: userProfile?.fullName || 'Planner',
        modifiedDate: Timestamp.fromDate(new Date())
      };

      await addDoc(noteRef, newNote);
      setNoteForm({
        productionLineId: '',
        noteDate: new Date().toISOString().split('T')[0],
        noteType: 'GENERAL',
        title: '',
        note: '',
        severity: 'INFORMATION'
      });
      // Trigger notes fetch
      setActiveTab('planner-notes');
      setSubmittingNote(false);
      alert('Planner note registered successfully.');
    } catch (err: any) {
      alert('Failed to register note: ' + err.message);
      setSubmittingNote(false);
    }
  };

  const handleDeactivateNote = async (noteId: string) => {
    if (!db) return;
    if (!window.confirm('Are you sure you want to archive this note?')) return;
    try {
      const noteRef = doc(db, 'productionLinePlanNotes', noteId);
      await updateDoc(noteRef, { active: false, modifiedDate: Timestamp.fromDate(new Date()) });
      // Refresh
      setNotesList(prev => prev.map(n => n.id === noteId ? { ...n, active: false } : n));
    } catch (err: any) {
      alert('Failed to archive note: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 min-h-[calc(100vh-4rem)] bg-slate-950 text-slate-100">
      <PageHeader 
        title="Operations Visual Management System" 
        subtitle="Visual Management Plan and SAP Production Ingestion" 
      />

      {/* Tabs Menu Navigation */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('current-plan')}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'current-plan'
              ? 'border-brand-500 text-brand-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
          }`}
        >
          Current Plan
        </button>
        <button
          onClick={() => setActiveTab('import-sap')}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'import-sap'
              ? 'border-brand-500 text-brand-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
          }`}
        >
          Import SAP Plan
        </button>
        <button
          onClick={() => setActiveTab('import-history')}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'import-history'
              ? 'border-brand-500 text-brand-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
          }`}
        >
          Import History
        </button>
        <button
          onClick={() => setActiveTab('planner-notes')}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'planner-notes'
              ? 'border-brand-500 text-brand-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
          }`}
        >
          Planner Notes
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center p-12">
          <RefreshCw className="w-8 h-8 text-brand-500 animate-spin mb-3" />
          <p className="text-sm text-slate-400">Synchronizing database catalog...</p>
        </div>
      )}

      {/* ----------------------------------------------------
          TAB 1: CURRENT PLAN GRID VIEW
          ---------------------------------------------------- */}
      {activeTab === 'current-plan' && !loading && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-lg">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-brand-500" />
              <div>
                <h3 className="font-semibold text-slate-200">
                  Planning Window: {currentWeekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} - {new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </h3>
                <p className="text-xs text-slate-400">Weekly scheduling matrix mapped by production lines</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const d = new Date(currentWeekStart);
                  d.setDate(d.getDate() - 7);
                  setCurrentWeekStart(d);
                }}
                className="p-2 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors"
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  const day = today.getDay();
                  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                  const monday = new Date(today.setDate(diff));
                  monday.setHours(0, 0, 0, 0);
                  setCurrentWeekStart(monday);
                }}
                className="px-3 py-1 text-xs font-medium bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors"
              >
                Today's Week
              </button>
              <button
                onClick={() => {
                  const d = new Date(currentWeekStart);
                  d.setDate(d.getDate() + 7);
                  setCurrentWeekStart(d);
                }}
                className="p-2 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors"
                title="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <SectionCard title="Active Production Planning Board" description="Review active production schedules loaded from committed SAP plans. Click to modify notes.">
            {productionLines.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                No active production lines configured. Go to site master database to seed.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/50">
                      <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-64">Production Line / SKU</th>
                      {gridDates.map((date, idx) => (
                        <th key={idx} className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center border-l border-slate-850">
                          <div>{date.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                          <div className="text-slate-500 font-normal">{date.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' })}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {productionLines.map(line => {
                      // Filter entries for this line
                      const lineEntries = activeEntries.filter(e => e.productionLineId.toUpperCase() === line.lineCode.toUpperCase());
                      
                      // Get unique products scheduled for this line
                      const scheduledSKUs = Array.from(new Set(lineEntries.map(e => e.productCodeSnapshot)));

                      if (scheduledSKUs.length === 0) {
                        return (
                          <React.Fragment key={line.id}>
                            <tr className="border-b border-slate-850/80 bg-slate-900/10">
                              <td className="p-4 font-medium text-slate-300">
                                <div className="text-sm font-semibold">{line.lineName}</div>
                                <div className="text-xs text-slate-500 font-mono">Resource: {line.sapResourceCode || line.lineCode}</div>
                              </td>
                              <td colSpan={7} className="p-4 text-center text-slate-500 italic text-xs">
                                No production scheduled for this line within this period.
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      }

                      // We will render rows for each SKU and a final total row
                      return (
                        <React.Fragment key={line.id}>
                          <tr className="border-b border-slate-850 bg-slate-900/30">
                            <td colSpan={8} className="p-3 bg-slate-900/50 text-xs font-semibold text-slate-300">
                              <span>{line.lineName}</span>
                              <span className="text-slate-500 font-mono ml-2">({line.sapResourceCode || line.lineCode})</span>
                            </td>
                          </tr>

                          {scheduledSKUs.map(sku => {
                            const sampleEntry = lineEntries.find(e => e.productCodeSnapshot === sku);
                            const desc = sampleEntry?.descriptionSnapshot || 'Unknown Product';

                            return (
                              <tr key={sku} className="border-b border-slate-850/50 hover:bg-slate-900/10 transition-colors">
                                <td className="p-3 pl-6">
                                  <div className="font-semibold text-slate-300 text-xs">{sku}</div>
                                  <div className="text-[11px] text-slate-400 truncate max-w-[220px]" title={desc}>
                                    {desc}
                                  </div>
                                </td>
                                {gridDates.map((date, idx) => {
                                  // Find entry for this date and SKU
                                  const entry = lineEntries.find(e => {
                                    const entryDate = e.productionDate.toDate();
                                    return entryDate.getUTCFullYear() === date.getUTCFullYear() &&
                                           entryDate.getUTCMonth() === date.getUTCMonth() &&
                                           entryDate.getUTCDate() === date.getUTCDate() &&
                                           e.productCodeSnapshot === sku;
                                  });

                                  return (
                                    <td key={idx} className="p-3 text-center border-l border-slate-900 bg-slate-900/5 min-w-[120px]">
                                      {entry ? (
                                        <div className="flex flex-col gap-1 items-center">
                                          <div className="text-xs font-semibold text-brand-400">
                                            {Number(entry.plannedCases).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">CS</span>
                                          </div>
                                          <div className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                            {entry.plannedPallets} <span className="text-[9px] text-slate-500">Pallets</span>
                                          </div>
                                          {entry.status !== 'PLANNED' && (
                                            <span className="text-[9px] px-1 bg-amber-500/10 text-amber-400 rounded">
                                              {entry.status}
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-slate-700 text-xs">-</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}

                          {/* Line Totals row */}
                          <tr className="border-b border-slate-800 bg-slate-900/20 font-medium">
                            <td className="p-3 pl-6 text-xs text-slate-400 uppercase tracking-wider font-semibold">
                              {line.lineName} Totals
                            </td>
                            {gridDates.map((date, idx) => {
                              // Sum cases and pallets for this line and date
                              const dayEntries = lineEntries.filter(e => {
                                const entryDate = e.productionDate.toDate();
                                return entryDate.getUTCFullYear() === date.getUTCFullYear() &&
                                       entryDate.getUTCMonth() === date.getUTCMonth() &&
                                       entryDate.getUTCDate() === date.getUTCDate();
                              });

                              const sumCases = dayEntries.reduce((acc, curr) => acc + curr.plannedCases, 0);
                              const sumPallets = Math.round(dayEntries.reduce((acc, curr) => acc + curr.plannedPallets, 0) * 100) / 100;

                              return (
                                <td key={idx} className="p-3 text-center border-l border-slate-850 text-xs">
                                  {sumCases > 0 ? (
                                    <div className="font-semibold text-slate-200">
                                      <div>{sumCases.toLocaleString()} cs</div>
                                      <div className="text-[10px] text-slate-400">{sumPallets} pal</div>
                                    </div>
                                  ) : (
                                    <span className="text-slate-700">-</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>

                          {/* Planner Notes for this line in current period */}
                          {gridNotes.filter(n => n.productionLineId.toUpperCase() === line.lineCode.toUpperCase()).length > 0 && (
                            <tr className="bg-slate-900/5">
                              <td colSpan={8} className="p-3 pl-6">
                                <div className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                                  <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                                  <span>Active Planner Notes</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                                  {gridNotes
                                    .filter(n => n.productionLineId.toUpperCase() === line.lineCode.toUpperCase())
                                    .map(note => (
                                      <div key={note.id} className="p-2 bg-slate-900 border border-slate-850 rounded flex flex-col gap-0.5">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-semibold text-slate-200">{note.title}</span>
                                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-medium ${
                                            note.severity === 'CRITICAL' ? 'bg-red-500/10 text-red-400' :
                                            note.severity === 'WARNING' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-400'
                                          }`}>
                                            {note.noteType}
                                          </span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 line-clamp-2">{note.note}</p>
                                        <span className="text-[9px] text-slate-500 mt-1 self-end">
                                          For {note.noteDate.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* ----------------------------------------------------
          TAB 2: IMPORT SAP PLAN WORKFLOW
          ---------------------------------------------------- */}
      {activeTab === 'import-sap' && (
        <div className="space-y-6">
          {/* Custom Wizard Step Header Indicator */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex justify-between items-center max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                importStep >= 1 ? 'bg-brand-500 text-slate-950' : 'bg-slate-800 text-slate-500'
              }`}>1</span>
              <span className={`text-sm ${importStep >= 1 ? 'text-slate-100 font-semibold' : 'text-slate-500'}`}>Select File</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-600" />
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                importStep >= 2 ? 'bg-brand-500 text-slate-950' : 'bg-slate-800 text-slate-500'
              }`}>2</span>
              <span className={`text-sm ${importStep >= 2 ? 'text-slate-100 font-semibold' : 'text-slate-500'}`}>Validate</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-600" />
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                importStep >= 3 ? 'bg-brand-500 text-slate-950' : 'bg-slate-800 text-slate-500'
              }`}>3</span>
              <span className={`text-sm ${importStep >= 3 ? 'text-slate-100 font-semibold' : 'text-slate-500'}`}>Review</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-600" />
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                importStep >= 4 ? 'bg-brand-500 text-slate-950' : 'bg-slate-800 text-slate-500'
              }`}>4</span>
              <span className={`text-sm ${importStep >= 4 ? 'text-slate-100 font-semibold' : 'text-slate-500'}`}>Commit</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-800/80 p-4 rounded-lg flex gap-3 items-start max-w-4xl mx-auto">
              <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-red-400">Ingestion Check Failed</h4>
                <p className="text-sm text-slate-300 mt-1">{error}</p>
                {importStep === 1 && (
                  <button
                    onClick={removeSelectedFile}
                    className="mt-3 px-3 py-1.5 text-xs bg-red-900/60 border border-red-700 hover:bg-red-800 text-slate-200 font-medium rounded transition-colors"
                  >
                    Clear and Retry
                  </button>
                )}
              </div>
            </div>
          )}

          {fileLoading && (
            <div className="flex flex-col items-center justify-center p-20 bg-slate-900 border border-slate-800 rounded-lg max-w-4xl mx-auto">
              <RefreshCw className="w-10 h-10 text-brand-500 animate-spin mb-4" />
              <h4 className="text-lg font-bold text-slate-200">Processing Workbook</h4>
              <p className="text-sm text-slate-400 mt-1">Parsing schema structure, verifying row sums, and resolving master data mappings...</p>
            </div>
          )}

          {/* STEP 1: SELECT FILE */}
          {importStep === 1 && !fileLoading && (
            <div className="max-w-4xl mx-auto">
              <SectionCard title="Upload SAP MPPS7 Planning Workbook" description="Only supported planning templates (.xlsx, .xls) containing the SAP factual source schema are accepted. Structural validations run instantly in-browser.">
                
                <div 
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 rounded-lg p-12 text-center hover:border-brand-500 hover:bg-slate-900/40 transition-all cursor-pointer group"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    className="hidden" 
                    accept=".xlsx,.xls"
                  />
                  <Upload className="w-12 h-12 text-slate-500 group-hover:text-brand-400 mx-auto mb-4 transition-colors" />
                  <p className="font-semibold text-slate-200 text-sm">Drag and drop your MPPS7 file here, or click to browse</p>
                  <p className="text-xs text-slate-500 mt-2">Microsoft Excel 97-2003 / Office XML Formats supported</p>
                </div>

                {selectedFile && (
                  <div className="mt-6 p-4 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="w-8 h-8 text-emerald-500" />
                      <div>
                        <h4 className="font-semibold text-slate-200 text-sm">{selectedFile.name}</h4>
                        <p className="text-xs text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={removeSelectedFile}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Remove
                      </button>
                      <button
                        onClick={handleStartValidation}
                        className="px-4 py-2 bg-brand-500 text-slate-950 font-semibold text-sm rounded-md hover:bg-brand-400 transition-colors shadow-lg"
                      >
                        Start Validation
                      </button>
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {/* STEP 2: VALIDATION STATS */}
          {importStep === 2 && previewData && !fileLoading && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg space-y-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-200">Structural Validation Summary</h3>
                    <p className="text-xs text-slate-400">Inspected worksheet: "{previewData.summary.detectedWorksheetNames[0]}"</p>
                  </div>
                  <button
                    onClick={removeSelectedFile}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >
                    Replace File
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-slate-950 p-4 rounded-md border border-slate-850">
                    <span className="text-xs text-slate-400 block">Detected Period</span>
                    <strong className="text-sm text-slate-200 mt-1 block">
                      {previewData.summary.periodStart.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} - {previewData.summary.periodEnd.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </strong>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-md border border-slate-850">
                    <span className="text-xs text-slate-400 block">Total Ingested Dates</span>
                    <strong className="text-lg text-slate-200 mt-1 block">
                      {/* Unique dates */}
                      {Array.from(new Set(previewData.rows.map(r => r.productionDate.toDate().toISOString()))).length} days
                    </strong>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-md border border-slate-850">
                    <span className="text-xs text-slate-400 block">Rows Filtered</span>
                    <strong className="text-lg text-slate-200 mt-1 block">
                      {previewData.summary.recognisedRows} <span className="text-xs text-slate-500 font-normal">/ {previewData.summary.totalSourceRows} raw</span>
                    </strong>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-md border border-slate-850">
                    <span className="text-xs text-slate-400 block">File Integrity Hash</span>
                    <code className="text-[10px] text-slate-500 block truncate mt-1.5 font-mono">
                      {previewData.summary.fileHash}
                    </code>
                  </div>
                </div>

                {/* Warning / Error Indicator panels */}
                <div className="flex flex-col gap-3">
                  {previewData.summary.errorCount > 0 ? (
                    <div className="p-4 bg-red-950/20 border border-red-900 rounded-lg flex gap-3">
                      <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-red-400 text-sm">Critical Row Errors Detected ({previewData.summary.errorCount})</h4>
                        <p className="text-xs text-slate-300 mt-1">One or more active production plan cells contain invalid formatting or structural issues. Ingestion is blocked until corrected.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-emerald-950/20 border border-emerald-900 rounded-lg flex gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-emerald-400 text-sm">Structural Integrity Verified</h4>
                        <p className="text-xs text-slate-300 mt-1">All row metrics, column headings, and cell values are validated and ready for review.</p>
                      </div>
                    </div>
                  )}

                  {previewData.summary.warningCount > 0 && (
                    <div className="p-4 bg-amber-950/20 border border-amber-900 rounded-lg flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-amber-400 text-sm">Row Warnings Detected ({previewData.summary.warningCount})</h4>
                        <p className="text-xs text-slate-300 mt-1">Unmapped SAP Resource codes, description differences, or unconfigured master products detected. These row warnings should be audited carefully.</p>
                      </div>
                    </div>
                  )}

                  {/* Duplicate / Older Plan Warnings */}
                  {previewData.summary.notes.includes('DUPLICATE_FILE') && (
                    <div className="p-4 bg-amber-950/20 border border-amber-900 rounded-lg flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-amber-400 text-sm">Duplicate File Alert</h4>
                        <p className="text-xs text-slate-300 mt-1">This Excel sheet contains the exact same file integrity hash as a previously committed plan. Loading it again may create duplicates.</p>
                      </div>
                    </div>
                  )}

                  {previewData.summary.notes.includes('OLDER_THAN_ACTIVE_PLAN') && (
                    <div className="p-4 bg-amber-950/20 border border-amber-900 rounded-lg flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-amber-400 text-sm">Older Planning Period Alert</h4>
                        <p className="text-xs text-slate-300 mt-1">This file's detected planning period is older than the current active plan on the board. Ingesting this may revert scheduling information.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    onClick={removeSelectedFile}
                    className="px-4 py-2 bg-slate-800 border border-slate-750 text-sm font-semibold rounded-md hover:bg-slate-750"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setImportStep(3)}
                    className="px-5 py-2 bg-brand-500 text-slate-950 font-bold text-sm rounded-md hover:bg-brand-400 flex items-center gap-1.5"
                  >
                    <span>Proceed to Row Review</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW DETAILS AND COMMIT */}
          {importStep === 3 && previewData && !fileLoading && (
            <div className="space-y-6">
              {/* Special Warnings banner linking to master catalogs */}
              {previewData.rows.some(r => r.validationCodes.includes('PRODUCT_NOT_FOUND')) && (
                <div className="bg-amber-950/20 border border-amber-900 p-4 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-6xl mx-auto">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-amber-400 text-sm">Unknown Product Code(s) Identified</h4>
                      <p className="text-xs text-slate-300 mt-1">
                        SAP SKU codes that are not resolved in the Product Master catalog cannot generate active plan entries. They will be skipped.
                      </p>
                    </div>
                  </div>
                  <a
                    href="/inventory/products"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-amber-400 font-semibold border border-slate-700 rounded flex items-center gap-1.5 self-start md:self-auto shrink-0"
                  >
                    <span>Open Product Master</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {previewData.rows.some(r => r.validationCodes.includes('PRODUCTION_LINE_NOT_CONFIGURED')) && (
                <div className="bg-amber-950/20 border border-amber-900 p-4 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-6xl mx-auto">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-amber-400 text-sm">Unconfigured Production Line Resource(s) Identified</h4>
                      <p className="text-xs text-slate-300 mt-1">
                        SAP Resource prefixes without a mapping will fall back to literal resource values. Configure SAP Resource codes and aliases to resolve.
                      </p>
                    </div>
                  </div>
                  <a
                    href="/admin/configuration"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-amber-400 font-semibold border border-slate-700 rounded flex items-center gap-1.5 self-start md:self-auto shrink-0"
                  >
                    <span>Open Line Mapping Config</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {/* Quick Mapping Configuration Assistant */}
              {(missingProducts.length > 0 || missingLines.length > 0) && (
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-6xl mx-auto space-y-4">
                  <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h4 className="font-bold text-brand-400 text-sm flex items-center gap-2">
                        <Settings className="w-4 h-4 text-brand-400 animate-pulse" />
                        GXO Catalog Mapping Assistant
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">
                        The workbook contains active schedules for products/lines not registered in GXO master catalogs. Register them here to validate them instantly.
                      </p>
                    </div>
                    {registerSuccess && (
                      <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/20">
                        Successfully Configured!
                      </span>
                    )}
                  </div>

                  {registerError && (
                    <div className="p-3 bg-red-950/40 border border-red-900 rounded text-xs text-red-400 font-semibold">
                      {registerError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Products Column */}
                    {missingProducts.length > 0 && (
                      <div className="space-y-3 bg-slate-950 p-4 rounded-md border border-slate-850">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-brand-400" />
                            Products to Register ({missingProducts.length})
                          </span>
                          <button
                            onClick={() => {
                              const allChecked = missingProducts.every(p => selectedMissingProducts[p.code]);
                              const newSel: Record<string, boolean> = {};
                              missingProducts.forEach(p => {
                                newSel[p.code] = !allChecked;
                              });
                              setSelectedMissingProducts(newSel);
                            }}
                            className="text-[10px] text-brand-500 hover:text-brand-400 font-medium"
                          >
                            {missingProducts.every(p => selectedMissingProducts[p.code]) ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>

                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {missingProducts.map(p => (
                            <div key={p.code} className="flex items-start gap-3 p-2 hover:bg-slate-900/40 rounded transition-colors border border-transparent hover:border-slate-800">
                              <input
                                type="checkbox"
                                checked={!!selectedMissingProducts[p.code]}
                                onChange={(e) => setSelectedMissingProducts(prev => ({ ...prev, [p.code]: e.target.checked }))}
                                className="mt-1 rounded text-brand-500 focus:ring-brand-500 bg-slate-900 border-slate-700 w-4 h-4"
                              />
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono font-bold text-xs text-slate-200">{p.code}</span>
                                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                    <span>Pallet size:</span>
                                    <input
                                      type="number"
                                      value={productCasesPerPallet[p.code] || 100}
                                      onChange={(e) => setProductCasesPerPallet(prev => ({ ...prev, [p.code]: Number(e.target.value) }))}
                                      className="w-12 bg-slate-900 border border-slate-800 rounded px-1 text-center font-semibold text-slate-200 focus:outline-none focus:border-brand-500 text-xs py-0.5"
                                      min={1}
                                    />
                                  </div>
                                </div>
                                <input
                                  type="text"
                                  value={p.desc}
                                  onChange={(e) => {
                                    p.desc = e.target.value;
                                  }}
                                  className="w-full bg-slate-900 border border-slate-850 text-xs text-slate-300 rounded px-2 py-1 focus:outline-none focus:border-brand-500"
                                  placeholder="Product Description"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Lines Column */}
                    {missingLines.length > 0 && (
                      <div className="space-y-3 bg-slate-950 p-4 rounded-md border border-slate-850">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                            <Settings className="w-4 h-4 text-brand-400" />
                            Lines to Register ({missingLines.length})
                          </span>
                          <button
                            onClick={() => {
                              const allChecked = missingLines.every(l => selectedMissingLines[l.code]);
                              const newSel: Record<string, boolean> = {};
                              missingLines.forEach(l => {
                                newSel[l.code] = !allChecked;
                              });
                              setSelectedMissingLines(newSel);
                            }}
                            className="text-[10px] text-brand-500 hover:text-brand-400 font-medium"
                          >
                            {missingLines.every(l => selectedMissingLines[l.code]) ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>

                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {missingLines.map(l => (
                            <div key={l.code} className="flex items-start gap-3 p-2 hover:bg-slate-900/40 rounded transition-colors border border-transparent hover:border-slate-800">
                              <input
                                type="checkbox"
                                checked={!!selectedMissingLines[l.code]}
                                onChange={(e) => setSelectedMissingLines(prev => ({ ...prev, [l.code]: e.target.checked }))}
                                className="mt-1 rounded text-brand-500 focus:ring-brand-500 bg-slate-900 border-slate-700 w-4 h-4"
                              />
                              <div className="flex-1 space-y-1">
                                <div className="font-mono font-bold text-xs text-slate-200">{l.code}</div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-500 whitespace-nowrap">Local Name:</span>
                                  <input
                                    type="text"
                                    value={customLineNames[l.code] || `Line ${l.code}`}
                                    onChange={(e) => setCustomLineNames(prev => ({ ...prev, [l.code]: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-850 text-xs text-slate-300 rounded px-2 py-1 focus:outline-none focus:border-brand-500"
                                    placeholder="Line Name"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-3 border-t border-slate-800 gap-2">
                    <span className="text-[10px] text-slate-400 italic">
                      Adding products will default category to "default" and unit to "CS" (Cases).
                    </span>
                    <button
                      onClick={handleRegisterMissingMappings}
                      disabled={isRegistering || (!missingProducts.some(p => selectedMissingProducts[p.code]) && !missingLines.some(l => selectedMissingLines[l.code]))}
                      className="px-4 py-1.5 bg-brand-500 hover:bg-brand-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs rounded transition-colors flex items-center gap-2 self-end"
                    >
                      {isRegistering ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Registering Mappings...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          <span>Register Selected Master Records & Re-validate</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Rows details with table filters */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-6xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
                  <div>
                    <h3 className="font-bold text-slate-200">Granular Row Validation Trace</h3>
                    <p className="text-xs text-slate-400">Filter and search the parsed rows before writing to active schedule collections.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="flex items-center bg-slate-950 border border-slate-800 rounded px-2 text-xs">
                      <Search className="w-3.5 h-3.5 text-slate-500 mr-1.5" />
                      <input
                        type="text"
                        placeholder="Search SKU..."
                        value={reviewSearch}
                        onChange={(e) => setReviewSearch(e.target.value)}
                        className="bg-transparent border-none text-slate-200 focus:outline-none py-1.5 w-32"
                      />
                    </div>
                    <select
                      value={reviewLineFilter}
                      onChange={(e) => setReviewLineFilter(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded px-2 py-1.5"
                    >
                      <option value="ALL">All Lines</option>
                      {Array.from(new Set(previewData.rows.map(r => r.productionLineCode))).map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                    <select
                      value={reviewFilter}
                      onChange={(e) => setReviewFilter(e.target.value as any)}
                      className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded px-2 py-1.5"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="VALID">Valid Rows Only</option>
                      <option value="WARNING">Warnings Only</option>
                      <option value="ERROR">Errors Only</option>
                    </select>
                  </div>
                </div>

                {/* Preview Table */}
                <div className="overflow-x-auto max-h-[40vh] overflow-y-auto border border-slate-850 rounded">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-850">
                        <th className="p-3 font-semibold text-slate-400">Sheet / Row</th>
                        <th className="p-3 font-semibold text-slate-400">Resource</th>
                        <th className="p-3 font-semibold text-slate-400">Product SKU</th>
                        <th className="p-3 font-semibold text-slate-400">Description</th>
                        <th className="p-3 font-semibold text-slate-400 text-center">Date</th>
                        <th className="p-3 font-semibold text-slate-400 text-right">Planned Qty</th>
                        <th className="p-3 font-semibold text-slate-400 text-right">Pallets</th>
                        <th className="p-3 font-semibold text-slate-400">Status / Diagnostic</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.rows
                        .filter(row => {
                          const matchesSearch = row.productCode.includes(reviewSearch) || 
                                                row.sourceProductDescription.toLowerCase().includes(reviewSearch.toLowerCase());
                          const matchesLine = reviewLineFilter === 'ALL' || row.productionLineCode === reviewLineFilter;
                          const matchesStatus = reviewFilter === 'ALL' || row.rowStatus === reviewFilter;
                          return matchesSearch && matchesLine && matchesStatus;
                        })
                        .map((row, idx) => (
                          <tr key={idx} className="border-b border-slate-850/50 hover:bg-slate-950/40">
                            <td className="p-3 text-slate-500 font-mono">
                              {row.sourceSheetName} <span className="text-slate-600">R{row.sourceRowNumber}</span>
                            </td>
                            <td className="p-3 font-mono text-slate-300">
                              {row.productionLineCode}
                            </td>
                            <td className="p-3 font-mono font-semibold text-slate-200">
                              {row.productCode}
                            </td>
                            <td className="p-3 truncate max-w-[180px]" title={row.sourceProductDescription}>
                              {row.sourceProductDescription}
                            </td>
                            <td className="p-3 text-center">
                              {row.productionDate.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                            </td>
                            <td className="p-3 text-right font-mono font-semibold">
                              {row.plannedQuantity.toLocaleString()} {row.sourceUnitOfMeasure}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-400">
                              {row.calculatedPallets}
                            </td>
                            <td className="p-3">
                              <div className="flex flex-col gap-1">
                                <span className={`inline-flex items-center w-fit px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  row.rowStatus === 'ERROR' ? 'bg-red-500/10 text-red-400' :
                                  row.rowStatus === 'WARNING' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                                }`}>
                                  {row.rowStatus}
                                </span>
                                {row.validationMessages.map((msg, mIdx) => (
                                  <span key={mIdx} className="text-[10px] text-slate-400 block max-w-[200px] break-words">
                                    • {msg}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Commit Checklist & notes */}
                <div className="mt-6 border-t border-slate-800 pt-6 space-y-4">
                  <h4 className="font-bold text-slate-200 text-sm">Planner Commit Checklist</h4>
                  <div className="space-y-3">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmReviewed}
                        onChange={(e) => setConfirmReviewed(e.target.checked)}
                        className="mt-1 bg-slate-950 border border-slate-800 rounded focus:ring-brand-500 text-brand-500"
                      />
                      <span className="text-xs text-slate-300">
                        I confirm I have audited the granular row diagnostics and accept any skipped unmapped catalog SKUs.
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmSupersede}
                        onChange={(e) => setConfirmSupersede(e.target.checked)}
                        className="mt-1 bg-slate-950 border border-slate-800 rounded focus:ring-brand-500 text-brand-500"
                      />
                      <span className="text-xs text-slate-300">
                        I understand that committing this plan will supersede and archive existing scheduling rows for the overlapping period ({previewData.summary.periodStart.toDate().toLocaleDateString()} to {previewData.summary.periodEnd.toDate().toLocaleDateString()}).
                      </span>
                    </label>
                  </div>

                  {/* Notes input */}
                  <div className="flex flex-col gap-1.5 mt-4">
                    <label className="text-xs font-semibold text-slate-300">Auditor Notes / Reason for upload (Optional)</label>
                    <textarea
                      placeholder="Enter optional comments on why this MPPS7 revision is being committed (e.g. Demand adjustment, weekly rollover)"
                      value={importNotesText}
                      onChange={(e) => setImportNotesText(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded p-3 focus:outline-none focus:border-slate-700 min-h-[60px]"
                    />
                  </div>

                  <div className="flex justify-between items-center pt-4">
                    <button
                      onClick={() => setImportStep(2)}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Back to Stats
                    </button>
                    <button
                      onClick={handleCommitImport}
                      disabled={previewData.summary.errorCount > 0 || !confirmReviewed || !confirmSupersede}
                      className="px-6 py-2 bg-brand-500 text-slate-950 font-bold text-sm rounded hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg"
                    >
                      Commit Production Plan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: SUCCESS */}
          {importStep === 4 && committedImportId && (
            <div className="max-w-xl mx-auto">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center space-y-6">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-100">Planning Ingestion Succeeded</h3>
                  <p className="text-sm text-slate-400 mt-1">SAP MPPS7 spreadsheet rows have been written to the master planning collection.</p>
                </div>
                <div className="bg-slate-950 p-4 border border-slate-850 rounded text-xs font-mono text-slate-400 space-y-2">
                  <div className="flex justify-between">
                    <span>Generated Import ID</span>
                    <strong className="text-slate-200 font-semibold">{committedImportId}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Active Schedule entries</span>
                    <strong className="text-slate-200 font-semibold">{previewData?.rows.length} rows written</strong>
                  </div>
                </div>

                <div className="flex gap-3 justify-center pt-4">
                  <button
                    onClick={() => {
                      setActiveTab('current-plan');
                      removeSelectedFile();
                    }}
                    className="px-4 py-2 bg-brand-500 text-slate-950 font-semibold text-sm rounded hover:bg-brand-400 transition-colors"
                  >
                    View Plan Grid
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('import-history');
                      removeSelectedFile();
                    }}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 text-sm font-semibold text-slate-200 rounded hover:bg-slate-750 transition-colors"
                  >
                    View Import History
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------
          TAB 3: IMPORT HISTORY AUDIT TRAIL
          ---------------------------------------------------- */}
      {activeTab === 'import-history' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SectionCard title="SAP Ingestion Influx Ledger" description="Audit log of historical SAP production plan file uploads and system version control tags.">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-850 bg-slate-900/50">
                      <th className="p-3 font-semibold text-slate-400">File Metadata</th>
                      <th className="p-3 font-semibold text-slate-400 text-center">Period Boundaries</th>
                      <th className="p-3 font-semibold text-slate-400 text-center">Rows Audit</th>
                      <th className="p-3 font-semibold text-slate-400">Status</th>
                      <th className="p-3 font-semibold text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyImports.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500 italic">No historical imports recorded in Firestore.</td>
                      </tr>
                    ) : (
                      historyImports.map(imp => (
                        <tr key={imp.id} className={`border-b border-slate-850/50 hover:bg-slate-900/20 transition-colors ${
                          selectedHistoryImport?.id === imp.id ? 'bg-slate-900/30 border-l-2 border-brand-500' : ''
                        }`}>
                          <td className="p-3">
                            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                              <span>{imp.fileName}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              ID: {imp.id} • Hash: {imp.fileHash.slice(0, 8)}...
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1">
                              Uploaded by: {imp.uploadedBy} on {imp.uploadedAt.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="font-medium text-slate-300">
                              {imp.periodStart.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} - {imp.periodEnd.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            <span className="text-[10px] text-slate-500 block mt-0.5">MPPS7 Source Period</span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="font-semibold text-slate-300">
                              {imp.recognisedRows} <span className="text-[10px] text-slate-500">/ {imp.totalSourceRows} rows</span>
                            </div>
                            {imp.warningCount > 0 && (
                              <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1 rounded">
                                {imp.warningCount} Warnings
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              imp.status === 'COMMITTED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              imp.status === 'SUPERSEDED' ? 'bg-slate-850 text-slate-400 border border-slate-700/50' :
                              'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}>
                              {imp.status}
                            </span>
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => setSelectedHistoryImport(imp)}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 font-semibold rounded transition-colors"
                            >
                              Trace Logs
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>

          {/* Import details trace panel */}
          <div className="space-y-6">
            {selectedHistoryImport ? (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-200 text-sm">Detailed Trace Auditing</h3>
                    <p className="text-[10px] text-slate-400">Reviewing details for: {selectedHistoryImport.id}</p>
                  </div>
                  <button
                    onClick={() => setSelectedHistoryImport(null)}
                    className="text-slate-500 hover:text-slate-300 text-xs"
                  >
                    Close
                  </button>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between border-b border-slate-850 pb-1.5">
                    <span className="text-slate-400">File Ingested</span>
                    <strong className="text-slate-200 text-right truncate max-w-[150px]" title={selectedHistoryImport.fileName}>
                      {selectedHistoryImport.fileName}
                    </strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-850 pb-1.5">
                    <span className="text-slate-400">Parser Logic version</span>
                    <strong className="text-slate-200 font-mono">{selectedHistoryImport.parserVersion}</strong>
                  </div>
                  {selectedHistoryImport.notes && (
                    <div className="p-2 bg-slate-950 border border-slate-850 rounded text-[11px] text-slate-400">
                      <span className="font-semibold block text-slate-300 mb-0.5">Auditor Notes:</span>
                      {selectedHistoryImport.notes}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-300 mb-2">Ingested Plan Cells</h4>
                  {loadingHistoryDetails ? (
                    <div className="flex justify-center p-6">
                      <RefreshCw className="w-5 h-5 text-brand-500 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                      {historyRows.length === 0 ? (
                        <span className="text-xs text-slate-500 italic block">No staging rows recorded for this import audit.</span>
                      ) : (
                        historyRows.map((row, idx) => (
                          <div key={idx} className="p-2 bg-slate-950 border border-slate-850 rounded flex justify-between items-center text-[11px]">
                            <div>
                              <div className="font-mono font-semibold text-slate-200">{row.productCode}</div>
                              <span className="text-slate-500">Resource: {row.productionLineCode}</span>
                            </div>
                            <div className="text-right">
                              <strong className="text-brand-400 block">{row.plannedQuantity.toLocaleString()} cs</strong>
                              <span className="text-slate-500 text-[10px]">On {row.productionDate.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-850 rounded-lg p-8 text-center text-slate-500 italic text-xs h-40 flex items-center justify-center">
                Select an import record on the left to trace historical planner row-by-row configurations.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          TAB 4: PLANNER NOTES MANAGEMENT
          ---------------------------------------------------- */}
      {activeTab === 'planner-notes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SectionCard title="Active Planner Overrides" description="Review operational notes and restrictions overlaid on top of production schedule intervals.">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-850 bg-slate-900/50">
                      <th className="p-3 font-semibold text-slate-400">Line & Date</th>
                      <th className="p-3 font-semibold text-slate-400">Type / Title</th>
                      <th className="p-3 font-semibold text-slate-400">Details</th>
                      <th className="p-3 font-semibold text-slate-400">Severity</th>
                      <th className="p-3 font-semibold text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notesList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500 italic">No planner notes registered in Firestore.</td>
                      </tr>
                    ) : (
                      notesList.map(note => (
                        <tr key={note.id} className={`border-b border-slate-850/50 hover:bg-slate-900/10 transition-colors ${
                          !note.active ? 'opacity-50 bg-slate-900/5' : ''
                        }`}>
                          <td className="p-3">
                            <strong className="text-slate-300 font-semibold block">{note.productionLineId}</strong>
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              {note.noteDate.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-850 text-slate-400">
                              {note.noteType}
                            </span>
                            <div className="font-semibold text-slate-200 mt-1">{note.title}</div>
                          </td>
                          <td className="p-3 max-w-[200px] text-slate-400 break-words" title={note.note}>
                            {note.note}
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              note.severity === 'CRITICAL' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                              note.severity === 'WARNING' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                              'bg-slate-850 text-slate-400 border border-slate-700/50'
                            }`}>
                              {note.severity}
                            </span>
                          </td>
                          <td className="p-3">
                            {note.active ? (
                              <button
                                onClick={() => handleDeactivateNote(note.id)}
                                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Archive</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">Archived</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>

          {/* New note creator */}
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
              <h3 className="font-bold text-slate-200 text-sm mb-4">Create Planning Note Overlay</h3>
              
              <form onSubmit={handleNoteSubmit} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300">Production Line *</label>
                  <select
                    value={noteForm.productionLineId}
                    onChange={(e) => setNoteForm(prev => ({ ...prev, productionLineId: e.target.value }))}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded p-2.5 focus:outline-none focus:border-slate-700"
                    required
                  >
                    <option value="">Select Production Line</option>
                    {productionLines.map(line => (
                      <option key={line.id} value={line.lineCode}>{line.lineName} ({line.lineCode})</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300">Target Production Date *</label>
                  <input
                    type="date"
                    value={noteForm.noteDate}
                    onChange={(e) => setNoteForm(prev => ({ ...prev, noteDate: e.target.value }))}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded p-2.5 focus:outline-none focus:border-slate-700"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">Note Type *</label>
                    <select
                      value={noteForm.noteType}
                      onChange={(e) => setNoteForm(prev => ({ ...prev, noteType: e.target.value as any }))}
                      className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded p-2.5 focus:outline-none focus:border-slate-700"
                      required
                    >
                      <option value="GENERAL">General</option>
                      <option value="MAINTENANCE">Maintenance</option>
                      <option value="CLEANING">Cleaning</option>
                      <option value="GRADE_CHANGE">Grade Change</option>
                      <option value="FORMAT_CHANGE">Format Change</option>
                      <option value="TRIAL">Trial Run</option>
                      <option value="DELAY">Expected Delay</option>
                      <option value="SHUTDOWN">Shutdown</option>
                      <option value="PRODUCT_RESTRICTION">SKU Restrict</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-300">Severity *</label>
                    <select
                      value={noteForm.severity}
                      onChange={(e) => setNoteForm(prev => ({ ...prev, severity: e.target.value as any }))}
                      className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded p-2.5 focus:outline-none focus:border-slate-700"
                      required
                    >
                      <option value="INFORMATION">Info</option>
                      <option value="WARNING">Warning</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300">Overlay Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. Line Cleaning Window, Core PM"
                    value={noteForm.title}
                    onChange={(e) => setNoteForm(prev => ({ ...prev, title: e.target.value }))}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded p-2.5 focus:outline-none focus:border-slate-700"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300">Note Description *</label>
                  <textarea
                    placeholder="Provide details on maintenance times, product limitations, or staffing adjustments..."
                    value={noteForm.note}
                    onChange={(e) => setNoteForm(prev => ({ ...prev, note: e.target.value }))}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded p-2.5 focus:outline-none focus:border-slate-700 min-h-[80px]"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingNote}
                  className="w-full py-2 bg-brand-500 text-slate-950 font-bold text-xs rounded hover:bg-brand-400 transition-colors"
                >
                  {submittingNote ? 'Saving Override...' : 'Overlay Planner Note'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

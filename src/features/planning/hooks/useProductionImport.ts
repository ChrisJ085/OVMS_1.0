import { useState, useCallback, useRef, ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { ParsedPlanPreview, calculateFileHash, createImportPreview } from '../services/mpps7ImportService';
import { productionImportRepository } from '../repositories/productionImportRepository';
import { ImportState, isAllowedImportTransition } from '../types/importStateMachine';
import { ProductionPlanRowStatus } from '../../../types/production';

export function useProductionImport(
  tenantId: string, 
  siteId: string, 
  userFullName: string, 
  onSuccessCommit?: () => void
) {
  const [importState, setImportState] = useState<ImportState>('SELECT_FILE');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<ParsedPlanPreview | null>(null);
  const [fileLoading, setFileLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Review filters
  const [reviewFilter, setReviewFilter] = useState<'ALL' | 'VALID' | 'WARNING' | 'ERROR'>('ALL');
  const [reviewSearch, setReviewSearch] = useState<string>('');
  const [reviewLineFilter, setReviewLineFilter] = useState<string>('ALL');

  // Checklist & Confirmation flags
  const [confirmReviewed, setConfirmReviewed] = useState<boolean>(false);
  const [confirmSupersede, setConfirmSupersede] = useState<boolean>(false);
  const [confirmedYear, setConfirmedYear] = useState<number | null>(null);
  const [duplicateCheckAcknowledged, setDuplicateCheckAcknowledged] = useState<boolean>(false);
  const [importNotesText, setImportNotesText] = useState<string>('');
  const [committedImportId, setCommittedImportId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Transition helper with state machine safety
  const transitionTo = useCallback((nextState: ImportState) => {
    setImportState(prev => {
      if (isAllowedImportTransition(prev, nextState)) {
        return nextState;
      } else {
        console.warn(`Invalid import state transition requested: ${prev} -> ${nextState}`);
        return prev;
      }
    });
  }, []);

  // Step mapping (1 = SELECT_FILE, 2 = VALIDATING, 3 = REVIEW, 4 = COMMITTED)
  const importStep = 
    importState === 'SELECT_FILE' ? 1 :
    importState === 'VALIDATING' ? 2 :
    importState === 'COMMITTED' ? 4 : 3;

  const handleSelectFile = (fileOrEvent: File | ChangeEvent<HTMLInputElement>) => {
    let file: File | null = null;
    if (fileOrEvent instanceof File) {
      file = fileOrEvent;
    } else if (fileOrEvent && (fileOrEvent as any).target && (fileOrEvent as any).target.files) {
      file = (fileOrEvent as any).target.files[0] || null;
    }
    if (!file) return;

    const ext = file.name ? file.name.split('.').pop()?.toLowerCase() : '';
    if (ext !== 'xlsx' && ext !== 'xls') {
      setError('Supported format is strictly Microsoft Excel (.xlsx, .xls) workbook files.');
      return;
    }
    setError(null);
    setSelectedFile(file);
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setConfirmReviewed(false);
    setConfirmSupersede(false);
    setConfirmedYear(null);
    setDuplicateCheckAcknowledged(false);
    setImportNotesText('');
    setCommittedImportId(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    transitionTo('SELECT_FILE');
  };

  const startValidation = async (overrideYear?: number | null) => {
    if (!selectedFile) return;
    setFileLoading(true);
    setError(null);
    transitionTo('VALIDATING');

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          if (!data || !(data instanceof ArrayBuffer)) {
            throw new Error('Could not read file data as buffer.');
          }

          const fileHash = await calculateFileHash(selectedFile);
          const workbook = XLSX.read(data, { type: 'array' });
          const yearToUse = overrideYear !== undefined ? overrideYear : confirmedYear;

          const preview = await createImportPreview(
            workbook,
            selectedFile.name,
            selectedFile.size,
            fileHash,
            tenantId,
            siteId,
            userFullName || 'Production Planner',
            yearToUse
          );

          setPreviewData(preview);
          setFileLoading(false);
          transitionTo('REVIEW');
        } catch (err: any) {
          setError(err.message || 'Verification of workbook structure failed. Please ensure the Excel contains a valid MPPS7 structure.');
          setFileLoading(false);
          transitionTo('FAILED');
        }
      };
      reader.readAsArrayBuffer(selectedFile);
    } catch (err: any) {
      setError('Import process crashed: ' + err.message);
      setFileLoading(false);
      transitionTo('FAILED');
    }
  };

  const handleCommitImport = async () => {
    if (!previewData) return;
    setFileLoading(true);
    setError(null);
    transitionTo('COMMITTING');

    try {
      const importId = await productionImportRepository.commitImport(previewData, importNotesText);
      setCommittedImportId(importId);
      setFileLoading(false);
      transitionTo('COMMITTED');
      if (onSuccessCommit) {
        onSuccessCommit();
      }
    } catch (err: any) {
      setError('Database transaction failed while committing production plan: ' + err.message);
      setFileLoading(false);
      transitionTo('FAILED');
    }
  };

  return {
    importState,
    importStep,
    selectedFile,
    previewData,
    fileLoading,
    error,
    reviewFilter,
    reviewSearch,
    reviewLineFilter,
    confirmReviewed,
    confirmSupersede,
    confirmedYear,
    duplicateCheckAcknowledged,
    importNotesText,
    committedImportId,
    fileInputRef,
    // Setters
    setReviewFilter,
    setReviewSearch,
    setReviewLineFilter,
    setConfirmReviewed,
    setConfirmSupersede,
    setConfirmedYear,
    setDuplicateCheckAcknowledged,
    setImportNotesText,
    // Actions
    handleSelectFile,
    removeSelectedFile,
    startValidation,
    handleCommitImport,
    resetImport: removeSelectedFile
  };
}

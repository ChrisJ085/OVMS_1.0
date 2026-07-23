import React from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { SectionCard } from '../../../../components/ui/SectionCard';

interface FileSelectionStepProps {
  selectedFile: File | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onRemoveFile: () => void;
  onStartValidation: () => void;
}

export const FileSelectionStep: React.FC<FileSelectionStepProps> = ({
  selectedFile,
  fileInputRef,
  onFileSelect,
  onDragOver,
  onDrop,
  onRemoveFile,
  onStartValidation
}) => {
  return (
    <div className="max-w-4xl mx-auto">
      <SectionCard 
        title="Upload SAP MPPS7 Planning Workbook" 
        description="Only supported planning templates (.xlsx, .xls) containing the SAP factual source schema are accepted. Structural validations run instantly in-browser."
      >
        <div 
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-700 rounded-lg p-12 text-center hover:border-brand-500 hover:bg-slate-900/40 transition-all cursor-pointer group"
        >
          <input 
            type="file" 
            ref={fileInputRef as any} 
            onChange={onFileSelect} 
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
                onClick={onRemoveFile}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Remove
              </button>
              <button
                onClick={onStartValidation}
                className="px-4 py-2 bg-brand-500 text-slate-950 font-semibold text-sm rounded-md hover:bg-brand-400 transition-colors shadow-lg"
              >
                Start Validation
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
};

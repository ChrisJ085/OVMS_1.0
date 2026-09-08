import React, { useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { Download, Upload, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import Papa from 'papaparse';
import { ValidationResult } from '../../../types/importExport';
import { validateImportData, commitImportData } from '../services/importExportService';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';
import { collection, db, getDocs, query, where } from '../../../services/firestoreBase';

type ImportType = 'PRODUCTS' | 'LOCATIONS' | 'INVENTORY' | 'PLANNING_RULES' | 'PRODUCTION_EVENTS' | 'PROMOTIONS';

export const DataUtilitiesPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { tenantId, siteId } = useSiteContext();
  const [activeTab, setActiveTab] = useState<'imports' | 'history' | 'exports'>('imports');

  const [selectedType, setSelectedType] = useState<ImportType>('PRODUCTS');
  const [inventoryType, setInventoryType] = useState<'INITIAL_BALANCE' | 'ABSOLUTE_BALANCE' | 'ADJUSTMENT'>('INITIAL_BALANCE');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [importSummary, setImportSummary] = useState<any>(null);
  
  const [exportType, setExportType] = useState<ImportType | 'PRIORITIES' | 'RECOMMENDATIONS' | 'AUDIT_LOGS'>('PRODUCTS');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!tenantId || !siteId) return;
    setIsExporting(true);
    
    try {
      // In a real app we'd fetch all docs for this exportType.
      // Here we will use some dummy fetching for demo or real if configured.
      
      const collMap: any = {
        'PRODUCTS': 'products',
        'LOCATIONS': 'locations',
        'INVENTORY': 'inventoryBalances',
        'PLANNING_RULES': 'planningRules',
        'PRODUCTION_EVENTS': 'productionEvents',
        'PROMOTIONS': 'promotions',
        'PRIORITIES': 'priorities',
        'RECOMMENDATIONS': 'recommendations',
        'AUDIT_LOGS': 'auditLogs'
      };

      const collName = collMap[exportType];
      if (!collName) throw new Error("Unknown export type");

      const q = query(collection(db, collName), where('tenantId', '==', tenantId)); // Ignoring siteId for some global exports or including it if needed
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      // Remove complex objects like Timestamps for CSV export
      const cleanData = data.map(item => {
        const cleaned: any = {};
        for (const [key, value] of Object.entries(item)) {
          if (value && typeof (value as any).toDate === 'function') {
            cleaned[key] = (value as any).toDate().toISOString();
          } else if (typeof value === 'object' && value !== null) {
            cleaned[key] = JSON.stringify(value);
          } else {
            cleaned[key] = value;
          }
        }
        return cleaned;
      });

      const csv = Papa.unparse(cleanData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `export_\${exportType.toLowerCase()}_\${new Date().toISOString()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error("Export failed", err);
      alert('Failed to export data.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    // Basic CSV template strings
    const templates: Record<ImportType, string> = {
      PRODUCTS: "productCode,name,description,categoryCode,defaultUnitOfMeasureCode\\nPROD-001,Example Product,Description,CAT-1,EA",
      LOCATIONS: "locationCode,locationName,areaCode,isActive\\nLOC-001,Location 001,AREA-1,true",
      INVENTORY: "productCode,locationCode,quantity,status\\nPROD-001,LOC-001,100,AVAILABLE",
      PLANNING_RULES: "productCode,minThreshold,targetThreshold,maxThreshold,isActive\\nPROD-001,10,50,100,true",
      PRODUCTION_EVENTS: "lineCode,productCode,startTime,endTime,plannedQuantity,status\\nLINE-1,PROD-001,2024-01-01T08:00:00Z,2024-01-01T16:00:00Z,1000,PLANNED",
      PROMOTIONS: "promotionCode,name,startDate,endDate,type,status\\nPROM-001,Summer Sale,2024-06-01T00:00:00Z,2024-06-30T23:59:59Z,PRICE_REDUCTION,PLANNED"
    };

    const content = templates[selectedType];
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `template_${selectedType.toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setValidationResults([]);
      setImportSummary(null);
    }
  };

  const handleParseAndValidate = () => {
    if (!file || !tenantId || !siteId) return;

    setIsProcessing(true);
    setValidationResults([]);
    setImportSummary(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const validation = await validateImportData(
            tenantId, 
            siteId, 
            selectedType, 
            results.data,
            selectedType === 'INVENTORY' ? inventoryType : undefined
          );
          setValidationResults(validation);
        } catch (err) {
          console.error(err);
          alert('Validation failed due to a system error.');
        } finally {
          setIsProcessing(false);
        }
      },
      error: (error) => {
        console.error("CSV Parse Error:", error);
        alert('Failed to parse CSV file.');
        setIsProcessing(false);
      }
    });
  };

  const handleCommit = async () => {
    if (!tenantId || !siteId || !file || validationResults.length === 0) return;
    
    // Only commit valid rows (CREATE, UPDATE)
    const validRows = validationResults.filter(r => r.action === 'CREATE' || r.action === 'UPDATE');
    if (validRows.length === 0) {
      alert("No valid rows to commit.");
      return;
    }

    setIsCommitting(true);
    try {
      const summary = await commitImportData(
        tenantId, 
        siteId, 
        currentUser,
        selectedType, 
        file.name,
        validRows,
        selectedType === 'INVENTORY' ? inventoryType : undefined
      );
      setImportSummary(summary);
    } catch (err) {
      console.error(err);
      alert('Failed to commit import data.');
    } finally {
      setIsCommitting(false);
    }
  };

  const validCount = validationResults.filter(r => r.action === 'CREATE' || r.action === 'UPDATE').length;
  const errorCount = validationResults.filter(r => r.action === 'ERROR').length;
  const warningCount = validationResults.filter(r => r.warnings.length > 0).length;

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)]">
      <PageHeader 
        title="Data Utilities" 
        description="Bulk data import, export, and migration tools."
      />
      
      <div className="mb-6 border-b border-slate-700 flex-shrink-0">
        <nav className="-mb-px flex space-x-6">
          <button
            onClick={() => setActiveTab('imports')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors \${
              activeTab === 'imports' ? 'border-brand-500 text-brand-500' : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-500'
            }`}
          >
            Data Imports
          </button>
          <button
            onClick={() => setActiveTab('exports')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors \${
              activeTab === 'exports' ? 'border-brand-500 text-brand-500' : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-500'
            }`}
          >
            Data Exports
          </button>
        </nav>
      </div>

      {activeTab === 'imports' && (
        <div className="flex-1 flex flex-col min-h-0 space-y-6">
          <SectionCard title="Import Configuration">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Data Entity</label>
                <select 
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value as ImportType);
                    setValidationResults([]);
                    setImportSummary(null);
                    setFile(null);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                >
                  <option value="PRODUCTS">Products</option>
                  <option value="LOCATIONS">Storage Locations</option>
                  <option value="INVENTORY">Inventory Balances</option>
                  <option value="PLANNING_RULES">Product Planning Rules</option>
                  <option value="PRODUCTION_EVENTS">Production Events</option>
                  <option value="PROMOTIONS">Promotions</option>
                </select>
              </div>

              {selectedType === 'INVENTORY' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Import Mode</label>
                  <select 
                    value={inventoryType}
                    onChange={(e) => setInventoryType(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
                  >
                    <option value="INITIAL_BALANCE">Initial Balance</option>
                    <option value="ABSOLUTE_BALANCE">Absolute Balance Update</option>
                    <option value="ADJUSTMENT">Adjustment (Delta)</option>
                  </select>
                </div>
              )}

              <div className="space-y-2 lg:col-span-2 flex flex-col justify-end">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800 text-slate-300 rounded border border-slate-700 hover:bg-slate-700 transition-colors text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Template
                  </button>
                  
                  <div className="flex-1 relative">
                    <input 
                      type="file" 
                      accept=".csv"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-slate-300 rounded border border-slate-700 text-sm overflow-hidden whitespace-nowrap">
                      <Upload className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{file ? file.name : 'Select CSV file...'}</span>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleParseAndValidate}
                    disabled={!file || isProcessing}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-slate-900 rounded font-medium hover:bg-brand-400 transition-colors text-sm disabled:opacity-50 whitespace-nowrap"
                  >
                    {isProcessing ? 'Validating...' : 'Validate'}
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>

          {importSummary && (
            <SectionCard title="Import Completed">
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-md text-green-400">
                <h4 className="font-semibold mb-2">Import Summary: {file?.name}</h4>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Total Rows Processed: {importSummary.totalRows}</li>
                  <li>Successfully Created: {importSummary.createdCount}</li>
                  <li>Successfully Updated: {importSummary.updatedCount}</li>
                  <li>Errors / Ignored: {importSummary.errorCount}</li>
                </ul>
              </div>
            </SectionCard>
          )}

          {!importSummary && validationResults.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 flex-shrink-0">
                <div className="flex items-center gap-6">
                  <h3 className="font-semibold text-slate-200">Validation Preview</h3>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1 text-green-400"><CheckCircle className="w-4 h-4" /> {validCount} Valid</span>
                    <span className="flex items-center gap-1 text-red-400"><XCircle className="w-4 h-4" /> {errorCount} Errors</span>
                    <span className="flex items-center gap-1 text-amber-400"><AlertTriangle className="w-4 h-4" /> {warningCount} Warnings</span>
                  </div>
                </div>
                <button
                  onClick={handleCommit}
                  disabled={validCount === 0 || isCommitting}
                  className="flex items-center gap-2 px-4 py-1.5 bg-brand-500 text-slate-900 rounded font-medium hover:bg-brand-400 transition-colors text-sm disabled:opacity-50"
                >
                  {isCommitting ? 'Committing...' : 'Commit Valid Rows'}
                </button>
              </div>
              
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0">
                    <tr>
                      <th className="px-4 py-3 font-medium bg-slate-900">Row</th>
                      <th className="px-4 py-3 font-medium bg-slate-900">Action</th>
                      <th className="px-4 py-3 font-medium bg-slate-900 w-full">Details & Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {validationResults.map((result, i) => (
                      <tr key={i} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-2 text-slate-400">{result.rowNumber}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium \${
                            result.action === 'CREATE' ? 'bg-green-500/20 text-green-400' :
                            result.action === 'UPDATE' ? 'bg-blue-500/20 text-blue-400' :
                            result.action === 'ERROR' ? 'bg-red-500/20 text-red-400' :
                            'bg-slate-700 text-slate-300'
                          }`}>
                            {result.action}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-slate-300 truncate max-w-2xl">{JSON.stringify(result.data)}</span>
                            {result.errors.length > 0 && (
                              <div className="text-red-400 text-xs">
                                {result.errors.map((e, idx) => <div key={idx}>• {e}</div>)}
                              </div>
                            )}
                            {result.warnings.length > 0 && (
                              <div className="text-amber-400 text-xs">
                                {result.warnings.map((e, idx) => <div key={idx}>• {e}</div>)}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'exports' && (
        <SectionCard title="Data Exports">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Data Entity to Export</label>
              <select 
                value={exportType}
                onChange={(e) => setExportType(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200"
              >
                <option value="PRODUCTS">Products</option>
                <option value="LOCATIONS">Storage Locations</option>
                <option value="INVENTORY">Inventory Balances</option>
                <option value="PLANNING_RULES">Product Planning Rules</option>
                <option value="PRODUCTION_EVENTS">Production Events</option>
                <option value="PROMOTIONS">Promotions</option>
                <option value="PRIORITIES">Operational Priorities</option>
                <option value="RECOMMENDATIONS">Recommendations</option>
                <option value="AUDIT_LOGS">Audit Logs</option>
              </select>
            </div>
            
            <div className="space-y-2 flex flex-col justify-end">
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-500 text-slate-900 rounded font-medium hover:bg-brand-400 transition-colors text-sm disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
};

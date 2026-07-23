import React, { useState } from 'react';
import { ProductionPlanRow } from '../../../types/production';
import { Product } from '../../../types/product';
import { ProductionLine } from '../../../types/configuration';
import { MissingProductResolution } from './MissingProductResolution';
import { MissingProductionLineResolution } from './MissingProductionLineResolution';
import { updateProductDescriptionInMaster, updateCasesPerPalletInMaster, activateProductInMaster } from '../services/productMappingService';
import { AlertTriangle, AlertCircle, CheckCircle2, FileSpreadsheet, PlusCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface MasterDataIssuesPanelProps {
  rows: ProductionPlanRow[];
  existingProducts: Product[];
  existingLines: ProductionLine[];
  tenantId: string;
  siteId: string;
  userProfileName: string;
  onRevalidate: () => void;
}

export const MasterDataIssuesPanel: React.FC<MasterDataIssuesPanelProps> = ({
  rows,
  existingProducts,
  existingLines,
  tenantId,
  siteId,
  userProfileName,
  onRevalidate
}) => {
  const [selectedProductIssue, setSelectedProductIssue] = useState<{
    code: string;
    description: string;
    affectedRows: ProductionPlanRow[];
  } | null>(null);

  const [selectedLineIssue, setSelectedLineIssue] = useState<{
    sapResourceCode: string;
    affectedRows: ProductionPlanRow[];
  } | null>(null);

  const [expandedCategory, setExpandedCategory] = useState<string | null>('PRODUCT_NOT_FOUND');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // Group rows by issue codes
  const unknownProductRows = rows.filter(r => r.validationCodes.includes('PRODUCT_NOT_FOUND'));
  const unknownLineRows = rows.filter(r => r.validationCodes.includes('PRODUCTION_LINE_NOT_CONFIGURED'));
  const missingCasesPerPalletRows = rows.filter(r => r.validationCodes.includes('CASES_PER_PALLET_MISSING'));
  const inactiveProductRows = rows.filter(r => r.validationCodes.includes('PRODUCT_INACTIVE'));
  const descriptionDiffRows = rows.filter(r => r.validationCodes.includes('DESCRIPTION_DIFFERENCE'));
  const duplicateSourceRows = rows.filter(r => r.validationCodes.includes('DUPLICATE_SOURCE_ROW'));

  // Group unknown products by product code
  const unknownProductsMap = new Map<string, { code: string; desc: string; rows: ProductionPlanRow[] }>();
  unknownProductRows.forEach(r => {
    const code = r.productCode;
    if (!unknownProductsMap.has(code)) {
      unknownProductsMap.set(code, { code, desc: r.sourceProductDescription, rows: [] });
    }
    unknownProductsMap.get(code)!.rows.push(r);
  });

  // Group unknown lines by SAP resource code
  const unknownLinesMap = new Map<string, { resourceCode: string; rows: ProductionPlanRow[] }>();
  unknownLineRows.forEach(r => {
    const resCode = r.productionLineCode;
    if (!unknownLinesMap.has(resCode)) {
      unknownLinesMap.set(resCode, { resourceCode: resCode, rows: [] });
    }
    unknownLinesMap.get(resCode)!.rows.push(r);
  });

  // Group missing cases per pallet by product
  const missingCasesMap = new Map<string, { productId: string; code: string; desc: string; rows: ProductionPlanRow[] }>();
  missingCasesPerPalletRows.forEach(r => {
    const code = r.productCode;
    if (r.matchedProductId && !missingCasesMap.has(code)) {
      missingCasesMap.set(code, {
        productId: r.matchedProductId,
        code,
        desc: r.sourceProductDescription,
        rows: []
      });
    }
    if (r.matchedProductId) {
      missingCasesMap.get(code)?.rows.push(r);
    }
  });

  // Group inactive products by product
  const inactiveProductsMap = new Map<string, { productId: string; code: string; desc: string; rows: ProductionPlanRow[] }>();
  inactiveProductRows.forEach(r => {
    const code = r.productCode;
    if (r.matchedProductId && !inactiveProductsMap.has(code)) {
      inactiveProductsMap.set(code, {
        productId: r.matchedProductId,
        code,
        desc: r.sourceProductDescription,
        rows: []
      });
    }
    if (r.matchedProductId) {
      inactiveProductsMap.get(code)?.rows.push(r);
    }
  });

  // Handle inline description sync
  const handleUpdateDescription = async (productId: string, sapDesc: string) => {
    setUpdating(true);
    setActionMessage(null);
    const res = await updateProductDescriptionInMaster(productId, sapDesc, tenantId, siteId, userProfileName);
    setUpdating(false);
    if (res.success) {
      setActionMessage(`Updated Product Master description to "${sapDesc}". Revalidating...`);
      onRevalidate();
    } else {
      setActionMessage(`Error: ${res.error}`);
    }
  };

  // Handle inline activate product
  const handleActivateProduct = async (productId: string) => {
    setUpdating(true);
    setActionMessage(null);
    const res = await activateProductInMaster(productId, tenantId, siteId, userProfileName);
    setUpdating(false);
    if (res.success) {
      setActionMessage(`Activated Product Master record. Revalidating...`);
      onRevalidate();
    } else {
      setActionMessage(`Error: ${res.error}`);
    }
  };

  // Handle inline cases/pallet prompt
  const handleFixCasesPerPallet = async (productId: string) => {
    const rateStr = prompt('Enter verified Cases per Pallet rate for Product Master:');
    if (!rateStr) return;
    const rate = parseFloat(rateStr);
    if (isNaN(rate) || rate <= 0) {
      alert('Invalid rate. Must be a number greater than 0.');
      return;
    }

    setUpdating(true);
    setActionMessage(null);
    const res = await updateCasesPerPalletInMaster(productId, rate, tenantId, siteId, userProfileName);
    setUpdating(false);
    if (res.success) {
      setActionMessage(`Updated Cases per Pallet to ${rate}. Revalidating...`);
      onRevalidate();
    } else {
      setActionMessage(`Error: ${res.error}`);
    }
  };

  const totalIssuesCount =
    unknownProductRows.length +
    unknownLineRows.length +
    missingCasesPerPalletRows.length +
    inactiveProductRows.length +
    descriptionDiffRows.length +
    duplicateSourceRows.length;

  const totalBlockingCount =
    unknownProductRows.length +
    unknownLineRows.length +
    missingCasesPerPalletRows.length +
    inactiveProductRows.length;

  if (totalIssuesCount === 0) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-emerald-400 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="font-medium">All master data validation checks passed cleanly. No product or line mapping issues found.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Master Data Validation Issues
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            SAP import rows require master data alignment before production planning can be committed.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
              {totalBlockingCount} Blocking Errors
            </span>
          </div>
          <button
            onClick={onRevalidate}
            disabled={updating}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${updating ? 'animate-spin' : ''}`} />
            Revalidate Workbook
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs p-3 rounded-lg">
          {actionMessage}
        </div>
      )}

      <div className="space-y-3">
        {/* 1. UNKNOWN PRODUCTS */}
        {unknownProductRows.length > 0 && (
          <div className="border border-red-500/30 rounded-lg bg-red-950/20 overflow-hidden">
            <button
              onClick={() =>
                setExpandedCategory(expandedCategory === 'PRODUCT_NOT_FOUND' ? null : 'PRODUCT_NOT_FOUND')
              }
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-red-900/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="p-1.5 rounded-lg bg-red-500/20 text-red-400">
                  <AlertCircle className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-red-200">
                    Unknown Products ({unknownProductsMap.size} unique SKUs, {unknownProductRows.length} rows)
                  </div>
                  <div className="text-xs text-red-400/80">
                    Blocking Error • Product SKU not registered in local Product Master
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-500/30 text-red-200">
                  Blocking
                </span>
                {expandedCategory === 'PRODUCT_NOT_FOUND' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expandedCategory === 'PRODUCT_NOT_FOUND' && (
              <div className="p-3 border-t border-red-500/20 bg-slate-900/60 space-y-2">
                {Array.from(unknownProductsMap.values()).map(item => (
                  <div
                    key={item.code}
                    className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-800/80 border border-slate-700/80 rounded-lg p-3 gap-3"
                  >
                    <div>
                      <div className="text-xs font-mono font-bold text-cyan-400">{item.code}</div>
                      <div className="text-xs text-slate-300 font-medium">{item.desc || 'No description in SAP'}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Impact: {item.rows.length} rows •{' '}
                        {item.rows.reduce((acc, r) => acc + (r.plannedQuantity || 0), 0).toLocaleString()} total cases
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setSelectedProductIssue({
                          code: item.code,
                          description: item.desc,
                          affectedRows: item.rows
                        })
                      }
                      className="px-3 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg flex items-center gap-1.5 self-start sm:self-center font-medium transition-colors"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Create Product
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. UNKNOWN PRODUCTION LINES */}
        {unknownLineRows.length > 0 && (
          <div className="border border-red-500/30 rounded-lg bg-red-950/20 overflow-hidden">
            <button
              onClick={() =>
                setExpandedCategory(
                  expandedCategory === 'PRODUCTION_LINE_NOT_CONFIGURED' ? null : 'PRODUCTION_LINE_NOT_CONFIGURED'
                )
              }
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-red-900/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="p-1.5 rounded-lg bg-red-500/20 text-red-400">
                  <AlertCircle className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-red-200">
                    Unknown Production Lines ({unknownLinesMap.size} unique SAP resources, {unknownLineRows.length} rows)
                  </div>
                  <div className="text-xs text-red-400/80">
                    Blocking Error • SAP resource code not mapped to any OVMS line or alias
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-500/30 text-red-200">
                  Blocking
                </span>
                {expandedCategory === 'PRODUCTION_LINE_NOT_CONFIGURED' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expandedCategory === 'PRODUCTION_LINE_NOT_CONFIGURED' && (
              <div className="p-3 border-t border-red-500/20 bg-slate-900/60 space-y-2">
                {Array.from(unknownLinesMap.values()).map(item => (
                  <div
                    key={item.resourceCode}
                    className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-800/80 border border-slate-700/80 rounded-lg p-3 gap-3"
                  >
                    <div>
                      <div className="text-xs font-mono font-bold text-amber-300">{item.resourceCode}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Impact: {item.rows.length} rows •{' '}
                        {item.rows.reduce((acc, r) => acc + (r.plannedQuantity || 0), 0).toLocaleString()} total cases
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setSelectedLineIssue({
                          sapResourceCode: item.resourceCode,
                          affectedRows: item.rows
                        })
                      }
                      className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg flex items-center gap-1.5 self-start sm:self-center font-medium transition-colors"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Resolve Line Mapping
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. MISSING CASES PER PALLET */}
        {missingCasesPerPalletRows.length > 0 && (
          <div className="border border-red-500/30 rounded-lg bg-red-950/20 overflow-hidden">
            <button
              onClick={() =>
                setExpandedCategory(
                  expandedCategory === 'CASES_PER_PALLET_MISSING' ? null : 'CASES_PER_PALLET_MISSING'
                )
              }
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-red-900/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="p-1.5 rounded-lg bg-red-500/20 text-red-400">
                  <AlertCircle className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-red-200">
                    Missing Cases per Pallet ({missingCasesMap.size} products, {missingCasesPerPalletRows.length} rows)
                  </div>
                  <div className="text-xs text-red-400/80">
                    Blocking Error • Pallet conversion rate unconfigured (pallet calculations blocked)
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-500/30 text-red-200">
                  Blocking
                </span>
                {expandedCategory === 'CASES_PER_PALLET_MISSING' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expandedCategory === 'CASES_PER_PALLET_MISSING' && (
              <div className="p-3 border-t border-red-500/20 bg-slate-900/60 space-y-2">
                {Array.from(missingCasesMap.values()).map(item => (
                  <div
                    key={item.code}
                    className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-800/80 border border-slate-700/80 rounded-lg p-3 gap-3"
                  >
                    <div>
                      <div className="text-xs font-mono font-bold text-cyan-400">{item.code}</div>
                      <div className="text-xs text-slate-300 font-medium">{item.desc}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Impact: {item.rows.length} rows missing pallet calculation
                      </div>
                    </div>
                    <button
                      onClick={() => handleFixCasesPerPallet(item.productId)}
                      className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg flex items-center gap-1.5 self-start sm:self-center font-medium transition-colors"
                    >
                      Set Cases per Pallet
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. INACTIVE PRODUCTS */}
        {inactiveProductRows.length > 0 && (
          <div className="border border-red-500/30 rounded-lg bg-red-950/20 overflow-hidden">
            <button
              onClick={() =>
                setExpandedCategory(expandedCategory === 'PRODUCT_INACTIVE' ? null : 'PRODUCT_INACTIVE')
              }
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-red-900/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="p-1.5 rounded-lg bg-red-500/20 text-red-400">
                  <AlertCircle className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-red-200">
                    Inactive Products ({inactiveProductsMap.size} products, {inactiveProductRows.length} rows)
                  </div>
                  <div className="text-xs text-red-400/80">
                    Blocking Error • Product exists in Product Master but is set to Inactive
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-500/30 text-red-200">
                  Blocking
                </span>
                {expandedCategory === 'PRODUCT_INACTIVE' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expandedCategory === 'PRODUCT_INACTIVE' && (
              <div className="p-3 border-t border-red-500/20 bg-slate-900/60 space-y-2">
                {Array.from(inactiveProductsMap.values()).map(item => (
                  <div
                    key={item.code}
                    className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-800/80 border border-slate-700/80 rounded-lg p-3 gap-3"
                  >
                    <div>
                      <div className="text-xs font-mono font-bold text-red-300">{item.code}</div>
                      <div className="text-xs text-slate-300 font-medium">{item.desc}</div>
                      <div className="text-[11px] text-slate-400 mt-1">Impact: {item.rows.length} rows</div>
                    </div>
                    <button
                      onClick={() => handleActivateProduct(item.productId)}
                      className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1.5 self-start sm:self-center font-medium transition-colors"
                    >
                      Activate Product
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. DESCRIPTION DIFFERENCES (WARNING ONLY) */}
        {descriptionDiffRows.length > 0 && (
          <div className="border border-amber-500/30 rounded-lg bg-amber-950/20 overflow-hidden">
            <button
              onClick={() =>
                setExpandedCategory(expandedCategory === 'DESCRIPTION_DIFFERENCE' ? null : 'DESCRIPTION_DIFFERENCE')
              }
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-amber-900/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-amber-200">
                    Description Differences ({descriptionDiffRows.length} rows)
                  </div>
                  <div className="text-xs text-amber-300/80">
                    Non-Blocking Warning • SAP product description differs from Product Master
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                  Warning
                </span>
                {expandedCategory === 'DESCRIPTION_DIFFERENCE' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expandedCategory === 'DESCRIPTION_DIFFERENCE' && (
              <div className="p-3 border-t border-amber-500/20 bg-slate-900/60 space-y-2">
                {descriptionDiffRows.slice(0, 10).map((row, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-800/80 border border-slate-700/80 rounded-lg p-3 gap-3 text-xs"
                  >
                    <div>
                      <div className="font-mono text-cyan-400 font-bold mb-1">{row.productCode}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-300">
                        <div>
                          <span className="text-slate-400 text-[11px] block">SAP Import Description:</span>
                          <span className="text-amber-200 font-medium">"{row.sourceProductDescription}"</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] block">Product Master Description:</span>
                          <span className="text-slate-200 font-medium">"{row.matchedProductDescription}"</span>
                        </div>
                      </div>
                    </div>
                    {row.matchedProductId && (
                      <button
                        onClick={() => handleUpdateDescription(row.matchedProductId!, row.sourceProductDescription)}
                        className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg flex items-center gap-1.5 self-start sm:self-center transition-colors whitespace-nowrap"
                      >
                        Sync Master to SAP
                      </button>
                    )}
                  </div>
                ))}
                {descriptionDiffRows.length > 10 && (
                  <div className="text-center text-xs text-slate-400 pt-2">
                    ...and {descriptionDiffRows.length - 10} more rows with description variations.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 6. DUPLICATE SOURCE ROWS */}
        {duplicateSourceRows.length > 0 && (
          <div className="border border-blue-500/30 rounded-lg bg-blue-950/20 overflow-hidden">
            <div className="p-3.5 flex items-center justify-between text-left">
              <div className="flex items-center gap-3">
                <span className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                  <FileSpreadsheet className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-blue-200">
                    Duplicate Import Rows ({duplicateSourceRows.length} rows)
                  </div>
                  <div className="text-xs text-blue-300/80">
                    Non-Blocking Warning • Multiple spreadsheet entries found for same Line / SKU / Date
                  </div>
                </div>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                Warning
              </span>
            </div>
          </div>
        )}
      </div>

      {/* RESOLUTION MODALS */}
      {selectedProductIssue && (
        <MissingProductResolution
          productCode={selectedProductIssue.code}
          sapDescription={selectedProductIssue.description}
          affectedRows={selectedProductIssue.affectedRows}
          existingProducts={existingProducts}
          tenantId={tenantId}
          siteId={siteId}
          userProfileName={userProfileName}
          onClose={() => setSelectedProductIssue(null)}
          onResolved={() => {
            setSelectedProductIssue(null);
            onRevalidate();
          }}
        />
      )}

      {selectedLineIssue && (
        <MissingProductionLineResolution
          sapResourceCode={selectedLineIssue.sapResourceCode}
          affectedRows={selectedLineIssue.affectedRows}
          existingLines={existingLines}
          tenantId={tenantId}
          siteId={siteId}
          userProfileName={userProfileName}
          onClose={() => setSelectedLineIssue(null)}
          onResolved={() => {
            setSelectedLineIssue(null);
            onRevalidate();
          }}
        />
      )}
    </div>
  );
};

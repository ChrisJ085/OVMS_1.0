import React from 'react';
import { AlertTriangle, Plus, X, ArrowRight, ShieldAlert, Package } from 'lucide-react';
import { UnknownProductItem } from './AddUnknownProductsWizardModal';

interface UnknownProductsPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmAdd: () => void;
  unknownProducts: UnknownProductItem[];
}

export const UnknownProductsPromptModal: React.FC<UnknownProductsPromptModalProps> = ({
  isOpen,
  onClose,
  onConfirmAdd,
  unknownProducts
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-amber-600/50 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/40 border-b border-amber-800/40 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-900/50 border border-amber-500/50 text-amber-300 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>Unknown Products Detected</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {unknownProducts.length} unmapped
              </span>
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              The uploaded weekly SNP87 file contains <strong>{unknownProducts.length} product(s)</strong> that do not currently exist in the Product Master.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List of Unknown Products */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 max-h-48 overflow-y-auto divide-y divide-slate-800/60">
            {unknownProducts.map((p, idx) => (
              <div key={idx} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between text-xs gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-mono font-bold text-slate-100 shrink-0">{p.productNumber || p.orderSku}</span>
                  <span className="text-slate-400 truncate" title={p.description}>
                    {p.description || 'No description in file'}
                  </span>
                </div>
                {p.rowCount && (
                  <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                    {p.rowCount} row{p.rowCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-xl text-xs text-amber-200 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <span>Would you like to add them to the Product Master now?</span>
            </p>
            <p className="text-[11px] text-slate-300">
              If 'Yes', you will be guided through creating each product with pre-populated Product Code & Description, default Cases Per Pallet, and Default Destination defaulting to Chorley.
            </p>
            <p className="text-[10px] text-slate-400 pt-1">
              • Saved products permanently persist in the Product Master even if this SNP report is later discarded.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors"
          >
            No, Review Report First
          </button>

          <button
            type="button"
            onClick={onConfirmAdd}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold text-xs transition-colors shadow-md shadow-amber-950/40"
          >
            <span>Yes, Add to Product Master</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

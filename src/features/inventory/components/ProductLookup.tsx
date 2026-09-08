import React, { useState, useEffect, useRef } from 'react';
import { subscribeToProducts } from '../services/productService';
import { Product } from '../../../types/product';
import { Search } from 'lucide-react';
import { useSiteContext } from '../../../contexts/SiteContext';
import { subscribeToCollection, where } from '../../../services/firestoreBase';

interface ProductLookupProps {
  value?: string; // productId
  onChange: (product: Product) => void;
  disabled?: boolean;
}

export const ProductLookup: React.FC<ProductLookupProps> = ({ value, onChange, disabled }) => {
  const { tenantId, siteId } = useSiteContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = subscribeToProducts(
      tenantId,
      siteId,
      (items) => {
        // Only active products
        setProducts(items.filter(p => p.status === 'active'));
      },
      (err) => console.error('Failed to load products for lookup', err)
    );

    const unsubUnits = subscribeToCollection<any>(
      'unitsOfMeasure',
      [where('tenantId', '==', tenantId)],
      (items) => {
        setUnits(items);
      },
      console.error
    );

    return () => {
      unsubscribe();
      unsubUnits();
    };
  }, [tenantId, siteId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedProduct = products.find(p => p.id === value);
  const getUnitName = (id: string) => units.find(u => u.id === id)?.name || id;

  const displayValue = selectedProduct 
    ? `${selectedProduct.productCode} - ${selectedProduct.description} (${getUnitName(selectedProduct.unitOfMeasureId)}, ${selectedProduct.casesPerPallet || 0} CPP)` 
    : searchTerm;

  const filteredProducts = products.filter(p => 
    p.productCode.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-slate-500" />
        </div>
        <input
          type="text"
          value={isOpen ? searchTerm : displayValue}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setSearchTerm('');
            setIsOpen(true);
          }}
          disabled={disabled}
          className="block w-full pl-10 pr-3 py-2 border border-slate-700 rounded-md leading-5 bg-slate-900 text-slate-200 placeholder-slate-500 focus:outline-none focus:bg-slate-800 focus:border-brand-500 sm:text-sm transition-colors disabled:opacity-50"
          placeholder="Search products..."
        />
      </div>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-700 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          {filteredProducts.length === 0 ? (
            <div className="px-4 py-2 text-slate-400 italic">No matching product found</div>
          ) : (
            filteredProducts.map((product) => (
              <div
                key={product.id}
                className="cursor-pointer select-none relative px-4 py-2 hover:bg-slate-700 text-slate-200 flex flex-col"
                onClick={() => {
                  onChange(product);
                  setIsOpen(false);
                }}
              >
                <div className="flex justify-between items-start">
                  <span className="font-medium text-slate-100">{product.productCode}</span>
                  <span className="text-[10px] text-slate-500 bg-slate-900 px-1 rounded">
                    {getUnitName(product.unitOfMeasureId)}
                  </span>
                </div>
                <span className="text-xs text-slate-400 truncate">{product.description}</span>
                <span className="text-[10px] text-slate-500 italic">
                  {product.casesPerPallet || 0} Cases per Pallet
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

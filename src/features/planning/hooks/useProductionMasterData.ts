import { useState, useEffect, useCallback } from 'react';
import { ProductionLine, ProductCategory } from '../../../types/configuration';
import { Product } from '../../../types/product';
import { UnitOfMeasure } from '../../../types/configuration';
import { toAppError } from '../../../types/error';
import { supabase } from '../../../config/supabase';
import { toCamelCase } from '../../../utils/caseTransformers';

export function useProductionMasterData(tenantId: string, siteId: string) {
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const revalidate = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (!tenantId || !siteId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const loadMasterData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch production lines natively
        const { data: lines, error: linesErr } = await supabase
          .from('production_lines')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('site_id', siteId);

        if (linesErr) throw linesErr;
        const fetchedLines = (lines || []).map(row => toCamelCase<ProductionLine>(row));

        // Fetch products natively
        const { data: prods, error: prodsErr } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('site_id', siteId)
          .eq('status', 'active');

        if (prodsErr) throw prodsErr;
        const fetchedProducts = (prods || []).map(row => toCamelCase<Product>(row));

        // Fetch Units of Measure natively
        const { data: unitsData, error: unitsErr } = await supabase
          .from('units_of_measure')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('site_id', '');

        if (unitsErr) throw unitsErr;
        const fetchedUnits = (unitsData || []).map(row => toCamelCase<UnitOfMeasure>(row));

        // Fetch Product Categories natively
        const { data: catData, error: catErr } = await supabase
          .from('product_categories')
          .select('*')
          .eq('tenant_id', tenantId);

        if (catErr) throw catErr;
        const fetchedCat = (catData || []).map(row => toCamelCase<ProductCategory>(row));

        if (isMounted) {
          setProductionLines(fetchedLines);
          setProducts(fetchedProducts);
          setUnits(fetchedUnits);
          setCategories(fetchedCat);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          const appErr = toAppError(err, 'MASTER_DATA_LOAD_FAILED');
          setError('Failed to sync master data catalog: ' + appErr.userMessage);
          setLoading(false);
        }
      }
    };

    loadMasterData();

    return () => {
      isMounted = false;
    };
  }, [tenantId, siteId, refreshTrigger]);

  return {
    productionLines,
    products,
    units,
    categories,
    loading,
    error,
    revalidate
  };
}

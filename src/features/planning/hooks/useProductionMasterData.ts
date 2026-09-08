import { useState, useEffect, useCallback } from 'react';
import { ProductionLine, ProductCategory } from '../../../types/configuration';
import { Product } from '../../../types/product';
import { UnitOfMeasure } from '../../../types/configuration';
import { toAppError } from '../../../types/error';
import { collection, db, getDocs, query, where } from '../../../services/firestoreBase';

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
    if (!tenantId || !siteId || !db) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const loadMasterData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch production lines
        const linesRef = collection(db, 'productionLines');
        const qLines = query(linesRef, where('tenantId', '==', tenantId), where('siteId', '==', siteId));
        const snapLines = await getDocs(qLines);
        const fetchedLines = snapLines.docs.map(d => ({ id: d.id, ...d.data() } as ProductionLine));

        // Fetch products
        const productsRef = collection(db, 'products');
        const qProducts = query(productsRef, where('tenantId', '==', tenantId), where('siteId', '==', siteId), where('status', '==', 'active'));
        const snapProducts = await getDocs(qProducts);
        const fetchedProducts = snapProducts.docs.map(d => ({ id: d.id, ...d.data() } as Product));

        // Fetch Units of Measure
        const unitsRef = collection(db, 'unitsOfMeasure');
        const qUnits = query(unitsRef, where('tenantId', '==', tenantId), where('siteId', '==', ''));
        const snapUnits = await getDocs(qUnits);
        const fetchedUnits = snapUnits.docs.map(d => ({ id: d.id, ...d.data() } as UnitOfMeasure));

        // Fetch Product Categories
        const catRef = collection(db, 'productCategories');
        const qCat = query(catRef, where('tenantId', '==', tenantId));
        const snapCat = await getDocs(qCat);
        const fetchedCat = snapCat.docs.map(d => ({ id: d.id, ...d.data() } as ProductCategory));

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

import { ensureDefaultDecisionConfiguration } from './decisionConfigurationService';
import { generateRecommendationForProduct } from './recommendationService';
import { Timestamp, collection, db, doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from '../../../services/supabaseBase';

// Define structures matching types
const PRODUCTS_COLLECTION = 'products';
const BALANCES_COLLECTION = 'inventoryBalances';
const PLANNING_RULES_COLLECTION = 'productPlanningRules';
const PROMOTIONS_COLLECTION = 'promotions';
const PROMOTION_RULES_COLLECTION = 'promotionProductRules';
const PRODUCTION_ENTRIES_COLLECTION = 'productionPlanEntries';
const LOCATIONS_COLLECTION = 'locations';
const DESTINATIONS_COLLECTION = 'destinations';

export async function seedTestDataForTesting(tenantId: string, siteId: string): Promise<{ success: boolean; message: string; count: number }> {
  try {
    console.log(`Starting seeding process for tenant: ${tenantId}, site: ${siteId}`);
    
    // 1. Ensure Default Decision Configuration is active and initialized
    const configResult = await ensureDefaultDecisionConfiguration(tenantId, siteId);
    if (!configResult) {
      throw new Error(`Failed to ensure default decision configuration`);
    }

    // Get configuration to resolve Action IDs and Priority IDs
    const actionsSnap = await getDocs(query(collection(db, 'actionTypes'), where('tenantId', '==', tenantId)));
    const prioritiesSnap = await getDocs(query(collection(db, 'priorityLevels'), where('tenantId', '==', tenantId)));
    
    const releaseAction = actionsSnap.docs.find(d => d.data().code === 'RELEASE' || d.data().code === 'SEND')?.id || 'ACTION_RELEASE';
    const holdAction = actionsSnap.docs.find(d => d.data().code === 'HOLD')?.id || 'ACTION_HOLD';
    const normalPriority = prioritiesSnap.docs.find(d => d.data().code === 'NORMAL' || d.data().code === 'STANDARD')?.id || 'PRIORITY_NORMAL';
    const urgentPriority = prioritiesSnap.docs.find(d => d.data().code === 'URGENT' || d.data().code === 'HIGH')?.id || 'PRIORITY_URGENT';

    // 2. Ensure Default Destination exists
    const destQuery = query(collection(db, DESTINATIONS_COLLECTION), where('tenantId', '==', tenantId));
    const destSnap = await getDocs(destQuery);
    let preferredDestinationId = 'DEST_DEFAULT';
    
    if (destSnap.empty) {
      const destRef = doc(collection(db, DESTINATIONS_COLLECTION), 'DEST_DEFAULT');
      await setDoc(destRef, {
        tenantId,
        destinationCode: 'CH',
        destinationName: 'Chester Hub',
        status: 'active',
        createdDate: serverTimestamp(),
        modifiedDate: serverTimestamp(),
        createdBy: 'SYSTEM_SEED',
        modifiedBy: 'SYSTEM_SEED'
      });
    } else {
      preferredDestinationId = destSnap.docs[0].id;
    }

    // 3. Ensure Default Location exists
    const locQuery = query(collection(db, LOCATIONS_COLLECTION), where('tenantId', '==', tenantId), where('siteId', '==', siteId));
    const locSnap = await getDocs(locQuery);
    let locationId = 'LOC_HB1';
    let locationCode = 'HB-01';
    
    if (locSnap.empty) {
      const locRef = doc(collection(db, LOCATIONS_COLLECTION), 'LOC_HB1');
      await setDoc(locRef, {
        tenantId,
        siteId,
        storageAreaId: 'HB1',
        locationCode: 'HB-01',
        locationName: 'High Bay Bin 1',
        status: 'active',
        createdDate: serverTimestamp(),
        modifiedDate: serverTimestamp(),
        createdBy: 'SYSTEM_SEED',
        modifiedBy: 'SYSTEM_SEED'
      });
    } else {
      locationId = locSnap.docs[0].id;
      locationCode = locSnap.docs[0].data().locationCode || 'HB-01';
    }

    // 4. Create 5 Diverse Test Products
    const testProducts = [
      { id: `${tenantId}_PRD_APP_01`, code: 'PRD-APP-01', desc: 'Apple Juice Premium 1L', min: 300, target: 500, max: 1000, currentStock: 100 }, // Below Control
      { id: `${tenantId}_PRD_ORG_02`, code: 'PRD-ORG-02', desc: 'Orange Juice Pulp Free 1L', min: 350, target: 600, max: 1200, currentStock: 400 }, // Below Target
      { id: `${tenantId}_PRD_CHY_03`, code: 'PRD-CHY-03', desc: 'Cherry Blossom Soda 330ml', min: 200, target: 600, max: 1000, currentStock: 800 }, // Above Target (At Target)
      { id: `${tenantId}_PRD_GNG_04`, code: 'PRD-GNG-04', desc: 'Ginger Beer Classic 330ml', min: 100, target: 400, max: 800, currentStock: 1500 }, // Above Maximum
      { id: `${tenantId}_PRD_LEM_05`, code: 'PRD-LEM-05', desc: 'Lemon Lime Sparkling 500ml', min: 200, target: 500, max: 1000, currentStock: 500 }, // At Target
    ];

    const batch = writeBatch(db);

    for (const prod of testProducts) {
      // Create Product
      const productRef = doc(collection(db, PRODUCTS_COLLECTION), prod.id);
      batch.set(productRef, {
        tenantId,
        productCode: prod.code,
        description: prod.desc,
        categoryId: 'beverages',
        unitOfMeasureId: 'cases',
        casesPerPallet: 100,
        unitsPerCase: 12,
        configurations: [
          { unitOfMeasureId: 'cases', casesPerPallet: 100, unitsPerCase: 12 }
        ],
        defaultImportUomId: 'cases',
        defaultDestinationId: preferredDestinationId,
        operationallyRelevant: true,
        notes: 'Seeded test product',
        status: 'active',
        createdDate: serverTimestamp(),
        modifiedDate: serverTimestamp(),
        createdBy: 'SYSTEM_SEED',
        modifiedBy: 'SYSTEM_SEED'
      });

      // Create Planning Rule
      const ruleRef = doc(collection(db, PLANNING_RULES_COLLECTION), `${prod.id}_rule`);
      batch.set(ruleRef, {
        tenantId,
        siteId,
        productId: prod.id,
        productCodeSnapshot: prod.code,
        descriptionSnapshot: prod.desc,
        minimumQuantity: prod.min,
        targetQuantity: prod.target,
        maximumQuantity: prod.max,
        ddxmRetentionQuantity: Math.round(prod.min * 1.2),
        controllingThresholdMode: 'HIGHEST_MANDATORY',
        customControllingRetentionQuantity: null,
        belowTargetBehavior: 'RELEASE_ABOVE_CONTROL',
        preferredDestinationId,
        secondaryDestinationId: null,
        defaultActionTypeId: releaseAction,
        defaultPriorityLevelId: normalPriority,
        allowQuantityOverride: true,
        allowDestinationOverride: true,
        overrideRequiresReason: true,
        effectiveFrom: Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)), // Active since 30 days ago
        effectiveTo: null,
        untilSwitchedOff: true,
        notes: 'Seeded test planning rule',
        status: 'active',
        createdDate: serverTimestamp(),
        modifiedDate: serverTimestamp(),
        createdBy: 'SYSTEM_SEED',
        modifiedBy: 'SYSTEM_SEED'
      });

      // Create Inventory Balance
      const balanceRef = doc(collection(db, BALANCES_COLLECTION), `${prod.id}_balance`);
      batch.set(balanceRef, {
        tenantId,
        siteId,
        productId: prod.id,
        productCodeSnapshot: prod.code,
        descriptionSnapshot: prod.desc,
        locationId,
        locationCodeSnapshot: locationCode,
        quantity: prod.currentStock,
        unitOfMeasureId: 'cases',
        source: 'MANUAL',
        sourceUpdatedAt: serverTimestamp(),
        status: 'active',
        createdDate: serverTimestamp(),
        modifiedDate: serverTimestamp(),
        createdBy: 'SYSTEM_SEED',
        modifiedBy: 'SYSTEM_SEED'
      });
    }

    // 5. Create active promotion: Summer Refresh Special
    const promoId = `${tenantId}_PROMO_SUMMER`;
    const promoRef = doc(collection(db, PROMOTIONS_COLLECTION), promoId);
    batch.set(promoRef, {
      tenantId,
      promotionCode: 'SUMMER26',
      promotionName: 'Summer Refresh Special',
      description: 'Nationwide promotional uplift for key beverage SKUs during peak heat waves',
      importance: 'HIGH',
      promotionStatus: 'ACTIVE',
      startDate: Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)), // Started 5 days ago
      endDate: Timestamp.fromDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)), // Ends in 15 days
      preBuildStartDate: Timestamp.fromDate(new Date(Date.now() - 12 * 24 * 60 * 60 * 1000)),
      runDownEndDate: Timestamp.fromDate(new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)),
      notes: 'Summer promotion seeding',
      status: 'active',
      createdDate: serverTimestamp(),
      modifiedDate: serverTimestamp(),
      createdBy: 'SYSTEM_SEED',
      modifiedBy: 'SYSTEM_SEED'
    });

    // Link PRD-APP-01 (Apple Juice) and PRD-CHY-03 (Cherry Soda) to Summer promotion
    const promoRule1Ref = doc(collection(db, PROMOTION_RULES_COLLECTION), `${promoId}_PRD_APP_01`);
    batch.set(promoRule1Ref, {
      tenantId,
      siteId,
      promotionId: promoId,
      productId: `${tenantId}_PRD_APP_01`,
      productCodeSnapshot: 'PRD-APP-01',
      descriptionSnapshot: 'Apple Juice Premium 1L',
      expectedVolumeUpliftQuantity: 200,
      expectedVolumeUpliftPercent: 20,
      retentionUpliftQuantity: 150, // This will uplift our controls and trigger promo affected recommendations!
      promotionMinimumOverride: 450,
      promotionTargetOverride: 700,
      promotionMaximumOverride: 1200,
      destinationOverrideId: preferredDestinationId,
      priorityWeightUplift: 1.5,
      actionTypeOverrideId: releaseAction,
      notes: 'Promo uplift rules for apple juice',
      status: 'active',
      createdDate: serverTimestamp(),
      modifiedDate: serverTimestamp(),
      createdBy: 'SYSTEM_SEED',
      modifiedBy: 'SYSTEM_SEED'
    });

    const promoRule2Ref = doc(collection(db, PROMOTION_RULES_COLLECTION), `${promoId}_PRD_CHY_03`);
    batch.set(promoRule2Ref, {
      tenantId,
      siteId,
      promotionId: promoId,
      productId: `${tenantId}_PRD_CHY_03`,
      productCodeSnapshot: 'PRD-CHY-03',
      descriptionSnapshot: 'Cherry Blossom Soda 330ml',
      expectedVolumeUpliftQuantity: 300,
      expectedVolumeUpliftPercent: 30,
      retentionUpliftQuantity: 100,
      promotionMinimumOverride: null,
      promotionTargetOverride: null,
      promotionMaximumOverride: null,
      destinationOverrideId: null,
      priorityWeightUplift: 1.2,
      actionTypeOverrideId: null,
      notes: 'Promo uplift rules for cherry soda',
      status: 'active',
      createdDate: serverTimestamp(),
      modifiedDate: serverTimestamp(),
      createdBy: 'SYSTEM_SEED',
      modifiedBy: 'SYSTEM_SEED'
    });

    // 6. Create production schedules for next few days
    const lines = ['LINE-01', 'LINE-02'];
    const activeImportId = 'import_seeded_system';
    
    // Seed some future production entries
    testProducts.forEach((prod, index) => {
      const entryId = `${tenantId}_PROD_ENTRY_${prod.code}`;
      const entryRef = doc(collection(db, PRODUCTION_ENTRIES_COLLECTION), entryId);
      
      const isScheduled = index % 2 === 0; // Alternating schedule to test different risks
      const lineId = lines[index % lines.length];
      
      batch.set(entryRef, {
        tenantId,
        siteId,
        activeImportId,
        productId: prod.id,
        productCodeSnapshot: prod.code,
        descriptionSnapshot: prod.desc,
        productionLineId: lineId,
        productionLineCodeSnapshot: lineId,
        productionDate: Timestamp.fromDate(new Date(Date.now() + (index + 1) * 24 * 60 * 60 * 1000)), // scheduled in 1 to 5 days
        plannedCases: 400,
        casesPerPallet: 100,
        plannedPallets: 4,
        sourceType: 'SAP_MPPS7',
        sourceSheetName: 'Seeded_Schedule',
        sourceRowNumber: index + 1,
        sourceUpdatedAt: serverTimestamp(),
        planVersion: '1.0',
        status: isScheduled ? 'PLANNED' : 'RUNNING',
        createdDate: serverTimestamp(),
        modifiedDate: serverTimestamp(),
        createdBy: 'SYSTEM_SEED',
        modifiedBy: 'SYSTEM_SEED'
      });
    });

    // Commit all seed records
    await batch.commit();
    console.log('Seeded database batch successfully!');

    // 7. Generate Recommendations for the 5 seeded products
    let count = 0;
    for (const prod of testProducts) {
      try {
        const recResult = await generateRecommendationForProduct(tenantId, siteId, prod.id);
        if (recResult.success) {
          count++;
        } else {
          console.error(`Recommendation generation failed for ${prod.code}: ${recResult.error}`);
        }
      } catch (err) {
        console.error(`Error generating recommendation for ${prod.code}:`, err);
      }
    }

    return {
      success: true,
      message: `Database seeded successfully. Created 5 products, active promotions, planning rules, stock balances, production plans, and generated ${count} recommendations.`,
      count
    };

  } catch (error) {
    console.error('Seeding process encountered an error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error during seeding',
      count: 0
    };
  }
}

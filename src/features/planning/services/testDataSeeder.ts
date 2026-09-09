import { ensureDefaultDecisionConfiguration } from './decisionConfigurationService';
import { generateRecommendationForProduct } from './recommendationService';
import { getDocuments, setDocument, where } from '../../../services/dbService';

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
    const actionsDocs = await getDocuments<any>('actionTypes', [where('tenantId', '==', tenantId)]);
    const prioritiesDocs = await getDocuments<any>('priorityLevels', [where('tenantId', '==', tenantId)]);
    
    const releaseAction = actionsDocs.find(d => d.code === 'RELEASE' || d.code === 'SEND')?.id || 'ACTION_RELEASE';
    const holdAction = actionsDocs.find(d => d.code === 'HOLD')?.id || 'ACTION_HOLD';
    const normalPriority = prioritiesDocs.find(d => d.code === 'NORMAL' || d.code === 'STANDARD')?.id || 'PRIORITY_NORMAL';
    const urgentPriority = prioritiesDocs.find(d => d.code === 'URGENT' || d.code === 'HIGH')?.id || 'PRIORITY_URGENT';

    // 2. Ensure Default Destination exists
    const destDocs = await getDocuments<any>(DESTINATIONS_COLLECTION, [where('tenantId', '==', tenantId)]);
    let preferredDestinationId = 'DEST_DEFAULT';
    
    if (destDocs.length === 0) {
      await setDocument(DESTINATIONS_COLLECTION, 'DEST_DEFAULT', {
        tenantId,
        destinationCode: 'CH',
        destinationName: 'Chester Hub',
        status: 'active',
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        createdBy: 'SYSTEM_SEED',
        modifiedBy: 'SYSTEM_SEED'
      });
    } else {
      preferredDestinationId = destDocs[0].id;
    }

    // 3. Ensure Default Location exists
    const locDocs = await getDocuments<any>(LOCATIONS_COLLECTION, [where('tenantId', '==', tenantId), where('siteId', '==', siteId)]);
    let locationId = 'LOC_HB1';
    let locationCode = 'HB-01';
    
    if (locDocs.length === 0) {
      await setDocument(LOCATIONS_COLLECTION, 'LOC_HB1', {
        tenantId,
        siteId,
        storageAreaId: 'HB1',
        locationCode: 'HB-01',
        locationName: 'High Bay Bin 1',
        status: 'active',
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        createdBy: 'SYSTEM_SEED',
        modifiedBy: 'SYSTEM_SEED'
      });
    } else {
      locationId = locDocs[0].id;
      locationCode = locDocs[0].locationCode || 'HB-01';
    }

    // 4. Create 5 Diverse Test Products
    const testProducts = [
      { id: `${tenantId}_PRD_APP_01`, code: 'PRD-APP-01', desc: 'Apple Juice Premium 1L', min: 300, target: 500, max: 1000, currentStock: 100 }, // Below Control
      { id: `${tenantId}_PRD_ORG_02`, code: 'PRD-ORG-02', desc: 'Orange Juice Pulp Free 1L', min: 350, target: 600, max: 1200, currentStock: 400 }, // Below Target
      { id: `${tenantId}_PRD_CHY_03`, code: 'PRD-CHY-03', desc: 'Cherry Blossom Soda 330ml', min: 200, target: 600, max: 1000, currentStock: 800 }, // Above Target (At Target)
      { id: `${tenantId}_PRD_GNG_04`, code: 'PRD-GNG-04', desc: 'Ginger Beer Classic 330ml', min: 100, target: 400, max: 800, currentStock: 1500 }, // Above Maximum
      { id: `${tenantId}_PRD_LEM_05`, code: 'PRD-LEM-05', desc: 'Lemon Lime Sparkling 500ml', min: 200, target: 500, max: 1000, currentStock: 500 }, // At Target
    ];

    for (const prod of testProducts) {
      // Create Product
      await setDocument(PRODUCTS_COLLECTION, prod.id, {
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
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        createdBy: 'SYSTEM_SEED',
        modifiedBy: 'SYSTEM_SEED'
      });

      // Create Planning Rule
      await setDocument(PLANNING_RULES_COLLECTION, `${prod.id}_rule`, {
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
        effectiveFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Active since 30 days ago
        effectiveTo: null,
        untilSwitchedOff: true,
        notes: 'Seeded test planning rule',
        status: 'active',
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        createdBy: 'SYSTEM_SEED',
        modifiedBy: 'SYSTEM_SEED'
      });

      // Create Inventory Balance
      await setDocument(BALANCES_COLLECTION, `${prod.id}_balance`, {
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
        sourceUpdatedAt: new Date().toISOString(),
        status: 'active',
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        createdBy: 'SYSTEM_SEED',
        modifiedBy: 'SYSTEM_SEED'
      });
    }

    // 5. Create active promotion: Summer Refresh Special
    const promoId = `${tenantId}_PROMO_SUMMER`;
    await setDocument(PROMOTIONS_COLLECTION, promoId, {
      tenantId,
      promotionCode: 'SUMMER26',
      promotionName: 'Summer Refresh Special',
      description: 'Nationwide promotional uplift for key beverage SKUs during peak heat waves',
      importance: 'HIGH',
      promotionStatus: 'ACTIVE',
      startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // Started 5 days ago
      endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(), // Ends in 15 days
      preBuildStartDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
      runDownEndDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      notes: 'Summer promotion seeding',
      status: 'active',
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
      createdBy: 'SYSTEM_SEED',
      modifiedBy: 'SYSTEM_SEED'
    });

    // Link PRD-APP-01 (Apple Juice) and PRD-CHY-03 (Cherry Soda) to Summer promotion
    await setDocument(PROMOTION_RULES_COLLECTION, `${promoId}_PRD_APP_01`, {
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
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
      createdBy: 'SYSTEM_SEED',
      modifiedBy: 'SYSTEM_SEED'
    });

    await setDocument(PROMOTION_RULES_COLLECTION, `${promoId}_PRD_CHY_03`, {
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
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
      createdBy: 'SYSTEM_SEED',
      modifiedBy: 'SYSTEM_SEED'
    });

    // 6. Create production schedules for next few days
    const lines = ['LINE-01', 'LINE-02'];
    const activeImportId = 'import_seeded_system';
    
    // Seed some future production entries
    for (const [index, prod] of testProducts.entries()) {
      const entryId = `${tenantId}_PROD_ENTRY_${prod.code}`;
      const isScheduled = index % 2 === 0; // Alternating schedule to test different risks
      const lineId = lines[index % lines.length];
      
      await setDocument(PRODUCTION_ENTRIES_COLLECTION, entryId, {
        tenantId,
        siteId,
        activeImportId,
        productId: prod.id,
        productCodeSnapshot: prod.code,
        descriptionSnapshot: prod.desc,
        productionLineId: lineId,
        productionLineCodeSnapshot: lineId,
        productionDate: new Date(Date.now() + (index + 1) * 24 * 60 * 60 * 1000).toISOString(), // scheduled in 1 to 5 days
        plannedCases: 400,
        casesPerPallet: 100,
        plannedPallets: 4,
        sourceType: 'SAP_MPPS7',
        sourceSheetName: 'Seeded_Schedule',
        sourceRowNumber: index + 1,
        sourceUpdatedAt: new Date().toISOString(),
        planVersion: '1.0',
        status: isScheduled ? 'PLANNED' : 'RUNNING',
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        createdBy: 'SYSTEM_SEED',
        modifiedBy: 'SYSTEM_SEED'
      });
    }

    console.log('Seeded database records successfully!');

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

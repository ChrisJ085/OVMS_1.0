const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(/function buildDisplayPriorityDoc[\s\S]*?return projection;\n\}\n/g, '');

content = content.replace(
/await enqueueRecommendationJobServer\(\n\s*tx, db, {\n\s*tenantId: rec\.tenantId,\n\s*siteId: rec\.siteId,\n\s*triggerType: "MANUAL_RECALCULATION",\n\s*productIds: \[rec\.productId\],\n\s*uid\n\s*}\n\s*\);/g,
`await enqueueRecommendationJobServer(tx, db, {
              tenantId: rec.tenantId,
              siteId: rec.siteId,
              triggerType: "MANUAL_RECALCULATION",
              triggerReferenceId: null,
              productIds: [rec.productId],
              sourceInventorySnapshotId: null,
              sourceProductionPlanImportId: null,
              uid
            });`
);

fs.writeFileSync('server.ts', content);

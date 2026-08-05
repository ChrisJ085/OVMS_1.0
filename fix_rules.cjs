const fs = require('fs');

let content = fs.readFileSync('firestore.rules', 'utf8');

// Update inventorySnapshots to remove WAREHOUSE_OPERATOR and add Superuser
content = content.replace(
/match \/inventorySnapshots\/\{id\} \{\n\s*allow read: if hasAssignedSiteAccess\(resource\.data\.tenantId, getSiteId\(resource\)\) && getUserProfile\(\)\.role != 'DISPLAY';\n\s*allow create: if \(isTenantAdmin\(request\.resource\.data\.tenantId\) \|\| isWarehouseOperator\(request\.resource\.data\.tenantId\)\)\n\s*&& isAssignedToSite\(getSiteId\(request\.resource\)\);\n\s*allow update, delete: if false;\n\s*\}/g,
`match /inventorySnapshots/{id} {
      allow read: if hasAssignedSiteAccess(resource.data.tenantId, getSiteId(resource)) && getUserProfile().role != 'DISPLAY';
      allow create: if isSuperuser() || isTenantAdmin(request.resource.data.tenantId) || (isPlanner(request.resource.data.tenantId) && isAssignedToSite(getSiteId(request.resource)));
      allow update, delete: if false;
    }`
);

// Update currentRecommendations read access for DISPLAY role
content = content.replace(
/match \/currentRecommendations\/\{id\} \{\n\s*allow read: if hasAssignedSiteAccess\(resource\.data\.tenantId, getSiteId\(resource\)\);\n\s*allow create, update, delete: if false;\n\s*\}/g,
`match /currentRecommendations/{id} {
      allow read: if hasAssignedSiteAccess(resource.data.tenantId, getSiteId(resource)) && getUserProfile().role != 'DISPLAY';
      allow create, update, delete: if false;
    }`
);

fs.writeFileSync('firestore.rules', content);

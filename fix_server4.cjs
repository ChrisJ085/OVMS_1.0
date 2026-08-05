const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// 1. Remove duplicate imports
content = content.replace(/import { enqueueRecommendationJobServer } from "\.\/src\/server\/jobQueue(\.js)?";\n/g, '');
content = content.replace(/import { getCurrentRecommendationId, getEffectivePriorityId, buildDisplayPriorityDoc } from "\.\/src\/shared\/recommendationIdentifiers(\.js)?";\n/g, '');

const importAdd = `
import { enqueueRecommendationJobServer } from "./src/server/jobQueue";
import { getCurrentRecommendationId, getEffectivePriorityId, buildDisplayPriorityDoc } from "./src/shared/recommendationIdentifiers";
`;
content = content.replace('import crypto from "crypto";', 'import crypto from "crypto";\n' + importAdd);

// 2. Remove local buildDisplayPriorityDoc
content = content.replace(/function buildDisplayPriorityDoc[\s\S]*?return projection;\n\}\n/g, '');

// 3. Fix type errors on displayPriorityDoc._tags and .id
content = content.replace(/displayPriorityDoc\.id =/g, '(displayPriorityDoc as any).id =');
content = content.replace(/displayPriorityDoc\._tags =/g, '(displayPriorityDoc as any)._tags =');

// 4. Fix enqueueRecommendationJobServer call in /api/planning/recalculate-all (at line 1287 approx)
// The call looks like: 
// await enqueueRecommendationJobServer(
//   rec.tenantId,
//   rec.siteId,
//   "MANUAL_RECALCULATION",
//   [rec.productId],
//   uid
// );
content = content.replace(
/await enqueueRecommendationJobServer\(\s*rec\.tenantId,\s*rec\.siteId,\s*"MANUAL_RECALCULATION",\s*\[rec\.productId\],\s*uid\s*\);/g,
`await db.runTransaction(async (tx: any) => {
          return await enqueueRecommendationJobServer(
            tx, db, {
              tenantId: rec.tenantId,
              siteId: rec.siteId,
              triggerType: "MANUAL_RECALCULATION",
              productIds: [rec.productId],
              uid
            }
          );
        });`
);

fs.writeFileSync('server.ts', content);

const fs = require('fs');
let code = fs.readFileSync('src/features/planning/services/recommendationService.ts', 'utf8');

// Remove userId parameters
code = code.replace(/,\s*userId:\s*string\s*=\s*'planner-user'/g, '');

// Clean imports
const badImports = [
  "import { collection, query, where, getDocs, Timestamp, writeBatch, doc, setDoc, updateDoc } from 'firebase/firestore';",
  "import { evaluateDecision, ENGINE_VERSION } from './decisionEngine';",
  "import { getProductInventory } from '../../inventory/services/inventoryService';",
  "import { getProductPlanningRule } from './planningRuleService';",
  "import { getProductProductionContext } from './productionService';",
  "import { withPhase } from './promotionService';",
  "import { PromotionProductRule, Promotion } from '../../../types/promotion';",
  "import { getProduct, getAllProducts } from '../../inventory/services/productService';",
  "import { getDecisionConfiguration } from './decisionConfigurationService';",
  "import { buildDisplayPriorityDoc } from '../../operations/services/priorityService';",
];

for (const imp of badImports) {
  code = code.replace(imp + "\n", "");
}

code = code.replace("import { collection, query, where, getDocs, Timestamp, writeBatch, doc, setDoc, updateDoc } from 'firebase/firestore';", "import { Timestamp } from 'firebase/firestore';");


const unusedConstants = [
  "const RECOMMENDATIONS_COLLECTION = 'recommendations';",
  "const JOBS_COLLECTION = 'recommendationGenerationJobs';",
  "const PRIORITIES_COLLECTION = 'priorities';",
  "const DISPLAY_PRIORITIES_COLLECTION = 'displayPriorities';"
];
for (const c of unusedConstants) {
  code = code.replace(c + "\n", "");
}

fs.writeFileSync('src/features/planning/services/recommendationService.ts', code);
console.log("Updated recommendationService.ts successfully");

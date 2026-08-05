const fs = require('fs');

let detailPage = fs.readFileSync('src/features/planning/pages/RecommendationDetailPage.tsx', 'utf8');
detailPage = detailPage.replace(/,\s*(userProfile\?\.displayName \|\| userProfile\?\.email \|\| 'Planner')/g, '');
fs.writeFileSync('src/features/planning/pages/RecommendationDetailPage.tsx', detailPage);

let workspacePage = fs.readFileSync('src/features/planning/pages/RecommendationsWorkspacePage.tsx', 'utf8');
workspacePage = workspacePage.replace(/,\s*(userProfile\?\.displayName \|\| userProfile\?\.email \|\| 'Planner')/g, '');
fs.writeFileSync('src/features/planning/pages/RecommendationsWorkspacePage.tsx', workspacePage);

let recService = fs.readFileSync('src/features/planning/services/recommendationService.ts', 'utf8');
if(!recService.includes("import { ENGINE_VERSION }")) {
   recService = "import { Timestamp } from 'firebase/firestore';\nimport { ENGINE_VERSION } from './decisionEngine';\n" + recService.replace("import { Timestamp } from 'firebase/firestore';", "");
}
fs.writeFileSync('src/features/planning/services/recommendationService.ts', recService);

console.log("Fixed typechecks 2");

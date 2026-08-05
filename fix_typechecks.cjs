const fs = require('fs');

let recService = fs.readFileSync('src/features/planning/services/recommendationService.ts', 'utf8');
recService = recService.replace("import { Timestamp } from 'firebase/firestore';", "import { Timestamp } from 'firebase/firestore';\nimport { ENGINE_VERSION } from './decisionEngine';");
fs.writeFileSync('src/features/planning/services/recommendationService.ts', recService);

let detailPage = fs.readFileSync('src/features/planning/pages/RecommendationDetailPage.tsx', 'utf8');
detailPage = detailPage.replace(/, user\?.uid \|\| 'test-user'/g, '');
fs.writeFileSync('src/features/planning/pages/RecommendationDetailPage.tsx', detailPage);

let workspacePage = fs.readFileSync('src/features/planning/pages/RecommendationsWorkspacePage.tsx', 'utf8');
workspacePage = workspacePage.replace(/, user\?.uid \|\| 'test-user'/g, '');
fs.writeFileSync('src/features/planning/pages/RecommendationsWorkspacePage.tsx', workspacePage);
console.log("Fixed typechecks");

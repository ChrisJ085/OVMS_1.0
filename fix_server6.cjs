const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

// Use a better regex to delete the local buildDisplayPriorityDoc function
content = content.replace(/function buildDisplayPriorityDoc[\s\S]*?untilSwitchedOff: p\.untilSwitchedOff \|\| false,\n\s*modifiedDate: p\.modifiedDate \|\| FieldValue\.serverTimestamp\(\)\n\s*};\n\}\n/g, '');

fs.writeFileSync('server.ts', content);

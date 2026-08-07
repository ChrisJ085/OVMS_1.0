const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');
rules = rules.replace(
  "return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;",
  "return (request.auth != null && request.auth.uid != null) ? get(/databases/$(database)/documents/users/$(request.auth.uid)).data : null;"
);
fs.writeFileSync('firestore.rules', rules);

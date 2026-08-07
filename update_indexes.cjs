const fs = require('fs');
let data = JSON.parse(fs.readFileSync('firestore.indexes.json', 'utf8'));

data.indexes.push({
  collectionGroup: 'products',
  queryScope: 'COLLECTION',
  fields: [
    { fieldPath: 'tenantId', order: 'ASCENDING' },
    { fieldPath: 'status', order: 'ASCENDING' }
  ]
});

data.indexes.push({
  collectionGroup: 'users',
  queryScope: 'COLLECTION',
  fields: [
    { fieldPath: 'tenantId', order: 'ASCENDING' },
    { fieldPath: 'role', order: 'ASCENDING' }
  ]
});

fs.writeFileSync('firestore.indexes.json', JSON.stringify(data, null, 2));

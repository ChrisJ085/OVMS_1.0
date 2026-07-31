const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'ovms-ad209' });
const db = admin.firestore();

async function run() {
  const snap = await db.collection('sites').get();
  snap.forEach(doc => console.log(doc.id, doc.data()));
}
run();

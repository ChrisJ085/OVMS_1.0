const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: 'ovms-ad209' });
const db = getFirestore();

async function run() {
  const snap = await db.collection('sites').get();
  snap.forEach(doc => console.log(doc.id, doc.data()));
  console.log("LOCATIONS:");
  const locSnap = await db.collection('locations').get();
  locSnap.forEach(doc => console.log(doc.id, doc.data()));
}
run();

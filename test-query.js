import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBi4tywQk5WaNIvalD3uSrz4Au7WxolJlM",
  authDomain: "ovms-ad209.firebaseapp.com",
  projectId: "ovms-ad209"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const snap = await getDocs(collection(db, 'sites'));
  snap.forEach(doc => console.log(doc.id, doc.data()));
}
run();

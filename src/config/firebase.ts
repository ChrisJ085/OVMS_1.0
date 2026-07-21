import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBi4tywQk5WaNIvalD3uSrz4Au7WxolJlM",
  authDomain: "ovms-ad209.firebaseapp.com",
  projectId: "ovms-ad209",
  storageBucket: "ovms-ad209.firebasestorage.app",
  messagingSenderId: "806454808042",
  appId: "1:806454808042:web:0aa3de67a2f584c845b693",
  measurementId: "G-YHR97CH2TR"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const isFirebaseConfigured = true;

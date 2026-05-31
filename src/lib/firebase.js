import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB8yu9us_g5sVBdSBZzdTQuxLRsAehrD2Y",
  authDomain: "predict2026-f98e8.firebaseapp.com",
  projectId: "predict2026-f98e8",
  storageBucket: "predict2026-f98e8.firebasestorage.app",
  messagingSenderId: "586055181479",
  appId: "1:586055181479:web:3c932c3dd330bf2d4ee782",
  measurementId: "G-9ZZWETKQ4W"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

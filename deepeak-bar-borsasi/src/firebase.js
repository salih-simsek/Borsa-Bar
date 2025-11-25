import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAZyC5QFlk3gXKou7s371s3aNRCTMD-Mgc",
  authDomain: "deepeak-35.firebaseapp.com",
  projectId: "deepeak-35",
  storageBucket: "deepeak-35.firebasestorage.app",
  messagingSenderId: "1011278856624",
  appId: "1:1011278856624:web:2dc7baaf5506c5327f9675",
  measurementId: "G-MES7GNPJPT"
};

// App'i başlat
export const app = initializeApp(firebaseConfig); // <-- BAŞINA 'export' EKLEDİK

// Servisleri dışa aktar
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const auth = getAuth(app);
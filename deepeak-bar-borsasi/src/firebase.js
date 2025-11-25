import { initializeApp } from "firebase/app";
// DİKKAT: 'getFirestore' kaldırıldı, yerine 'initializeFirestore' kullanıyoruz
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
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

// 1. Uygulamayı Başlat (Dışa aktarmayı unutma)
export const app = initializeApp(firebaseConfig);

// 2. Veritabanını OFFLINE PERSISTENCE (Çevrimdışı Kayıt) ile Başlat
// Bu ayar sayesinde internet kopsa bile siparişler kaybolmaz, internet gelince gönderilir.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// 3. Auth servisini başlat
export const auth = getAuth(app);

// Realtime Database (rtdb) şu an kullanmıyoruz ama ileride lazım olursa diye dursun istersen
// import { getDatabase } from "firebase/database";
// export const rtdb = getDatabase(app);
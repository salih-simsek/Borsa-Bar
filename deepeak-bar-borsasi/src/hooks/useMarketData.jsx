import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { db, rtdb } from '../firebase';

const useMarketData = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Önce Firestore'dan ürünlerin "Kimlik Kartlarını" (Statik Veri) çekelim
    const productsRef = collection(db, 'products');
    
    // onSnapshot: Firestore'da yeni ürün eklenirse anında haberi olur
    const unsubscribeFirestore = onSnapshot(productsRef, (snapshot) => {
      const staticData = {};
      snapshot.forEach(doc => {
        staticData[doc.id] = { id: doc.id, ...doc.data() };
      });

      // 2. Şimdi Realtime DB'den "Canlı Fiyatları" dinleyelim
      const liveRef = ref(rtdb, 'live_market/products');
      
      const unsubscribeRTDB = onValue(liveRef, (rtSnapshot) => {
        const liveData = rtSnapshot.val() || {};
        
        // 3. İki veriyi birleştir (Merge)
        const mergedList = Object.keys(staticData).map(id => {
          const staticItem = staticData[id];
          const liveItem = liveData[id] || {}; // Eğer canlı veri yoksa boş obje
          
          return {
            ...staticItem,
            // Canlı fiyat varsa onu kullan, yoksa başlangıç fiyatını kullan
            price: liveItem.price !== undefined ? liveItem.price : staticItem.startPrice,
            stock: liveItem.stock !== undefined ? liveItem.stock : staticItem.stock,
            trend: liveItem.trend || 'STABLE', // UP, DOWN, STABLE
            isSpotlight: liveItem.isSpotlight || false
          };
        });

        // Ürünleri ismine göre veya ID'ye göre sıralayabiliriz
        mergedList.sort((a, b) => a.name.localeCompare(b.name));
        
        setProducts(mergedList);
        setLoading(false);
      });

      return () => {
        unsubscribeRTDB(); // Temizlik
      };
    });

    return () => unsubscribeFirestore(); // Temizlik
  }, []);

  return { products, loading };
};

export default useMarketData;
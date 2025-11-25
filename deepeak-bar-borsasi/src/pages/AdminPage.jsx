import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  increment,
  setDoc,
  query,
  orderBy,
  limit,
  getDocs,
  getDoc
} from 'firebase/firestore';
import {
  ShoppingCart,
  Package,
  BarChart3,
  Settings,
  Dices,
  AlertTriangle,
  LogOut,
  Check,
  Banknote,
  CreditCard,
  Plus,
  Trash,
  Pencil,
  X,
  Upload,
  History,
  Archive,
  XCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAuth } from 'firebase/auth';

/**
 * --- YARDIMCI FONKSİYONLAR (Arkadaşının Kodu) ---
 * Fiyatları 10'un katlarına yuvarlar ve min-max sınırında tutar.
 */
const normalizePrice = (base, min, max) => {
  let raw = Math.round(base);
  let ones = raw % 10;
  if (ones < 0) ones += 10;

  let rounded;
  if (ones === 0) {
    rounded = raw;
  } else if (ones <= 4) {
    rounded = raw - ones; // Aşağı yuvarla
  } else {
    rounded = raw + (10 - ones); // Yukarı yuvarla
  }

  // Sınırları koru
  if (rounded < min) { rounded = min; raw = min; }
  if (rounded > max) { rounded = max; raw = max; }

  return { rawPrice: raw, price: rounded };
};

/**
 * Satış sonrası yeni fiyatı hesaplar.
 */
const computePriceAfterPurchase = (product, qty) => {
  const min = Number(product.min) || 0;
  const max = Number(product.max) || 10000;
  // Geriye dönük uyumluluk için rawPrice yoksa price kullanılır
  let raw = product.rawPrice ?? product.price;

  const newRaw = raw + qty; // Her satışta fiyatı ham olarak artır
  const norm = normalizePrice(newRaw, min, max);

  const itemTotal = norm.price * qty;
  return {
    newRawPrice: norm.rawPrice,
    newPrice: norm.price,
    itemTotal
  };
};

const AdminPage = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  
  // --- STATE YÖNETİMİ ---
  const [activeTab, setActiveTab] = useState('pos');
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  
  // Modallar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  // Sistem Durumu
  const [simActive, setSimActive] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState({ show: false, method: '' });
  const [crashUntil, setCrashUntil] = useState(null); // Crash süresi takibi
  
  // İstatistikler
  const [dailyStats, setDailyStats] = useState({ revenue: 0, count: 0 });
  const [salesHistory, setSalesHistory] = useState([]);
  const [archivedReports, setArchivedReports] = useState([]);

  // Form State
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    price: '',
    min: '',
    max: '',
    type: 'LOW',
    stock: 50,
    image: ''
  });

  // --- FIREBASE DİNLEYİCİLERİ ---

  // 1. Ürünleri Getir
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snap) => {
      const pList = [];
      snap.forEach((d) => pList.push({ id: d.id, ...d.data() }));
      setProducts(pList);
    });
    return () => unsub();
  }, []);

  // 2. Günlük Rapor ve Satış Akışını Getir
  useEffect(() => {
    // Günlük Özet
    const unsubReport = onSnapshot(doc(db, 'daily_reports', 'today'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setDailyStats({ revenue: data.totalRevenue || 0, count: data.totalCount || 0 });
      }
    });

    // Canlı Satış Akışı
    const q = query(collection(db, "sales_history"), orderBy("date", "desc"), limit(20));
    const unsubSales = onSnapshot(q, (snapshot) => {
        const sales = [];
        snapshot.forEach(doc => sales.push({ id: doc.id, ...doc.data() }));
        setSalesHistory(sales);
    });

    return () => { unsubReport(); unsubSales(); };
  }, []);

  // 3. OTO PİYASA (Fiyat Düşüş Mantığı - Arkadaşının Kodu)
  // Her 60 saniyede bir, son 1 dakikadır satılmayan ürünlerin fiyatını 1 birim düşürür.
  useEffect(() => {
    if (!simActive || products.length === 0) return;

    const ONE_MINUTE = 60 * 1000;
    const intervalId = setInterval(async () => {
      const now = Date.now();

      // Eğer crash modu aktifse fiyat düşürme
      if (crashUntil && now < crashUntil) return;

      const batch = writeBatch(db);
      let hasUpdates = false;

      products.forEach((p) => {
        const rawBase = p.rawPrice ?? p.price ?? 0;
        const min = p.min ?? 0;
        const max = p.max ?? 10000;

        if (rawBase <= min) return; // Zaten dipteyse elleme

        const lastTrade = p.lastTradeAt ?? 0;
        const diff = now - lastTrade;

        // 1 dakikadır satış yoksa düşür
        if (diff >= ONE_MINUTE) {
          const newRaw = rawBase - 1;
          const norm = normalizePrice(newRaw, min, max);

          const pRef = doc(db, 'products', p.id);
          batch.update(pRef, {
            rawPrice: norm.rawPrice,
            price: norm.price
            // lastTradeAt'i güncellemiyoruz ki düşmeye devam etsin
          });
          hasUpdates = true;
        }
      });

      if (hasUpdates) {
        try { await batch.commit(); } catch (e) { console.error(e); }
      }
    }, ONE_MINUTE);

    return () => clearInterval(intervalId);
  }, [products, simActive, crashUntil]);


  // --- FONKSİYONLAR ---

  // ÇIKIŞ
  const handleLogout = async () => {
    if (window.confirm('Çıkış yapmak istiyor musunuz?')) {
      await auth.signOut();
      navigate('/login');
    }
  };

  // RESİM YÜKLEME
  const handleImageUpload = (e, field = 'image') => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2048576) return alert("Dosya boyutu çok büyük! (Max 2MB)");

    const reader = new FileReader();
    reader.onloadend = () => {
        if (field === 'logo') {
            updateSystemLogo(reader.result);
        } else {
            setFormData({ ...formData, image: reader.result });
        }
    };
    reader.readAsDataURL(file);
  };

  const updateSystemLogo = async (base64String) => {
      await setDoc(doc(db, "system_data", "settings"), { logo: base64String }, { merge: true });
      alert("Logo güncellendi!");
      setIsSettingsOpen(false);
  };

  // SEPET İŞLEMLERİ
  const addToCart = (product) => {
    if (product.stock <= 0) return alert('Stok Yok!');
    const exist = cart.find((c) => c.id === product.id);
    if (exist) {
      if (exist.qty >= product.stock) return alert('Yetersiz Stok');
      setCart(cart.map((c) => (c.id === product.id ? { ...c, qty: c.qty + 1 } : c)));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };

  const removeFromCart = (idx) => {
    setCart(cart.filter((_, i) => i !== idx));
  };

  // ÖDEME VE FİYAT ARTIŞI (Gelişmiş Algoritma)
  const processPayment = async (method) => {
    if (cart.length === 0) return alert('Sepet Boş');

    const batch = writeBatch(db);
    let totalAmount = 0;
    let totalQty = 0;
    
    // En çok satılanı bul (Ticker için)
    let topItem = cart.reduce((prev, current) => (prev.qty > current.qty) ? prev : current);

    cart.forEach((item) => {
      const pRef = doc(db, 'products', item.id);
      const currentP = products.find((p) => p.id === item.id);
      if (!currentP) return;

      // Stok düş
      const newStock = Math.max(0, Number(currentP.stock || 0) - item.qty);

      // Fiyat Hesapla (Arkadaşının algoritması)
      const { newRawPrice, newPrice, itemTotal } = computePriceAfterPurchase(currentP, item.qty);

      totalAmount += itemTotal;
      totalQty += item.qty;

      batch.update(pRef, {
        stock: newStock,
        rawPrice: newRawPrice,
        price: newPrice,
        lastTradeAt: Date.now() // Satış zamanını kaydet (Oto düşüşü sıfırlar)
      });
    });

    // Ticker Güncelle
    batch.set(doc(db, 'system_data', 'commands'), {
      type: 'TICKER_UPDATE',
      data: `🔥 SON DAKİKA: ${topItem.name} KAPIŞ KAPIŞ GİDİYOR!`,
      timestamp: Date.now()
    });

    // Günlük Rapor
    batch.set(doc(db, 'daily_reports', 'today'), {
      totalRevenue: increment(totalAmount),
      totalCount: increment(totalQty)
    }, { merge: true });

    // Satış Geçmişi
    const historyRef = doc(collection(db, "sales_history"));
    batch.set(historyRef, {
        date: new Date().toISOString(),
        items: cart,
        total: totalAmount,
        method: method
    });

    try {
      await batch.commit();
      setCart([]);
      setPaymentSuccess({ show: true, method });
      setTimeout(() => setPaymentSuccess({ show: false, method: '' }), 2000);
    } catch (err) {
      console.error('Ödeme hatası:', err);
      alert('Hata oluştu: ' + err.message);
    }
  };

  // CRASH (Gelişmiş Versiyon)
  const handleCrashStart = async () => {
    if (!window.confirm('DİKKAT! Tüm fiyatlar minimum seviyeye çekilsin mi?')) return;

    try {
      const now = Date.now();
      const crashEnd = now + 5 * 60 * 1000; // 5 dakika

      const batch = writeBatch(db);

      products.forEach((p) => {
        const min = Number(p.min) || 0;
        const max = Number(p.max) || 10000;
        
        // Minimuma çek ve normalize et
        const norm = normalizePrice(min, min, max);

        const pRef = doc(db, 'products', p.id);
        batch.update(pRef, {
          rawPrice: norm.rawPrice,
          price: norm.price,
          lastTradeAt: now
        });
      });

      // Komut Gönder
      const cmdRef = doc(db, 'system_data', 'commands');
      batch.set(cmdRef, { type: 'CRASH_START', timestamp: now, crashEnd });

      await batch.commit();
      setCrashUntil(crashEnd);
      alert('CRASH BAŞLATILDI! Fiyatlar tabana indi.');
    } catch (err) {
      console.error(err);
      alert('Hata: ' + err.message);
    }
  };

  // RULET
  const triggerRoulette = async () => {
      const available = products.filter(p => p.stock > 0);
      if (available.length === 0) return alert("Stokta ürün yok!");
      
      const winner = available[Math.floor(Math.random() * available.length)];
      
      if(!confirm(`Şanslı ürün: "${winner.name}". Fiyatı ${winner.min}₺ (DİP) olacak. Onaylıyor musunuz?`)) return;

      await setDoc(doc(db, "system_data", "commands"), { 
          type: 'ROULETTE_START', 
          winnerId: winner.id,
          timestamp: Date.now() 
      });

      // 5 saniye animasyon bekle sonra fiyatı düşür
      setTimeout(async () => {
          await updateDoc(doc(db, "products", winner.id), { price: winner.min, rawPrice: winner.min });
          
          await setDoc(doc(db, "system_data", "commands"), { 
              type: 'TICKER_UPDATE', 
              data: `🎉 FIRSAT: ${winner.name} 5 DAKİKA BOYUNCA DİP FİYAT! 🎉`, 
              timestamp: Date.now() 
          });
      }, 5000);

      alert(`${winner.name} 5 dakika boyunca dip fiyatta kalacak.`);
      
      // 5 dk sonra eski haline getirmek için (Basit çözüm, sunucu tarafında yapmak daha iyidir ama bu da çalışır)
      setTimeout(async () => {
          await updateDoc(doc(db, "products", winner.id), { price: winner.startPrice, rawPrice: winner.startPrice });
      }, 5 * 60 * 1000);
  };

  // FİYATLARI SIFIRLA
  const resetAllPricesToStart = async () => {
    if (!window.confirm('Tüm ürün fiyatlarını BAŞLANGIÇ değerine sıfırlamak istiyor musunuz?')) return;

    try {
      const batch = writeBatch(db);
      products.forEach((p) => {
        const base = p.startPrice || 0;
        const norm = normalizePrice(base, p.min || 0, p.max || 10000);
        
        batch.update(doc(db, 'products', p.id), {
          rawPrice: norm.rawPrice,
          price: norm.price
        });
      });
      await batch.commit();
      alert('Tüm fiyatlar sıfırlandı.');
    } catch (err) {
      console.error(err);
    }
  };

  // RAPORLAMA VE ARŞİV
  const endOfDay = async () => {
      if(!confirm("Günü sonlandırıp raporu arşivlemek ve LİSTEYİ TEMİZLEMEK istiyor musunuz?")) return;

      try {
          const todaySnap = await getDoc(doc(db, "daily_reports", "today"));
          if(todaySnap.exists()) {
              const data = todaySnap.data();
              await addDoc(collection(db, "reports_archive"), {
                  date: new Date().toISOString(),
                  revenue: data.totalRevenue,
                  count: data.totalCount
              });
          }
          
          await setDoc(doc(db, "daily_reports", "today"), { totalRevenue: 0, totalCount: 0 });
          
          const q = query(collection(db, "sales_history"), limit(500));
          const snapshot = await getDocs(q);
          const batch = writeBatch(db);
          snapshot.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();

          alert("Gün sonlandırıldı ve temizlendi.");
      } catch (error) {
          alert("Hata: " + error.message);
      }
  };

  const fetchHistory = async () => {
      setIsHistoryOpen(true);
      const q = query(collection(db, "reports_archive"), orderBy("date", "desc"), limit(20));
      const snap = await getDocs(q);
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setArchivedReports(list);
  };

  const deleteArchive = async (id) => {
      if(confirm("Silmek istiyor musunuz?")) {
          await deleteDoc(doc(db, "reports_archive", id));
          setArchivedReports(archivedReports.filter(r => r.id !== id));
      }
  };

  // ÜRÜN YÖNETİMİ (EKLE/DÜZENLE)
  const handleProductSubmit = async (e) => {
    e.preventDefault();
    try {
      const basePrice = Number(formData.price);
      const min = Number(formData.min);
      const max = Number(formData.max);
      const stock = Number(formData.stock);

      // Fiyatı kurallara uygun hale getir
      const norm = normalizePrice(basePrice, min, max);

      const data = {
        name: formData.name,
        startPrice: norm.price,
        rawPrice: norm.rawPrice, // Ham fiyatı da sakla
        price: norm.price,       // Görünen fiyat
        min,
        max,
        stock,
        type: formData.type,
        image: formData.image || 'https://via.placeholder.com/150'
      };

      if (formData.id) {
        await updateDoc(doc(db, 'products', formData.id), data);
      } else {
        await addDoc(collection(db, 'products'), data);
      }
      setIsModalOpen(false);
      setFormData({ id: '', name: '', price: '', min: '', max: '', type: 'LOW', stock: 50, image: '' });
    } catch (err) {
      alert('Hata: ' + err.message);
    }
  };

  const editProduct = (p) => {
    setFormData({
      id: p.id,
      name: p.name,
      price: p.rawPrice ?? p.price, // Ham fiyatı göster ki düzenlemesi kolay olsun
      min: p.min,
      max: p.max,
      type: p.type,
      stock: p.stock,
      image: p.image
    });
    setIsModalOpen(true);
  };

  const deleteProduct = async (id) => {
    if (confirm('Silmek istediğinize emin misiniz?')) {
        try { await deleteDoc(doc(db, 'products', id)); } catch (err) { console.error(err); }
    }
  };

  // Sepet Toplamı (Yeni fiyata göre hesapla)
  const cartTotal = cart.reduce((acc, item) => {
    const currentP = products.find((p) => p.id === item.id);
    if (!currentP) return acc;
    const { itemTotal } = computePriceAfterPurchase(currentP, item.qty);
    return acc + itemTotal;
  }, 0);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f1115] text-white font-sans">
        
        {/* SIDEBAR */}
        <aside className="w-64 bg-[#14161b] border-r border-gray-800 flex flex-col shrink-0">
            <div className="p-6 flex flex-col gap-2">
                <img src="/deepeak_ana_logo.png" className="h-20 object-contain w-auto mb-2" alt="Deepeak Logo" />
                <p className="text-[10px] text-gray-600 font-mono tracking-widest uppercase ml-1">Yönetim Paneli v7.6</p>
            </div>

            <nav className="flex-1 px-4 space-y-2 mt-4">
                <div onClick={() => setActiveTab('pos')} className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${activeTab === 'pos' ? 'bg-[#FF3D00]/15 text-[#FFB300] border-l-4 border-[#FF3D00]' : 'text-gray-400 hover:bg-gray-800'}`}>
                    <ShoppingCart className="w-5 h-5 mr-3" /> Kasa / Satış
                </div>
                <div onClick={() => setActiveTab('products')} className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${activeTab === 'products' ? 'bg-[#FF3D00]/15 text-[#FFB300] border-l-4 border-[#FF3D00]' : 'text-gray-400 hover:bg-gray-800'}`}>
                    <Package className="w-5 h-5 mr-3" /> Ürün & Stok
                </div>
                <div onClick={() => setActiveTab('reports')} className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${activeTab === 'reports' ? 'bg-[#FF3D00]/15 text-[#FFB300] border-l-4 border-[#FF3D00]' : 'text-gray-400 hover:bg-gray-800'}`}>
                    <BarChart3 className="w-5 h-5 mr-3" /> Raporlar
                </div>
            </nav>
            
            <div className="p-4 border-t border-gray-800 space-y-3">
                <div className="text-xs font-bold text-gray-500 uppercase">Sistem</div>
                <button onClick={() => setIsSettingsOpen(true)} className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 p-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition">
                  <Settings className="w-4 h-4" /> Logo Ayarları
                </button>
                <button onClick={triggerRoulette} className="w-full bg-[#FFB300]/20 hover:bg-[#FFB300]/40 text-[#FFB300] border border-[#FFB300] p-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition">
                  <Dices className="w-4 h-4" /> ŞANSLI ÜRÜN
                </button>
                <div className="flex items-center justify-between bg-gray-800 p-3 rounded-lg border border-gray-700">
                    <span className="text-sm text-gray-300">Oto. Piyasa</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={simActive} onChange={() => setSimActive(!simActive)} />
                        <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#10b981]"></div>
                    </label>
                </div>
                <button onClick={handleCrashStart} className="w-full bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700 p-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition">
                  <AlertTriangle className="w-4 h-4" /> CRASH BAŞLAT
                </button>
            </div>
            <div className="p-4 bg-[#0f1115] border-t border-gray-800">
                <button onClick={handleLogout} className="flex items-center justify-center w-full p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition text-sm">
                  <LogOut className="w-4 h-4 mr-2" /> Çıkış
                </button>
            </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 relative overflow-hidden flex flex-col">
            
            {/* 1. POS EKRANI */}
            {activeTab === 'pos' && (
              <div className="h-full flex w-full">
                  <div className="flex-1 p-6 overflow-y-auto">
                      <h2 className="text-3xl font-bold mb-6 text-white tracking-wide">Satış</h2>
                      <div className="grid grid-cols-3 xl:grid-cols-4 gap-4">
                          {products.map(p => {
                             const isOut = p.stock <= 0;
                             return (
                               <div key={p.id} onClick={() => addToCart(p)} className={`bg-[#1a1d24] p-4 rounded-xl border cursor-pointer hover:border-[#FF3D00] transition group relative overflow-hidden shadow-lg ${isOut ? 'opacity-50 grayscale pointer-events-none border-[#FF3D00]' : 'border-gray-800'}`}>
                                   <div className="h-24 w-full bg-gray-800 rounded-lg mb-3 overflow-hidden">
                                       {p.image ? <img src={p.image} className="w-full h-full object-cover opacity-70 group-hover:opacity-100" /> : <div className="flex items-center justify-center h-full text-gray-600"><Package/></div>}
                                   </div>
                                   <div className="font-bold truncate text-sm text-gray-200">{p.name}</div>
                                   <div className="flex justify-between items-center mt-2">
                                       <div className="text-white font-mono font-bold text-2xl">{p.price}₺</div>
                                       <div className={`text-xs ${p.stock < 10 ? 'text-[#FFB300]' : 'text-gray-400'}`}>{isOut ? 'TÜKENDİ' : `Stok: ${p.stock}`}</div>
                                   </div>
                               </div>
                             )
                          })}
                      </div>
                  </div>
                  <div className="w-96 bg-[#1a1d24] border-l border-gray-800 flex flex-col h-full shrink-0 relative">
                      <div className="p-4 border-b border-gray-800"><h3 className="font-bold text-lg">Sepet</h3></div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-2 relative">
                          {cart.length === 0 ? <div className="text-gray-500 text-center mt-10">Sepet Boş</div> : 
                             cart.map((item, idx) => (
                               <div key={idx} className="flex justify-between items-center bg-[#14161b] p-3 rounded border border-gray-800 mb-2">
                                  <div><div className="font-bold text-sm text-gray-200">{item.name}</div><div className="text-xs text-gray-500">{item.price}₺ x {item.qty}</div></div>
                                  <div className="flex items-center gap-3">
                                      {/* Gelişmiş Fiyat Hesaplaması Gösterimi */}
                                      <span className="font-mono font-bold text-[#FFB300]">
                                          {(() => {
                                              const currentP = products.find(p => p.id === item.id);
                                              if(!currentP) return "0₺";
                                              const { itemTotal } = computePriceAfterPurchase(currentP, item.qty);
                                              return `${itemTotal}₺`;
                                          })()}
                                      </span>
                                      <button onClick={() => removeFromCart(idx)} className="text-red-500"><Trash className="w-4 h-4"/></button>
                                  </div>
                               </div>
                             ))
                          }
                          {paymentSuccess.show && (
                            <div className="absolute inset-0 bg-[#1a1d24]/95 backdrop-blur-sm flex flex-col items-center justify-center z-10 toast-enter">
                                <div className="bg-green-500/20 p-4 rounded-full mb-3 border border-green-500"><Check className="w-10 h-10 text-green-500"/></div>
                                <h4 className="text-xl font-bold text-white">Ödeme Başarılı</h4>
                                <p className="text-sm text-gray-400 mt-1">{paymentSuccess.method === 'cash' ? 'Nakit' : 'Kart'}</p>
                            </div>
                          )}
                      </div>
                      <div className="p-6 bg-[#14161b] border-t border-gray-800">
                          <div className="flex justify-between mb-4 text-xl font-bold"><span>TOPLAM</span><span className="text-[#FFB300]">{cartTotal}₺</span></div>
                          <div className="grid grid-cols-2 gap-3">
                              <button onClick={() => processPayment('cash')} className="bg-[#10b981] hover:bg-green-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition shadow-lg"><Banknote className="w-5 h-5"/> NAKİT</button>
                              <button onClick={() => processPayment('credit')} className="bg-[#3b82f6] hover:bg-blue-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition shadow-lg"><CreditCard className="w-5 h-5"/> KART</button>
                          </div>
                      </div>
                  </div>
              </div>
            )}

            {/* 2. ÜRÜN YÖNETİMİ */}
            {activeTab === 'products' && (
              <div className="h-full p-8 overflow-y-auto w-full">
                  <div className="flex justify-between items-center mb-8">
                      <h2 className="text-2xl font-bold">Ürün Listesi & Stok</h2>
                      <button onClick={() => setIsModalOpen(true)} className="bg-[#FF3D00] hover:bg-red-600 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition"><Plus className="w-4 h-4"/> Yeni Ürün Ekle</button>
                  </div>
                  <div className="bg-[#1a1d24] rounded-xl border border-gray-800 overflow-hidden">
                      <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-gray-800 text-gray-200 uppercase">
                            <tr>
                                <th className="p-4">Ürün Adı</th>
                                <th className="p-4">Fiyat</th>
                                <th className="p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <span>Stok</span>
                                        <button onClick={resetAllPricesToStart} className="text-[11px] bg-gray-800 hover:bg-gray-700 border border-gray-600 px-2 py-1 rounded-md text-gray-200">Fiyatları Sıfırla</button>
                                    </div>
                                </th>
                                <th className="p-4 text-right">İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                          {products.map(p => (
                            <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                               <td className="p-4 flex items-center gap-3"><img src={p.image} className="w-10 h-10 rounded object-cover bg-gray-700" onError={(e)=>e.target.style.display='none'}/><div><div className="font-bold text-gray-200">{p.name}</div><div className="text-xs text-gray-500">Başlangıç: {p.startPrice}₺</div></div></td>
                               <td className="p-4 font-mono text-[#ffffff] font-bold">{p.price}₺ <span className="text-xs text-gray-500 font-normal">({p.min}-{p.max})</span></td>
                               <td className={`p-4 font-bold ${p.stock < 10 ? 'text-[#FFB300]' : 'text-[#10b981]'}`}>{p.stock} Adet</td>
                               <td className="p-4 text-right"><button onClick={() => editProduct(p)} className="text-blue-500 mr-2"><Pencil className="w-4 h-4"/></button><button onClick={() => deleteProduct(p.id)} className="text-red-500"><Trash className="w-4 h-4"/></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                  </div>
              </div>
            )}

            {/* 3. RAPORLAR */}
            {activeTab === 'reports' && (
               <div className="h-full p-8 overflow-y-auto">
                   <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold">Gün Sonu Raporu</h2>
                        <div className="flex gap-2">
                             <button onClick={fetchHistory} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"><History className="w-4 h-4"/> Geçmiş Arşiv</button>
                             <button onClick={endOfDay} className="bg-red-900 hover:bg-red-800 text-red-100 border border-red-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"><Archive className="w-4 h-4"/> Günü Bitir & Temizle</button>
                        </div>
                   </div>
                   <div className="grid grid-cols-2 gap-6 mb-8">
                      <div className="bg-[#1a1d24] p-6 rounded-xl border border-gray-800">
                          <div className="text-gray-500 text-sm mb-1">Günlük Toplam Ciro</div>
                          <div className="text-4xl font-bold text-[#FFB300]">{dailyStats.revenue}₺</div>
                      </div>
                      <div className="bg-[#1a1d24] p-6 rounded-xl border border-gray-800">
                          <div className="text-gray-500 text-sm mb-1">Satılan Ürün Adedi</div>
                          <div className="text-4xl font-bold text-[#FF3D00]">{dailyStats.count}</div>
                      </div>
                   </div>

                   <h3 className="text-lg font-bold mb-4 text-gray-400">Canlı Satış Listesi (Sıfırlanana Kadar)</h3>
                   <div className="bg-[#1a1d24] rounded-xl border border-gray-800 overflow-hidden">
                        <table className="w-full text-left text-sm text-gray-400">
                             <thead className="bg-gray-800 text-gray-200">
                                 <tr><th className="p-3">Saat</th><th className="p-3">İçerik</th><th className="p-3 text-right">Tutar</th></tr>
                             </thead>
                             <tbody>
                                 {salesHistory.map(sale => (
                                     <tr key={sale.id} className="border-b border-gray-800">
                                         <td className="p-3">{new Date(sale.date).toLocaleTimeString('tr-TR')}</td>
                                         <td className="p-3">{sale.items.map(i => `${i.name} (${i.qty})`).join(', ')}</td>
                                         <td className="p-3 text-right font-bold text-[#FFB300]">{sale.total}₺</td>
                                     </tr>
                                 ))}
                                 {salesHistory.length === 0 && <tr><td colSpan="3" className="p-4 text-center">Liste temiz. Henüz satış yok.</td></tr>}
                             </tbody>
                        </table>
                   </div>
               </div>
            )}
        </main>

        {/* ÜRÜN MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
             <div className="bg-[#1a1d24] p-6 rounded-xl border border-gray-700 w-full max-w-md">
                 <div className="flex justify-between mb-4"><h3 className="text-xl font-bold">Ürün Yönetimi</h3><button onClick={() => setIsModalOpen(false)}><X className="text-gray-400"/></button></div>
                 <form onSubmit={handleProductSubmit} className="space-y-4">
                     <div><label className="block text-xs text-gray-500 mb-1">Ürün Adı</label><input type="text" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg block w-full p-2.5" required/></div>
                     
                     <div>
                         <label className="block text-xs text-gray-500 mb-1">Ürün Görseli</label>
                         <div className="flex items-center gap-4">
                             <label className="flex-1 cursor-pointer bg-gray-800 border border-gray-700 hover:bg-gray-700 p-2 rounded-lg text-sm flex items-center justify-center gap-2 transition">
                                 <Upload className="w-4 h-4"/> Dosya Seç
                                 <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'product')} />
                             </label>
                             {formData.image && <img src={formData.image} className="h-10 w-10 rounded object-cover border border-gray-600"/>}
                         </div>
                     </div>

                     <div className="grid grid-cols-3 gap-3">
                         <div><label className="block text-xs text-gray-500 mb-1">Fiyat</label><input type="number" value={formData.price} onChange={e=>setFormData({...formData, price: e.target.value})} className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg block w-full p-2.5" required/></div>
                         <div><label className="block text-xs text-gray-500 mb-1">Min</label><input type="number" value={formData.min} onChange={e=>setFormData({...formData, min: e.target.value})} className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg block w-full p-2.5" required/></div>
                         <div><label className="block text-xs text-gray-500 mb-1">Max</label><input type="number" value={formData.max} onChange={e=>setFormData({...formData, max: e.target.value})} className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg block w-full p-2.5" required/></div>
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                         <div><label className="block text-xs text-gray-500 mb-1">Stok</label><input type="number" value={formData.stock} onChange={e=>setFormData({...formData, stock: e.target.value})} className="bg-gray-800 border border-blue-500 text-white text-sm rounded-lg block w-full p-2.5 font-bold" required/></div>
                         
                         <div><label className="block text-xs text-gray-500 mb-1">Maliyet Tipi</label><select value={formData.type} onChange={e=>setFormData({...formData, type: e.target.value})} className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg block w-full p-2.5">
                             <option value="LOW">Düşük Maliyet</option>
                             <option value="HIGH">Yüksek Maliyet</option>
                         </select></div>
                     </div>
                     <button type="submit" className="w-full bg-[#FF3D00] hover:bg-red-600 px-6 py-2 rounded-lg font-bold mt-4">Kaydet</button>
                 </form>
             </div>
          </div>
        )}

        {isSettingsOpen && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
                <div className="bg-[#1a1d24] p-6 rounded-xl border border-gray-700 w-full max-w-sm">
                    <div className="flex justify-between mb-4"><h3 className="text-xl font-bold">Firma Logosu</h3><button onClick={() => setIsSettingsOpen(false)}><X className="text-gray-400"/></button></div>
                    <p className="text-sm text-gray-500 mb-4">Buradan yüklediğiniz logo TV ekranında görünecektir.</p>
                    <label className="w-full cursor-pointer bg-blue-600 hover:bg-blue-700 p-3 rounded-lg text-white font-bold flex items-center justify-center gap-2 transition">
                         <Upload className="w-5 h-5"/> Yeni Logo Yükle
                         <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'logo')} />
                    </label>
                </div>
            </div>
        )}

        {isHistoryOpen && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
                <div className="bg-[#1a1d24] p-6 rounded-xl border border-gray-700 w-full max-w-lg h-[70vh] flex flex-col">
                    <div className="flex justify-between mb-4"><h3 className="text-xl font-bold">Rapor Arşivi</h3><button onClick={() => setIsHistoryOpen(false)}><X className="text-gray-400"/></button></div>
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left text-sm text-gray-400">
                             <thead className="bg-gray-800 text-gray-200"><tr><th className="p-3">Tarih</th><th className="p-3">Ciro</th><th className="p-3">Adet</th><th className="p-3 text-right">Sil</th></tr></thead>
                             <tbody>
                                 {archivedReports.map((r, i) => (
                                     <tr key={i} className="border-b border-gray-800">
                                         <td className="p-3">{new Date(r.date).toLocaleDateString('tr-TR')}</td>
                                         <td className="p-3 font-bold text-[#FFB300]">{r.revenue}₺</td>
                                         <td className="p-3">{r.count}</td>
                                         <td className="p-3 text-right">
                                             <button onClick={() => deleteArchive(r.id)} className="text-red-500 hover:text-white"><XCircle className="w-5 h-5"/></button>
                                         </td>
                                     </tr>
                                 ))}
                                 {archivedReports.length === 0 && <tr><td colSpan="4" className="p-4 text-center">Arşiv boş.</td></tr>}
                             </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default AdminPage;
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import {
  collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch, increment, setDoc, query, orderBy, limit, getDocs, getDoc
} from 'firebase/firestore';
import {
  ShoppingCart, Package, BarChart3, Settings, Dices, AlertTriangle, LogOut, Check, Banknote, CreditCard, Plus, Trash, Pencil, X, Upload, History, Archive, XCircle, UserCog, Lock, Tv, FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAuth, updatePassword, onAuthStateChanged } from 'firebase/auth';

// --- YARDIMCI FONKSİYONLAR ---

// Fiyat Yuvarlama (10'un katları)
const normalizePrice = (base, min, max) => {
  let raw = Math.round(base);
  let ones = raw % 10;
  if (ones < 0) ones += 10;
  let rounded = ones === 0 ? raw : (ones <= 4 ? raw - ones : raw + (10 - ones));
  
  // Sınırları koru
  if (rounded < min) { rounded = min; raw = min; }
  if (rounded > max) { rounded = max; raw = max; }
  
  return { rawPrice: raw, price: rounded };
};

// Satış Sonrası Fiyat Hesaplama
const computePriceAfterPurchase = (product, qty) => {
  const min = Number(product.min) || 0;
  const max = Number(product.max) || 10000;
  let raw = product.rawPrice ?? product.price; // Geriye dönük uyumluluk
  
  const newRaw = raw + qty; // Her adet için ham fiyat artışı
  const norm = normalizePrice(newRaw, min, max);
  
  return { newRawPrice: norm.rawPrice, newPrice: norm.price, itemTotal: norm.price * qty };
};

const AdminPage = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  
  // --- STATE YÖNETİMİ ---
  const [user, setUser] = useState(null); // Giriş yapan kullanıcı
  const [loading, setLoading] = useState(true);
  const [licenseStatus, setLicenseStatus] = useState('active'); // Lisans Durumu

  // Sekmeler ve Veriler
  const [activeTab, setActiveTab] = useState('pos');
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  
  // Modallar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  
  // Sistem Durumu
  const [systemState, setSystemState] = useState('IDLE'); // IDLE, CRASH, ROULETTE
  const [simActive, setSimActive] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState({ show: false, method: '' });
  
  // İstatistikler
  const [dailyStats, setDailyStats] = useState({ revenue: 0, count: 0 });
  const [salesHistory, setSalesHistory] = useState([]);
  const [archivedReports, setArchivedReports] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  
  // Referanslar
  const systemTimeoutRef = useRef(null);
  const luckyProductIdRef = useRef(null);

  // Form
  const [formData, setFormData] = useState({ id: '', name: '', price: '', min: '', max: '', type: 'LOW', stock: 50, image: '' });
  const [newPassword, setNewPassword] = useState('');

  // --- LOGLAMA YARDIMCISI ---
  const logAction = async (action, details) => {
      if(!user) return;
      try {
          await addDoc(collection(db, "companies", user.uid, "system_logs"), {
              action: action,
              details: details,
              user: user.email,
              timestamp: new Date().toISOString()
          });
      } catch (err) { console.error("Log error", err); }
  };

  // --- 1. OTURUM VE GÜVENLİK KONTROLÜ ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        
        // A) Lisans Kontrolü
        const companyRef = doc(db, "companies", currentUser.uid);
        const unsubCompany = onSnapshot(companyRef, (docSnap) => {
            if(docSnap.exists()) {
                const data = docSnap.data();
                setLicenseStatus(data.licenseStatus || 'active');
            }
        });

        // B) Session Token (Tek Koltuk Kuralı)
        const sessionRef = doc(db, "users", currentUser.uid);
        const currentSessionId = localStorage.getItem('session_token');
        
        const unsubSession = onSnapshot(sessionRef, (snap) => {
            if(snap.exists()) {
                const data = snap.data();
                // Veritabanındaki token ile bendeki uyuşmuyor ve veritabanında bir token var ise at.
                if(data.session_token && data.session_token !== currentSessionId) {
                    alert("Güvenlik Uyarısı: Hesabınıza başka bir cihazdan giriş yapıldı. Oturumunuz kapatılıyor.");
                    auth.signOut();
                    navigate('/login');
                }
            }
        });

        setLoading(false);
        // Temizlik fonksiyonu: Unsubscribe listeners
        return () => { unsubCompany(); unsubSession(); };
      } else {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [auth, navigate]);

  // --- 2. VERİ DİNLEYİCİLERİ (SaaS Yapısı) ---
  useEffect(() => {
    if (!user || licenseStatus !== 'active') return;

    // Yollar: companies/{uid}/...
    const productsRef = collection(db, "companies", user.uid, "products");
    const reportsRef = doc(db, "companies", user.uid, "daily_reports", "today");
    const historyRef = collection(db, "companies", user.uid, "sales_history");

    // a) Ürünler
    const unsubProducts = onSnapshot(productsRef, (snap) => {
      const pList = [];
      snap.forEach(d => pList.push({ id: d.id, ...d.data() }));
      pList.sort((a,b) => a.name.localeCompare(b.name));
      setProducts(pList);
    });

    // b) Günlük Rapor
    const unsubReport = onSnapshot(reportsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setDailyStats({ revenue: data.totalRevenue || 0, count: data.totalCount || 0 });
      }
    });

    // c) Canlı Satış Akışı
    const q = query(historyRef, orderBy("date", "desc"), limit(20));
    const unsubSales = onSnapshot(q, (snap) => {
        const sales = [];
        snap.forEach(d => sales.push({ id: d.id, ...d.data() }));
        setSalesHistory(sales);
    });

    return () => { unsubProducts(); unsubReport(); unsubSales(); };
  }, [user, licenseStatus]);

  // --- 3. OTO PİYASA (Fiyat Düşüş Mantığı) ---
  useEffect(() => {
    // Sadece Simülasyon AÇIK, Sistem BOŞTA (Idle), Kullanıcı VAR ve Lisans AKTİF ise çalış.
    if (!simActive || products.length === 0 || systemState !== 'IDLE' || !user || licenseStatus !== 'active') return;

    const ONE_MINUTE = 60 * 1000;
    const intervalId = setInterval(async () => {
      const now = Date.now();
      const batch = writeBatch(db);
      let hasUpdates = false;

      products.forEach((p) => {
        // Şanslı ürünse veya min fiyattaysa dokunma
        if (p.id === luckyProductIdRef.current) return;
        
        const rawBase = p.rawPrice ?? p.price ?? 0;
        const min = Number(p.min) || 0;
        const max = Number(p.max) || 10000;

        if (rawBase <= min) return;

        const lastTrade = p.lastTradeAt ?? 0;
        // 1 dakikadır satış yoksa düşür
        if (now - lastTrade >= ONE_MINUTE) {
          const newRaw = rawBase - 1;
          const norm = normalizePrice(newRaw, min, max);
          
          const pRef = doc(db, "companies", user.uid, "products", p.id);
          batch.update(pRef, {
            rawPrice: norm.rawPrice,
            price: norm.price
          });
          hasUpdates = true;
        }
      });

      if (hasUpdates) {
        try { await batch.commit(); } catch (err) { console.error("Oto Piyasa Hatası:", err); }
      }
    }, ONE_MINUTE);

    return () => clearInterval(intervalId);
  }, [products, simActive, systemState, user, licenseStatus]);

  // --- ACTIONS (İŞLEMLER) ---

  const copyTvLink = () => {
      const link = `${window.location.origin}/tv/${user.uid}`;
      navigator.clipboard.writeText(link);
      alert("TV Linki Kopyalandı!");
  };

  const handleLogout = async () => {
    if (window.confirm('Çıkış yapmak istiyor musunuz?')) {
      await auth.signOut();
      navigate('/login');
    }
  };

  // LOGLARI AÇ
  const openLogs = async () => {
      setIsLogsOpen(true);
      if(!user) return;
      const q = query(collection(db, "companies", user.uid, "system_logs"), orderBy("timestamp", "desc"), limit(50));
      const snap = await getDocs(q);
      const logs = [];
      snap.forEach(d => logs.push({ id: d.id, ...d.data() }));
      setSystemLogs(logs);
  };

  // RULET (ŞANSLI ÜRÜN)
  const triggerRoulette = async () => {
      if (!user) return;
      const available = products.filter(p => p.stock > 0);
      if (available.length === 0) return alert("Stokta ürün yok!");
      
      const winner = available[Math.floor(Math.random() * available.length)];
      if(!window.confirm(`Şanslı ürün: "${winner.name}" seçilecek.\nFiyatı ${winner.min}₺ (DİP) olacak.\nSüre: 10 Dakika.\nOnaylıyor musunuz?`)) return;

      logAction("START_ROULETTE", `Winner: ${winner.name}`);

      setSystemState('ROULETTE');
      luckyProductIdRef.current = winner.id;

      // 1. Animasyon Komutu
      const cmdRef = doc(db, "companies", user.uid, "system_data", "commands");
      await setDoc(cmdRef, { 
          type: 'ROULETTE_START', winnerId: winner.id, timestamp: Date.now() 
      });

      // 2. Fiyatı Düşür (5sn sonra)
      setTimeout(async () => {
          const pRef = doc(db, "companies", user.uid, "products", winner.id);
          await updateDoc(pRef, { 
              price: winner.min, 
              rawPrice: winner.min,
              isLucky: true,
              lastTradeAt: Date.now()
          });
          
          await setDoc(cmdRef, { 
              type: 'TICKER_UPDATE', 
              data: `🎉 FIRSAT: ${winner.name} 10 DAKİKA BOYUNCA DİP FİYAT! 🎉`, 
              timestamp: Date.now() 
          });
      }, 5000);

      // 3. Eski Haline Getir (10dk sonra)
      if(systemTimeoutRef.current) clearTimeout(systemTimeoutRef.current);
      
      systemTimeoutRef.current = setTimeout(async () => {
          const pRef = doc(db, "companies", user.uid, "products", winner.id);
          await updateDoc(pRef, { 
              price: winner.startPrice, 
              rawPrice: winner.startPrice,
              isLucky: false
          });
          
          setSystemState('IDLE');
          luckyProductIdRef.current = null;
          alert(`Süre doldu! ${winner.name} normale döndü.`);
      }, 10 * 60 * 1000);
  };

  // CRASH BAŞLAT
  const handleCrashStart = async () => {
    if (!user) return;
    if (!window.confirm('DİKKAT! Tüm fiyatlar 5 dakika boyunca TABAN fiyata çekilecek. Onaylıyor musunuz?')) return;

    logAction("START_CRASH", "Duration: 5 min");

    setSystemState('CRASH');

    const batch = writeBatch(db);
    products.forEach((p) => {
        const pRef = doc(db, "companies", user.uid, "products", p.id);
        batch.update(pRef, {
          rawPrice: p.min,
          price: p.min,
          lastTradeAt: Date.now()
        });
    });
    
    const cmdRef = doc(db, "companies", user.uid, "system_data", "commands");
    batch.set(cmdRef, { type: 'CRASH_START', timestamp: Date.now() });
    await batch.commit();

    if(systemTimeoutRef.current) clearTimeout(systemTimeoutRef.current);
    systemTimeoutRef.current = setTimeout(() => {
        setSystemState('IDLE');
        alert('Crash süresi doldu. Sistem normale dönüyor.');
    }, 5 * 60 * 1000);
  };

  // ÖDEME İŞLEMİ (DÜZELTİLMİŞ VE OPTİMİZE EDİLMİŞ)
  const processPayment = async (method) => {
    if (cart.length === 0) return alert('Sepet Boş');
    const batch = writeBatch(db);
    let totalAmount = 0; let totalQty = 0;
    
    let topItem = cart.reduce((prev, current) => (prev.qty > current.qty) ? prev : current);

    // Optimize edilmiş sepet (Resim verisi yok, sadece text)
    const simplifiedCart = cart.map(item => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
        price: item.price
    }));

    cart.forEach((item) => {
      const pRef = doc(db, "companies", user.uid, "products", item.id);
      const currentP = products.find((p) => p.id === item.id);
      if (!currentP) return;

      // Dokunulmazlık kontrolü (Crash veya Şanslı Ürün ise fiyat değişmez)
      const isImmune = (systemState === 'CRASH' || currentP.isLucky === true);
      const newStock = Math.max(0, Number(currentP.stock || 0) - item.qty);
      
      let updates = { stock: newStock, lastTradeAt: Date.now() };

      if (!isImmune) {
          // --- HATA ÇÖZÜMÜ BURADA: computePriceAfterPurchase KULLANILIYOR ---
          const { newRawPrice, newPrice, itemTotal } = computePriceAfterPurchase(currentP, item.qty);
          updates.rawPrice = newRawPrice;
          updates.price = newPrice;
          totalAmount += itemTotal;
      } else {
          // Dokunulmazsa (Dip Fiyatsa) o fiyattan sat ama fiyatı arttırma
          totalAmount += currentP.price * item.qty;
      }
      
      totalQty += item.qty;
      batch.update(pRef, updates);
    });

    const cmdRef = doc(db, "companies", user.uid, "system_data", "commands");
    batch.set(cmdRef, { type: 'TICKER_UPDATE', data: `🔥 SON DAKİKA: ${topItem.name} KAPIŞ KAPIŞ GİDİYOR!`, timestamp: Date.now() });
    
    const reportRef = doc(db, "companies", user.uid, "daily_reports", "today");
    batch.set(reportRef, { totalRevenue: increment(totalAmount), totalCount: increment(totalQty) }, { merge: true });
    
    const historyRef = doc(collection(db, "companies", user.uid, "sales_history"));
    batch.set(historyRef, { 
        date: new Date().toISOString(), 
        items: simplifiedCart, 
        total: totalAmount, 
        method 
    });

    try {
      await batch.commit();
      setCart([]);
      setPaymentSuccess({ show: true, method }); 
      setTimeout(() => setPaymentSuccess({ show: false, method: '' }), 2000);
    } catch (err) { console.error("Payment Error:", err); alert("Hata: " + err.message); }
  };

  const addToCart = (product) => {
    if (product.stock <= 0) return alert('Stok Yok!');
    const exist = cart.find(c => c.id === product.id);
    if (exist) {
      if (exist.qty >= product.stock) return alert('Yetersiz Stok');
      setCart(cart.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };
  const removeFromCart = (idx) => setCart(cart.filter((_, i) => i !== idx));
  const cartTotal = cart.reduce((acc, item) => {
      const currentP = products.find(p => p.id === item.id);
      if(!currentP) return acc;
      return acc + (currentP.price * item.qty);
  }, 0);

  // ÜRÜN İŞLEMLERİ
  const handleProductSubmit = async (e) => {
    e.preventDefault();
    if(!user) return;
    try {
      const base = Number(formData.price);
      const min = Number(formData.min);
      const max = Number(formData.max);
      const norm = normalizePrice(base, min, max);

      const data = {
        name: formData.name,
        startPrice: norm.price,
        rawPrice: norm.rawPrice,
        price: norm.price,
        min, max, 
        stock: Number(formData.stock),
        type: formData.type,
        image: formData.image || 'https://via.placeholder.com/150',
        isLucky: false
      };

      const productsRef = collection(db, "companies", user.uid, "products");

      if (formData.id) await updateDoc(doc(productsRef, formData.id), data);
      else {
          await addDoc(productsRef, data);
          logAction("ADD_PRODUCT", `Added: ${formData.name}`);
      }
      
      setIsModalOpen(false);
      setFormData({ id: '', name: '', price: '', min: '', max: '', type: 'LOW', stock: 50, image: '' });
    } catch (err) { alert(err.message); }
  };

  const handleImageUpload = (e, field) => {
      const file = e.target.files[0];
      if(file && file.size < 2048576) {
          const reader = new FileReader();
          reader.onloadend = () => field === 'logo' ? updateSystemLogo(reader.result) : setFormData({ ...formData, image: reader.result });
          reader.readAsDataURL(file);
      } else alert("Dosya çok büyük (Max 2MB)");
  };
  
  const updateSystemLogo = async (base64) => {
      if(!user) return;
      await setDoc(doc(db, "companies", user.uid, "system_data", "settings"), { logo: base64 }, { merge: true });
      alert("Logo güncellendi!"); setIsSettingsOpen(false);
  };
  
  const handleChangePassword = async (e) => {
      e.preventDefault();
      if(newPassword.length < 6) return alert("En az 6 karakter.");
      try { await updatePassword(auth.currentUser, newPassword); alert("Şifre değişti!"); setNewPassword(''); }
      catch(err) { console.error(err); alert("Hata: Çıkış yapıp tekrar deneyin."); }
  };
  
  const endOfDay = async () => {
      if(!user || !window.confirm("Gün sonlandırılsın mı?")) return;
      
      logAction("END_OF_DAY", `Revenue: ${dailyStats.revenue}`);

      const reportRef = doc(db, "companies", user.uid, "daily_reports", "today");
      const todaySnap = await getDoc(reportRef);
      
      if(todaySnap.exists()) {
          await addDoc(collection(db, "companies", user.uid, "reports_archive"), { date: new Date().toISOString(), ...todaySnap.data() });
      }
      
      await setDoc(reportRef, { totalRevenue: 0, totalCount: 0 });
      
      const q = query(collection(db, "companies", user.uid, "sales_history"), limit(500));
      const s = await getDocs(q);
      const b = writeBatch(db);
      s.forEach(d => b.delete(d.ref));
      await b.commit();
      alert("Gün sonlandı.");
  };
  
  const fetchHistory = async () => {
      if(!user) return;
      setIsHistoryOpen(true);
      const q = query(collection(db, "companies", user.uid, "reports_archive"), orderBy("date", "desc"), limit(20));
      const s = await getDocs(q);
      const l = []; s.forEach(d=>l.push({id:d.id, ...d.data()}));
      setArchivedReports(l);
  };
  
  const deleteArchive = async(id) => { 
      if(!user) return;
      if(window.confirm("Silinsin mi?")) { 
          await deleteDoc(doc(db, "companies", user.uid, "reports_archive", id)); 
          setArchivedReports(archivedReports.filter(r=>r.id!==id)); 
      }
  };
  
  const editProduct = (p) => { setFormData({ id: p.id, name: p.name, price: p.startPrice, min: p.min, max: p.max, type: p.type, stock: p.stock, image: p.image }); setIsModalOpen(true); };
  
  const deleteProduct = async (id) => { 
      if(!user) return;
      if(window.confirm("Silinsin mi?")) await deleteDoc(doc(db, "companies", user.uid, "products", id)); 
  };
  
  const resetPrices = async () => {
      if(!user || !window.confirm("Fiyatlar başlangıca dönsün mü?")) return;
      logAction("RESET_PRICES", "User request");
      const batch = writeBatch(db);
      products.forEach(p => batch.update(doc(db, "companies", user.uid, 'products', p.id), { price: p.startPrice, rawPrice: p.startPrice, isLucky: false }));
      await batch.commit();
  };

  if(loading) return <div className="h-screen flex items-center justify-center bg-[#0f1115] text-white">Yükleniyor...</div>;

  // LİSANS KONTROLÜ
  if (licenseStatus === 'suspended') {
      return (
          <div className="h-screen flex flex-col items-center justify-center bg-red-900 text-white text-center p-8">
              <AlertTriangle size={64} className="mb-4 text-yellow-400" />
              <h1 className="text-4xl font-bold mb-2">HİZMET DURAKLATILDI</h1>
              <p className="text-xl max-w-lg mb-8">Bu işletmenin lisans süresi dolmuş veya ödeme beklenmektedir.</p>
              <button onClick={() => {auth.signOut(); navigate('/login')}} className="bg-white text-red-900 px-6 py-2 rounded font-bold">Çıkış Yap</button>
          </div>
      );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f1115] text-white font-sans">
        
        {(simActive || systemState !== 'IDLE') && (
            <div className="absolute top-0 left-0 w-full bg-blue-600 text-white text-xs font-bold text-center py-1 z-50 animate-pulse">
                ⚠️ SİSTEM AKTİF! Lütfen bu sayfayı kapatmayın veya bilgisayarı uyku moduna almayın.
            </div>
        )}

        {/* SIDEBAR */}
        <aside className="w-64 bg-[#14161b] border-r border-gray-800 flex flex-col shrink-0 pt-6">
            <div className="p-6"><img src="/deepeak_ana_logo.png" className="h-16 object-contain mb-2"/><p className="text-[10px] text-gray-500 font-mono ml-1">SaaS Panel v10.2</p></div>
            <nav className="flex-1 px-4 space-y-2 mt-4">
                {['pos', 'products', 'reports'].map(tab => (
                    <div key={tab} onClick={() => setActiveTab(tab)} className={`flex items-center p-3 rounded-lg cursor-pointer ${activeTab===tab ? 'bg-[#FF3D00]/15 text-[#FFB300] border-l-4 border-[#FF3D00]' : 'text-gray-400 hover:bg-gray-800'}`}>
                        {tab==='pos' ? <ShoppingCart className="w-5 h-5 mr-3"/> : tab==='products' ? <Package className="w-5 h-5 mr-3"/> : <BarChart3 className="w-5 h-5 mr-3"/>}
                        {tab==='pos' ? 'Kasa / Satış' : tab==='products' ? 'Ürün & Stok' : 'Raporlar'}
                    </div>
                ))}
            </nav>
            <div className="p-4 border-t border-gray-800 space-y-3">
                <button onClick={copyTvLink} className="w-full bg-blue-600/20 text-blue-400 border border-blue-600 p-2 rounded-lg text-sm font-bold flex gap-2 justify-center hover:bg-blue-600/40">
                    <Tv className="w-4 h-4"/> TV Linkini Al
                </button>

                <button onClick={() => setIsSettingsOpen(true)} className="w-full bg-gray-800 p-2 rounded-lg text-sm font-bold flex gap-2 justify-center hover:bg-gray-700"><UserCog className="w-4 h-4"/> Firma & Hesap</button>
                
                <button 
                    disabled={systemState !== 'IDLE'}
                    onClick={triggerRoulette} 
                    className="w-full bg-[#FFB300]/20 text-[#FFB300] border border-[#FFB300] p-2 rounded-lg text-sm font-bold flex gap-2 justify-center hover:bg-[#FFB300]/40 disabled:opacity-30 disabled:cursor-not-allowed">
                    {systemState === 'ROULETTE' ? <Lock className="w-4 h-4"/> : <Dices className="w-4 h-4"/>} 
                    {systemState === 'ROULETTE' ? 'RULET AKTİF' : 'ŞANSLI ÜRÜN'}
                </button>
                
                <div className={`flex items-center justify-between bg-gray-800 p-3 rounded-lg border border-gray-700 ${systemState !== 'IDLE' ? 'opacity-30 pointer-events-none' : ''}`}>
                    <span className="text-sm text-gray-300">Oto. Piyasa</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={simActive} onChange={() => setSimActive(!simActive)}/>
                        <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-[#10b981] peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                    </label>
                </div>

                <button 
                    disabled={systemState !== 'IDLE'}
                    onClick={handleCrashStart} 
                    className="w-full bg-red-900/50 text-red-200 border border-red-700 p-2 rounded-lg text-sm font-bold flex gap-2 justify-center hover:bg-red-800 disabled:opacity-30 disabled:cursor-not-allowed">
                    {systemState === 'CRASH' ? <Lock className="w-4 h-4"/> : <AlertTriangle className="w-4 h-4"/>}
                    {systemState === 'CRASH' ? 'CRASH AKTİF' : 'CRASH BAŞLAT'}
                </button>
            </div>
            <div className="p-4 bg-[#0f1115] border-t border-gray-800"><button onClick={handleLogout} className="flex justify-center w-full p-2 text-gray-400 hover:text-white"><LogOut className="w-4 h-4 mr-2"/> Çıkış</button></div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 relative overflow-hidden flex flex-col pt-6">
            
            {/* POS */}
            {activeTab === 'pos' && (
                <div className="h-full flex w-full">
                    <div className="flex-1 p-6 overflow-y-auto">
                        <h2 className="text-3xl font-bold mb-6 text-white tracking-wide">Satış</h2>
                        <div className="grid grid-cols-3 xl:grid-cols-4 gap-4">
                            {products.map(p => (
                                <div key={p.id} onClick={() => addToCart(p)} className={`bg-[#1a1d24] p-4 rounded-xl border cursor-pointer hover:border-[#FF3D00] shadow-lg ${p.stock<=0 ? 'opacity-50 grayscale pointer-events-none border-[#FF3D00]' : 'border-gray-800'} ${p.isLucky ? 'ring-2 ring-red-500' : ''}`}>
                                    <div className="h-24 bg-gray-800 rounded-lg mb-3 overflow-hidden relative">
                                        {p.isLucky && <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] px-2 font-bold">DİP FİYAT</div>}
                                        {p.image ? <img src={p.image} className="w-full h-full object-cover"/> : <div className="flex items-center justify-center h-full text-gray-600"><Package/></div>}
                                    </div>
                                    <div className="font-bold truncate text-sm text-gray-200">{p.name}</div>
                                    <div className="flex justify-between items-center mt-2">
                                        <div className={`font-mono font-bold text-2xl ${p.isLucky ? 'text-red-500' : 'text-white'}`}>{p.price}₺</div>
                                        <div className="text-xs text-gray-400">{p.stock<=0 ? 'TÜKENDİ' : `Stok: ${p.stock}`}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="w-96 bg-[#1a1d24] border-l border-gray-800 flex flex-col p-4 relative">
                        <h3 className="font-bold text-lg mb-4 border-b border-gray-700 pb-2">Sepet</h3>
                        <div className="flex-1 overflow-y-auto space-y-2 relative">
                            {paymentSuccess.show && (
                                <div className="absolute inset-0 bg-[#1a1d24]/95 backdrop-blur-sm flex flex-col items-center justify-center z-20 animate-in fade-in zoom-in duration-300">
                                    <div className="bg-green-500/20 p-4 rounded-full mb-3 border border-green-500"><Check className="w-10 h-10 text-green-500"/></div>
                                    <h4 className="text-xl font-bold text-white">Ödeme Başarılı</h4>
                                    <p className="text-sm text-gray-400 mt-1">{paymentSuccess.method === 'cash' ? 'Nakit' : 'Kart'}</p>
                                </div>
                            )}
                            
                            {cart.length === 0 ? <div className="text-gray-500 text-center mt-10">Sepet Boş</div> : cart.map((item, i) => (
                                <div key={i} className="flex justify-between items-center bg-[#14161b] p-3 rounded border border-gray-800">
                                    <div><div className="font-bold text-sm">{item.name}</div><div className="text-xs text-gray-500">{item.price}₺ x {item.qty}</div></div>
                                    <div className="flex items-center gap-2"><span className="font-bold text-[#FFB300]">{item.price*item.qty}₺</span><button onClick={()=>removeFromCart(i)} className="text-red-500"><Trash className="w-4 h-4"/></button></div>
                                </div>
                            ))}
                        </div>
                        <div className="pt-4 border-t border-gray-700">
                            <div className="flex justify-between text-xl font-bold mb-4"><span>TOPLAM</span><span className="text-[#FFB300]">{cartTotal}₺</span></div>
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={()=>processPayment('cash')} className="bg-[#10b981] hover:bg-green-600 text-white py-3 rounded-lg font-bold flex justify-center gap-2"><Banknote className="w-5 h-5"/> NAKİT</button>
                                <button onClick={()=>processPayment('credit')} className="bg-[#3b82f6] hover:bg-blue-600 text-white py-3 rounded-lg font-bold flex justify-center gap-2"><CreditCard className="w-5 h-5"/> KART</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ÜRÜNLER (Gelişmiş Görünüm) */}
            {activeTab === 'products' && (
                <div className="h-full p-8 overflow-y-auto">
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-2xl font-bold">Ürün Yönetimi</h2>
                        <button onClick={()=>setIsModalOpen(true)} className="bg-[#FF3D00] hover:bg-red-600 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2"><Plus className="w-4 h-4"/> Yeni Ürün</button>
                    </div>
                    <div className="bg-[#1a1d24] rounded-xl border border-gray-800 overflow-hidden">
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-gray-800 text-gray-200">
                                <tr>
                                    <th className="p-4">Ürün</th>
                                    <th className="p-4">Fiyat Bilgileri</th> 
                                    <th className="p-4"><div className="flex justify-between"><span>Stok</span><button onClick={resetPrices} className="text-[10px] bg-gray-700 px-2 rounded">Fiyatları Sıfırla</button></div></th>
                                    <th className="p-4 text-right">İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map(p => (
                                    <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                        <td className="p-4 flex items-center gap-3">
                                            <img src={p.image} className="w-10 h-10 rounded object-cover bg-gray-700"/>
                                            <span className="font-bold text-gray-200">{p.name}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                                <div className="text-white font-mono">Başlangıç: <span className="text-[#FFB300] font-bold">{p.startPrice}₺</span></div>
                                                <div className="text-gray-400 text-xs">Min Limit: {p.min}₺</div>
                                                <div className="text-gray-400 text-xs">Güncel: <span className={p.isLucky ? 'text-red-500 font-bold' : ''}>{p.price}₺</span></div>
                                                <div className="text-gray-400 text-xs">Max Limit: {p.max}₺</div>
                                            </div>
                                        </td>
                                        <td className="p-4 font-bold text-white">{p.stock}</td>
                                        <td className="p-4 text-right">
                                            <button onClick={()=>editProduct(p)} className="text-blue-500 mr-3"><Pencil className="w-4 h-4"/></button>
                                            <button onClick={()=>deleteProduct(p.id)} className="text-red-500"><Trash className="w-4 h-4"/></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Raporlar */}
            {activeTab === 'reports' && (
                <div className="h-full p-8 overflow-y-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold">Raporlar</h2>
                        <div className="flex gap-2">
                            <button onClick={openLogs} className="bg-blue-900/50 hover:bg-blue-800 text-blue-200 border border-blue-700 px-4 py-2 rounded-lg text-sm font-bold flex gap-2"><FileText className="w-4 h-4"/> Sistem Kayıtları</button>
                            <button onClick={fetchHistory} className="bg-gray-700 px-4 py-2 rounded-lg text-sm font-bold flex gap-2"><History className="w-4 h-4"/> Arşiv</button>
                            <button onClick={endOfDay} className="bg-red-900 text-red-100 border border-red-700 px-4 py-2 rounded-lg text-sm font-bold flex gap-2"><Archive className="w-4 h-4"/> Günü Bitir</button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6 mb-8">
                        <div className="bg-[#1a1d24] p-6 rounded-xl border border-gray-800">
                            <div className="text-gray-500 text-sm">Günlük Ciro</div>
                            <div className="text-4xl font-bold text-[#FFB300]">{dailyStats.revenue}₺</div>
                        </div>
                        <div className="bg-[#1a1d24] p-6 rounded-xl border border-gray-800">
                            <div className="text-gray-500 text-sm">Satış Adedi</div>
                            <div className="text-4xl font-bold text-[#FF3D00]">{dailyStats.count}</div>
                        </div>
                    </div>
                    <div className="bg-[#1a1d24] rounded-xl border border-gray-800 overflow-hidden">
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-gray-800 text-gray-200"><tr><th className="p-3">Saat</th><th className="p-3">İçerik</th><th className="p-3 text-right">Tutar</th></tr></thead>
                            <tbody>
                                {salesHistory.map(sale => (
                                    <tr key={sale.id} className="border-b border-gray-800">
                                        <td className="p-3">{new Date(sale.date).toLocaleTimeString('tr-TR')}</td>
                                        <td className="p-3">{sale.items.map(i => `${i.name} (${i.qty})`).join(', ')}</td>
                                        <td className="p-3 text-right font-bold text-[#FFB300]">{sale.total}₺</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </main>

        {/* MODALLAR */}
        {isModalOpen && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                <div className="bg-[#1a1d24] p-6 rounded-xl w-full max-w-md border border-gray-700">
                    <div className="flex justify-between mb-4"><h3 className="text-xl font-bold">Ürün Yönetimi</h3><button onClick={()=>setIsModalOpen(false)}><X/></button></div>
                    <form onSubmit={handleProductSubmit} className="space-y-4">
                        <input placeholder="Ürün Adı" value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} className="w-full bg-gray-800 p-2 rounded border border-gray-600" required/>
                        <div className="flex gap-2">
                            <label className="flex-1 bg-gray-800 p-2 rounded border border-gray-600 cursor-pointer flex items-center justify-center gap-2">
                                <Upload className="w-4 h-4"/> Görsel Seç <input type="file" className="hidden" onChange={(e)=>handleImageUpload(e,'product')}/>
                            </label>
                            {formData.image && <img src={formData.image} className="h-10 w-10 rounded"/>}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <input type="number" placeholder="Fiyat" value={formData.price} onChange={e=>setFormData({...formData, price:e.target.value})} className="bg-gray-800 p-2 rounded border border-gray-600" required/>
                            <input type="number" placeholder="Min" value={formData.min} onChange={e=>setFormData({...formData, min:e.target.value})} className="bg-gray-800 p-2 rounded border border-gray-600" required/>
                            <input type="number" placeholder="Max" value={formData.max} onChange={e=>setFormData({...formData, max:e.target.value})} className="bg-gray-800 p-2 rounded border border-gray-600" required/>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="number" placeholder="Stok" value={formData.stock} onChange={e=>setFormData({...formData, stock:e.target.value})} className="bg-gray-800 p-2 rounded border border-gray-600" required/>
                            <select value={formData.type} onChange={e=>setFormData({...formData, type:e.target.value})} className="bg-gray-800 p-2 rounded border border-gray-600">
                                <option value="LOW">Düşük Maliyet</option>
                                <option value="HIGH">Yüksek Maliyet</option>
                            </select>
                        </div>
                        <button className="w-full bg-[#FF3D00] p-2 rounded font-bold">Kaydet</button>
                    </form>
                </div>
            </div>
        )}

        {isSettingsOpen && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                <div className="bg-[#1a1d24] p-6 rounded-xl w-full max-w-sm border border-gray-700">
                    <div className="flex justify-between mb-4"><h3 className="text-xl font-bold">Ayarlar</h3><button onClick={()=>setIsSettingsOpen(false)}><X/></button></div>
                    <div className="space-y-4">
                        <label className="w-full bg-blue-600 p-2 rounded text-center cursor-pointer block font-bold">
                            Logo Yükle <input type="file" className="hidden" onChange={(e)=>handleImageUpload(e,'logo')}/>
                        </label>
                        <hr className="border-gray-700"/>
                        <input type="password" placeholder="Yeni Şifre" value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="w-full bg-gray-800 p-2 rounded border border-gray-600"/>
                        <button onClick={handleChangePassword} className="w-full bg-green-600 p-2 rounded font-bold">Şifreyi Güncelle</button>
                    </div>
                </div>
            </div>
        )}

        {isLogsOpen && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                <div className="bg-[#1a1d24] p-6 rounded-xl w-full max-w-lg h-[70vh] flex flex-col border border-gray-700">
                    <div className="flex justify-between mb-4"><h3 className="text-xl font-bold">Sistem Kayıtları</h3><button onClick={()=>setIsLogsOpen(false)}><X/></button></div>
                    <div className="flex-1 overflow-y-auto font-mono text-xs">
                        {systemLogs.map(log => (
                            <div key={log.id} className="border-b border-gray-800 p-2 text-gray-400">
                                <span className="text-yellow-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span> <span className="text-white font-bold">{log.action}</span>: {log.details}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {isHistoryOpen && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                <div className="bg-[#1a1d24] p-6 rounded-xl w-full max-w-lg h-[70vh] flex flex-col border border-gray-700">
                    <div className="flex justify-between mb-4"><h3 className="text-xl font-bold">Arşiv</h3><button onClick={()=>setIsHistoryOpen(false)}><X/></button></div>
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-gray-800 text-gray-200"><tr><th className="p-2">Tarih</th><th className="p-2">Ciro</th><th className="p-2">Sil</th></tr></thead>
                            <tbody>
                                {archivedReports.map(r => (
                                    <tr key={r.id} className="border-b border-gray-800">
                                        <td className="p-2">{new Date(r.date).toLocaleDateString()}</td>
                                        <td className="p-2 text-[#FFB300]">{r.revenue}₺</td>
                                        <td className="p-2"><button onClick={()=>deleteArchive(r.id)} className="text-red-500"><XCircle className="w-4 h-4"/></button></td>
                                    </tr>
                                ))}
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
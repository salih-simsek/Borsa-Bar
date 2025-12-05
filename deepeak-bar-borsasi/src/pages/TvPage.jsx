import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { useParams } from 'react-router-dom';

const TvPage = () => {
  // LINKTEN ID'Yİ AL
  const { companyId } = useParams();
  
  const [products, setProducts] = useState([]);
  const [ticker, setTicker] = useState("⚠️ SADECE SELF SERVİS HİZMET VERİLMEKTEDİR ⚠️");
  const [time, setTime] = useState(new Date());
  const [crashActive, setCrashActive] = useState(false);
  const [crashTimer, setCrashTimer] = useState(10);
  const [companyLogo, setCompanyLogo] = useState(null);
  const [luckyProductId, setLuckyProductId] = useState(null);
  
  // Fiyat değişim animasyonu için state
  const [priceChangedIds, setPriceChangedIds] = useState({}); // { id: 'up' | 'down' }

  const productsRef = useRef([]);
  const crashActiveRef = useRef(false);
  const prevPrices = useRef({});
  const trendDirections = useRef({}); 

  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { crashActiveRef.current = crashActive; }, [crashActive]);
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (!companyId) return; // ID yoksa bekle

    // ŞİRKET YOLU: companies/ID/products
    const productsRefFS = collection(db, "companies", companyId, "products");
    const settingsRef = doc(db, "companies", companyId, "system_data", "settings");
    const commandsRef = doc(db, "companies", companyId, "system_data", "commands");

    // A) Ürünler
    const unsubProducts = onSnapshot(productsRefFS, (snap) => {
      const pList = [];
      const currentChanges = {};

      snap.forEach(d => {
         const data = d.data();
         const id = d.id;
         const prev = prevPrices.current[id];
         
         // Fiyat değişimi kontrolü ve animasyon tetikleme
         if (prev !== undefined && data.price !== prev) {
             const direction = data.price > prev ? 'up' : 'down';
             trendDirections.current[id] = direction;
             currentChanges[id] = direction;
         }
         
         prevPrices.current[id] = data.price;
         pList.push({ id, ...data });
      });

      // Animasyon state'ini güncelle
      if (Object.keys(currentChanges).length > 0) {
        setPriceChangedIds(prev => ({ ...prev, ...currentChanges }));
        // 1 saniye sonra animasyon class'ını kaldır
        setTimeout(() => {
           setPriceChangedIds(prev => {
             const newState = { ...prev };
             Object.keys(currentChanges).forEach(k => delete newState[k]);
             return newState;
           });
        }, 1000);
      }

      pList.sort((a,b) => a.name.localeCompare(b.name));
      setProducts(pList);
    });

    // B) Logo
    const unsubLogo = onSnapshot(settingsRef, (snap) => {
        if(snap.exists()) setCompanyLogo(snap.data().logo);
    });

    // C) Komutlar
    const unsubCommands = onSnapshot(commandsRef, (snap) => {
      if(snap.exists()) {
        const cmd = snap.data();
        const now = Date.now();
        // Sadece yeni komutları işle (5 saniye tolerans) veya bitiş komutlarını her zaman işle
        if (now - cmd.timestamp < 5000 || cmd.type.includes('_END')) { 
           if(cmd.type === 'CRASH_START' && !crashActiveRef.current) startCrash();
           if(cmd.type === 'ROULETTE_START') playRouletteAnimation(cmd.winnerId, productsRef.current);
           // Rulet bitiş komutu geldiğinde kırmızılığı kaldır
           if(cmd.type === 'ROULETTE_END') {
              setLuckyProductId(null);
              setTicker("⚠️ SADECE SELF SERVİS HİZMET VERİLMEKTEDİR ⚠️");
           }
           if(cmd.type === 'TICKER_UPDATE') {
             setTicker(cmd.data);
             setTimeout(() => setTicker("⚠️ SADECE SELF SERVİS HİZMET VERİLMEKTEDİR ⚠️"), 15000);
           }
        }
      }
    });
    return () => { unsubProducts(); unsubCommands(); unsubLogo(); };
  }, [companyId]); // ID değişirse yeniden bağlan

  const startCrash = () => {
    setCrashActive(true);
    let sec = 10;
    setCrashTimer(sec);
    const interval = setInterval(() => {
      sec--;
      setCrashTimer(sec);
      if(sec <= 0) {
        clearInterval(interval);
        setTimeout(() => setCrashActive(false), 2000);
      }
    }, 1000);
  };

  const playRouletteAnimation = (winnerId, currentProducts) => {
      const available = currentProducts.filter(p => p.stock > 0);
      if(available.length === 0) return;
      
      setTicker("🎰 ŞANSLI ÜRÜN SEÇİLİYOR... 🎰");
      
      // Daha karmaşık gezme efekti için
      let counter = 0; 
      let speed = 50; // Başlangıç hızı daha yüksek
      let maxSteps = 40; // Daha uzun döngü

      const spin = () => {
          // Rastgele bir ürün seç
          const rnd = Math.floor(Math.random() * available.length);
          setLuckyProductId(available[rnd].id);
          
          counter++;

          // Hızlanma ve yavaşlama eğrisi
          if (counter > maxSteps - 10) speed += 40; // Sonlara doğru yavaşla
          else if (counter > maxSteps - 20) speed += 20;

          if (counter < maxSteps) {
              setTimeout(spin, speed);
          } else {
              // Kazananı belirle
              setLuckyProductId(winnerId);
              const winnerName = currentProducts.find(p => p.id === winnerId)?.name || "ÜRÜN";
              setTicker(`🎉 GECENİN YILDIZI: ${winnerName}! DİP FİYAT! 🎉`);
              // Not: Kırmızı çerçeve artık ROULETTE_END komutu gelene kadar kalacak
          }
      };
      spin();
  };

  return (
    <div className="h-screen w-screen bg-[#0f1115] text-white font-sans overflow-hidden relative">
<<<<<<< HEAD
      {/* 1. İSTEK: Arka plan bulanıklığı ve scanline kaldırıldı. Sadece düz temiz zemin. */}
      
=======
      <div className="absolute inset-0 pointer-events-none opacity-5" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")` }}></div>
      <div className="scanline absolute inset-0 z-50 pointer-events-none"></div>

>>>>>>> 3151abd51dfa86aff6d8f72ebf651fbd9473d2bf
      <div className="h-24 flex items-center px-8 justify-between relative z-10 bg-[#14161b]/95 border-b border-gray-800 shadow-xl">
          <div className="flex items-center gap-6 shrink-0">
             <img src="/deepeak_ana_logo.png" className="h-14 w-auto object-contain drop-shadow-[0_0_10px_rgba(255,0,0,0.5)]" />
             {companyLogo && <><div className="h-10 w-px bg-gray-700"></div><img src={companyLogo} className="h-12 w-auto object-contain rounded opacity-90" /></>}
          </div>
          <div className="flex-1 mx-12 overflow-hidden relative h-12 flex items-center justify-center border-l border-r border-white/10 bg-black/20 rounded">
             <div className="text-[#d4af37] font-mono font-bold text-3xl animate-pulse text-center w-full tracking-wider drop-shadow-md">{ticker}</div>
          </div>
          <div className="text-5xl font-[Oswald] font-bold tracking-widest text-gray-200 shrink-0">
            {time.toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})}
          </div>
      </div>

      <div className={`p-4 grid grid-cols-5 grid-rows-4 gap-3 h-[calc(100vh-100px)] transition-colors duration-1000 ${crashActive ? 'bg-[#2a1515]' : ''}`}>
         {products.map(p => {
            const isSoldOut = p.stock <= 0;
            // Rulet için şanslı ürün highlight'ı
            const isLucky = luckyProductId === p.id || p.isLucky;
            // DİP FİYAT: sadece price === min şartına bağlı
            const isDip = p.price === p.min;
            // Trend: dip fiyattaysa grafikte aşağı olarak göster
            const trend = isDip ? 'down' : (trendDirections.current[p.id] || 'stable');
            
            // 2. İSTEK: Fiyat değişim animasyonu
            const changeStatus = priceChangedIds[p.id]; // 'up' veya 'down' veya undefined

            return (
              <div
                key={p.id}
                className={`drink-card relative bg-[#1a1d24] border border-gray-800 rounded-md flex overflow-hidden shadow-lg transition-all duration-300
                  ${isSoldOut ? 'sold-out-card' : ''} 
                  ${!isSoldOut && trend === 'up' && !isDip ? 'status-up scale-[1.02] z-20' : ''}
                  ${!isSoldOut && trend === 'down' && !isDip ? 'status-down' : ''}
                  ${crashActive ? 'border-red-600 bg-red-900/10' : ''}
                  ${isLucky ? 'ring-8 ring-red-600 scale-105 z-40 shadow-[0_0_100px_rgba(220,38,38,0.9)] bg-[#2a1010] border-red-500' : ''}
                  ${changeStatus === 'up' ? 'animate-pulse ring-4 ring-green-500 bg-green-900/30' : ''}
                  ${changeStatus === 'down' ? 'animate-pulse ring-4 ring-red-500 bg-red-900/30' : ''}
              `}
              >
                  {isSoldOut && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50">
                      <div className="sold-out-stamp border-4 border-red-600 text-red-600 text-3xl font-bold -rotate-12 px-4 py-1 uppercase tracking-widest">
                        Tükendi
                      </div>
                    </div>
                  )}

                  <div className="w-[35%] h-full relative border-r border-white/5 bg-gray-900">
                      {/* 4. İSTEK: Dip Fiyat yazısı resmin içine, sağ üste alındı */}
                      {isDip && (
                        <div className="absolute top-1 right-1 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg animate-pulse z-10 border border-white/20">
                          ★ DİP FİYAT
                        </div>
                      )}

                      {p.image ? (
                        <img src={p.image} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-700">?</div>
                      )}
                  </div>

                  <div className="flex-1 p-3 flex flex-col justify-center relative overflow-hidden">
                      <div className="font-[Oswald] text-[23px] font-bold uppercase text-white mb-1 break-words leading-tight hyphens-auto">
                          {p.name}
                      </div>
                      <div className="flex items-end justify-between mt-auto">
                          <div>
                              <div
                                className={`font-[Oswald] text-6xl font-bold leading-none transition-colors duration-300
                                  ${crashActive || isDip ? 'text-red-500'
                                    : (trend === 'up' ? 'text-[#10b981]'
                                      : (trend === 'down' ? 'text-[#ef4444]' : 'text-white'))}
                                `}
                              >
                                  {p.price}<span className="text-5xl">₺</span>
                              </div>
                              <div className="font-mono text-[20px] text-gray-500 font-bold mt-1 tracking-wider uppercase">
                                Açılış: {p.startPrice}₺
                              </div>
                          </div>
                          <div className="text-5xl font-bold mb-9">
                              {isDip ? (
                                <span className="text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]">▼</span>
                              ) : (
                                trend === 'up'
                                  ? <span className="text-[#10b981]">▲</span>
                                  : (trend === 'down'
                                      ? <span className="text-[#ef4444]">▼</span>
                                      : <span className="text-gray-700 text-2xl">-</span>
                                    )
                              )}
                          </div>
                      </div>
                      <div className="mt-2 h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-1000
                              ${isDip || trend === 'down' ? 'bg-red-500'
                                : (trend === 'up' ? 'bg-green-500' : 'bg-gray-500')}
                            `}
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  5,
                                  ((p.price - p.min) / (p.max - p.min)) * 100
                                )
                              )}%`
                            }}
                          ></div>
                      </div>
                  </div>
              </div>
            );
         })}
      </div>

      {crashActive && (
        <div className="fixed inset-0 bg-black/95 z-[2000] flex flex-col items-center justify-center animate-pulse">
            <div className="text-[#FF3D00] text-3xl font-[Montserrat] tracking-[0.5em] font-bold mb-6 uppercase">
              Piyasa Askıya Alındı
            </div>
            <div className="font-[Oswald] text-[10rem] text-[#FF3D00] font-bold tracking-widest border-b-8 border-[#FF3D00] pb-4 mb-10 leading-none">
              ÇÖKÜŞ ANI
            </div>
            <div className="font-mono text-9xl text-white font-bold bg-[#FF3D00] px-12 py-4 rounded-xl shadow-[0_0_100px_rgba(255,61,0,0.6)]">
              00:{crashTimer < 10 ? `0${crashTimer}` : crashTimer}
            </div>
            <div className="mt-8 text-gray-400 text-xl font-mono">
              TÜM FİYATLAR TABAN SEVİYEYE ÇEKİLİYOR...
            </div>
        </div>
      )}
    </div>
  );
};

export default TvPage;
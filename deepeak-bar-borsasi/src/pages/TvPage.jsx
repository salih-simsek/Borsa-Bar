import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';

const TvPage = () => {
  const [products, setProducts] = useState([]);
  const [ticker, setTicker] = useState("⚠️ SADECE SELF SERVİS HİZMET VERİLMEKTEDİR ⚠️");
  const [time, setTime] = useState(new Date());
  const [crashActive, setCrashActive] = useState(false);
  const [crashTimer, setCrashTimer] = useState(10);
  
  // Önceki fiyatları hatırlamak için (Trend okları için)
  const prevPrices = useRef({});

  // Saat Güncelleme
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Firebase Dinleyicileri
  useEffect(() => {
    // 1. Ürünler
    const unsubProducts = onSnapshot(collection(db, "products"), (snap) => {
      const pList = [];
      snap.forEach(d => pList.push({ id: d.id, ...d.data() }));
      setProducts(pList);
    });

    // 2. Komutlar (Crash, Roulette vb.)
    const unsubCommands = onSnapshot(doc(db, "system_data", "commands"), (snap) => {
      if(snap.exists()) {
        const cmd = snap.data();
        if (Date.now() - cmd.timestamp < 5000) { // Sadece yeni komutlar
           if(cmd.type === 'CRASH_START') startCrash();
           if(cmd.type === 'TICKER_UPDATE') {
             setTicker(cmd.data);
             setTimeout(() => setTicker("⚠️ SADECE SELF SERVİS HİZMET VERİLMEKTEDİR ⚠️"), 10000);
           }
        }
      }
    });

    return () => { unsubProducts(); unsubCommands(); };
  }, []);

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

  return (
    <div className="h-screen w-screen bg-[#0f1115] text-white font-sans overflow-hidden relative">
      {/* Arka Plan Noise */}
      <div className="absolute inset-0 pointer-events-none opacity-5" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")` }}></div>
      <div className="scanline absolute inset-0 z-50"></div>

      {/* Header */}
      <div className="h-24 header-premium flex items-center px-8 justify-between relative z-10 bg-[#14161b]/95 border-b border-gray-800">
          <div className="flex items-center gap-6">
             <div className="h-16 w-16 bg-red-600 rounded-full flex items-center justify-center font-bold text-xs border-2 border-red-500 shadow-[0_0_15px_rgba(255,0,0,0.5)]">DEEPEAK</div>
          </div>
          <div className="flex-1 mx-12 overflow-hidden relative h-12 flex items-center justify-center border-l border-r border-white/10">
             <div className="text-[#d4af37] font-mono font-bold text-xl animate-pulse text-center w-full">{ticker}</div>
          </div>
          <div className="text-5xl font-[Oswald] font-bold tracking-widest">{time.toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})}</div>
      </div>

      {/* Grid */}
      <div className={`p-4 grid grid-cols-5 grid-rows-4 gap-3 h-[calc(100vh-100px)] transition-all duration-500 ${crashActive ? 'bg-[#2a1515]' : ''}`}>
         {products.map(p => {
            const isSoldOut = p.stock <= 0;
            // Trend Hesaplama
            const prev = prevPrices.current[p.id] || p.price;
            let trend = 'stable';
            if(p.price > prev) trend = 'up';
            if(p.price < prev) trend = 'down';
            prevPrices.current[p.id] = p.price; // Update ref

            return (
              <div key={p.id} className={`drink-card relative bg-[#1a1d24] border border-gray-800 rounded-md flex overflow-hidden shadow-lg 
                  ${isSoldOut ? 'sold-out-card' : ''} 
                  ${!isSoldOut && trend === 'up' ? 'status-up' : ''}
                  ${!isSoldOut && trend === 'down' ? 'status-down' : ''}
                  ${crashActive ? 'border-red-600 bg-red-900/10' : ''}
              `}>
                  {/* Tükendi Overlay */}
                  {isSoldOut && <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50"><div className="sold-out-stamp border-4 border-red-600 text-red-600 text-3xl font-bold -rotate-12 px-4 py-1 uppercase tracking-widest">Tükendi</div></div>}
                  
                  {/* Resim */}
                  <div className="w-[35%] h-full relative border-r border-white/5">
                      <img src={p.image} className="w-full h-full object-cover" />
                  </div>

                  {/* Bilgi */}
                  <div className="flex-1 p-3 flex flex-col justify-center relative">
                      {p.type === 'HIGH' && !isSoldOut && <div className="absolute top-2 right-2 text-xl animate-pulse">🔥</div>}
                      <div className="font-[Oswald] text-xl font-bold uppercase text-white mb-1 truncate">{p.name}</div>
                      <div className="flex items-end justify-between">
                          <div>
                              <div className={`font-[Oswald] text-4xl font-bold leading-none ${crashActive ? 'text-red-500' : 'text-white'}`}>{p.price}₺</div>
                              <div className="font-mono text-xs text-gray-500 font-bold mt-1">Açılış: {p.startPrice}₺</div>
                          </div>
                          <div className="text-4xl font-bold">{trend === 'up' ? <span className="text-[#10b981]">▲</span> : (trend === 'down' ? <span className="text-[#ef4444]">▼</span> : <span className="text-gray-600">-</span>)}</div>
                      </div>
                      {/* Bar */}
                      <div className="mt-2 h-1 w-full bg-gray-800 rounded overflow-hidden">
                          <div className="h-full bg-gray-500 transition-all duration-1000" style={{ width: `${((p.price - p.min) / (p.max - p.min)) * 100}%` }}></div>
                      </div>
                  </div>
              </div>
            )
         })}
      </div>

      {/* Crash Overlay */}
      {crashActive && (
        <div className="fixed inset-0 bg-black/95 z-[2000] flex flex-col items-center justify-center">
            <div className="text-[#FF3D00] text-2xl font-[Montserrat] tracking-[0.5em] font-bold mb-4 uppercase">Piyasa Askıya Alındı</div>
            <div className="font-[Oswald] text-9xl text-[#FF3D00] font-bold tracking-widest border-b-4 border-[#FF3D00] pb-4 mb-8">ÇÖKÜŞ ANI</div>
            <div className="font-mono text-8xl text-white font-bold bg-[#FF3D00] px-10 rounded">00:{crashTimer < 10 ? `0${crashTimer}` : crashTimer}</div>
        </div>
      )}
    </div>
  );
};

export default TvPage;
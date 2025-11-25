import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { User, Lock, LayoutDashboard, MonitorPlay, LogOut } from 'lucide-react';
import { app } from '../firebase'; 

const auth = getAuth(app);

const LoginPage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  // Oturum Kontrolü
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error("Giriş Hatası:", err); 
      setError('Giriş Başarısız: E-posta veya şifre hatalı.');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Çıkış yapmak istediğinize emin misiniz?')) {
      await auth.signOut();
    }
  };

  // EĞER GİRİŞ YAPILMIŞSA -> DASHBOARD GÖSTER
  if (user) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center overflow-hidden">
        <div className="absolute inset-0 bg-black/90"></div>
        
        <div className="relative z-10 w-full max-w-6xl p-6 flex flex-col justify-between min-h-[85vh] animate-fade-in">
           {/* Başlık */}
           <div className="text-center mt-8">
              {/* LOGO GÜNCELLEMESİ */}
              <img src="/deepeak_ana_logo.png" className="h-24 mx-auto mb-6 object-contain drop-shadow-[0_0_15px_rgba(255,61,0,0.5)]" alt="Deepeak Logo" />
              <p className="text-gray-400 text-lg font-light tracking-widest uppercase opacity-80">Yönetim Panelinizi Seçiniz</p>
           </div>

           {/* Kartlar */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 px-4 md:px-12 my-8">
              <div onClick={() => navigate('/admin')} className="group relative overflow-hidden rounded-3xl glass-panel border border-[#FFB300]/20 hover:border-[#FFB300] transition-all duration-500 hover:shadow-[0_0_40px_rgba(255,179,0,0.2)] p-8 flex flex-col items-center justify-center text-center h-64 cursor-pointer bg-gradient-to-b from-[#FFB300]/5 to-transparent hover:scale-[1.02]">
                  <div className="bg-[#FFB300] p-5 rounded-2xl mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-[#FFB300]/30 ring-4 ring-[#FFB300]/20">
                      <LayoutDashboard className="w-10 h-10 text-black" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Yönetim Paneli</h3>
                  <p className="text-gray-400 text-sm">Ürün, stok ve kasa işlemleri.</p>
              </div>

              <div onClick={() => navigate('/')} className="group relative overflow-hidden rounded-3xl glass-panel border border-[#FF3D00]/20 hover:border-[#FF3D00] transition-all duration-500 hover:shadow-[0_0_40px_rgba(255,61,0,0.2)] p-8 flex flex-col items-center justify-center text-center h-64 cursor-pointer bg-gradient-to-b from-[#FF3D00]/5 to-transparent hover:scale-[1.02]">
                  <div className="bg-[#FF3D00] p-5 rounded-2xl mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-[#FF3D00]/30 ring-4 ring-[#FF3D00]/20">
                      <MonitorPlay className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">TV Ekranı</h3>
                  <p className="text-gray-400 text-sm">Müşteri ekranını başlat.</p>
              </div>
           </div>

           {/* Çıkış */}
           <div className="text-center mb-4">
               <button onClick={handleLogout} className="group bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 px-12 rounded-full shadow-2xl flex items-center justify-center mx-auto gap-3 transition-all transform hover:scale-105 border border-gray-600/50 text-sm tracking-wider">
                   <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
                   GÜVENLİ ÇIKIŞ
               </button>
           </div>
        </div>
      </div>
    );
  }

  // GİRİŞ YAPILMAMIŞSA -> LOGIN FORM GÖSTER
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center overflow-hidden">
      <div className="absolute inset-0 bg-black/90"></div>
      
      <div className={`relative z-10 w-full max-w-md p-8 glass-panel rounded-2xl shadow-2xl animate-fade-in border-t-4 border-[#FF3D00] ${shake ? 'animate-shake' : ''}`}>
        <div className="text-center mb-10">
            <div className="flex justify-center mb-6">
                {/* LOGO GÜNCELLEMESİ */}
                <img src="/deepeak_ana_logo.png" className="h-20 object-contain drop-shadow-lg" alt="Deepeak Logo" />
            </div>
            <p className="text-gray-500 text-xs mt-2 tracking-[0.3em] uppercase font-bold">Yetkili Giriş Sistemi</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
            <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">E-Posta</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                      <User className="w-5 h-5" />
                    </div>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field w-full pl-10 pr-4 py-3.5 rounded-xl" placeholder="admin@deepeak.com" required />
                </div>
            </div>
            
            <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">Şifre</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                      <Lock className="w-5 h-5" />
                    </div>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field w-full pl-10 pr-4 py-3.5 rounded-xl" placeholder="••••" required />
                </div>
            </div>

            {error && <div className="text-red-400 text-sm text-center bg-red-900/30 p-3 rounded-lg border border-red-800/50 font-bold">{error}</div>}

            <button type="submit" disabled={loading} className="w-full btn-brand font-bold py-4 rounded-xl shadow-lg tracking-wide uppercase text-sm">
                {/* METİN GÜNCELLEMESİ */}
                {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
            </button>
        </form>
        
        <div className="mt-8 text-center text-[10px] text-gray-600 font-mono uppercase">
            &copy; 2025 DEEPEAK Technology Systems
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
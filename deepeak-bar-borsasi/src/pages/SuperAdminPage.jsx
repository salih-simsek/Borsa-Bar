import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase'; // firebase.js'den import
import { collection, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Shield, Power, LogOut, ExternalLink, RefreshCw } from 'lucide-react';

const SuperAdminPage = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Şirketleri Listele
  const fetchCompanies = async () => {
    setLoading(true);
    try {
      // Not: Normalde auth users listelenemez, bu yüzden
      // her müşteri oluştuğunda 'companies' koleksiyonunda bir ana döküman yaratmalıyız.
      // Bu panel o dökümanları okur.
      const querySnapshot = await getDocs(collection(db, "companies"));
      const list = [];
      querySnapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setCompanies(list);
    } catch (error) {
      console.error("Hata:", error);
      alert("Yetkiniz yok veya veri çekilemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  // Lisans Durumu Değiştir (Active / Suspended)
  const toggleStatus = async (company) => {
    const newStatus = company.licenseStatus === 'active' ? 'suspended' : 'active';
    if(!confirm(`Bu işletmeyi ${newStatus === 'active' ? 'AKTİF' : 'PASİF'} yapmak istediğine emin misin?`)) return;

    try {
      await updateDoc(doc(db, "companies", company.id), {
        licenseStatus: newStatus
      });
      // Listeyi güncelle
      setCompanies(companies.map(c => c.id === company.id ? {...c, licenseStatus: newStatus} : c));
    } catch (error) {
      alert("Güncelleme hatası: " + error.message);
    }
  };

  // Manuel Olarak Şirket Dökümanı Oluştur (Eğer yoksa)
  // Müşteriyi Auth'dan ekledikten sonra buraya gelip ID'sini girip "Başlat" demen gerekir.
  const initCompany = async () => {
      const uid = prompt("B0sOTRSkJ2NFlBAhkPKeHohheFD3");
      const name = prompt("İşletme Adı:");
      if(uid && name) {
          await setDoc(doc(db, "companies", uid), {
              name: name,
              licenseStatus: 'active',
              createdAt: new Date().toISOString()
          });
          fetchCompanies();
      }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <Shield className="w-10 h-10 text-blue-500" />
            <h1 className="text-3xl font-bold">Deepeak Super Admin</h1>
          </div>
          <button onClick={() => { auth.signOut(); navigate('/login'); }} className="bg-red-600 px-4 py-2 rounded font-bold flex gap-2">
            <LogOut size={20}/> Çıkış
          </button>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 shadow-xl border border-gray-700">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Müşteri Listesi</h2>
            <div className="flex gap-2">
                <button onClick={fetchCompanies} className="p-2 bg-gray-700 rounded hover:bg-gray-600"><RefreshCw size={20}/></button>
                <button onClick={initCompany} className="bg-blue-600 px-4 py-2 rounded font-bold hover:bg-blue-500">+ Yeni Şirket Başlat</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-700 text-gray-300 uppercase text-sm">
                <tr>
                  <th className="p-4">İşletme Adı</th>
                  <th className="p-4">UID</th>
                  <th className="p-4">Durum</th>
                  <th className="p-4 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {companies.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-750">
                    <td className="p-4 font-bold">{c.name || "İsimsiz"}</td>
                    <td className="p-4 font-mono text-xs text-gray-400">{c.id}</td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${c.licenseStatus === 'active' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                        {c.licenseStatus === 'active' ? 'AKTİF' : 'PASİF'}
                      </span>
                    </td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      <button 
                        onClick={() => toggleStatus(c)}
                        className={`p-2 rounded ${c.licenseStatus === 'active' ? 'bg-red-600/20 text-red-400 border border-red-600' : 'bg-green-600/20 text-green-400 border border-green-600'}`}
                      >
                        <Power size={18} />
                      </button>
                      <a href={`/tv/${c.id}`} target="_blank" className="p-2 bg-blue-600/20 text-blue-400 border border-blue-600 rounded">
                        <ExternalLink size={18} />
                      </a>
                    </td>
                  </tr>
                ))}
                {companies.length === 0 && !loading && (
                    <tr><td colSpan="4" className="p-8 text-center text-gray-500">Henüz müşteri yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminPage;
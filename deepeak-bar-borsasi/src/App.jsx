import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TvPage from './pages/TvPage';     // Birazdan oluşturacağız
import AdminPage from './pages/AdminPage'; // Birazdan oluşturacağız
import LoginPage from './pages/LoginPage'; // Admin girişi için

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* TV Ekranı Ana Sayfa Olacak */}
        <Route path="/" element={<TvPage />} />
        
        {/* Admin Paneli */}
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import TvPage from './pages/TvPage';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import SuperAdminPage from './pages/SuperAdminPage'; // YENİ EKLENDİ

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        {/* İşletme Sahibi Paneli */}
        <Route path="/admin" element={<AdminPage />} />
        
        {/* Gizli Super Admin Paneli */}
        <Route path="/super-admin" element={<SuperAdminPage />} />
        
        {/* TV Ekranı */}
        <Route path="/tv/:companyId" element={<TvPage />} />

        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
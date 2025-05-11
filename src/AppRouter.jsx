// src/AppRouter.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { auth, onAuthStateChanged } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import App from './App';
import Login from './components/Login';
import AdminPanel from './components/Admin/AdminPanel';

const AppRouter = () => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("Auth state changed:", currentUser ? "logged in" : "logged out");
      
      if (currentUser) {
        setUser(currentUser);
        
        // Verifica il ruolo admin
        try {
          const docRef = doc(db, "users", currentUser.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const userData = docSnap.data();
            setIsAdmin(userData.role === "admin");
          } else {
            setIsAdmin(false);
          }
        } catch (error) {
          console.error("Errore nel controllo del ruolo admin:", error);
          setIsAdmin(false);
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading">Caricamento in corso...</div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/admin/*" element={user && isAdmin ? <AdminPanel /> : <Navigate to="/login" />} />
        <Route path="/*" element={user ? <App /> : <Navigate to="/login" />} />
      </Routes>
    </Router>
  );
};

export default AppRouter;
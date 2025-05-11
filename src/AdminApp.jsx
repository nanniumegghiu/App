// src/AdminApp.jsx
import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import Header from './components/Header';
import './admin.css';

function AdminApp() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Verifica se l'utente è loggato e se è un amministratore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          // Verifica il ruolo dell'utente
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists() && userDoc.data().role === "admin") {
            setUser(currentUser);
            setIsAdmin(true);
          } else {
            // Non è un amministratore, disconnetterlo
            auth.signOut();
            setUser(null);
            setIsAdmin(false);
          }
        } catch (error) {
          console.error("Errore durante la verifica del ruolo:", error);
          setUser(null);
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
      <div className="admin-loading">
        <div className="spinner"></div>
        <p>Caricamento...</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <AdminLogin onLogin={(user) => setUser(user)} />;
  }

  return (
    <div className="AdminApp">
      <Header isAdmin={true} />
      <AdminDashboard />
    </div>
  );
}

export default AdminApp;
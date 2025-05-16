// src/components/AdminLogin.jsx - Versione corretta che assicura la creazione del documento utente
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export default function AdminLogin({ onLogin }) {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Funzione per assicurarsi che esista un documento utente in Firestore
  const ensureUserDocumentExists = async (user) => {
    try {
      console.log(`Verifica documento admin per UID: ${user.uid}`);
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        // Il documento non esiste, lo creiamo
        console.log("Documento admin non trovato, creazione in corso...");
        await setDoc(userDocRef, {
          email: user.email,
          role: "admin", // Assicuriamoci che abbia il ruolo admin
          createdAt: new Date(),
          lastLogin: new Date()
        });
        console.log("Documento admin creato con successo");
      } else {
        // Documento esiste già, aggiorniamo solo lastLogin
        console.log("Documento admin esistente, aggiornamento lastLogin");
        await setDoc(userDocRef, { 
          lastLogin: new Date(),
          role: "admin" // Assicuriamoci che abbia ancora il ruolo admin
        }, { merge: true });
      }
    } catch (error) {
      console.error("Errore nella gestione del documento admin:", error);
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      // Autenticazione con Firebase
      console.log("Tentativo di login admin:", email);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      console.log("Login riuscito, verifica ruolo admin...");
      
      // Verifica che l'utente sia un amministratore
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists() && userDoc.data().role === "admin") {
        // Login come admin riuscito
        console.log("Login admin confermato");
        
        // Aggiorna il documento utente
        await ensureUserDocumentExists(user);
        
        onLogin(user);
      } else if (!userDoc.exists()) {
        // Documento non esiste, lo creiamo con ruolo admin (assumendo che sia un nuovo admin)
        console.log("Nessun documento utente trovato, creazione nuovo admin");
        
        await setDoc(userDocRef, {
          email: user.email,
          role: "admin",
          createdAt: new Date(),
          lastLogin: new Date()
        });
        
        console.log("Nuovo admin creato con successo");
        onLogin(user);
      } else {
        // L'utente non è un amministratore
        console.log("Accesso negato: l'utente non è un admin");
        await auth.signOut();
        setError("Accesso non autorizzato. Solo gli amministratori possono accedere a questa pagina.");
      }
    } catch (err) {
      console.error("Errore durante il login admin:", err);
      setError("Credenziali non valide. Riprova.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Gestionale Iacuzzo Construction Group</h1>
          <h2>Accesso Amministratore</h2>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email amministratore</label>
            <input 
              id="email" 
              name="email" 
              type="email" 
              placeholder="admin@azienda.com" 
              required 
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input 
              id="password" 
              name="password" 
              type="password" 
              placeholder="••••••••" 
              required 
            />
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <button 
            type="submit" 
            className="submit-button"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="loader"></span>
            ) : (
              "Accedi come Amministratore"
            )}
          </button>
        </form>
        
        <div className="admin-info">
          <p>Questa pagina è riservata agli amministratori del sistema.</p>
          <a href="/">Torna alla pagina di login utente</a>
        </div>
      </div>
    </div>
  );
}
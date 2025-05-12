// src/components/Login.jsx - Con opzione per salvare le credenziali
import { useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, setDoc } from "firebase/firestore";

export default function Login({ onLogin }) {
  const [error, setError] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [savedEmail, setSavedEmail] = useState("");

  // Recupera l'email salvata al caricamento del componente
  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setSavedEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const email = e.target.email.value;
    const password = e.target.password.value;

    // Gestisce il salvataggio dell'email
    if (rememberMe) {
      localStorage.setItem("rememberedEmail", email);
    } else {
      localStorage.removeItem("rememberedEmail");
    }

    try {
      if (isRegistering) {
        const nome = e.target.nome.value;
        const cognome = e.target.cognome.value;
        
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
          nome,
          cognome,
          email: user.email,
          role: "user", // Imposta sempre il ruolo come utente normale
          createdAt: new Date()
        });

        onLogin(user);
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        onLogin(userCredential.user);
      }
    } catch (err) {
      let errorMessage = "Si è verificato un errore. Riprova.";
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        errorMessage = "Credenziali non valide. Verifica email e password.";
      } else if (err.code === "auth/email-already-in-use") {
        errorMessage = "Questa email è già registrata. Prova ad accedere.";
      } else if (err.code === "auth/weak-password") {
        errorMessage = "La password deve contenere almeno 6 caratteri.";
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle per cambiare la modalità di registrazione/login
  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError("");
  };

  // Toggle per l'opzione "ricordami"
  const toggleRememberMe = () => {
    setRememberMe(!rememberMe);
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="login-branding">
            <div className="login-logo">
              <svg width="50" height="50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path 
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" 
                  fill="#3498db"
                />
              </svg>
            </div>
            <h1>Gestione Ore</h1>
          </div>
          
          <div className="login-header">
            <h2>{isRegistering ? "Crea un nuovo account" : "Benvenuto"}</h2>
            <p>
              {isRegistering 
                ? "Inserisci i dati per creare un nuovo profilo" 
                : "Accedi per gestire le tue ore lavorative"}
            </p>
          </div>
          
          <form onSubmit={handleSubmit}>
            {isRegistering && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="nome">Nome</label>
                  <input 
                    id="nome" 
                    name="nome" 
                    type="text" 
                    placeholder="Mario" 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="cognome">Cognome</label>
                  <input 
                    id="cognome" 
                    name="cognome" 
                    type="text" 
                    placeholder="Rossi" 
                    required 
                  />
                </div>
              </div>
            )}
            
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <div className="input-icon-wrapper">
                <span className="input-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 8L12 13L4 8V6L12 11L20 6V8Z" fill="#95a5a6"/>
                  </svg>
                </span>
                <input 
                  id="email" 
                  name="email" 
                  type="email" 
                  placeholder="nome@azienda.com" 
                  defaultValue={savedEmail}  // Usa l'email salvata se presente
                  required 
                />
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="input-icon-wrapper">
                <span className="input-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z" fill="#95a5a6"/>
                  </svg>
                </span>
                <input 
                  id="password" 
                  name="password" 
                  type="password" 
                  placeholder="••••••••" 
                  required 
                />
              </div>
            </div>
            
            {!isRegistering && (
              <div className="remember-me">
                <label className="checkbox-container">
                  <input 
                    type="checkbox" 
                    checked={rememberMe} 
                    onChange={toggleRememberMe} 
                  />
                  <span className="checkmark"></span>
                  <span className="checkbox-label">Ricorda le mie credenziali</span>
                </label>
              </div>
            )}
            
            {error && <div className="error-message">{error}</div>}
            
            <button 
              type="submit" 
              className="submit-button"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="loader-container">
                  <span className="loader"></span>
                  <span>Attendere...</span>
                </div>
              ) : (
                isRegistering ? "Registrati" : "Accedi"
              )}
            </button>
          </form>
          
          <div className="toggle-form">
            <p>
              {isRegistering 
                ? "Hai già un account?" 
                : "Non hai un account?"}
            </p>
            <button 
              type="button" 
              className="toggle-button"
              onClick={toggleMode}
            >
              {isRegistering 
                ? "Accedi" 
                : "Registrati"}
            </button>
          </div>
        </div>
      </div>
      <div className="login-footer">
        <p>© 2025 Gestione Ore Lavorative - Tutti i diritti riservati</p>
      </div>
    </div>
  );
}
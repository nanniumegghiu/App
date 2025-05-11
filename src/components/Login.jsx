// src/components/Login.jsx - Updated with admin seeding option
import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

export default function Login({ onLogin }) {
  const [error, setError] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdminSetup, setShowAdminSetup] = useState(false);
  const [adminSecret, setAdminSecret] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      if (isRegistering) {
        const nome = e.target.nome.value;
        const cognome = e.target.cognome.value;
        
        // Check if this is an admin registration
        const isAdmin = showAdminSetup && adminSecret === "admin123"; // Simple secret key (change in production)
        
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
          nome,
          cognome,
          email: user.email,
          role: isAdmin ? "admin" : "user", // Set role based on admin setup
          createdAt: new Date()
        });

        onLogin(user);
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        onLogin(userCredential.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle admin setup section
  const toggleAdminSetup = () => {
    setShowAdminSetup(!showAdminSetup);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Gestione Ore Lavorative</h1>
          <h2>{isRegistering ? "Crea un nuovo account" : "Accedi al tuo account"}</h2>
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
                  placeholder="Inserisci il tuo nome" 
                  required 
                />
              </div>
              <div className="form-group">
                <label htmlFor="cognome">Cognome</label>
                <input 
                  id="cognome" 
                  name="cognome" 
                  type="text" 
                  placeholder="Inserisci il tuo cognome" 
                  required 
                />
              </div>
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input 
              id="email" 
              name="email" 
              type="email" 
              placeholder="nome@azienda.com" 
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
          
          {/* Admin setup section - only visible during registration */}
          {isRegistering && (
            <div className="admin-setup">
              <button 
                type="button" 
                onClick={toggleAdminSetup}
                className="toggle-button"
                style={{ marginBottom: '10px', fontSize: '0.8em' }}
              >
                {showAdminSetup ? "Nascondi impostazioni admin" : "Registra come amministratore"}
              </button>
              
              {showAdminSetup && (
                <div className="form-group">
                  <label htmlFor="adminSecret">Codice Admin</label>
                  <input 
                    id="adminSecret" 
                    type="password" 
                    value={adminSecret}
                    onChange={(e) => setAdminSecret(e.target.value)}
                    placeholder="Inserisci il codice admin" 
                  />
                  <p style={{ fontSize: '0.8em', color: '#666', marginTop: '5px' }}>
                    Per creare un account amministratore, inserisci il codice di autorizzazione.
                  </p>
                </div>
              )}
            </div>
          )}
          
          {error && <div className="error-message">{error}</div>}
          
          <button 
            type="submit" 
            className="submit-button"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="loader"></span>
            ) : (
              isRegistering ? "Registrati" : "Accedi"
            )}
          </button>
        </form>
        
        <div className="toggle-form">
          <button 
            type="button" 
            className="toggle-button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setShowAdminSetup(false); // Reset admin setup when toggling form
            }}
          >
            {isRegistering 
              ? "Hai già un account? Accedi" 
              : "Non hai un account? Registrati"}
          </button>
        </div>
      </div>
    </div>
  );
}
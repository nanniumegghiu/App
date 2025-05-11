import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

export default function AdminLogin({ onLogin }) {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      // Autenticazione con Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Verifica che l'utente sia un amministratore
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (userDoc.exists() && userDoc.data().role === "admin") {
        // Login come admin riuscito
        onLogin(user);
      } else {
        // L'utente non è un amministratore
        await auth.signOut();
        setError("Accesso non autorizzato. Solo gli amministratori possono accedere a questa pagina.");
      }
    } catch (err) {
      setError("Credenziali non valide. Riprova.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Gestione Ore Lavorative</h1>
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
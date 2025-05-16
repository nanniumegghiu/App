// src/components/Login.jsx - Versione con conferma email e password
import { useState, useEffect } from "react";
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
  const [rememberMe, setRememberMe] = useState(false);
  const [savedEmail, setSavedEmail] = useState("");
  
  // Form data state
  const [formData, setFormData] = useState({
    nome: '',
    cognome: '',
    email: '',
    confirmEmail: '',
    password: '',
    confirmPassword: ''
  });
  
  // Validazione form
  const [formErrors, setFormErrors] = useState({});

  // Recupera l'email salvata al caricamento del componente
  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setSavedEmail(savedEmail);
      setRememberMe(true);
      setFormData(prev => ({ ...prev, email: savedEmail }));
    }
  }, []);

  // Reset del form quando cambia la modalità
  useEffect(() => {
    if (!isRegistering) {
      // Quando si passa a login, mantieni solo email
      const email = formData.email || savedEmail || '';
      setFormData({
        nome: '',
        cognome: '',
        email: email,
        confirmEmail: '',
        password: '',
        confirmPassword: ''
      });
    } else {
      // Quando si passa a registrazione, reset completo
      setFormData({
        nome: '',
        cognome: '',
        email: '',
        confirmEmail: '',
        password: '',
        confirmPassword: ''
      });
    }
    
    // Reset degli errori
    setFormErrors({});
    setError("");
  }, [isRegistering]);

  // Gestisce i cambiamenti nei campi del form
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Rimuovi gli errori quando l'utente modifica il campo
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  // Funzione che crea il documento utente in Firestore
  const createUserDocument = async (userId, userData) => {
    try {
      console.log(`Creazione documento utente per ID: ${userId}`);
      const userDocRef = doc(db, "users", userId);
      
      // Crea il documento utente
      await setDoc(userDocRef, userData);
      console.log("Documento utente creato con successo");
      
      return true;
    } catch (error) {
      console.error("Errore durante la creazione del documento utente:", error);
      throw error;
    }
  };

  // Validazione del form prima dell'invio
  const validateForm = () => {
    const errors = {};
    
    if (isRegistering) {
      // Validazione per la registrazione
      if (!formData.nome || formData.nome.trim() === '') {
        errors.nome = "Il nome è obbligatorio";
      }
      
      if (!formData.cognome || formData.cognome.trim() === '') {
        errors.cognome = "Il cognome è obbligatorio";
      }
      
      if (!formData.email || formData.email.trim() === '') {
        errors.email = "L'email è obbligatoria";
      } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
        errors.email = "Inserisci un'email valida";
      }
      
      if (!formData.confirmEmail || formData.confirmEmail.trim() === '') {
        errors.confirmEmail = "Conferma la tua email";
      } else if (formData.email !== formData.confirmEmail) {
        errors.confirmEmail = "Le email non corrispondono";
      }
      
      if (!formData.password) {
        errors.password = "La password è obbligatoria";
      } else if (formData.password.length < 6) {
        errors.password = "La password deve contenere almeno 6 caratteri";
      }
      
      if (!formData.confirmPassword) {
        errors.confirmPassword = "Conferma la tua password";
      } else if (formData.password !== formData.confirmPassword) {
        errors.confirmPassword = "Le password non corrispondono";
      }
    } else {
      // Validazione per il login
      if (!formData.email || formData.email.trim() === '') {
        errors.email = "L'email è obbligatoria";
      }
      
      if (!formData.password) {
        errors.password = "La password è obbligatoria";
      }
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    
    // Validazione form
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);

    // Gestisce il salvataggio dell'email
    if (rememberMe) {
      localStorage.setItem("rememberedEmail", formData.email);
    } else {
      localStorage.removeItem("rememberedEmail");
    }

    try {
      if (isRegistering) {
        // REGISTRAZIONE UTENTE
        console.log(`Avvio processo di registrazione per ${formData.email}`);
        
        // 1. Crea l'utente in Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        const user = userCredential.user;
        
        console.log(`Utente creato in Authentication con UID: ${user.uid}`);
        
        // 2. Crea il documento utente in Firestore
        const userData = {
          nome: formData.nome,
          cognome: formData.cognome,
          email: formData.email,
          role: "user",
          createdAt: new Date(),
          lastLogin: new Date()
        };
        
        // 3. Chiamata alla funzione di creazione documento
        await createUserDocument(user.uid, userData);
        
        // 4. Completa il processo di login
        onLogin(user);
      } else {
        // LOGIN UTENTE ESISTENTE
        console.log(`Avvio processo di login per ${formData.email}`);
        
        // 1. Autenticazione con Firebase
        const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
        const user = userCredential.user;
        
        console.log(`Login riuscito per UID: ${user.uid}`);
        
        // 2. Verifica se esiste il documento utente
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        // 3. Se il documento non esiste, crealo
        if (!userDoc.exists()) {
          console.log(`Documento utente non trovato, creazione...`);
          
          const userData = {
            email: formData.email,
            role: "user",
            createdAt: new Date(),
            lastLogin: new Date()
          };
          
          await createUserDocument(user.uid, userData);
        } else {
          console.log(`Documento utente esistente, aggiornamento lastLogin`);
          
          // 4. Aggiorna l'ultimo accesso
          await setDoc(userDocRef, { lastLogin: new Date() }, { merge: true });
        }
        
        // 5. Completa il processo di login
        onLogin(user);
      }
    } catch (err) {
      console.error("Errore durante l'autenticazione:", err);
      
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
                    value={formData.nome}
                    onChange={handleInputChange}
                    className={formErrors.nome ? 'error' : ''}
                  />
                  {formErrors.nome && <div className="error-message-field">{formErrors.nome}</div>}
                </div>
                <div className="form-group">
                  <label htmlFor="cognome">Cognome</label>
                  <input 
                    id="cognome" 
                    name="cognome" 
                    type="text" 
                    placeholder="Rossi" 
                    value={formData.cognome}
                    onChange={handleInputChange}
                    className={formErrors.cognome ? 'error' : ''}
                  />
                  {formErrors.cognome && <div className="error-message-field">{formErrors.cognome}</div>}
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
                  value={formData.email}
                  onChange={handleInputChange}
                  className={formErrors.email ? 'error' : ''}
                />
              </div>
              {formErrors.email && <div className="error-message-field">{formErrors.email}</div>}
            </div>
            
            {isRegistering && (
              <div className="form-group">
                <label htmlFor="confirmEmail">Ripeti Email</label>
                <div className="input-icon-wrapper">
                  <span className="input-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 8L12 13L4 8V6L12 11L20 6V8Z" fill="#95a5a6"/>
                    </svg>
                  </span>
                  <input 
                    id="confirmEmail" 
                    name="confirmEmail" 
                    type="email" 
                    placeholder="Ripeti la tua email"
                    value={formData.confirmEmail}
                    onChange={handleInputChange}
                    className={formErrors.confirmEmail ? 'error' : ''}
                  />
                </div>
                {formErrors.confirmEmail && <div className="error-message-field">{formErrors.confirmEmail}</div>}
              </div>
            )}
            
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
                  value={formData.password}
                  onChange={handleInputChange}
                  className={formErrors.password ? 'error' : ''}
                />
              </div>
              {formErrors.password && <div className="error-message-field">{formErrors.password}</div>}
            </div>
            
            {isRegistering && (
              <div className="form-group">
                <label htmlFor="confirmPassword">Ripeti Password</label>
                <div className="input-icon-wrapper">
                  <span className="input-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z" fill="#95a5a6"/>
                    </svg>
                  </span>
                  <input 
                    id="confirmPassword" 
                    name="confirmPassword" 
                    type="password" 
                    placeholder="••••••••" 
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className={formErrors.confirmPassword ? 'error' : ''}
                  />
                </div>
                {formErrors.confirmPassword && <div className="error-message-field">{formErrors.confirmPassword}</div>}
              </div>
            )}
            
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
// src/components/UserQRCode.jsx (con verifica di stato)
import React, { useState, useRef, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import logoImg from '../assets/logo.png';

/**
 * Componente per visualizzare e scaricare il QR code personale dell'utente
 * @param {Object} props 
 * @param {string} props.className - Classe CSS opzionale
 * @returns {JSX.Element}
 */
const UserQRCode = ({ className = '' }) => {
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [isQRActive, setIsQRActive] = useState(true); // Stato di attivazione del QR
  const [disabledReason, setDisabledReason] = useState(''); // Motivo della disattivazione
  const qrRef = useRef(null);
  const logoRef = useRef(new Image());

  // Carica il logo
  useEffect(() => {
    const img = logoRef.current;
    img.src = logoImg;
    img.onload = () => {
      console.log("Logo caricato con successo");
      setLogoLoaded(true);
    };
    img.onerror = (error) => {
      console.error('Errore nel caricamento del logo:', error);
      // In caso di errore, utilizziamo un logo generato
      generateDefaultLogo();
    };
  }, []);

  // Genera un logo predefinito in caso di errore
  const generateDefaultLogo = () => {
    try {
      const canvas = document.createElement('canvas');
      const size = 100;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      // Disegna un cerchio con sfondo bianco
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2, 0, 2 * Math.PI);
      ctx.fill();
      
      // Disegna il bordo
      ctx.strokeStyle = '#3498db';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2 - 3, 0, 2 * Math.PI);
      ctx.stroke();
      
      // Disegna le lettere "IC" (per Iacuzzo Construction)
      ctx.fillStyle = '#2c3e50';
      ctx.font = 'bold 40px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('IC', size/2, size/2);
      
      // Imposta il logo generato come src dell'immagine
      logoRef.current.src = canvas.toDataURL();
      setLogoLoaded(true);
    } catch (error) {
      console.error('Errore nella generazione del logo:', error);
    }
  };

  // Ottieni i dati dell'utente al caricamento del componente
  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoading(true);
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          // Imposta l'ID utente per il QR code
          setUserId(currentUser.uid);
          
          // Ottieni i dati dell'utente da Firestore
          const userDocRef = doc(db, "users", currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            
            // Imposta il nome dell'utente se disponibile
            if (userData.nome && userData.cognome) {
              setUserName(`${userData.nome} ${userData.cognome}`);
            } else {
              setUserName(currentUser.email || 'Utente');
            }
            
            // Controlla se il QR code è attivo
            if (userData.qrStatus) {
              setIsQRActive(userData.qrStatus.active !== false); // Default a true se non specificato
              setDisabledReason(userData.qrStatus.reason || 'Contatta l\'amministratore');
            }
          } else {
            // Se il documento utente non esiste, usa l'email
            setUserName(currentUser.email || 'Utente');
          }
        }
      } catch (error) {
        console.error('Errore nel recupero dei dati utente:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  // Genera il valore del QR code
  const getQRValue = () => {
    // Formato: iacuzzo:user:[userId]:[timestamp]
    // Il timestamp garantisce ulteriore unicità
    const timestamp = new Date().getTime();
    return `iacuzzo:user:${userId}:${timestamp}`;
  };

  // Funzione per scaricare il QR code come immagine PNG
  const downloadQRCode = () => {
    if (!qrRef.current || !isQRActive) return;
    
    try {
      // Converti il QR code in un'immagine
      const canvas = qrRef.current.querySelector('canvas');
      if (!canvas) {
        console.error('Canvas del QR code non trovato');
        return;
      }
      
      // Crea un link per il download
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `qrcode-iacuzzo-${userId.substring(0, 8)}.png`;
      
      // Simula il click sul link per avviare il download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Errore nel download del QR code:', error);
      alert('Si è verificato un errore durante il download del QR code. Riprova più tardi.');
    }
  };

  if (isLoading) {
    return <div className="qrcode-loading">Caricamento QR code...</div>;
  }

  if (!userId) {
    return <div className="qrcode-error">Impossibile generare il QR code. Utente non autenticato.</div>;
  }

  // Calcola la dimensione ottimale del logo (circa il 20% della dimensione del QR code)
  const qrSize = 250;
  const logoSize = Math.floor(qrSize * 0.22);

  return (
    <div className={`user-qrcode-container ${className} ${!isQRActive ? 'qr-disabled' : ''}`}>
      <div className="qrcode-header">
        <h3>Il tuo QR Code personale</h3>
        <p className="qrcode-description">
          Usa questo codice per le operazioni di check-in/check-out
        </p>
      </div>

      <div className="qrcode-wrapper" ref={qrRef}>
        {!isQRActive && (
          <div className="qrcode-disabled-overlay">
            <div className="disabled-text">DISABILITATO</div>
          </div>
        )}
        <QRCodeCanvas 
          value={getQRValue()} 
          size={qrSize}
          level="H" // Usa "H" (High) per maggiore correzione errori quando c'è un logo
          includeMargin={true}
          imageSettings={logoLoaded ? {
            src: logoRef.current.src,
            x: undefined,
            y: undefined,
            height: logoSize,
            width: logoSize,
            excavate: true, // Crea spazio per il logo (rimuove i moduli QR)
          } : undefined}
        />
        {!isQRActive && (
          <div className="qr-status-badge inactive">
            Disattivato
          </div>
        )}
        {isQRActive && (
          <div className="qr-status-badge active">
            Attivo
          </div>
        )}
      </div>

      <div className="user-details">
        <p><strong>Utente:</strong> {userName}</p>
        <p><strong>ID:</strong> {userId.substring(0, 8)}...</p>
      </div>

      {!isQRActive && (
        <div className="qrcode-disabled-message">
          <p><strong>QR Code disabilitato</strong></p>
          <p>{disabledReason}</p>
        </div>
      )}

      <div className="qrcode-actions">
        <button 
          className="btn btn-primary download-qr-btn"
          onClick={downloadQRCode}
          disabled={!isQRActive}
        >
          <span className="download-icon">⬇️</span> Scarica QR Code
        </button>
      </div>

      <p className="qrcode-note">
        * Conserva questo QR code. Ti servirà per registrare le tue presenze.
      </p>
    </div>
  );
};

export default UserQRCode;
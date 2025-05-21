// src/components/Admin/AdminQRManagement.jsx
import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { QRCodeCanvas } from 'qrcode.react';
import logoImg from '../../assets/logo.png';

/**
 * Componente per la gestione dei QR code degli utenti da parte dell'amministratore
 */
const AdminQRManagement = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [updating, setUpdating] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');

  // Carica il logo
  useEffect(() => {
    const img = new Image();
    img.src = logoImg;
    img.onload = () => {
      setLogoLoaded(true);
      // Crea una data URL dal logo
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      setLogoUrl(canvas.toDataURL());
    };
    img.onerror = (error) => {
      console.error('Errore nel caricamento del logo:', error);
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
      
      // Imposta il logo generato
      setLogoUrl(canvas.toDataURL());
      setLogoLoaded(true);
    } catch (error) {
      console.error('Errore nella generazione del logo:', error);
    }
  };

  // Carica gli utenti
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        // Ottieni tutti gli utenti non-admin
        const usersQuery = query(collection(db, "users"), where("role", "!=", "admin"));
        const querySnapshot = await getDocs(usersQuery);
        
        const usersData = [];
        
        // Per ogni utente, ottieni anche lo stato QR code
        for (const userDoc of querySnapshot.docs) {
          const userData = userDoc.data();
          
          // Verifica se l'utente ha una configurazione qrStatus
          let qrStatus = { active: true }; // Default: QR attivo
          
          if (userData.qrStatus) {
            qrStatus = userData.qrStatus;
          }
          
          usersData.push({
            id: userDoc.id,
            email: userData.email,
            nome: userData.nome || '',
            cognome: userData.cognome || '',
            qrStatus: qrStatus
          });
        }
        
        setUsers(usersData);
        setFilteredUsers(usersData);
        setError(null);
      } catch (err) {
        console.error("Errore nel caricamento degli utenti:", err);
        setError("Impossibile caricare gli utenti. Riprova più tardi.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUsers();
  }, []);

  // Filtra gli utenti in base al termine di ricerca
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredUsers(users);
    } else {
      const lowercasedSearch = searchTerm.toLowerCase();
      const filtered = users.filter(user => 
        user.email.toLowerCase().includes(lowercasedSearch) ||
        user.nome.toLowerCase().includes(lowercasedSearch) ||
        user.cognome.toLowerCase().includes(lowercasedSearch)
      );
      setFilteredUsers(filtered);
    }
  }, [searchTerm, users]);

  // Cambia lo stato del QR code (attivo/disattivo)
  const toggleQRStatus = async (userId, currentStatus) => {
    setUpdating(true);
    try {
      const newStatus = !currentStatus;
      const userRef = doc(db, "users", userId);
      
      // Aggiorna lo stato nel database
      await updateDoc(userRef, {
        "qrStatus.active": newStatus,
        "qrStatus.lastUpdated": new Date(),
        "qrStatus.reason": newStatus ? "" : "Disabilitato dall'amministratore"
      });
      
      // Aggiorna lo stato locale
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user.id === userId 
            ? { ...user, qrStatus: { ...user.qrStatus, active: newStatus } } 
            : user
        )
      );
      
      // Mostra notifica
      setNotification({
        show: true,
        message: `QR code ${newStatus ? 'attivato' : 'disattivato'} con successo`,
        type: 'success'
      });
      
      // Nascondi la notifica dopo 3 secondi
      setTimeout(() => {
        setNotification(prev => ({ ...prev, show: false }));
      }, 3000);
    } catch (error) {
      console.error("Errore nell'aggiornamento dello stato QR code:", error);
      setNotification({
        show: true,
        message: `Errore: ${error.message}`,
        type: 'error'
      });
    } finally {
      setUpdating(false);
    }
  };

  // Genera un valore QR code per l'anteprima
  const getQRValue = (userId) => {
    return `iacuzzo:user:${userId}:preview`;
  };

  // Scarica il QR code di un utente
  const downloadQRCode = (userId, userName) => {
    const qrElement = document.getElementById(`qr-${userId}`);
    if (!qrElement) return;
    
    try {
      // Trova il canvas nel QR code
      const canvas = qrElement.querySelector('canvas');
      if (!canvas) {
        console.error('Canvas del QR code non trovato');
        return;
      }
      
      // Crea un link per il download
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `qrcode-${userName.replace(/\s+/g, '-')}.png`;
      
      // Simula il click sul link per avviare il download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Errore nel download del QR code:', error);
      alert('Si è verificato un errore durante il download del QR code.');
    }
  };

  return (
    <div className="admin-qr-management">
      <h3>Gestione QR Code Utenti</h3>
      
      {notification.show && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
          <button className="close-notification" onClick={() => setNotification(prev => ({ ...prev, show: false }))}>×</button>
        </div>
      )}
      
      <div className="search-bar">
        <input
          type="text"
          placeholder="Cerca utente per nome o email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <div className="total-users">
          Utenti totali: <strong>{users.length}</strong>
        </div>
      </div>
      
      {isLoading ? (
        <div className="loading">Caricamento utenti...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : filteredUsers.length === 0 ? (
        <div className="no-results">Nessun utente trovato</div>
      ) : (
        <div className="users-grid">
          {filteredUsers.map(user => {
            const userName = user.nome && user.cognome ? `${user.nome} ${user.cognome}` : user.email;
            const isQRActive = user.qrStatus?.active !== false; // Default a true se non specificato
            
            return (
              <div key={user.id} className={`user-qr-card ${isQRActive ? '' : 'qr-disabled'}`}>
                <div className="user-info">
                  <h4>{userName}</h4>
                  <p className="user-email">{user.email}</p>
                </div>
                
                <div className="qr-container" id={`qr-${user.id}`}>
                  {isQRActive ? (
                    <>
                      <QRCodeCanvas
                        value={getQRValue(user.id)}
                        size={150}
                        level="H"
                        includeMargin={true}
                        imageSettings={logoLoaded ? {
                          src: logoUrl,
                          height: 33,
                          width: 33,
                          excavate: true
                        } : undefined}
                      />
                      <div className="qr-badge qr-active">Attivo</div>
                    </>
                  ) : (
                    <>
                      <div className="qr-disabled-overlay">
                        <div className="disabled-text">DISABILITATO</div>
                      </div>
                      <QRCodeCanvas
                        value={getQRValue(user.id)}
                        size={150}
                        level="H"
                        includeMargin={true}
                        imageSettings={logoLoaded ? {
                          src: logoUrl,
                          height: 33,
                          width: 33,
                          excavate: true
                        } : undefined}
                      />
                      <div className="qr-badge qr-inactive">Disattivato</div>
                    </>
                  )}
                </div>
                
                <div className="qr-actions">
                  <button
                    className={`btn ${isQRActive ? 'btn-danger' : 'btn-success'} btn-sm`}
                    onClick={() => toggleQRStatus(user.id, isQRActive)}
                    disabled={updating}
                  >
                    {isQRActive ? 'Disattiva QR' : 'Attiva QR'}
                  </button>
                  
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => downloadQRCode(user.id, userName)}
                  >
                    Scarica QR
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminQRManagement;
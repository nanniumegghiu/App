// src/components/TimekeepingScanner.jsx - Modalità kiosk rimodulata
import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import timekeepingService from '../services/timekeepingService';
import Notification from './Notification';
import './timekeepingScanner.css';

/**
 * Component for scanning QR codes for clock-in/out operations
 * Enhanced with redesigned kiosk mode functionality
 */
const TimekeepingScanner = ({ isAdmin = false, deviceId = '', kioskMode = false }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [scanType, setScanType] = useState('');
  const [lastScannedUser, setLastScannedUser] = useState(null);
  const [offlineStorage, setOfflineStorage] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [initializing, setInitializing] = useState(false);
  const [scanStats, setScanStats] = useState({ total: 0, today: 0 });
  
  // Nuovi stati per la modalità kiosk rimodulata
  const [kioskState, setKioskState] = useState('selection'); // 'selection', 'scanning', 'result', 'error'
  const [scannerReady, setScannerReady] = useState(false);
  
  const scannerRef = useRef(null);
  const html5QrCode = useRef(null);
  const isInitialized = useRef(false);

  // Auto-resume scanning after successful scan (rimosso per kiosk)
  const AUTO_RESUME_DELAY = kioskMode ? 0 : 8000; // Disabilitato in kiosk

  // Fetch available cameras
  const fetchCameras = async () => {
    try {
      if (!kioskMode) {
        showNotification("Richiesta permessi camera...", "info");
      }
      
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length) {
        setCameras(devices);
        
        // In modalità kiosk, seleziona automaticamente la camera posteriore se disponibile
        if (kioskMode) {
          const backCamera = devices.find(device => 
            device.label.toLowerCase().includes('back') || 
            device.label.toLowerCase().includes('rear') ||
            device.label.toLowerCase().includes('environment')
          );
          setSelectedCamera(backCamera ? backCamera.id : devices[0].id);
          setScannerReady(true);
        } else {
          setSelectedCamera(devices[0].id);
          showNotification("Permessi camera concessi.", "success");
        }
        
        setError(null);
      } else {
        const errorMsg = "Nessuna camera trovata. Assicurati che il dispositivo abbia una camera funzionante.";
        setError(errorMsg);
        if (!kioskMode) {
          showNotification(errorMsg, "error");
        }
      }
    } catch (err) {
      console.error("Error getting cameras:", err);
      const errorMsg = `Errore permessi camera: ${err.message || "Consenti l'accesso alla camera nelle impostazioni del browser."}`;
      setError(errorMsg);
      if (!kioskMode) {
        showNotification(errorMsg, "error");
      }
    }
  };

  // Initialize scanner on first mount
  useEffect(() => {
    if (!isInitialized.current) {
      fetchCameras();
      loadScanStats();
      isInitialized.current = true;
    }
    
    // In modalità kiosk, nascondi la UI del browser dopo un po'
    if (kioskMode) {
      setTimeout(() => {
        if (window.screen && window.screen.orientation) {
          // Blocca l'orientamento se possibile
          window.screen.orientation.lock('portrait').catch(() => {
            // Ignora errori se non supportato
          });
        }
      }, 2000);
    }
    
    // Cleanup function
    return () => {
      stopScanner();
    };
  }, []);

  // Carica statistiche scansioni
  const loadScanStats = () => {
    try {
      const stats = localStorage.getItem(`scan_stats_${deviceId}`);
      if (stats) {
        setScanStats(JSON.parse(stats));
      }
    } catch (error) {
      console.error("Error loading scan stats:", error);
    }
  };

  // Aggiorna statistiche scansioni
  const updateScanStats = () => {
    try {
      const today = new Date().toDateString();
      const currentStats = { ...scanStats };
      const savedDate = localStorage.getItem(`scan_stats_date_${deviceId}`);
      
      // Reset statistiche giornaliere se è un nuovo giorno
      if (savedDate !== today) {
        currentStats.today = 0;
        localStorage.setItem(`scan_stats_date_${deviceId}`, today);
      }
      
      currentStats.total += 1;
      currentStats.today += 1;
      
      setScanStats(currentStats);
      localStorage.setItem(`scan_stats_${deviceId}`, JSON.stringify(currentStats));
    } catch (error) {
      console.error("Error updating scan stats:", error);
    }
  };

  // Safely stop scanner
  const stopScanner = async () => {
    try {
      setIsScanning(false);
      
      if (html5QrCode.current) {
        const currentState = html5QrCode.current.getState();
        if (currentState === Html5Qrcode.SCANNING || currentState === Html5Qrcode.PAUSED) {
          await html5QrCode.current.stop();
          console.log("Scanner stopped successfully");
        }
      }
    } catch (err) {
      console.error("Error stopping scanner:", err);
      // Reset the scanner reference if stop fails
      html5QrCode.current = null;
    }
  };

  // Start scanning (solo quando chiamato esplicitamente)
  const startScanning = async () => {
    if (!selectedCamera || !scanType) {
      const errorMsg = "Seleziona prima il tipo di timbratura";
      if (kioskMode) {
        setError(errorMsg);
        setKioskState('error');
      } else {
        showNotification(errorMsg, "error");
      }
      return;
    }

    // Stop existing scanner first
    await stopScanner();

    setInitializing(true);
    setError(null);
    setScanResult(null);
    setKioskState('scanning');
    
    try {
      // Create new scanner instance
      html5QrCode.current = new Html5Qrcode("qr-reader");

      const config = {
        fps: kioskMode ? 15 : 10,
        qrbox: kioskMode ? { width: 300, height: 300 } : { width: 250, height: 250 },
        aspectRatio: 1.0,
        disableFlip: false
      };

      await html5QrCode.current.start(
        selectedCamera,
        config,
        async (decodedText, decodedResult) => {
          console.log(`QR Code scanned: ${decodedText}`, decodedResult);
          
          try {
            const parts = decodedText.split(':');
            
            if (parts.length < 3 || parts[0] !== 'iacuzzo' || parts[1] !== 'user') {
              throw new Error("Formato QR code non valido");
            }
            
            const userId = parts[2];
            
            // Ferma lo scanner immediatamente dopo la scansione
            await stopScanner();
            
            // Processa la timbratura
            await processTimekeepingScan(userId, scanType);
            
            setScanResult({
              userId,
              timestamp: new Date().toISOString(),
              success: true,
              type: scanType
            });
            
            // Aggiorna statistiche
            updateScanStats();
            
            // In modalità kiosk, vai allo stato risultato
            if (kioskMode) {
              setKioskState('result');
            }
            
          } catch (err) {
            console.error("Error processing scan:", err);
            await stopScanner();
            setError(err.message || "Errore durante la scansione");
            
            if (kioskMode) {
              setKioskState('error');
            } else {
              showNotification(err.message || "Errore durante la scansione", "error");
            }
          }
        },
        (errorMessage) => {
          // Ignora errori di rilevamento QR comuni per evitare spam
        }
      );
      
      setError(null);
      setInitializing(false);
      setIsScanning(true);
      
      if (!kioskMode) {
        showNotification("Scanner avviato con successo.", "success");
      }
    } catch (err) {
      console.error("Error starting scanner:", err);
      const errorMsg = `Errore avvio scanner: ${err.message || 'Errore sconosciuto'}`;
      setError(errorMsg);
      setIsScanning(false);
      setInitializing(false);
      
      if (kioskMode) {
        setKioskState('error');
      } else {
        showNotification(`${errorMsg}. Prova ad aggiornare la pagina.`, "error");
      }
      
      // Reset scanner reference on error
      html5QrCode.current = null;
    }
  };

  // Handle online/offline status
  useEffect(() => {
    const handleOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      
      if (navigator.onLine && offlineStorage.length > 0) {
        syncOfflineRecords();
      }
    };
    
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    
    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, [offlineStorage]);

  // Load offline storage from localStorage on component mount
  useEffect(() => {
    const savedRecords = localStorage.getItem('timekeeping_offline_records');
    if (savedRecords) {
      try {
        setOfflineStorage(JSON.parse(savedRecords));
      } catch (err) {
        console.error("Error loading offline records:", err);
        localStorage.removeItem('timekeeping_offline_records');
      }
    }
  }, []);

  // Function to process a timekeeping scan
  const processTimekeepingScan = async (userId, type) => {
    try {
      if (!navigator.onLine) {
        const record = {
          type: type === 'in' ? 'clockIn' : 'clockOut',
          userId,
          timestamp: new Date().toISOString(),
          scanInfo: {
            deviceId,
            isAdmin,
            deviceType: kioskMode ? 'kiosk' : 'web-scanner',
            kioskMode
          }
        };
        
        const updatedStorage = [...offlineStorage, record];
        setOfflineStorage(updatedStorage);
        localStorage.setItem('timekeeping_offline_records', JSON.stringify(updatedStorage));
        
        setLastScannedUser({
          userId,
          timestamp: new Date().toISOString(),
          offlineMode: true,
          type
        });
        
        const message = `${type === 'in' ? 'Ingresso' : 'Uscita'} salvato offline. Verrà sincronizzato al ripristino della connessione.`;
        showNotification(message, "warning");
        return;
      }
      
      if (type === 'in') {
        const result = await timekeepingService.clockIn(userId, {
          deviceId,
          isAdmin,
          deviceType: kioskMode ? 'kiosk' : 'web-scanner',
          kioskMode
        });
        
        setLastScannedUser({
          userId,
          userName: result.userName,
          timestamp: new Date().toISOString(),
          type: 'in',
          result
        });
        
        const message = `✅ ${result.userName || userId} ha timbrato l'INGRESSO alle ${result.clockInTime}`;
        showNotification(message, "success");
      } else {
        const result = await timekeepingService.clockOut(userId, {
          deviceId,
          isAdmin,
          deviceType: kioskMode ? 'kiosk' : 'web-scanner',
          kioskMode
        });
        
        setLastScannedUser({
          userId,
          userName: result.userName,
          timestamp: new Date().toISOString(),
          type: 'out',
          result
        });
        
        const message = `✅ ${result.userName || userId} ha timbrato l'USCITA. Ore lavorate: ${result.totalHours} (${result.standardHours} standard + ${result.overtimeHours} straordinario)`;
        showNotification(message, "success");
      }
    } catch (err) {
      console.error("Error processing timekeeping scan:", err);
      throw err;
    }
  };

  // Sync offline records when connection is restored
  const syncOfflineRecords = async () => {
    if (offlineStorage.length === 0) return;
    
    const syncMessage = `Sincronizzazione ${offlineStorage.length} timbrature offline...`;
    showNotification(syncMessage, "info");
    
    try {
      const results = await timekeepingService.syncOfflineRecords(offlineStorage);
      
      setOfflineStorage([]);
      localStorage.removeItem('timekeeping_offline_records');
      
      const resultMessage = `Sincronizzate ${results.success} di ${results.total} timbrature`;
      showNotification(resultMessage, results.failed > 0 ? "warning" : "success");
    } catch (err) {
      console.error("Error syncing offline records:", err);
      showNotification("Errore nella sincronizzazione. Riprova più tardi.", "error");
    }
  };

  // Show a notification message
  const showNotification = (message, type) => {
    setNotification({
      show: true,
      message,
      type
    });
    
    // Auto-hide - più veloce in modalità kiosk
    const hideDelay = kioskMode ? 3000 : 5000;
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, hideDelay);
  };

  // Gestione della selezione del tipo di timbratura in modalità kiosk
  const handleKioskScanTypeSelection = (type) => {
    setScanType(type);
    setError(null);
    setScanResult(null);
    setKioskState('scanning');
    
    // Avvia lo scanner solo dopo la selezione
    setTimeout(() => {
      startScanning();
    }, 500);
  };

  // Torna alla selezione (solo modalità kiosk)
  const returnToSelection = () => {
    stopScanner();
    setScanType('');
    setError(null);
    setScanResult(null);
    setLastScannedUser(null);
    setKioskState('selection');
  };

  // Toggle scanning on/off (solo per modalità normale)
  const toggleScanning = () => {
    if (initializing) return;
    
    setIsScanning(!isScanning);
    setScanResult(null);
    setError(null);
  };

  // Change scan type (in/out) per modalità normale
  const handleScanTypeChange = (type) => {
    setScanType(type);
    setScanResult(null);
    setError(null);
    setLastScannedUser(null);
  };

  // Handle camera selection change
  const handleCameraChange = (e) => {
    const cameraId = e.target.value;
    setSelectedCamera(cameraId);
    
    // Restart scanner with new camera
    if (isScanning) {
      setIsScanning(false);
      setTimeout(() => setIsScanning(true), 500);
    }
  };

  // Retry camera detection
  const handleRetryCamera = () => {
    fetchCameras();
  };

  // Render modalità kiosk rimodulata
  if (kioskMode) {
    return (
      <div className="timekeeping-scanner kiosk-mode">
        <div className="scanner-header">
          <h2>Sistema Timbrature</h2>
          <div className="scanner-stats">
            <span>Oggi: {scanStats.today}</span>
            <span>Totale: {scanStats.total}</span>
          </div>
        </div>

        {notification.show && (
          <Notification
            message={notification.message}
            isVisible={notification.show}
            onClose={() => setNotification(prev => ({ ...prev, show: false }))}
            type={notification.type}
          />
        )}

        {/* Stato: Selezione tipo timbratura */}
        {kioskState === 'selection' && (
          <div className="kiosk-selection-screen">
            <div className="selection-title">
              <h3>Seleziona il tipo di timbratura</h3>
              <p>Scegli se vuoi registrare un ingresso o un'uscita</p>
            </div>
            
            <div className="kiosk-type-buttons">
              <button
                className="kiosk-type-btn entrance"
                onClick={() => handleKioskScanTypeSelection('in')}
                disabled={!scannerReady}
              >
                <div className="btn-icon">🟢</div>
                <div className="btn-text">
                  <div className="btn-title">INGRESSO</div>
                  <div className="btn-subtitle">Timbra l'arrivo al lavoro</div>
                </div>
              </button>
              
              <button
                className="kiosk-type-btn exit"
                onClick={() => handleKioskScanTypeSelection('out')}
                disabled={!scannerReady}
              >
                <div className="btn-icon">🔴</div>
                <div className="btn-text">
                  <div className="btn-title">USCITA</div>
                  <div className="btn-subtitle">Timbra la fine del lavoro</div>
                </div>
              </button>
            </div>
            
            {!scannerReady && (
              <div className="camera-loading">
                <div className="loading-spinner"></div>
                <p>Inizializzazione camera...</p>
              </div>
            )}
          </div>
        )}

        {/* Stato: Scansione in corso */}
        {kioskState === 'scanning' && (
          <div className="kiosk-scanning-screen">
            <div className="scanning-header">
              <h3>Scansiona il tuo QR Code</h3>
              <p>Tipo: <strong>{scanType === 'in' ? 'INGRESSO' : 'USCITA'}</strong></p>
            </div>
            
            <div className="scanner-container">
              <div id="qr-reader" className="qr-reader"></div>
            </div>
            
            <div className="scanning-instructions">
              <p>📱 Avvicina il QR Code alla camera</p>
              <p>🔍 Mantieni il codice ben visibile e fermo</p>
            </div>
            
            <button 
              className="kiosk-cancel-btn"
              onClick={returnToSelection}
            >
              Annulla e Torna Indietro
            </button>
          </div>
        )}

        {/* Stato: Risultato */}
        {kioskState === 'result' && scanResult && (
          <div className="kiosk-result-screen success">
            <div className="result-icon">✅</div>
            <h3>Timbratura {scanType === 'in' ? 'Ingresso' : 'Uscita'} Completata!</h3>
            
            {lastScannedUser && (
              <div className="result-details">
                <p><strong>Utente:</strong> {lastScannedUser.userName || lastScannedUser.userId}</p>
                <p><strong>Orario:</strong> {new Date(lastScannedUser.timestamp).toLocaleTimeString('it-IT')}</p>
                {lastScannedUser.offlineMode && (
                  <p className="offline-note">⚠️ Salvato offline. Verrà sincronizzato quando disponibile.</p>
                )}
                {lastScannedUser.result && lastScannedUser.type === 'out' && (
                  <div className="work-hours">
                    <p><strong>Ore Lavorate:</strong> {lastScannedUser.result.totalHours}</p>
                    <p>({lastScannedUser.result.standardHours} standard + {lastScannedUser.result.overtimeHours} straordinario)</p>
                  </div>
                )}
              </div>
            )}
            
            <button 
              className="kiosk-continue-btn"
              onClick={returnToSelection}
            >
              Nuova Timbratura
            </button>
          </div>
        )}

        {/* Stato: Errore */}
        {kioskState === 'error' && (
          <div className="kiosk-result-screen error">
            <div className="result-icon">❌</div>
            <h3>Errore nella Timbratura</h3>
            
            <div className="error-details">
              <p>{error}</p>
            </div>
            
            <button 
              className="kiosk-continue-btn"
              onClick={returnToSelection}
            >
              Riprova
            </button>
          </div>
        )}

        {/* Footer con offline sync */}
        {offlineStorage.length > 0 && isOnline && (
          <div className="offline-sync-section">
            <p>🔄 {offlineStorage.length} timbrature da sincronizzare</p>
            <button className="sync-btn" onClick={syncOfflineRecords}>
              Sincronizza Ora
            </button>
          </div>
        )}
      </div>
    );
  }

  // Render normale per modalità admin (resto del codice rimane uguale)
  return (
    <div className="timekeeping-scanner">
      <div className="scanner-header">
        <h2>Scanner Timbrature</h2>
        <div className="scanner-status">
          {!isOnline && (
            <div className="offline-badge">OFFLINE MODE</div>
          )}
          {offlineStorage.length > 0 && (
            <div className="pending-badge">{offlineStorage.length} pending</div>
          )}
        </div>
      </div>

      <div className="scan-type-selector">
        <button
          className={`scan-type-btn ${scanType === 'in' ? 'active' : ''}`}
          onClick={() => handleScanTypeChange('in')}
        >
          Ingresso
        </button>
        <button
          className={`scan-type-btn ${scanType === 'out' ? 'active' : ''}`}
          onClick={() => handleScanTypeChange('out')}
        >
          Uscita
        </button>
      </div>
      
      {notification.show && (
        <Notification
          message={notification.message}
          isVisible={notification.show}
          onClose={() => setNotification(prev => ({ ...prev, show: false }))}
          type={notification.type}
        />
      )}

      {cameras.length > 0 && (
        <div className="camera-selector">
          <label htmlFor="camera-select">Seleziona Camera:</label>
          <select 
            id="camera-select" 
            value={selectedCamera}
            onChange={handleCameraChange}
            disabled={isScanning || initializing}
          >
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.label || `Camera ${camera.id}`}
              </option>
            ))}
          </select>
        </div>
      )}
      
      <div className="scanner-toggle">
        <button 
          className={`toggle-btn ${isScanning ? 'active' : ''}`} 
          onClick={toggleScanning}
          disabled={initializing || cameras.length === 0}
        >
          {initializing ? 'Avvio Scanner...' : isScanning ? 'Ferma Scanner' : 'Avvia Scanner'}
        </button>
        
        {cameras.length === 0 && (
          <button 
            className="retry-btn" 
            onClick={handleRetryCamera}
            disabled={initializing}
          >
            Rileva Camera
          </button>
        )}
      </div>
      
      <div className="scanner-container" ref={scannerRef}>
        <div id="qr-reader" className="qr-reader"></div>
        
        {scanResult && (
          <div className="scan-result success">
            <h4>Utente {scanType === 'in' ? 'Entrato' : 'Uscito'} con Successo!</h4>
            {lastScannedUser && (
              <div className="user-scan-info">
                <p><strong>Utente:</strong> {lastScannedUser.userName || lastScannedUser.userId}</p>
                <p><strong>Orario:</strong> {new Date(lastScannedUser.timestamp).toLocaleTimeString()}</p>
                {lastScannedUser.offlineMode && (
                  <p className="offline-note">Salvato offline. Verrà sincronizzato al ripristino della connessione.</p>
                )}
                {lastScannedUser.result && lastScannedUser.type === 'out' && (
                  <p><strong>Ore:</strong> {lastScannedUser.result.totalHours} ({lastScannedUser.result.standardHours} standard + {lastScannedUser.result.overtimeHours} straordinario)</p>
                )}
              </div>
            )}
            <button className="continue-btn" onClick={() => setScanResult(null)}>
              Continua Scansione
            </button>
          </div>
        )}
        
        {error && !initializing && (
          <div className="scan-result error">
            <h4>Errore</h4>
            <p className="error-text">{error}</p>
            <button className="continue-btn" onClick={() => setError(null)}>
              Riprova
            </button>
          </div>
        )}
      </div>
      
      {!isScanning && !error && cameras.length > 0 && (
        <div className="scanner-placeholder">
          <div className="placeholder-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 9H7V15H3V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 9H21V15H17V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 3V7H15V3H9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 17V21H15V17H9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 3V7H7V3H3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 3V7H21V3H17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 17V21H7V17H3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 17V21H21V17H17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p>Clicca "Avvia Scanner" per iniziare la scansione QR codes</p>
        </div>
      )}

      {cameras.length === 0 && !initializing && (
        <div className="camera-issue">
          <h3>Accesso Camera Richiesto</h3>
          <p>Non è stato possibile rilevare nessuna camera sul dispositivo. Controlla:</p>
          <ul>
            <li>Il dispositivo ha una camera funzionante</li>
            <li>Hai concesso i permessi camera a questo sito</li>
            <li>Nessun'altra applicazione sta usando la camera</li>
          </ul>
          <p>Controlla la barra degli indirizzi del browser per l'icona della camera per gestire i permessi.</p>
        </div>
      )}
      
      {offlineStorage.length > 0 && isOnline && (
        <div className="offline-sync-section">
          <h4>Record Offline</h4>
          <p>Hai {offlineStorage.length} record salvati offline che devono essere sincronizzati.</p>
          <button className="sync-btn" onClick={syncOfflineRecords}>
            Sincronizza Ora
          </button>
        </div>
      )}
      
      {deviceId && (
        <div className="device-info">
          <p>Device ID: {deviceId}</p>
        </div>
      )}
    </div>
  );
};

export default TimekeepingScanner;
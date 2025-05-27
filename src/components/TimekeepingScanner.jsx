// src/components/TimekeepingScanner.jsx - VERSIONE CORRETTA
import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import timekeepingService from '../services/timekeepingService';
import Notification from './Notification';
import './timekeepingScanner.css';

/**
 * Component for scanning QR codes for clock-in/out operations
 * VERSIONE CORRETTA con debug per identificare problemi di timbratura
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
  
  // Nuovi stati per debugging
  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  
  // Stati per modalità kiosk rimodulata
  const [kioskState, setKioskState] = useState('selection');
  const [scannerReady, setScannerReady] = useState(false);
  
  const scannerRef = useRef(null);
  const html5QrCode = useRef(null);
  const isInitialized = useRef(false);

  // Fetch available cameras
  const fetchCameras = async () => {
    try {
      if (!kioskMode) {
        showNotification("Richiesta permessi camera...", "info");
      }
      
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length) {
        setCameras(devices);
        
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
    
    return () => {
      stopScanner();
    };
  }, []);

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

  const updateScanStats = () => {
    try {
      const today = new Date().toDateString();
      const currentStats = { ...scanStats };
      const savedDate = localStorage.getItem(`scan_stats_date_${deviceId}`);
      
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
      html5QrCode.current = null;
    }
  };

  // Start scanning con debug migliorato
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

    await stopScanner();

    setInitializing(true);
    setError(null);
    setScanResult(null);
    setKioskState('scanning');
    
    try {
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
            
            await stopScanner();
            
            // DEBUG: Log informazioni pre-timbratura
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const currentDate = now.toISOString().split('T')[0];
            
            console.log(`DEBUG: Attempting ${scanType} for user ${userId} at ${currentTime} on ${currentDate}`);
            
            setDebugInfo({
              userId,
              scanType,
              currentTime,
              currentDate,
              timestamp: now.toISOString()
            });
            
            // Processa la timbratura con gestione errori migliorata
            await processTimekeepingScan(userId, scanType);
            
            setScanResult({
              userId,
              timestamp: new Date().toISOString(),
              success: true,
              type: scanType
            });
            
            updateScanStats();
            
            if (kioskMode) {
              setKioskState('result');
            }
            
          } catch (err) {
            console.error("Error processing scan:", err);
            
            // DEBUG: Log errore dettagliato
            console.log("DEBUG Error details:", {
              error: err.message,
              stack: err.stack,
              debugInfo
            });
            
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
          // Ignora errori di rilevamento QR comuni
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

  // Function to process a timekeeping scan con debug migliorato
  const processTimekeepingScan = async (userId, type) => {
    try {
      console.log(`Processing ${type} for user ${userId}`);
      
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
      
      // Debugging: Log dettagli pre-chiamata
      console.log('DEBUG: Calling timekeeping service with:', {
        userId,
        type,
        deviceId,
        isAdmin,
        kioskMode
      });
      
      if (type === 'in') {
        const result = await timekeepingService.clockIn(userId, {
          deviceId,
          isAdmin,
          deviceType: kioskMode ? 'kiosk' : 'web-scanner',
          kioskMode
        });
        
        console.log('DEBUG: ClockIn result:', result);
        
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
        
        console.log('DEBUG: ClockOut result:', result);
        
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
      
      // Log dettagliato dell'errore per debugging
      console.log('DEBUG: Detailed error:', {
        message: err.message,
        stack: err.stack,
        userId,
        type,
        timestamp: new Date().toISOString()
      });
      
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
    
    if (isScanning) {
      stopScanner();
    } else {
      startScanning();
    }
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
    
    if (isScanning) {
      stopScanner();
      setTimeout(() => startScanning(), 500);
    }
  };

  // Retry camera detection
  const handleRetryCamera = () => {
    fetchCameras();
  };

  // Toggle debug info
  const toggleDebugInfo = () => {
    setShowDebugInfo(!showDebugInfo);
  };

  // Render modalità kiosk
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

        {/* Debug panel per kiosk (solo se necessario) */}
        {showDebugInfo && debugInfo && (
          <div className="debug-panel" style={{
            position: 'fixed',
            top: '10px',
            right: '10px',
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '10px',
            borderRadius: '5px',
            fontSize: '12px',
            zIndex: 1000
          }}>
            <div>User: {debugInfo.userId}</div>
            <div>Type: {debugInfo.scanType}</div>
            <div>Time: {debugInfo.currentTime}</div>
            <div>Date: {debugInfo.currentDate}</div>
          </div>
        )}

        {/* Resto del codice kiosk rimane uguale */}
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

        {/* Altri stati kiosk rimangono uguali */}
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

  // Render normale per modalità admin
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
          {/* Debug toggle button */}
          {isAdmin && (
            <button 
              className="debug-toggle-btn"
              onClick={toggleDebugInfo}
              style={{
                padding: '5px 10px',
                fontSize: '12px',
                backgroundColor: showDebugInfo ? '#e74c3c' : '#95a5a6',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              DEBUG {showDebugInfo ? 'ON' : 'OFF'}
            </button>
          )}
        </div>
      </div>

      {/* Debug panel */}
      {showDebugInfo && (
        <div className="debug-panel" style={{
          background: '#f8f9fa',
          border: '1px solid #ddd',
          borderRadius: '5px',
          padding: '15px',
          marginBottom: '20px'
        }}>
          <h4 style={{margin: '0 0 10px 0'}}>Debug Information</h4>
          <div><strong>Online:</strong> {isOnline ? 'Yes' : 'No'}</div>
          <div><strong>Selected Camera:</strong> {selectedCamera}</div>
          <div><strong>Scan Type:</strong> {scanType || 'None'}</div>
          <div><strong>Scanner State:</strong> {isScanning ? 'Active' : 'Inactive'}</div>
          {debugInfo && (
            <div style={{marginTop: '10px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '3px'}}>
              <div><strong>Last Scan Info:</strong></div>
              <div>User ID: {debugInfo.userId}</div>
              <div>Type: {debugInfo.scanType}</div>
              <div>Time: {debugInfo.currentTime}</div>
              <div>Date: {debugInfo.currentDate}</div>
            </div>
          )}
        </div>
      )}

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
          disabled={initializing || cameras.length === 0 || !scanType}
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
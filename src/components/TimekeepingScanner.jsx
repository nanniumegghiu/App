// src/components/TimekeepingScanner.jsx - Versione corretta per modalità kiosk
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import timekeepingService from '../services/timekeepingService';
import Notification from './Notification';
import './timekeepingScanner.css';

/**
 * Component for scanning QR codes for clock-in/out operations
 * Versione corretta con gestione kiosk mode
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
  
  // Stato per gestire la cattura del QR code
  const [isCaptured, setIsCaptured] = useState(false);
  
  // Stato per gestire il tipo di scansione selezionato in modalità kiosk
  const [scanTypeSelected, setScanTypeSelected] = useState(false);

  // Ref per gestire il timer di timeout
  const timeoutTimerRef = useRef(null);
  const scannerRef = useRef(null);
  const html5QrCode = useRef(null);
  const isInitialized = useRef(false);

  // Costanti
  const SCAN_TIMEOUT = 30000; // 30 secondi timeout

  // Show a notification message
  const showNotification = useCallback((message, type) => {
    console.log(`Notification: ${type} - ${message}`);
    setNotification({
      show: true,
      message,
      type
    });

    const hideDelay = kioskMode ? 4000 : 5000;
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, hideDelay);
  }, [kioskMode]);

  // Safely stop scanner
  const stopScanner = useCallback(async () => {
    try {
      console.log("Stopping scanner...");
      
      // Clear timeout timer
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }

      if (html5QrCode.current) {
        const currentState = html5QrCode.current.getState();
        if (currentState === Html5Qrcode.SCANNING) {
          await html5QrCode.current.stop();
          console.log("Scanner stopped successfully");
        }
        html5QrCode.current = null;
      }
    } catch (err) {
      console.error("Error stopping scanner:", err);
      html5QrCode.current = null;
    }
  }, []);

  // Fetch available cameras
  const fetchCameras = useCallback(async () => {
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
  }, [kioskMode, showNotification]);

  // Load scan stats on initial mount
  useEffect(() => {
    if (!isInitialized.current) {
      fetchCameras();
      loadScanStats();
      isInitialized.current = true;
    }

    if (kioskMode) {
      setTimeout(() => {
        if (window.screen && window.screen.orientation) {
          window.screen.orientation.lock('portrait').catch(() => {
            // Ignora errori se non supportato
          });
        }
      }, 2000);
    }

    return () => {
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
      }
      stopScanner();
    };
  }, [kioskMode, stopScanner, fetchCameras]);

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

  // Function to process a timekeeping scan
  const processTimekeepingScan = useCallback(async (userId, type) => {
    try {
      console.log(`Processing ${type} scan for user: ${userId}`);
      
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
        return { success: true, offline: true };
      }

      let result;
      if (type === 'in') {
        result = await timekeepingService.clockIn(userId, {
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
        result = await timekeepingService.clockOut(userId, {
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
      
      return { success: true, result };
    } catch (err) {
      console.error("Error processing timekeeping scan:", err);
      throw err;
    }
  }, [deviceId, isAdmin, kioskMode, offlineStorage, showNotification]);

  // Sync offline records when connection is restored
  const syncOfflineRecords = useCallback(async () => {
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
  }, [offlineStorage, showNotification]);

  // Reset scanner state
  const resetScannerState = useCallback(() => {
    console.log("Resetting scanner state...");
    setIsCaptured(false);
    setScanResult(null);
    setError(null);
    setLastScannedUser(null);
    
    if (kioskMode) {
      setScanType('');
      setScanTypeSelected(false);
    }
  }, [kioskMode]);

  // Start timeout timer
  const startTimeoutTimer = useCallback(() => {
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
    }

    timeoutTimerRef.current = setTimeout(() => {
      console.log("Scanner timeout reached");
      setIsScanning(false);
      setError("Timeout: nessuna scansione rilevata in 30 secondi");
      
      if (kioskMode) {
        showNotification("Timeout scanner. Seleziona nuovamente il tipo di timbratura.", "warning");
        setTimeout(() => {
          resetScannerState();
        }, 3000);
      }
      
      timeoutTimerRef.current = null;
    }, SCAN_TIMEOUT);
  }, [kioskMode, showNotification, resetScannerState]);

  // Toggle scanning on/off
  const toggleScanning = useCallback(() => {
    if (initializing) return;

    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }

    if (isScanning) {
      setIsScanning(false);
      resetScannerState();
      showNotification("Scanner fermato.", "info");
    } else {
      setIsScanning(true);
    }
  }, [initializing, isScanning, showNotification, resetScannerState]);

  // Change scan type (in/out) - QUESTA È LA FUNZIONE CHIAVE PER KIOSK MODE
  const handleScanTypeChange = useCallback((type) => {
    console.log("handleScanTypeChange called with type:", type);
    
    // Reset dello stato precedente
    resetScannerState();
    
    // Imposta il nuovo tipo
    setScanType(type);
    setScanTypeSelected(true);

    if (kioskMode && selectedCamera) {
      console.log("Kiosk mode: Starting scanner after type selection");
      
      // Imposta isScanning a true per avviare lo scanner
      setTimeout(() => {
        setIsScanning(true);
      }, 100); // Piccolo delay per permettere il reset dello stato
      
      showNotification(`Modalità ${type === 'in' ? 'INGRESSO' : 'USCITA'} attivata. Scanner avviato.`, "info");
    }
  }, [kioskMode, selectedCamera, showNotification, resetScannerState]);

  // Handle camera selection change
  const handleCameraChange = useCallback((e) => {
    const cameraId = e.target.value;
    setSelectedCamera(cameraId);

    if (isScanning) {
      setIsScanning(false);
      setTimeout(() => setIsScanning(true), 500);
    }
  }, [isScanning]);

  // Retry camera detection
  const handleRetryCamera = useCallback(() => {
    fetchCameras();
  }, [fetchCameras]);

  // Start/stop scanning based on isScanning state - QUESTA È LA LOGICA PRINCIPALE
  useEffect(() => {
    console.log("useEffect [isScanning]: isScanning:", isScanning, "scanType:", scanType, "selectedCamera:", selectedCamera, "cameras.length:", cameras.length);

    const startScannerAsync = async () => {
      // In modalità kiosk, deve essere selezionato il tipo di scansione
      if (kioskMode && !scanType) {
        console.log("Kiosk mode: Waiting for scan type selection.");
        if (isScanning) setIsScanning(false);
        return;
      }

      // Deve essere selezionata una camera
      if (!selectedCamera || cameras.length === 0) {
        const errorMsg = "Nessuna camera selezionata o disponibile.";
        console.log(errorMsg);
        if (!kioskMode) {
          showNotification(errorMsg, "error");
        }
        setError(errorMsg);
        setIsScanning(false);
        return;
      }

      // Se è già catturato un QR, non riavviare lo scanner
      if (isCaptured) {
        console.log("QR code already captured, not starting scanner");
        return;
      }

      console.log("Starting scanner with camera:", selectedCamera);

      // Ferma qualsiasi scanner attivo
      await stopScanner();

      setInitializing(true);
      setError(null);
      setScanResult(null);

      try {
        html5QrCode.current = new Html5Qrcode("qr-reader");

        const config = {
          fps: kioskMode ? 15 : 10,
          qrbox: kioskMode ? { width: 300, height: 300 } : { width: 250, height: 250 },
          aspectRatio: 1.0,
          disableFlip: false
        };

        console.log("Attempting to start scanner with config:", config);

        await html5QrCode.current.start(
          selectedCamera,
          config,
          async (decodedText, decodedResult) => {
            console.log(`QR Code scanned: ${decodedText}`, decodedResult);

            // Se è già stato catturato un QR code, ignora questa scansione
            if (isCaptured) {
              console.log("QR code already captured, ignoring this scan");
              return;
            }

            // Imposta come catturato immediatamente
            setIsCaptured(true);

            // Clear timeout timer
            if (timeoutTimerRef.current) {
              clearTimeout(timeoutTimerRef.current);
              timeoutTimerRef.current = null;
            }

            try {
              const parts = decodedText.split(':');

              if (parts.length < 3 || parts[0] !== 'iacuzzo' || parts[1] !== 'user') {
                throw new Error("Formato QR code non valido");
              }

              const userId = parts[2];

              // Ferma lo scanner immediatamente
              await stopScanner();
              setIsScanning(false);

              // Processa la timbratura
              const scanProcessResult = await processTimekeepingScan(userId, scanType);
              
              if (scanProcessResult.success) {
                setScanResult({
                  userId,
                  timestamp: new Date().toISOString(),
                  success: true,
                  type: scanType
                });

                updateScanStats();

                if (kioskMode) {
                  // In kiosk mode, refresh dopo 4 secondi per vedere il messaggio di successo
                  setTimeout(() => {
                    window.location.reload();
                  }, 4000);
                }
              }

            } catch (err) {
              console.error("Error processing scan:", err);
              
              // Ferma lo scanner anche in caso di errore
              await stopScanner();
              setIsScanning(false);
              
              setError(err.message || "Errore durante la scansione");
              showNotification(err.message || "Errore durante la scansione. Riprova.", "error");

              if (kioskMode) {
                setTimeout(() => {
                  window.location.reload();
                }, 4000);
              }
            }
          },
          (errorMessage) => {
            // Ignora errori di rilevamento QR comuni - non loggare per ridurre il rumore
          }
        );

        console.log("Scanner started successfully");
        setError(null);
        setInitializing(false);

        // Avvia il timer di timeout
        startTimeoutTimer();

        if (!kioskMode) {
          showNotification("Scanner avviato con successo.", "success");
        }
      } catch (err) {
        console.error("Error starting scanner:", err);
        const errorMsg = `Errore avvio scanner: ${err.message || 'Errore sconosciuto'}`;
        setError(errorMsg);
        if (!kioskMode) {
          showNotification(`${errorMsg}. Prova ad aggiornare la pagina.`, "error");
        }
        setIsScanning(false);
        setInitializing(false);
        html5QrCode.current = null;
      }
    };

    if (isScanning && selectedCamera && cameras.length > 0 && !isCaptured) {
      console.log("Conditions met, starting scanner...");
      startScannerAsync();
    } else if (!isScanning) {
      console.log("isScanning is false, calling stopScanner.");
      stopScanner();
    } else {
      console.log("Conditions not met for starting scanner:", {
        isScanning,
        selectedCamera,
        camerasLength: cameras.length,
        isCaptured
      });
    }

    return () => {
      console.log("Cleanup for [isScanning] useEffect.");
      if (timeoutTimerRef.current) {
        clearTimeout(timeoutTimerRef.current);
        timeoutTimerRef.current = null;
      }
    };
  }, [isScanning, selectedCamera, scanType, kioskMode, isCaptured, cameras.length, showNotification, stopScanner, processTimekeepingScan, startTimeoutTimer]);

  // Handle scan type change
  useEffect(() => {
    resetScannerState();
  }, [scanType, resetScannerState]);

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
  }, [offlineStorage, syncOfflineRecords]);

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

  // Debug: Log quando le cameras cambiano
  useEffect(() => {
    console.log("Cameras changed:", cameras);
  }, [cameras]);

  // Debug: Log quando selectedCamera cambia
  useEffect(() => {
    console.log("Selected camera changed:", selectedCamera);
  }, [selectedCamera]);

  // Render modalità kiosk semplificata
  if (kioskMode) {
    return (
      <div className="timekeeping-scanner kiosk-mode">
        <div className="scanner-header">
          <h2>Sistema Timbrature</h2>
          {initializing && <div className="scanner-status">Inizializzazione...</div>}
        </div>

        {/* Selettore tipo scansione - SEMPRE VISIBILE e PROMINENTE */}
        <div className="scan-type-selector">
          <button
            className={`scan-type-btn ${scanType === 'in' ? 'active' : ''}`}
            onClick={() => handleScanTypeChange('in')}
            disabled={isScanning && !error}
          >
            🔵 INGRESSO
          </button>
          <button
            className={`scan-type-btn ${scanType === 'out' ? 'active' : ''}`}
            onClick={() => handleScanTypeChange('out')}
            disabled={isScanning && !error}
          >
            🔴 USCITA
          </button>
        </div>

        {/* Messaggio di istruzioni quando nessun tipo è selezionato */}
        {!scanTypeSelected && (
          <div className="kiosk-instructions">
            <div className="instruction-card">
              <h3>👆 Seleziona ingresso o uscita</h3>
              <p>Dopo la selezione, avrai 30 secondi per scansionare il QR code</p>
              {cameras.length === 0 && (
                <p style={{ color: 'red', marginTop: '10px' }}>
                  ⚠️ Nessuna camera rilevata. Controlla i permessi del browser.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Messaggio quando lo scanner sta per partire */}
        {scanTypeSelected && isScanning && initializing && (
          <div className="kiosk-instructions">
            <div className="instruction-card">
              <div className="scanner-initializing">
                <div className="loading-spinner"></div>
                <p>Avvio scanner...</p>
              </div>
            </div>
          </div>
        )}

        {/* Messaggio quando lo scanner è attivo */}
        {scanTypeSelected && isScanning && !initializing && !scanResult && !error && (
          <div className="kiosk-instructions">
            <div className="instruction-card">
              <h3>📷 Scanner Attivo</h3>
              <p><strong>Modalità: {scanType === 'in' ? 'INGRESSO' : 'USCITA'}</strong></p>
              <p>Inquadra il QR code personale per timbrare</p>
            </div>
          </div>
        )}

        {notification.show && (
          <Notification
            message={notification.message}
            isVisible={notification.show}
            onClose={() => setNotification(prev => ({ ...prev, show: false }))}
            type={notification.type}
          />
        )}

        <div className="scanner-container" ref={scannerRef}>
          <div id="qr-reader" className="qr-reader"></div>

          {scanResult && (
            <div className="scan-result success">
              <h4>✅ Timbratura {scanType === 'in' ? 'Ingresso' : 'Uscita'} Completata!</h4>
              {lastScannedUser && (
                <div className="user-scan-info">
                  <p><strong>Utente:</strong> {lastScannedUser.userName || lastScannedUser.userId}</p>
                  <p><strong>Orario:</strong> {new Date(lastScannedUser.timestamp).toLocaleTimeString('it-IT')}</p>
                  {lastScannedUser.offlineMode && (
                    <p className="offline-note">⚠️ Salvato offline. Verrà sincronizzato quando disponibile.</p>
                  )}
                  {lastScannedUser.result && lastScannedUser.type === 'out' && (
                    <p><strong>Ore Lavorate:</strong> {lastScannedUser.result.totalHours}
                       ({lastScannedUser.result.standardHours} standard + {lastScannedUser.result.overtimeHours} straordinario)</p>
                  )}
                </div>
              )}

              <div className="next-scan-info">
                <p>Per la prossima timbratura, seleziona nuovamente il tipo desiderato.</p>
              </div>
            </div>
          )}

          {error && !initializing && (
            <div className="scan-result error">
              <h4>❌ Errore</h4>
              <p className="error-text">{error}</p>
              <div className="error-actions">
                <button 
                  className="retry-btn" 
                  onClick={() => {
                    resetScannerState();
                    if (cameras.length === 0) {
                      fetchCameras();
                    }
                  }}
                >
                  Riprova
                </button>
              </div>
            </div>
          )}
        </div>

        {cameras.length === 0 && !initializing && (
          <div className="camera-issue">
            <h3>📷 Camera Required</h3>
            <p>Impossibile accedere alla camera del dispositivo.</p>
            <ul>
              <li>Verifica che il dispositivo abbia una camera</li>
              <li>Controlla i permessi del browser per questo sito</li>
              <li>Assicurati che nessun'altra app stia usando la camera</li>
            </ul>
            <button className="retry-btn" onClick={handleRetryCamera}>
              Rileva Camera
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

  // Render normale per modalità admin (invariato)
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
          disabled={isScanning}
        >
          Ingresso
        </button>
        <button
          className={`scan-type-btn ${scanType === 'out' ? 'active' : ''}`}
          onClick={() => handleScanTypeChange('out')}
          disabled={isScanning}
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
            <button className="continue-btn" onClick={() => {
              resetScannerState();
              setIsScanning(true);
            }}>
              Nuova Scansione
            </button>
          </div>
        )}

        {error && !initializing && (
          <div className="scan-result error">
            <h4>Errore</h4>
            <p className="error-text">{error}</p>
            <div className="error-actions">
              <button className="continue-btn" onClick={() => {
                resetScannerState();
                setIsScanning(true);
              }}>
                Riprova
              </button>
            </div>
          </div>
        )}
      </div>

      {!isScanning && !error && cameras.length > 0 && !scanResult && (
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
          <p>Seleziona il tipo di timbratura e clicca "Avvia Scanner"</p>
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
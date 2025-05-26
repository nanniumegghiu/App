// src/components/TimekeepingScanner.jsx - Fix per riavvio automatico in modalità kiosk
import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import timekeepingService from '../services/timekeepingService';
import Notification from './Notification';
import './timekeepingScanner.css';

/**
 * Component for scanning QR codes for clock-in/out operations
 * Enhanced with kiosk mode support and fixed auto-resume functionality
 */
const TimekeepingScanner = ({ isAdmin = false, deviceId = '', kioskMode = false }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [scanType, setScanType] = useState('in');
  const [lastScannedUser, setLastScannedUser] = useState(null);
  const [offlineStorage, setOfflineStorage] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [initializing, setInitializing] = useState(false);
  const [autoResumeTimer, setAutoResumeTimer] = useState(null);
  const [scanStats, setScanStats] = useState({ total: 0, today: 0 });
  const [resumeCountdown, setResumeCountdown] = useState(0);
  
  // Nuovi stati per gestire il loop infinito
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [autoResumeEnabled, setAutoResumeEnabled] = useState(true);
  const [manualControl, setManualControl] = useState(false);
  const [lastErrorTime, setLastErrorTime] = useState(null);
  
  const scannerRef = useRef(null);
  const html5QrCode = useRef(null);
  const isInitialized = useRef(false);
  const countdownTimer = useRef(null);

  // Auto-resume scanning after successful scan (ridotto per modalità kiosk)
  const AUTO_RESUME_DELAY = kioskMode ? 3000 : 8000; // 3 secondi in modalità kiosk, 8 in modalità normale
  const MAX_CONSECUTIVE_ERRORS = 3; // Massimo errori consecutivi prima di fermare l'auto-resume
  const ERROR_RESET_TIME = 30000; // 30 secondi per resettare il contatore errori

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
          
          // Avvia automaticamente lo scanner in modalità kiosk solo se non siamo in controllo manuale
          if (!manualControl) {
            setTimeout(() => setIsScanning(true), 500);
          }
        } else {
          setSelectedCamera(devices[0].id);
          showNotification("Permessi camera concessi.", "success");
        }
        
        setError(null);
        // Reset errori consecutivi quando le camere vengono caricate con successo
        setConsecutiveErrors(0);
      } else {
        const errorMsg = "Nessuna camera trovata. Assicurati che il dispositivo abbia una camera funzionante.";
        setError(errorMsg);
        if (!kioskMode) {
          showNotification(errorMsg, "error");
        }
        handleError("Camera not found");
      }
    } catch (err) {
      console.error("Error getting cameras:", err);
      const errorMsg = `Errore permessi camera: ${err.message || "Consenti l'accesso alla camera nelle impostazioni del browser."}`;
      setError(errorMsg);
      if (!kioskMode) {
        showNotification(errorMsg, "error");
      }
      handleError("Camera permission error");
    }
  };

  // Gestisce gli errori consecutivi
  const handleError = (errorType) => {
    const now = Date.now();
    
    // Se l'ultimo errore è stato più di ERROR_RESET_TIME fa, resetta il contatore
    if (lastErrorTime && (now - lastErrorTime) > ERROR_RESET_TIME) {
      setConsecutiveErrors(0);
    }
    
    setLastErrorTime(now);
    setConsecutiveErrors(prev => {
      const newCount = prev + 1;
      
      // Se raggiungiamo il limite di errori consecutivi, disabilita l'auto-resume
      if (newCount >= MAX_CONSECUTIVE_ERRORS) {
        setAutoResumeEnabled(false);
        setManualControl(true);
        
        if (kioskMode) {
          showNotification(
            `Rilevati ${newCount} errori consecutivi. Scanner fermato. Usa i controlli manuali.`, 
            "warning"
          );
        }
        
        // Ferma qualsiasi timer di auto-resume attivo
        if (autoResumeTimer) {
          clearTimeout(autoResumeTimer);
          setAutoResumeTimer(null);
        }
        
        if (countdownTimer.current) {
          clearInterval(countdownTimer.current);
          setResumeCountdown(0);
        }
      }
      
      return newCount;
    });
  };

  // Reset del contatore errori dopo un successo
  const handleSuccess = () => {
    setConsecutiveErrors(0);
    setLastErrorTime(null);
    
    // Riabilita l'auto-resume se era stato disabilitato
    if (!autoResumeEnabled) {
      setAutoResumeEnabled(true);
      if (kioskMode) {
        showNotification("Scanner stabilizzato. Auto-resume riattivato.", "success");
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
      // Clear timers
      if (autoResumeTimer) {
        clearTimeout(autoResumeTimer);
      }
      if (countdownTimer.current) {
        clearInterval(countdownTimer.current);
      }
      
      // Stop scanner
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
      // Clear all timers
      if (autoResumeTimer) {
        clearTimeout(autoResumeTimer);
        setAutoResumeTimer(null);
      }
      
      if (countdownTimer.current) {
        clearInterval(countdownTimer.current);
        countdownTimer.current = null;
      }
      
      setResumeCountdown(0);
      
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

  // Start countdown for auto-resume
  const startAutoResumeCountdown = () => {
    // Non avviare il countdown se l'auto-resume è disabilitato
    if (!autoResumeEnabled) {
      return;
    }
    
    setResumeCountdown(Math.ceil(AUTO_RESUME_DELAY / 1000));
    
    const timer = setInterval(() => {
      setResumeCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    countdownTimer.current = timer;
  };

  // Start/stop scanning based on isScanning state
  useEffect(() => {
    const startScanner = async () => {
      if (!selectedCamera) {
        const errorMsg = "Nessuna camera selezionata.";
        if (!kioskMode) {
          showNotification(errorMsg, "error");
        }
        setError(errorMsg);
        setIsScanning(false);
        handleError("No camera selected");
        return;
      }

      // Stop existing scanner first
      await stopScanner();

      setInitializing(true);
      setError(null);
      setScanResult(null); // Clear previous results
      
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
              
              // Pausa lo scanner immediatamente dopo la scansione
              if (html5QrCode.current) {
                try {
                  const currentState = html5QrCode.current.getState();
                  if (currentState === Html5Qrcode.SCANNING) {
                    await html5QrCode.current.pause();
                    console.log("Scanner paused after successful scan");
                  }
                } catch (pauseError) {
                  console.log("Failed to pause scanner:", pauseError);
                }
              }
              
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
              
              // Gestisci il successo (reset errori consecutivi)
              handleSuccess();
              
              // Avvia il timer per il riavvio automatico solo se abilitato
              if (autoResumeEnabled && !manualControl) {
                const resumeTimer = setTimeout(() => {
                  console.log("Auto-resuming scanner after successful scan");
                  resumeScanning();
                }, AUTO_RESUME_DELAY);
                
                setAutoResumeTimer(resumeTimer);
                
                // Avvia il countdown visuale
                startAutoResumeCountdown();
              }
              
            } catch (err) {
              console.error("Error processing scan:", err);
              setError(err.message || "Errore durante la scansione");
              showNotification(err.message || "Errore durante la scansione", "error");
              
              // Gestisci l'errore
              handleError("Scan processing error");
              
              // In modalità kiosk, riprendi automaticamente solo se abilitato
              if (kioskMode && autoResumeEnabled && !manualControl) {
                const errorResumeTimer = setTimeout(() => {
                  console.log("Auto-resuming scanner after error");
                  resumeScanning();
                }, 2000);
                setAutoResumeTimer(errorResumeTimer);
              }
            }
          },
          (errorMessage) => {
            // Ignora errori di rilevamento QR comuni per evitare spam
            // Non loggare per evitare rumore nella console
          }
        );
        
        setError(null);
        setInitializing(false);
        
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
        
        // Reset scanner reference on error
        html5QrCode.current = null;
        
        // Gestisci l'errore
        handleError("Scanner start error");
      }
    };

    if (isScanning && selectedCamera) {
      startScanner();
    } else if (!isScanning) {
      stopScanner();
    }

    return () => {
      // Cleanup function for this effect
      if (autoResumeTimer) {
        clearTimeout(autoResumeTimer);
      }
      if (countdownTimer.current) {
        clearInterval(countdownTimer.current);
      }
    };
  }, [isScanning, selectedCamera, autoResumeEnabled, manualControl]);

  // Handle scan type change without restarting scanner
  useEffect(() => {
    setScanResult(null);
    setError(null);
    setLastScannedUser(null);
    setResumeCountdown(0);
  }, [scanType]);

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

  // Resume scanning (improved version)
  const resumeScanning = async () => {
    console.log("Attempting to resume scanning...");
    
    // Clear any pending timers
    if (autoResumeTimer) {
      clearTimeout(autoResumeTimer);
      setAutoResumeTimer(null);
    }
    
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
    
    // Reset UI state
    setScanResult(null);
    setError(null);
    setResumeCountdown(0);
    
    if (html5QrCode.current) {
      try {
        const currentState = html5QrCode.current.getState();
        console.log("Current scanner state:", currentState);
        
        if (currentState === Html5Qrcode.PAUSED) {
          await html5QrCode.current.resume();
          console.log("Scanner resumed successfully");
        } else if (currentState === Html5Qrcode.NOT_STARTED) {
          console.log("Scanner not started, restarting...");
          // Restart scanner if it's not started
          setIsScanning(false);
          setTimeout(() => setIsScanning(true), 500);
        } else if (currentState === Html5Qrcode.SCANNING) {
          console.log("Scanner already scanning");
        } else {
          console.log("Unknown scanner state, restarting...");
          // Force restart for unknown states
          setIsScanning(false);
          setTimeout(() => setIsScanning(true), 500);
        }
      } catch (error) {
        console.error("Error resuming scanner:", error);
        handleError("Resume error");
        // Force restart on resume error only if not in manual control
        if (!manualControl) {
          console.log("Force restarting scanner due to resume error");
          setIsScanning(false);
          setTimeout(() => setIsScanning(true), 500);
        }
      }
    } else {
      console.log("No scanner instance, restarting...");
      // No scanner instance, restart
      setIsScanning(false);
      setTimeout(() => setIsScanning(true), 500);
    }
  };

  // Toggle scanning on/off
  const toggleScanning = () => {
    if (initializing) return;
    
    // Clear any pending auto-resume timers when manually toggling
    if (autoResumeTimer) {
      clearTimeout(autoResumeTimer);
      setAutoResumeTimer(null);
    }
    
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
    
    // Attiva il controllo manuale
    setManualControl(true);
    
    setIsScanning(!isScanning);
    setScanResult(null);
    setError(null);
    setResumeCountdown(0);
  };

  // Reset error counter and re-enable auto-resume
  const resetErrorState = () => {
    setConsecutiveErrors(0);
    setLastErrorTime(null);
    setAutoResumeEnabled(true);
    setManualControl(false);
    setError(null);
    showNotification("Stato errori resettato. Auto-resume riabilitato.", "success");
  };

  // Change scan type (in/out)
  const handleScanTypeChange = (type) => {
    setScanType(type);
    // Clear results and errors when changing scan type
    setScanResult(null);
    setError(null);
    setLastScannedUser(null);
    setResumeCountdown(0);
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

  // Render modalità kiosk semplificata
  if (kioskMode) {
    return (
      <div className="timekeeping-scanner kiosk-mode">
        <div className="scanner-header">
          <h2>Sistema Timbrature</h2>
          <div className="scanner-stats">
            <span>Oggi: {scanStats.today}</span>
            <span>Totale: {scanStats.total}</span>
            {!autoResumeEnabled && (
              <span className="error-indicator">⚠️ Auto-resume disabilitato</span>
            )}
          </div>
        </div>

        <div className="scan-type-selector">
          <button
            className={`scan-type-btn ${scanType === 'in' ? 'active' : ''}`}
            onClick={() => handleScanTypeChange('in')}
          >
            🔵 INGRESSO
          </button>
          <button
            className={`scan-type-btn ${scanType === 'out' ? 'active' : ''}`}
            onClick={() => handleScanTypeChange('out')}
          >
            🔴 USCITA
          </button>
        </div>

        {/* Controlli manuali per modalità kiosk */}
        <div className="kiosk-manual-controls">
          <button
            className={`manual-control-btn ${isScanning ? 'stop' : 'start'}`}
            onClick={toggleScanning}
            disabled={initializing}
          >
            {initializing ? '⏳ Inizializzazione...' : isScanning ? '⏹️ Ferma Scanner' : '▶️ Avvia Scanner'}
          </button>
          
          {(!autoResumeEnabled || consecutiveErrors > 0) && (
            <button
              className="reset-error-btn"
              onClick={resetErrorState}
            >
              🔄 Reset Errori ({consecutiveErrors})
            </button>
          )}
        </div>
        
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
              
              {resumeCountdown > 0 && autoResumeEnabled && !manualControl && (
                <div className="auto-resume-info">
                  <div className="countdown-display">
                    Scanner si riavvierà automaticamente in <strong>{resumeCountdown}</strong> secondi...
                  </div>
                  <button 
                    className="manual-resume-btn"
                    onClick={resumeScanning}
                  >
                    Riavvia Subito
                  </button>
                </div>
              )}
              
              {(!autoResumeEnabled || manualControl) && (
                <div className="manual-resume-info">
                  <p>Auto-resume disabilitato. Usa i controlli manuali.</p>
                  <button 
                    className="manual-resume-btn"
                    onClick={resumeScanning}
                  >
                    Riavvia Scanner
                  </button>
                </div>
              )}
            </div>
          )}
          
          {error && !initializing && (
            <div className="scan-result error">
              <h4>❌ Errore</h4>
              <p className="error-text">{error}</p>
              {consecutiveErrors > 0 && (
                <p className="error-count">Errori consecutivi: {consecutiveErrors}/{MAX_CONSECUTIVE_ERRORS}</p>
              )}
              <div className="error-actions">
                <button className="continue-btn" onClick={resumeScanning}>
                  Riprova
                </button>
                {consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && (
                  <button className="reset-btn" onClick={resetErrorState}>
                    Reset Errori
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        
        {!isScanning && !error && cameras.length > 0 && (
          <div className="scanner-placeholder">
            <div className="placeholder-icon">📱</div>
            <p>Scanner fermato</p>
            <button className="start-scan-btn" onClick={() => setIsScanning(true)}>
              Avvia Scanner
            </button>
          </div>
        )}

        {cameras.length === 0 && !initializing && (
          <div className="camera-issue">
            <h3>📷 Camera Required</h3>
            <p>Impossibile accedere alla camera del dispositivo.</p>
            <button className="retry-btn" onClick={handleRetryCamera}>
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
          {!autoResumeEnabled && (
            <div className="error-badge">Auto-resume OFF</div>
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
        
        {(!autoResumeEnabled || consecutiveErrors > 0) && (
          <button 
            className="reset-error-btn" 
            onClick={resetErrorState}
          >
            Reset Errori ({consecutiveErrors})
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
            <button className="continue-btn" onClick={resumeScanning}>
              Continua Scansione
            </button>
          </div>
        )}
        
        {error && !initializing && (
          <div className="scan-result error">
            <h4>Errore</h4>
            <p className="error-text">{error}</p>
            {consecutiveErrors > 0 && (
              <p className="error-count">Errori consecutivi: {consecutiveErrors}/{MAX_CONSECUTIVE_ERRORS}</p>
            )}
            <div className="error-actions">
              <button className="continue-btn" onClick={resumeScanning}>
                Riprova
              </button>
              {consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && (
                <button className="reset-btn" onClick={resetErrorState}>
                  Reset Errori
                </button>
              )}
            </div>
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
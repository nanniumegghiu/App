// src/components/TimekeepingScanner.jsx - Con scanner elegante per modalità kiosk
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import timekeepingService from '../services/timekeepingService';
import Notification from './Notification';
import './timekeepingScanner.css';

/**
 * Component for scanning QR codes for clock-in/out operations
 * Enhanced with elegant kiosk mode - single scan detection with timeout
 */
const TimekeepingScanner = ({ isAdmin = false, deviceId = '', kioskMode = false }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [scanType, setScanType] = useState('');  // Vuoto di default in modalità kiosk
  const [lastScannedUser, setLastScannedUser] = useState(null);
  const [offlineStorage, setOfflineStorage] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [initializing, setInitializing] = useState(false);
  const [autoResumeTimer, setAutoResumeTimer] = useState(null);
  const [scanStats, setScanStats] = useState({ total: 0, today: 0 });
  const [resumeCountdown, setResumeCountdown] = useState(0);

  // Stati per gestire il controllo del scanner
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [autoResumeEnabled, setAutoResumeEnabled] = useState(true);
  const [manualControl, setManualControl] = useState(false);
  const [lastErrorTime, setLastErrorTime] = useState(null);

  // Nuovo stato per gestire il tipo di scansione selezionato in modalità kiosk
  const [scanTypeSelected, setScanTypeSelected] = useState(false);
  
  // Stati specifici per modalità kiosk - NUOVI
  const [kioskScanCompleted, setKioskScanCompleted] = useState(false);
  const [kioskScanTimeout, setKioskScanTimeout] = useState(null);
  const [kioskTimeoutCountdown, setKioskTimeoutCountdown] = useState(0);

  // Usiamo useRef per l'inactivityTimer per evitare che sia una dipendenza di useEffect
  const inactivityTimerRef = useRef(null);
  const kioskTimeoutTimerRef = useRef(null);

  const scannerRef = useRef(null);
  const html5QrCode = useRef(null);
  const isInitialized = useRef(false);
  const countdownTimer = useRef(null);

  // Auto-resume scanning after successful scan
  const AUTO_RESUME_DELAY = kioskMode ? 3000 : 8000;
  const MAX_CONSECUTIVE_ERRORS = 3;
  const ERROR_RESET_TIME = 30000; // 30 secondi per resettare il contatore errori
  const INACTIVITY_RESET_DELAY = 30000; // 30 secondi per resettare in caso di inattività
  const KIOSK_SCAN_TIMEOUT = 30000; // 30 secondi timeout per scanner in modalità kiosk

  // Show a notification message
  const showNotification = useCallback((message, type) => {
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

  // Gestisce gli errori consecutivi
  const handleError = useCallback((errorType) => {
    const now = Date.now();

    if (lastErrorTime && (now - lastErrorTime) > ERROR_RESET_TIME) {
      setConsecutiveErrors(0);
    }

    setLastErrorTime(now);
    setConsecutiveErrors(prev => {
      const newCount = prev + 1;

      if (newCount >= MAX_CONSECUTIVE_ERRORS) {
        setAutoResumeEnabled(false);
        setManualControl(true);

        if (kioskMode) {
          showNotification(
            `Rilevati ${newCount} errori consecutivi. Scanner fermato.`,
            "warning"
          );
        }

        if (autoResumeTimer) {
          clearTimeout(autoResumeTimer);
          setAutoResumeTimer(null);
        }

        if (countdownTimer.current) {
          clearInterval(countdownTimer.current);
          setResumeCountdown(0);
        }
        
        // Clear inactivity timer on critical error
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
          inactivityTimerRef.current = null;
        }
      }

      return newCount;
    });
  }, [autoResumeTimer, kioskMode, lastErrorTime, showNotification]);

  // Reset del contatore errori dopo un successo
  const handleSuccess = useCallback(() => {
    setConsecutiveErrors(0);
    setLastErrorTime(null);

    if (!autoResumeEnabled) {
      setAutoResumeEnabled(true);
      if (kioskMode) {
        showNotification("Scanner stabilizzato.", "success");
      }
    }
  }, [autoResumeEnabled, kioskMode, showNotification]);

  // Safely stop scanner
  const stopScanner = useCallback(async () => {
    try {
      console.log("Attempting to stop scanner...");
      if (autoResumeTimer) {
        clearTimeout(autoResumeTimer);
        setAutoResumeTimer(null);
      }

      if (countdownTimer.current) {
        clearInterval(countdownTimer.current);
        countdownTimer.current = null;
      }

      if (inactivityTimerRef.current) {
        console.log("Clearing inactivity timer during stopScanner.");
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }

      // Clear kiosk scan timeout - NUOVO
      if (kioskScanTimeout) {
        clearTimeout(kioskScanTimeout);
        setKioskScanTimeout(null);
      }

      if (kioskTimeoutTimerRef.current) {
        clearTimeout(kioskTimeoutTimerRef.current);
        kioskTimeoutTimerRef.current = null;
      }

      setResumeCountdown(0);
      setKioskTimeoutCountdown(0);

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
  }, [autoResumeTimer, kioskScanTimeout]);

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
  }, [kioskMode, showNotification, handleError]);

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
      if (autoResumeTimer) {
        clearTimeout(autoResumeTimer);
      }
      if (countdownTimer.current) {
        clearInterval(countdownTimer.current);
      }
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      if (kioskTimeoutTimerRef.current) {
        clearTimeout(kioskTimeoutTimerRef.current);
        kioskTimeoutTimerRef.current = null;
      }
      stopScanner();
    };
  }, [kioskMode, stopScanner, autoResumeTimer, fetchCameras]);

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

  // Start timeout countdown for Kiosk mode - NUOVO
  const startKioskTimeout = useCallback(() => {
    if (!kioskMode) return;

    console.log("Starting Kiosk timeout countdown");
    setKioskTimeoutCountdown(Math.ceil(KIOSK_SCAN_TIMEOUT / 1000));

    const timer = setInterval(() => {
      setKioskTimeoutCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    kioskTimeoutTimerRef.current = timer;

    // Set the actual timeout
    const timeoutId = setTimeout(() => {
      console.log("Kiosk scan timeout reached - stopping scanner");
      setIsScanning(false);
      setKioskScanCompleted(true);
      setScanResult(null);
      setError("Timeout - Nessun QR code rilevato entro 30 secondi");
      showNotification("Timeout scaduto. Premi Reset per ricominciare.", "warning");
    }, KIOSK_SCAN_TIMEOUT);

    setKioskScanTimeout(timeoutId);
  }, [kioskMode, showNotification]);

  // Function to process a timekeeping scan
  const processTimekeepingScan = useCallback(async (userId, type) => {
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
      showNotification(err.message || "Errore durante la timbratura. Riprova.", "error");
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

  // Resume scanning
  const resumeScanning = useCallback(async () => {
    console.log("Attempting to resume scanning...");

    if (autoResumeTimer) {
      clearTimeout(autoResumeTimer);
      setAutoResumeTimer(null);
    }

    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }

    if (inactivityTimerRef.current) {
      console.log("Clearing inactivity timer on manual resume.");
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

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
          setIsScanning(false);
          setTimeout(() => setIsScanning(true), 500);
        } else if (currentState === Html5Qrcode.SCANNING) {
          console.log("Scanner already scanning");
        } else {
          console.log("Unknown scanner state, restarting...");
          setIsScanning(false);
          setTimeout(() => setIsScanning(true), 500);
        }
      } catch (error) {
        console.error("Error resuming scanner:", error);
        handleError("Resume error");
        if (!manualControl) {
          console.log("Force restarting scanner due to resume error");
          setIsScanning(false);
          setTimeout(() => setIsScanning(true), 500);
        }
      }
    } else {
      console.log("No scanner instance, restarting...");
      setIsScanning(false);
      setTimeout(() => setIsScanning(true), 500);
    }
  }, [autoResumeTimer, manualControl, handleError]);

  // Toggle scanning on/off - MODIFIED for kiosk mode reset
  const toggleScanning = useCallback(() => {
    if (initializing) return;

    if (autoResumeTimer) {
      clearTimeout(autoResumeTimer);
      setAutoResumeTimer(null);
    }

    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }

    if (inactivityTimerRef.current) {
      console.log("Clearing inactivity timer during toggleScanning.");
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    setManualControl(true);

    if (kioskMode) {
      // In modalità kiosk, il pulsante funziona sempre come Reset (refresh pagina)
      console.log("Kiosk mode: Reset button pressed - refreshing page");
      window.location.reload();
    } else {
      // Modalità normale
      if (isScanning) {
        setIsScanning(false);
        setScanType('');
        setScanTypeSelected(false);
        setScanResult(null);
        setError(null);
        setLastScannedUser(null);
        showNotification("Scanner fermato.", "info");
      } else {
        setIsScanning(true);
      }
    }
    setResumeCountdown(0);
  }, [initializing, autoResumeTimer, isScanning, kioskMode, showNotification]);

  // Reset error counter and re-enable auto-resume
  const resetErrorState = useCallback(() => {
    setConsecutiveErrors(0);
    setLastErrorTime(null);
    setAutoResumeEnabled(true);
    setManualControl(false);
    setError(null);
    showNotification("Stato errori resettato.", "success");
  }, [showNotification]);

  // Change scan type (in/out) - MODIFICATO per modalità kiosk
  const handleScanTypeChange = useCallback((type) => {
    console.log("handleScanTypeChange called with type:", type);
    setScanType(type);
    setScanTypeSelected(true);
    setScanResult(null);
    setError(null);
    setLastScannedUser(null);
    setResumeCountdown(0);
    setKioskScanCompleted(false); // Reset stato kiosk

    // Clear any existing timers
    if (inactivityTimerRef.current) {
      console.log("Clearing inactivity timer from handleScanTypeChange.");
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    if (kioskTimeoutTimerRef.current) {
      clearTimeout(kioskTimeoutTimerRef.current);
      kioskTimeoutTimerRef.current = null;
    }

    if (kioskScanTimeout) {
      clearTimeout(kioskScanTimeout);
      setKioskScanTimeout(null);
    }

    // In modalità kiosk, avvia automaticamente lo scanner quando viene selezionato il tipo
    if (kioskMode && selectedCamera) {
      console.log("Kiosk mode and camera selected, setting isScanning to true.");
      setIsScanning(true);
      showNotification(`Modalità ${type === 'in' ? 'INGRESSO' : 'USCITA'} attivata.`, "info");
    }
  }, [kioskMode, selectedCamera, showNotification, kioskScanTimeout]);

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

  // Start/stop scanning based on isScanning state - MODIFIED for elegant kiosk handling
  useEffect(() => {
    console.log("useEffect [isScanning, selectedCamera, scanType, ...]: Executing. isScanning:", isScanning, "scanType:", scanType, "selectedCamera:", selectedCamera);

    const startScannerAsync = async () => {
      if (kioskMode && !scanType) {
        console.log("Kiosk mode: Waiting for scan type selection. Returning from startScannerAsync.");
        if (isScanning) setIsScanning(false);
        return;
      }

      if (kioskMode && kioskScanCompleted) {
        console.log("Kiosk mode: Scan already completed, not starting scanner again.");
        return;
      }

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

      await stopScanner();

      setInitializing(true);
      setError(null);
      setScanResult(null);

      // Start kiosk timeout for modalità kiosk
      if (kioskMode) {
        startKioskTimeout();
      }

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

            // KIOSK MODE: Ferma immediatamente lo scanner dopo la prima scansione
            if (kioskMode) {
              console.log("Kiosk mode: First scan detected, stopping scanner immediately");
              
              // Clear all timers
              if (kioskScanTimeout) {
                clearTimeout(kioskScanTimeout);
                setKioskScanTimeout(null);
              }
              if (kioskTimeoutTimerRef.current) {
                clearTimeout(kioskTimeoutTimerRef.current);
                kioskTimeoutTimerRef.current = null;
              }
              
              setKioskTimeoutCountdown(0);
              setKioskScanCompleted(true);
              
              // Stop scanner immediately
              try {
                const currentState = html5QrCode.current.getState();
                if (currentState === Html5Qrcode.SCANNING) {
                  await html5QrCode.current.stop();
                  console.log("Kiosk: Scanner stopped after first scan");
                }
              } catch (stopError) {
                console.log("Kiosk: Failed to stop scanner:", stopError);
              }
              
              setIsScanning(false);
            }

            try {
              const parts = decodedText.split(':');

              if (parts.length < 3 || parts[0] !== 'iacuzzo' || parts[1] !== 'user') {
                throw new Error("Formato QR code non valido");
              }

              const userId = parts[2];

              await processTimekeepingScan(userId, scanType);

              setScanResult({
                userId,
                timestamp: new Date().toISOString(),
                success: true,
                type: scanType
              });

              updateScanStats();
              handleSuccess();

              if (kioskMode) {
                // In kiosk mode, mostro solo il risultato senza continuare a scansionare
                showNotification("Timbratura completata! Premi Reset per una nuova timbratura.", "success");
              } else {
                // Modalità normale - continua con auto-resume
                if (autoResumeEnabled && !manualControl) {
                  const resumeTimer = setTimeout(() => {
                    console.log("Auto-resuming scanner after successful scan");
                    resumeScanning();
                  }, AUTO_RESUME_DELAY);

                  setAutoResumeTimer(resumeTimer);
                }
              }

            } catch (err) {
              console.error("Error processing scan:", err);
              setError(err.message || "Errore durante la scansione");
              handleError("Scan processing error");

              if (kioskMode) {
                // In kiosk mode, ferma tutto e mostra errore
                showNotification("Errore nella timbratura. Premi Reset per riprovare.", "error");
              } else {
                // Modalità normale - prova auto-resume
                if (autoResumeEnabled && !manualControl) {
                  const errorResumeTimer = setTimeout(() => {
                    console.log("Auto-resuming scanner after error");
                    resumeScanning();
                  }, 2000);
                  setAutoResumeTimer(errorResumeTimer);
                }
              }
            }
          },
          (errorMessage) => {
            // Ignora errori di rilevamento QR comuni
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

        html5QrCode.current = null;
        handleError("Scanner start error");
      }
    };

    if (isScanning && selectedCamera) {
      startScannerAsync();
    } else if (!isScanning) {
      console.log("isScanning is false, calling stopScanner.");
      stopScanner();
    }

    return () => {
      console.log("Cleanup for [isScanning, selectedCamera, scanType, ...] useEffect.");
    };
  }, [isScanning, selectedCamera, scanType, autoResumeEnabled, manualControl, kioskMode, kioskScanCompleted, handleError, handleSuccess, showNotification, stopScanner, processTimekeepingScan, resumeScanning, startKioskTimeout]);

  // Handle scan type change
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

  // Render modalità kiosk semplificata
  if (kioskMode) {
    return (
      <div className="timekeeping-scanner kiosk-mode">
        <div className="scanner-header">
          <h2>Sistema Timbrature</h2>
          <div className="scanner-stats">
            {!autoResumeEnabled && (
              <span className="error-indicator">⚠️ Auto-resume disabilitato</span>
            )}
          </div>
        </div>

        {/* Selettore tipo scansione - SEMPRE VISIBILE e PROMINENTE */}
        <div className="scan-type-selector">
          <button
            className={`scan-type-btn ${scanType === 'in' ? 'active' : ''}`}
            onClick={() => handleScanTypeChange('in')}
            disabled={isScanning && scanType === 'in' && !kioskScanCompleted}
          >
            🔵 INGRESSO
          </button>
          <button
            className={`scan-type-btn ${scanType === 'out' ? 'active' : ''}`}
            onClick={() => handleScanTypeChange('out')}
            disabled={isScanning && scanType === 'out' && !kioskScanCompleted}
          >
            🔴 USCITA
          </button>
        </div>

        {/* Messaggio di istruzioni quando nessun tipo è selezionato */}
        {!scanTypeSelected && (
          <div className="kiosk-instructions">
            <div className="instruction-card">
              <h3>👆 Seleziona ingresso o uscita</h3>
            </div>
          </div>
        )}

        {/* Timeout countdown display per kiosk mode */}
        {isScanning && scanTypeSelected && !kioskScanCompleted && kioskTimeoutCountdown > 0 && (
          <div className="kiosk-timeout-display">
            <div className="timeout-card">
              <p>Scanner attivo per altri <strong>{kioskTimeoutCountdown}</strong> secondi</p>
              <div className="timeout-progress-bar">
                <div 
                  className="timeout-progress-fill" 
                  style={{ width: `${((KIOSK_SCAN_TIMEOUT / 1000 - kioskTimeoutCountdown) / (KIOSK_SCAN_TIMEOUT / 1000)) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {/* Controllo Reset per modalità kiosk */}
        {(scanTypeSelected || error || kioskScanCompleted) && (
          <div className="kiosk-manual-controls">
            <button
              className="manual-control-btn reset"
              onClick={toggleScanning}
              disabled={initializing}
            >
              {initializing ? '⏳ Inizializzazione...' : '🔄 Reset'}
            </button>
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

          {/* Scanner attivo in attesa di QR */}
          {isScanning && scanTypeSelected && !kioskScanCompleted && !scanResult && !error && (
            <div className="kiosk-scanning-status">
              <div className="scanning-card">
                <div className="scanning-icon">📱</div>
                <h3>Scanner Attivo</h3>
                <p>Modalità: <strong>{scanType === 'in' ? 'INGRESSO' : 'USCITA'}</strong></p>
                <p>Avvicina il QR code alla camera</p>
              </div>
            </div>
          )}

          {/* Risultato scansione completata */}
          {scanResult && kioskScanCompleted && (
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
                <p><strong>Premi Reset per una nuova timbratura</strong></p>
              </div>
            </div>
          )}

          {/* Errore durante scansione */}
          {error && kioskScanCompleted && (
            <div className="scan-result error">
              <h4>❌ Errore</h4>
              <p className="error-text">{error}</p>
              <div className="next-scan-info">
                <p><strong>Premi Reset per riprovare</strong></p>
              </div>
            </div>
          )}
        </div>

        {/* Placeholder quando scanner non è attivo */}
        {!isScanning && !error && cameras.length > 0 && scanTypeSelected && !kioskScanCompleted && (
          <div className="scanner-placeholder">
            <div className="placeholder-icon">📱</div>
            <p>Tipo selezionato: <strong>{scanType === 'in' ? 'INGRESSO' : 'USCITA'}</strong></p>
            <p>Premi uno dei pulsanti sopra per riavviare</p>
          </div>
        )}

        {cameras.length === 0 && !initializing && (
          <div className="camera-issue">
            <h3>📷 Camera Richiesta</h3>
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
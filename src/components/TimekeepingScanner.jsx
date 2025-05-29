// src/components/TimekeepingScanner.jsx - Versione semplificata per modalità kiosk
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import timekeepingService from '../services/timekeepingService';
import Notification from './Notification';
import './timekeepingScanner.css';

/**
 * Component semplificato per scanning QR codes in modalità kiosk
 * Flusso: Selezione tipo -> Camera -> Scan singolo -> Risultato -> Reset
 */
const TimekeepingScanner = ({ isAdmin = false, deviceId = '', kioskMode = false }) => {
  // Stati principali per il flusso kiosk
  const [scanType, setScanType] = useState(''); // 'in' o 'out'
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  // Timer per timeout scansione (30 secondi)
  const [timeoutTimer, setTimeoutTimer] = useState(null);
  
  // Ref per gestire l'istanza dello scanner
  const html5QrCode = useRef(null);
  const initializeOnce = useRef(false);

  // Costanti
  const SCAN_TIMEOUT = 30000; // 30 secondi
  const NOTIFICATION_DURATION = 4000; // 4 secondi

  /**
   * Mostra notifica con durata personalizzata
   */
  const showNotification = useCallback((message, type, duration = NOTIFICATION_DURATION) => {
    console.log(`Notification: ${type} - ${message}`);
    setNotification({
      show: true,
      message,
      type
    });

    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
      
      // Dopo la notifica, reset completo dello stato
      setTimeout(() => {
        resetToInitialState();
      }, 300);
    }, duration);
  }, []);

  /**
   * Reset completo allo stato iniziale
   */
  const resetToInitialState = useCallback(() => {
    console.log("Resetting to initial state");
    setScanType('');
    setIsScanning(false);
    setScanResult(null);
    setError(null);
    setIsProcessing(false);
    
    // Pulisci timer se esistente
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      setTimeoutTimer(null);
    }
  }, [timeoutTimer]);

  /**
   * Ferma lo scanner in modo sicuro
   */
  const stopScanner = useCallback(async () => {
    try {
      console.log("Stopping scanner...");
      
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        setTimeoutTimer(null);
      }

      if (html5QrCode.current) {
        const currentState = html5QrCode.current.getState();
        if (currentState === Html5Qrcode.SCANNING || currentState === Html5Qrcode.PAUSED) {
          await html5QrCode.current.stop();
          console.log("Scanner stopped successfully");
        }
        html5QrCode.current = null;
      }
    } catch (err) {
      console.error("Error stopping scanner:", err);
      html5QrCode.current = null;
    }
  }, [timeoutTimer]);

  /**
   * Inizializzazione: Recupera le camere disponibili
   */
  const initializeCameras = useCallback(async () => {
    try {
      console.log("Initializing cameras...");
      const devices = await Html5Qrcode.getCameras();
      
      if (devices && devices.length > 0) {
        setCameras(devices);
        
        // Seleziona automaticamente la camera posteriore per kiosk
        const backCamera = devices.find(device =>
          device.label.toLowerCase().includes('back') ||
          device.label.toLowerCase().includes('rear') ||
          device.label.toLowerCase().includes('environment')
        );
        
        setSelectedCamera(backCamera ? backCamera.id : devices[0].id);
        console.log(`Selected camera: ${backCamera ? backCamera.label : devices[0].label}`);
      } else {
        throw new Error("Nessuna camera trovata sul dispositivo");
      }
    } catch (err) {
      console.error("Error initializing cameras:", err);
      setError(`Errore camera: ${err.message}`);
    }
  }, []);

  /**
   * Elabora il risultato della scansione QR
   */
  const processQRScan = useCallback(async (decodedText) => {
    try {
      console.log(`Processing QR scan: ${decodedText}`);
      setIsProcessing(true);

      // Ferma immediatamente lo scanner
      await stopScanner();
      setIsScanning(false);

      // Valida formato QR code
      const parts = decodedText.split(':');
      if (parts.length < 3 || parts[0] !== 'iacuzzo' || parts[1] !== 'user') {
        throw new Error("QR code non valido. Usa solo QR code aziendali.");
      }

      const userId = parts[2];
      console.log(`Valid QR code for user: ${userId}`);

      // Processa la timbratura
      let result;
      if (scanType === 'in') {
        result = await timekeepingService.clockIn(userId, {
          deviceId,
          deviceType: 'kiosk',
          kioskMode: true
        });
        
        const successMessage = `✅ ${result.userName || userId}\nINGRESSO registrato alle ${result.clockInTime}`;
        showNotification(successMessage, "success");
      } else {
        result = await timekeepingService.clockOut(userId, {
          deviceId,
          deviceType: 'kiosk',
          kioskMode: true
        });
        
        const successMessage = `✅ ${result.userName || userId}\nUSCITA registrata alle ${result.clockOutTime}\n\nOre lavorate: ${result.totalHours}\n(${result.standardHours} standard + ${result.overtimeHours} straordinario)`;
        showNotification(successMessage, "success");
      }

      setScanResult({
        success: true,
        userId,
        type: scanType,
        result
      });

    } catch (err) {
      console.error("Error processing QR scan:", err);
      setError(err.message);
      
      const errorMessage = `❌ ERRORE\n${err.message}`;
      showNotification(errorMessage, "error");
    } finally {
      setIsProcessing(false);
    }
  }, [scanType, deviceId, stopScanner, showNotification]);

  /**
   * Avvia lo scanner con timeout
   */
  const startScanner = useCallback(async () => {
    try {
      console.log("Starting scanner...");
      setIsScanning(true);
      setError(null);

      if (!selectedCamera) {
        throw new Error("Nessuna camera selezionata");
      }

      // Ferma scanner esistente se presente
      await stopScanner();

      // Configura scanner
      html5QrCode.current = new Html5Qrcode("qr-reader");

      const config = {
        fps: 15,
        qrbox: { width: 300, height: 300 },
        aspectRatio: 1.0,
        disableFlip: false
      };

      // Avvia scanner
      await html5QrCode.current.start(
        selectedCamera,
        config,
        async (decodedText) => {
          console.log(`QR Code detected: ${decodedText}`);
          
          // Pulisci timeout
          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            setTimeoutTimer(null);
          }
          
          // Processa immediatamente
          await processQRScan(decodedText);
        },
        (errorMessage) => {
          // Ignora errori di scansione normali
          // console.log("QR scan error (normal):", errorMessage);
        }
      );

      console.log("Scanner started successfully");

      // Imposta timeout di 30 secondi
      const timer = setTimeout(async () => {
        console.log("Scanner timeout reached");
        await stopScanner();
        setIsScanning(false);
        
        const timeoutMessage = "⏱️ TIMEOUT\nTempo scaduto. Riprova.";
        showNotification(timeoutMessage, "warning");
      }, SCAN_TIMEOUT);

      setTimeoutTimer(timer);

    } catch (err) {
      console.error("Error starting scanner:", err);
      setIsScanning(false);
      html5QrCode.current = null;
      
      const errorMessage = `❌ ERRORE CAMERA\n${err.message}`;
      showNotification(errorMessage, "error");
    }
  }, [selectedCamera, stopScanner, processQRScan, timeoutTimer]);

  /**
   * Gestisce la selezione del tipo di scansione
   */
  const handleScanTypeSelection = useCallback((type) => {
    console.log(`Scan type selected: ${type}`);
    setScanType(type);
    
    // Avvia automaticamente lo scanner
    setTimeout(() => {
      startScanner();
    }, 300);
  }, [startScanner]);

  /**
   * Inizializzazione componente
   */
  useEffect(() => {
    if (!initializeOnce.current && kioskMode) {
      initializeOnce.current = true;
      initializeCameras();
    }

    // Cleanup
    return () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      stopScanner();
    };
  }, [kioskMode, initializeCameras, stopScanner, timeoutTimer]);

  // Render per modalità NON-kiosk (versione normale amministratore)
  if (!kioskMode) {
    return (
      <div className="timekeeping-scanner">
        <div className="scanner-header">
          <h2>Scanner Timbrature - Modalità Amministratore</h2>
        </div>
        
        <div className="admin-mode-notice">
          <p>Questo scanner è ottimizzato per la modalità kiosk.</p>
          <p>Per la gestione amministrativa completa, usa il pannello amministratore.</p>
        </div>

        {notification.show && (
          <Notification
            message={notification.message}
            isVisible={notification.show}
            onClose={() => setNotification(prev => ({ ...prev, show: false }))}
            type={notification.type}
          />
        )}
      </div>
    );
  }

  // Render principale per modalità KIOSK
  return (
    <div className="timekeeping-scanner kiosk-mode">
      <div className="scanner-header">
        <h2>🏢 Sistema Timbrature</h2>
      </div>

      {/* Selettore tipo scansione - SEMPRE VISIBILE */}
      <div className="scan-type-selector">
        <button
          className={`scan-type-btn ${scanType === 'in' ? 'active' : ''}`}
          onClick={() => handleScanTypeSelection('in')}
          disabled={isScanning || isProcessing}
        >
          🟢 INGRESSO
        </button>
        <button
          className={`scan-type-btn ${scanType === 'out' ? 'active' : ''}`}
          onClick={() => handleScanTypeSelection('out')}
          disabled={isScanning || isProcessing}
        >
        🔴 USCITA
        </button>
      </div>

      {/* Istruzioni - Visibili solo quando non si sta scansionando */}
      {!scanType && !isScanning && (
        <div className="kiosk-instructions">
          <div className="instruction-card">
            <h3>👆 Seleziona il tipo di timbratura</h3>
            <p><strong>INGRESSO:</strong> Per iniziare la giornata lavorativa</p>
            <p><strong>USCITA:</strong> Per terminare la giornata lavorativa</p>
            <p className="instruction-note">
              📱 Dopo la selezione, avrai <strong>30 secondi</strong> per mostrare il tuo QR code alla camera
            </p>
          </div>
        </div>
      )}

      {/* Istruzioni durante la scansione */}
      {scanType && isScanning && (
        <div className="scanning-instructions">
          <div className="instruction-card scanning">
            <h3>📷 Scanner Attivo</h3>
            <p>Modalità: <strong>{scanType === 'in' ? 'INGRESSO' : 'USCITA'}</strong></p>
            <p>Posiziona il tuo QR code davanti alla camera</p>
            <div className="timeout-indicator">
              ⏱️ Tempo rimanente: 30 secondi
            </div>
          </div>
        </div>
      )}

      {/* Container scanner */}
      <div className="scanner-container">
        <div id="qr-reader" className="qr-reader"></div>
        
        {/* Placeholder quando scanner non attivo */}
        {!isScanning && !scanResult && !error && (
          <div className="scanner-placeholder kiosk-placeholder">
            <div className="placeholder-icon">📱</div>
            <p>Seleziona <strong>INGRESSO</strong> o <strong>USCITA</strong> per iniziare</p>
          </div>
        )}
        
        {/* Indicatore di elaborazione */}
        {isProcessing && (
          <div className="processing-indicator">
            <div className="spinner"></div>
            <p>Elaborazione in corso...</p>
          </div>
        )}
      </div>

      {/* Notifiche */}
      {notification.show && (
        <div className="kiosk-notification-overlay">
          <Notification
            message={notification.message}
            isVisible={notification.show}
            onClose={() => setNotification(prev => ({ ...prev, show: false }))}
            type={notification.type}
          />
        </div>
      )}

      {/* Errore camera */}
      {cameras.length === 0 && error && (
        <div className="camera-error">
          <h3>❌ Errore Camera</h3>
          <p>{error}</p>
          <button 
            className="retry-btn"
            onClick={() => {
              setError(null);
              initializeCameras();
            }}
          >
            🔄 Riprova
          </button>
        </div>
      )}

      {/* Info dispositivo (solo per debug, nascosto in produzione) */}
      {process.env.NODE_ENV === 'development' && deviceId && (
        <div className="device-debug-info">
          <small>Device: {deviceId} | Cameras: {cameras.length}</small>
        </div>
      )}
    </div>
  );
};

export default TimekeepingScanner;
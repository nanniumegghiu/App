// src/components/TimekeepingScanner.jsx - Versione completamente riscritta
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import timekeepingService from '../services/timekeepingService';
import Notification from './Notification';

/**
 * TimekeepingScanner - Versione riscritta con modalità admin e kiosk semplificate
 */
const TimekeepingScanner = ({ isAdmin = false, deviceId = '', kioskMode = false }) => {
  // Stati principali
  const [scanType, setScanType] = useState(''); // 'in' o 'out'
  const [isScanning, setIsScanning] = useState(false);
  const [isCaptured, setIsCaptured] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [scanTimeout, setScanTimeout] = useState(null);
  
  // Refs
  const html5QrCode = useRef(null);
  const timeoutRef = useRef(null);

  // Costanti
  const SCAN_TIMEOUT = 30000; // 30 secondi

  // Funzione per mostrare notifiche
  const showNotification = useCallback((message, type = 'info') => {
    setNotification({
      show: true,
      message,
      type
    });

    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 4000);
  }, []);

  // Inizializza le camere disponibili
  const initializeCameras = useCallback(async () => {
    try {
      console.log('Inizializzazione camere...');
      const devices = await Html5Qrcode.getCameras();
      console.log('Camere trovate:', devices);
      
      if (devices && devices.length > 0) {
        setCameras(devices);
        
        // In modalità kiosk, preferisci la camera posteriore
        if (kioskMode) {
          const backCamera = devices.find(device =>
            device.label.toLowerCase().includes('back') ||
            device.label.toLowerCase().includes('rear') ||
            device.label.toLowerCase().includes('environment')
          );
          setSelectedCamera(backCamera ? backCamera.id : devices[0].id);
          console.log('Camera selezionata (kiosk):', backCamera ? backCamera.id : devices[0].id);
        } else {
          setSelectedCamera(devices[0].id);
          console.log('Camera selezionata (admin):', devices[0].id);
        }
      } else {
        console.warn('Nessuna camera trovata');
        showNotification('Nessuna camera trovata sul dispositivo', 'error');
      }
    } catch (error) {
      console.error('Errore accesso camera:', error);
      showNotification(`Errore accesso alla camera: ${error.message}`, 'error');
    }
  }, [kioskMode, showNotification]);

  // Inizializza al montaggio del componente
  useEffect(() => {
    initializeCameras();
    
    return () => {
      stopScanner();
    };
  }, [initializeCameras]);

  // Ferma lo scanner e pulisce le risorse
  const stopScanner = useCallback(async () => {
    try {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (html5QrCode.current) {
        try {
          const state = html5QrCode.current.getState();
          if (state === Html5Qrcode.SCANNING || state === Html5Qrcode.PAUSED) {
            await html5QrCode.current.stop();
          }
        } catch (stopError) {
          console.warn('Errore stop scanner (non critico):', stopError);
        }
        html5QrCode.current = null;
      }

      setIsScanning(false);
      setIsCaptured(false);
    } catch (error) {
      console.error('Errore stop scanner:', error);
      html5QrCode.current = null;
      setIsScanning(false);
      setIsCaptured(false);
    }
  }, []);

  // Processa il QR Code scansionato
  const processQRCode = useCallback(async (qrText, type) => {
    try {
      // Verifica formato QR Code
      const parts = qrText.split(':');
      if (parts.length < 3 || parts[0] !== 'iacuzzo' || parts[1] !== 'user') {
        throw new Error('QR Code non valido - Formato non riconosciuto');
      }

      const userId = parts[2];
      const typeText = type === 'in' ? 'INGRESSO' : 'USCITA';

      // Processa la timbratura
      let result;
      if (type === 'in') {
        result = await timekeepingService.clockIn(userId, {
          deviceId,
          isAdmin,
          deviceType: kioskMode ? 'kiosk' : 'admin-scanner',
          kioskMode
        });
        
        showNotification(
          `✅ ${result.userName || userId} - ${typeText} registrato alle ${result.clockInTime}`,
          'success'
        );
      } else {
        result = await timekeepingService.clockOut(userId, {
          deviceId,
          isAdmin,
          deviceType: kioskMode ? 'kiosk' : 'admin-scanner',
          kioskMode
        });

        showNotification(
          `✅ ${result.userName || userId} - ${typeText} registrato. Ore: ${result.totalHours} (${result.standardHours} std + ${result.overtimeHours} straord.)`,
          'success'
        );
      }

      // Reset per nuova scansione
      setScanType('');

    } catch (error) {
      console.error('Errore processamento QR:', error);
      
      // Gestisci errori specifici
      let errorMessage = error.message;
      
      if (errorMessage.includes('già un ingresso attivo')) {
        errorMessage = '❌ INGRESSO già registrato - Prima devi timbrare l\'USCITA';
      } else if (errorMessage.includes('Nessun ingresso attivo')) {
        errorMessage = '❌ USCITA non possibile - Prima devi timbrare l\'INGRESSO';
      } else if (errorMessage.includes('QR code disattivato')) {
        errorMessage = '❌ QR Code disattivato dall\'amministratore';
      } else if (errorMessage.includes('Utente non trovato')) {
        errorMessage = '❌ Utente non trovato nel sistema';
      } else if (errorMessage.includes('non valido')) {
        errorMessage = '❌ QR Code non valido';
      }

      showNotification(errorMessage, 'error');
      
      // Reset per nuova scansione
      setScanType('');
    }
  }, [deviceId, isAdmin, kioskMode, showNotification]);

  // Avvia lo scanner per il tipo selezionato
  const startScanner = useCallback(async (type) => {
    if (!selectedCamera) {
      showNotification('Nessuna camera selezionata', 'error');
      return;
    }

    try {
      // Ferma lo scanner se già attivo
      await stopScanner();

      setScanType(type);
      setIsScanning(true);
      setIsCaptured(false);

      // Mostra notifica di avvio
      const typeText = type === 'in' ? 'INGRESSO' : 'USCITA';
      showNotification(`Scanner ${typeText} attivato - Inquadra il QR Code`, 'info');

      // Aspetta che il DOM sia aggiornato prima di inizializzare lo scanner
      setTimeout(async () => {
        try {
          // Verifica che l'elemento esista
          const qrReaderElement = document.getElementById("qr-reader");
          if (!qrReaderElement) {
            throw new Error('Elemento qr-reader non trovato nel DOM');
          }

          // Inizializza Html5Qrcode
          html5QrCode.current = new Html5Qrcode("qr-reader");

          const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            disableFlip: false
          };

          // Variabile locale per controllo cattura immediata
          let localCaptured = false;

          // Avvia lo scanner
          await html5QrCode.current.start(
            selectedCamera,
            config,
            // Callback successo
            async (decodedText, decodedResult) => {
              console.log('QR Code rilevato:', decodedText);
              
              // Controllo doppio: stato React e variabile locale
              if (localCaptured) {
                console.log('QR già catturato localmente, ignoro questa scansione');
                return;
              }
              
              // Imposta immediatamente il flag locale per bloccare altre scansioni
              localCaptured = true;
              setIsCaptured(true);
              
              console.log('Prima scansione, processo il QR code');

              try {
                // Ferma immediatamente lo scanner PRIMA del processamento
                if (html5QrCode.current) {
                  console.log('Fermando scanner...');
                  await html5QrCode.current.stop();
                  html5QrCode.current = null;
                  console.log('Scanner fermato');
                }

                // Processa la scansione
                await processQRCode(decodedText, type);
                
                // Reset completo degli stati
                setTimeout(() => {
                  console.log('Reset finale degli stati');
                  setIsScanning(false);
                  setIsCaptured(false);
                  setScanType('');
                }, 100);

              } catch (processError) {
                console.error('Errore durante il processamento:', processError);
                // Reset in caso di errore
                localCaptured = false;
                setIsCaptured(false);
                setScanType('');
                setIsScanning(false);
              }
            },
            // Callback errore (ignoriamo gli errori di non rilevamento)
            (errorMessage) => {
              // Ignora errori comuni di non rilevamento - non loggare
            }
          );

          // Imposta timeout per chiusura automatica
          timeoutRef.current = setTimeout(async () => {
            console.log('Timeout scanner - nessuna scansione effettuata');
            if (!localCaptured) {
              await stopScanner();
              setScanType('');
              showNotification('Timeout scansione - Seleziona nuovamente il tipo di timbratura', 'warning');
            }
          }, SCAN_TIMEOUT);

        } catch (initError) {
          console.error('Errore inizializzazione scanner:', initError);
          await stopScanner();
          setScanType('');
          showNotification(`Errore inizializzazione: ${initError.message}`, 'error');
        }
      }, 100); // Piccolo delay per permettere al DOM di aggiornarsi

    } catch (error) {
      console.error('Errore avvio scanner:', error);
      await stopScanner();
      setScanType('');
      showNotification('Errore avvio scanner. Riprova.', 'error');
    }
  }, [selectedCamera, stopScanner, showNotification, processQRCode]);

  // Gestisce la selezione del tipo di scansione
  const handleScanTypeSelection = useCallback((type) => {
    startScanner(type);
  }, [startScanner]);

  // Gestisce cambio camera (solo in modalità admin)
  const handleCameraChange = useCallback((e) => {
    setSelectedCamera(e.target.value);
  }, []);

  // Ferma lo scanner manualmente
  const handleStopScanner = useCallback(async () => {
    await stopScanner();
    setScanType('');
    showNotification('Scanner fermato', 'info');
  }, [stopScanner, showNotification]);

  // Render per modalità admin
  if (!kioskMode) {
    return (
      <div className="timekeeping-scanner admin-mode">
        <div className="scanner-header">
          <h2>Scanner QrCode</h2>
        </div>

        {/* Notifiche */}
        {notification.show && (
          <Notification
            message={notification.message}
            isVisible={notification.show}
            onClose={() => setNotification(prev => ({ ...prev, show: false }))}
            type={notification.type}
          />
        )}

        {/* Selettore Camera */}
        {cameras.length > 0 && !isScanning && (
          <div className="camera-selector">
            <label htmlFor="camera-select">Camera:</label>
            <select
              id="camera-select"
              value={selectedCamera}
              onChange={handleCameraChange}
            >
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.label || `Camera ${camera.id}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Pulsanti Selezione Tipo */}
        {!isScanning && (
          <div className="scan-type-buttons">
            <button
              className="scan-type-btn ingresso"
              onClick={() => handleScanTypeSelection('in')}
              disabled={cameras.length === 0}
            >
              🔵 INGRESSO
            </button>
            <button
              className="scan-type-btn uscita"
              onClick={() => handleScanTypeSelection('out')}
              disabled={cameras.length === 0}
            >
              🔴 USCITA
            </button>
          </div>
        )}

        {/* Container Scanner */}
        {isScanning && (
          <div className="scanner-container">
            <div className="scanner-status">
              <p>Scanner {scanType === 'in' ? 'INGRESSO' : 'USCITA'} attivo</p>
              <button className="stop-scanner-btn" onClick={handleStopScanner}>
                Ferma Scanner
              </button>
            </div>
            <div id="qr-reader"></div>
          </div>
        )}

        {/* Messaggio se nessuna camera */}
        {cameras.length === 0 && (
          <div className="no-camera-message">
            <p>❌ Nessuna camera rilevata</p>
            <p>Verifica i permessi della camera e ricarica la pagina</p>
            <button onClick={initializeCameras}>
              Rileva Camera
            </button>
          </div>
        )}
      </div>
    );
  }

  // Render per modalità kiosk
  return (
    <div className="timekeeping-scanner kiosk-mode">
      <div className="kiosk-header">
        <h1>Sistema Timbrature</h1>
      </div>

      {/* Notifiche */}
      {notification.show && (
        <div className="kiosk-notification">
          <Notification
            message={notification.message}
            isVisible={notification.show}
            onClose={() => setNotification(prev => ({ ...prev, show: false }))}
            type={notification.type}
          />
        </div>
      )}

      {/* Pulsanti Selezione Tipo - Sempre visibili in kiosk */}
      {!isScanning && (
        <div className="kiosk-scan-buttons">
          <button
            className="kiosk-scan-btn ingresso"
            onClick={() => handleScanTypeSelection('in')}
            disabled={cameras.length === 0}
          >
            <div className="btn-icon">🔵</div>
            <div className="btn-text">INGRESSO</div>
          </button>
          <button
            className="kiosk-scan-btn uscita"
            onClick={() => handleScanTypeSelection('out')}
            disabled={cameras.length === 0}
          >
            <div className="btn-icon">🔴</div>
            <div className="btn-text">USCITA</div>
          </button>
        </div>
      )}

      {/* Istruzioni quando non si sta scansionando */}
      {!isScanning && cameras.length > 0 && (
        <div className="kiosk-instructions">
          <h2>Seleziona il tipo di timbratura</h2>
          <p>Premi INGRESSO o USCITA per attivare lo scanner</p>
        </div>
      )}

      {/* Container Scanner per Kiosk */}
      {isScanning && (
        <div className="kiosk-scanner-container">
          <div className="scanner-type-indicator">
            <h2>Scanner {scanType === 'in' ? 'INGRESSO' : 'USCITA'} Attivo</h2>
            <p>Inquadra il tuo QR Code personale</p>
          </div>
          <div id="qr-reader"></div>
          <div className="scanner-timeout-info">
            <p>⏱️ Scanner si chiuderà automaticamente tra 30 secondi</p>
          </div>
        </div>
      )}

      {/* Messaggio errore camera in kiosk */}
      {cameras.length === 0 && (
        <div className="kiosk-no-camera">
          <div className="error-icon">📷</div>
          <h2>Camera Non Disponibile</h2>
          <p>Impossibile accedere alla camera del dispositivo</p>
          <button onClick={initializeCameras} className="retry-camera-btn">
            Riprova
          </button>
        </div>
      )}
    </div>
  );
};

export default TimekeepingScanner;
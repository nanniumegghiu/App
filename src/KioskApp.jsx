// src/KioskApp.jsx - Modalità kiosk dedicata per dispositivi Android con logout di emergenza
import React, { useState, useEffect } from 'react';
import TimekeepingScanner from './components/TimekeepingScanner';
import Notification from './components/Notification';
import timekeepingService from './services/timekeepingService';
import { auth } from './firebase';
import { signOut } from 'firebase/auth';
import './kioskMode.css';

/**
 * Applicazione in modalità kiosk per dispositivi Android dedicati
 * Mostra solo lo scanner QR per le timbrature
 */
const KioskApp = () => {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('online');
  const [emergencyCode, setEmergencyCode] = useState('');
  const [showEmergencyInput, setShowEmergencyInput] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [tapTimer, setTapTimer] = useState(null);

  // Inizializzazione dell'app kiosk
  useEffect(() => {
    // Controlla se siamo in modalità kiosk (parametro URL o localStorage)
    const urlParams = new URLSearchParams(window.location.search);
    const kioskMode = urlParams.get('kiosk') || localStorage.getItem('kiosk_mode');
    
    if (kioskMode === 'true') {
      initializeKioskMode();
    }
    
    // Monitora stato connessione
    const handleOnline = () => setConnectionStatus('online');
    const handleOffline = () => setConnectionStatus('offline');
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Monitora livello batteria (se supportato)
    if ('getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        setBatteryLevel(Math.round(battery.level * 100));
        
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      });
    }
    
    // Event listener per il codice di emergenza
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Attiva il campo di input per il codice di emergenza
        setShowEmergencyInput(true);
        e.preventDefault();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('keydown', handleKeyDown);
      
      // Pulisci il timer se esiste
      if (tapTimer) {
        clearTimeout(tapTimer);
      }
    };
  }, []);

  // Inizializza modalità kiosk
  const initializeKioskMode = () => {
    // Rimuovi barre di scorrimento
    document.body.style.overflow = 'hidden';
    
    // Forza schermo sempre acceso (se supportato)
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').catch(err => {
        console.log('Wake lock not supported:', err);
      });
    }
    
    // NON richiedere fullscreen automaticamente - aspetta interazione utente
    
    // Previeni zoom e scroll
    document.addEventListener('touchmove', preventDefault, { passive: false });
    document.addEventListener('wheel', preventDefault, { passive: false });
    document.addEventListener('keydown', preventKeyboard);
    
    // Carica info dispositivo dal localStorage
    const savedDeviceId = localStorage.getItem('kiosk_device_id');
    const savedDeviceName = localStorage.getItem('kiosk_device_name');
    
    if (savedDeviceId && savedDeviceName) {
      setDeviceId(savedDeviceId);
      setDeviceName(savedDeviceName);
      setIsAuthenticated(true);
    }
  };

  // Entra in modalità fullscreen (solo quando richiesto dall'utente)
  const requestFullscreen = () => {
    const element = document.documentElement;
    
    if (element.requestFullscreen) {
      element.requestFullscreen().then(() => {
        setIsFullscreen(true);
        showNotification('Modalità fullscreen attivata', 'success');
      }).catch(err => {
        console.log('Fullscreen request denied:', err);
        showNotification('Fullscreen non disponibile - continua in modalità normale', 'warning');
      });
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
      setIsFullscreen(true);
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
      setIsFullscreen(true);
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
      setIsFullscreen(true);
    } else {
      showNotification('Fullscreen non supportato su questo browser', 'warning');
    }
  };

  // Previeni azioni indesiderate
  const preventDefault = (e) => {
    e.preventDefault();
  };

  const preventKeyboard = (e) => {
    // Blocca F12, Ctrl+Shift+I, Ctrl+U, etc. ma permetti Escape
    if (e.key === 'Escape') {
      return; // Permetti Escape per il logout di emergenza
    }
    
    if (e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.key === 'u') ||
        e.key === 'F5' ||
        (e.ctrlKey && e.key === 'r')) {
      e.preventDefault();
    }
  };

  // Gestisce i tap nell'angolo alto sinistro per l'emergenza
  const handleEmergencyTap = (e) => {
    // Controlla se il tap è nell'angolo alto sinistro (100x100 pixel)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const y = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    
    // Area di emergenza: angolo alto sinistro 100x100 pixel
    if (x <= 100 && y <= 100) {
      const newTapCount = tapCount + 1;
      setTapCount(newTapCount);
      
      // Pulisci il timer precedente
      if (tapTimer) {
        clearTimeout(tapTimer);
      }
      
      // Se raggiunge 5 tap, attiva l'emergenza
      if (newTapCount >= 5) {
        setShowEmergencyInput(true);
        setTapCount(0);
        setTapTimer(null);
        
        // Feedback visivo/tattile
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200, 100, 200]); // Vibrazione di emergenza
        }
        
        showNotification('🚨 Modalità emergenza attivata!', 'warning');
        return;
      }
      
      // Imposta timer per reset automatico dopo 3 secondi
      const timer = setTimeout(() => {
        setTapCount(0);
        setTapTimer(null);
      }, 3000);
      
      setTapTimer(timer);
      
      // Feedback visivo per i tap
      if (navigator.vibrate) {
        navigator.vibrate(50); // Vibrazione breve per feedback
      }
      
      // Mostra indicatore visivo temporaneo
      const indicator = document.createElement('div');
      indicator.className = 'tap-indicator';
      indicator.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        width: 60px;
        height: 60px;
        background: rgba(231, 76, 60, 0.8);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 1.2rem;
        z-index: 9999;
        animation: tap-pulse 0.5s ease-out;
        pointer-events: none;
      `;
      indicator.textContent = newTapCount;
      document.body.appendChild(indicator);
      
      // Rimuovi l'indicatore dopo l'animazione
      setTimeout(() => {
        if (document.body.contains(indicator)) {
          document.body.removeChild(indicator);
        }
      }, 500);
    }
  };

  const handleEmergencyLogout = async () => {
    if (emergencyCode === 'EXITSCANNER') {
      try {
        // Logout dall'autenticazione
        if (auth.currentUser) {
          await signOut(auth);
        }
        
        // Rimuovi modalità kiosk
        localStorage.removeItem('kiosk_mode');
        localStorage.removeItem('kiosk_device_id');
        localStorage.removeItem('kiosk_device_name');
        localStorage.removeItem('kiosk_auth_time');
        
        // Esci da fullscreen
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
        
        // Reindirizza alla pagina normale
        window.location.href = '/';
      } catch (error) {
        console.error('Errore durante il logout di emergenza:', error);
        showNotification('Errore durante il logout di emergenza', 'error');
      }
    } else {
      showNotification('Codice di emergenza non valido', 'error');
      setEmergencyCode('');
    }
  };

  // Autentica dispositivo kiosk
  const authenticateDevice = async () => {
    if (!deviceId || !deviceName || !authCode) {
      showNotification('Compila tutti i campi richiesti', 'error');
      return;
    }
    
    // Codice di autenticazione per modalità kiosk (da configurare)
    if (authCode !== 'KIOSK2025') {
      showNotification('Codice di autenticazione non valido', 'error');
      return;
    }
    
    try {
      // Verifica che il dispositivo sia registrato
      await timekeepingService.registerTimekeepingDevice(deviceId, deviceName, {
        deviceType: 'kiosk',
        kioskMode: true,
        userAgent: navigator.userAgent,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        registeredAt: new Date().toISOString()
      });
      
      // Salva info dispositivo
      localStorage.setItem('kiosk_device_id', deviceId);
      localStorage.setItem('kiosk_device_name', deviceName);
      localStorage.setItem('kiosk_auth_time', new Date().toISOString());
      
      setIsAuthenticated(true);
      showNotification('Dispositivo autenticato con successo', 'success');
      
      // Prova ad attivare fullscreen ora che abbiamo un'interazione utente
      setTimeout(() => {
        requestFullscreen();
      }, 500);
      
    } catch (error) {
      console.error('Errore autenticazione:', error);
      showNotification('Errore durante l\'autenticazione: ' + error.message, 'error');
    }
  };

  // Logout dispositivo (per manutenzione)
  const logoutDevice = () => {
    const confirmLogout = window.confirm('Sei sicuro di voler disconnettere questo dispositivo?');
    if (confirmLogout) {
      localStorage.removeItem('kiosk_device_id');
      localStorage.removeItem('kiosk_device_name');
      localStorage.removeItem('kiosk_auth_time');
      setIsAuthenticated(false);
      setDeviceId('');
      setDeviceName('');
      setAuthCode('');
    }
  };

  // Mostra notifica
  const showNotification = (message, type) => {
    setNotification({
      show: true,
      message,
      type
    });
    
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 5000);
  };

  // Ottieni ora corrente
  const getCurrentTime = () => {
    return new Date().toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Se non autenticato, mostra schermata di setup
  if (!isAuthenticated) {
    return (
      <div 
        className="kiosk-setup"
        onClick={handleEmergencyTap}
        onTouchStart={handleEmergencyTap}
      >
        <div className="setup-container">
          <div className="setup-header">
            <h1>🔒 Configurazione Dispositivo Kiosk</h1>
            <p>Configura questo dispositivo per le timbrature</p>
          </div>
          
          <div className="setup-form">
            <div className="form-group">
              <label htmlFor="deviceId">ID Dispositivo</label>
              <input
                type="text"
                id="deviceId"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="es. tablet-ingresso-01"
                autoComplete="off"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="deviceName">Nome Dispositivo</label>
              <input
                type="text"
                id="deviceName"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="es. Tablet Ingresso Principale"
                autoComplete="off"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="authCode">Codice Autorizzazione</label>
              <input
                type="password"
                id="authCode"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="Inserisci codice di autorizzazione"
                autoComplete="off"
              />
            </div>
            
            <button 
              className="setup-button"
              onClick={authenticateDevice}
            >
              Configura Dispositivo
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
        </div>
        
        {/* Input di emergenza per il logout */}
        {showEmergencyInput && (
          <div className="emergency-overlay">
            <div className="emergency-form">
              <h3>🚨 Logout di Emergenza</h3>
              <p>Inserisci il codice di emergenza per uscire dalla modalità kiosk:</p>
              <input
                type="password"
                value={emergencyCode}
                onChange={(e) => setEmergencyCode(e.target.value)}
                placeholder="Inserisci codice di emergenza"
                autoFocus
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleEmergencyLogout();
                  }
                }}
              />
              <div className="emergency-buttons">
                <button onClick={handleEmergencyLogout} className="emergency-confirm">
                  Conferma Logout
                </button>
                <button 
                  onClick={() => {
                    setShowEmergencyInput(false);
                    setEmergencyCode('');
                    setTapCount(0); // Reset tap count quando si chiude
                    if (tapTimer) {
                      clearTimeout(tapTimer);
                      setTapTimer(null);
                    }
                  }} 
                  className="emergency-cancel"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Indicatore visivo area tap di emergenza (solo durante i tap) */}
        {tapCount > 0 && (
          <div className="emergency-tap-zone">
            <div className="tap-progress">
              <div className="tap-counter">{tapCount}/5</div>
              <div className="tap-progress-bar">
                <div 
                  className="tap-progress-fill" 
                  style={{ width: `${(tapCount / 5) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className="kiosk-app" 
      onClick={handleEmergencyTap}
      onTouchStart={handleEmergencyTap}
    >
      {/* Header con info dispositivo */}
      <div className="kiosk-header">
        <div className="device-info">
          <div className="device-name">
            📱 {deviceName}
          </div>
          <div className="device-status">
            <span className="time">{getCurrentTime()}</span>
            <span className={`connection ${connectionStatus}`}>
              {connectionStatus === 'online' ? '🟢' : '🔴'} {connectionStatus}
            </span>
            {batteryLevel !== null && (
              <span className="battery">
                🔋 {batteryLevel}%
              </span>
            )}
          </div>
        </div>
        
        {/* Pulsante nascosto per logout (doppio tap + hold) */}
        <div 
          className="hidden-logout"
          onDoubleClick={(e) => {
            // Solo per emergenze - richiede doppio click + conferma
            setTimeout(() => {
              const secret = prompt('Inserisci codice di manutenzione:');
              if (secret === 'MANUTENZIONE2025') {
                logoutDevice();
              }
            }, 1000);
          }}
        >
          ⚙️
        </div>
      </div>

      {/* Scanner principale */}
      <div className="kiosk-scanner-container">
        <TimekeepingScanner 
          isAdmin={false}
          deviceId={deviceId}
          kioskMode={true}
        />
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
      
      {/* Input di emergenza per il logout */}
      {showEmergencyInput && (
        <div className="emergency-overlay">
          <div className="emergency-form">
            <h3>🚨 Logout di Emergenza</h3>
            <p>Inserisci il codice di emergenza per uscire dalla modalità kiosk:</p>
            <input
              type="password"
              value={emergencyCode}
              onChange={(e) => setEmergencyCode(e.target.value)}
              placeholder="Inserisci codice di emergenza"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleEmergencyLogout();
                }
              }}
            />
            <div className="emergency-buttons">
              <button onClick={handleEmergencyLogout} className="emergency-confirm">
                Conferma Logout
              </button>
              <button 
                onClick={() => {
                  setShowEmergencyInput(false);
                  setEmergencyCode('');
                }} 
                className="emergency-cancel"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Overlay per prevenire interazioni indesiderate */}
      <div className="interaction-overlay" />
    </div>
  );
};

export default KioskApp;
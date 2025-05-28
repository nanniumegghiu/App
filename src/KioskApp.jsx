// src/KioskApp.jsx - Versione ottimizzata per dispositivi responsive
import React, { useState, useEffect } from 'react';
import TimekeepingScanner from './components/TimekeepingScanner';
import Notification from './components/Notification';
import timekeepingService from './services/timekeepingService';
import { auth } from './firebase';
import { signOut } from 'firebase/auth';
import './kioskMode.css';

/**
 * Applicazione in modalità kiosk ottimizzata per tutti i dispositivi
 * Con supporto responsive completo e gestione dinamica del viewport
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
  const [currentTime, setCurrentTime] = useState(new Date());

  // Nuovo stato per gestire le dimensioni del viewport
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const [screenOrientation, setScreenOrientation] = useState('portrait');

  // Gestione dinamica del viewport height per mobile browsers
  useEffect(() => {
    const updateViewportHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      setViewportHeight(window.innerHeight);
    };

    const updateOrientation = () => {
      const orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
      setScreenOrientation(orientation);
    };

    // Imposta valori iniziali
    updateViewportHeight();
    updateOrientation();

    // Event listeners per aggiornamenti dinamici
    window.addEventListener('resize', updateViewportHeight);
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        updateViewportHeight();
        updateOrientation();
      }, 100);
    });

    // Aggiorna anche su scroll per iOS Safari
    let resizeTimer;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        updateViewportHeight();
        updateOrientation();
      }, 150);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize);
      clearTimeout(resizeTimer);
    };
  }, []);

  // Aggiornamento dell'ora corrente
  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timeInterval);
  }, []);

  // Inizializzazione dell'app kiosk con ottimizzazioni responsive
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const kioskMode = urlParams.get('kiosk') || localStorage.getItem('kiosk_mode');
    
    if (kioskMode === 'true') {
      initializeKioskMode();
    }
    
    // Monitora stato connessione
    const handleOnlineStatus = () => {
      setConnectionStatus(navigator.onLine ? 'online' : 'offline');
    };
    
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    
    // Monitora livello batteria (se supportato)
    if ('getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        setBatteryLevel(Math.round(battery.level * 100));
        
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      }).catch(() => {
        // Ignora errori se l'API non è supportata
      });
    }
    
    // Event listener per il codice di emergenza
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowEmergencyInput(true);
        e.preventDefault();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
      document.removeEventListener('keydown', handleKeyDown);
      
      if (tapTimer) {
        clearTimeout(tapTimer);
      }
    };
  }, []);

  // Inizializza modalità kiosk con ottimizzazioni responsive
  const initializeKioskMode = () => {
    // Gestione responsive del body overflow
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'relative';
    document.body.style.height = '100vh';
    document.body.style.height = 'calc(var(--vh, 1vh) * 100)';
    
    // Forza schermo sempre acceso (se supportato)
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').catch(err => {
        console.log('Wake lock not supported:', err);
      });
    }
    
    // Previeni zoom e scroll con gestione touch migliorata
    const preventZoomAndScroll = (e) => {
      // Permetti scroll se il contenuto è più alto del viewport
      if (e.target.closest('.kiosk-app')) {
        const scrollableParent = e.target.closest('[data-scrollable]') || 
                                e.target.closest('.emergency-form') ||
                                e.target.closest('.setup-container') ||
                                e.target.closest('.timekeeping-scanner');
        
        if (scrollableParent) {
          return; // Permetti scroll su elementi specifici
        }
      }
      
      if (e.touches && e.touches.length > 1) {
        e.preventDefault(); // Previeni pinch-to-zoom
      }
    };
    
    const preventKeyboard = (e) => {
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
    
    document.addEventListener('touchmove', preventZoomAndScroll, { passive: false });
    document.addEventListener('wheel', preventZoomAndScroll, { passive: false });
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

  // Entra in modalità fullscreen con gestione responsive
  const requestFullscreen = () => {
    const element = document.documentElement;
    
    const enterFullscreen = async () => {
      try {
        if (element.requestFullscreen) {
          await element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
          await element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
          await element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
          await element.msRequestFullscreen();
        } else {
          throw new Error('Fullscreen not supported');
        }
        
        setIsFullscreen(true);
        showNotification('Modalità fullscreen attivata', 'success');
        
        // Forza aggiornamento del viewport dopo fullscreen
        setTimeout(() => {
          const vh = window.innerHeight * 0.01;
          document.documentElement.style.setProperty('--vh', `${vh}px`);
        }, 500);
        
      } catch (err) {
        console.log('Fullscreen request denied:', err);
        showNotification('Impossibile attivare fullscreen - continua in modalità normale', 'warning');
      }
    };
    
    enterFullscreen();
  };

  // Gestisce i tap nell'angolo alto sinistro per l'emergenza
  const handleEmergencyTap = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const y = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    
    // Area di emergenza responsiva: 15% della larghezza e altezza dello schermo, min 80px, max 120px
    const emergencyAreaSize = Math.min(Math.max(window.innerWidth * 0.15, 80), 120);
    
    if (x <= emergencyAreaSize && y <= emergencyAreaSize) {
      const newTapCount = tapCount + 1;
      setTapCount(newTapCount);
      
      if (tapTimer) {
        clearTimeout(tapTimer);
      }
      
      if (newTapCount >= 5) {
        setShowEmergencyInput(true);
        setTapCount(0);
        setTapTimer(null);
        
        // Feedback visivo/tattile
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200, 100, 200]);
        }
        
        showNotification('🚨 Modalità emergenza attivata!', 'warning');
        return;
      }
      
      const timer = setTimeout(() => {
        setTapCount(0);
        setTapTimer(null);
      }, 3000);
      
      setTapTimer(timer);
      
      // Feedback visivo responsivo
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      
      const indicator = document.createElement('div');
      indicator.className = 'tap-indicator';
      const indicatorSize = Math.min(window.innerWidth * 0.15, 60);
      indicator.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        width: ${indicatorSize}px;
        height: ${indicatorSize}px;
        background: rgba(231, 76, 60, 0.8);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${Math.min(indicatorSize * 0.4, 20)}px;
        z-index: 9999;
        animation: tap-pulse 0.5s ease-out;
        pointer-events: none;
      `;
      indicator.textContent = newTapCount;
      document.body.appendChild(indicator);
      
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
        if (auth.currentUser) {
          await signOut(auth);
        }
        
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
        
        // Ripristina body overflow
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.height = '';
        
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
    
    if (authCode !== 'KIOSK2025') {
      showNotification('Codice di autenticazione non valido', 'error');
      return;
    }
    
    try {
      await timekeepingService.registerTimekeepingDevice(deviceId, deviceName, {
        deviceType: 'kiosk',
        kioskMode: true,
        userAgent: navigator.userAgent,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        viewportSize: `${window.innerWidth}x${window.innerHeight}`,
        orientation: screenOrientation,
        registeredAt: new Date().toISOString()
      });
      
      localStorage.setItem('kiosk_device_id', deviceId);
      localStorage.setItem('kiosk_device_name', deviceName);
      localStorage.setItem('kiosk_auth_time', new Date().toISOString());
      
      setIsAuthenticated(true);
      showNotification('Dispositivo autenticato con successo', 'success');
      
      // Prova ad attivare fullscreen dopo un'interazione utente
      setTimeout(() => {
        requestFullscreen();
      }, 1000);
      
    } catch (error) {
      console.error('Errore autenticazione:', error);
      showNotification('Errore durante l\'autenticazione: ' + error.message, 'error');
    }
  };

  // Logout dispositivo
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

  // Genera un ID dispositivo casuale
  const generateRandomId = () => {
    const randomString = Math.random().toString(36).substring(2, 10);
    setDeviceId(`device_${randomString}`);
  };

  // Ottieni ora corrente formattata
  const getCurrentTime = () => {
    return currentTime.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Ottieni informazioni sullo schermo per debug
  const getScreenInfo = () => {
    if (process.env.NODE_ENV === 'development') {
      return `${window.innerWidth}x${viewportHeight} (${screenOrientation})`;
    }
    return '';
  };

  // Se non autenticato, mostra schermata di setup responsiva
  if (!isAuthenticated) {
    return (
      <div 
        className="kiosk-setup"
        onClick={handleEmergencyTap}
        onTouchStart={handleEmergencyTap}
        data-scrollable="true"
      >
        <div className="setup-container">
          <div className="setup-header">
            <h1>🔒 Configurazione Dispositivo Kiosk</h1>
            <p>Configura questo dispositivo per le timbrature</p>
            {process.env.NODE_ENV === 'development' && (
              <p style={{fontSize: '0.8rem', color: '#999', marginTop: '10px'}}>
                Debug: {getScreenInfo()}
              </p>
            )}
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
            
            <button 
              className="setup-button"
              type="button"
              onClick={generateRandomId}
              style={{
                background: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)',
                marginTop: '10px'
              }}
            >
              Genera ID Casuale
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
                    setTapCount(0);
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
        
        {/* Indicatore visivo area tap di emergenza */}
        {tapCount > 0 && (
          <div className="emergency-tap-zone">
            <div className="tap-progress">
              <div className="tap-counter">{tapCount}/5</div>
              <div className="tap-progress-bar">
                <div 
                  className="tap-progress-fill" 
                  style={{ width: `${(tapCount
// src/components/TimekeepingScanner.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import timekeepingService from '../services/timekeepingService';
import Notification from './Notification';
import './timekeepingScanner.css';

/**
 * Component for scanning QR codes for clock-in/out operations
 * @param {Object} props
 * @param {boolean} props.isAdmin - Whether the current user is an admin
 * @param {string} props.deviceId - The device ID for authorized devices
 * @returns {JSX.Element}
 */
const TimekeepingScanner = ({ isAdmin = false, deviceId = '' }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [scanType, setScanType] = useState('in'); // 'in' or 'out'
  const [lastScannedUser, setLastScannedUser] = useState(null);
  const [offlineStorage, setOfflineStorage] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [initializing, setInitializing] = useState(false);
  const scannerRef = useRef(null);
  const html5QrCode = useRef(null);

  // Fetch available cameras
  const fetchCameras = async () => {
    try {
      showNotification("Requesting camera permission...", "info");
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length) {
        setCameras(devices);
        setSelectedCamera(devices[0].id);
        setError(null);
        showNotification("Camera permission granted.", "success");
      } else {
        setError("No cameras found. Please ensure your device has a camera and it's not being used by another application.");
        showNotification("No cameras found on your device.", "error");
      }
    } catch (err) {
      console.error("Error getting cameras:", err);
      setError(`Camera permission error: ${err.message || "Please allow camera access."}`);
      showNotification("Camera permission denied. Please allow camera access in your browser settings.", "error");
    }
  };

  // Initialize scanner on first mount to request camera permissions
  useEffect(() => {
    fetchCameras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start/stop scanning based on isScanning state
  useEffect(() => {
    // Initialize scanner and start scanning
    const startScanner = async () => {
      if (!selectedCamera) {
        showNotification("No camera selected. Please select a camera.", "error");
        setIsScanning(false);
        return;
      }

      setInitializing(true);
      try {
        // Initialize scanner
        if (!html5QrCode.current) {
          html5QrCode.current = new Html5Qrcode("qr-reader");
        }

        // Start scanning
        await html5QrCode.current.start(
          selectedCamera,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          async (decodedText, decodedResult) => {
            console.log(`QR Code scanned: ${decodedText}`, decodedResult);
            
            try {
              // Expected format: iacuzzo:user:[userId]:[timestamp]
              const parts = decodedText.split(':');
              
              if (parts.length < 3 || parts[0] !== 'iacuzzo' || parts[1] !== 'user') {
                throw new Error("Invalid QR code format");
              }
              
              const userId = parts[2];
              
              // Pause scanning to prevent multiple scans
              await html5QrCode.current.pause();
              
              // Process the scan based on scan type (in/out)
              await processTimekeepingScan(userId, scanType);
              
              // Show success state
              setScanResult({
                userId,
                timestamp: new Date().toISOString(),
                success: true,
                type: scanType
              });
              
            } catch (err) {
              console.error("Error processing scan:", err);
              setError(err.message || "Error processing scan");
              showNotification(err.message || "Error processing scan", "error");
            }
          },
          (errorMessage) => {
            // This is for QR detection errors, which we can ignore
            // console.log(`QR Code scanning error: ${errorMessage}`);
          }
        );
        
        setError(null);
        setInitializing(false);
        showNotification("Scanner started successfully.", "success");
      } catch (err) {
        console.error("Error starting scanner:", err);
        setError(`Failed to start scanner: ${err.message}`);
        showNotification(`Scanner error: ${err.message}. Try refreshing the page.`, "error");
        setIsScanning(false);
        setInitializing(false);
      }
    };

    // Stop scanning and clean up scanner
    const stopScanner = async () => {
      if (html5QrCode.current) {
        try {
          if (html5QrCode.current.isScanning) {
            await html5QrCode.current.stop();
            console.log("Scanner stopped successfully");
          }
        } catch (err) {
          console.error("Error stopping scanner:", err);
        }
      }
    };

    if (isScanning) {
      startScanner();
    } else {
      stopScanner();
    }

    // Cleanup function
    return () => {
      stopScanner();
    };
  }, [isScanning, selectedCamera, scanType]);

  // Handle online/offline status
  useEffect(() => {
    const handleOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      
      // If coming back online and we have offline records, sync them
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
      // If offline, store the scan for later
      if (!navigator.onLine) {
        const record = {
          type: type === 'in' ? 'clockIn' : 'clockOut',
          userId,
          timestamp: new Date().toISOString(),
          scanInfo: {
            deviceId,
            isAdmin,
            deviceType: 'web-scanner'
          }
        };
        
        // Add to offline storage
        const updatedStorage = [...offlineStorage, record];
        setOfflineStorage(updatedStorage);
        
        // Save to localStorage
        localStorage.setItem('timekeeping_offline_records', JSON.stringify(updatedStorage));
        
        setLastScannedUser({
          userId,
          timestamp: new Date().toISOString(),
          offlineMode: true,
          type
        });
        
        showNotification(`${type === 'in' ? 'Clock-in' : 'Clock-out'} saved offline. Will sync when connection is restored.`, "warning");
        return;
      }
      
      // Process based on scan type
      if (type === 'in') {
        const result = await timekeepingService.clockIn(userId, {
          deviceId,
          isAdmin,
          deviceType: 'web-scanner'
        });
        
        setLastScannedUser({
          userId,
          userName: result.userName,
          timestamp: new Date().toISOString(),
          type: 'in',
          result
        });
        
        showNotification(`${result.userName || userId} clocked in successfully at ${result.clockInTime}`, "success");
      } else {
        const result = await timekeepingService.clockOut(userId, {
          deviceId,
          isAdmin,
          deviceType: 'web-scanner'
        });
        
        setLastScannedUser({
          userId,
          userName: result.userName,
          timestamp: new Date().toISOString(),
          type: 'out',
          result
        });
        
        showNotification(
          `${result.userName || userId} clocked out successfully. Hours worked: ${result.totalHours} (${result.standardHours} standard + ${result.overtimeHours} overtime)`, 
          "success"
        );
      }
    } catch (err) {
      console.error("Error processing timekeeping scan:", err);
      throw err;
    }
  };

  // Sync offline records when connection is restored
  const syncOfflineRecords = async () => {
    if (offlineStorage.length === 0) return;
    
    showNotification(`Syncing ${offlineStorage.length} offline records...`, "info");
    
    try {
      const results = await timekeepingService.syncOfflineRecords(offlineStorage);
      
      // Clear offline storage after successful sync
      setOfflineStorage([]);
      localStorage.removeItem('timekeeping_offline_records');
      
      showNotification(`Synced ${results.success} of ${results.total} records successfully`, 
        results.failed > 0 ? "warning" : "success");
    } catch (err) {
      console.error("Error syncing offline records:", err);
      showNotification("Error syncing some offline records. Please try again later.", "error");
    }
  };

  // Show a notification message
  const showNotification = (message, type) => {
    setNotification({
      show: true,
      message,
      type
    });
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 5000);
  };

  // Resume scanning
  const resumeScanning = async () => {
    setScanResult(null);
    setError(null);
    
    if (html5QrCode.current && html5QrCode.current.isScanning) {
      try {
        await html5QrCode.current.resume();
      } catch (error) {
        console.error("Error resuming scanner:", error);
        // If resume fails, restart the scanner
        setIsScanning(false);
        setTimeout(() => setIsScanning(true), 300);
      }
    } else {
      // If scanner isn't running, restart
      setIsScanning(false);
      setTimeout(() => setIsScanning(true), 300);
    }
  };

  // Toggle scanning on/off
  const toggleScanning = () => {
    if (initializing) return; // Prevent toggling while initializing
    setIsScanning(!isScanning);
    setScanResult(null);
    setError(null);
  };

  // Change scan type (in/out)
  const handleScanTypeChange = (type) => {
    setScanType(type);
    setScanResult(null);
    setError(null);
  };

  // Handle camera selection change
  const handleCameraChange = (e) => {
    const cameraId = e.target.value;
    setSelectedCamera(cameraId);
    
    // If already scanning, restart with new camera
    if (isScanning) {
      setIsScanning(false);
      setTimeout(() => setIsScanning(true), 300);
    }
  };

  // Retry camera detection
  const handleRetryCamera = () => {
    fetchCameras();
  };

  return (
    <div className="timekeeping-scanner">
      <div className="scanner-header">
        <h2>Scanner Timbrature</h2>
        <div className="scanner-status">
          {!isOnline && (
            <div className="offline-badge">
              OFFLINE MODE
            </div>
          )}
          {offlineStorage.length > 0 && (
            <div className="pending-badge">
              {offlineStorage.length} pending
            </div>
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
          <label htmlFor="camera-select">Select Camera:</label>
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
          {initializing ? 'Starting Scanner...' : isScanning ? 'Stop Scanner' : 'Start Scanner'}
        </button>
        
        {cameras.length === 0 && (
          <button 
            className="retry-btn" 
            onClick={handleRetryCamera}
            disabled={initializing}
          >
            Retry Camera Detection
          </button>
        )}
      </div>
      
      <div className="scanner-container" ref={scannerRef}>
        <div id="qr-reader" className="qr-reader"></div>
        
        {scanResult && (
          <div className="scan-result success">
            <h4>User {scanType === 'in' ? 'Clocked In' : 'Clocked Out'} Successfully!</h4>
            {lastScannedUser && (
              <div className="user-scan-info">
                <p><strong>User:</strong> {lastScannedUser.userName || lastScannedUser.userId}</p>
                <p><strong>Time:</strong> {new Date(lastScannedUser.timestamp).toLocaleTimeString()}</p>
                {lastScannedUser.offlineMode && (
                  <p className="offline-note">Saved offline. Will sync when connection is restored.</p>
                )}
                {lastScannedUser.result && lastScannedUser.type === 'out' && (
                  <p><strong>Hours:</strong> {lastScannedUser.result.totalHours} ({lastScannedUser.result.standardHours} standard + {lastScannedUser.result.overtimeHours} overtime)</p>
                )}
              </div>
            )}
            <button className="continue-btn" onClick={resumeScanning}>
              Continue Scanning
            </button>
          </div>
        )}
        
        {error && !initializing && (
          <div className="scan-result error">
            <h4>Error</h4>
            <p className="error-text">{error}</p>
            <button className="continue-btn" onClick={resumeScanning}>
              Try Again
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
          <p>Click "Start Scanner" to begin scanning QR codes</p>
        </div>
      )}

      {cameras.length === 0 && !initializing && (
        <div className="camera-issue">
          <h3>Camera Access Required</h3>
          <p>We couldn't detect any cameras on your device. Please check:</p>
          <ul>
            <li>Your device has a working camera</li>
            <li>You've granted camera permission to this website</li>
            <li>No other application is currently using your camera</li>
          </ul>
          <p>Check your browser's address bar for a camera icon to manage permissions.</p>
        </div>
      )}
      
      {offlineStorage.length > 0 && isOnline && (
        <div className="offline-sync-section">
          <h4>Offline Records</h4>
          <p>You have {offlineStorage.length} records saved offline that need to be synced.</p>
          <button className="sync-btn" onClick={syncOfflineRecords}>
            Sync Now
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
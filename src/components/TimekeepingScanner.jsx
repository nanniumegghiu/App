// src/components/TimekeepingScanner.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
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
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [scanType, setScanType] = useState('in'); // 'in' or 'out'
  const [lastScannedUser, setLastScannedUser] = useState(null);
  const [offlineStorage, setOfflineStorage] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const scannerRef = useRef(null);
  const scannerInstanceRef = useRef(null);

  // Initialize QR code scanner
  useEffect(() => {
    if (!isScanning) return;

    // Configuration for the scanner
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      rememberLastUsedCamera: true,
      aspectRatio: 1.0,
      formatsToSupport: [Html5QrcodeScanner.FORMATS.QR_CODE],
    };

    try {
      // Create a new instance of the scanner
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        config,
        /* verbose= */ false
      );

      // Callback for successful scan
      const onScanSuccess = async (decodedText, decodedResult) => {
        console.log(`QR Code scanned: ${decodedText}`, decodedResult);
        
        // Pause scanning to prevent multiple scans
        if (scannerInstanceRef.current) {
          scannerInstanceRef.current.pause();
        }

        // Process the QR code data
        try {
          // Expected format: iacuzzo:user:[userId]:[timestamp]
          const parts = decodedText.split(':');
          
          if (parts.length < 3 || parts[0] !== 'iacuzzo' || parts[1] !== 'user') {
            throw new Error("Invalid QR code format");
          }
          
          const userId = parts[2];
          
          // Process the scan based on scan type (in/out)
          await processTimekeepingScan(userId, scanType);
          
          // Show notification
          setScanResult({
            userId,
            timestamp: new Date().toISOString(),
            success: true,
            type: scanType
          });
        } catch (err) {
          console.error("Error processing scan:", err);
          setError(err.message || "Error processing scan");
          
          // Show notification
          showNotification(err.message || "Error processing scan", "error");
        }
      };

      // Callback for scan error
      const onScanError = (errorMessage) => {
        // We don't need to show errors for normal scanning issues
        console.log(`Scan error: ${errorMessage}`);
      };

      // Render the scanner
      scanner.render(onScanSuccess, onScanError);
      
      // Store the scanner instance for later use
      scannerInstanceRef.current = scanner.getState() ? scanner : null;
    } catch (err) {
      console.error("Error initializing scanner:", err);
      setError("Could not initialize camera. Please check permissions.");
    }

    // Cleanup function
    return () => {
      if (scannerInstanceRef.current) {
        scannerInstanceRef.current.pause();
      }
      // Clear the HTML
      const scannerElement = document.getElementById("qr-reader");
      if (scannerElement) {
        scannerElement.innerHTML = '';
      }
    };
  }, [isScanning, scanType]);

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
  const resumeScanning = () => {
    setScanResult(null);
    setError(null);
    
    if (scannerInstanceRef.current) {
      scannerInstanceRef.current.resume();
    }
  };

  // Toggle scanning on/off
  const toggleScanning = () => {
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

  return (
    <div className="timekeeping-scanner">
      <div className="scanner-header">
        <h2>QR Code Time Clock</h2>
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
          Clock In
        </button>
        <button
          className={`scan-type-btn ${scanType === 'out' ? 'active' : ''}`}
          onClick={() => handleScanTypeChange('out')}
        >
          Clock Out
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
      
      <div className="scanner-toggle">
        <button 
          className={`toggle-btn ${isScanning ? 'active' : ''}`} 
          onClick={toggleScanning}
        >
          {isScanning ? 'Stop Scanner' : 'Start Scanner'}
        </button>
      </div>
      
      {isScanning && (
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
          
          {error && (
            <div className="scan-result error">
              <h4>Error</h4>
              <p className="error-text">{error}</p>
              <button className="continue-btn" onClick={resumeScanning}>
                Try Again
              </button>
            </div>
          )}
        </div>
      )}
      
      {!isScanning && (
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
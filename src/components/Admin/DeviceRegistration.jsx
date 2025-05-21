// src/components/Admin/DeviceRegistration.jsx
import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import timekeepingService from '../../services/timekeepingService';
import Notification from '../Notification';
import './deviceRegistration.css';

/**
 * Component for administrators to register and manage QR scanning devices
 */
const DeviceRegistration = () => {
  const [devices, setDevices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [formData, setFormData] = useState({
    deviceName: '',
    deviceId: '',
    deviceType: 'tablet',
    location: ''
  });

  // Load existing devices
  useEffect(() => {
    const loadDevices = async () => {
      setIsLoading(true);
      try {
        const devicesRef = collection(db, "scanDevices");
        const querySnapshot = await getDocs(devicesRef);
        
        const devicesList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setDevices(devicesList);
        setError(null);
      } catch (err) {
        console.error("Error loading devices:", err);
        setError("Could not load registered devices. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    
    loadDevices();
  }, []);

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.deviceName || !formData.deviceId) {
      showNotification("Device name and ID are required", "error");
      return;
    }
    
    try {
      // Prepare device info
      const deviceInfo = {
        deviceType: formData.deviceType,
        location: formData.location,
        browser: navigator.userAgent,
        registeredFrom: window.location.hostname
      };
      
      // Register the device
      const result = await timekeepingService.registerTimekeepingDevice(
        formData.deviceId,
        formData.deviceName,
        deviceInfo
      );
      
      // Show success message
      showNotification(result.message, "success");
      
      // Reset form and reload devices
      setFormData({
        deviceName: '',
        deviceId: '',
        deviceType: 'tablet',
        location: ''
      });
      
      setShowForm(false);
      
      // Reload the devices list
      const devicesRef = collection(db, "scanDevices");
      const querySnapshot = await getDocs(devicesRef);
      
      const devicesList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setDevices(devicesList);
    } catch (err) {
      console.error("Error registering device:", err);
      showNotification(err.message || "Error registering device", "error");
    }
  };

  // Toggle device active status
  const toggleDeviceStatus = async (deviceId, currentStatus) => {
    try {
      const deviceRef = doc(db, "scanDevices", deviceId);
      await updateDoc(deviceRef, {
        active: !currentStatus,
        lastUpdated: new Date()
      });
      
      // Update local state
      setDevices(prevDevices => 
        prevDevices.map(device => 
          device.id === deviceId 
            ? { ...device, active: !currentStatus } 
            : device
        )
      );
      
      showNotification(
        `Device ${!currentStatus ? 'activated' : 'deactivated'} successfully`, 
        "success"
      );
    } catch (err) {
      console.error("Error toggling device status:", err);
      showNotification("Error updating device status", "error");
    }
  };

  // Delete a device
  const deleteDevice = async (deviceId) => {
    if (!confirm("Are you sure you want to delete this device? This action cannot be undone.")) {
      return;
    }
    
    try {
      const deviceRef = doc(db, "scanDevices", deviceId);
      await deleteDoc(deviceRef);
      
      // Update local state
      setDevices(prevDevices => prevDevices.filter(device => device.id !== deviceId));
      
      showNotification("Device deleted successfully", "success");
    } catch (err) {
      console.error("Error deleting device:", err);
      showNotification("Error deleting device", "error");
    }
  };

  // Show notification
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

  // Generate a random device ID
  const generateRandomId = () => {
    const randomString = Math.random().toString(36).substring(2, 10);
    setFormData(prev => ({ ...prev, deviceId: `device_${randomString}` }));
  };

  // Format date
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Never';
    
    let date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
    }
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="device-registration">
      <div className="section-header">
        <h3>Scanning Device Management</h3>
        <button 
          className="btn btn-primary add-device-btn" 
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : 'Add New Device'}
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
      
      {showForm && (
        <div className="device-form-container">
          <form className="device-form" onSubmit={handleSubmit}>
            <h4>Register Scanning Device</h4>
            
            <div className="form-group">
              <label htmlFor="deviceName">Device Name *</label>
              <input
                type="text"
                id="deviceName"
                name="deviceName"
                value={formData.deviceName}
                onChange={handleInputChange}
                placeholder="e.g. Warehouse Tablet"
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="deviceId">Device ID *</label>
              <div className="input-with-button">
                <input
                  type="text"
                  id="deviceId"
                  name="deviceId"
                  value={formData.deviceId}
                  onChange={handleInputChange}
                  placeholder="e.g. tablet_reception"
                  required
                />
                <button 
                  type="button" 
                  className="generate-btn"
                  onClick={generateRandomId}
                >
                  Generate
                </button>
              </div>
              <small>A unique identifier for this device. Case-sensitive.</small>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="deviceType">Device Type</label>
                <select
                  id="deviceType"
                  name="deviceType"
                  value={formData.deviceType}
                  onChange={handleInputChange}
                >
                  <option value="tablet">Tablet</option>
                  <option value="kiosk">Kiosk</option>
                  <option value="smartphone">Smartphone</option>
                  <option value="desktop">Desktop Computer</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div className="form-group">
                <label htmlFor="location">Location</label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  placeholder="e.g. Main Entrance"
                />
              </div>
            </div>
            
            <div className="form-actions">
              <button type="submit" className="btn btn-success">
                Register Device
              </button>
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      
      {isLoading ? (
        <div className="loading-message">Loading registered devices...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : (
        <div className="devices-container">
          {devices.length === 0 ? (
            <div className="no-devices">
              <p>No scanning devices registered yet.</p>
              <p>Register a device to enable QR code timekeeping.</p>
            </div>
          ) : (
            <div className="devices-grid">
              {devices.map(device => (
                <div key={device.id} className={`device-card ${device.active ? 'active' : 'inactive'}`}>
                  <div className="device-header">
                    <h4>{device.deviceName}</h4>
                    <span className={`status-indicator ${device.active ? 'active' : 'inactive'}`}>
                      {device.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  
                  <div className="device-details">
                    <div className="detail-row">
                      <span className="detail-label">ID:</span>
                      <span className="detail-value">{device.id}</span>
                    </div>
                    
                    <div className="detail-row">
                      <span className="detail-label">Type:</span>
                      <span className="detail-value">
                        {device.deviceInfo?.deviceType || 'Unknown'}
                      </span>
                    </div>
                    
                    <div className="detail-row">
                      <span className="detail-label">Location:</span>
                      <span className="detail-value">
                        {device.deviceInfo?.location || 'Not specified'}
                      </span>
                    </div>
                    
                    <div className="detail-row">
                      <span className="detail-label">Last Activity:</span>
                      <span className="detail-value">
                        {formatDate(device.lastActivity)}
                      </span>
                    </div>
                    
                    <div className="detail-row">
                      <span className="detail-label">Registered:</span>
                      <span className="detail-value">
                        {formatDate(device.createdAt)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="device-actions">
                    <button 
                      className={`btn ${device.active ? 'btn-danger' : 'btn-success'} btn-sm`}
                      onClick={() => toggleDeviceStatus(device.id, device.active)}
                    >
                      {device.active ? 'Deactivate' : 'Activate'}
                    </button>
                    
                    <button 
                      className="btn btn-danger btn-sm"
                      onClick={() => deleteDevice(device.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="device-info-panel">
            <h4>About Scanning Devices</h4>
            <p>Scanning devices are tablets, kiosks, or other devices authorized to scan employee QR codes for time tracking.</p>
            <p>Only registered devices can process clock-in and clock-out operations.</p>
            <p>Each device needs a unique ID that will be used to identify it in the system.</p>
            <p>You can deactivate devices at any time to prevent them from processing QR scans.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceRegistration;
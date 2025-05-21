// src/components/UserDashboard.jsx - Simplified version without user info card
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import UserQRCode from './UserQRCode';
import TimekeepingStatus from './TimekeepingStatus';
import timekeepingService from '../services/timekeepingService';
import './userQRCode.css';
import './dashboard.css';

/**
 * Enhanced user dashboard component with timekeeping status
 * Simplified version without user info card as requested
 */
const UserDashboard = () => {
  const [userData, setUserData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch basic user information on load
  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoading(true);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("User not authenticated");
        }

        // Get user data from Firestore
        const userDocRef = doc(db, "users", currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          setUserData({
            id: currentUser.uid,
            email: currentUser.email,
            ...userDoc.data()
          });
        } else {
          // Create minimal user object if document doesn't exist
          setUserData({
            id: currentUser.uid,
            email: currentUser.email
          });
          console.warn("User document not found in Firestore");
        }
        
        setError(null);
        
        // Auto-close any open sessions from previous days - wrapped in try/catch
        try {
          await timekeepingService.autoCloseOpenSessions(currentUser.uid);
        } catch (sessionError) {
          console.error("Error in automatic closing of sessions:", sessionError);
          // Don't block interface if this operation fails
        }
      } catch (err) {
        console.error("Error fetching user data:", err);
        setError("Could not load data. Please try again later.");
        
        // Set minimal user data if available
        if (auth.currentUser) {
          setUserData({
            id: auth.currentUser.uid,
            email: auth.currentUser.email
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);
  
  // Format current date
  const getCurrentDate = () => {
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return new Date().toLocaleDateString('it-IT', options);
  };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="loading-container">
          <div className="loading">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  // If there's an error but userData is available, show some dashboard elements
  if (error && userData) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h2>Dashboard</h2>
          <p className="current-date">{getCurrentDate()}</p>
        </div>
        
        <div className="error-message" style={{ marginBottom: '20px' }}>
          {error}
        </div>

        <div className="dashboard-content">
          <div className="dashboard-main">
            {/* Always show QR code regardless of other errors */}
            <div className="dashboard-card qrcode-card">
              <UserQRCode />
              <div className="qrcode-instructions">
                <h4>How to use your QR code:</h4>
                <ol>
                  <li>Show this QR code to the scanning device at the beginning of your shift to clock in.</li>
                  <li>At the end of your shift, show the QR code again to clock out.</li>
                  <li>Hours will be calculated automatically, including any overtime beyond 8 hours.</li>
                  <li>If you forget to clock out, the system will automatically close your day with 8 standard hours.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If there's an error and userData is not available, show only error message
  if (error && !userData) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h2>Dashboard</h2>
          <p className="current-date">{getCurrentDate()}</p>
        </div>
        
        <div className="error-message">
          {error}
          <p>Reload the page to try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <p className="current-date">{getCurrentDate()}</p>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-main">
          {/* Timekeeping Status Card */}
          <TimekeepingStatus />
          
          {/* QR Code as main element */}
          <div className="dashboard-card qrcode-card">
            <UserQRCode />
            <div className="qrcode-instructions">
              <h4>How to use your QR code:</h4>
              <ol>
                <li>Show this QR code to the scanning device at the beginning of your shift to clock in.</li>
                <li>At the end of your shift, show the QR code again to clock out.</li>
                <li>Hours will be calculated automatically, including any overtime beyond 8 hours.</li>
                <li>If you forget to clock out, the system will automatically close your day with 8 standard hours.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;
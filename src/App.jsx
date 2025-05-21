// Updated App.jsx with modified Dashboard and Hours Management sections
import React, { useState, useRef, useEffect } from 'react';
import Header from './components/Header';
import UserInfo from './components/UserInfo';
import TimesheetTable from './components/TimesheetTable';
import ReportsTable from './components/ReportsTable';
import UserRequests from './components/UserRequests';
import UserNavigation from './components/UserNavigation';
import UserDashboard from './components/UserDashboard';
import ReportForm from './components/ReportForm';
import Notification from './components/Notification';
import Login from './components/Login';
import AdminPanel from './components/Admin/AdminPanel';
import OfflineManager from './components/OfflineManager';
import { auth, db, getUserReportsByMonth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import './index.css';
import './request.css';
import './admin-requests.css';
import './user-navigation.css';
import './components/userQRCode.css';
import './components/dashboard.css';
import './components/timekeepingScanner.css';

  // Function to determine the default month and year to show
  const getDefaultMonthAndYear = () => {
    const currentDate = new Date();
    const currentDay = currentDate.getDate();
    const currentMonth = currentDate.getMonth() + 1; // getMonth returns 0-11
    const currentYear = currentDate.getFullYear();
  
    // If we're in the first 5 days of the month, show previous month
    if (currentDay <= 5) {
      // Calculate previous month (handling January case)
      let previousMonth = currentMonth - 1;
      let previousYear = currentYear;
      
      if (previousMonth === 0) {
        previousMonth = 12;
        previousYear = currentYear - 1;
      }
      
      return {
        month: previousMonth.toString(),
        year: previousYear.toString()
      };
    }
    
    // Otherwise show current month
    return {
      month: currentMonth.toString(),
      year: currentYear.toString()
    };
  };

function App() {
  const defaultSelection = getDefaultMonthAndYear();
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isAdminView, setIsAdminView] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  // App states (visible only when logged in)
  const [selectedMonth, setSelectedMonth] = useState(defaultSelection.month);
  const [selectedYear, setSelectedYear] = useState(defaultSelection.year);
  const [reports, setReports] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isReportFormVisible, setIsReportFormVisible] = useState(false);
  const [formPosition, setFormPosition] = useState(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationType, setNotificationType] = useState("success");
  const [highlightedRow, setHighlightedRow] = useState(null);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const tableRowsRef = useRef({});

  // Check if user is logged in on startup and get role
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("App: Authentication state changed:", currentUser?.uid);
      setUser(currentUser);
      
      if (currentUser) {
        try {
          // Get user role from database
          const userDocRef = doc(db, "users", currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserRole(userData.role || 'user');
            
            // Set admin view automatically if user is admin
            if (userData.role === 'admin') {
              setIsAdminView(true);
            }
          }
        } catch (error) {
          console.error("App: Error getting user data:", error);
        }
      } else {
        setUserRole(null);
        setIsAdminView(false);
      }
    });
    
    return () => unsubscribe();
  }, []);

  // Load user reports from database
  useEffect(() => {
    const loadUserReports = async () => {
      if (!user || isAdminView) return;
      
      // Only load reports in the hours tab
      if (activeTab !== 'hours') return;
      
      setIsLoadingReports(true);
      try {
        console.log(`App: Loading reports for userId=${user.uid}, month=${selectedMonth}, year=${selectedYear}`);
        
        // Normalize month (remove any prefixes and leading zeros)
        let normalizedMonth = selectedMonth.toString().replace(/^prev-/, '').replace(/^0+/, '');
        
        // If month is empty after normalization, use the original value
        if (!normalizedMonth) normalizedMonth = selectedMonth;
        
        // Format with leading zero for consistency
        const formattedMonth = normalizedMonth.length === 1 ? normalizedMonth.padStart(2, '0') : normalizedMonth;
        
        console.log(`App: Normalized month=${normalizedMonth}, formattedMonth=${formattedMonth}`);
        
        const userReports = await getUserReportsByMonth(user.uid, formattedMonth, selectedYear);
        console.log("App: Reports loaded:", userReports);
        setReports(userReports || []);
      } catch (error) {
        console.error("App: Error loading reports:", error);
        setNotificationMessage("An error occurred while loading reports");
        setNotificationType("error");
        setShowNotification(true);
        setReports([]);
      } finally {
        setIsLoadingReports(false);
      }
    };

    if (user && !isAdminView) {
      loadUserReports();
    }
  }, [user, selectedMonth, selectedYear, isAdminView, activeTab]);

  const handleReportError = (date) => {
    console.log(`App: Error report request for date ${date}`);
    setSelectedDate(date);
    setIsReportFormVisible(true);
    setHighlightedRow(date);
    const rowElement = tableRowsRef.current[date];
    if (rowElement) {
      const rect = rowElement.getBoundingClientRect();
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      setFormPosition({
        left: rowElement.offsetLeft,
        top: rect.bottom + scrollTop,
        width: rowElement.offsetWidth
      });
    }
  };

  const handleCloseReportForm = () => {
    console.log("App: Closing report form");
    setIsReportFormVisible(false);
    setHighlightedRow(null);
  };

  const handleSubmitReport = async (date, message) => {
    console.log(`App: Report submitted for date ${date} with message: ${message}`);
    
    try {
      // The report is handled internally by the ReportForm component
      // which saves the report to the database
      
      // Close the form
      setIsReportFormVisible(false);
      setHighlightedRow(null);
      
      // Show success notification
      setNotificationMessage("Your report has been sent successfully!");
      setNotificationType("success");
      setShowNotification(true);
      
      // Reload user reports after a short delay
      // to give the database time to update
      setTimeout(async () => {
        try {
          console.log("App: Reloading reports after submission...");
          
          // Normalize the month
          let normalizedMonth = selectedMonth.toString().replace(/^prev-/, '').replace(/^0+/, '');
          if (!normalizedMonth) normalizedMonth = selectedMonth;
          
          // Format with leading zero for consistency
          const formattedMonth = normalizedMonth.length === 1 ? normalizedMonth.padStart(2, '0') : normalizedMonth;
          
          const updatedReports = await getUserReportsByMonth(user.uid, formattedMonth, selectedYear);
          console.log("App: Reports reloaded:", updatedReports);
          setReports(updatedReports || []);
        } catch (error) {
          console.error("App: Error reloading reports:", error);
        }
      }, 1000);
    } catch (error) {
      console.error("App: Error handling report:", error);
      setNotificationMessage("An error occurred. Please try again later.");
      setNotificationType("error");
      setShowNotification(true);
    }
  };

  // Function to toggle between user and admin view
  const toggleAdminView = () => {
    console.log("App: View change", isAdminView ? "admin -> user" : "user -> admin");
    setIsAdminView(!isAdminView);
  };

  // Function to change tab in user dashboard
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  if (!user) {
    // Show login if not authenticated
    return <Login onLogin={(user) => setUser(user)} />;
  }

  return (
    <div className="App">
      <Header 
        userRole={userRole} 
        isAdminView={isAdminView} 
        onToggleView={userRole === 'admin' ? toggleAdminView : null} 
      />

      {isAdminView && userRole === 'admin' ? (
        // Show admin panel
        <AdminPanel />
      ) : (
        // Show user view
        <div className="container">
          <Notification
            message={notificationMessage}
            isVisible={showNotification}
            onClose={() => setShowNotification(false)}
            type={notificationType}
          />
          
          {/* Navigation bar for user dashboard */}
          <UserNavigation 
            activeTab={activeTab} 
            onTabChange={handleTabChange} 
          />

          {activeTab === 'dashboard' ? (
            // Dashboard tab content - SIMPLIFIED VERSION
            <UserDashboard />
          ) : activeTab === 'hours' ? (
            // Hours Management tab content - WITH MONTHLY STATS ADDED
            <>
              <UserInfo
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                selectedYear={selectedYear}
                setSelectedYear={setSelectedYear}
              />

              <TimesheetTable
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                onReportError={handleReportError}
                highlightedRow={highlightedRow}
                rowRef={(date, el) => (tableRowsRef.current[date] = el)}
              />

              <ReportsTable 
                reports={reports} 
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                isLoading={isLoadingReports}
              />
            </>
          ) : (
            // Leave/Time Off Requests tab content
            <UserRequests />
          )}
        </div>
      )}

      <ReportForm
        isVisible={isReportFormVisible}
        selectedDate={selectedDate}
        position={formPosition}
        onSubmit={handleSubmitReport}
        onClose={handleCloseReportForm}
      />
      
      {/* Add the OfflineManager component for app-wide offline support */}
      <OfflineManager />
    </div>
  );
}

export default App;
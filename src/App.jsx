// Updated App.jsx with OfflineManager
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

function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isAdminView, setIsAdminView] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Stati applicazione (visibili solo se loggato)
  const [selectedMonth, setSelectedMonth] = useState('4');
  const [selectedYear, setSelectedYear] = useState('2025');
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

  // Verifica se l'utente è loggato all'avvio e ottieni il ruolo
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("App: Stato autenticazione cambiato:", currentUser?.uid);
      setUser(currentUser);
      
      if (currentUser) {
        try {
          // Ottieni il ruolo dell'utente dal database
          const userDocRef = doc(db, "users", currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserRole(userData.role || 'user');
            
            // Imposta la vista admin automaticamente se l'utente è un admin
            if (userData.role === 'admin') {
              setIsAdminView(true);
            }
          }
        } catch (error) {
          console.error("App: Errore nel recupero dei dati utente:", error);
        }
      } else {
        setUserRole(null);
        setIsAdminView(false);
      }
    });
    
    return () => unsubscribe();
  }, []);

  // Carica le segnalazioni dell'utente dal database
  useEffect(() => {
    const loadUserReports = async () => {
      if (!user || isAdminView) return;
      
      // Carica le segnalazioni solo nella tab delle ore
      if (activeTab !== 'hours') return;
      
      setIsLoadingReports(true);
      try {
        console.log(`App: Caricamento segnalazioni per userId=${user.uid}, month=${selectedMonth}, year=${selectedYear}`);
        
        // Normalizza il mese (rimuovi eventuali prefissi e zeri iniziali)
        let normalizedMonth = selectedMonth.toString().replace(/^prev-/, '').replace(/^0+/, '');
        
        // Se il mese è vuoto dopo la normalizzazione, usa il valore originale
        if (!normalizedMonth) normalizedMonth = selectedMonth;
        
        // Formato con zero iniziale per la consistenza
        const formattedMonth = normalizedMonth.length === 1 ? normalizedMonth.padStart(2, '0') : normalizedMonth;
        
        console.log(`App: Mese normalizzato=${normalizedMonth}, formattedMonth=${formattedMonth}`);
        
        const userReports = await getUserReportsByMonth(user.uid, formattedMonth, selectedYear);
        console.log("App: Segnalazioni caricate:", userReports);
        setReports(userReports || []);
      } catch (error) {
        console.error("App: Errore nel caricamento delle segnalazioni:", error);
        setNotificationMessage("Si è verificato un errore nel caricamento delle segnalazioni");
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
    console.log(`App: Richiesta segnalazione errore per data ${date}`);
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
    console.log("App: Chiusura form segnalazione");
    setIsReportFormVisible(false);
    setHighlightedRow(null);
  };

  const handleSubmitReport = async (date, message) => {
    console.log(`App: Segnalazione inviata per data ${date} con messaggio: ${message}`);
    
    try {
      // La segnalazione viene gestita internamente dal componente ReportForm
      // che si occupa di salvare la segnalazione nel database
      
      // Chiudi il form
      setIsReportFormVisible(false);
      setHighlightedRow(null);
      
      // Mostra notifica di successo
      setNotificationMessage("La tua segnalazione è stata inviata con successo!");
      setNotificationType("success");
      setShowNotification(true);
      
      // Ricarica le segnalazioni dell'utente dopo un breve ritardo
      // per dare tempo al database di aggiornarsi
      setTimeout(async () => {
        try {
          console.log("App: Ricaricamento segnalazioni dopo invio...");
          
          // Normalizza il mese
          let normalizedMonth = selectedMonth.toString().replace(/^prev-/, '').replace(/^0+/, '');
          if (!normalizedMonth) normalizedMonth = selectedMonth;
          
          // Formato con zero iniziale per la consistenza
          const formattedMonth = normalizedMonth.length === 1 ? normalizedMonth.padStart(2, '0') : normalizedMonth;
          
          const updatedReports = await getUserReportsByMonth(user.uid, formattedMonth, selectedYear);
          console.log("App: Segnalazioni ricaricate:", updatedReports);
          setReports(updatedReports || []);
        } catch (error) {
          console.error("App: Errore nel ricaricamento delle segnalazioni:", error);
        }
      }, 1000);
    } catch (error) {
      console.error("App: Errore nella gestione della segnalazione:", error);
      setNotificationMessage("Si è verificato un errore. Riprova più tardi.");
      setNotificationType("error");
      setShowNotification(true);
    }
  };

  // Funzione per cambiare tra vista utente e admin
  const toggleAdminView = () => {
    console.log("App: Cambio vista", isAdminView ? "admin -> utente" : "utente -> admin");
    setIsAdminView(!isAdminView);
  };

  // Funzione per cambiare tab nella dashboard utente
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  if (!user) {
    // Mostra il login se non autenticato
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
        // Mostra il pannello admin
        <AdminPanel />
      ) : (
        // Mostra la vista utente
        <div className="container">
          <Notification
            message={notificationMessage}
            isVisible={showNotification}
            onClose={() => setShowNotification(false)}
            type={notificationType}
          />
          
          {/* Barra di navigazione per la dashboard utente */}
          <UserNavigation 
            activeTab={activeTab} 
            onTabChange={handleTabChange} 
          />

          {activeTab === 'dashboard' ? (
            // Contenuto del tab "Dashboard" - NUOVO
            <UserDashboard />
          ) : activeTab === 'hours' ? (
            // Contenuto del tab "Gestione Ore"
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
            // Contenuto del tab "Richieste Permessi/Ferie"
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
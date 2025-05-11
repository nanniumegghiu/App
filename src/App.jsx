import React, { useState, useRef, useEffect } from 'react';
import Header from './components/Header';
import UserInfo from './components/UserInfo';
import TimesheetTable from './components/TimesheetTable';
import ReportsTable from './components/ReportsTable';
import ReportForm from './components/ReportForm';
import Notification from './components/Notification';
import Login from './components/Login';
import AdminPanel from './components/Admin/AdminPanel';
import { auth, db, getUserReportsByMonth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import './index.css';

function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isAdminView, setIsAdminView] = useState(false);

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
      
      setIsLoadingReports(true);
      try {
        console.log(`App: Caricamento segnalazioni per userId=${user.uid}, month=${selectedMonth}, year=${selectedYear}`);
        
        // Assicurati che il mese abbia il formato corretto (con zero iniziale se necessario)
        const formattedMonth = selectedMonth.length === 1 ? selectedMonth.padStart(2, '0') : selectedMonth;
        
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
  }, [user, selectedMonth, selectedYear, isAdminView]);

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
          const formattedMonth = selectedMonth.length === 1 ? selectedMonth.padStart(2, '0') : selectedMonth;
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
        </div>
      )}

      <ReportForm
        isVisible={isReportFormVisible}
        selectedDate={selectedDate}
        position={formPosition}
        onSubmit={handleSubmitReport}
        onClose={handleCloseReportForm}
      />
    </div>
  );
}

export default App;
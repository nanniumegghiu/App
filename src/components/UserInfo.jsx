// src/components/UserInfo.jsx - Corretto
import React, { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import UserQRCode from './UserQRCode';
import './userQRCode.css';
import './dashboard.css';
import './userInfo.css';

const UserInfo = ({ selectedMonth, setSelectedMonth, selectedYear, setSelectedYear }) => {
  const [availableMonths, setAvailableMonths] = useState([]);
  const [showQRCode, setShowQRCode] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    // Ottieni la data corrente
    const currentDate = new Date();
    const currentDay = currentDate.getDate();
    const currentMonth = currentDate.getMonth() + 1; // getMonth() restituisce 0-11
    const currentYear = currentDate.getFullYear();

    // Calcola il mese precedente
    let previousMonth = currentMonth - 1;
    let previousYear = currentYear;

    // Gestisci il caso di gennaio (in cui il mese precedente è dicembre dell'anno precedente)
    if (previousMonth === 0) {
      previousMonth = 12;
      previousYear = currentYear - 1;
    }

    // LOGICA CORRETTA:
    // - Se siamo nei primi 4 giorni del mese (1-4), mostra il mese precedente come default
    // - Dal giorno 5 in poi, mostra sempre il mese corrente come default
    const defaultMonth = currentDay <= 4 ? previousMonth.toString() : currentMonth.toString();
    const defaultYear = currentDay <= 4 && currentMonth === 1 ? previousYear.toString() : currentYear.toString();

    // Costruisci l'array dei mesi disponibili
    const months = [
      { value: currentMonth.toString(), label: `${getMonthName(currentMonth)} ${currentYear}`, year: currentYear.toString() },
      { value: previousMonth.toString(), label: `${getMonthName(previousMonth)} ${previousYear}`, year: previousYear.toString() }
    ];

    setAvailableMonths(months);

    // Se il mese selezionato non è tra quelli disponibili, imposta il mese di default
    if (!selectedMonth || !selectedYear) {
      setSelectedMonth(defaultMonth);
      setSelectedYear(defaultYear);
    }
  }, [setSelectedMonth, setSelectedYear, selectedMonth, selectedYear]);

  // Carica i dati utente
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const userDocRef = doc(db, "users", currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          setUserData({
            id: currentUser.uid,
            email: currentUser.email,
            ...userDoc.data()
          });
        } else {
          setUserData({
            id: currentUser.uid,
            email: currentUser.email
          });
        }
      } catch (err) {
        console.error("Errore nel recupero dei dati utente:", err);
      }
    };

    fetchUserData();
  }, []);

  // Carica le statistiche mensili basate sugli stessi dati della tabella
  useEffect(() => {
    const fetchMonthlyStats = async () => {
      if (!selectedMonth || !selectedYear || !userData?.id) return;
      
      setIsLoadingStats(true);
      try {
        // Normalizza il mese (rimuovi eventuali prefissi e zeri iniziali)
        let normalizedMonth = selectedMonth.toString().replace(/^prev-/, '').replace(/^0+/, '');
        if (!normalizedMonth) normalizedMonth = selectedMonth;
        
        // Utilizza la stessa funzione che viene usata per caricare i dati nella tabella
        const { getUserWorkHoursByMonth } = await import('../firebase');
        const workHoursData = await getUserWorkHoursByMonth(userData.id, normalizedMonth, selectedYear);
        
        if (workHoursData && workHoursData.entries && workHoursData.entries.length > 0) {
          const entries = workHoursData.entries;
          
          // Calcola i giorni lavorati (escludendo lettere speciali M, P, A)
          const completedDays = entries.filter(entry => 
            entry.total !== "M" && entry.total !== "P" && entry.total !== "A" && 
            (parseFloat(entry.total) > 0 || parseFloat(entry.overtime || 0) > 0)
          ).length;
          
          // Calcola il totale delle ore standard
          const totalStandardHours = entries.reduce((sum, entry) => {
            if (["M", "P", "A"].includes(entry.total)) {
              return sum;
            }
            return sum + (parseFloat(entry.total) || 0);
          }, 0);
          
          // Calcola il totale delle ore di straordinario
          const totalOvertimeHours = entries.reduce((sum, entry) => {
            return sum + (parseFloat(entry.overtime || 0) || 0);
          }, 0);
          
          // Conta i giorni "speciali"
          const malattiaCount = entries.filter(entry => entry.total === "M").length;
          const permessoCount = entries.filter(entry => entry.total === "P").length;
          const assenzaCount = entries.filter(entry => entry.total === "A").length;
          
          setMonthlyStats({
            month: selectedMonth,
            year: selectedYear,
            totalDays: entries.length,
            completedDays,
            totalStandardHours,
            totalOvertimeHours,
            totalHours: totalStandardHours + totalOvertimeHours,
            malattiaCount,
            permessoCount,
            assenzaCount
          });
        } else {
          // Se non ci sono dati, imposta statistiche a zero
          setMonthlyStats({
            month: selectedMonth,
            year: selectedYear,
            totalDays: 0,
            completedDays: 0,
            totalStandardHours: 0,
            totalOvertimeHours: 0,
            totalHours: 0,
            malattiaCount: 0,
            permessoCount: 0,
            assenzaCount: 0
          });
        }
      } catch (err) {
        console.error("Errore caricamento statistiche mensili:", err);
        // Non impostare errore - questa è una funzionalità non critica
        
        // Imposta statistiche a zero in caso di errore
        setMonthlyStats({
          month: selectedMonth,
          year: selectedYear,
          totalDays: 0,
          completedDays: 0,
          totalStandardHours: 0,
          totalOvertimeHours: 0,
          totalHours: 0,
          malattiaCount: 0,
          permessoCount: 0,
          assenzaCount: 0
        });
      } finally {
        setIsLoadingStats(false);
      }
    };
    
    fetchMonthlyStats();
  }, [userData, selectedMonth, selectedYear]);

  // Funzione per ottenere il nome del mese in italiano
  const getMonthName = (monthNumber) => {
    const monthNames = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
      "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
    ];
    return monthNames[monthNumber - 1]; // L'array inizia da 0, i mesi da 1
  };

  // Gestisce il cambio del mese selezionato
  const handleMonthChange = (e) => {
    const selectedOption = availableMonths.find(month => month.value === e.target.value);
    if (selectedOption) {
      setSelectedMonth(selectedOption.value);
      setSelectedYear(selectedOption.year);
    }
  };

  // Toggle per mostrare/nascondere il QR code
  const toggleQRCode = () => {
    setShowQRCode(!showQRCode);
  };

  return (
    <div className="user-info-container">
      <div className="user-info">
        <div>
          <h2>Verifica le tue ore e segnala eventuali errori</h2>
          <p className="selection-description">
            {selectedMonth && selectedYear && 
              `Stai visualizzando ${getMonthName(selectedMonth)} ${selectedYear}`}
          </p>
        </div>
        <div className="user-actions">
          <div className="month-selector">
            <label htmlFor="month-select">Seleziona Mese: </label>
            <select 
              id="month-select" 
              value={selectedMonth} 
              onChange={handleMonthChange}
            >
              {availableMonths.map((month) => (
                <option key={`${month.value}-${month.year}`} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>
          <button 
            className="btn btn-primary qrcode-toggle-btn"
            onClick={toggleQRCode}
          >
            {showQRCode ? "Nascondi QR Code" : "Mostra QR Code"}
          </button>
        </div>
      </div>
      
      {/* QR Code container */}
      {showQRCode && (
        <div className="qrcode-container">
          <UserQRCode />
        </div>
      )}
      
      {/* Monthly Statistics Card - Now using the same data source as the timesheet table */}
      {monthlyStats && !isLoadingStats && (
        <div className="monthly-stats-card">
          <h3>Statistiche di {getMonthName(monthlyStats.month)} {monthlyStats.year}</h3>
          
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{monthlyStats.completedDays}</div>
              <div className="stat-label">Giorni Lavorati</div>
            </div>
            
            <div className="stat-item">
              <div className="stat-value">{monthlyStats.totalHours}</div>
              <div className="stat-label">Ore Totali</div>
            </div>
            
            <div className="stat-item">
              <div className="stat-value">{monthlyStats.totalOvertimeHours}</div>
              <div className="stat-label">Ore Straordinario</div>
            </div>
            
            {monthlyStats.malattiaCount > 0 && (
              <div className="stat-item">
                <div className="stat-value">{monthlyStats.malattiaCount}</div>
                <div className="stat-label">Giorni Malattia</div>
              </div>
            )}
            
            {monthlyStats.permessoCount > 0 && (
              <div className="stat-item">
                <div className="stat-value">{monthlyStats.permessoCount}</div>
                <div className="stat-label">Giorni Permesso</div>
              </div>
            )}
            
            {monthlyStats.assenzaCount > 0 && (
              <div className="stat-item">
                <div className="stat-value">{monthlyStats.assenzaCount}</div>
                <div className="stat-label">Giorni Assenza</div>
              </div>
            )}
          </div>
          
          <div className="stat-note">
            Riepilogo calcolato dai dati della tabella. Mostra ore effettive registrate e giorni speciali (M=Malattia, P=Permesso, A=Assenza).
          </div>
        </div>
      )}
    </div>
  );
};

export default UserInfo;
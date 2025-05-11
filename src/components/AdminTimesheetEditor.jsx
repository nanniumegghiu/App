// src/components/AdminTimesheetEditor.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import Notification from './Notification';

const AdminTimesheetEditor = ({ user, month, year }) => {
  const [daysInMonth, setDaysInMonth] = useState([]);
  const [timesheet, setTimesheet] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: 'success' // 'success' o 'error'
  });

  // Recupera il timesheet dell'utente selezionato per il mese/anno specificato
  useEffect(() => {
    const fetchTimesheet = async () => {
      if (!user) return;
      
      setLoading(true);
      
      // Genera l'array di tutti i giorni del mese
      const days = getDaysInMonth(month, year);
      setDaysInMonth(days);
      
      try {
        // Chiave del documento nel formato "userId_YYYY-MM"
        const timesheetId = `${user.id}_${year}-${month.toString().padStart(2, '0')}`;
        const timesheetRef = doc(db, "timesheets", timesheetId);
        const timesheetDoc = await getDoc(timesheetRef);
        
        if (timesheetDoc.exists()) {
          setTimesheet(timesheetDoc.data().days || {});
        } else {
          // Se non esiste, inizializza un nuovo timesheet vuoto
          const emptyTimesheet = {};
          days.forEach(day => {
            emptyTimesheet[day.date] = '';
          });
          setTimesheet(emptyTimesheet);
        }
      } catch (error) {
        console.error("Errore nel recupero del timesheet:", error);
        showNotification("Errore nel recupero dei dati", "error");
      } finally {
        setLoading(false);
      }
    };
    
    fetchTimesheet();
  }, [user, month, year]);

  // Genera un array di oggetti che rappresentano tutti i giorni del mese
  const getDaysInMonth = (month, year) => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayName = getDayName(date.getDay());
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      
      days.push({
        date: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
        day,
        dayName,
        isWeekend
      });
    }
    
    return days;
  };

  // Restituisce il nome del giorno
  const getDayName = (dayIndex) => {
    const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    return days[dayIndex];
  };

  // Gestisce il cambio di valore di un campo ore
  const handleHoursChange = (date, value) => {
    // Validazione dell'input: solo numeri, ":" e non più di 5 caratteri (HH:MM)
    const regex = /^(\d{1,2}(:|$)){0,1}(\d{0,2}){0,1}$/;
    
    if (value === '' || regex.test(value)) {
      setTimesheet(prev => ({
        ...prev,
        [date]: value
      }));
    }
  };

  // Formatta l'input delle ore nel formato HH:MM
  const formatHours = (date) => {
    const value = timesheet[date];
    if (!value) return;
    
    let formatted = value;
    
    // Se è solo un numero, aggiungi ":00"
    if (/^\d+$/.test(value)) {
      formatted = `${value}:00`;
    } 
    // Se è un numero seguito da ":", assicurati che ci siano due cifre dopo i due punti
    else if (/^\d+:$/.test(value)) {
      formatted = `${value}00`;
    }
    // Se è un numero seguito da ":" e un solo numero, aggiungi uno zero
    else if (/^\d+:\d$/.test(value)) {
      formatted = `${value}0`;
    }
    
    setTimesheet(prev => ({
      ...prev,
      [date]: formatted
    }));
  };

  // Salva il timesheet nel database
  const saveTimesheet = async () => {
    if (!user) return;
    
    setSaving(true);
    
    try {
      const timesheetId = `${user.id}_${year}-${month.toString().padStart(2, '0')}`;
      const timesheetRef = doc(db, "timesheets", timesheetId);
      
      await setDoc(timesheetRef, {
        userId: user.id,
        month,
        year,
        days: timesheet,
        lastUpdate: new Date().toISOString()
      });
      
      showNotification("Timesheet salvato con successo", "success");
    } catch (error) {
      console.error("Errore nel salvataggio del timesheet:", error);
      showNotification("Errore nel salvataggio dei dati", "error");
    } finally {
      setSaving(false);
    }
  };

  const showNotification = (message, type) => {
    setNotification({
      show: true,
      message,
      type
    });
    
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  if (loading) {
    return <div className="loading">Caricamento timesheet...</div>;
  }

  return (
    <div className="admin-timesheet-editor">
      <h3>
        Timesheet di {user.nome} {user.cognome} - {getMonthName(month)} {year}
      </h3>
      
      <div className="notification-container">
        {notification.show && (
          <Notification
            message={notification.message}
            isVisible={notification.show}
            onClose={() => setNotification(prev => ({ ...prev, show: false }))}
            type={notification.type}
          />
        )}
      </div>
      
      <div className="table-responsive">
        <table className="timesheet-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Giorno</th>
              <th>Ore Lavorate (HH:MM)</th>
            </tr>
          </thead>
          <tbody>
            {daysInMonth.map((dayInfo) => (
              <tr 
                key={dayInfo.date}
                className={dayInfo.isWeekend ? 'weekend-row' : ''}
              >
                <td>{dayInfo.day}</td>
                <td>{dayInfo.dayName}</td>
                <td>
                  <input
                    type="text"
                    value={timesheet[dayInfo.date] || ''}
                    onChange={(e) => handleHoursChange(dayInfo.date, e.target.value)}
                    onBlur={() => formatHours(dayInfo.date)}
                    placeholder="HH:MM"
                    maxLength="5"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="actions">
        <button 
          onClick={saveTimesheet} 
          className="btn btn-primary save-button"
          disabled={saving}
        >
          {saving ? 'Salvataggio...' : 'Salva Timesheet'}
        </button>
      </div>
    </div>
  );
};

// Funzione di utilità per ottenere il nome del mese
const getMonthName = (monthIndex) => {
  const months = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", 
    "Maggio", "Giugno", "Luglio", "Agosto", 
    "Settembre", "Ottobre", "Novembre", "Dicembre"
  ];
  return months[monthIndex - 1];
};

export default AdminTimesheetEditor;
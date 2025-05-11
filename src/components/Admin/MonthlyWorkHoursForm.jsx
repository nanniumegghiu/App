// src/components/Admin/MonthlyWorkHoursForm.jsx
import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { getMonthName, generateWorkDaysForMonth } from '../../utils/dateUtils';

const MonthlyWorkHoursForm = ({ onSave, onCancel, selectedMonth, selectedYear, selectedUser }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [workDays, setWorkDays] = useState([]);
  const [hoursData, setHoursData] = useState({});
  const [errors, setErrors] = useState({});

  // Recupera i dati dell'utente selezionato
  useEffect(() => {
    const fetchUserData = async () => {
      if (!selectedUser) return;
      
      try {
        const usersCollection = collection(db, "users");
        const usersSnapshot = await getDocs(usersCollection);
        
        const users = usersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        const foundUser = users.find(user => user.id === selectedUser);
        if (foundUser) {
          setUser(foundUser);
        }
      } catch (err) {
        console.error("Errore nel recupero dei dati utente:", err);
      }
    };

    fetchUserData();
  }, [selectedUser]);

  // Genera i giorni lavorativi del mese
  useEffect(() => {
    if (!selectedMonth || !selectedYear) return;
    
    const days = generateWorkDaysForMonth(selectedMonth, selectedYear);
    setWorkDays(days);
    
    // Inizializza i dati delle ore per tutti i giorni
    const initialData = {};
    days.forEach(day => {
      initialData[day] = { 
        totalHours: "8", // Default a 8 ore
        notes: ""
      };
    });
    setHoursData(initialData);
  }, [selectedMonth, selectedYear]);

  // Gestisce il cambio delle ore per un giorno
  const handleHoursChange = (date, value) => {
    // Consenti solo numeri interi
    const intValue = parseInt(value, 10);
    if (!isNaN(intValue) && intValue >= 0 && intValue <= 24) {
      setHoursData(prev => ({
        ...prev,
        [date]: {
          ...prev[date],
          totalHours: intValue.toString()
        }
      }));
      
      // Rimuovi l'errore se presente
      if (errors[date]) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[date];
          return newErrors;
        });
      }
    }
  };

  // Gestisce il cambio delle note per un giorno
  const handleNotesChange = (date, value) => {
    setHoursData(prev => ({
      ...prev,
      [date]: {
        ...prev[date],
        notes: value
      }
    }));
  };

  // Valida i dati prima dell'invio
  const validateData = () => {
    const newErrors = {};
    
    workDays.forEach(date => {
      const hours = hoursData[date]?.totalHours;
      if (!hours) {
        newErrors[date] = "Ore richieste";
      } else {
        const intHours = parseInt(hours, 10);
        if (isNaN(intHours) || intHours < 0 || intHours > 24) {
          newErrors[date] = "Ore non valide";
        }
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Gestisce l'invio del form
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!user) {
      alert("Nessun utente selezionato");
      return;
    }
    
    if (!validateData()) {
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Prepara i dati per il salvataggio
      const workHoursDataArray = workDays.map(date => {
        // Ottieni il nome del giorno della settimana
        const dayOfWeek = new Date(date).toLocaleDateString('it-IT', { weekday: 'long' });
        
        return {
          date,
          userId: user.id,
          userEmail: user.email,
          userNome: user.nome,
          userCognome: user.cognome,
          totalHours: hoursData[date].totalHours,
          notes: hoursData[date].notes,
          day: dayOfWeek,
          month: selectedMonth.toString(),
          year: selectedYear.toString()
        };
      });
      
      // Invia i dati al componente padre
      onSave(workHoursDataArray);
    } catch (err) {
      console.error("Errore nella preparazione dei dati:", err);
      alert("Impossibile preparare i dati. Riprova più tardi.");
    } finally {
      setIsLoading(false);
    }
  };

  // Formatta la data per la visualizzazione
  const formatDateDisplay = (dateString) => {
    const dateParts = dateString.split('-');
    const day = parseInt(dateParts[2], 10);
    
    // Ottieni il nome del giorno
    const date = new Date(dateString);
    const dayName = date.toLocaleDateString('it-IT', { weekday: 'short' });
    
    return `${dayName} ${day}`;
  };

  if (!selectedUser) {
    return (
      <div className="monthly-form-overlay">
        <div className="monthly-form">
          <h3>Inserimento Ore Mensili</h3>
          <p>Seleziona un utente per continuare.</p>
          <div className="form-actions">
            <button 
              type="button" 
              className="btn btn-danger"
              onClick={onCancel}
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="monthly-form-overlay">
      <div className="monthly-form">
        <h3>Inserimento Ore Mensili</h3>
        <div className="monthly-form-header">
          <p>
            <strong>Mese:</strong> {getMonthName(selectedMonth)} {selectedYear}
          </p>
          <p>
            <strong>Utente:</strong> {user ? `${user.nome} ${user.cognome}` : 'Utente non trovato'}
          </p>
          <p>
            <strong>Giorni lavorativi:</strong> {workDays.length}
          </p>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="monthly-days-grid">
            {workDays.map(date => (
              <div 
                key={date} 
                className={`day-card ${errors[date] ? 'day-error' : ''}`}
              >
                <div className="day-header">
                  <span className="day-date">{formatDateDisplay(date)}</span>
                </div>
                <div className="day-inputs">
                  <div className="hours-input-group">
                    <label htmlFor={`hours-${date}`}>Ore:</label>
                    <input 
                      type="number" 
                      id={`hours-${date}`}
                      value={hoursData[date]?.totalHours || ''}
                      onChange={(e) => handleHoursChange(date, e.target.value)}
                      min="0"
                      max="24"
                      step="1"
                      className={errors[date] ? 'error' : ''}
                    />
                  </div>
                  <div className="notes-input-group">
                    <label htmlFor={`notes-${date}`}>Note:</label>
                    <input 
                      type="text" 
                      id={`notes-${date}`}
                      value={hoursData[date]?.notes || ''}
                      onChange={(e) => handleNotesChange(date, e.target.value)}
                      placeholder="Opzionale"
                    />
                  </div>
                </div>
                {errors[date] && <div className="error-text">{errors[date]}</div>}
              </div>
            ))}
          </div>

          <div className="bulk-actions">
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={() => {
                // Imposta 8 ore per tutti i giorni
                const updatedData = {};
                workDays.forEach(date => {
                  updatedData[date] = { 
                    ...hoursData[date],
                    totalHours: "8" 
                  };
                });
                setHoursData(updatedData);
              }}
            >
              Imposta 8 ore per tutti
            </button>
          </div>
          
          <div className="form-actions">
            <button 
              type="submit" 
              className="btn btn-success"
              disabled={isLoading}
            >
              {isLoading ? 'Salvataggio...' : 'Salva Ore Mensili'}
            </button>
            
            <button 
              type="button" 
              className="btn btn-danger"
              onClick={onCancel}
              disabled={isLoading}
            >
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MonthlyWorkHoursForm;
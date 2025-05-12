// src/components/Admin/AdminWorkHours.jsx
import React, { useState, useEffect } from 'react';
import { db, saveWorkHours } from '../../firebase';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';

const AdminWorkHours = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('2025');
  const [timeEntries, setTimeEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });

  // Carica la lista degli utenti al montaggio del componente
  useEffect(() => {
    const fetchEmployees = async () => {
      console.log("Caricamento utenti...");
      setIsLoading(true);
      try {
        const usersCollection = collection(db, "users");
        const userSnapshot = await getDocs(usersCollection);
        const usersList = userSnapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          .filter(user => user.role !== "admin"); // Esclude gli amministratori
        
        console.log(`${usersList.length} utenti caricati`);
        setEmployees(usersList);
      } catch (error) {
        console.error("Errore nel caricamento degli utenti:", error);
        showNotification("Errore nel caricamento degli utenti", "error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmployees();
  }, []);

  // Carica le ore lavorative quando viene selezionato un dipendente e un mese
  useEffect(() => {
    const fetchTimeEntries = async () => {
      if (!selectedEmployee || !selectedMonth) {
        return;
      }
      
      console.log(`Caricamento ore: dipendente=${selectedEmployee}, mese=${selectedMonth}, anno=${selectedYear}`);
      setIsLoading(true);
      try {
        // Costruisci l'ID del documento
        const docId = `${selectedEmployee}_${selectedMonth}_${selectedYear}`;
        console.log(`Cercando documento con ID: ${docId}`);
        
        // Tenta di recuperare direttamente il documento
        const docRef = doc(db, "workHours", docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          console.log("Documento trovato, caricamento entries");
          const data = docSnap.data();
          setTimeEntries(data.entries || []);
        } else {
          console.log("Documento non trovato, generazione giorni completi del mese");
          // Genera date complete per il mese selezionato, inclusi weekend
          const entries = generateCompleteMonthDays(parseInt(selectedMonth), parseInt(selectedYear));
          setTimeEntries(entries);
        }
      } catch (error) {
        console.error("Errore nel caricamento delle ore lavorative:", error);
        showNotification("Errore nel caricamento delle ore lavorative", "error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTimeEntries();
  }, [selectedEmployee, selectedMonth, selectedYear]);

  // Funzione per generare le date complete di un mese, inclusi weekend
  const generateCompleteMonthDays = (month, year) => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const entries = [];
    const dayNames = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay(); // 0-6 (Domenica-Sabato)
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      entries.push({
        date: dateStr,
        day: dayNames[dayOfWeek],
        total: 0, // Ore totali come numero intero (inizialmente zero)
        notes: "",
        isWeekend: isWeekend // Aggiungiamo una proprietà per identificare il weekend
      });
    }
    
    return entries;
  };

  // Gestisce il cambio di dipendente selezionato
  const handleEmployeeChange = (e) => {
    setSelectedEmployee(e.target.value);
  };

  // Gestisce il cambio di mese
  const handleMonthChange = (e) => {
    setSelectedMonth(e.target.value);
  };

  // Gestisce il cambio di anno
  const handleYearChange = (e) => {
    setSelectedYear(e.target.value);
  };

  // Gestisce l'input delle ore totali
  const handleTotalHoursChange = (index, value) => {
    // Assicurati che sia un numero intero o stringa vuota
    let totalHours = value === "" ? 0 : parseInt(value);
    
    // Controlli di validità
    if (isNaN(totalHours)) {
      totalHours = 0;
    }
    
    // Limita il valore a un range ragionevole (0-24 ore)
    totalHours = Math.max(0, Math.min(24, totalHours));
    
    const updatedEntries = [...timeEntries];
    updatedEntries[index].total = totalHours;
    setTimeEntries(updatedEntries);
  };

  // Gestisce l'input delle note
  const handleNotesChange = (index, value) => {
    const updatedEntries = [...timeEntries];
    updatedEntries[index].notes = value;
    setTimeEntries(updatedEntries);
  };

  // Salva le ore lavorative nel database
  const handleSaveWorkHours = async () => {
    if (!selectedEmployee || !selectedMonth) {
      showNotification("Seleziona un dipendente e un mese", "error");
      return;
    }
    
    console.log("Inizio salvataggio ore lavorative");
    console.log("Dati da salvare:", timeEntries);
    
    setIsSaving(true);
    try {
      // Assicurati che tutte le ore totali siano numeri interi
      const entriesWithIntegerHours = timeEntries.map(entry => ({
        date: entry.date,
        day: entry.day,
        total: parseInt(entry.total) || 0, // Converti in intero, 0 se non valido
        notes: entry.notes || "",
        isWeekend: entry.isWeekend || false // Mantieni la proprietà isWeekend
      }));
      
      // Utilizza la funzione saveWorkHours importata da firebase.js
      await saveWorkHours(selectedEmployee, selectedMonth, selectedYear, entriesWithIntegerHours);
      
      // Aggiorna lo stato locale con i valori convertiti
      setTimeEntries(entriesWithIntegerHours);
      
      console.log("Ore lavorative salvate con successo");
      showNotification("Ore lavorative salvate con successo", "success");
    } catch (error) {
      console.error("Errore nel salvataggio delle ore lavorative:", error);
      showNotification("Errore nel salvataggio delle ore lavorative", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Mostra una notifica
  const showNotification = (message, type) => {
    setNotification({ show: true, message, type });
    
    // Nascondi la notifica dopo 3 secondi
    setTimeout(() => {
      setNotification({ show: false, message: '', type: '' });
    }, 3000);
  };

  // Ottieni il nome del mese
  const getMonthName = (monthNumber) => {
    const months = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", 
      "Maggio", "Giugno", "Luglio", "Agosto", 
      "Settembre", "Ottobre", "Novembre", "Dicembre"
    ];
    return months[parseInt(monthNumber) - 1];
  };

  return (
    <div className="admin-work-hours">
      <h3>Gestione Ore Lavorative</h3>
      
      {notification.show && (
        <div className={`notification ${notification.type}`} style={{
          backgroundColor: notification.type === 'error' ? 'var(--danger)' : 'var(--success)',
          color: 'white',
          padding: '15px',
          marginBottom: '20px',
          borderRadius: '5px'
        }}>
          {notification.message}
        </div>
      )}
      
      <div className="filters-container">
        <div className="form-group">
          <label htmlFor="employee-select">Dipendente:</label>
          <select 
            id="employee-select" 
            value={selectedEmployee} 
            onChange={handleEmployeeChange}
            className="form-control"
          >
            <option value="">-- Seleziona un dipendente --</option>
            {employees.map(employee => (
              <option key={employee.id} value={employee.id}>
                {employee.nome} {employee.cognome} ({employee.email})
              </option>
            ))}
          </select>
        </div>
        
        <div className="form-group">
          <label htmlFor="month-select">Mese:</label>
          <select 
            id="month-select" 
            value={selectedMonth} 
            onChange={handleMonthChange}
            className="form-control"
          >
            <option value="">-- Seleziona un mese --</option>
            {[...Array(12)].map((_, i) => (
              <option key={i + 1} value={(i + 1).toString()}>
                {getMonthName(i + 1)}
              </option>
            ))}
          </select>
        </div>
        
        <div className="form-group">
          <label htmlFor="year-select">Anno:</label>
          <select 
            id="year-select" 
            value={selectedYear} 
            onChange={handleYearChange}
            className="form-control"
          >
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>
        </div>
      </div>
      
      {isLoading ? (
        <div className="loading">Caricamento in corso...</div>
      ) : (
        <>
          {(selectedEmployee && selectedMonth) ? (
            <div className="table-responsive">
              <table className="work-hours-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Giorno</th>
                    <th>Ore Totali</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {timeEntries.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center' }}>
                        Nessun giorno in questo mese
                      </td>
                    </tr>
                  ) : (
                    timeEntries.map((entry, index) => (
                      <tr 
                        key={entry.date}
                        className={entry.isWeekend ? 'weekend-row' : ''}
                        style={entry.isWeekend ? { backgroundColor: '#f8f9fa' } : {}}
                      >
                        <td>{entry.date.split('-').reverse().join('/')}</td>
                        <td>
                          {entry.day}
                          {entry.isWeekend && (
                            <span className="badge badge-weekend" style={{
                              backgroundColor: '#f8d7da',
                              color: '#721c24',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              marginLeft: '6px'
                            }}>Weekend</span>
                          )}
                        </td>
                        <td>
                          <input 
                            type="number" 
                            value={entry.total} 
                            onChange={e => handleTotalHoursChange(index, e.target.value)}
                            min="0"
                            max="24"
                            className="form-control"
                          />
                        </td>
                        <td>
                          <input 
                            type="text" 
                            value={entry.notes || ''} 
                            onChange={e => handleNotesChange(index, e.target.value)}
                            placeholder="Note..."
                            className="form-control"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              
              <div className="action-buttons">
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveWorkHours}
                  disabled={isSaving}
                >
                  {isSaving ? 'Salvataggio...' : 'Salva Ore Lavorative'}
                </button>
              </div>
            </div>
          ) : (
            <div className="select-message">
              Seleziona un dipendente e un mese per gestire le ore lavorative
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminWorkHours;
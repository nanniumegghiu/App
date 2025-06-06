// src/components/Admin/AdminWorkHours.jsx - Con evidenziazione festività
import React, { useState, useEffect } from 'react';
import { db, saveWorkHours } from '../../firebase';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { getDayInfo, getMonthHolidays } from '../../utils/holidaysUtils';

const generateYearOptions = () => {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear - 1, currentYear - 2].sort((a, b) => b - a);
};

const AdminWorkHours = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [timeEntries, setTimeEntries] = useState([]);
  const [monthHolidays, setMonthHolidays] = useState([]);
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
          .sort((a, b) => {
            if (a.role === 'admin' && b.role !== 'admin') return -1;
            if (a.role !== 'admin' && b.role === 'admin') return 1;
            
            const aName = a.nome && a.cognome ? `${a.nome} ${a.cognome}` : a.email;
            const bName = b.nome && b.cognome ? `${b.nome} ${b.cognome}` : b.email;
            return aName.localeCompare(bName);
          });
        
        console.log(`${usersList.length} utenti caricati (inclusi ${usersList.filter(u => u.role === 'admin').length} admin)`);
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

  // Carica le festività quando cambiano mese/anno
  useEffect(() => {
    if (selectedMonth && selectedYear) {
      const monthInt = parseInt(selectedMonth);
      const yearInt = parseInt(selectedYear);
      const holidays = getMonthHolidays(monthInt, yearInt);
      setMonthHolidays(holidays);
      console.log(`Festività trovate per ${selectedMonth}/${selectedYear}:`, holidays);
    }
  }, [selectedMonth, selectedYear]);

  // Funzione per generare tutti i giorni del mese con dati vuoti e info festività
  const generateCompleteMonthDays = (month, year) => {
    const monthInt = parseInt(month);
    const yearInt = parseInt(year);
    const daysInMonth = new Date(yearInt, monthInt, 0).getDate();
    const entries = [];
    const dayNames = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yearInt}-${monthInt.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      const dayInfo = getDayInfo(dateStr);
      
      entries.push({
        date: dateStr,
        day: dayNames[dayInfo.dayOfWeek],
        total: "",
        overtime: 0,
        notes: "",
        isWeekend: dayInfo.isWeekend,
        isHoliday: dayInfo.isHoliday,
        holidayName: dayInfo.holidayName,
        isNonWorkingDay: dayInfo.isNonWorkingDay,
        dayType: dayInfo.dayType,
        hasData: false
      });
    }
    
    return entries;
  };

  // Carica le ore lavorative quando viene selezionato un dipendente e un mese
  useEffect(() => {
    const fetchTimeEntries = async () => {
      if (!selectedEmployee || !selectedMonth) {
        return;
      }
      
      console.log(`Caricamento ore: dipendente=${selectedEmployee}, mese=${selectedMonth}, anno=${selectedYear}`);
      setIsLoading(true);
      try {
        const completeMonthData = generateCompleteMonthDays(selectedMonth, selectedYear);
        
        const docId = `${selectedEmployee}_${selectedMonth}_${selectedYear}`;
        console.log(`Cercando documento con ID: ${docId}`);
        
        const docRef = doc(db, "workHours", docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          console.log("Documento trovato, caricamento entries");
          const data = docSnap.data();
          
          if (data.entries && data.entries.length > 0) {
            const existingDataMap = {};
            data.entries.forEach(entry => {
              if (entry.date) {
                existingDataMap[entry.date] = {
                  ...entry,
                  overtime: entry.overtime !== undefined ? entry.overtime : 0,
                  hasData: true
                };
              }
            });
            
            const mergedData = completeMonthData.map(dayEntry => {
              const existingEntry = existingDataMap[dayEntry.date];
              if (existingEntry) {
                return {
                  ...dayEntry, // Mantieni le info su weekend/festività
                  ...existingEntry // Sovrascrivi con i dati esistenti
                };
              }
              return dayEntry;
            });
            
            setTimeEntries(mergedData);
          } else {
            setTimeEntries(completeMonthData);
          }
        } else {
          console.log("Documento non trovato, usando calendario completo vuoto");
          setTimeEntries(completeMonthData);
        }
      } catch (error) {
        console.error("Errore nel caricamento delle ore lavorative:", error);
        showNotification("Errore nel caricamento delle ore lavorative", "error");
        
        const completeMonthData = generateCompleteMonthDays(selectedMonth, selectedYear);
        setTimeEntries(completeMonthData);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTimeEntries();
  }, [selectedEmployee, selectedMonth, selectedYear]);

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

  // Gestisce l'input delle ore totali o le lettere speciali
  
const handleTotalHoursChange = (index, value) => {
  // Converti automaticamente le lettere singole
  let processedValue = value;
  
  // Conversioni automatiche per facilitare l'inserimento
  if (value === "C" || value === "c") {
    processedValue = "CIG";
  } else if (value === "M" || value === "m") {
    processedValue = "M";
  } else if (value === "P" || value === "p") {
    processedValue = "P";
  } else if (value === "F" || value === "f") {
    processedValue = "F";
  } else if (value === "A" || value === "a") {
    processedValue = "A";
  }
  
  // Lista completa delle lettere speciali valide
  const validLetters = ["M", "P", "F", "A", "CIG"];
  
  if (validLetters.includes(processedValue)) {
    const updatedEntries = [...timeEntries];
    updatedEntries[index].total = processedValue;
    updatedEntries[index].hasData = true;
    setTimeEntries(updatedEntries);
    return;
  }
  
  if (value === "") {
    const updatedEntries = [...timeEntries];
    updatedEntries[index].total = "";
    updatedEntries[index].hasData = false;
    setTimeEntries(updatedEntries);
    return;
  }
  
  // Gestione dei valori numerici (ore standard)
  let totalHours = parseInt(value);
  
  if (isNaN(totalHours)) {
    return;
  }
  
  totalHours = Math.max(0, Math.min(8, totalHours));
  
  const updatedEntries = [...timeEntries];
  updatedEntries[index].total = totalHours;
  updatedEntries[index].hasData = true;
  setTimeEntries(updatedEntries);
};

  // Gestisce l'input delle ore di straordinario
  const handleOvertimeChange = (index, value) => {
    if (value === "") {
      const updatedEntries = [...timeEntries];
      updatedEntries[index].overtime = 0;
      setTimeEntries(updatedEntries);
      return;
    }
    
    let overtimeHours = parseInt(value);
    
    if (isNaN(overtimeHours)) {
      return;
    }
    
    overtimeHours = Math.max(0, Math.min(12, overtimeHours));
    
    const updatedEntries = [...timeEntries];
    updatedEntries[index].overtime = overtimeHours;
    updatedEntries[index].hasData = true;
    setTimeEntries(updatedEntries);
  };

  // Restituisce il colore del testo in base al valore
  const getTotalValueColor = (total) => {
    if (total === "M") return "#e74c3c";
    if (total === "P") return "#2ecc71";
    if (total === "F") return "#9b59b6";
    if (total === "A") return "#000000";
    if (total === "CIG") return "#f39c12"; // Arancione per CIG
    return "";
  };

  // Gestisce l'input delle note
  const handleNotesChange = (index, value) => {
    const updatedEntries = [...timeEntries];
    updatedEntries[index].notes = value;
    if (value.trim() !== "") {
      updatedEntries[index].hasData = true;
    }
    setTimeEntries(updatedEntries);
  };

  // Ottiene la classe CSS per la riga in base al tipo di giorno
  const getRowClass = (entry) => {
    const classes = [];
    
    if (entry.isHoliday) {
      classes.push('holiday-row');
    } else if (entry.isWeekend) {
      classes.push('weekend-row');
    }
    
    if (!entry.hasData) {
      classes.push('no-data-row');
    }
    
    return classes.join(' ');
  };

  // Ottiene lo stile inline per la riga
  const getRowStyle = (entry) => {
    if (entry.isHoliday) {
      return { backgroundColor: '#fff3cd', borderLeft: '4px solid #f0ad4e' };
    } else if (entry.isWeekend) {
      return { backgroundColor: '#f8f9fa' };
    } else if (!entry.hasData) {
      return { backgroundColor: '#fafafa' };
    }
    return {};
  };

  // Salva le ore lavorative nel database
  const handleSaveWorkHours = async () => {
    if (!selectedEmployee || !selectedMonth) {
      showNotification("Seleziona un dipendente e un mese", "error");
      return;
    }
    
    console.log("Inizio salvataggio ore lavorative");
    
    setIsSaving(true);
    try {
      const entriesForSaving = timeEntries.map(entry => {
        let totalValue;
        if (["M", "P", "F", "A"].includes(entry.total)) {
          totalValue = entry.total;
        } else if (entry.total === "" || entry.total === null || entry.total === undefined) {
          totalValue = 0;
        } else {
          totalValue = parseInt(entry.total) || 0;
        }
        
        return {
          date: entry.date,
          day: entry.day,
          total: totalValue,
          overtime: parseInt(entry.overtime) || 0,
          notes: entry.notes || "",
          isWeekend: entry.isWeekend || false,
          isHoliday: entry.isHoliday || false,
          holidayName: entry.holidayName || null
        };
      });
      
      await saveWorkHours(selectedEmployee, selectedMonth, selectedYear, entriesForSaving);
      
      const updatedEntries = timeEntries.map(entry => ({
        ...entry,
        hasData: true
      }));
      setTimeEntries(updatedEntries);
      
      console.log("Ore lavorative salvate con successo");
      showNotification("Ore lavorative salvate con successo", "success");
    } catch (error) {
      console.error("Errore nel salvataggio delle ore lavorative:", error);
      showNotification("Errore nel salvataggio delle ore lavorative", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Funzione di utilità per impostare valori in massa
  const setBulkValue = (value, type = 'total') => {
    const updatedEntries = timeEntries.map(entry => {
      // Non sovrascrivere weekend e festività se non specificato
      if ((entry.isWeekend || entry.isHoliday) && type === 'total') {
        return entry;
      }
      
      const newEntry = { ...entry, hasData: true };
      if (type === 'total') {
        newEntry.total = value;
      } else if (type === 'overtime') {
        newEntry.overtime = parseInt(value) || 0;
      }
      return newEntry;
    });
    setTimeEntries(updatedEntries);
  };

  // Mostra una notifica
  const showNotification = (message, type) => {
    setNotification({ show: true, message, type });
    
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
                {employee.role === 'admin' && '👑 '}
                {employee.nome} {employee.cognome} ({employee.email})
                {employee.role === 'admin' && ' - Admin'}
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
            {generateYearOptions().map(year => (
              <option key={year} value={year.toString()}>{year}</option>
            ))}
          </select>
        </div>
      </div>
      
      {isLoading ? (
        <div className="loading">Caricamento in corso...</div>
      ) : (
        <>
          {(selectedEmployee && selectedMonth) ? (
            <div className="table-responsive">
              <div className="legend-container" style={{ 
                marginBottom: '15px', 
                padding: '10px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '5px' 
              }}>
                <h4 style={{ fontSize: '1rem', marginBottom: '10px' }}>Legenda:</h4>
                <div className="legend-items" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  <div className="legend-item">
                    <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>M</span> - Malattia
                  </div>
                  <div className="legend-item">
                    <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>P</span> - Permesso
                  </div>
                  <div className="legend-item">
                    <span style={{ color: '#9b59b6', fontWeight: 'bold' }}>F</span> - Ferie
                  </div>
                  <div className="legend-item">
                    <span style={{ color: '#000000', fontWeight: 'bold' }}>A</span> - Assenza
                  </div>
                  <div className="legend-item">
                    <span style={{ backgroundColor: '#f8f9fa', padding: '2px 4px', borderRadius: '3px' }}>Grigio</span> - Weekend
                  </div>
                  <div className="legend-item">
                    <span style={{ color: '#f39c12', fontWeight: 'bold' }}>CIG</span> - Cassa Integrazione
                  </div>
                  <div className="legend-item">
                    <span style={{ backgroundColor: '#fff3cd', padding: '2px 4px', borderRadius: '3px', borderLeft: '3px solid #f0ad4e' }}>Giallo</span> - Festività
                  </div>
                </div>
              </div>

              <div className="bulk-actions" style={{ 
                marginBottom: '15px', 
                padding: '10px', 
                backgroundColor: '#f0f8ff', 
                borderRadius: '5px',
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap'
              }}>
                <strong>Azioni rapide:</strong>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm"
                  onClick={() => setBulkValue(8, 'total')}
                >
                  8 ore per giorni lavorativi
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm"
                  onClick={() => setBulkValue(0, 'total')}
                >
                  Azzera ore standard
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm"
                  onClick={() => setBulkValue(0, 'overtime')}
                >
                  Azzera straordinari
                </button>
              </div>
            
              <table className="work-hours-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Giorno</th>
                    <th>Ore Standard (0-8) o Lettere</th>
                    <th>Straordinario (0-12)</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {timeEntries.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center' }}>
                        Nessun giorno in questo mese
                      </td>
                    </tr>
                  ) : (
                    timeEntries.map((entry, index) => (
                      <tr 
                        key={entry.date}
                        className={getRowClass(entry)}
                        style={getRowStyle(entry)}
                      >
                        <td>{entry.date.split('-').reverse().join('/')}</td>
                        <td>
                          {entry.day}
                          {entry.isWeekend && (
                            <span className="badge badge-weekend" style={{
                              backgroundColor: '#6c757d',
                              color: 'white',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              marginLeft: '6px'
                            }}>Weekend</span>
                          )}
                          {entry.isHoliday && (
                            <span className="badge badge-holiday" style={{
                              backgroundColor: '#f0ad4e',
                              color: 'white',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              marginLeft: '6px'
                            }} title={entry.holidayName}>
                              🎉 {entry.holidayName}
                            </span>
                          )}
                        </td>
                        <td>
                          <input 
                            type="text" 
                            value={entry.total} 
                            onChange={e => handleTotalHoursChange(index, e.target.value)}
                            maxLength="3"
                            className="form-control"
                            style={{ 
                              color: getTotalValueColor(entry.total),
                              fontWeight: ["M", "P", "F", "A"].includes(entry.total) ? 'bold' : 'normal',
                              width: '100px'
                            }}
                            placeholder={entry.isNonWorkingDay ? "-" : "0-8 o M/P/F/A"}
                            title="Inserisci un valore tra 0 e 8 o una lettera speciale (M=Malattia, P=Permesso, F=Ferie, A=Assenza)"
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            value={entry.overtime || ""} 
                            onChange={e => handleOvertimeChange(index, e.target.value)}
                            min="0"
                            max="12"
                            className="form-control"
                            style={{ width: '80px' }}
                            disabled={["M", "P", "F", "A"].includes(entry.total)}
                            placeholder="0-12"
                            title="Inserisci le ore di straordinario (max 12, disponibile solo per giorni lavorati)"
                          />
                        </td>
                        <td>
                          <input 
                            type="text" 
                            value={entry.notes || ''} 
                            onChange={e => handleNotesChange(index, e.target.value)}
                            placeholder="Note opzionali..."
                            className="form-control"
                            style={{ minWidth: '150px' }}
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
                  {isSaving ? 'Salvataggio in corso...' : 'Salva Ore Lavorative'}
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
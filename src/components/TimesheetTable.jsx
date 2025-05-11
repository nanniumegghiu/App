import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
// Assicurati di includere Font Awesome nel tuo progetto se usi le icone fa-*

const TimesheetTable = ({ 
  selectedMonth, 
  onReportError, 
  highlightedRow, 
  rowRef,
  selectedYear = "2025" 
}) => {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Carica i dati delle ore quando cambia il mese selezionato
  useEffect(() => {
    const fetchTimesheet = async () => {
      if (!selectedMonth || !auth.currentUser) return;
      
      setIsLoading(true);
      try {
        // Prova entrambi i formati del mese (con e senza zero iniziale)
        const rawMonth = selectedMonth.replace(/^0+/, ''); // Rimuove eventuali zeri iniziali
        
        // Prova prima a cercare con il mese senza zero iniziale (es. "4" invece di "04")
        const docId = `${auth.currentUser.uid}_${rawMonth}_${selectedYear}`;
        
        // Recupera direttamente il documento dalla collezione workHours
        const docRef = doc(db, "workHours", docId);
        const docSnap = await getDoc(docRef);
        
        // Se non trova il documento, prova con il mese con zero iniziale
        let entriesData = null;
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          
          if (data.entries && Array.isArray(data.entries)) {
            entriesData = data.entries;
          }
        } else {
          // Prova con il mese con zero iniziale (es. "04" invece di "4")
          const formattedMonth = selectedMonth.length === 1 ? selectedMonth.padStart(2, '0') : selectedMonth;
          const altDocId = `${auth.currentUser.uid}_${formattedMonth}_${selectedYear}`;
          
          if (altDocId !== docId) {
            const altDocRef = doc(db, "workHours", altDocId);
            const altDocSnap = await getDoc(altDocRef);
            
            if (altDocSnap.exists()) {
              const altData = altDocSnap.data();
              
              if (altData.entries && Array.isArray(altData.entries)) {
                entriesData = altData.entries;
              }
            } else {
              // Se entrambi i tentativi falliscono, prova con una query più generica
              const workHoursRef = collection(db, "workHours");
              const q = query(
                workHoursRef, 
                where("userId", "==", auth.currentUser.uid),
                where("year", "==", selectedYear)
              );
              
              const querySnapshot = await getDocs(q);
              
              if (!querySnapshot.empty) {
                // Cerca un documento che potrebbe corrispondere al mese
                for (const doc of querySnapshot.docs) {
                  const data = doc.data();
                  if (data.month === rawMonth || data.month === formattedMonth) {
                    if (data.entries && Array.isArray(data.entries)) {
                      entriesData = data.entries;
                      break;
                    }
                  }
                }
              }
            }
          }
        }
        
        if (entriesData) {
          // Ordina le entries per data
          const sortedEntries = [...entriesData].sort((a, b) => {
            return new Date(a.date) - new Date(b.date);
          });
          setData(sortedEntries);
        } else {
          // Generare giorni vuoti
          const month = parseInt(selectedMonth);
          const emptyEntries = generateEmptyMonthDays(month, parseInt(selectedYear));
          setData(emptyEntries);
        }
        
        setError(null);
      } catch (err) {
        setError("Impossibile caricare le ore lavorative. Riprova più tardi.");
        const month = parseInt(selectedMonth);
        const emptyEntries = generateEmptyMonthDays(month, parseInt(selectedYear));
        setData(emptyEntries);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTimesheet();
  }, [selectedMonth, selectedYear]);

  // Funzione per generare giorni lavorativi vuoti per un mese specifico
  const generateEmptyMonthDays = (month, year) => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const entries = [];
    const dayNames = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay(); // 0-6 (Domenica-Sabato)
      
      // Salta weekend (0 = Domenica, 6 = Sabato)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        entries.push({
          date: dateStr,
          day: dayNames[dayOfWeek],
          total: 0,
          notes: ""
        });
      }
    }
    
    return entries;
  };

  // Ottieni il nome del mese dalla selezione
  const getMonthName = (monthValue) => {
    const months = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", 
      "Maggio", "Giugno", "Luglio", "Agosto", 
      "Settembre", "Ottobre", "Novembre", "Dicembre"
    ];
    return months[parseInt(monthValue) - 1];
  };

  // Formatta la data in formato DD/MM/YYYY
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    
    return dateStr;
  };

  // Calcola il totale delle ore
  const calculateTotalHours = () => {
    return data.reduce((total, entry) => total + (parseInt(entry.total) || 0), 0);
  };

  // Controlla se è possibile segnalare errori (prima del giorno 5 del mese successivo)
  const canReportError = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // getMonth() restituisce 0-11
    const currentDay = today.getDate();
    
    const selectedMonthNum = parseInt(selectedMonth);
    const selectedYearNum = parseInt(selectedYear);
    
    // Calcola il mese successivo a quello selezionato
    let nextMonth = selectedMonthNum + 1;
    let nextYear = selectedYearNum;
    
    // Se il mese selezionato è dicembre, il mese successivo è gennaio dell'anno dopo
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    
    // Controlla se oggi è oltre il giorno 5 del mese successivo
    if (
      (currentYear > nextYear) || 
      (currentYear === nextYear && currentMonth > nextMonth) ||
      (currentYear === nextYear && currentMonth === nextMonth && currentDay > 5)
    ) {
      return false; // Non è più possibile segnalare errori
    }
    
    return true; // È ancora possibile segnalare errori
  };

  // Verifica se è possibile segnalare errori
  const isErrorReportingEnabled = canReportError();

  return (
    <div className="card">
      <div className="card-header">
        <div>Riepilogo Ore Lavorative - {getMonthName(selectedMonth)} {selectedYear}</div>
      </div>
      <div className="card-body">
        {isLoading ? (
          <div className="text-center">
            <p>Caricamento ore lavorative in corso...</p>
          </div>
        ) : error ? (
          <div className="alert alert-danger">
            {error}
          </div>
        ) : (
          <>
            {!isErrorReportingEnabled && (
              <div className="alert alert-info" style={{ 
                borderLeft: '5px solid #17a2b8', 
                padding: '12px 15px',
                borderRadius: '4px',
                backgroundColor: '#e8f4f8',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center'
              }}>
                <i className="fa fa-info-circle" style={{ 
                  fontSize: '24px', 
                  marginRight: '12px', 
                  color: '#17a2b8' 
                }}></i>
                <span>
                  <strong>Termine scaduto:</strong> Non è più possibile segnalare errori per {getMonthName(selectedMonth)} {selectedYear}. 
                  <small className="d-block text-muted" style={{ marginTop: '4px' }}>
                    La segnalazione degli errori è consentita fino al 5 del mese successivo.
                  </small>
                </span>
              </div>
            )}
            <div className="table-responsive">
              <table id="timesheet-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Giorno</th>
                    <th>Totale Ore</th>
                    <th>Note</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center' }}>
                        Nessun giorno lavorativo in questo mese
                      </td>
                    </tr>
                  ) : (
                    data.map((entry) => (
                      <tr 
                        key={entry.date}
                        ref={el => rowRef && rowRef(entry.date, el)}
                        className={highlightedRow === entry.date ? 'error' : ''}
                      >
                        <td>{formatDate(entry.date)}</td>
                        <td>{entry.day}</td>
                        <td>{entry.total > 0 ? entry.total : '-'}</td>
                        <td>{entry.notes || '-'}</td>
                        <td>
                          <button 
                            className={`btn ${isErrorReportingEnabled ? 'btn-danger' : 'btn-outline-secondary'}`}
                            onClick={() => onReportError(entry.date)}
                            disabled={!isErrorReportingEnabled}
                            style={{
                              opacity: isErrorReportingEnabled ? '1' : '0.65',
                              cursor: isErrorReportingEnabled ? 'pointer' : 'not-allowed',
                              transition: 'all 0.3s ease',
                              position: 'relative'
                            }}
                            title={isErrorReportingEnabled ? 'Segnala un errore per questa data' : 'Termine di segnalazione scaduto'}
                          >
                            {isErrorReportingEnabled ? (
                              'Segnala Errore'
                            ) : (
                              <>
                                <i className="fa fa-lock" style={{ marginRight: '5px', fontSize: '12px' }}></i>
                                Segnalazione chiusa
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold' }}>Totale Ore:</td>
                    <td style={{ fontWeight: 'bold' }}>{calculateTotalHours()}</td>
                    <td colSpan="2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TimesheetTable;
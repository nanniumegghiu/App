import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

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
        console.log(`TimesheetTable: Caricamento timesheet per month=${selectedMonth}, year=${selectedYear}`);
        
        // Normalizza il mese (rimuovi eventuali prefissi e zeri iniziali)
        const normalizedMonth = selectedMonth.toString().replace(/^prev-/, '').replace(/^0+/, '');
        
        console.log(`TimesheetTable: Mese normalizzato=${normalizedMonth}`);
        
        // Prova prima a cercare con il mese senza zero iniziale
        let docId = `${auth.currentUser.uid}_${normalizedMonth}_${selectedYear}`;
        console.log(`TimesheetTable: Tentativo 1 - docId=${docId}`);
        
        // Recupera direttamente il documento dalla collezione workHours
        const docRef = doc(db, "workHours", docId);
        const docSnap = await getDoc(docRef);
        
        // Se non trova il documento, prova con il mese con zero iniziale
        let entriesData = null;
        
        if (docSnap.exists()) {
          console.log(`TimesheetTable: Documento trovato con ID ${docId}`);
          const data = docSnap.data();
          
          if (data.entries && Array.isArray(data.entries)) {
            entriesData = data.entries;
          }
        } else {
          // Prova con il mese con zero iniziale (es. "04" invece di "4")
          const formattedMonth = normalizedMonth.length === 1 ? normalizedMonth.padStart(2, '0') : normalizedMonth;
          const altDocId = `${auth.currentUser.uid}_${formattedMonth}_${selectedYear}`;
          
          console.log(`TimesheetTable: Tentativo 2 - altDocId=${altDocId}`);
          
          if (altDocId !== docId) {
            const altDocRef = doc(db, "workHours", altDocId);
            const altDocSnap = await getDoc(altDocRef);
            
            if (altDocSnap.exists()) {
              console.log(`TimesheetTable: Documento alternativo trovato con ID ${altDocId}`);
              const altData = altDocSnap.data();
              
              if (altData.entries && Array.isArray(altData.entries)) {
                entriesData = altData.entries;
              }
            }
          }
          
          if (!entriesData) {
            // Se entrambi i tentativi falliscono, prova con una query più generica
            console.log(`TimesheetTable: Tentativo 3 - Query generale`);
            const workHoursRef = collection(db, "workHours");
            const q = query(
              workHoursRef, 
              where("userId", "==", auth.currentUser.uid),
              where("year", "==", selectedYear)
            );
            
            const querySnapshot = await getDocs(q);
            console.log(`TimesheetTable: Query generale ha trovato ${querySnapshot.size} documenti`);
            
            if (!querySnapshot.empty) {
              // Cerca un documento che potrebbe corrispondere al mese
              for (const doc of querySnapshot.docs) {
                const data = doc.data();
                console.log(`TimesheetTable: Documento trovato con month=${data.month}, confronto con ${normalizedMonth} o ${normalizedMonth.padStart(2, '0')}`);
                
                // Normalizza entrambi i mesi per il confronto
                const docMonth = data.month.toString().replace(/^0+/, '');
                
                if (docMonth === normalizedMonth) {
                  console.log(`TimesheetTable: Corrispondenza trovata`);
                  if (data.entries && Array.isArray(data.entries)) {
                    entriesData = data.entries;
                    break;
                  }
                }
              }
            }
          }
        }
        
        if (entriesData) {
          console.log(`TimesheetTable: Dati trovati - ${entriesData.length} entries`);
          // Ordina le entries per data
          const sortedEntries = [...entriesData].sort((a, b) => {
            return new Date(a.date) - new Date(b.date);
          });
          setData(sortedEntries);
        } else {
          console.log(`TimesheetTable: Nessun dato trovato, generando giorni completi (inclusi weekend)`);
          // Generare giorni completi, inclusi weekend
          const month = parseInt(normalizedMonth);
          const emptyEntries = generateCompleteMonthDays(month, parseInt(selectedYear));
          setData(emptyEntries);
        }
        
        setError(null);
      } catch (err) {
        console.error("TimesheetTable: Errore nel caricamento timesheet:", err);
        setError("Impossibile caricare le ore lavorative. Riprova più tardi.");
        const normalizedMonth = selectedMonth.toString().replace(/^prev-/, '').replace(/^0+/, '');
        const month = parseInt(normalizedMonth);
        const emptyEntries = generateCompleteMonthDays(month, parseInt(selectedYear));
        setData(emptyEntries);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTimesheet();
  }, [selectedMonth, selectedYear]);

  // Funzione per generare tutti i giorni di un mese, inclusi weekend
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
        total: 0,
        notes: "",
        isWeekend: isWeekend // Aggiungiamo questa proprietà per identificare il weekend
      });
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
    // Rimuovi eventuali prefissi e zeri iniziali
    const normalizedMonth = monthValue.toString().replace(/^prev-/, '').replace(/^0+/, '');
    const monthIndex = parseInt(normalizedMonth) - 1;
    return months[monthIndex] || '';
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

  // Componente di legenda per le lettere speciali
  const TimesheetLegend = () => {
    return (
      <div className="timesheet-legend" style={{ 
        marginBottom: '15px',
        padding: '10px',
        backgroundColor: '#f8f9fa',
        borderRadius: '5px',
        fontSize: '0.9rem'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Legenda:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>M</span> - Malattia
          </div>
          <div>
            <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>P</span> - Permesso
          </div>
          <div>
            <span style={{ color: '#000000', fontWeight: 'bold' }}>A</span> - Assenza
          </div>
          <div>
            <span>8</span> - Ore lavorate
          </div>
        </div>
      </div>
    );
  };

  // Funzione per formattare e colorare il valore delle ore o stato
  const formatTotalValue = (total) => {
    // Gestisci le lettere speciali
    if (total === "M") {
      return <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>M (Malattia)</span>;
    } else if (total === "P") {
      return <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>P (Permesso)</span>;
    } else if (total === "A") {
      return <span style={{ color: '#000000', fontWeight: 'bold' }}>A (Assenza)</span>;
    } else if (total > 0) {
      // Per i valori numerici positivi
      return total;
    } else {
      // Per valori zero o non validi
      return '-';
    }
  };

  // Calcola il totale delle ore, escludendo le lettere speciali
  const calculateTotalHours = () => {
    return data.reduce((total, entry) => {
      // Se il valore è una lettera speciale, non sommare
      if (["M", "P", "A"].includes(entry.total)) {
        return total;
      }
      return total + (parseInt(entry.total) || 0);
    }, 0);
  };

  // Controlla se è possibile segnalare errori (prima del giorno 5 del mese successivo)
  const canReportError = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // getMonth() restituisce 0-11
    const currentDay = today.getDate();
    
    // Normalizza il mese selezionato
    const normalizedMonth = selectedMonth.toString().replace(/^prev-/, '').replace(/^0+/, '');
    const selectedMonthNum = parseInt(normalizedMonth);
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
            
            {/* Aggiungi la legenda solo se ci sono dati */}
            {data.length > 0 && <TimesheetLegend />}
            
            <div className="table-responsive">
              <table id="timesheet-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Giorno</th>
                    <th>Totale Ore / Stato</th>
                    <th>Note</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center' }}>
                        Nessun giorno in questo mese
                      </td>
                    </tr>
                  ) : (
                    data.map((entry) => (
                      <tr 
                        key={entry.date}
                        ref={el => rowRef && rowRef(entry.date, el)}
                        className={`${highlightedRow === entry.date ? 'error' : ''} ${entry.isWeekend ? 'weekend-row' : ''}`}
                      >
                        <td>{formatDate(entry.date)}</td>
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
                        <td>{formatTotalValue(entry.total)}</td>
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
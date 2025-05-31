// src/components/TimesheetTable.jsx - Versione con evidenziazione festività
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getDayInfo, getMonthHolidays } from '../utils/holidaysUtils';

// Funzione per ottenere l'anno corrente
const getCurrentYear = () => {
  return new Date().getFullYear().toString();
};

const TimesheetTable = ({ 
  selectedMonth, 
  onReportError, 
  highlightedRow, 
  rowRef,
  selectedYear = getCurrentYear() 
}) => {
  const [data, setData] = useState([]);
  const [monthHolidays, setMonthHolidays] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Carica le festività quando cambiano mese/anno
  useEffect(() => {
    if (selectedMonth && selectedYear) {
      const normalizedMonth = parseInt(selectedMonth.toString().replace(/^prev-/, '').replace(/^0+/, ''));
      const yearInt = parseInt(selectedYear);
      const holidays = getMonthHolidays(normalizedMonth, yearInt);
      setMonthHolidays(holidays);
      console.log(`Festività trovate per ${normalizedMonth}/${yearInt}:`, holidays);
    }
  }, [selectedMonth, selectedYear]);

  // Funzione per generare tutti i giorni del mese con info festività
  const generateCompleteMonth = (month, year) => {
    const normalizedMonth = parseInt(month.toString().replace(/^prev-/, '').replace(/^0+/, ''));
    const normalizedYear = parseInt(year);
    
    const daysInMonth = new Date(normalizedYear, normalizedMonth, 0).getDate();
    const entries = [];
    const dayNames = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${normalizedYear}-${normalizedMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      const dayInfo = getDayInfo(dateStr);
      
      entries.push({
        date: dateStr,
        day: dayNames[dayInfo.dayOfWeek],
        total: 0,
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
    
    return entries.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  // Carica i dati delle ore quando cambia il mese selezionato
  useEffect(() => {
    const fetchTimesheet = async () => {
      if (!selectedMonth || !auth.currentUser) return;
      
      setIsLoading(true);
      try {
        console.log(`TimesheetTable: Caricamento timesheet per month=${selectedMonth}, year=${selectedYear}`);
        
        const normalizedMonth = selectedMonth.toString().replace(/^prev-/, '').replace(/^0+/, '');
        console.log(`TimesheetTable: Mese normalizzato=${normalizedMonth}`);
        
        const completeMonthData = generateCompleteMonth(normalizedMonth, selectedYear);
        
        let existingData = null;
        
        // Tentativo 1: ID documento senza zero iniziale
        let docId = `${auth.currentUser.uid}_${normalizedMonth}_${selectedYear}`;
        console.log(`TimesheetTable: Tentativo 1 - docId=${docId}`);
        
        const docRef = doc(db, "workHours", docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          console.log(`TimesheetTable: Documento trovato con ID ${docId}`);
          const data = docSnap.data();
          if (data.entries && Array.isArray(data.entries)) {
            existingData = data.entries;
          }
        } else {
          // Tentativo 2: ID documento con zero iniziale
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
                existingData = altData.entries;
              }
            }
          }
          
          // Tentativo 3: Query generale se i tentativi precedenti falliscono
          if (!existingData) {
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
              for (const doc of querySnapshot.docs) {
                const data = doc.data();
                console.log(`TimesheetTable: Documento trovato con month=${data.month}, confronto con ${normalizedMonth}`);
                
                const docMonth = data.month.toString().replace(/^0+/, '');
                if (docMonth === normalizedMonth) {
                  console.log(`TimesheetTable: Corrispondenza trovata`);
                  if (data.entries && Array.isArray(data.entries)) {
                    existingData = data.entries;
                    break;
                  }
                }
              }
            }
          }
        }
        
        // Merge dei dati esistenti con il calendario completo
        if (existingData && existingData.length > 0) {
          console.log(`TimesheetTable: Merge di ${existingData.length} entries esistenti`);
          
          const existingDataMap = {};
          existingData.forEach(entry => {
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
          
          setData(mergedData);
        } else {
          console.log(`TimesheetTable: Nessun dato esistente, usando calendario vuoto`);
          setData(completeMonthData);
        }
        
        setError(null);
      } catch (err) {
        console.error("TimesheetTable: Errore nel caricamento timesheet:", err);
        setError("Impossibile caricare le ore lavorative. Riprova più tardi.");
        
        const normalizedMonth = selectedMonth.toString().replace(/^prev-/, '').replace(/^0+/, '');
        const completeMonthData = generateCompleteMonth(normalizedMonth, selectedYear);
        setData(completeMonthData);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTimesheet();
  }, [selectedMonth, selectedYear]);

  // Ottieni il nome del mese dalla selezione
  const getMonthName = (monthValue) => {
    const months = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", 
      "Maggio", "Giugno", "Luglio", "Agosto", 
      "Settembre", "Ottobre", "Novembre", "Dicembre"
    ];
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

  // Ottiene la classe CSS per la riga in base al tipo di giorno
  const getRowClass = (entry) => {
    const classes = [];
    
    if (highlightedRow === entry.date) {
      classes.push('error');
    }
    
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

  // Componente di legenda per le lettere speciali e le ore
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
            <span style={{ color: '#9b59b6', fontWeight: 'bold' }}>F</span> - Ferie
          </div>
          <div>
            <span style={{ color: '#000000', fontWeight: 'bold' }}>A</span> - Assenza
          </div>
          <div>
            <span>8</span> - Ore standard (max)
          </div>
          <div>
            <span style={{ color: '#3498db' }}>2</span> - Ore straordinario (max 12)
          </div>
          <div>
            <span style={{ backgroundColor: '#f8f9fa', padding: '2px 4px', borderRadius: '3px' }}>Grigio</span> - Weekend
          </div>
          <div>
            <span style={{ backgroundColor: '#fff3cd', padding: '2px 4px', borderRadius: '3px', borderLeft: '3px solid #f0ad4e' }}>Giallo</span> - Festività
          </div>
        </div>
      </div>
    );
  };

  // Funzione per formattare e colorare il valore delle ore o stato
  const formatTotalWithOvertime = (total, overtime, hasData) => {
    // Gestisci le lettere speciali
    if (total === "M") {
      return <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>M (Malattia)</span>;
    } else if (total === "P") {
      return <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>P (Permesso)</span>;
    } else if (total === "F") {
      return <span style={{ color: '#9b59b6', fontWeight: 'bold' }}>F (Ferie)</span>;
    } else if (total === "A") {
      return <span style={{ color: '#000000', fontWeight: 'bold' }}>A (Assenza)</span>;
    } else {
      // Per i giorni senza dati, mostra solo trattini
      if (!hasData && total === 0 && overtime === 0) {
        return (
          <div style={{ color: '#999', fontStyle: 'italic' }}>
            <div>-</div>
          </div>
        );
      }
      
      // Prepara una visualizzazione completa delle ore
      const standardHours = total > 0 ? total : '-';
      const overtimeHours = overtime > 0 ? overtime : '-';
      
      return (
        <div>
          <div>{standardHours}</div>
          {overtime > 0 && (
            <div style={{ color: '#3498db', fontWeight: 'bold', fontSize: '0.9em' }}>
              +{overtimeHours} straord.
            </div>
          )}
        </div>
      );
    }
  };

  // Calcola il totale delle ore, incluse le ore di straordinario
  const calculateTotalHours = () => {
    const standardHours = data.reduce((total, entry) => {
      if (["M", "P", "F", "A"].includes(entry.total)) {
        return total;
      }
      return total + (parseInt(entry.total) || 0);
    }, 0);
    
    const overtimeHours = data.reduce((total, entry) => {
      if (!["M", "P", "F", "A"].includes(entry.total)) {
        return total + (parseInt(entry.overtime) || 0);
      }
      return total;
    }, 0);
    
    return { standardHours, overtimeHours, totalHours: standardHours + overtimeHours };
  };

  // Controlla se è possibile segnalare errori (prima del giorno 5 del mese successivo)
  const canReportError = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();
    
    const normalizedMonth = selectedMonth.toString().replace(/^prev-/, '').replace(/^0+/, '');
    const selectedMonthNum = parseInt(normalizedMonth);
    const selectedYearNum = parseInt(selectedYear);
    
    let nextMonth = selectedMonthNum + 1;
    let nextYear = selectedYearNum;
    
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    
    if (
      (currentYear > nextYear) || 
      (currentYear === nextYear && currentMonth > nextMonth) ||
      (currentYear === nextYear && currentMonth === nextMonth && currentDay > 5)
    ) {
      return false;
    }
    
    return true;
  };

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
            
            <TimesheetLegend />
            
            <div className="table-responsive">
              <table id="timesheet-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Giorno</th>
                    <th>Ore Lavorate / Stato</th>
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
                        className={getRowClass(entry)}
                        style={getRowStyle(entry)}
                      >
                        <td>{formatDate(entry.date)}</td>
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
                        <td>{formatTotalWithOvertime(entry.total, entry.overtime, entry.hasData)}</td>
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
                    <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold' }}>Totale Ore Standard:</td>
                    <td style={{ fontWeight: 'bold' }}>{calculateTotalHours().standardHours}</td>
                    <td colSpan="2"></td>
                  </tr>
                  <tr>
                    <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold' }}>Totale Straordinario:</td>
                    <td style={{ fontWeight: 'bold', color: '#3498db' }}>{calculateTotalHours().overtimeHours}</td>
                    <td colSpan="2"></td>
                  </tr>
                  <tr>
                    <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold' }}>Totale Complessivo:</td>
                    <td style={{ fontWeight: 'bold' }}>{calculateTotalHours().totalHours}</td>
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
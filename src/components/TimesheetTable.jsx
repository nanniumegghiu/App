// src/components/TimesheetTable.jsx - Versione con indicatori di sincronizzazione richieste
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Funzione per generare tutti i giorni del mese
  const generateCompleteMonth = (month, year) => {
    const normalizedMonth = parseInt(month.toString().replace(/^prev-/, '').replace(/^0+/, ''));
    const normalizedYear = parseInt(year);
    
    const daysInMonth = new Date(normalizedYear, normalizedMonth, 0).getDate();
    const entries = [];
    const dayNames = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(normalizedYear, normalizedMonth - 1, day);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      const dateStr = `${normalizedYear}-${normalizedMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      
      entries.push({
        date: dateStr,
        day: dayNames[dayOfWeek],
        total: 0, // Default vuoto
        overtime: 0, // Default vuoto
        notes: "",
        isWeekend: isWeekend,
        hasData: false // Flag per indicare se ha dati reali
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
        
        // Normalizza il mese
        const normalizedMonth = selectedMonth.toString().replace(/^prev-/, '').replace(/^0+/, '');
        console.log(`TimesheetTable: Mese normalizzato=${normalizedMonth}`);
        
        // Genera tutti i giorni del mese
        const completeMonthData = generateCompleteMonth(normalizedMonth, selectedYear);
        
        // Prova a caricare i dati esistenti
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
          
          // Crea una mappa dei dati esistenti per data
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
          
          // Merge con il calendario completo
          const mergedData = completeMonthData.map(dayEntry => {
            const existingEntry = existingDataMap[dayEntry.date];
            if (existingEntry) {
              return existingEntry;
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
        
        // In caso di errore, mostra comunque il calendario completo
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

  // Determina se una nota indica sincronizzazione automatica
  const isAutoSyncNote = (notes) => {
    if (!notes) return false;
    const lowerNotes = notes.toLowerCase();
    return lowerNotes.includes('approvata') || 
           lowerNotes.includes('ferie approvate') || 
           lowerNotes.includes('permesso approvato') || 
           lowerNotes.includes('malattia approvata');
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
            <span style={{ color: '#17a2b8' }}>🔄</span> - Inserimento automatico da richiesta approvata
          </div>
        </div>
      </div>
    );
  };

  // Funzione per formattare e colorare il valore delle ore o stato
  const formatTotalWithOvertime = (total, overtime, hasData, notes) => {
    const isAutoSync = isAutoSyncNote(notes);
    
    // Gestisci le lettere speciali
    if (total === "M") {
      return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>M (Malattia)</span>
          {isAutoSync && (
            <span 
              style={{ color: '#17a2b8', marginLeft: '6px', fontSize: '14px' }}
              title="Inserito automaticamente da richiesta approvata"
            >
              🔄
            </span>
          )}
        </div>
      );
    } else if (total === "P") {
      return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>P (Permesso)</span>
          {isAutoSync && (
            <span 
              style={{ color: '#17a2b8', marginLeft: '6px', fontSize: '14px' }}
              title="Inserito automaticamente da richiesta approvata"
            >
              🔄
            </span>
          )}
        </div>
      );
    } else if (total === "F") {
      return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ color: '#9b59b6', fontWeight: 'bold' }}>F (Ferie)</span>
          {isAutoSync && (
            <span 
              style={{ color: '#17a2b8', marginLeft: '6px', fontSize: '14px' }}
              title="Inserito automaticamente da richiesta approvata"
            >
              🔄
            </span>
          )}
        </div>
      );
    } else if (total === "A") {
      return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ color: '#000000', fontWeight: 'bold' }}>A (Assenza)</span>
          {isAutoSync && (
            <span 
              style={{ color: '#17a2b8', marginLeft: '6px', fontSize: '14px' }}
              title="Inserito automaticamente da richiesta approvata"
            >
              🔄
            </span>
          )}
        </div>
      );
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

  // Funzione per formattare le note con indicatore di sincronizzazione
  const formatNotesWithSync = (notes) => {
    if (!notes) return '-';
    
    const isAutoSync = isAutoSyncNote(notes);
    
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
        <span>{notes}</span>
        {isAutoSync && (
          <span 
            style={{ 
              color: '#17a2b8', 
              fontSize: '12px',
              flexShrink: 0
            }}
            title="Inserito automaticamente da richiesta approvata"
          >
            🔄
          </span>
        )}
      </div>
    );
  };

  // Calcola il totale delle ore, incluse le ore di straordinario
  const calculateTotalHours = () => {
    const standardHours = data.reduce((total, entry) => {
      // Se il valore è una lettera speciale, non sommare
      if (["M", "P", "F", "A"].includes(entry.total)) {
        return total;
      }
      return total + (parseInt(entry.total) || 0);
    }, 0);
    
    const overtimeHours = data.reduce((total, entry) => {
      // Somma solo le ore di straordinario per i giorni lavorati
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
            
            {/* Aggiungi la legenda */}
            <TimesheetLegend />
            
            {/* Info box sulla sincronizzazione automatica */}
            <div className="sync-info-notice" style={{
              backgroundColor: '#e8f5e8',
              border: '1px solid #c3e6c3',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '15px',
              fontSize: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '16px', marginRight: '8px' }}>🔄</span>
                <strong>Sincronizzazione Richieste Approvate</strong>
              </div>
              <p style={{ margin: 0, color: '#2d5a2d' }}>
                Le voci contrassegnate con il simbolo 🔄 sono state inserite automaticamente 
                quando le relative richieste di ferie/permessi/malattia sono state approvate dall'amministratore.
              </p>
            </div>
            
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
                        className={`${highlightedRow === entry.date ? 'error' : ''} ${entry.isWeekend ? 'weekend-row' : ''} ${!entry.hasData ? 'no-data-row' : ''} ${isAutoSyncNote(entry.notes) ? 'auto-sync-row' : ''}`}
                        style={{
                          ...((!entry.hasData) ? { backgroundColor: '#fafafa' } : {}),
                          ...(isAutoSyncNote(entry.notes) ? { backgroundColor: '#f0f8f0' } : {})
                        }}
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
                        <td>{formatTotalWithOvertime(entry.total, entry.overtime, entry.hasData, entry.notes)}</td>
                        <td>{formatNotesWithSync(entry.notes)}</td>
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
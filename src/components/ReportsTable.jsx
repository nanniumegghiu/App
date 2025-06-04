import React from 'react';
import './reportsTable.css';

const ReportsTable = ({ reports, selectedMonth, selectedYear, isLoading }) => {
  // Funzione per formattare la data
  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    let date;
    
    // Se è un timestamp di Firebase
    if (dateString && typeof dateString.toDate === 'function') {
      date = dateString.toDate();
    }
    // Se è già un oggetto Date
    else if (dateString instanceof Date) {
      date = dateString;
    }
    // Se è una stringa
    else if (typeof dateString === 'string') {
      // Se è già in formato italiano (DD/MM/YYYY)
      if (dateString.includes('/')) {
        return dateString;
      }
      
      // Se è in formato ISO (YYYY-MM-DD)
      const parts = dateString.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      
      // Prova a parsare come data
      date = new Date(dateString);
    }
    // Per altri tipi, prova la conversione
    else {
      date = new Date(dateString);
    }
    
    // Se abbiamo un oggetto Date valido, formattalo
    if (date && !isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }
    
    // Fallback: restituisci il valore originale convertito in stringa
    return String(dateString);
  };

  // Funzione per determinare la classe di colore in base allo stato
  const getStatusClass = (status) => {
    switch (status) {
      case "Conclusa":
        return "text-success";
      case "Presa in carico":
        return "text-warning";
      case "In attesa":
        return "text-danger";
      default:
        return "";
    }
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

  // Numero di report visualizzati
  const reportCount = reports?.length || 0;

  return (
    <div className="card">
      <div className="card-header">
        <div>Stato Segnalazioni - {getMonthName(selectedMonth)} {selectedYear}</div>
        {!isLoading && reportCount > 0 && <div>({reportCount})</div>}
      </div>
      <div className="card-body">
        {isLoading ? (
          <div className="text-center">
            <p>Caricamento segnalazioni in corso...</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table id="reports-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrizione</th>
                  <th>Stato</th>
                  <th>Note Admin</th>
                  <th>Ultima modifica</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center' }}>
                      Nessuna segnalazione per {getMonthName(selectedMonth)} {selectedYear}
                    </td>
                  </tr>
                ) : (
                  reports.map((report, index) => (
                    <tr key={report.id || index}>
                      <td>{formatDate(report.date)}</td>
                      <td>{report.description}</td>
                      <td className={getStatusClass(report.status)}>
                        {report.status}
                      </td>
                      <td>
                        {report.adminNotes ? (
                          <div style={{
                            backgroundColor: '#e8f5e8',
                            border: '1px solid #c3e6c3',
                            borderRadius: '4px',
                            padding: '8px',
                            margin: '2px 0'
                          }}>
                            <div style={{ 
                              fontWeight: 'bold', 
                              fontSize: '0.9em',
                              color: '#2d5a2d',
                              marginBottom: '4px'
                            }}>
                              📝 Risposta dell'amministratore:
                            </div>
                            <div style={{ 
                              fontSize: '0.9em',
                              color: '#2d5a2d'
                            }}>
                              {report.adminNotes}
                            </div>
                            {report.adminNotesDate && (
                              <div style={{ 
                                fontSize: '0.75em', 
                                color: '#6c757d', 
                                fontStyle: 'italic',
                                marginTop: '4px'
                              }}>
                                {formatDate(report.adminNotesDate)}
                              </div>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>{formatDate(report.lastUpdate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsTable;
import React from 'react';

const ReportsTable = ({ reports, selectedMonth, selectedYear, isLoading }) => {
  // Funzione per formattare la data
  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    // Se è un oggetto Date, convertilo in stringa
    if (dateString instanceof Date) {
      const day = String(dateString.getDate()).padStart(2, '0');
      const month = String(dateString.getMonth() + 1).padStart(2, '0');
      const year = dateString.getFullYear();
      return `${day}/${month}/${year}`;
    }
    
    // Se è già in formato italiano (DD/MM/YYYY)
    if (dateString.includes('/')) {
      return dateString;
    }
    
    // Se è in formato ISO (YYYY-MM-DD)
    const parts = dateString.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    
    return dateString;
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
    return months[parseInt(monthValue) - 1];
  };

  return (
    <div className="card">
      <div className="card-header">Stato Segnalazioni - {getMonthName(selectedMonth)} {selectedYear}</div>
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
                  <th>Ultima modifica</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center' }}>
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
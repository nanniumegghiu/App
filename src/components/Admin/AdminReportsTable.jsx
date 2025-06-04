// src/components/Admin/AdminReportsTable.jsx
import React, { useState } from 'react';
import { updateReportStatus } from '../../firebase';

const AdminReportsTable = ({ reports, onStatusChange }) => {
  const [updatingId, setUpdatingId] = useState(null);

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
  
  // Gestisce il cambio di stato di una segnalazione
  const handleStatusChange = async (reportId, newStatus) => {
    if (updatingId) return; // Evita azioni multiple contemporanee
    
    setUpdatingId(reportId);
    console.log(`Tentativo di aggiornare stato del report ${reportId} a ${newStatus}`);
    
    try {
      // Chiama la funzione del componente padre per aggiornare lo stato
      await onStatusChange(reportId, newStatus);
      console.log("Stato aggiornato con successo");
    } catch (error) {
      console.error("Errore nell'aggiornamento dello stato:", error);
      alert("Si è verificato un errore durante l'aggiornamento dello stato. Riprova.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Utente</th>
            <th>Descrizione</th>
            <th>Stato</th>
            <th>Ultima modifica</th>
            <th>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {reports.length === 0 ? (
            <tr>
              <td colSpan="6" style={{ textAlign: 'center' }}>
                Nessuna segnalazione trovata
              </td>
            </tr>
          ) : (
            reports.map((report) => (
              <tr key={report.id}>
                <td>{formatDate(report.date)}</td>
                <td>{report.userName || report.userEmail}</td>
                <td>{report.description}</td>
                <td className={getStatusClass(report.status)}>
                  {report.status}
                </td>
                <td>{formatDate(report.lastUpdate)}</td>
                <td>
                  <select 
                    value={report.status} 
                    onChange={(e) => handleStatusChange(report.id, e.target.value)}
                    className="form-control"
                    disabled={updatingId === report.id}
                  >
                    <option value="In attesa">In attesa</option>
                    <option value="Presa in carico">Presa in carico</option>
                    <option value="Conclusa">Conclusa</option>
                  </select>
                  {updatingId === report.id && <span className="ml-2">Aggiornamento...</span>}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default AdminReportsTable;
// src/components/Admin/AdminWorkHoursTable.jsx
import React from 'react';
import { formatDate, formatTimestamp } from '../../utils/dateUtils';

const AdminWorkHoursTable = ({ workHours, onEditWorkHours }) => {
  // Funzione per ottenere il nome dell'utente se disponibile
  const getUserDisplayName = (entry) => {
    if (entry.userNome && entry.userCognome) {
      return `${entry.userNome} ${entry.userCognome}`;
    }
    return entry.userEmail || entry.userId || 'Utente sconosciuto';
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>Registro Ore Lavorative ({workHours.length})</div>
      </div>
      <div className="card-body">
        {workHours.length === 0 ? (
          <p>Nessuna ora lavorativa registrata con i filtri applicati.</p>
        ) : (
          <div className="table-responsive">
            <table id="admin-work-hours-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Giorno</th>
                  <th>Utente</th>
                  <th>Totale Ore</th>
                  <th>Note</th>
                  <th>Ultima modifica</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {workHours.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.date)}</td>
                    <td>{entry.day || 'N/A'}</td>
                    <td>{getUserDisplayName(entry)}</td>
                    <td>{entry.totalHours || '0'}</td>
                    <td>{entry.notes || '-'}</td>
                    <td>{formatTimestamp(entry.lastUpdate)}</td>
                    <td>
                      <button 
                        className="btn btn-primary btn-sm" 
                        onClick={() => onEditWorkHours(entry)}
                      >
                        Modifica
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminWorkHoursTable;
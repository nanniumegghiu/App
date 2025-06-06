// src/components/Admin/AdminReportsTable.jsx - Con form note per segnalazioni
import React, { useState } from 'react';
import { updateReportStatus, db } from '../../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const AdminReportsTable = ({ reports, onStatusChange }) => {
  const [updatingId, setUpdatingId] = useState(null);
  const [showNotesForm, setShowNotesForm] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [newStatus, setNewStatus] = useState('');

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
  
  // Gestisce il cambio di stato di una segnalazione con controllo per note
  const handleStatusChange = async (reportId, targetStatus) => {
    if (updatingId) return; // Evita azioni multiple contemporanee
    
    // Se il nuovo stato è "Conclusa", mostra il form per le note
    if (targetStatus === "Conclusa") {
      const report = reports.find(r => r.id === reportId);
      setSelectedReport(report);
      setNewStatus(targetStatus);
      setAdminNotes(''); // Reset note
      setShowNotesForm(true);
      return;
    }
    
    // Per altri stati, procedi direttamente
    await processStatusUpdate(reportId, targetStatus, '');
  };

  // Processa l'aggiornamento dello stato
  const processStatusUpdate = async (reportId, status, notes = '') => {
    setUpdatingId(reportId);
    console.log(`Tentativo di aggiornare stato del report ${reportId} a ${status} con note: "${notes}"`);
    
    try {
      // Aggiorna nel database con le note
      await updateReportStatusWithNotes(reportId, status, notes);
      
      // Chiama la funzione del componente padre per aggiornare lo stato locale
      await onStatusChange(reportId, status, notes);
      console.log("Stato e note aggiornati con successo");
    } catch (error) {
      console.error("Errore nell'aggiornamento dello stato:", error);
      alert("Si è verificato un errore durante l'aggiornamento dello stato. Riprova.");
    } finally {
      setUpdatingId(null);
    }
  };

  // Funzione per aggiornare lo stato del report con note
  const updateReportStatusWithNotes = async (reportId, status, notes) => {
    try {
      console.log(`updateReportStatusWithNotes: Aggiornamento reportId=${reportId} a ${status} con note="${notes}"`);
      
      if (!reportId) throw new Error("reportId è obbligatorio");
      if (!status) throw new Error("status è obbligatorio");
      
      // USA DIRETTAMENTE updateReportStatus da firebase.js
      // che già gestisce correttamente old/new status e notifiche
      await updateReportStatus(reportId, status, notes);
      
      console.log(`updateReportStatusWithNotes: Stato aggiornato con successo a ${status}`);
      return true;
    } catch (error) {
      console.error(`updateReportStatusWithNotes: Errore nell'aggiornamento dello stato:`, error);
      throw error;
    }
  };
  

  // Gestisce l'invio del form con le note
  const handleNotesSubmit = async () => {
    if (!selectedReport || !newStatus) return;
    
    await processStatusUpdate(selectedReport.id, newStatus, adminNotes);
    
    // Chiudi il form
    setShowNotesForm(false);
    setSelectedReport(null);
    setAdminNotes('');
    setNewStatus('');
  };

  // Chiude il form delle note senza salvare
  const handleNotesCancel = () => {
    setShowNotesForm(false);
    setSelectedReport(null);
    setAdminNotes('');
    setNewStatus('');
  };

  return (
    <>
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Utente</th>
              <th>Descrizione</th>
              <th>Stato</th>
              <th>Note Admin</th>
              <th>Ultima modifica</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center' }}>
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
                  <td>
                    {report.adminNotes ? (
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9em' }}>
                          {report.adminNotes}
                        </div>
                        {report.adminNotesDate && (
                          <div style={{ fontSize: '0.8em', color: '#666', fontStyle: 'italic' }}>
                            {formatDate(report.adminNotesDate)}
                          </div>
                        )}
                      </div>
                    ) : (
                      '-'
                    )}
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

      {/* Modal per le note dell'admin */}
      {showNotesForm && selectedReport && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            width: '90%',
            maxWidth: '600px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            <div className="modal-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              paddingBottom: '15px',
              borderBottom: '1px solid #eee'
            }}>
              <h4 style={{ margin: 0 }}>Conclusione Segnalazione</h4>
              <button 
                onClick={handleNotesCancel}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#999'
                }}
              >
                &times;
              </button>
            </div>
            
            <div className="modal-body">
              <div className="report-info" style={{
                backgroundColor: '#f8f9fa',
                padding: '15px',
                borderRadius: '5px',
                marginBottom: '20px'
              }}>
                <h5>Dettagli Segnalazione:</h5>
                <p><strong>Data:</strong> {formatDate(selectedReport.date)}</p>
                <p><strong>Utente:</strong> {selectedReport.userName || selectedReport.userEmail}</p>
                <p><strong>Descrizione:</strong> {selectedReport.description}</p>
              </div>
              
              <div className="form-group">
                <label htmlFor="admin-notes" style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 'bold'
                }}>
                  Note per l'utente (opzionale):
                </label>
                <textarea
                  id="admin-notes"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Inserisci le note per informare l'utente sulle operazioni effettuate (es. 'Ore corrette: ingresso modificato dalle 8:00 alle 8:30')"
                  rows="4"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
                <small style={{ color: '#666', fontSize: '12px' }}>
                  Queste note saranno visibili all'utente e lo informeranno delle correzioni effettuate.
                </small>
              </div>
            </div>
            
            <div className="modal-footer" style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '20px',
              paddingTop: '15px',
              borderTop: '1px solid #eee'
            }}>
              <button 
                onClick={handleNotesCancel}
                className="btn btn-secondary"
                style={{
                  padding: '8px 16px',
                  border: '1px solid #6c757d',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Annulla
              </button>
              <button 
                onClick={handleNotesSubmit}
                className="btn btn-success"
                disabled={updatingId === selectedReport?.id}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #28a745',
                  backgroundColor: '#28a745',
                  color: 'white',
                  borderRadius: '4px',
                  cursor: updatingId === selectedReport?.id ? 'not-allowed' : 'pointer',
                  opacity: updatingId === selectedReport?.id ? 0.6 : 1
                }}
              >
                {updatingId === selectedReport?.id ? 'Aggiornamento...' : 'Conclude Segnalazione'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminReportsTable;
// src/components/Admin/AdminLeaveRequests.jsx - Aggiornato con eliminazione e desincronizzazione
import React, { useState, useEffect } from 'react';
import { 
  getAllLeaveRequests, 
  updateLeaveRequestStatusWithSync, 
  deleteApprovedRequestWithDesync 
} from '../../firebase';
import Notification from '../Notification';

const AdminLeaveRequests = () => {
  const [requests, setRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: 'success'
  });
  
  // Filtri
  const [filters, setFilters] = useState({
    status: '',
    type: '',
    dateFrom: '',
    dateTo: ''
  });
  
  // Stato per la gestione del form delle note
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [showNotesForm, setShowNotesForm] = useState(false);
  const [processingRequest, setProcessingRequest] = useState(false);
  
  // Stato per la gestione dell'eliminazione
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Carica tutte le richieste al montaggio del componente
  useEffect(() => {
    const fetchRequests = async () => {
      setIsLoading(true);
      try {
        const allRequests = await getAllLeaveRequests();
        setRequests(allRequests);
        setFilteredRequests(allRequests);
        setError(null);
      } catch (err) {
        console.error("Errore nel caricamento delle richieste:", err);
        setError("Impossibile caricare le richieste. Riprova più tardi.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequests();
  }, []);
  
  // Applica i filtri quando cambiano
  useEffect(() => {
    // Copia le richieste originali
    let result = [...requests];
    
    // Filtra per status
    if (filters.status) {
      result = result.filter(request => request.status === filters.status);
    }
    
    // Filtra per tipo
    if (filters.type) {
      result = result.filter(request => request.type === filters.type);
    }
    
    // Filtra per data di inizio
    if (filters.dateFrom) {
      const dateFrom = new Date(filters.dateFrom);
      result = result.filter(request => {
        const requestDate = new Date(request.dateFrom);
        return requestDate >= dateFrom;
      });
    }
    
    // Filtra per data di fine
    if (filters.dateTo) {
      const dateTo = new Date(filters.dateTo);
      result = result.filter(request => {
        const requestDate = new Date(request.dateFrom);
        return requestDate <= dateTo;
      });
    }
    
    setFilteredRequests(result);
  }, [filters, requests]);
  
  // Gestisce il cambio nei filtri
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Resetta i filtri
  const resetFilters = () => {
    setFilters({
      status: '',
      type: '',
      dateFrom: '',
      dateTo: ''
    });
  };
  
  // Mostra il form delle note per la richiesta selezionata
  const showNotes = (request, defaultStatus) => {
    setSelectedRequest({
      ...request,
      defaultStatus
    });
    setAdminNotes(request.adminNotes || '');
    setShowNotesForm(true);
  };
  
  // Gestisce l'approvazione/rifiuto di una richiesta con sincronizzazione
  const handleRequestAction = async (approve = true) => {
    if (!selectedRequest) return;
    
    setProcessingRequest(true);
    
    try {
      const newStatus = approve ? 'approved' : 'rejected';
      
      console.log(`${approve ? 'Approvazione' : 'Rifiuto'} richiesta:`, selectedRequest);
      
      // Mostra notifica di elaborazione
      if (approve) {
        setNotification({
          show: true,
          message: 'Approvazione in corso... sincronizzazione con calendario ore',
          type: 'info'
        });
      }
      
      // Aggiorna lo stato della richiesta con sincronizzazione automatica
      const updatedRequest = await updateLeaveRequestStatusWithSync(
        selectedRequest.id, 
        newStatus, 
        adminNotes
      );
      
      console.log('Richiesta aggiornata:', updatedRequest);
      
      // Aggiorna la lista delle richieste
      setRequests(prevRequests => 
        prevRequests.map(req => 
          req.id === updatedRequest.id ? updatedRequest : req
        )
      );
      
      // Chiudi il form delle note
      setShowNotesForm(false);
      setSelectedRequest(null);
      setAdminNotes('');
      
      // Prepara il messaggio di successo
      let successMessage = `Richiesta ${approve ? 'approvata' : 'rifiutata'} con successo`;
      
      // Se è stata approvata e c'è info sulla sincronizzazione, aggiungi dettagli
      if (approve && updatedRequest.syncInfo) {
        if (updatedRequest.syncInfo.syncResult) {
          const syncDetails = updatedRequest.syncInfo.syncDetails;
          if (syncDetails && syncDetails.letterCode) {
            successMessage += `\n✅ Calendario ore aggiornato automaticamente (${syncDetails.totalDates} date segnate con "${syncDetails.letterCode}")`;
          }
        } else {
          successMessage += '\n⚠️ Attenzione: errore nella sincronizzazione automatica del calendario ore. Aggiorna manualmente.';
        }
      }
      
      // Mostra notifica di successo
      setNotification({
        show: true,
        message: successMessage,
        type: 'success'
      });
      
      // Nascondi la notifica dopo 6 secondi (più tempo per leggere i dettagli)
      setTimeout(() => {
        setNotification(prev => ({ ...prev, show: false }));
      }, 6000);
      
    } catch (err) {
      console.error(`Errore nell'${approve ? 'approvazione' : 'rifiuto'} della richiesta:`, err);
      
      setNotification({
        show: true,
        message: `Errore nell'${approve ? 'approvazione' : 'rifiuto'} della richiesta: ${err.message}`,
        type: 'error'
      });
    } finally {
      setProcessingRequest(false);
    }
  };
  
  // Mostra la conferma di eliminazione
  const showDeleteConfirmation = (request) => {
    setRequestToDelete(request);
    setShowDeleteConfirm(true);
  };
  
  // Gestisce l'eliminazione di una richiesta approvata
  const handleDeleteRequest = async () => {
    if (!requestToDelete) return;
    
    setIsDeleting(true);
    
    try {
      console.log('Eliminazione richiesta approvata:', requestToDelete);
      
      // Mostra notifica di elaborazione
      setNotification({
        show: true,
        message: 'Eliminazione in corso... desincronizzazione dal calendario ore',
        type: 'info'
      });
      
      // Elimina la richiesta con desincronizzazione automatica
      const deleteResult = await deleteApprovedRequestWithDesync(requestToDelete.id);
      
      console.log('Richiesta eliminata:', deleteResult);
      
      // Rimuovi la richiesta dalla lista
      setRequests(prevRequests => 
        prevRequests.filter(req => req.id !== requestToDelete.id)
      );
      
      // Chiudi il dialog di conferma
      setShowDeleteConfirm(false);
      setRequestToDelete(null);
      
      // Prepara il messaggio di successo
      let successMessage = 'Richiesta eliminata con successo';
      
      if (deleteResult.desyncResult) {
        if (deleteResult.desyncResult.success) {
          successMessage += `\n✅ Calendario ore ripristinato automaticamente (${deleteResult.desyncResult.datesDesynchronized} date ripristinate)`;
        } else {
          successMessage += '\n⚠️ Attenzione: errore nella desincronizzazione automatica del calendario ore. Verifica manualmente.';
        }
      }
      
      // Mostra notifica di successo
      setNotification({
        show: true,
        message: successMessage,
        type: 'success'
      });
      
      // Nascondi la notifica dopo 6 secondi
      setTimeout(() => {
        setNotification(prev => ({ ...prev, show: false }));
      }, 6000);
      
    } catch (err) {
      console.error('Errore nell\'eliminazione della richiesta:', err);
      
      setNotification({
        show: true,
        message: `Errore nell'eliminazione della richiesta: ${err.message}`,
        type: 'error'
      });
    } finally {
      setIsDeleting(false);
    }
  };
  
  // Formatta la data in formato leggibile
  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };
  
  // Ottieni il nome del tipo di richiesta
  const getRequestTypeName = (type) => {
    switch (type) {
      case 'permission':
        return 'Permesso';
      case 'vacation':
        return 'Ferie';
      case 'sickness':
        return 'Malattia';
      default:
        return type;
    }
  };
  
  // Ottieni i dettagli della richiesta in base al tipo
const getRequestDetails = (request) => {
  let details = [];
  
  if (request.type === 'permission') {
    if (request.permissionType === 'daily') {
      details.push('Giornaliero');
    } else if (request.permissionType === 'hourly') {
      details.push('Orario');
      if (request.timeFrom && request.timeTo) {
        details.push(`${request.timeFrom} - ${request.timeTo}`);
      }
    } else if (request.permissionType === 'multi-day') {
      details.push('Multi-giorni');
      if (request.workingDaysCount) {
        details.push(`${request.workingDaysCount} giorni lavorativi`);
      } else if (request.dateFrom && request.dateTo) {
        const days = calculateWorkingDaysBetween(request.dateFrom, request.dateTo);
        details.push(`${days} giorni lavorativi`);
      }
    }
  } else if (request.type === 'vacation') {
    if (request.dateTo) {
      const days = calculateDaysBetween(request.dateFrom, request.dateTo);
      details.push(`${days} ${days === 1 ? 'giorno' : 'giorni'}`);
    }
  } else if (request.type === 'sickness') {
    details.push(`Protocollo: ${request.protocolCode}`);
    if (request.dateTo) {
      const days = calculateDaysBetween(request.dateFrom, request.dateTo);
      details.push(`${days} ${days === 1 ? 'giorno' : 'giorni'}`);
    }
  }
  
  return details.join(' • ');
};

// Aggiungi questa nuova funzione per calcolare i giorni lavorativi
const calculateWorkingDaysBetween = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let workingDays = 0;
  
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dayOfWeek = date.getDay();
    // Escludi sabato (6) e domenica (0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
  }
  
  return workingDays;
};
  
  // Calcola il numero di giorni tra due date
  const calculateDaysBetween = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Normalizza le date (rimuovi l'ora)
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    // Calcola la differenza in millisecondi
    const diffTime = Math.abs(end - start);
    
    // Converti in giorni e aggiungi 1 (per includere entrambi i giorni)
    return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };
  
  // Ottieni il nome dello stato della richiesta
  const getStatusName = (status) => {
    switch (status) {
      case 'pending':
        return 'In attesa';
      case 'approved':
        return 'Approvata';
      case 'rejected':
        return 'Rifiutata';
      default:
        return status;
    }
  };
  
  // Ottieni la classe CSS per lo stato
  const getStatusClass = (status) => {
    switch (status) {
      case 'pending':
        return 'status-pending';
      case 'approved':
        return 'status-approved';
      case 'rejected':
        return 'status-rejected';
      default:
        return '';
    }
  };
  
  // Funzione per ottenere l'icona di sincronizzazione
  const getSyncIcon = (request) => {
    if (request.status !== 'approved') return null;
    
    if (request.syncInfo) {
      if (request.syncInfo.syncResult) {
        return (
          <span 
            className="sync-icon success" 
            title={`Sincronizzato: ${request.syncInfo.syncMessage || 'Calendario ore aggiornato'}`}
            style={{ color: '#28a745', marginLeft: '8px', fontSize: '14px' }}
          >
            ✅
          </span>
        );
      } else {
        return (
          <span 
            className="sync-icon error" 
            title={`Errore sincronizzazione: ${request.syncInfo.syncError || 'Aggiornamento manuale richiesto'}`}
            style={{ color: '#dc3545', marginLeft: '8px', fontSize: '14px' }}
          >
            ⚠️
          </span>
        );
      }
    }
    
    return null;
  };
  
  return (
    <div className="admin-leave-requests">
      <h3>Gestione Richieste</h3>
      
      {notification.show && (
        <Notification
          message={notification.message}
          isVisible={notification.show}
          onClose={() => setNotification(prev => ({ ...prev, show: false }))}
          type={notification.type}
        />
      )}
      
      <div className="filters-container">
        <div className="filter-group">
          <label htmlFor="status-filter">Stato:</label>
          <select
            id="status-filter"
            name="status"
            value={filters.status}
            onChange={handleFilterChange}
          >
            <option value="">Tutti gli stati</option>
            <option value="pending">In attesa</option>
            <option value="approved">Approvate</option>
            <option value="rejected">Rifiutate</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="type-filter">Tipo:</label>
          <select
            id="type-filter"
            name="type"
            value={filters.type}
            onChange={handleFilterChange}
          >
            <option value="">Tutti i tipi</option>
            <option value="permission">Permessi</option>
            <option value="vacation">Ferie</option>
            <option value="sickness">Malattia</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="date-from-filter">Dal:</label>
          <input
            type="date"
            id="date-from-filter"
            name="dateFrom"
            value={filters.dateFrom}
            onChange={handleFilterChange}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="date-to-filter">Al:</label>
          <input
            type="date"
            id="date-to-filter"
            name="dateTo"
            value={filters.dateTo}
            onChange={handleFilterChange}
          />
        </div>

        <button
          className="btn btn-secondary"
          onClick={resetFilters}
        >
          Resetta filtri
        </button>
      </div>
      
      {/* Info box sulla sincronizzazione automatica */}
      <div className="sync-info-box" style={{
        backgroundColor: '#e8f5e8',
        border: '1px solid #c3e6c3',
        borderRadius: '6px',
        padding: '15px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '20px', marginRight: '10px' }}>🔄</span>
          <strong>Sincronizzazione Automatica Attiva</strong>
        </div>
        <p style={{ margin: 0, fontSize: '14px', color: '#2d5a2d' }}>
          Quando approvi una richiesta, le date verranno automaticamente segnate nel calendario ore:
        </p>
        <ul style={{ margin: '8px 0 0 30px', fontSize: '14px', color: '#2d5a2d' }}>
          <li><strong>Ferie</strong> → Segnate con <code style={{background: '#f0f0f0', padding: '2px 4px'}}>F</code></li>
          <li><strong>Permesso giornaliero</strong> → Segnato con <code style={{background: '#f0f0f0', padding: '2px 4px'}}>P</code></li>
          <li><strong>Malattia</strong> → Segnata con <code style={{background: '#f0f0f0', padding: '2px 4px'}}>M</code></li>
          <li><strong>Permesso orario</strong> → Gestione manuale richiesta</li>
        </ul>
      </div>
      
      {/* Info box sull'eliminazione e desincronizzazione */}
      <div className="delete-info-box" style={{
        backgroundColor: '#fff3cd',
        border: '1px solid #ffeaa7',
        borderRadius: '6px',
        padding: '15px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '20px', marginRight: '10px' }}>🗑️</span>
          <strong>Eliminazione Richieste Approvate</strong>
        </div>
        <p style={{ margin: 0, fontSize: '14px', color: '#856404' }}>
          Puoi eliminare richieste già approvate. Il sistema ripristinerà automaticamente il calendario ore 
          rimuovendo le lettere speciali (F, P, M) dalle date interessate e riportandole allo stato vuoto.
        </p>
      </div>
      
      {isLoading ? (
        <div className="loading">Caricamento richieste in corso...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Dipendente</th>
                <th>Tipo</th>
                <th>Data</th>
                <th>Dettagli</th>
                <th>Stato</th>
                <th>Note</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center">
                    Nessuna richiesta trovata con i filtri applicati
                  </td>
                </tr>
              ) : (
                filteredRequests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      {request.userName || request.userEmail}
                    </td>
                    <td>{getRequestTypeName(request.type)}</td>
                    <td>
                      {formatDate(request.dateFrom)}
                      {request.dateTo && ` - ${formatDate(request.dateTo)}`}
                    </td>
                    <td>
                      {getRequestDetails(request)}
                      {request.type === 'sickness' && request.fileUrl && (
                        <a 
                          href={request.fileUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="view-certificate-link"
                        >
                          Visualizza certificato
                        </a>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${getStatusClass(request.status)}`}>
                        {getStatusName(request.status)}
                        {getSyncIcon(request)}
                      </span>
                    </td>
                    <td>
                      {request.adminNotes || '-'}
                      {/* Mostra dettagli sincronizzazione se disponibili */}
                      {request.syncInfo && request.syncInfo.syncDetails && (
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                          {request.syncInfo.syncResult ? (
                            <span style={{ color: '#28a745' }}>
                              ✓ {request.syncInfo.syncDetails.totalDates} date sincronizzate
                            </span>
                          ) : (
                            <span style={{ color: '#dc3545' }}>
                              ✗ Sincronizzazione fallita
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      {request.status === 'pending' ? (
                        <div className="action-buttons">
                          <button 
                            className="btn btn-success btn-sm"
                            onClick={() => showNotes(request, 'approved')}
                            disabled={processingRequest || isDeleting}
                          >
                            {processingRequest ? 'Elaborazione...' : 'Approva'}
                          </button>
                          <button 
                            className="btn btn-danger btn-sm"
                            onClick={() => showNotes(request, 'rejected')}
                            disabled={processingRequest || isDeleting}
                          >
                            Rifiuta
                          </button>
                        </div>
                      ) : request.status === 'approved' ? (
                        <div className="action-buttons">
                          <button 
                            className="btn btn-secondary btn-sm"
                            onClick={() => showNotes(request, request.status)}
                            disabled={processingRequest || isDeleting}
                            style={{ marginBottom: '5px', width: '100%' }}
                          >
                            Modifica note
                          </button>
                          <button 
                            className="btn btn-danger btn-sm"
                            onClick={() => showDeleteConfirmation(request)}
                            disabled={processingRequest || isDeleting}
                            style={{ width: '100%' }}
                            title="Elimina richiesta e desincronizza dal calendario ore"
                          >
                            {isDeleting && requestToDelete?.id === request.id ? (
                              <>
                                <span style={{ marginRight: '5px' }}>⏳</span>
                                Eliminazione...
                              </>
                            ) : (
                              <>
                                🗑️ Elimina
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => showNotes(request, request.status)}
                          disabled={processingRequest || isDeleting}
                        >
                          Modifica note
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Form per le note dell'amministratore */}
      {showNotesForm && selectedRequest && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h4>
                {selectedRequest.defaultStatus === 'approved' 
                  ? 'Approva richiesta' 
                  : selectedRequest.defaultStatus === 'rejected'
                    ? 'Rifiuta richiesta'
                    : 'Modifica note'}
              </h4>
              <button 
                className="modal-close"
                onClick={() => setShowNotesForm(false)}
                disabled={processingRequest}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="request-info">
                <p><strong>Dipendente:</strong> {selectedRequest.userName || selectedRequest.userEmail}</p>
                <p><strong>Tipo:</strong> {getRequestTypeName(selectedRequest.type)}</p>
                <p>
                  <strong>Data:</strong> {formatDate(selectedRequest.dateFrom)}
                  {selectedRequest.dateTo && ` - ${formatDate(selectedRequest.dateTo)}`}
                </p>
                <p><strong>Dettagli:</strong> {getRequestDetails(selectedRequest)}</p>
              </div>
              
              {/* Info sulla sincronizzazione se si sta approvando */}
              {selectedRequest.defaultStatus === 'approved' && (
  <div className="sync-warning" style={{
    backgroundColor: '#fff3cd',
    border: '1px solid #ffeaa7',
    borderRadius: '4px',
    padding: '12px',
    marginBottom: '15px'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
      <span style={{ fontSize: '16px', marginRight: '8px' }}>🔄</span>
      <strong>Sincronizzazione Automatica</strong>
    </div>
    <p style={{ margin: 0, fontSize: '14px' }}>
      {selectedRequest.type === 'vacation' && (
        <>Approvando questa richiesta di <strong>ferie</strong>, tutte le date dal {formatDate(selectedRequest.dateFrom)} al {formatDate(selectedRequest.dateTo)} verranno automaticamente segnate con F nel calendario ore.</>
      )}
      {selectedRequest.type === 'permission' && selectedRequest.permissionType === 'daily' && (
        <>Approvando questa richiesta di <strong>permesso giornaliero</strong>, la data {formatDate(selectedRequest.dateFrom)} verrà automaticamente segnata con P nel calendario ore.</>
      )}
      {selectedRequest.type === 'permission' && selectedRequest.permissionType === 'multi-day' && (
        <>Approvando questa richiesta di <strong>permesso multi-giorni</strong>, tutte le date dal {formatDate(selectedRequest.dateFrom)} al {formatDate(selectedRequest.dateTo)} (solo giorni lavorativi) verranno automaticamente segnate con P nel calendario ore.</>
      )}
      {selectedRequest.type === 'permission' && selectedRequest.permissionType === 'hourly' && (
        <>Approvando questa richiesta di <strong>permesso orario</strong>, non verrà effettuata nessuna modifica automatica al calendario ore. Sarà necessario gestire manualmente le ore.</>
      )}
      {selectedRequest.type === 'sickness' && (
  <>
    <p><strong>Codice protocollo:</strong> {selectedRequest.protocolCode}</p>
    <p><strong>Codice fiscale:</strong> {selectedRequest.taxCode}</p>
    {selectedRequest.dateTo && (
      <p><strong>Periodo:</strong> {formatDate(selectedRequest.dateFrom)} - {formatDate(selectedRequest.dateTo)}</p>
    )}
  </>
      )}
    </p>
  </div>
)}
              
              <div className="form-group">
                <label htmlFor="admin-notes">Note (opzionale)</label>
                <textarea
                  id="admin-notes"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Inserisci eventuali note sulla richiesta..."
                  rows="4"
                  disabled={processingRequest}
                />
              </div>
            </div>
            <div className="modal-footer">
              {selectedRequest.defaultStatus === 'approved' ? (
                <button 
                  className="btn btn-success"
                  onClick={() => handleRequestAction(true)}
                  disabled={processingRequest}
                >
                  {processingRequest ? (
                    <>
                      <span className="spinner" style={{ marginRight: '8px' }}>⏳</span>
                      Approvazione e sincronizzazione...
                    </>
                  ) : (
                    'Approva e Sincronizza'
                  )}
                </button>
              ) : selectedRequest.defaultStatus === 'rejected' ? (
                <button 
                  className="btn btn-danger"
                  onClick={() => handleRequestAction(false)}
                  disabled={processingRequest}
                >
                  {processingRequest ? 'Rifiuto...' : 'Rifiuta'}
                </button>
              ) : (
                <button 
                  className="btn btn-primary"
                  onClick={() => handleRequestAction(selectedRequest.status === 'approved')}
                  disabled={processingRequest}
                >
                  {processingRequest ? 'Aggiornamento...' : 'Aggiorna note'}
                </button>
              )}
              <button 
                className="btn btn-secondary"
                onClick={() => setShowNotesForm(false)}
                disabled={processingRequest}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Dialog di conferma eliminazione */}
      {showDeleteConfirm && requestToDelete && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h4>🗑️ Conferma Eliminazione</h4>
              <button 
                className="modal-close"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="delete-warning" style={{
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '4px',
                padding: '15px',
                marginBottom: '15px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '24px', marginRight: '10px' }}>⚠️</span>
                  <strong>Attenzione: Operazione Irreversibile</strong>
                </div>
                <p style={{ margin: 0, fontSize: '14px', color: '#721c24' }}>
                  Stai per eliminare definitivamente questa richiesta approvata. Il sistema eseguirà automaticamente:
                </p>
                <ul style={{ margin: '10px 0 0 30px', fontSize: '14px', color: '#721c24' }}>
                  <li>Eliminazione della richiesta dal database</li>
                  <li>Rimozione automatica delle lettere speciali dal calendario ore</li>
                  <li>Ripristino delle date interessate allo stato vuoto</li>
                  {requestToDelete.fileUrl && <li>Eliminazione del certificato medico allegato</li>}
                </ul>
              </div>
              
              <div className="request-info">
                <h5>Dettagli richiesta da eliminare:</h5>
                <p><strong>Dipendente:</strong> {requestToDelete.userName || requestToDelete.userEmail}</p>
                <p><strong>Tipo:</strong> {getRequestTypeName(requestToDelete.type)}</p>
                <p>
                  <strong>Data:</strong> {formatDate(requestToDelete.dateFrom)}
                  {requestToDelete.dateTo && ` - ${formatDate(requestToDelete.dateTo)}`}
                </p>
                <p><strong>Dettagli:</strong> {getRequestDetails(requestToDelete)}</p>
                {requestToDelete.adminNotes && (
                  <p><strong>Note admin:</strong> {requestToDelete.adminNotes}</p>
                )}
              </div>
              
              <div className="desync-info" style={{
                backgroundColor: '#fff3cd',
                border: '1px solid #ffeaa7',
                borderRadius: '4px',
                padding: '12px',
                marginTop: '15px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px', marginRight: '8px' }}>🔄</span>
                  <strong>Desincronizzazione Automatica</strong>
                </div>
                <p style={{ margin: 0, fontSize: '14px' }}>
                  Le date precedentemente sincronizzate verranno automaticamente ripristinate 
                  allo stato vuoto nel calendario ore.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-danger"
                onClick={handleDeleteRequest}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span className="spinner" style={{ marginRight: '8px' }}>⏳</span>
                    Eliminazione e desincronizzazione...
                  </>
                ) : (
                  '🗑️ Elimina Definitivamente'
                )}
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLeaveRequests;
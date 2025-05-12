// src/components/Admin/AdminLeaveRequests.jsx
import React, { useState, useEffect } from 'react';
import { getAllLeaveRequests, updateLeaveRequestStatus } from '../../firebase';
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
  
  // Gestisce l'approvazione/rifiuto di una richiesta
  const handleRequestAction = async (approve = true) => {
    if (!selectedRequest) return;
    
    setProcessingRequest(true);
    
    try {
      const newStatus = approve ? 'approved' : 'rejected';
      
      // Aggiorna lo stato della richiesta
      const updatedRequest = await updateLeaveRequestStatus(
        selectedRequest.id, 
        newStatus, 
        adminNotes
      );
      
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
      
      // Mostra notifica di successo
      setNotification({
        show: true,
        message: `Richiesta ${approve ? 'approvata' : 'rifiutata'} con successo`,
        type: 'success'
      });
      
      // Nascondi la notifica dopo 3 secondi
      setTimeout(() => {
        setNotification(prev => ({ ...prev, show: false }));
      }, 3000);
    } catch (err) {
      console.error(`Errore nell'${approve ? 'approvazione' : 'rifiuto'} della richiesta:`, err);
      
      setNotification({
        show: true,
        message: `Errore nell'${approve ? 'approvazione' : 'rifiuto'} della richiesta`,
        type: 'error'
      });
    } finally {
      setProcessingRequest(false);
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
      details.push(request.permissionType === 'daily' ? 'Giornaliero' : 'Orario');
      
      if (request.permissionType === 'hourly' && request.timeFrom && request.timeTo) {
        details.push(`${request.timeFrom} - ${request.timeTo}`);
      }
    } else if (request.type === 'vacation') {
      if (request.dateTo) {
        const days = calculateDaysBetween(request.dateFrom, request.dateTo);
        details.push(`${days} ${days === 1 ? 'giorno' : 'giorni'}`);
      }
    } else if (request.type === 'sickness') {
      if (request.fileUrl) {
        details.push('Certificato medico allegato');
      }
    }
    
    return details.join(' • ');
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
                      </span>
                    </td>
                    <td>{request.adminNotes || '-'}</td>
                    <td>
                      {request.status === 'pending' ? (
                        <div className="action-buttons">
                          <button 
                            className="btn btn-success btn-sm"
                            onClick={() => showNotes(request, 'approved')}
                          >
                            Approva
                          </button>
                          <button 
                            className="btn btn-danger btn-sm"
                            onClick={() => showNotes(request, 'rejected')}
                          >
                            Rifiuta
                          </button>
                        </div>
                      ) : (
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => showNotes(request, request.status)}
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
              
              <div className="form-group">
                <label htmlFor="admin-notes">Note (opzionale)</label>
                <textarea
                  id="admin-notes"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Inserisci eventuali note sulla richiesta..."
                  rows="4"
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
                  {processingRequest ? 'Approvazione...' : 'Approva'}
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
    </div>
  );
};

export default AdminLeaveRequests;
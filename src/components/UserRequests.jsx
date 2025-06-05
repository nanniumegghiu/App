// src/components/UserRequests.jsx
import React, { useState, useEffect } from 'react';
import { auth, getUserLeaveRequests } from '../firebase';
import RequestForm from './RequestForm';
import Notification from './Notification';

const UserRequests = () => {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: 'success'
  });

  // Carica le richieste dell'utente all'avvio del componente e quando cambia l'utente
  useEffect(() => {
    const loadRequests = async () => {
      // Verifica che l'utente sia autenticato
      if (!auth.currentUser) {
        console.log("UserRequests: Utente non autenticato");
        setIsLoading(false);
        return;
      }
      
      console.log(`UserRequests: Caricamento richieste per userId=${auth.currentUser.uid}`);
      setIsLoading(true);
      
      try {
        const userRequests = await getUserLeaveRequests(auth.currentUser.uid);
        console.log("UserRequests: Richieste caricate", userRequests);
        setRequests(userRequests);
        setError(null);
      } catch (err) {
        console.error("UserRequests: Errore nel caricamento delle richieste:", err);
        setError("Impossibile caricare le richieste. Riprova più tardi.");
        setRequests([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadRequests();
  }, []);

  // Gestisce l'invio di una nuova richiesta
  const handleRequestSubmit = async (requestData) => {
    // Aggiungi la nuova richiesta alla lista locale
    setRequests(prevRequests => [requestData, ...prevRequests]);
    
    // Mostra notifica di successo
    setNotification({
      show: true,
      message: 'Richiesta inviata con successo!',
      type: 'success'
    });
    
    // Nascondi la notifica dopo 3 secondi
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 3000);
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

  // Aggiungi anche questa funzione di supporto se non esiste già:
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
    <div className="card">
      <div className="card-header">
        <div>Le tue richieste</div>
        <button 
          className="btn btn-primary"
          onClick={() => setShowRequestForm(true)}
        >
          Nuova richiesta
        </button>
      </div>
      <div className="card-body">
        {notification.show && (
          <Notification
            message={notification.message}
            isVisible={notification.show}
            onClose={() => setNotification(prev => ({ ...prev, show: false }))}
            type={notification.type}
          />
        )}
        
        {isLoading ? (
          <div className="loading">Caricamento richieste in corso...</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <div className="table-responsive">
            <table id="user-requests-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Data</th>
                  <th>Dettagli</th>
                  <th>Stato</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
              {requests.length === 0 ? (
  <tr>
    <td colSpan="5" className="text-center">
      Non hai ancora fatto nessuna richiesta
    </td>
  </tr>
) : (
  requests.map((request) => (
    <tr key={request.id}>
      <td>{getRequestTypeName(request.type)}</td>
      <td>
        {formatDate(request.dateFrom)}
        {(request.dateTo && (request.type === 'vacation' || request.permissionType === 'multi-day')) && 
          ` - ${formatDate(request.dateTo)}`}
      </td>
      <td>
        {/* Dettagli specifici per tipo di richiesta */}
        {request.type === 'permission' && request.permissionType === 'hourly' && (
          <>
            Orario: {request.timeFrom} - {request.timeTo}
          </>
        )}
        {request.type === 'permission' && request.permissionType === 'daily' && (
          'Giornata intera'
        )}
        {request.type === 'permission' && request.permissionType === 'multi-day' && (
          <>
            <div>Multi-giorni</div>
            {request.workingDaysCount && (
              <small className="text-muted">
                {request.workingDaysCount} giorni lavorativi
              </small>
            )}
          </>
        )}
        {request.type === 'vacation' && (
          <>
            <div>Ferie</div>
            {request.dateFrom && request.dateTo && (
              <small className="text-muted">
                {calculateDaysBetween(request.dateFrom, request.dateTo)} giorni
              </small>
            )}
          </>
        )}
        {request.type === 'sickness' && (
  <>
    <div>Malattia</div>
    <small className="text-muted">
      Protocollo: {request.protocolCode}
    </small>
    {request.dateTo && (
      <small className="text-muted d-block">
        Periodo: {formatDate(request.dateFrom)} - {formatDate(request.dateTo)}
      </small>
    )}
  </>
)}
      </td>
      <td>
        <span className={`status-badge ${getStatusClass(request.status)}`}>
          {getStatusName(request.status)}
        </span>
        {/* Indicatore sincronizzazione per richieste approvate */}
        {request.status === 'approved' && request.syncInfo && (
          <div className="sync-status-indicator">
            {request.syncInfo.syncResult ? (
              <small className="text-success">
                ✅ Sincronizzato ({request.syncInfo.syncDetails?.totalDates || 0} date)
              </small>
            ) : (
              <small className="text-warning">
                ⚠️ Errore sincronizzazione
              </small>
            )}
          </div>
        )}
      </td>
      <td>{request.adminNotes || '-'}</td>
    </tr>
  ))
)}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Form per l'aggiunta di nuove richieste */}
      <RequestForm 
        isVisible={showRequestForm} 
        onClose={() => setShowRequestForm(false)}
        onSubmit={handleRequestSubmit}
      />
    </div>
  );
};

export default UserRequests;
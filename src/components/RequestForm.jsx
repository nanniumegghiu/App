// src/components/RequestForm.jsx - Aggiornato con permessi multi-giorni
import React, { useState, useRef, useEffect } from 'react';
import { auth, submitLeaveRequest } from '../firebase';

const RequestForm = ({ isVisible, onClose, onSubmit }) => {
  const [requestType, setRequestType] = useState('');
  const [permissionType, setPermissionType] = useState('daily'); // 'daily', 'hourly', 'multi-day'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [certificateFile, setCertificateFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);
  const [protocolCode, setProtocolCode] = useState('');
  const [taxCode, setTaxCode] = useState('');
  
  // Reset del form quando viene aperto
  useEffect(() => {
    if (isVisible) {
      resetForm();
    }
  }, [isVisible]);
  
  const resetForm = () => {
    setRequestType('');
    setPermissionType('daily');
    setDateFrom('');
    setDateTo('');
    setTimeFrom('');
    setTimeTo('');
    setProtocolCode('');
    setTaxCode('');
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Gestisce il cambio di tipo di richiesta
  const handleRequestTypeChange = (e) => {
    setRequestType(e.target.value);
    // Reset altri campi che potrebbero non essere rilevanti
    if (e.target.value !== 'permission') {
      setPermissionType('daily');
      setTimeFrom('');
      setTimeTo('');
    }
    if (e.target.value !== 'vacation' && e.target.value !== 'permission') {
      setDateTo('');
    }
    if (e.target.value !== 'sickness') {
      setCertificateFile(null);
      setFileName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Gestisce il cambio di tipo di permesso
  const handlePermissionTypeChange = (e) => {
    setPermissionType(e.target.value);
    // Reset campi non rilevanti quando cambia il tipo
    if (e.target.value === 'daily') {
      setDateTo('');
      setTimeFrom('');
      setTimeTo('');
    } else if (e.target.value === 'hourly') {
      setDateTo('');
    } else if (e.target.value === 'multi-day') {
      setTimeFrom('');
      setTimeTo('');
    }
  };
  
  // Gestisce il caricamento del file
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Controlla estensione del file
      const validExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
      const fileExtension = file.name.split('.').pop().toLowerCase();
      
      if (!validExtensions.includes(fileExtension)) {
        setError('Formato file non valido. Si accettano solo PDF, JPG o PNG.');
        e.target.value = '';
        setCertificateFile(null);
        setFileName('');
        return;
      }
      
      // Controlla dimensione del file (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Il file è troppo grande. La dimensione massima è 5MB.');
        e.target.value = '';
        setCertificateFile(null);
        setFileName('');
        return;
      }
      
      setCertificateFile(file);
      setFileName(file.name);
      setError('');
    }
  };

  // Calcola il numero di giorni lavorativi tra due date
  const calculateWorkingDays = (startDate, endDate) => {
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
  
  // Validazione del form
  const validateForm = () => {
    setError('');
    
    if (!requestType) {
      setError('Seleziona il tipo di richiesta');
      return false;
    }
    
    if (requestType === 'permission') {
      if (!dateFrom) {
        setError('Seleziona la data di inizio');
        return false;
      }
      
      if (permissionType === 'hourly') {
        if (!timeFrom || !timeTo) {
          setError('Seleziona l\'orario di inizio e fine');
          return false;
        }
        
        // Controlla che l'orario di fine sia successivo a quello di inizio
        if (timeFrom >= timeTo) {
          setError('L\'orario di fine deve essere successivo all\'orario di inizio');
          return false;
        }
      } else if (permissionType === 'multi-day') {
        if (!dateTo) {
          setError('Seleziona la data di fine per il permesso multi-giorni');
          return false;
        }
        
        // Controlla che la data di fine sia successiva a quella di inizio
        if (dateFrom > dateTo) {
          setError('La data di fine deve essere successiva alla data di inizio');
          return false;
        }

        // Calcola e valida il numero di giorni lavorativi
        const workingDays = calculateWorkingDays(dateFrom, dateTo);
        if (workingDays > 10) {
          setError('I permessi multi-giorni non possono superare i 10 giorni lavorativi. Per periodi più lunghi, utilizza le ferie.');
          return false;
        }
        
        if (workingDays === 0) {
          setError('Il periodo selezionato non include giorni lavorativi.');
          return false;
        }
      }
    }
    
    if (requestType === 'vacation') {
      if (!dateFrom) {
        setError('Seleziona la data di inizio');
        return false;
      }
      
      if (!dateTo) {
        setError('Seleziona la data di fine');
        return false;
      }
      
      // Controlla che la data di fine sia successiva a quella di inizio
      if (dateFrom > dateTo) {
        setError('La data di fine deve essere successiva alla data di inizio');
        return false;
      }
    }
    
    if (requestType === 'sickness') {
      if (!dateFrom) {
        setError('Seleziona la data di inizio');
        return false;
      }
      if (!protocolCode.trim()) {
        setError('Inserisci il codice di protocollo');
        return false;
      }
      if (!taxCode.trim()) {
        setError('Inserisci il codice fiscale');
        return false;
      }
      if (taxCode.length !== 16) {
        setError('Il codice fiscale deve essere di 16 caratteri');
        return false;
      }
      if (dateTo && dateFrom > dateTo) {
        setError('La data di fine deve essere successiva alla data di inizio');
        return false;
      }
    }
    
    return true;
  };
  
  // Invia la richiesta
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Utente non autenticato');
      }
      
      // Prepara i dati della richiesta
      const requestData = {
        type: requestType,
        userId: currentUser.uid
      };
      
      // Aggiungi la data per permessi e ferie
      if (requestType === 'permission' || requestType === 'vacation') {
        requestData.dateFrom = dateFrom;
      }
      
      // Aggiungi campi specifici in base al tipo di richiesta
      if (requestType === 'permission') {
        requestData.permissionType = permissionType;
        
        if (permissionType === 'hourly') {
          requestData.timeFrom = timeFrom;
          requestData.timeTo = timeTo;
        } else if (permissionType === 'multi-day') {
          requestData.dateTo = dateTo;
          requestData.workingDaysCount = calculateWorkingDays(dateFrom, dateTo);
        }
      } else if (requestType === 'vacation') {
        requestData.dateTo = dateTo;
      } else if (requestType === 'sickness') {
        requestData.dateFrom = dateFrom;
        if (dateTo) {
          requestData.dateTo = dateTo;
        }
        requestData.protocolCode = protocolCode.trim();
        requestData.taxCode = taxCode.trim().toUpperCase();
      }
      
      console.log("Dati della richiesta:", requestData);
      console.log("File:", certificateFile ? certificateFile.name : "Nessun file");
      
      // Invia la richiesta e il file al backend
      const result = await submitLeaveRequest(requestData, certificateFile);
      console.log("Risultato:", result);
      
      // Notifica il componente padre del successo
      if (onSubmit) {
        onSubmit(result);
      }
      
      // Chiudi il form
      resetForm();
      onClose();
    } catch (error) {
      console.error('Errore durante l\'invio della richiesta:', error);
      setError(`Si è verificato un errore: ${error.message || 'Errore sconosciuto'}. Riprova più tardi.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Formatta le date per la visualizzazione
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT');
  };
  
  // Se il form non è visibile, non renderizzare nulla
  if (!isVisible) {
    return null;
  }
  
  return (
    <div className="request-form-overlay">
      <div className="request-form">
        <div className="request-form-header">
          <h2>Richiesta Permesso / Ferie / Malattia</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

{requestType === 'sickness' && (
  <div className="form-legend" style={{
    backgroundColor: '#e3f2fd',
    border: '1px solid #90caf9',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '20px',
    fontSize: '0.9rem'
  }}>
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '8px',
      marginBottom: '8px',
      color: '#1976d2',
      fontWeight: '500'
    }}>
      <span style={{ fontSize: '16px' }}>ℹ️</span>
      <strong>Informazioni richiesta malattia</strong>
    </div>
    <p style={{ margin: '0 0 8px 0', color: '#1565c0', lineHeight: '1.4' }}>
      I campi contrassegnati con <span style={{ color: '#d32f2f', fontWeight: 'bold' }}>*</span> sono obbligatori.
    </p>
    <p style={{ margin: '0', color: '#1565c0', fontSize: '0.85rem', fontStyle: 'italic' }}>
      Il periodo di malattia può essere specificato indicando una data di fine opzionale.
    </p>
  </div>
)}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="request-type">Tipo di richiesta</label>
            <select 
              id="request-type" 
              value={requestType} 
              onChange={handleRequestTypeChange}
              required
            >
              <option value="">Seleziona...</option>
              <option value="permission">Permesso</option>
              <option value="vacation">Ferie</option>
              <option value="sickness">Malattia</option>
            </select>
          </div>
          
          {requestType === 'permission' && (
            <>
              <div className="form-group">
                <label htmlFor="permission-type">Tipo di permesso</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input 
                      type="radio" 
                      name="permission-type" 
                      value="daily" 
                      checked={permissionType === 'daily'} 
                      onChange={handlePermissionTypeChange} 
                    />
                    Giornaliero (1 giorno)
                  </label>
                  <label className="radio-label">
                    <input 
                      type="radio" 
                      name="permission-type" 
                      value="hourly" 
                      checked={permissionType === 'hourly'} 
                      onChange={handlePermissionTypeChange} 
                    />
                    Orario (parte del giorno)
                  </label>
                  <label className="radio-label">
                    <input 
                      type="radio" 
                      name="permission-type" 
                      value="multi-day" 
                      checked={permissionType === 'multi-day'} 
                      onChange={handlePermissionTypeChange} 
                    />
                    Multi-giorni (max 10 giorni lavorativi)
                  </label>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="date-from">
                  {permissionType === 'multi-day' ? 'Data inizio' : 'Data'}
                </label>
                <input 
                  type="date" 
                  id="date-from" 
                  value={dateFrom} 
                  onChange={(e) => setDateFrom(e.target.value)}
                  required
                />
              </div>

              {permissionType === 'multi-day' && (
                <>
                  <div className="form-group">
                    <label htmlFor="date-to">Data fine</label>
                    <input 
                      type="date" 
                      id="date-to" 
                      value={dateTo} 
                      onChange={(e) => setDateTo(e.target.value)}
                      required
                    />
                  </div>
                  
                  {dateFrom && dateTo && dateFrom <= dateTo && (
                    <div className="permission-summary">
                      <div className="summary-box">
                        <h4>📋 Riepilogo Permesso Multi-giorni</h4>
                        <div className="summary-details">
                          <div className="summary-item">
                            <span className="summary-label">Dal:</span>
                            <span className="summary-value">{formatDate(dateFrom)}</span>
                          </div>
                          <div className="summary-item">
                            <span className="summary-label">Al:</span>
                            <span className="summary-value">{formatDate(dateTo)}</span>
                          </div>
                          <div className="summary-item">
                            <span className="summary-label">Giorni lavorativi:</span>
                            <span className="summary-value highlight">{calculateWorkingDays(dateFrom, dateTo)}</span>
                          </div>
                        </div>
                        <div className="summary-note">
                          <small>
                            ℹ️ Vengono conteggiati solo i giorni lavorativi (esclusi weekend). 
                            Massimo consentito: 10 giorni lavorativi.
                          </small>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {permissionType === 'hourly' && (
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="time-from">Orario di inizio</label>
                    <input 
                      type="time" 
                      id="time-from" 
                      value={timeFrom} 
                      onChange={(e) => setTimeFrom(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="time-to">Orario di fine</label>
                    <input 
                      type="time" 
                      id="time-to" 
                      value={timeTo} 
                      onChange={(e) => setTimeTo(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}
            </>
          )}
          
          {requestType === 'vacation' && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="date-from">Data inizio</label>
                <input 
                  type="date" 
                  id="date-from" 
                  value={dateFrom} 
                  onChange={(e) => setDateFrom(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="date-to">Data fine</label>
                <input 
                  type="date" 
                  id="date-to" 
                  value={dateTo} 
                  onChange={(e) => setDateTo(e.target.value)}
                  required
                />
              </div>
            </div>
          )}
          
          {requestType === 'sickness' && (
  <>
    <div className="form-group">
      <label htmlFor="date-from">Data inizio *</label>
      <input 
        type="date" 
        id="date-from" 
        value={dateFrom} 
        onChange={(e) => setDateFrom(e.target.value)}
        required
      />
    </div>
    
    <div className="form-group">
      <label htmlFor="date-to">Data fine (opzionale)</label>
      <input 
        type="date" 
        id="date-to" 
        value={dateTo} 
        onChange={(e) => setDateTo(e.target.value)}
      />
    </div>
    
    <div className="form-row">
      <div className="form-group">
        <label htmlFor="protocol-code">Codice di protocollo *</label>
        <input 
          type="text" 
          id="protocol-code" 
          value={protocolCode} 
          onChange={(e) => setProtocolCode(e.target.value)}
          placeholder="Inserisci il codice di protocollo"
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="tax-code">Codice fiscale *</label>
        <input 
          type="text" 
          id="tax-code" 
          value={taxCode} 
          onChange={(e) => setTaxCode(e.target.value)}
          placeholder="Inserisci il codice fiscale"
          maxLength="16"
          required
        />
      </div>
    </div>
  </>
)}
          
          <div className="form-actions">
            <button 
              type="submit" 
              className="submit-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <div className="spinner-container">
                  <span className="spinner"></span>
                  <span>Invio in corso...</span>
                </div>
              ) : (
                'Invia richiesta'
              )}
            </button>
            <button 
              type="button" 
              className="cancel-button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RequestForm;
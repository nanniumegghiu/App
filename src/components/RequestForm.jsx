// src/components/RequestForm.jsx (with improved error handling)
import React, { useState, useRef, useEffect } from 'react';
import { auth, submitLeaveRequest } from '../firebase';

const RequestForm = ({ isVisible, onClose, onSubmit }) => {
  const [requestType, setRequestType] = useState('');
  const [permissionType, setPermissionType] = useState('daily'); // 'daily' o 'hourly'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [certificateFile, setCertificateFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);
  
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
    setCertificateFile(null);
    setFileName('');
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
    if (e.target.value !== 'vacation') {
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
  
  // Validazione del form
  const validateForm = () => {
    setError('');
    
    if (!requestType) {
      setError('Seleziona il tipo di richiesta');
      return false;
    }
    
    if (requestType === 'permission') {
      if (!dateFrom) {
        setError('Seleziona la data');
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
      if (!certificateFile) {
        setError('Carica il certificato medico');
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
        }
      } else if (requestType === 'vacation') {
        requestData.dateTo = dateTo;
      } else if (requestType === 'sickness') {
        // Per la malattia, usiamo la data corrente se non è stata specificata
        if (!dateFrom) {
          const today = new Date();
          const yyyy = today.getFullYear();
          const mm = String(today.getMonth() + 1).padStart(2, '0');
          const dd = String(today.getDate()).padStart(2, '0');
          requestData.dateFrom = `${yyyy}-${mm}-${dd}`;
        } else {
          requestData.dateFrom = dateFrom;
        }
        requestData.fileName = fileName;
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
                      onChange={() => setPermissionType('daily')} 
                    />
                    Giornaliero
                  </label>
                  <label className="radio-label">
                    <input 
                      type="radio" 
                      name="permission-type" 
                      value="hourly" 
                      checked={permissionType === 'hourly'} 
                      onChange={() => setPermissionType('hourly')} 
                    />
                    Orario
                  </label>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="date-from">Data</label>
                <input 
                  type="date" 
                  id="date-from" 
                  value={dateFrom} 
                  onChange={(e) => setDateFrom(e.target.value)}
                  required
                />
              </div>
              
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
                <label htmlFor="date-from">Data (opzionale)</label>
                <input 
                  type="date" 
                  id="date-from" 
                  value={dateFrom} 
                  onChange={(e) => setDateFrom(e.target.value)}
                />
                <small className="form-text">
                  Se non specificata, verrà usata la data odierna.
                </small>
              </div>
              
              <div className="form-group">
                <label htmlFor="certificate">Certificato medico (PDF, JPG, PNG, max 5MB)</label>
                <div className="file-input-container">
                  <input 
                    type="file" 
                    id="certificate" 
                    ref={fileInputRef}
                    accept=".pdf,.jpg,.jpeg,.png" 
                    onChange={handleFileChange}
                    required
                    style={{ display: 'none' }}
                  />
                  <button 
                    type="button" 
                    className="file-select-button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Seleziona file
                  </button>
                  <span className="file-name">
                    {fileName || 'Nessun file selezionato'}
                  </span>
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
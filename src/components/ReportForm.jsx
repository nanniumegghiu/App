import React, { useState, useRef, useEffect } from 'react';
import { auth, submitReport } from '../firebase';

const ReportForm = ({ isVisible, selectedDate, position, onSubmit, onClose }) => {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef(null);
  
  // Reset message when form is opened with a new date
  useEffect(() => {
    if (isVisible) {
      setMessage('');
      setError('');
    }
  }, [isVisible, selectedDate]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (message.trim() === '') {
      setError('Per favore, inserisci una descrizione dell\'errore');
      return;
    }

    setError('');
    setIsSubmitting(true);
    
    try {
      console.log(`ReportForm: Invio segnalazione per data ${selectedDate}`);

      // Creare l'oggetto segnalazione
      const reportData = {
        date: selectedDate,
        description: message,
        status: "In attesa"
      };
      
      console.log("ReportForm: Dati segnalazione", reportData);
      console.log("ReportForm: userId", auth.currentUser?.uid);
      
      if (!auth.currentUser) {
        throw new Error("Utente non autenticato");
      }
      
      // Invia la segnalazione usando Firebase
      const result = await submitReport(reportData, auth.currentUser.uid);
      console.log("ReportForm: Segnalazione inviata con successo", result);
      
      // Informa il componente padre
      onSubmit(selectedDate, message);
      setMessage('');
    } catch (error) {
      console.error("ReportForm: Errore nell'invio della segnalazione:", error);
      setError("Si è verificato un errore durante l'invio della segnalazione. Riprova più tardi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Apply dynamic styling based on position
  const formStyle = {
    display: isVisible ? 'block' : 'none',
    position: 'absolute',
    left: position?.left || 0,
    top: position?.top || 0,
    width: position?.width || '100%',
    padding: '15px',
    backgroundColor: '#f9f9f9',
    border: '1px solid #eee',
    borderRadius: '4px',
    marginTop: '10px',
    zIndex: 1000
  };

  return (
    <div className="report-form" style={formStyle} ref={formRef}>
      <h3>Segnala un errore</h3>
      {error && (
        <div className="error-message" style={{ color: 'red', marginBottom: '10px' }}>
          {error}
        </div>
      )}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Descrivi l'errore riscontrato (es. 'Orario di entrata errato, l'orario corretto è 8:30')"
        disabled={isSubmitting}
        style={{ 
          width: '100%', 
          minHeight: '100px',
          marginBottom: '10px',
          padding: '8px',
          border: '1px solid #ddd',
          borderRadius: '4px'
        }}
      />
      <div>
        <button 
          className="btn btn-success" 
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{ marginRight: '10px' }}
        >
          {isSubmitting ? 'Invio in corso...' : 'Invia Segnalazione'}
        </button>
        <button 
          className="btn btn-danger" 
          onClick={onClose}
          disabled={isSubmitting}
        >
          Annulla
        </button>
      </div>
    </div>
  );
};

export default ReportForm;
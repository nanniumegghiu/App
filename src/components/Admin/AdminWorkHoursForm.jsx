// src/components/Admin/AdminWorkHoursForm.jsx
import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

const AdminWorkHoursForm = ({ onSave, onCancel, initialData }) => {
  const [formData, setFormData] = useState({
    date: '',
    userId: '',
    userEmail: '',
    totalHours: '',
    notes: ''
  });
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Recupera l'elenco degli utenti
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersCollection = collection(db, "users");
        const usersSnapshot = await getDocs(usersCollection);
        
        const usersList = usersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })).sort((a, b) => {
          // Prima gli admin, poi gli altri utenti
          if (a.role === 'admin' && b.role !== 'admin') return -1;
          if (a.role !== 'admin' && b.role === 'admin') return 1;
          
          // All'interno dello stesso gruppo, ordina per nome
          const aName = a.nome && a.cognome ? `${a.nome} ${a.cognome}` : a.email;
          const bName = b.nome && b.cognome ? `${b.nome} ${b.cognome}` : b.email;
          return aName.localeCompare(bName);
        });
        
        setUsers(usersList);
      } catch (err) {
        console.error("Errore nel recupero degli utenti:", err);
      }
    };

    fetchUsers();
  }, []);

  // Inizializza il form con i dati esistenti, se presenti
  useEffect(() => {
    if (initialData) {
      setFormData({
        date: initialData.date || '',
        userId: initialData.userId || '',
        userEmail: initialData.userEmail || '',
        totalHours: initialData.totalHours || '',
        notes: initialData.notes || ''
      });
    } else {
      // Se non ci sono dati iniziali, imposta la data di oggi
      const today = new Date().toISOString().split('T')[0];
      setFormData(prev => ({ ...prev, date: today }));
    }
  }, [initialData]);

  // Gestisce il cambio dell'utente selezionato
  const handleUserChange = (e) => {
    const userId = e.target.value;
    const selectedUser = users.find(user => user.id === userId);
    
    setFormData(prev => ({
      ...prev,
      userId,
      userEmail: selectedUser ? selectedUser.email : ''
    }));
  };

  // Gestisce i cambiamenti nei campi del form
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Per totalHours, permetti solo numeri interi
    if (name === 'totalHours') {
      const intValue = parseInt(value, 10);
      // Se è un numero e maggiore o uguale a 0, salvalo
      if (!isNaN(intValue) && intValue >= 0) {
        setFormData(prev => ({ ...prev, [name]: intValue.toString() }));
      } else if (value === '') {
        // Permetti il campo vuoto per poterlo cancellare
        setFormData(prev => ({ ...prev, [name]: '' }));
      }
      // Ignora altri input per questo campo
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    
    // Reset errori per il campo modificato
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  // Validazione del form prima dell'invio
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.date) {
      newErrors.date = "La data è obbligatoria";
    }
    
    if (!formData.userId) {
      newErrors.userId = "L'utente è obbligatorio";
    }
    
    if (!formData.totalHours) {
      newErrors.totalHours = "Il totale ore è obbligatorio";
    } else {
      const hoursValue = parseInt(formData.totalHours, 10);
      if (isNaN(hoursValue) || hoursValue < 0 || hoursValue > 24) {
        newErrors.totalHours = "Inserisci un valore valido tra 0 e 24";
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Gestisce l'invio del form
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      // Prepara i dati per il salvataggio
      const dataToSave = {
        ...formData,
        day: new Date(formData.date).toLocaleDateString('it-IT', { weekday: 'long' })
      };
      
      onSave(dataToSave);
    }
  };

  return (
    <div className="admin-work-hours-form-overlay">
      <div className="admin-work-hours-form">
        <h3>{initialData ? "Modifica Ore Lavorative" : "Aggiungi Ore Lavorative"}</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="date">Data:</label>
              <input 
                type="date" 
                id="date" 
                name="date" 
                value={formData.date} 
                onChange={handleInputChange}
                className={errors.date ? 'error' : ''}
              />
              {errors.date && <div className="error-text">{errors.date}</div>}
            </div>
            
            <div className="form-group">
              <label htmlFor="userId">Utente:</label>
              <select 
                id="userId" 
                name="userId" 
                value={formData.userId} 
                onChange={handleUserChange}
                className={errors.userId ? 'error' : ''}
              >
                <option value="">Seleziona utente</option>
                {users.map(user => (
  <option key={user.id} value={user.id}>
    {user.role === 'admin' && '👑 '}
    {user.nome} {user.cognome} ({user.email})
    {user.role === 'admin' && ' - Admin'}
  </option>
))}
              </select>
              {errors.userId && <div className="error-text">{errors.userId}</div>}
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="totalHours">Totale Ore (solo numeri interi):</label>
              <input 
                type="number" 
                id="totalHours" 
                name="totalHours" 
                value={formData.totalHours} 
                onChange={handleInputChange}
                min="0"
                max="24"
                step="1"
                placeholder="Es. 8"
                className={errors.totalHours ? 'error' : ''}
              />
              {errors.totalHours && <div className="error-text">{errors.totalHours}</div>}
            </div>
            
            <div className="form-group">
              <label htmlFor="notes">Note:</label>
              <input 
                type="text" 
                id="notes" 
                name="notes" 
                value={formData.notes} 
                onChange={handleInputChange}
                placeholder="Note opzionali"
              />
            </div>
          </div>
          
          <div className="form-actions">
            <button 
              type="submit" 
              className="btn btn-success"
              disabled={isLoading}
            >
              {isLoading ? 'Salvataggio...' : 'Salva'}
            </button>
            
            <button 
              type="button" 
              className="btn btn-danger"
              onClick={onCancel}
              disabled={isLoading}
            >
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminWorkHoursForm;
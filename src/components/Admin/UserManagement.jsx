// src/components/Admin/UserManagement.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import EmptyState from '../EmptyState';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Recupera tutti gli utenti
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoading(true);
        const usersCollection = collection(db, "users");
        const usersSnapshot = await getDocs(usersCollection);
        
        const usersList = usersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setUsers(usersList);
      } catch (err) {
        console.error("Errore nel recupero degli utenti:", err);
        setError("Impossibile caricare gli utenti. Riprova più tardi.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // Gestisce il cambio di ruolo
  const handleRoleChange = async (userId, newRole) => {
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { role: newRole });
      
      // Aggiorna lo stato locale
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user.id === userId 
            ? { ...user, role: newRole } 
            : user
        )
      );
    } catch (err) {
      console.error("Errore nell'aggiornamento del ruolo:", err);
      alert("Impossibile aggiornare il ruolo dell'utente. Riprova più tardi.");
    }
  };

  if (isLoading) {
    return <div className="loading">Caricamento utenti in corso...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (users.length === 0) {
    return (
      <EmptyState 
        message="Nessun utente trovato nel sistema" 
        icon="👤" 
      />
    );
  }

  return (
    <div className="card mt-4">
      <div className="card-header">Gestione Utenti</div>
      <div className="card-body">
        <div className="table-responsive">
          <table id="users-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cognome</th>
                <th>Email</th>
                <th>Ruolo</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.nome || '-'}</td>
                  <td>{user.cognome || '-'}</td>
                  <td>{user.email || '-'}</td>
                  <td>{user.role || 'user'}</td>
                  <td>
                    <select
                      value={user.role || 'user'}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="role-select"
                    >
                      <option value="user">Utente</option>
                      <option value="admin">Amministratore</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
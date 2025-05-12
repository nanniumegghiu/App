// src/components/Admin/AdminPanel.jsx (updated)
import React, { useState, useEffect } from 'react';
import { getAllReports, updateReportStatus } from '../../firebase';
import AdminReportsTable from './AdminReportsTable';
import AdminFilters from './AdminFilters';
import UserManagement from './UserManagement';
import AdminWorkHours from './AdminWorkHours';
import AdminReports from './AdminReports';
import AdminLeaveRequests from './AdminLeaveRequests';

const AdminPanel = () => {
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    month: '',
    year: '',
    status: '',
    user: ''
  });
  const [activeTab, setActiveTab] = useState('workHours'); // 'workHours', 'reports', 'users', 'download', 'leaveRequests'

  // Recupera tutte le segnalazioni al caricamento del componente
  useEffect(() => {
    const fetchReports = async () => {
      try {
        setIsLoading(true);
        const allReports = await getAllReports();
        setReports(allReports);
        setFilteredReports(allReports);
      } catch (err) {
        console.error("Errore nel recupero delle segnalazioni:", err);
        setError("Impossibile caricare le segnalazioni. Riprova più tardi.");
      } finally {
        setIsLoading(false);
      }
    };

    if (activeTab === 'reports') {
      fetchReports();
    } else {
      setIsLoading(false);
    }
  }, [activeTab]);

  // Applica i filtri quando cambiano
  useEffect(() => {
    if (activeTab === 'reports') {
      let result = [...reports];

      // Filtra per mese
      if (filters.month) {
        result = result.filter(report => report.month === filters.month);
      }

      // Filtra per anno
      if (filters.year) {
        result = result.filter(report => report.year === filters.year);
      }

      // Filtra per stato
      if (filters.status) {
        result = result.filter(report => report.status === filters.status);
      }

      // Filtra per utente (email)
      if (filters.user) {
        result = result.filter(report => 
          report.userEmail && report.userEmail.toLowerCase().includes(filters.user.toLowerCase())
        );
      }

      setFilteredReports(result);
    }
  }, [filters, reports, activeTab]);

  // Gestisce il cambio di stato di una segnalazione
  const handleStatusChange = async (reportId, newStatus) => {
    try {
      await updateReportStatus(reportId, newStatus);
      
      // Aggiorna lo stato locale
      setReports(prevReports => 
        prevReports.map(report => 
          report.id === reportId 
            ? { 
                ...report, 
                status: newStatus, 
                lastUpdate: new Date()
              } 
            : report
        )
      );
      
      // Assicurati che anche i report filtrati siano aggiornati
      setFilteredReports(prevReports => 
        prevReports.map(report => 
          report.id === reportId 
            ? { 
                ...report, 
                status: newStatus, 
                lastUpdate: new Date()
              } 
            : report
        )
      );
    } catch (err) {
      console.error("Errore nell'aggiornamento dello stato:", err);
      alert("Impossibile aggiornare lo stato della segnalazione. Riprova più tardi.");
    }
  };

  return (
    <div className="admin-panel">
      <h2>Pannello Amministratore</h2>
      
      <div className="admin-tabs">
        <button 
          className={`tab-button ${activeTab === 'workHours' ? 'active' : ''}`} 
          onClick={() => setActiveTab('workHours')}
        >
          Gestione Ore Lavorative
        </button>
        <button 
          className={`tab-button ${activeTab === 'reports' ? 'active' : ''}`} 
          onClick={() => setActiveTab('reports')}
        >
          Gestione Segnalazioni
        </button>
        <button 
          className={`tab-button ${activeTab === 'leaveRequests' ? 'active' : ''}`} 
          onClick={() => setActiveTab('leaveRequests')}
        >
          Permessi e Ferie
        </button>
        <button 
          className={`tab-button ${activeTab === 'users' ? 'active' : ''}`} 
          onClick={() => setActiveTab('users')}
        >
          Gestione Utenti
        </button>
        <button 
          className={`tab-button ${activeTab === 'download' ? 'active' : ''}`} 
          onClick={() => setActiveTab('download')}
        >
          Scarica Report
        </button>
      </div>
      
      {isLoading && (
        <div className="loading">Caricamento in corso...</div>
      )}
      
      {!isLoading && activeTab === 'workHours' && (
        <AdminWorkHours />
      )}
      
      {!isLoading && activeTab === 'reports' && (
        <>
          <AdminFilters 
            filters={filters} 
            setFilters={setFilters} 
            reports={reports} 
          />
          
          {error ? (
            <div className="error-message">{error}</div>
          ) : (
            <AdminReportsTable 
              reports={filteredReports} 
              onStatusChange={handleStatusChange} 
            />
          )}
        </>
      )}
      
      {!isLoading && activeTab === 'leaveRequests' && (
        <AdminLeaveRequests />
      )}
      
      {!isLoading && activeTab === 'users' && (
        <UserManagement />
      )}
      
      {!isLoading && activeTab === 'download' && (
        <AdminReports />
      )}
    </div>
  );
};

export default AdminPanel;
// AdminPanel.jsx - Versione aggiornata con centro notifiche admin
import React, { useState, useEffect } from 'react';
import { getAllReports, updateReportStatus } from '../../firebase';
import AdminNotificationCenter from './AdminNotificationCenter';
import AdminReportsTable from './AdminReportsTable';
import AdminFilters from './AdminFilters';
import UserManagement from './UserManagement';
import AdminWorkHours from './AdminWorkHours';
import AdminReports from './AdminReports';
import AdminLeaveRequests from './AdminLeaveRequests';
import AdminQRManagement from './AdminQRManagement';
import DeviceRegistration from './DeviceRegistration';
import TimekeepingScanner from '../TimekeepingScanner';
import './adminQRManagement.css';

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
  
  // Tab attiva - include una nuova tab per le notifiche
  const [activeTab, setActiveTab] = useState('workHours');

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

    fetchReports();
  }, []);

  // Applica i filtri quando cambiano
  useEffect(() => {
    let filtered = [...reports];

    if (filters.month) {
      filtered = filtered.filter(report => {
        const reportDate = new Date(report.createdAt.seconds * 1000);
        return reportDate.getMonth() + 1 === parseInt(filters.month);
      });
    }

    if (filters.year) {
      filtered = filtered.filter(report => {
        const reportDate = new Date(report.createdAt.seconds * 1000);
        return reportDate.getFullYear() === parseInt(filters.year);
      });
    }

    if (filters.status) {
      filtered = filtered.filter(report => report.status === filters.status);
    }

    if (filters.user) {
      filtered = filtered.filter(report => 
        report.userEmail && report.userEmail.toLowerCase().includes(filters.user.toLowerCase())
      );
    }

    setFilteredReports(filtered);
  }, [filters, reports]);

  // Aggiorna lo stato di una segnalazione
  const handleStatusUpdate = async (reportId, newStatus) => {
    try {
      await updateReportStatus(reportId, newStatus);
      
      // Aggiorna lo stato locale
      setReports(prev => prev.map(report => 
        report.id === reportId ? { ...report, status: newStatus } : report
      ));
      
      console.log(`Stato della segnalazione ${reportId} aggiornato a: ${newStatus}`);
    } catch (error) {
      console.error("Errore nell'aggiornamento dello stato:", error);
      alert("Errore nell'aggiornamento dello stato della segnalazione");
    }
  };

  // Renderizza il contenuto della tab attiva
  const renderTabContent = () => {
    switch (activeTab) {
      case 'workHours':
        return <AdminWorkHours />;
      case 'reports':
        return (
          <div>
            <AdminFilters filters={filters} onFiltersChange={setFilters} />
            {error ? (
              <div className="error-message">{error}</div>
            ) : (
              <AdminReportsTable 
                reports={filteredReports} 
                isLoading={isLoading}
                onStatusUpdate={handleStatusUpdate}
              />
            )}
          </div>
        );
      case 'users':
        return <UserManagement />;
      case 'download':
        return <AdminReports />;
      case 'leaveRequests':
        return <AdminLeaveRequests />;
      case 'qrManagement':
        return <AdminQRManagement />;
      case 'timekeeping':
        return <TimekeepingScanner />;
      case 'devices':
        return <DeviceRegistration />;
      default:
        return <AdminWorkHours />;
    }
  };

  return (
    <div className="admin-panel">
      {/* Header del pannello admin con centro notifiche */}
      <div className="admin-panel-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '30px',
        padding: '20px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '12px',
        color: 'white',
        boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '600' }}>
            Pannello Amministratore
          </h1>
        </div>
      </div>

      {/* Tabs di navigazione */}
      <div className="admin-tabs" style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '5px',
        marginBottom: '25px',
        borderBottom: '2px solid #e9ecef',
        paddingBottom: '10px'
      }}>
        <button 
          className={`tab-button ${activeTab === 'workHours' ? 'active' : ''}`}
          onClick={() => setActiveTab('workHours')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: activeTab === 'workHours' ? 'white' : 'transparent',
            color: activeTab === 'workHours' ? 'black' : '#666',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
        >
          📊 Gestione Ore
        </button>
        
        <button 
          className={`tab-button ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: activeTab === 'reports' ? 'white' : 'transparent',
            color: activeTab === 'reports' ? 'black' : '#666',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
        >
          📝 Segnalazioni
        </button>
        
        <button 
          className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: activeTab === 'users' ? 'white' : 'transparent',
            color: activeTab === 'users' ? 'black' : '#666',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
        >
          👥 Gestione Utenti
        </button>
        
        <button 
          className={`tab-button ${activeTab === 'leaveRequests' ? 'active' : ''}`}
          onClick={() => setActiveTab('leaveRequests')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: activeTab === 'leaveRequests' ? 'white' : 'transparent',
            color: activeTab === 'leaveRequests' ? 'black' : '#666',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
        >
          📋 Richieste
        </button>
        
        <button 
          className={`tab-button ${activeTab === 'qrManagement' ? 'active' : ''}`}
          onClick={() => setActiveTab('qrManagement')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: activeTab === 'qrManagement' ? 'white' : 'transparent',
            color: activeTab === 'qrManagement' ? 'black' : '#666',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
        >
          📱 QR Code
        </button>
        
        <button 
          className={`tab-button ${activeTab === 'timekeeping' ? 'active' : ''}`}
          onClick={() => setActiveTab('timekeeping')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: activeTab === 'timekeeping' ? 'white' : 'transparent',
            color: activeTab === 'timekeeping' ? 'black' : '#666',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
        >
          ⏰ Timbrature
        </button>
        
        <button 
          className={`tab-button ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: activeTab === 'devices' ? 'white' : 'transparent',
            color: activeTab === 'devices' ? 'black' : '#666',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
        >
          📱 Dispositivi
        </button>
        
        <button 
          className={`tab-button ${activeTab === 'download' ? 'active' : ''}`}
          onClick={() => setActiveTab('download')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: activeTab === 'download' ? 'white' : 'transparent',
            color: activeTab === 'download' ? 'black' : '#666',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
        >
          📊 Report
        </button>
      </div>

      {/* Contenuto della tab attiva */}
      <div className="admin-tab-content">
        {renderTabContent()}
      </div>
    </div>
  );
};

// Componente per la pagina delle notifiche admin
const AdminNotificationsPage = () => {
  return (
    <div className="admin-notifications-page">
      <div style={{
        background: 'white',
        padding: '30px',
        borderRadius: '12px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{
          margin: '0 0 20px 0',
          color: '#2d3748',
          fontSize: '1.8rem'
        }}>
          Centro Notifiche Amministratore
        </h2>
        
        <div style={{
          background: 'linear-gradient(135deg, #f8f9ff 0%, #f3f4ff 100%)',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '25px',
          border: '1px solid #e2e8f0'
        }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#4a5568' }}>
            📋 Gestione Notifiche
          </h3>
          <p style={{ margin: 0, color: '#718096', lineHeight: 1.6 }}>
            Le notifiche amministrative ti tengono aggiornato su nuove segnalazioni e richieste in tempo reale. 
            Le notifiche vengono eliminate automaticamente dal sistema solo dopo che tutti gli amministratori le hanno visualizzate.
          </p>
        </div>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '20px'
        }}>
          <div style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#e74c3c' }}>
              📝 Nuove Segnalazioni
            </h4>
            <p style={{ margin: 0, color: '#718096', fontSize: '0.95rem' }}>
              Ricevi notifiche immediate quando gli utenti inviano nuove segnalazioni che richiedono la tua attenzione.
            </p>
          </div>
          
          <div style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#3498db' }}>
              📋 Nuove Richieste
            </h4>
            <p style={{ margin: 0, color: '#718096', fontSize: '0.95rem' }}>
              Monitora le richieste di permessi, ferie e malattia in attesa di approvazione da parte degli amministratori.
            </p>
          </div>
        </div>
        
        <div style={{
          marginTop: '25px',
          padding: '15px',
          background: '#fff3cd',
          border: '1px solid #ffeaa7',
          borderRadius: '6px'
        }}>
          <strong style={{ color: '#6c5400' }}>💡 Suggerimento:</strong>
          <p style={{ margin: '5px 0 0 0', color: '#6c5400', fontSize: '0.95rem' }}>
            Il centro notifiche nell'header ti mostra sempre il numero di notifiche non lette. 
            Clicca su una notifica per navigare direttamente alla sezione appropriata.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
// src/components/Admin/SyncStatusMonitor.jsx - Componente per monitorare sincronizzazioni
import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

/**
 * Componente per monitorare lo stato delle sincronizzazioni tra richieste e workHours
 */
const SyncStatusMonitor = ({ userId = null, showInModal = false }) => {
  const [syncStatus, setSyncStatus] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inconsistencies, setInconsistencies] = useState([]);

  // Carica lo stato delle sincronizzazioni
  const loadSyncStatus = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Caricamento stato sincronizzazioni...');
      
      // Query per richieste approvate
      const leaveRequestsRef = collection(db, "leaveRequests");
      let requestQuery = query(
        leaveRequestsRef,
        where("status", "==", "approved")
      );
      
      // Se specificato un userId, filtra per quello
      if (userId) {
        requestQuery = query(
          leaveRequestsRef,
          where("status", "==", "approved"),
          where("userId", "==", userId)
        );
      }
      
      const requestsSnapshot = await getDocs(requestQuery);
      const approvedRequests = requestsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log(`Trovate ${approvedRequests.length} richieste approvate`);
      
      // Verifica la sincronizzazione per ogni richiesta
      const statusData = [];
      const foundInconsistencies = [];
      
      for (const request of approvedRequests) {
        try {
          const verification = await verifySyncForRequest(request);
          statusData.push({
            requestId: request.id,
            requestType: request.type,
            requestDate: request.dateFrom,
            requestEndDate: request.dateTo,
            userName: request.userName || request.userEmail,
            userId: request.userId,
            syncInfo: request.syncInfo,
            verification,
            hasInconsistency: !verification.isConsistent
          });
          
          if (!verification.isConsistent) {
            foundInconsistencies.push({
              requestId: request.id,
              ...verification
            });
          }
        } catch (verifyError) {
          console.error(`Errore verifica richiesta ${request.id}:`, verifyError);
          statusData.push({
            requestId: request.id,
            requestType: request.type,
            requestDate: request.dateFrom,
            userName: request.userName || request.userEmail,
            userId: request.userId,
            syncInfo: request.syncInfo,
            verification: {
              isConsistent: false,
              error: verifyError.message
            },
            hasInconsistency: true
          });
        }
      }
      
      setSyncStatus(statusData);
      setInconsistencies(foundInconsistencies);
      
    } catch (err) {
      console.error('Errore caricamento stato sincronizzazioni:', err);
      setError(`Errore nel caricamento: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Verifica la sincronizzazione per una singola richiesta
  const verifySyncForRequest = async (request) => {
    try {
      // Determina le date che dovrebbero essere sincronizzate
      const expectedDates = getExpectedSyncDates(request);
      
      if (expectedDates.length === 0) {
        return {
          isConsistent: true,
          reason: "Nessuna sincronizzazione automatica necessaria (permesso orario)"
        };
      }
      
      // Raggruppa le date per mese per controllo workHours
      const datesByMonth = {};
      expectedDates.forEach(dateString => {
        const [year, month] = dateString.split('-');
        const monthKey = `${request.userId}_${month.replace(/^0+/, '')}_${year}`;
        
        if (!datesByMonth[monthKey]) {
          datesByMonth[monthKey] = {
            userId: request.userId,
            month: month.replace(/^0+/, ''),
            year,
            dates: []
          };
        }
        
        datesByMonth[monthKey].dates.push(dateString);
      });
      
      // Verifica ogni mese
      const inconsistentDates = [];
      const missingEntries = [];
      
      for (const [monthKey, monthData] of Object.entries(datesByMonth)) {
        try {
          const workHoursRef = doc(db, "workHours", monthKey);
          const workHoursSnap = await getDoc(workHoursRef);
          
          if (!workHoursSnap.exists()) {
            missingEntries.push(...monthData.dates);
            continue;
          }
          
          const workHoursData = workHoursSnap.data();
          const entries = workHoursData.entries || [];
          
          // Determina la lettera attesa
          const expectedLetter = getExpectedLetter(request.type);
          
          monthData.dates.forEach(dateString => {
            const entry = entries.find(e => e.date === dateString);
            
            if (!entry) {
              missingEntries.push(dateString);
            } else if (entry.total !== expectedLetter) {
              inconsistentDates.push({
                date: dateString,
                expected: expectedLetter,
                actual: entry.total,
                notes: entry.notes
              });
            }
          });
          
        } catch (monthError) {
          console.error(`Errore verifica mese ${monthKey}:`, monthError);
          missingEntries.push(...monthData.dates);
        }
      }
      
      const isConsistent = inconsistentDates.length === 0 && missingEntries.length === 0;
      
      return {
        isConsistent,
        expectedDates,
        inconsistentDates,
        missingEntries,
        expectedLetter: getExpectedLetter(request.type),
        checkedMonths: Object.keys(datesByMonth)
      };
      
    } catch (error) {
      console.error('Errore verifica sincronizzazione:', error);
      throw error;
    }
  };

  // Ottiene le date che dovrebbero essere sincronizzate
  const getExpectedSyncDates = (request) => {
    const dates = [];
    
    if (request.type === 'permission' && request.permissionType === 'daily') {
      dates.push(request.dateFrom);
    } else if (request.type === 'vacation') {
      const startDate = new Date(request.dateFrom);
      const endDate = new Date(request.dateTo);
      
      for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        // Includi solo giorni lavorativi (escludi weekend)
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          dates.push(dateString);
        }
      }
    } else if (request.type === 'sickness') {
      dates.push(request.dateFrom);
    }
    
    return dates;
  };

  // Ottiene la lettera attesa per il tipo di richiesta
  const getExpectedLetter = (requestType) => {
    switch (requestType) {
      case 'vacation': return 'F';
      case 'permission': return 'P';
      case 'sickness': return 'M';
      default: return '';
    }
  };

  // Formatta la data
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT');
  };

  // Carica i dati all'avvio
  useEffect(() => {
    loadSyncStatus();
  }, [userId]);

  if (showInModal) {
    return (
      <div className="sync-status-modal">
        <div className="modal-header">
          <h4>🔄 Stato Sincronizzazioni</h4>
          <button onClick={loadSyncStatus} disabled={isLoading} className="refresh-btn">
            {isLoading ? '⏳' : '🔄'} Aggiorna
          </button>
        </div>
        
        <div className="modal-body">
          {renderContent()}
        </div>
      </div>
    );
  }

  return (
    <div className="sync-status-monitor">
      <div className="monitor-header">
        <h4>🔄 Monitoraggio Sincronizzazioni</h4>
        <button onClick={loadSyncStatus} disabled={isLoading} className="btn btn-secondary btn-sm">
          {isLoading ? '⏳ Caricamento...' : '🔄 Aggiorna'}
        </button>
      </div>
      
      {renderContent()}
    </div>
  );

  function renderContent() {
    if (isLoading) {
      return <div className="loading">Verifica sincronizzazioni in corso...</div>;
    }

    if (error) {
      return <div className="error-message">{error}</div>;
    }

    const consistentCount = syncStatus.filter(s => !s.hasInconsistency).length;
    const inconsistentCount = syncStatus.filter(s => s.hasInconsistency).length;

    return (
      <>
        {/* Riepilogo */}
        <div className="sync-summary">
          <div className="summary-stats">
            <div className="stat-item consistent">
              <span className="stat-number">{consistentCount}</span>
              <span className="stat-label">Sincronizzate</span>
            </div>
            <div className="stat-item inconsistent">
              <span className="stat-number">{inconsistentCount}</span>
              <span className="stat-label">Inconsistenti</span>
            </div>
            <div className="stat-item total">
              <span className="stat-number">{syncStatus.length}</span>
              <span className="stat-label">Totali</span>
            </div>
          </div>
        </div>

        {/* Lista inconsistenze */}
        {inconsistentCount > 0 && (
          <div className="inconsistencies-section">
            <h5>⚠️ Inconsistenze Rilevate</h5>
            <div className="inconsistencies-list">
              {syncStatus.filter(s => s.hasInconsistency).map(status => (
                <div key={status.requestId} className="inconsistency-item">
                  <div className="inconsistency-header">
                    <strong>{status.userName}</strong> - {status.requestType}
                    <span className="inconsistency-date">{formatDate(status.requestDate)}</span>
                  </div>
                  
                  {status.verification.error ? (
                    <div className="error-details">❌ {status.verification.error}</div>
                  ) : (
                    <div className="inconsistency-details">
                      {status.verification.missingEntries?.length > 0 && (
                        <div className="missing-entries">
                          <strong>Date mancanti:</strong> {status.verification.missingEntries.join(', ')}
                        </div>
                      )}
                      {status.verification.inconsistentDates?.length > 0 && (
                        <div className="wrong-values">
                          <strong>Valori errati:</strong>
                          {status.verification.inconsistentDates.map(d => (
                            <div key={d.date} className="wrong-value">
                              {formatDate(d.date)}: atteso "{d.expected}", trovato "{d.actual}"
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista tutte le sincronizzazioni */}
        <div className="all-syncs-section">
          <h5>📋 Tutte le Sincronizzazioni</h5>
          <div className="table-responsive">
            <table className="sync-table">
              <thead>
                <tr>
                  <th>Utente</th>
                  <th>Tipo</th>
                  <th>Data</th>
                  <th>Stato</th>
                  <th>Dettagli</th>
                </tr>
              </thead>
              <tbody>
                {syncStatus.map(status => (
                  <tr key={status.requestId} className={status.hasInconsistency ? 'inconsistent-row' : 'consistent-row'}>
                    <td>{status.userName}</td>
                    <td>{status.requestType}</td>
                    <td>
                      {formatDate(status.requestDate)}
                      {status.requestEndDate && ` - ${formatDate(status.requestEndDate)}`}
                    </td>
                    <td>
                      {status.hasInconsistency ? (
                        <span className="status-badge error">❌ Inconsistente</span>
                      ) : (
                        <span className="status-badge success">✅ Sincronizzato</span>
                      )}
                    </td>
                    <td>
                      {status.verification.expectedDates && (
                        <small>{status.verification.expectedDates.length} date verificate</small>
                      )}
                      {status.syncInfo?.syncResult && (
                        <div className="sync-info">
                          <small>Sync: {status.syncInfo.syncDetails?.totalDates || 0} date</small>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {syncStatus.length === 0 && (
          <div className="no-syncs">
            <p>Nessuna richiesta approvata trovata da verificare.</p>
          </div>
        )}
      </>
    );
  }
};

export default SyncStatusMonitor;
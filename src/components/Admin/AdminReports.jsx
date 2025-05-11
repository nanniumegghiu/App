import React, { useState, useEffect } from 'react';
import { getAllUsers, db } from '../../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';

const AdminReports = () => {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('2025');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [debugInfo, setDebugInfo] = useState(null);

  // Carica la lista degli utenti
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        const allUsers = await getAllUsers();
        // Filtra solo gli utenti non-admin (opzionale)
        const nonAdminUsers = allUsers.filter(user => user.role !== 'admin');
        setUsers(nonAdminUsers);
      } catch (error) {
        console.error("Errore nel caricamento degli utenti:", error);
        showNotification("Errore nel caricamento degli utenti", "error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // Mostra una notifica
  const showNotification = (message, type) => {
    setNotification({ show: true, message, type });
    
    // Nascondi la notifica dopo 3 secondi
    setTimeout(() => {
      setNotification({ show: false, message: '', type: '' });
    }, 3000);
  };

  // Funzione ottimizzata per recuperare i dati delle ore lavorative
  const getUserWorkHoursByMonth = async (userId, month, year) => {
    try {
      console.log(`Ricerca dati per userId=${userId}, month=${month}, year=${year}`);
      
      // Prova con il mese senza zero iniziale
      const docId = `${userId}_${month}_${year}`;
      console.log(`Tentativo 1: ID documento = ${docId}`);
      
      const docRef = doc(db, "workHours", docId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        console.log(`Documento trovato: ${docId}`);
        return {
          id: docSnap.id,
          ...docSnap.data()
        };
      }
      
      // Se non trova nulla, prova con il mese con zero iniziale se necessario
      if (month.length === 1) {
        const paddedMonth = month.padStart(2, '0');
        const altDocId = `${userId}_${paddedMonth}_${year}`;
        console.log(`Tentativo 2: ID documento = ${altDocId}`);
        
        const altDocRef = doc(db, "workHours", altDocId);
        const altDocSnap = await getDoc(altDocRef);
        
        if (altDocSnap.exists()) {
          console.log(`Documento trovato (formato alternativo): ${altDocId}`);
          return {
            id: altDocSnap.id,
            ...altDocSnap.data()
          };
        }
      }
      
      // Tentativo con query
      console.log("Tentativo 3: Query generale");
      const workHoursRef = collection(db, "workHours");
      const q = query(
        workHoursRef, 
        where("userId", "==", userId),
        where("year", "==", year)
      );
      
      const querySnapshot = await getDocs(q);
      console.log(`Query risultati: ${querySnapshot.size} documenti trovati`);
      
      // Cerca un documento che corrisponda al mese, con o senza zero iniziale
      for (const doc of querySnapshot.docs) {
        const data = doc.data();
        console.log(`Documento trovato con month=${data.month}, confronto con ${month}`);
        
        // Normalizza entrambi per il confronto
        const normalizedDataMonth = data.month.toString().replace(/^0+/, '');
        const normalizedInputMonth = month.toString().replace(/^0+/, '');
        
        if (normalizedDataMonth === normalizedInputMonth) {
          console.log(`Corrispondenza trovata: ${normalizedDataMonth} === ${normalizedInputMonth}`);
          return {
            id: doc.id,
            ...data
          };
        }
      }
      
      console.log("Nessun dato trovato in tutti i tentativi");
      return null;
    } catch (error) {
      console.error("Errore nel recupero delle ore lavorative:", error);
      throw error;
    }
  };

  // Gestisce la generazione del report per un singolo utente
  const generateUserReport = async (userId, userName) => {
    try {
      // Prepara il mese (con o senza zero iniziale)
      const rawMonth = selectedMonth.replace(/^0+/, ''); // Rimuove eventuali zeri iniziali
      
      console.log(`Generazione report per utente ${userName} (${userId}) - Mese: ${rawMonth}, Anno: ${selectedYear}`);
      
      // Ottieni i dati delle ore lavorative per il mese/anno selezionato
      const workHoursData = await getUserWorkHoursByMonth(userId, rawMonth, selectedYear);
      
      if (!workHoursData || !workHoursData.entries || workHoursData.entries.length === 0) {
        console.log(`Nessun dato trovato per l'utente ${userName}`);
        return null; // Nessun dato trovato per questo utente
      }
      
      console.log(`Dati trovati: ${workHoursData.entries.length} entries`);
      
      // Ordina le entries per data
      const sortedEntries = [...workHoursData.entries].sort((a, b) => {
        return new Date(a.date) - new Date(b.date);
      });
      
      // Calcola il totale delle ore
      const totalHours = sortedEntries.reduce((sum, entry) => sum + (parseInt(entry.total) || 0), 0);
      
      // Crea la struttura del foglio Excel
      const worksheetData = [
        // Intestazione con informazioni generali
        [`REPORT ORE LAVORATIVE - ${getMonthName(selectedMonth).toUpperCase()} ${selectedYear}`],
        [],
        [`Dipendente: ${userName}`],
        [],
        // Intestazioni colonne
        ['Data', 'Giorno', 'Ore Totali', 'Note']
      ];
      
      // Aggiungi i dati delle ore
      sortedEntries.forEach(entry => {
        worksheetData.push([
          formatDate(entry.date),
          entry.day,
          entry.total > 0 ? entry.total : 0,
          entry.notes || ''
        ]);
      });
      
      // Aggiungi il totale in fondo
      worksheetData.push([]);
      worksheetData.push(['TOTALE ORE', '', totalHours, '']);
      
      return {
        name: userName,
        data: worksheetData,
        totalHours
      };
    } catch (error) {
      console.error(`Errore nella generazione del report per l'utente ${userId}:`, error);
      return null;
    }
  };

  // Gestisce la generazione di un report per tutti gli utenti
  const generateAllUsersReport = async () => {
    try {
      setIsGenerating(true);
      setDebugInfo(null);
      
      if (selectedMonth === '') {
        showNotification("Seleziona un mese", "error");
        setIsGenerating(false);
        return;
      }
      
      // Caso 1: Report per un singolo utente
      if (selectedUser !== 'all') {
        const user = users.find(u => u.id === selectedUser);
        if (!user) {
          showNotification("Utente non trovato", "error");
          setIsGenerating(false);
          return;
        }
        
        const userName = `${user.nome || ''} ${user.cognome || ''}`.trim() || user.email;
        
        const userReport = await generateUserReport(selectedUser, userName);
        
        if (!userReport) {
          showNotification(`Nessun dato trovato per ${userName} nel periodo selezionato`, "warning");
          setIsGenerating(false);
          return;
        }
        
        // Crea la workbook
        const workbook = XLSX.utils.book_new();
        
        // Crea il foglio Excel
        const worksheet = XLSX.utils.aoa_to_sheet(userReport.data);
        
        // Imposta larghezza colonne
        const wscols = [
          {wch: 15}, // Data
          {wch: 15}, // Giorno
          {wch: 12}, // Ore Totali
          {wch: 40}  // Note
        ];
        worksheet['!cols'] = wscols;
        
        // Merge per l'intestazione
        if(!worksheet['!merges']) worksheet['!merges'] = [];
        worksheet['!merges'].push(
          {s: {r: 0, c: 0}, e: {r: 0, c: 3}} // Intestazione principale
        );
        
        // Aggiungi il foglio alla workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, `Ore ${getMonthName(selectedMonth)}`);
        
        // Genera il file Excel e lo scarica
        const fileName = `Ore_${getMonthName(selectedMonth)}_${selectedYear}_${userName.replace(/\s+/g, '_')}.xlsx`;
        XLSX.writeFile(workbook, fileName);
        
        showNotification(`Report generato per ${userName}`, "success");
      } 
      // Caso 2: Report per tutti gli utenti
      else {
        // Debug: controlla quali documenti esistono nella raccolta workHours
        console.log("Verifica documenti nella raccolta workHours:");
        const workHoursRef = collection(db, "workHours");
        const allDocsSnapshot = await getDocs(workHoursRef);
        
        console.log(`Totale documenti nella raccolta workHours: ${allDocsSnapshot.size}`);
        allDocsSnapshot.docs.forEach(doc => {
          console.log(`- Documento ID: ${doc.id}, userId: ${doc.data().userId}, month: ${doc.data().month}, year: ${doc.data().year}`);
        });
        
        // Trova tutti gli utenti con dati per il mese/anno selezionato
        const allReports = [];
        let totalUsersWithData = 0;
        
        // Crea la workbook
        const workbook = XLSX.utils.book_new();
        
        // Aggiungi un foglio riepilogativo
        const summaryData = [
          [`RIEPILOGO ORE LAVORATIVE - ${getMonthName(selectedMonth).toUpperCase()} ${selectedYear}`],
          [],
          ['Dipendente', 'Totale Ore'],
          []
        ];
        
        // Processa tutti gli utenti
        for (const user of users) {
          const userName = `${user.nome || ''} ${user.cognome || ''}`.trim() || user.email;
          
          const userReport = await generateUserReport(user.id, userName);
          
          if (userReport) {
            totalUsersWithData++;
            
            // Aggiungi al foglio riepilogativo
            summaryData.push([userName, userReport.totalHours]);
            
            // Crea un foglio per l'utente
            const worksheet = XLSX.utils.aoa_to_sheet(userReport.data);
            
            // Imposta larghezza colonne
            const wscols = [
              {wch: 15}, // Data
              {wch: 15}, // Giorno
              {wch: 12}, // Ore Totali
              {wch: 40}  // Note
            ];
            worksheet['!cols'] = wscols;
            
            // Merge per l'intestazione
            if(!worksheet['!merges']) worksheet['!merges'] = [];
            worksheet['!merges'].push(
              {s: {r: 0, c: 0}, e: {r: 0, c: 3}} // Intestazione principale
            );
            
            // Aggiungi il foglio alla workbook
            const sheetName = userName.length > 30 ? 
              userName.substring(0, 27) + "..." : 
              userName;
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
          }
        }
        
        if (totalUsersWithData === 0) {
          showNotification(`Nessun dato trovato per il periodo selezionato`, "warning");
          setIsGenerating(false);
          return;
        }
        
        // Calcola il totale complessivo
        const grandTotal = summaryData
          .slice(4) // Salta intestazioni
          .reduce((total, row) => total + (row[1] || 0), 0);
        
        // Aggiungi il totale complessivo
        summaryData.push([]);
        summaryData.push(['TOTALE COMPLESSIVO', grandTotal]);
        
        // Crea il foglio riepilogativo
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
        
        // Imposta larghezza colonne per il riepilogo
        const sumCols = [
          {wch: 30}, // Dipendente
          {wch: 15}  // Totale Ore
        ];
        summarySheet['!cols'] = sumCols;
        
        // Merge per l'intestazione del riepilogo
        if(!summarySheet['!merges']) summarySheet['!merges'] = [];
        summarySheet['!merges'].push(
          {s: {r: 0, c: 0}, e: {r: 0, c: 1}} // Intestazione principale
        );
        
        // Aggiungi il foglio riepilogativo come primo foglio
        XLSX.utils.book_append_sheet(workbook, summarySheet, "Riepilogo", true);
        
        // Genera il file Excel e lo scarica
        const fileName = `Ore_Tutti_${getMonthName(selectedMonth)}_${selectedYear}.xlsx`;
        XLSX.writeFile(workbook, fileName);
        
        showNotification(`Report generato per ${totalUsersWithData} utenti`, "success");
      }
    } catch (error) {
      console.error("Errore nella generazione del report:", error);
      showNotification("Si è verificato un errore durante la generazione del report", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  // Ottieni il nome del mese dalla selezione
  const getMonthName = (monthValue) => {
    const months = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", 
      "Maggio", "Giugno", "Luglio", "Agosto", 
      "Settembre", "Ottobre", "Novembre", "Dicembre"
    ];
    return months[parseInt(monthValue) - 1];
  };

  // Formatta la data in formato DD/MM/YYYY
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    
    return dateStr;
  };

  return (
    <div className="admin-reports">
      <h3>Generazione Report</h3>
      
      {notification.show && (
        <div 
          className={`notification ${notification.type}`} 
          style={{
            backgroundColor: notification.type === 'error' ? 'var(--danger)' : 
                            notification.type === 'warning' ? '#f39c12' : 
                            'var(--success)',
            color: 'white',
            padding: '15px',
            marginBottom: '20px',
            borderRadius: '5px'
          }}
        >
          {notification.message}
        </div>
      )}
      
      <div className="report-controls">
        <div className="filter-container">
          <div className="form-group">
            <label htmlFor="user-select">Dipendente:</label>
            <select 
              id="user-select" 
              value={selectedUser} 
              onChange={(e) => setSelectedUser(e.target.value)}
              className="form-control"
              disabled={isGenerating}
            >
              <option value="all">Tutti i dipendenti</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.nome && user.cognome ? `${user.nome} ${user.cognome}` : user.email}
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label htmlFor="month-select">Mese:</label>
            <select 
              id="month-select" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="form-control"
              disabled={isGenerating}
            >
              <option value="">-- Seleziona un mese --</option>
              {[...Array(12)].map((_, i) => (
                <option key={i + 1} value={(i + 1).toString()}>
                  {getMonthName(i + 1)}
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label htmlFor="year-select">Anno:</label>
            <select 
              id="year-select" 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
              className="form-control"
              disabled={isGenerating}
            >
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>
        </div>
        
        <div className="action-buttons">
          <button 
            className="btn btn-primary" 
            onClick={generateAllUsersReport}
            disabled={isGenerating || selectedMonth === ''}
          >
            {isGenerating ? 'Generazione in corso...' : 'Genera Report Excel'}
          </button>
        </div>
      </div>
      
      <div className="report-description" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
        <h4>Istruzioni</h4>
        <p>Seleziona un dipendente specifico o "Tutti i dipendenti" per generare un report delle ore lavorate.</p>
        <p>Il report includerà le seguenti informazioni:</p>
        <ul>
          <li>Dettaglio giornaliero delle ore lavorate</li>
          <li>Totale ore mensili per dipendente</li>
          <li>Note associate a ciascun giorno</li>
        </ul>
        <p>Se selezioni "Tutti i dipendenti", verrà generato un report con un foglio riepilogativo e un foglio dettagliato per ogni dipendente.</p>
      </div>
    </div>
  );
};

export default AdminReports;
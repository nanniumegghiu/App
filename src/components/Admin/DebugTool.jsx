// src/components/Admin/DebugTool.jsx
// Questo componente può essere aggiunto temporaneamente per diagnosticare problemi di salvataggio
import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

const DebugTool = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [testResults, setTestResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Test di base per salvare un documento nella collezione "debug"
  const runBasicTest = async () => {
    setIsLoading(true);
    setTestResults([]);
    
    try {
      // Prova a salvare un documento semplice
      const testData = {
        testField: "Test Value",
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString()
      };
      
      const results = [];
      results.push({ step: "Preparazione dati", status: "success", message: "Dati preparati con successo" });
      
      try {
        const docRef = await addDoc(collection(db, "debug"), testData);
        results.push({ 
          step: "Salvataggio documento", 
          status: "success", 
          message: `Documento salvato con ID: ${docRef.id}` 
        });
      } catch (error) {
        results.push({ 
          step: "Salvataggio documento", 
          status: "error", 
          message: `Errore: ${error.message}` 
        });
        throw error;
      }
      
      // Se siamo arrivati qui, il test è riuscito
      results.push({ 
        step: "Test completato", 
        status: "success", 
        message: "Il test di base è riuscito" 
      });
      
      setTestResults(results);
    } catch (error) {
      setTestResults(prev => [
        ...prev,
        { 
          step: "Errore generale", 
          status: "error", 
          message: `Errore: ${error.message}` 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Test per salvare un documento nella collezione "workHours"
  const runWorkHoursTest = async () => {
    setIsLoading(true);
    setTestResults([]);
    
    try {
      // Crea un documento di prova per le ore lavorative
      const today = new Date();
      const year = today.getFullYear();
      const month = (today.getMonth() + 1).toString().padStart(2, '0');
      const day = today.getDate().toString().padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      const testData = {
        date: dateString,
        userId: "testUserId",
        userEmail: "test@example.com",
        totalHours: "8",
        day: today.toLocaleDateString('it-IT', { weekday: 'long' }),
        month: month,
        year: year.toString(),
        notes: "Test di debug",
        createdAt: serverTimestamp(),
        lastUpdate: serverTimestamp()
      };
      
      const results = [];
      results.push({ 
        step: "Preparazione dati workHours", 
        status: "success", 
        message: `Dati preparati con successo per la data ${dateString}` 
      });
      
      try {
        const docRef = await addDoc(collection(db, "workHours"), testData);
        results.push({ 
          step: "Salvataggio workHours", 
          status: "success", 
          message: `Ore lavorative salvate con ID: ${docRef.id}` 
        });
      } catch (error) {
        results.push({ 
          step: "Salvataggio workHours", 
          status: "error", 
          message: `Errore: ${error.message}` 
        });
        throw error;
      }
      
      // Se siamo arrivati qui, il test è riuscito
      results.push({ 
        step: "Test workHours completato", 
        status: "success", 
        message: "Il test di workHours è riuscito" 
      });
      
      setTestResults(results);
    } catch (error) {
      setTestResults(prev => [
        ...prev,
        { 
          step: "Errore generale workHours", 
          status: "error", 
          message: `Errore: ${error.message}` 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!isVisible) {
    return (
      <div className="debug-tool-button">
        <button 
          className="btn btn-secondary"
          onClick={() => setIsVisible(true)}
        >
          Mostra Strumento Debug
        </button>
      </div>
    );
  }
  
  return (
    <div className="debug-tool">
      <div className="debug-header">
        <h3>Strumento di Debug</h3>
        <button 
          className="btn btn-danger"
          onClick={() => setIsVisible(false)}
        >
          Chiudi
        </button>
      </div>
      
      <div className="debug-actions">
        <button 
          className="btn btn-primary"
          onClick={runBasicTest}
          disabled={isLoading}
        >
          Test Base Firestore
        </button>
        
        <button 
          className="btn btn-primary"
          onClick={runWorkHoursTest}
          disabled={isLoading}
        >
          Test Ore Lavorative
        </button>
      </div>
      
      {isLoading && <div className="loading">Test in esecuzione...</div>}
      
      {testResults.length > 0 && (
        <div className="debug-results">
          <h4>Risultati dei test:</h4>
          <div className="results-list">
            {testResults.map((result, index) => (
              <div 
                key={index} 
                className={`result-item ${result.status === 'error' ? 'result-error' : 'result-success'}`}
              >
                <strong>{result.step}:</strong> {result.message}
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="debug-info">
        <h4>Configurazione Firebase:</h4>
        <ul>
          <li><strong>Project ID:</strong> {process.env.REACT_APP_FIREBASE_PROJECT_ID || "Non definito"}</li>
          <li><strong>Auth Domain:</strong> {process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "Non definito"}</li>
          <li><strong>Storage Bucket:</strong> {process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "Non definito"}</li>
        </ul>
      </div>
    </div>
  );
};

export default DebugTool;
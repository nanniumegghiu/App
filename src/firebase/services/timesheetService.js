// src/services/timesheetService.js
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';

// Servizio per gestire le operazioni sul timesheet
export const timesheetService = {
  // Ottieni i dati del timesheet per un mese e anno specifici
  async getTimesheetData(month, year) {
    try {
      const q = query(
        collection(db, "timesheet"),
        where("month", "==", month),
        where("year", "==", year),
        orderBy("date", "asc")
      );
      
      const querySnapshot = await getDocs(q);
      
      const data = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      
      return data;
    } catch (error) {
      console.error("Errore durante il recupero del timesheet:", error);
      throw error;
    }
  },
  
  // Aggiungi un nuovo record al timesheet
  async addTimesheetEntry(entryData) {
    try {
      // Estrai mese e anno dalla data
      const date = new Date(entryData.date);
      const month = (date.getMonth() + 1).toString();
      const year = date.getFullYear().toString();
      
      const docRef = await addDoc(collection(db, "timesheet"), {
        ...entryData,
        month,
        year,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      return { id: docRef.id, ...entryData };
    } catch (error) {
      console.error("Errore durante l'aggiunta del record:", error);
      throw error;
    }
  },
  
  // Aggiorna un record esistente
  async updateTimesheetEntry(id, entryData) {
    try {
      // Estrai mese e anno dalla data
      const date = new Date(entryData.date);
      const month = (date.getMonth() + 1).toString();
      const year = date.getFullYear().toString();
      
      const docRef = doc(db, "timesheet", id);
      await updateDoc(docRef, {
        ...entryData,
        month,
        year,
        updatedAt: new Date()
      });
      
      return { id, ...entryData };
    } catch (error) {
      console.error("Errore durante l'aggiornamento del record:", error);
      throw error;
    }
  },
  
  // Elimina un record
  async deleteTimesheetEntry(id) {
    try {
      await deleteDoc(doc(db, "timesheet", id));
      return true;
    } catch (error) {
      console.error("Errore durante l'eliminazione del record:", error);
      throw error;
    }
  }
};

// Servizio per gestire le operazioni sulle segnalazioni
export const reportsService = {
  // Ottieni tutte le segnalazioni di un utente
  async getUserReports(userId) {
    try {
      const q = query(
        collection(db, "reports"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc")
      );
      
      const querySnapshot = await getDocs(q);
      
      const data = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      
      return data;
    } catch (error) {
      console.error("Errore durante il recupero delle segnalazioni:", error);
      throw error;
    }
  },
  
  // Aggiungi una nuova segnalazione
  async addReport(reportData) {
    try {
      const docRef = await addDoc(collection(db, "reports"), {
        ...reportData,
        status: "In attesa",
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      return { id: docRef.id, ...reportData };
    } catch (error) {
      console.error("Errore durante l'aggiunta della segnalazione:", error);
      throw error;
    }
  },
  
  // Aggiorna lo stato di una segnalazione
  async updateReportStatus(id, status) {
    try {
      const docRef = doc(db, "reports", id);
      await updateDoc(docRef, {
        status,
        updatedAt: new Date()
      });
      
      return { id, status };
    } catch (error) {
      console.error("Errore durante l'aggiornamento della segnalazione:", error);
      throw error;
    }
  },
  
  // Ottieni tutte le segnalazioni (per admin)
  async getAllReports() {
    try {
      const q = query(
        collection(db, "reports"),
        orderBy("createdAt", "desc")
      );
      
      const querySnapshot = await getDocs(q);
      
      const data = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      
      return data;
    } catch (error) {
      console.error("Errore durante il recupero di tutte le segnalazioni:", error);
      throw error;
    }
  }
};
// src/services/firestoreService.js
import { db } from '../firebase';
import { 
  doc, 
  collection, 
  getDoc, 
  getDocs,
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy
} from 'firebase/firestore';

// Funzione per recuperare i dati del timesheet dell'utente corrente
export const getUserTimesheet = async (userId, year, month) => {
  try {
    const timesheetRef = doc(db, "timesheets", `${userId}_${year}_${month}`);
    const timesheetDoc = await getDoc(timesheetRef);
    
    if (timesheetDoc.exists()) {
      return timesheetDoc.data().entries || [];
    } else {
      return [];
    }
  } catch (error) {
    console.error("Errore nel recupero timesheet:", error);
    throw error;
  }
};

// Funzione per recuperare le segnalazioni dell'utente
export const getUserReports = async (userId, year, month) => {
  try {
    const reportsQuery = query(
      collection(db, "reports"),
      where("userId", "==", userId),
      where("year", "==", year),
      where("month", "==", month),
      orderBy("date", "desc")
    );
    
    const querySnapshot = await getDocs(reportsQuery);
    const reports = [];
    
    querySnapshot.forEach((doc) => {
      reports.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return reports;
  } catch (error) {
    console.error("Errore nel recupero segnalazioni:", error);
    throw error;
  }
};

// Funzione per inviare una nuova segnalazione
export const submitReport = async (userId, date, description) => {
  try {
    // Estrai anno e mese dalla data
    const [year, month] = date.split('-');
    
    // Crea un nuovo ID per la segnalazione
    const reportId = `${userId}_${date}_${Date.now()}`;
    
    // Data corrente in formato italiano
    const currentDate = getCurrentDate();
    
    // Crea l'oggetto segnalazione
    const reportData = {
      id: reportId,
      userId,
      date,
      year,
      month,
      description,
      status: "In attesa",
      lastUpdate: currentDate
    };
    
    // Salva nel database
    await setDoc(doc(db, "reports", reportId), reportData);
    
    return {
      id: reportId,
      ...reportData
    };
  } catch (error) {
    console.error("Errore nell'invio segnalazione:", error);
    throw error;
  }
};

// Funzione per ottenere la data corrente in formato italiano
export const getCurrentDate = () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
};
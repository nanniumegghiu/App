// src/services/timesheetService.js
import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Recupera il timesheet di un utente per un determinato mese/anno
 * @param {string} userId - ID dell'utente
 * @param {number} month - Mese (1-12)
 * @param {number} year - Anno
 * @returns {Promise<Object>} - Dati del timesheet
 */
export const getUserTimesheet = async (userId, month, year) => {
  try {
    const timesheetId = `${userId}_${year}-${month.toString().padStart(2, '0')}`;
    const timesheetRef = doc(db, "timesheets", timesheetId);
    const timesheetDoc = await getDoc(timesheetRef);
    
    if (timesheetDoc.exists()) {
      return timesheetDoc.data();
    } else {
      return null;
    }
  } catch (error) {
    console.error("Errore nel recupero del timesheet:", error);
    throw error;
  }
};

/**
 * Salva il timesheet di un utente
 * @param {string} userId - ID dell'utente
 * @param {number} month - Mese (1-12)
 * @param {number} year - Anno
 * @param {Object} daysData - Oggetto con i dati dei giorni
 * @returns {Promise<void>}
 */
export const saveUserTimesheet = async (userId, month, year, daysData) => {
  try {
    const timesheetId = `${userId}_${year}-${month.toString().padStart(2, '0')}`;
    const timesheetRef = doc(db, "timesheets", timesheetId);
    
    await setDoc(timesheetRef, {
      userId,
      month,
      year,
      days: daysData,
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    console.error("Errore nel salvataggio del timesheet:", error);
    throw error;
  }
};

/**
 * Verifica se un utente è un amministratore
 * @param {string} userId - ID dell'utente
 * @returns {Promise<boolean>} - true se l'utente è un amministratore
 */
export const checkAdminStatus = async (userId) => {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return userDoc.data().role === "admin";
    }
    
    return false;
  } catch (error) {
    console.error("Errore nella verifica del ruolo admin:", error);
    return false;
  }
};

/**
 * Ottiene la lista di tutti gli utenti
 * @returns {Promise<Array>} - Array di oggetti utente
 */
export const getAllUsers = async () => {
  try {
    const usersRef = collection(db, "users");
    const querySnapshot = await getDocs(usersRef);
    
    const users = [];
    querySnapshot.forEach((doc) => {
      users.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return users;
  } catch (error) {
    console.error("Errore nel recupero degli utenti:", error);
    throw error;
  }
};

/**
 * Genera un array di dati per tutti i giorni di un mese
 * @param {number} month - Mese (1-12)
 * @param {number} year - Anno
 * @returns {Array} - Array di oggetti con informazioni sui giorni
 */
export const getDaysInMonth = (month, year) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayName = getDayName(date.getDay());
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    
    days.push({
      date: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      day,
      dayName,
      isWeekend
    });
  }
  
  return days;
};

/**
 * Restituisce il nome del giorno della settimana
 * @param {number} dayIndex - Indice del giorno (0-6, dove 0 è Domenica)
 * @returns {string} - Nome del giorno
 */
const getDayName = (dayIndex) => {
  const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  return days[dayIndex];
};
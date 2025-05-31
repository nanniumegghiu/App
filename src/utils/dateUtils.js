// src/utils/dateUtils.js - Versione aggiornata con supporto festività
import { isHoliday as checkHoliday } from './holidaysUtils';

/**
 * Formatta una data in formato YYYY-MM-DD in formato DD/MM/YYYY
 * @param {string} dateString - La data in formato YYYY-MM-DD
 * @returns {string} La data formattata come DD/MM/YYYY
 */
export const formatDate = (dateString) => {
  if (!dateString) return '-';
  
  const dateParts = dateString.split('-');
  if (dateParts.length !== 3) return dateString;
  
  return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
};

/**
 * Formatta un timestamp Firestore o una data ISO in formato DD/MM/YYYY
 * @param {Object|string} timestamp - Il timestamp di Firestore o la data in formato ISO
 * @returns {string} La data formattata come DD/MM/YYYY
 */
export const formatTimestamp = (timestamp) => {
  if (!timestamp) return '-';
  
  let date;
  // Gestisce sia timestamp di Firestore che date come string
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }
  
  if (isNaN(date.getTime())) return '-';
  
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
};

/**
 * Restituisce il nome del giorno della settimana per una data
 * @param {string} dateString - La data in formato YYYY-MM-DD
 * @returns {string} Il nome del giorno della settimana in italiano
 */
export const getDayName = (dateString) => {
  if (!dateString) return '-';
  
  const days = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) return '-';
  
  return days[date.getDay()];
};

/**
 * Restituisce il nome del mese dal suo numero
 * @param {string|number} monthNumber - Il numero del mese (1-12)
 * @returns {string} Il nome del mese in italiano
 */
export const getMonthName = (monthNumber) => {
  const months = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", 
    "Maggio", "Giugno", "Luglio", "Agosto", 
    "Settembre", "Ottobre", "Novembre", "Dicembre"
  ];
  return months[parseInt(monthNumber) - 1] || '';
};

/**
 * Ottiene la data corrente in formato YYYY-MM-DD
 * @returns {string} La data corrente in formato YYYY-MM-DD
 */
export const getCurrentDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Genera un array di giorni lavorativi per un mese specifico (AGGIORNATA per includere festività)
 * @param {string|number} month - Il numero del mese (1-12)
 * @param {string|number} year - L'anno
 * @returns {Array} Array di date in formato YYYY-MM-DD
 */
export const generateWorkDaysForMonth = (month, year) => {
  const workDays = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  
  // Assicurati che month e year siano numeri
  const monthNum = parseInt(month, 10);
  const yearNum = parseInt(year, 10);
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(yearNum, monthNum - 1, day);
    const dayOfWeek = date.getDay();
    
    // Esclude sabato (6) e domenica (0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const formattedDay = day.toString().padStart(2, '0');
      const formattedMonth = monthNum.toString().padStart(2, '0');
      const dateString = `${yearNum}-${formattedMonth}-${formattedDay}`;
      
      // Controlla se non è una festività utilizzando la nuova utility
      const holidayInfo = checkHoliday(dateString);
      if (!holidayInfo.isHoliday) {
        workDays.push(dateString);
      }
    }
  }
  
  return workDays;
};

/**
 * Controlla se una data è festiva (mantenuta per compatibilità, ora usa holidaysUtils)
 * @param {string} dateString - La data in formato YYYY-MM-DD
 * @returns {boolean} True se la data è festiva, altrimenti false
 */
export const isHoliday = (dateString) => {
  const holidayInfo = checkHoliday(dateString);
  return holidayInfo.isHoliday;
};

/**
 * NUOVA: Ottiene informazioni complete su un giorno lavorativo
 * @param {string} dateString - La data in formato YYYY-MM-DD
 * @returns {Object} Informazioni complete sul giorno
 */
export const getWorkDayInfo = (dateString) => {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const holidayInfo = checkHoliday(dateString);
    
    return {
      date: dateString,
      dayName: getDayName(dateString),
      dayOfWeek,
      isWeekend,
      isHoliday: holidayInfo.isHoliday,
      holidayName: holidayInfo.holidayName,
      isWorkingDay: !isWeekend && !holidayInfo.isHoliday,
      dayType: holidayInfo.isHoliday ? 'holiday' : (isWeekend ? 'weekend' : 'workday')
    };
  } catch (error) {
    console.error('Errore nel calcolo info giorno lavorativo:', error);
    return null;
  }
};

/**
 * NUOVA: Conta i giorni lavorativi effettivi in un mese (escludendo weekend e festività)
 * @param {string|number} month - Il numero del mese (1-12)
 * @param {string|number} year - L'anno
 * @returns {Object} Statistiche sui giorni del mese
 */
export const getMonthWorkingDaysStats = (month, year) => {
  const monthNum = parseInt(month, 10);
  const yearNum = parseInt(year, 10);
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  
  let workingDays = 0;
  let weekendDays = 0;
  let holidayDays = 0;
  let holidayWeekendDays = 0; // Festività che cadono nel weekend
  
  const holidays = [];
  
  for (let day = 1; day <= daysInMonth; day++) {
    const formattedDay = day.toString().padStart(2, '0');
    const formattedMonth = monthNum.toString().padStart(2, '0');
    const dateString = `${yearNum}-${formattedMonth}-${formattedDay}`;
    
    const dayInfo = getWorkDayInfo(dateString);
    
    if (dayInfo) {
      if (dayInfo.isHoliday && dayInfo.isWeekend) {
        holidayWeekendDays++;
        holidays.push({ date: dateString, name: dayInfo.holidayName, isWeekend: true });
      } else if (dayInfo.isHoliday) {
        holidayDays++;
        holidays.push({ date: dateString, name: dayInfo.holidayName, isWeekend: false });
      } else if (dayInfo.isWeekend) {
        weekendDays++;
      } else {
        workingDays++;
      }
    }
  }
  
  return {
    totalDays: daysInMonth,
    workingDays,
    weekendDays,
    holidayDays,
    holidayWeekendDays,
    nonWorkingDays: weekendDays + holidayDays,
    holidays,
    month: monthNum,
    year: yearNum,
    monthName: getMonthName(monthNum)
  };
};

/**
 * NUOVA: Verifica se una data è un giorno lavorativo
 * @param {string} dateString - La data in formato YYYY-MM-DD
 * @returns {boolean} True se è un giorno lavorativo
 */
export const isWorkingDay = (dateString) => {
  const dayInfo = getWorkDayInfo(dateString);
  return dayInfo ? dayInfo.isWorkingDay : false;
};

/**
 * NUOVA: Ottiene la prossima data lavorativa
 * @param {string} dateString - La data di partenza in formato YYYY-MM-DD
 * @param {number} daysToAdd - Numero di giorni lavorativi da aggiungere (default: 1)
 * @returns {string} La prossima data lavorativa in formato YYYY-MM-DD
 */
export const getNextWorkingDay = (dateString, daysToAdd = 1) => {
  let currentDate = new Date(dateString);
  let addedDays = 0;
  
  while (addedDays < daysToAdd) {
    currentDate.setDate(currentDate.getDate() + 1);
    
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const currentDateString = `${year}-${month}-${day}`;
    
    if (isWorkingDay(currentDateString)) {
      addedDays++;
    }
  }
  
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const day = String(currentDate.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * NUOVA: Calcola i giorni lavorativi tra due date
 * @param {string} startDate - Data di inizio in formato YYYY-MM-DD
 * @param {string} endDate - Data di fine in formato YYYY-MM-DD
 * @returns {number} Numero di giorni lavorativi tra le due date (incluse)
 */
export const getWorkingDaysBetween = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (start > end) {
    return 0;
  }
  
  let workingDays = 0;
  const currentDate = new Date(start);
  
  while (currentDate <= end) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    
    if (isWorkingDay(dateString)) {
      workingDays++;
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return workingDays;
};
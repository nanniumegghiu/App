// src/utils/dateUtils.js
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
   * Genera un array di giorni lavorativi per un mese specifico
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
        
        // Controlla se non è una festività
        if (!isHoliday(dateString)) {
          workDays.push(dateString);
        }
      }
    }
    
    return workDays;
  };
  
  /**
   * Controlla se una data è festiva (festività nazionali italiane)
   * @param {string} dateString - La data in formato YYYY-MM-DD
   * @returns {boolean} True se la data è festiva, altrimenti false
   */
  export const isHoliday = (dateString) => {
    const holidays = [
      // Festività fisse
      `-01-01`, // Capodanno
      `-01-06`, // Epifania
      `-04-25`, // Festa della Liberazione
      `-05-01`, // Festa del Lavoro
      `-06-02`, // Festa della Repubblica
      `-08-15`, // Ferragosto
      `-11-01`, // Tutti i Santi
      `-12-08`, // Immacolata Concezione
      `-12-25`, // Natale
      `-12-26`, // Santo Stefano
    ];
    
    // Controlla festività fisse
    for (const holiday of holidays) {
      const fullDate = dateString.substring(0, 5) + holiday;
      if (dateString === fullDate) {
        return true;
      }
    }
    
    // Qui si potrebbero aggiungere anche le festività mobili come Pasqua,
    // Lunedì dell'Angelo, ecc. ma richiedono calcoli più complessi
    
    return false;
  };
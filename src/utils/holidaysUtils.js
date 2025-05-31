// src/utils/holidaysUtils.js - Utility per gestire le festività italiane
export const FIXED_HOLIDAYS = {
  '01-01': 'Capodanno',
  '01-06': 'Epifania',
  '04-25': 'Festa della Liberazione',
  '05-01': 'Festa del Lavoro',
  '06-02': 'Festa della Repubblica',
  '08-15': 'Ferragosto',
  '11-01': 'Ognissanti',
  '12-08': 'Immacolata Concezione',
  '12-25': 'Natale',
  '12-26': 'Santo Stefano'
};

/**
 * Calcola la data di Pasqua per un dato anno (algoritmo di Gauss)
 * @param {number} year - Anno
 * @returns {Date} - Data di Pasqua
 */
export const calculateEaster = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  
  return new Date(year, month - 1, day);
};

/**
 * Calcola le festività mobili per un dato anno
 * @param {number} year - Anno
 * @returns {Object} - Oggetto con le date delle festività mobili
 */
export const calculateMobileHolidays = (year) => {
  const easter = calculateEaster(year);
  
  // Lunedì dell'Angelo (Pasquetta) - giorno dopo Pasqua
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);
  
  return {
    easter: easter,
    easterMonday: easterMonday
  };
};

/**
 * Formatta una data nel formato MM-DD
 * @param {Date} date - Data
 * @returns {string} - Data formattata come MM-DD
 */
const formatDateKey = (date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
};

/**
 * Ottiene tutte le festività per un dato anno
 * @param {number} year - Anno
 * @returns {Object} - Oggetto con chiave MM-DD e valore nome festività
 */
export const getHolidaysForYear = (year) => {
  const holidays = { ...FIXED_HOLIDAYS };
  
  // Aggiungi festività mobili
  const mobileHolidays = calculateMobileHolidays(year);
  
  holidays[formatDateKey(mobileHolidays.easter)] = 'Pasqua';
  holidays[formatDateKey(mobileHolidays.easterMonday)] = 'Lunedì dell\'Angelo';
  
  return holidays;
};

/**
 * Verifica se una data è festiva
 * @param {string} dateString - Data in formato YYYY-MM-DD
 * @returns {Object} - { isHoliday: boolean, holidayName: string }
 */
export const isHoliday = (dateString) => {
  if (!dateString) return { isHoliday: false, holidayName: null };
  
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    const holidays = getHolidaysForYear(year);
    const dateKey = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    const holidayName = holidays[dateKey];
    
    return {
      isHoliday: !!holidayName,
      holidayName: holidayName || null
    };
  } catch (error) {
    console.error('Errore nel controllo festività:', error);
    return { isHoliday: false, holidayName: null };
  }
};

/**
 * Ottiene informazioni complete su un giorno (weekend + festività)
 * @param {string} dateString - Data in formato YYYY-MM-DD
 * @returns {Object} - Informazioni complete sul giorno
 */
export const getDayInfo = (dateString) => {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const holidayInfo = isHoliday(dateString);
    
    return {
      date: dateString,
      dayOfWeek,
      isWeekend,
      isHoliday: holidayInfo.isHoliday,
      holidayName: holidayInfo.holidayName,
      isNonWorkingDay: isWeekend || holidayInfo.isHoliday,
      dayType: holidayInfo.isHoliday ? 'holiday' : (isWeekend ? 'weekend' : 'workday')
    };
  } catch (error) {
    console.error('Errore nel calcolo info giorno:', error);
    return null;
  }
};

/**
 * Ottiene tutte le festività di un mese specifico
 * @param {number} month - Mese (1-12)
 * @param {number} year - Anno
 * @returns {Array} - Array di oggetti con data e nome festività
 */
export const getMonthHolidays = (month, year) => {
  const holidays = getHolidaysForYear(year);
  const monthHolidays = [];
  
  Object.entries(holidays).forEach(([dateKey, name]) => {
    const [holidayMonth] = dateKey.split('-').map(Number);
    if (holidayMonth === month) {
      const [, day] = dateKey.split('-').map(Number);
      const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      monthHolidays.push({
        date: dateString,
        name,
        day
      });
    }
  });
  
  return monthHolidays.sort((a, b) => a.day - b.day);
};

/**
 * Conta i giorni lavorativi in un mese (escludendo weekend e festività)
 * @param {number} month - Mese (1-12)
 * @param {number} year - Anno
 * @returns {number} - Numero di giorni lavorativi
 */
export const getWorkingDaysInMonth = (month, year) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayInfo = getDayInfo(dateString);
    
    if (dayInfo && !dayInfo.isNonWorkingDay) {
      workingDays++;
    }
  }
  
  return workingDays;
};
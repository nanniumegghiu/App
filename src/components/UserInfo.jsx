import React, { useEffect, useState } from 'react';

const UserInfo = ({ selectedMonth, setSelectedMonth }) => {
  const [availableMonths, setAvailableMonths] = useState([]);

  useEffect(() => {
    // Ottieni la data corrente
    const currentDate = new Date();
    const currentDay = currentDate.getDate();
    const currentMonth = currentDate.getMonth() + 1; // getMonth() restituisce 0-11
    const currentYear = currentDate.getFullYear();

    // Calcola il mese precedente
    let previousMonth = currentMonth - 1;
    let previousYear = currentYear;

    // Gestisci il caso di gennaio (in cui il mese precedente è dicembre dell'anno precedente)
    if (previousMonth === 0) {
      previousMonth = 12;
      previousYear = currentYear - 1;
    }

    // Determina quale mese dovrebbe essere visualizzato di default
    const defaultMonth = currentDay >= 5 ? currentMonth.toString() : `prev-${previousMonth}`;

    // Costruisci l'array dei mesi disponibili
    const months = [
      { value: currentMonth.toString(), label: `${getMonthName(currentMonth)} ${currentYear}` },
      { value: `prev-${previousMonth}`, label: `${getMonthName(previousMonth)} ${previousYear}` }
    ];

    setAvailableMonths(months);

    // Se il mese selezionato non è tra quelli disponibili, imposta il mese di default
    const isValidSelection = months.some(month => month.value === selectedMonth);
    if (!isValidSelection) {
      setSelectedMonth(defaultMonth);
    }
  }, [setSelectedMonth, selectedMonth]);

  // Funzione per ottenere il nome del mese in italiano
  const getMonthName = (monthNumber) => {
    const monthNames = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
      "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
    ];
    return monthNames[monthNumber - 1]; // L'array inizia da 0, i mesi da 1
  };

  const handleMonthChange = (e) => {
    setSelectedMonth(e.target.value);
  };

  return (
    <div className="user-info">
      <div>
        <h2>Verifica le tue ore e segnala eventuali errori</h2>
      </div>
      <div>
        <label htmlFor="month-select">Seleziona Mese: </label>
        <select 
          id="month-select" 
          value={selectedMonth} 
          onChange={handleMonthChange}
        >
          {availableMonths.map((month) => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default UserInfo;
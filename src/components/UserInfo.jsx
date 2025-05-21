// src/components/UserInfo.jsx (modificato)
import React, { useEffect, useState } from 'react';
import UserQRCode from './UserQRCode'; // Importa il componente QRCode
import './userQRCode.css'; // Importa gli stili del QRCode

const UserInfo = ({ selectedMonth, setSelectedMonth, selectedYear, setSelectedYear }) => {
  const [availableMonths, setAvailableMonths] = useState([]);
  const [showQRCode, setShowQRCode] = useState(false); // Stato per mostrare/nascondere il QR code

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
    const defaultMonth = currentDay >= 5 ? currentMonth.toString() : previousMonth.toString();
    const defaultYear = currentDay >= 5 ? currentYear.toString() : previousYear.toString();

    // Costruisci l'array dei mesi disponibili
    const months = [
      { value: currentMonth.toString(), label: `${getMonthName(currentMonth)} ${currentYear}`, year: currentYear.toString() },
      { value: previousMonth.toString(), label: `${getMonthName(previousMonth)} ${previousYear}`, year: previousYear.toString() }
    ];

    setAvailableMonths(months);

    // Se il mese selezionato non è tra quelli disponibili, imposta il mese di default
    if (!selectedMonth || !selectedYear) {
      setSelectedMonth(defaultMonth);
      setSelectedYear(defaultYear);
    }
  }, [setSelectedMonth, setSelectedYear, selectedMonth, selectedYear]);

  // Funzione per ottenere il nome del mese in italiano
  const getMonthName = (monthNumber) => {
    const monthNames = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
      "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
    ];
    return monthNames[monthNumber - 1]; // L'array inizia da 0, i mesi da 1
  };

  const handleMonthChange = (e) => {
    const selectedOption = availableMonths.find(month => month.value === e.target.value);
    if (selectedOption) {
      setSelectedMonth(selectedOption.value);
      setSelectedYear(selectedOption.year);
    }
  };

  // Toggle per mostrare/nascondere il QR code
  const toggleQRCode = () => {
    setShowQRCode(!showQRCode);
  };

  return (
    <div className="user-info-container">
      <div className="user-info">
        <div>
          <h2>Verifica le tue ore e segnala eventuali errori</h2>
        </div>
        <div className="user-actions">
          <div className="month-selector">
            <label htmlFor="month-select">Seleziona Mese: </label>
            <select 
              id="month-select" 
              value={selectedMonth} 
              onChange={handleMonthChange}
            >
              {availableMonths.map((month) => (
                <option key={`${month.value}-${month.year}`} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>
          <button 
            className="btn btn-primary qrcode-toggle-btn"
            onClick={toggleQRCode}
          >
            {showQRCode ? "Nascondi QR Code" : "Mostra QR Code"}
          </button>
        </div>
      </div>
      
      {/* QR Code container */}
      {showQRCode && (
        <div className="qrcode-container">
          <UserQRCode />
        </div>
      )}
    </div>
  );
};

export default UserInfo;
// src/components/YearSelector.jsx - Componente riutilizzabile per selezione anno
import React from 'react';

/**
 * Componente per la selezione dell'anno che si aggiorna automaticamente
 * @param {Object} props
 * @param {string} props.value - Anno selezionato
 * @param {function} props.onChange - Callback per il cambio anno
 * @param {number} props.yearsBack - Quanti anni indietro mostrare (default: 3)
 * @param {number} props.yearsForward - Quanti anni avanti mostrare (default: 1)
 * @param {string} props.className - Classe CSS opzionale
 * @param {string} props.id - ID opzionale
 */
const YearSelector = ({ 
  value, 
  onChange, 
  yearsBack = 3, 
  yearsForward = 1, 
  className = "form-control",
  id = "year-select"
}) => {
  // Calcola l'anno corrente
  const currentYear = new Date().getFullYear();
  
  // Genera array di anni disponibili
  const generateYearOptions = () => {
    const years = [];
    
    // Aggiungi anni futuri
    for (let i = yearsForward; i >= 1; i--) {
      years.push(currentYear + i);
    }
    
    // Aggiungi anno corrente
    years.push(currentYear);
    
    // Aggiungi anni passati
    for (let i = 1; i <= yearsBack; i++) {
      years.push(currentYear - i);
    }
    
    return years.sort((a, b) => b - a); // Ordine decrescente (più recenti prima)
  };
  
  const availableYears = generateYearOptions();
  
  return (
    <select 
      id={id}
      value={value} 
      onChange={onChange}
      className={className}
    >
      {availableYears.map(year => (
        <option key={year} value={year.toString()}>
          {year}
        </option>
      ))}
    </select>
  );
};

export default YearSelector;
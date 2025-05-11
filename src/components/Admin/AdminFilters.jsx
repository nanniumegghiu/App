// src/components/Admin/AdminFilters.jsx
import React, { useState, useEffect } from 'react';
import { getMonthName } from '../../utils/dateUtils';

const AdminFilters = ({ filters, setFilters, reports }) => {
  const [availableMonths, setAvailableMonths] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);

  // Estrai valori unici per i filtri dai dati
  useEffect(() => {
    if (reports && reports.length > 0) {
      // Estrai mesi unici
      const months = [...new Set(reports.map(report => report.month))].sort();
      setAvailableMonths(months);

      // Estrai anni unici
      const years = [...new Set(reports.map(report => report.year))].sort((a, b) => b - a);
      setAvailableYears(years);

      // Estrai utenti unici
      const users = [...new Set(reports.map(report => report.userEmail))].sort();
      setAvailableUsers(users);
    }
  }, [reports]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const resetFilters = () => {
    setFilters({
      month: '',
      year: '',
      status: '',
      user: ''
    });
  };

  return (
    <div className="admin-filters">
      <h3>Filtra Segnalazioni</h3>
      <div className="filters-container">
        <div className="filter-group">
          <label htmlFor="month-filter">Mese:</label>
          <select
            id="month-filter"
            name="month"
            value={filters.month}
            onChange={handleFilterChange}
          >
            <option value="">Tutti i mesi</option>
            {availableMonths.map(month => (
              <option key={month} value={month}>
                {getMonthName(month)}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="year-filter">Anno:</label>
          <select
            id="year-filter"
            name="year"
            value={filters.year}
            onChange={handleFilterChange}
          >
            <option value="">Tutti gli anni</option>
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="status-filter">Stato:</label>
          <select
            id="status-filter"
            name="status"
            value={filters.status}
            onChange={handleFilterChange}
          >
            <option value="">Tutti gli stati</option>
            <option value="In attesa">In attesa</option>
            <option value="Presa in carico">Presa in carico</option>
            <option value="Conclusa">Conclusa</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="user-filter">Utente:</label>
          <select
            id="user-filter"
            name="user"
            value={filters.user}
            onChange={handleFilterChange}
          >
            <option value="">Tutti gli utenti</option>
            {availableUsers.map(user => (
              <option key={user} value={user}>{user}</option>
            ))}
          </select>
        </div>

        <button className="btn btn-primary" onClick={resetFilters}>
          Reset Filtri
        </button>
      </div>
    </div>
  );
};

export default AdminFilters;
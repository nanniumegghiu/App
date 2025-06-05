// src/components/UserNavigation.jsx (modificato)
import React from 'react';
import './user-navigation.css';

const UserNavigation = ({ activeTab, onTabChange }) => {
  return (
    <div className="user-navigation">
      <button 
        className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
        onClick={() => onTabChange('dashboard')}
      >
        Dashboard
      </button>
      <button 
        className={`tab-button ${activeTab === 'hours' ? 'active' : ''}`}
        onClick={() => onTabChange('hours')}
      >
        Gestione Ore
      </button>
      <button 
        className={`tab-button ${activeTab === 'requests' ? 'active' : ''}`}
        onClick={() => onTabChange('requests')}
      >
        Richieste Permessi/Ferie/Malattia
      </button>
    </div>
  );
};

export default UserNavigation;
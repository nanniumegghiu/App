// src/components/UserNavigation.jsx
import React from 'react';

const UserNavigation = ({ activeTab, onTabChange }) => {
  return (
    <div className="user-navigation">
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
        Richieste Permessi/Ferie
      </button>
    </div>
  );
};

export default UserNavigation;
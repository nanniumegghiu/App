import React, { useEffect } from 'react';

const Notification = ({ message, isVisible, onClose, type = "success" }) => {
  // Nascondi la notifica dopo 3 secondi
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  // Determina il colore di sfondo in base al tipo
  const getBackgroundColor = () => {
    switch (type) {
      case "error":
        return 'var(--danger)';
      case "warning":
        return '#f39c12';
      case "info":
        return '#3498db';
      case "success":
      default:
        return 'var(--success)';
    }
  };

  const notificationStyle = {
    backgroundColor: getBackgroundColor(),
    color: 'white',
    padding: '15px',
    marginBottom: '20px',
    borderRadius: '5px',
    display: isVisible ? 'flex' : 'none',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
  };

  const closeButtonStyle = {
    background: 'none',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '0',
    marginLeft: '15px'
  };

  return (
    <div className="notification" style={notificationStyle}>
      <div>{message}</div>
      <button style={closeButtonStyle} onClick={onClose}>×</button>
    </div>
  );
};

export default Notification;
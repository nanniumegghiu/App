// src/components/EmptyState.jsx
import React from 'react';

const EmptyState = ({ message, icon, actionButton }) => {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <p className="empty-state-message">{message}</p>
      {actionButton && (
        <div className="empty-state-action">
          {actionButton}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
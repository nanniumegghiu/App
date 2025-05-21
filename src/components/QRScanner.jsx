// src/components/QRScanner.jsx
import React, { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

/**
 * Componente per la scansione di QR code
 * @param {Object} props
 * @param {Function} props.onScanSuccess - Callback chiamata quando un QR code viene rilevato
 * @param {Function} props.onScanError - Callback chiamata in caso di errore (opzionale)
 * @param {boolean} props.isActive - Se true, lo scanner è attivo
 * @param {string} props.className - Classe CSS opzionale
 */
const QRScanner = ({ onScanSuccess, onScanError, isActive = true, className = '' }) => {
  const [scanner, setScanner] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);

  // Inizializza lo scanner QR
  useEffect(() => {
    // Config per lo scanner
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      rememberLastUsedCamera: true,
      // Aspetto
      formatsToSupport: [ Html5QrcodeScanner.FORMATS.QR_CODE ]
    };

    if (isActive && !scanner) {
      // Crea una nuova istanza dello scanner
      const qrScanner = new Html5QrcodeScanner(
        "qr-reader",
        config,
        /* verbose= */ false
      );

      // Definisci le funzioni per gestire successo ed errore
      const handleScanSuccess = (decodedText, decodedResult) => {
        console.log(`QR Code scansionato: ${decodedText}`, decodedResult);
        
        // Aggiorna lo stato del componente
        setScanResult(decodedText);
        setIsScanning(false);
        setError(null);
        
        // Chiama la callback fornita dal genitore
        if (onScanSuccess) {
          onScanSuccess(decodedText, decodedResult);
        }
        
        // Opzionalmente, fermati dopo una scansione riuscita
        // qrScanner.clear();
      };

      const handleScanError = (errorMessage) => {
        console.error(`Errore scansione QR code: ${errorMessage}`);
        
        // Aggiorna lo stato di errore
        setError(errorMessage);
        
        // Chiama la callback di errore se fornita
        if (onScanError) {
          onScanError(errorMessage);
        }
      };

      // Inizia la scansione
      qrScanner.render(handleScanSuccess, handleScanError);
      
      // Salva l'istanza dello scanner
      setScanner(qrScanner);
      setIsScanning(true);
    }

    // Pulizia al dismontaggio del componente
    return () => {
      if (scanner) {
        scanner.clear().catch(error => {
          console.error("Errore nella pulizia dello scanner:", error);
        });
      }
    };
  }, [isActive, scanner, onScanSuccess, onScanError]);

  // Aggiorna lo scanner quando isActive cambia
  useEffect(() => {
    if (scanner) {
      if (isActive && !isScanning) {
        setIsScanning(true);
        // Riavvia lo scanner se era stato fermato
        scanner.render(() => {}, () => {});
      } else if (!isActive && isScanning) {
        setIsScanning(false);
        // Ferma lo scanner
        scanner.clear().catch(error => {
          console.error("Errore nella pulizia dello scanner:", error);
        });
      }
    }
  }, [isActive, scanner, isScanning]);

  return (
    <div className={`qr-scanner-container ${className}`}>
      <div id="qr-reader" className="qr-reader"></div>
      
      {scanResult && (
        <div className="qr-result success">
          <h4>QR Code rilevato!</h4>
          <p className="qr-result-text">{scanResult}</p>
        </div>
      )}
      
      {error && (
        <div className="qr-result error">
          <h4>Errore nella scansione</h4>
          <p className="qr-error-text">{error}</p>
        </div>
      )}
    </div>
  );
};

export default QRScanner;
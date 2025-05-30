// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  addDoc
} from "firebase/firestore";
import { 
  getStorage, 
  ref as storageRef, 
  uploadBytes as storageUploadBytes, 
  getDownloadURL as storageGetDownloadURL, 
  deleteObject as storageDeleteObject 
} from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDTCte23T93ucmDqdMUq0R16A08RhbAJXg",
  authDomain: "app-ore-utenti.firebaseapp.com",
  projectId: "app-ore-utenti",
  storageBucket: "app-ore-utenti.firebasestorage.app",
  messagingSenderId: "881014422624",
  appId: "1:881014422624:web:514706d1c69b82feeb5705",
  measurementId: "G-265PX55B0Y"
};

// Inizializza Firebase
const app = initializeApp(firebaseConfig);

// Esporta autenticazione, database e storage
export const auth = getAuth(app);
export const db = getFirestore(app);
export const firebaseStorage = getStorage(app);

// Esporta onAuthStateChanged da Firebase
export { onAuthStateChanged } from "firebase/auth";

// COSTANTI E UTILITY
// Tipi di file consentiti per i certificati medici
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
// Dimensione massima del file (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Funzioni di utilità per la validazione dei file
const isValidFileType = (file) => {
  return ALLOWED_FILE_TYPES.includes(file.type);
};

const isValidFileSize = (file) => {
  return file.size <= MAX_FILE_SIZE;
};

// Genera un nome di file unico basato sul timestamp
const generateUniqueFileName = (originalFileName) => {
  const timestamp = new Date().getTime();
  const extension = originalFileName.split('.').pop().toLowerCase();
  return `${timestamp}_${Math.random().toString(36).substring(2, 8)}.${extension}`;
};

// Funzioni per l'autenticazione
export const loginWithEmail = (email, password) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const registerWithEmail = async (email, password, userData) => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  // Salva i dati utente nel database
  await setDoc(doc(db, "users", user.uid), {
    ...userData,
    email: user.email,
    createdAt: serverTimestamp(),
    role: userData.role || "user" // Default a "user" se non specificato
  });
  
  return userCredential;
};

export const logoutUser = () => {
  return signOut(auth);
};

// Funzioni per gli utenti
export const getUserData = async (userId) => {
  const docRef = doc(db, "users", userId);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  
  return null;
};

export const getAllUsers = async () => {
  const usersCollection = collection(db, "users");
  const userSnapshot = await getDocs(usersCollection);
  
  return userSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

export const updateUserData = async (userId, userData) => {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    ...userData,
    updatedAt: serverTimestamp()
  });
};

// Funzioni per le segnalazioni (reports)
export const addReport = async (reportData) => {
  try {
    const reportsCollection = collection(db, "reports");
    const docRef = await addDoc(reportsCollection, {
      ...reportData,
      createdAt: serverTimestamp(),
      lastUpdate: serverTimestamp()
    });
    return { id: docRef.id, ...reportData };
  } catch (error) {
    console.error("Errore nell'aggiunta della segnalazione:", error);
    throw error;
  }
};

export const getAllReports = async () => {
  const reportsCollection = collection(db, "reports");
  const q = query(reportsCollection, orderBy("createdAt", "desc"));
  const reportSnapshot = await getDocs(q);
  
  return reportSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate?.() || new Date(),
    lastUpdate: doc.data().lastUpdate?.toDate?.() || new Date()
  }));
};

export const getUserReportsByMonth = async (userId, month, year) => {
  console.log(`getUserReportsByMonth: Avvio con userId=${userId}, month=${month}, year=${year}`);
  
  try {
    if (!userId) throw new Error("userId è obbligatorio");
    if (!month) throw new Error("month è obbligatorio");
    if (!year) throw new Error("year è obbligatorio");
    
    // Rimuovi eventuali prefissi (come "prev-") e zeri iniziali
    let normalizedMonth = month.toString().replace(/^prev-/, '').replace(/^0+/, '');
    
    // Se il mese è vuoto dopo la normalizzazione, usa il valore originale
    if (!normalizedMonth) normalizedMonth = month;
    
    // Formato con zero iniziale per query alternative
    let paddedMonth = normalizedMonth.length === 1 ? normalizedMonth.padStart(2, '0') : normalizedMonth;
    
    console.log(`getUserReportsByMonth: Parametri normalizzati - userId=${userId}, normalizedMonth=${normalizedMonth}, paddedMonth=${paddedMonth}, year=${year}`);
    
    const reportsCollection = collection(db, "reports");
    
    // Prima prova con il formato normalizzato
    let q = query(
      reportsCollection, 
      where("userId", "==", userId),
      where("month", "==", normalizedMonth),
      where("year", "==", year)
    );
    
    console.log("getUserReportsByMonth: Esecuzione query con mese normalizzato...");
    let querySnapshot = await getDocs(q);
    
    // Se non trova risultati, prova con il formato con zero iniziale
    if (querySnapshot.empty && normalizedMonth !== paddedMonth) {
      console.log(`getUserReportsByMonth: Nessun risultato trovato, tento con month=${paddedMonth}`);
      
      q = query(
        reportsCollection, 
        where("userId", "==", userId),
        where("month", "==", paddedMonth),
        where("year", "==", year)
      );
      
      querySnapshot = await getDocs(q);
    }
    
    // Se ancora non trova risultati, prova una query più generica
    if (querySnapshot.empty) {
      console.log("getUserReportsByMonth: Nessun risultato trovato con entrambi i formati, eseguo query generica");
      
      q = query(
        reportsCollection, 
        where("userId", "==", userId),
        where("year", "==", year)
      );
      
      querySnapshot = await getDocs(q);
      
      // Filtra manualmente i risultati per il mese
      if (!querySnapshot.empty) {
        const allResults = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || new Date(),
            lastUpdate: data.lastUpdate?.toDate?.() || new Date()
          };
        });
        
        // Filtra i report che corrispondono al mese (sia formato con zero che senza zero)
        const filteredResults = allResults.filter(report => {
          const reportMonth = report.month.toString().replace(/^0+/, '');
          return reportMonth === normalizedMonth;
        });
        
        console.log(`getUserReportsByMonth: Query generica trovata, filtrati ${filteredResults.length} risultati per il mese ${normalizedMonth}`);
        return filteredResults;
      }
    }
    
    console.log(`getUserReportsByMonth: Query completata, ${querySnapshot.size} risultati trovati`);
    
    // Converti i dati dal formato Firestore
    const reports = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date(),
        lastUpdate: data.lastUpdate?.toDate?.() || new Date()
      };
    });
    
    console.log("getUserReportsByMonth: Segnalazioni caricate:", reports);
    return reports;
  } catch (error) {
    console.error("getUserReportsByMonth: Errore nel recupero delle segnalazioni:", error);
    throw error;
  }
};

export const submitReport = async (reportData, userId) => {
  console.log("submitReport: Tentativo di inviare una segnalazione:", reportData);
  console.log("submitReport: userId:", userId);
  
  if (!reportData) throw new Error("reportData è obbligatorio");
  if (!userId) throw new Error("userId è obbligatorio");
  if (!reportData.date) throw new Error("date è obbligatorio");
  if (!reportData.description) throw new Error("description è obbligatorio");
  
  try {
    // Ottieni i dati dell'utente
    const user = await getUserData(userId);
    console.log("submitReport: Dati utente ottenuti:", user);
    
    if (!user) {
      throw new Error("Utente non trovato");
    }
    
    // Estrai mese e anno dalla data della segnalazione
    let year, month;
    
    if (reportData.date.includes('-')) {
      // Se è nel formato YYYY-MM-DD
      const dateParts = reportData.date.split("-");
      year = dateParts[0];
      month = dateParts[1];
      
      // Rimuovi eventuali zeri iniziali dal mese
      month = month.replace(/^0+/, '');
    } else if (reportData.date.includes('/')) {
      // Se è nel formato DD/MM/YYYY
      const dateParts = reportData.date.split("/");
      year = dateParts[2];
      month = dateParts[1];
      
      // Rimuovi eventuali zeri iniziali dal mese
      month = month.replace(/^0+/, '');
    } else {
      // Fallback: usa l'anno e il mese corrente
      const now = new Date();
      year = now.getFullYear().toString();
      month = (now.getMonth() + 1).toString();
    }
    
    console.log(`submitReport: Data parsata - anno: ${year}, mese: ${month}`);
    
    // Crea l'oggetto segnalazione
    const reportObject = {
      ...reportData,
      userId,
      userEmail: user.email || "",
      userName: user.nome && user.cognome ? `${user.nome} ${user.cognome}` : user.email,
      month,
      year,
      status: "In attesa",
      createdAt: serverTimestamp(),
      lastUpdate: serverTimestamp()
    };
    
    console.log("submitReport: Oggetto segnalazione completo:", reportObject);
    
    // Aggiungi la segnalazione alla collezione reports
    const reportsCollection = collection(db, "reports");
    const docRef = await addDoc(reportsCollection, reportObject);
    
    console.log("submitReport: Segnalazione inviata con successo, ID:", docRef.id);
    
    return {
      id: docRef.id,
      ...reportObject,
      createdAt: new Date(),
      lastUpdate: new Date()
    };
  } catch (error) {
    console.error("submitReport: Errore nell'invio della segnalazione:", error);
    throw error;
  }
};

export const updateReportStatus = async (reportId, newStatus) => {
  console.log(`updateReportStatus: Aggiornamento stato per reportId=${reportId} a ${newStatus}`);
  
  try {
    if (!reportId) throw new Error("reportId è obbligatorio");
    if (!newStatus) throw new Error("newStatus è obbligatorio");
    
    const reportRef = doc(db, "reports", reportId);
    
    // Controlla che il documento esista
    const docSnap = await getDoc(reportRef);
    if (!docSnap.exists()) {
      throw new Error(`Segnalazione con ID ${reportId} non trovata`);
    }
    
    await updateDoc(reportRef, {
      status: newStatus,
      lastUpdate: serverTimestamp()
    });
    
    console.log(`updateReportStatus: Stato aggiornato con successo a ${newStatus}`);
    return true;
  } catch (error) {
    console.error(`updateReportStatus: Errore nell'aggiornamento dello stato:`, error);
    throw error;
  }
};

export const saveWorkHours = async (userId, month, year, entries) => {
  try {
    console.log(`saveWorkHours: userId=${userId}, month=${month}, year=${year}`);
    console.log(`Entries da salvare:`, entries.length);
    
    // Normalizza il mese
    const normalizedMonth = month.toString().replace(/^0+/, '');
    
    // ID del documento
    const docId = `${userId}_${normalizedMonth}_${year}`;
    const docRef = doc(db, "workHours", docId);
    
    // MIGLIORAMENTO: Prepara le entries per il salvataggio con gestione lettere speciali
    const processedEntries = entries.map(entry => {
      // Gestisci i valori speciali
      let totalValue = entry.total;
      
      // Se è una lettera speciale (M, P, F, A), mantienila come stringa
      if (["M", "P", "F", "A"].includes(entry.total)) {
        totalValue = entry.total;
      } else {
        // Altrimenti converti in numero
        totalValue = parseInt(entry.total) || 0;
      }
      
      return {
        date: entry.date,
        day: entry.day,
        total: totalValue,
        overtime: parseInt(entry.overtime) || 0,
        notes: entry.notes || "",
        isWeekend: entry.isWeekend || false
      };
    });
    
    // Salva il documento
    await setDoc(docRef, {
      userId,
      month: normalizedMonth,
      year: year.toString(),
      entries: processedEntries,
      lastUpdated: serverTimestamp()
    });
    
    console.log(`WorkHours salvate con successo: ${docId}`);
    return { success: true, docId };
    
  } catch (error) {
    console.error("Errore nel salvataggio delle ore lavorative:", error);
    throw error;
  }
};

export const getWorkHours = async (userId, month, year) => {
  try {
    // Normalizza il mese
    let normalizedMonth = month.toString().replace(/^prev-/, '').replace(/^0+/, '');
    if (!normalizedMonth) normalizedMonth = month;
    
    // Crea un documento ID combinando utente, mese e anno
    const docId = `${userId}_${normalizedMonth}_${year}`;
    console.log(`getWorkHours: Tentativo di recuperare documento con ID=${docId}`);
    
    const workHoursRef = doc(db, "workHours", docId);
    const docSnap = await getDoc(workHoursRef);
    
    if (docSnap.exists()) {
      console.log(`getWorkHours: Documento trovato con ID=${docId}`);
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    }
    
    // Se non trova documento con il primo formato, prova con il mese con zero iniziale
    const paddedMonth = normalizedMonth.length === 1 ? normalizedMonth.padStart(2, '0') : normalizedMonth;
    if (paddedMonth !== normalizedMonth) {
      const altDocId = `${userId}_${paddedMonth}_${year}`;
      console.log(`getWorkHours: Tentativo alternativo con ID=${altDocId}`);
      
      const altWorkHoursRef = doc(db, "workHours", altDocId);
      const altDocSnap = await getDoc(altWorkHoursRef);
      
      if (altDocSnap.exists()) {
        console.log(`getWorkHours: Documento alternativo trovato con ID=${altDocId}`);
        return {
          id: altDocSnap.id,
          ...altDocSnap.data()
        };
      }
    }
    
    console.log("getWorkHours: Nessun documento trovato");
    return null;
  } catch (error) {
    console.error("getWorkHours: Errore nel recupero delle ore lavorative:", error);
    throw error;
  }
};

// 1. SOSTITUIRE la funzione getUserWorkHoursByMonth esistente con questa versione:

export const getUserWorkHoursByMonth = async (userId, month, year) => {
  try {
    console.log(`getUserWorkHoursByMonth: userId=${userId}, month=${month}, year=${year}`);
    
    // Normalizza il mese
    const normalizedMonth = month.toString().replace(/^prev-/, '').replace(/^0+/, '');
    const monthInt = parseInt(normalizedMonth);
    const yearInt = parseInt(year);
    
    // NUOVA FUNZIONE: Genera il calendario completo del mese
    const generateCompleteMonth = (month, year) => {
      const daysInMonth = new Date(year, month, 0).getDate();
      const entries = [];
      const dayNames = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        entries.push({
          date: dateStr,
          day: dayNames[dayOfWeek],
          total: 0,
          overtime: 0,
          notes: "",
          isWeekend: isWeekend,
          hasData: false
        });
      }
      
      return entries.sort((a, b) => new Date(a.date) - new Date(b.date));
    };
    
    // Genera il calendario completo
    const completeMonth = generateCompleteMonth(monthInt, yearInt);
    
    // Cerca i dati esistenti (mantieni la logica esistente di ricerca)
    let existingData = null;
    
    // Tentativo 1: ID documento senza zero iniziale
    const docId = `${userId}_${normalizedMonth}_${year}`;
    console.log(`Tentativo 1: docId=${docId}`);
    
    const docRef = doc(db, "workHours", docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      console.log(`Documento trovato: ${docId}`);
      const data = docSnap.data();
      if (data.entries && Array.isArray(data.entries)) {
        existingData = data.entries;
      }
    } else {
      // Tentativo 2: ID documento con zero iniziale
      const formattedMonth = normalizedMonth.length === 1 ? normalizedMonth.padStart(2, '0') : normalizedMonth;
      const altDocId = `${userId}_${formattedMonth}_${year}`;
      
      console.log(`Tentativo 2: altDocId=${altDocId}`);
      
      if (altDocId !== docId) {
        const altDocRef = doc(db, "workHours", altDocId);
        const altDocSnap = await getDoc(altDocRef);
        
        if (altDocSnap.exists()) {
          console.log(`Documento alternativo trovato: ${altDocId}`);
          const altData = altDocSnap.data();
          if (altData.entries && Array.isArray(altData.entries)) {
            existingData = altData.entries;
          }
        }
      }
      
      // Tentativo 3: Query generale
      if (!existingData) {
        console.log(`Tentativo 3: Query generale`);
        const workHoursRef = collection(db, "workHours");
        const q = query(
          workHoursRef, 
          where("userId", "==", userId),
          where("year", "==", year)
        );
        
        const querySnapshot = await getDocs(q);
        console.log(`Query generale: ${querySnapshot.size} documenti trovati`);
        
        if (!querySnapshot.empty) {
          for (const doc of querySnapshot.docs) {
            const data = doc.data();
            const docMonth = data.month.toString().replace(/^0+/, '');
            
            if (docMonth === normalizedMonth) {
              console.log(`Corrispondenza trovata per mese ${docMonth}`);
              if (data.entries && Array.isArray(data.entries)) {
                existingData = data.entries;
                break;
              }
            }
          }
        }
      }
    }
    
    // NUOVA LOGICA: Merge dei dati esistenti con il calendario completo
    if (existingData && existingData.length > 0) {
      console.log(`Merge di ${existingData.length} entries esistenti con calendario completo`);
      
      // Crea una mappa dei dati esistenti
      const existingDataMap = {};
      existingData.forEach(entry => {
        if (entry.date) {
          existingDataMap[entry.date] = {
            ...entry,
            overtime: entry.overtime !== undefined ? entry.overtime : 0,
            hasData: true
          };
        }
      });
      
      // Merge con il calendario completo
      const mergedEntries = completeMonth.map(dayEntry => {
        const existingEntry = existingDataMap[dayEntry.date];
        if (existingEntry) {
          return existingEntry;
        }
        return dayEntry;
      });
      
      return {
        userId,
        month: normalizedMonth,
        year,
        entries: mergedEntries,
        lastUpdated: new Date().toISOString()
      };
    } else {
      console.log(`Nessun dato esistente, restituisco calendario vuoto`);
      
      return {
        userId,
        month: normalizedMonth,
        year,
        entries: completeMonth,
        lastUpdated: new Date().toISOString()
      };
    }
    
  } catch (error) {
    console.error("Errore nel recupero delle ore lavorative:", error);
    throw error;
  }
};

/**
 * Recupera tutte le richieste di un utente
 * @param {string} userId - ID dell'utente
 * @returns {Promise<Array>} - Array di richieste
 */
// Modifica alla funzione getUserLeaveRequests in firebase.js
export const getUserLeaveRequests = async (userId) => {
  try {
    if (!userId) throw new Error("userId obbligatorio");
    
    console.log("Tentativo di recuperare richieste per l'utente:", userId);
    
    const leaveRequestsRef = collection(db, "leaveRequests");
    const q = query(
      leaveRequestsRef,
      where("userId", "==", userId)
    );
    
    // Aggiungi ordinamento solo se ci sono richieste
    const querySnapshot = await getDocs(q);
    console.log(`Trovate ${querySnapshot.size} richieste`);
    
    // Converti i dati del documento in un array di oggetti
    const requests = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date(),
        lastUpdate: data.lastUpdate?.toDate?.() || new Date()
      };
    });
    
    // Ordina manualmente per data di creazione (più recenti prima)
    requests.sort((a, b) => b.createdAt - a.createdAt);
    
    return requests;
  } catch (error) {
    console.error("Errore dettagliato nel recupero delle richieste:", error);
    throw new Error("Impossibile recuperare le richieste: " + error.message);
  }
};

/**
 * Invia una nuova richiesta di permesso/ferie/malattia con gestione migliorata dei certificati
 * @param {Object} requestData - I dati della richiesta
 * @param {File} certificateFile - Il file del certificato (solo per malattia)
 * @returns {Promise<Object>} - I dati della richiesta inviata
 */
export const submitLeaveRequest = async (requestData, certificateFile = null) => {
  try {
    console.log("submitLeaveRequest: Tentativo di inviare una richiesta:", requestData);
    
    // Validazione dei dati
    if (!requestData.type) throw new Error("Tipo di richiesta obbligatorio");
    if (!requestData.userId) throw new Error("userId è obbligatorio");

    // Validazione specifica per tipo di richiesta
    if ((requestData.type === 'permission' || requestData.type === 'vacation') && !requestData.dateFrom) {
      throw new Error("Data obbligatoria per permessi e ferie");
    }
    
    if (requestData.type === 'vacation' && !requestData.dateTo) {
      throw new Error("Data fine obbligatoria per ferie");
    }
    
    // Validazione del file certificato per malattia
    if (requestData.type === 'sickness' && certificateFile) {
      // Verifica il tipo di file
      if (!isValidFileType(certificateFile)) {
        throw new Error(`Tipo di file non valido. Sono consentiti solo: ${ALLOWED_FILE_TYPES.join(', ')}`);
      }
      
      // Verifica la dimensione del file
      if (!isValidFileSize(certificateFile)) {
        throw new Error(`File troppo grande. La dimensione massima consentita è ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
      }
    } else if (requestData.type === 'sickness' && !certificateFile) {
      throw new Error("Certificato obbligatorio per malattia");
    }
    
    // Ottieni dati utente
    const userDocRef = doc(db, "users", requestData.userId);
    const userDoc = await getDoc(userDocRef);
    
    let userName = "";
    let userEmail = "";
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      userEmail = userData.email || "";
      if (userData.nome && userData.cognome) {
        userName = `${userData.nome} ${userData.cognome}`;
      } else {
        userName = userEmail;
      }
    } else {
      throw new Error("Utente non trovato");
    }
    
    // Costruisci i dati completi della richiesta
    const completeRequestData = {
      ...requestData,
      userEmail,
      userName,
      status: 'pending',
      createdAt: serverTimestamp(),
      lastUpdate: serverTimestamp(),
      // Aggiungi metadati privacy per GDPR
      dataPrivacyInfo: {
        privacyNoticeAccepted: true,
        retentionPeriod: "1 anno", // Periodo di conservazione
        dataCategories: requestData.type === 'sickness' ? ["dati sanitari", "dati personali"] : ["dati personali"]
      }
    };
    
    // Gestisci upload file per malattia
    let fileUrl = null;
    let fileStoragePath = null;
    
    if (requestData.type === 'sickness' && certificateFile) {
      // Genera un nome file univoco per evitare conflitti
      const uniqueFileName = generateUniqueFileName(certificateFile.name);
      
      // Genera un percorso univoco per il file con struttura organizzata
      const userId = requestData.userId;
      const datePrefix = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const filePath = `certificates/${userId}/${datePrefix}_${uniqueFileName}`;
      
      console.log(`submitLeaveRequest: Tentativo di caricare file in: ${filePath}`);
      
      // Carica il file su Firebase Storage
      const fileRef = storageRef(firebaseStorage, filePath);
      await storageUploadBytes(fileRef, certificateFile);
      
      // Ottieni URL di download
      fileUrl = await storageGetDownloadURL(fileRef);
      fileStoragePath = filePath;
      
      console.log(`submitLeaveRequest: File caricato con successo, URL: ${fileUrl}`);
      
      // Aggiungi metadati dettagliati del file alla richiesta
      completeRequestData.fileInfo = {
        fileName: certificateFile.name,
        fileType: certificateFile.type,
        fileSize: certificateFile.size,
        uploadDate: new Date().toISOString(),
        fileUrl: fileUrl,
        fileStoragePath: fileStoragePath
      };
    }
    
    console.log("submitLeaveRequest: Dati completi della richiesta:", completeRequestData);
    
    // Salva la richiesta nel database
    const leaveRequestsRef = collection(db, "leaveRequests");
    const docRef = await addDoc(leaveRequestsRef, completeRequestData);
    
    console.log(`submitLeaveRequest: Richiesta salvata con successo, ID: ${docRef.id}`);
    
    // Restituisci i dati completi della richiesta con l'ID del documento
    return {
      id: docRef.id,
      ...completeRequestData,
      createdAt: new Date(),
      lastUpdate: new Date()
    };
  } catch (error) {
    console.error("submitLeaveRequest: Errore nell'invio della richiesta:", error);
    
    // Gestione strutturata degli errori
    let errorMessage = "Si è verificato un errore durante l'invio della richiesta";
    
    if (error.message) {
      errorMessage = error.message;
    }
    
    if (error.code === 'storage/unauthorized') {
      errorMessage = "Non hai l'autorizzazione per caricare questo file. Verifica le regole di sicurezza.";
    } else if (error.code === 'storage/quota-exceeded') {
      errorMessage = "Quota di storage superata. Contatta l'amministratore.";
    }
    
    // Propaga l'errore
    throw new Error(errorMessage);
  }
};

/**
 * Recupera tutte le richieste (per amministratori)
 * @param {Object} filters - Filtri opzionali (status, type, dateFrom, dateTo)
 * @returns {Promise<Array>} - Array di richieste
 */
export const getAllLeaveRequests = async (filters = {}) => {
  try {
    console.log("getAllLeaveRequests: Avvio con filtri:", filters);
    
    const leaveRequestsRef = collection(db, "leaveRequests");
    
    // Costruisci la query base
    let queryConstraints = [orderBy("createdAt", "desc")];
    
    // Aggiungi filtri se presenti
    if (filters.status) {
      queryConstraints.push(where("status", "==", filters.status));
    }
    
    if (filters.type) {
      queryConstraints.push(where("type", "==", filters.type));
    }
    
    // Nota: per i filtri di data, potrebbe essere necessario implementare un'elaborazione lato client
    
    const q = query(leaveRequestsRef, ...queryConstraints);
    console.log("getAllLeaveRequests: Esecuzione query...");
    const querySnapshot = await getDocs(q);
    console.log(`getAllLeaveRequests: Trovate ${querySnapshot.size} richieste`);
    
    // Converti i dati del documento in un array di oggetti
    let requests = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || new Date(),
        lastUpdate: data.lastUpdate?.toDate?.() || new Date()
      };
    });
    
    // Filtraggio per data (lato client)
    if (filters.dateFrom) {
      const dateFrom = new Date(filters.dateFrom);
      requests = requests.filter(request => {
        const requestDate = new Date(request.dateFrom);
        return requestDate >= dateFrom;
      });
    }
    
    if (filters.dateTo) {
      const dateTo = new Date(filters.dateTo);
      requests = requests.filter(request => {
        const requestDate = new Date(request.dateFrom);
        return requestDate <= dateTo;
      });
    }
    
    console.log("getAllLeaveRequests: Restituzione richieste filtrate:", requests.length);
    return requests;
  } catch (error) {
    console.error("getAllLeaveRequests: Errore nel recupero delle richieste:", error);
    throw error;
  }
};

/**
 * Aggiorna lo stato di una richiesta
 * @param {string} requestId - ID della richiesta
 * @param {string} status - Nuovo stato ('pending', 'approved', 'rejected')
 * @param {string} adminNotes - Note dell'amministratore (opzionale)
 * @returns {Promise<Object>} - Dati aggiornati della richiesta
 */
export const updateLeaveRequestStatus = async (requestId, status, adminNotes = '') => {
  try {
    console.log(`updateLeaveRequestStatus: Aggiornamento requestId=${requestId} con status=${status}, notes=${adminNotes || 'nessuna'}`);
    
    if (!requestId) throw new Error("requestId obbligatorio");
    if (!status) throw new Error("status obbligatorio");
    
    const requestRef = doc(db, "leaveRequests", requestId);
    
    // Verifica che la richiesta esista
    const requestDoc = await getDoc(requestRef);
    if (!requestDoc.exists()) {
      throw new Error(`Richiesta con ID ${requestId} non trovata`);
    }
    
    // Prepara i dati da aggiornare
    const updateData = {
      status,
      lastUpdate: serverTimestamp()
    };
    
    // Aggiungi note admin se presenti
    if (adminNotes) {
      updateData.adminNotes = adminNotes;
    }
    
    // Aggiungi info sull'approvazione/rifiuto
    if (status === 'approved' || status === 'rejected') {
      updateData.statusUpdateInfo = {
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser ? auth.currentUser.uid : 'unknown',
        previousStatus: requestDoc.data().status
      };
    }
    
    // Aggiorna lo stato della richiesta
    await updateDoc(requestRef, updateData);
    console.log(`updateLeaveRequestStatus: Status aggiornato con successo a ${status}`);
    
    // Restituisci i dati aggiornati
    const updatedDoc = await getDoc(requestRef);
    
    return {
      id: updatedDoc.id,
      ...updatedDoc.data(),
      lastUpdate: new Date()
    };
  } catch (error) {
    console.error("updateLeaveRequestStatus: Errore nell'aggiornamento dello stato della richiesta:", error);
    throw error;
  }
};

/**
 * Elimina una richiesta e il relativo file (se presente)
 * @param {string} requestId - ID della richiesta
 * @returns {Promise<boolean>} - true se l'eliminazione è riuscita
 */
export const deleteLeaveRequest = async (requestId) => {
  try {
    console.log(`deleteLeaveRequest: Eliminazione requestId=${requestId}`);
    
    if (!requestId) throw new Error("requestId obbligatorio");
    
    const requestRef = doc(db, "leaveRequests", requestId);
    
    // Verifica che la richiesta esista
    const requestDoc = await getDoc(requestRef);
    if (!requestDoc.exists()) {
      throw new Error(`Richiesta con ID ${requestId} non trovata`);
    }
    
    const requestData = requestDoc.data();
    
    // Se c'è un file associato, eliminalo dallo storage
    if (requestData.fileInfo && requestData.fileInfo.fileStoragePath) {
      try {
        console.log(`deleteLeaveRequest: Tentativo di eliminare il file: ${requestData.fileInfo.fileStoragePath}`);
        const fileRef = storageRef(firebaseStorage, requestData.fileInfo.fileStoragePath);
        await storageDeleteObject(fileRef);
        console.log("deleteLeaveRequest: File eliminato con successo");
      } catch (fileError) {
        console.error("Errore nell'eliminazione del file:", fileError);
        // Continua comunque con l'eliminazione della richiesta,
        // ma registra l'errore per la pulizia manuale in futuro
        console.warn("File non eliminato, potrebbe richiedere pulizia manuale:", requestData.fileInfo.fileStoragePath);
      }
    }
    
    // Elimina la richiesta dal database
    await deleteDoc(requestRef);
    console.log(`deleteLeaveRequest: Richiesta ${requestId} eliminata con successo`);
    
    return true;
  } catch (error) {
    console.error("deleteLeaveRequest: Errore nell'eliminazione della richiesta:", error);
    throw error;
  }
};

/**
 * Verifica la connessione a Firebase Storage
 * Utile per debug di problemi di connessione a Storage
 * @returns {Promise<Object>} - Risultato del test
 */
export const testStorageConnection = async () => {
  try {
    console.log("Verifica della connessione a Firebase Storage...");
    
    // Crea un piccolo file di test
    const testBlob = new Blob(['Test di connessione a Firebase Storage'], { type: 'text/plain' });
    const testFile = new File([testBlob], 'test-connection.txt');
    
    // Verifica che l'utente sia autenticato
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Utente non autenticato. Impossibile testare l'accesso a Firebase Storage.");
    }
    
    // Crea un percorso univoco per il test
    const testPath = `test/${user.uid}/connection-test-${Date.now()}.txt`;
    
    // Carica il file
    console.log(`testStorageConnection: Tentativo di caricamento file di test in: ${testPath}`);
    const testRef = storageRef(firebaseStorage, testPath);
    await storageUploadBytes(testRef, testFile);
    
    // Ottieni l'URL del file
    const downloadURL = await storageGetDownloadURL(testRef);
    
    // Elimina il file di test
    await storageDeleteObject(testRef);
    
    console.log("testStorageConnection: Test completato con successo!");
    return {
      success: true,
      message: "La connessione a Firebase Storage è funzionante",
      userId: user.uid,
      testPath,
      downloadURL
    };
  } catch (error) {
    console.error("testStorageConnection: Errore nel test di Firebase Storage:", error);
    
    // Genera un messaggio di errore dettagliato
    let errorMessage = "Errore nella connessione a Firebase Storage";
    
    if (error.code === 'storage/unauthorized') {
      errorMessage = "Non hai l'autorizzazione per accedere a Firebase Storage. Verifica le regole di sicurezza.";
    } else if (error.code === 'storage/quota-exceeded') {
      errorMessage = "Quota di storage superata. Contatta l'amministratore.";
    } else if (error.code === 'storage/invalid-bucket') {
      errorMessage = "Bucket di storage non valido. Verifica la configurazione di Firebase.";
    } else if (error.message) {
      errorMessage = `Errore: ${error.message}`;
    }
    
    return {
      success: false,
      message: errorMessage,
      error: {
        code: error.code,
        message: error.message,
        stack: error.stack
      }
    };
  }
};
// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  addDoc
} from "firebase/firestore";

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

// Esporta autenticazione e database
export const auth = getAuth(app);
export const db = getFirestore(app);

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

// Funzioni per le segnalazioni
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

// Funzione ottimizzata per salvare le ore lavorative con supporto per lettere speciali e straordinario
export const saveWorkHours = async (userId, month, year, entries) => {
  console.log("saveWorkHours: Tentativo di salvare le ore lavorative con i seguenti parametri:");
  console.log("userId:", userId);
  console.log("month:", month);
  console.log("year:", year);
  console.log("entries:", entries);
  
  // Validazione parametri
  if (!userId) throw new Error("userId è obbligatorio");
  if (!month) throw new Error("month è obbligatorio");
  if (!year) throw new Error("year è obbligatorio");
  if (!Array.isArray(entries)) throw new Error("entries deve essere un array");
  
  try {
    // Normalizza il mese (rimuovi eventuali prefissi e zeri iniziali)
    let normalizedMonth = month.toString().replace(/^prev-/, '').replace(/^0+/, '');
    
    // Se il mese è vuoto dopo la normalizzazione, usa il valore originale
    if (!normalizedMonth) normalizedMonth = month;
    
    console.log(`saveWorkHours: Mese normalizzato=${normalizedMonth}`);
    
    // Normalizza i dati per assicurarsi che siano nel formato corretto
    const normalizedEntries = entries.map(entry => {
      // Controlla se il valore è una delle lettere speciali (M, P, A)
      const isSpecialLetter = ["M", "P", "A"].includes(entry.total);
      
      return {
        date: entry.date,
        day: entry.day,
        // Se è una lettera speciale, conservala come stringa, altrimenti converti in intero
        total: isSpecialLetter ? entry.total : (parseInt(entry.total) || 0),
        // Aggiungi il campo overtime (ore straordinarie)
        overtime: isSpecialLetter ? 0 : (parseInt(entry.overtime) || 0), // Se è un giorno speciale, nessuno straordinario
        notes: entry.notes || "",
        isWeekend: entry.isWeekend || false
      };
    });
    
    // Crea un documento ID combinando utente, mese e anno
    const docId = `${userId}_${normalizedMonth}_${year}`;
    console.log("saveWorkHours: ID documento", docId);
    
    const workHoursRef = doc(db, "workHours", docId);
    
    // Dati da salvare
    const workHoursData = {
      userId,
      month: normalizedMonth,
      year,
      entries: normalizedEntries,
      lastUpdated: serverTimestamp()
    };
    
    console.log("saveWorkHours: dati da salvare", {
      userId, 
      month: normalizedMonth, 
      year, 
      entriesCount: normalizedEntries.length
    });
    
    // Controlla se il documento esiste già
    const docSnap = await getDoc(workHoursRef);
    
    if (docSnap.exists()) {
      console.log("saveWorkHours: Aggiornamento documento esistente");
      await updateDoc(workHoursRef, workHoursData);
    } else {
      console.log("saveWorkHours: Creazione nuovo documento");
      await setDoc(workHoursRef, workHoursData);
    }
    
    console.log("saveWorkHours: Salvataggio completato con successo");
    return true;
  } catch (error) {
    console.error("saveWorkHours: Errore durante il salvataggio", error);
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

export const getUserWorkHoursByMonth = async (userId, month, year) => {
  try {
    // Normalizza il mese
    let normalizedMonth = month.toString().replace(/^prev-/, '').replace(/^0+/, '');
    if (!normalizedMonth) normalizedMonth = month;
    
    // Formato con zero iniziale
    const paddedMonth = normalizedMonth.length === 1 ? normalizedMonth.padStart(2, '0') : normalizedMonth;
    
    console.log(`getUserWorkHoursByMonth: cercando documento per userId=${userId}, normalizedMonth=${normalizedMonth}, paddedMonth=${paddedMonth}, year=${year}`);
    
    // Primo tentativo: crea un documento ID con il mese normalizzato
    const docId = `${userId}_${normalizedMonth}_${year}`;
    console.log(`getUserWorkHoursByMonth: Tentativo 1 - ID documento=${docId}`);
    
    const workHoursRef = doc(db, "workHours", docId);
    const docSnap = await getDoc(workHoursRef);
    
    if (docSnap.exists()) {
      console.log(`getUserWorkHoursByMonth: documento trovato con ID=${docId}`);
      const data = docSnap.data();
      
      // Assicurati che tutte le entries abbiano il campo overtime
      if (data.entries && Array.isArray(data.entries)) {
        data.entries = data.entries.map(entry => ({
          ...entry,
          overtime: entry.overtime !== undefined ? entry.overtime : 0
        }));
      }
      
      return {
        id: docSnap.id,
        ...data
      };
    }
    
    // Secondo tentativo: prova con il mese con zero iniziale se diverso
    if (paddedMonth !== normalizedMonth) {
      const altDocId = `${userId}_${paddedMonth}_${year}`;
      console.log(`getUserWorkHoursByMonth: Tentativo 2 - ID documento=${altDocId}`);
      
      const altWorkHoursRef = doc(db, "workHours", altDocId);
      const altDocSnap = await getDoc(altWorkHoursRef);
      
      if (altDocSnap.exists()) {
        console.log(`getUserWorkHoursByMonth: documento trovato con ID=${altDocId}`);
        const altData = altDocSnap.data();
        
        // Assicurati che tutte le entries abbiano il campo overtime
        if (altData.entries && Array.isArray(altData.entries)) {
          altData.entries = altData.entries.map(entry => ({
            ...entry,
            overtime: entry.overtime !== undefined ? entry.overtime : 0
          }));
        }
        
        return {
          id: altDocSnap.id,
          ...altData
        };
      }
    }
    
    // Terzo tentativo: esegui una query più generica
    console.log("getUserWorkHoursByMonth: Tentativo 3 - Query generale");
    const workHoursCollection = collection(db, "workHours");
    const q = query(
      workHoursCollection, 
      where("userId", "==", userId),
      where("year", "==", year)
    );
    
    const querySnapshot = await getDocs(q);
    console.log(`getUserWorkHoursByMonth: Query generale ha trovato ${querySnapshot.size} documenti`);
    
    if (!querySnapshot.empty) {
      // Cerca un documento che corrisponda al mese
      for (const doc of querySnapshot.docs) {
        const data = doc.data();
        console.log(`Documento trovato con month=${data.month}, confronto con ${normalizedMonth}`);
        
        // Normalizza entrambi per il confronto
        const docMonth = data.month.toString().replace(/^0+/, '');
        
        if (docMonth === normalizedMonth) {
          console.log(`getUserWorkHoursByMonth: Corrispondenza trovata in query generale`);
          
          // Assicurati che tutte le entries abbiano il campo overtime
          if (data.entries && Array.isArray(data.entries)) {
            data.entries = data.entries.map(entry => ({
              ...entry,
              overtime: entry.overtime !== undefined ? entry.overtime : 0
            }));
          }
          
          return {
            id: doc.id,
            ...data
          };
        }
      }
    }
    
    console.log("getUserWorkHoursByMonth: nessun documento trovato in tutti i tentativi");
    return null;
  } catch (error) {
    console.error("getUserWorkHoursByMonth: Errore nel recupero delle ore lavorative:", error);
    throw error;
  }
};

export const getUserWorkHours = async (userId) => {
  console.log(`getUserWorkHours: Caricamento di tutte le ore lavorative per userId=${userId}`);
  
  try {
    // Ottieni tutte le ore lavorative di un utente
    const workHoursRef = collection(db, "workHours");
    const q = query(workHoursRef, where("userId", "==", userId));
    
    const querySnapshot = await getDocs(q);
    console.log(`getUserWorkHours: ${querySnapshot.size} documenti trovati`);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("getUserWorkHours: Errore nel recupero delle ore lavorative:", error);
    throw error;
  }
};
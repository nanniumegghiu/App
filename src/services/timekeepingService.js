// src/services/timekeepingService.js - Versione completa modificata
import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  addDoc, 
  query, 
  where, 
  serverTimestamp, 
  Timestamp, 
  limit
} from 'firebase/firestore';

/**
 * Determina il limite di uscita basato sull'orario di ingresso
 */
const calculateMaxExitTime = (clockInTime, clockInDate) => {
  const [inHours, inMinutes] = clockInTime.split(':').map(Number);
  const inTotalMinutes = inHours * 60 + inMinutes;
  
  // Regola 1: Ingresso 00:00-10:59 → Uscita max 21:59 stesso giorno
  if (inTotalMinutes >= 0 && inTotalMinutes <= 659) {
    return {
      maxExitTime: "21:59",
      maxExitDate: clockInDate,
      isNextDay: false,
      shiftType: "morning"
    };
  }
  
  // Regola 2: Ingresso 11:00-23:59 → Uscita max 15:00 giorno seguente
  if (inTotalMinutes >= 660 && inTotalMinutes <= 1439) {
    const nextDate = new Date(clockInDate);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const year = nextDate.getFullYear();
    const month = String(nextDate.getMonth() + 1).padStart(2, '0');
    const day = String(nextDate.getDate()).padStart(2, '0');
    const nextDateString = `${year}-${month}-${day}`;
    
    return {
      maxExitTime: "15:00",
      maxExitDate: nextDateString,
      isNextDay: true,
      shiftType: "evening"
    };
  }
  
  return {
    maxExitTime: "23:59",
    maxExitDate: clockInDate,
    isNextDay: false,
    shiftType: "unknown"
  };
};

/**
 * Controlla se l'orario di uscita è valido
 */
const validateClockOutTime = (clockInTime, clockInDate, clockOutTime, clockOutDate) => {
  const maxExitInfo = calculateMaxExitTime(clockInTime, clockInDate);
  
  // Controlla se la data di uscita è corretta
  if (clockOutDate !== maxExitInfo.maxExitDate) {
    if (maxExitInfo.isNextDay && clockOutDate === clockInDate) {
      return {
        isValid: false,
        reason: `Per un ingresso alle ${clockInTime}, l'uscita deve essere entro le ${maxExitInfo.maxExitTime} del giorno seguente`,
        maxExitInfo
      };
    } else if (!maxExitInfo.isNextDay && clockOutDate !== clockInDate) {
      return {
        isValid: false,
        reason: `Per un ingresso alle ${clockInTime}, l'uscita deve essere entro le ${maxExitInfo.maxExitTime} dello stesso giorno`,
        maxExitInfo
      };
    }
  }
  
  // Controlla se l'orario di uscita è entro il limite
  const [outHours, outMinutes] = clockOutTime.split(':').map(Number);
  const [maxHours, maxMinutes] = maxExitInfo.maxExitTime.split(':').map(Number);
  
  const outTotalMinutes = outHours * 60 + outMinutes;
  const maxTotalMinutes = maxHours * 60 + maxMinutes;
  
  if (outTotalMinutes > maxTotalMinutes) {
    return {
      isValid: false,
      reason: `Per un ingresso alle ${clockInTime}, l'uscita deve essere entro le ${maxExitInfo.maxExitTime}`,
      maxExitInfo
    };
  }
  
  return {
    isValid: true,
    reason: null,
    maxExitInfo
  };
};

/**
 * Calcola le ore lavorative considerando le nuove regole
 */
const calculateWorkingHours = (clockInTime, clockInDate, clockOutTime, clockOutDate) => {
  const [inHours, inMinutes] = clockInTime.split(':').map(Number);
  const [outHours, outMinutes] = clockOutTime.split(':').map(Number);
  
  let inTotalMinutes = inHours * 60 + inMinutes;
  let outTotalMinutes = outHours * 60 + outMinutes;
  
  // Se uscita è il giorno dopo, aggiungi 24 ore
  if (clockOutDate !== clockInDate) {
    outTotalMinutes += 1440;
  }
  
  let totalWorkedMinutes = outTotalMinutes - inTotalMinutes;
  
  if (totalWorkedMinutes <= 0) {
    totalWorkedMinutes += 1440;
  }
  
  // Controllo pausa pranzo
  let lunchBreakMinutes = 0;
  const totalHours = totalWorkedMinutes / 60;
  
  if (totalHours > 8) {
    const lunchStart = 12 * 60; // 12:00
    const lunchEnd = 13 * 60;   // 13:00
    
    if (clockOutDate === clockInDate) {
      // Stesso giorno
      if (inTotalMinutes < lunchEnd && outTotalMinutes > lunchStart) {
        lunchBreakMinutes = 60;
      }
    } else {
      // Giorno successivo
      if (inTotalMinutes < lunchEnd || (outTotalMinutes - 1440) > lunchStart) {
        lunchBreakMinutes = 60;
      }
    }
  }
  
  const netWorkedMinutes = totalWorkedMinutes - lunchBreakMinutes;
  
  // Arrotonda alle mezz'ore
  let roundedHours = Math.floor(netWorkedMinutes / 60);
  const remainingMinutes = netWorkedMinutes % 60;
  
  if (remainingMinutes >= 30) {
    roundedHours += 1;
  }
  
  const standardHours = Math.min(8, roundedHours);
  const overtimeHours = Math.max(0, roundedHours - 8);
  
  return {
    totalMinutesWorked: totalWorkedMinutes,
    netMinutesWorked: netWorkedMinutes,
    lunchBreakMinutes,
    totalHours: roundedHours,
    standardHours,
    overtimeHours,
    hasLunchBreak: lunchBreakMinutes > 0
  };
};

/**
 * Calcola auto-chiusura per timbrature mancanti
 */
const calculateAutoClose = (clockInTime, clockInDate) => {
  const maxExitInfo = calculateMaxExitTime(clockInTime, clockInDate);
  
  return {
    clockOutTime: maxExitInfo.maxExitTime,
    clockOutDate: maxExitInfo.maxExitDate,
    totalHours: 8,
    standardHours: 8,
    overtimeHours: 0,
    autoClosedReason: `Chiusura automatica: ingresso ${clockInTime}, limite uscita ${maxExitInfo.maxExitTime}`,
    hasLunchBreak: false
  };
};

/**
 * Service per la gestione delle timbrature
 */
const timekeepingService = {
  /**
   * Registra ingresso - INVARIATO
   */
  async clockIn(userId, scanInfo = {}) {
    try {
      console.log(`ClockIn attempt for user: ${userId}`);
      
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        throw new Error("Utente non trovato nel sistema");
      }
      
      const userData = userSnap.data();
      if (userData.qrStatus && userData.qrStatus.active === false) {
        throw new Error("QR code disattivato dall'amministratore");
      }
      
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      
      console.log(`Checking existing records for ${userId} on ${dateString}`);
      
      const timekeepingRef = collection(db, "timekeeping");
      const q = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", "==", dateString)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const existingRecord = querySnapshot.docs[0].data();
        console.log(`Found existing record:`, existingRecord);
        
        if (existingRecord.clockOutTime && existingRecord.status === "completed") {
          throw new Error(`Hai già completato la giornata lavorativa. Ingresso: ${existingRecord.clockInTime}, Uscita: ${existingRecord.clockOutTime}`);
        }
        
        if (existingRecord.status === "auto-closed") {
          throw new Error(`Giornata precedente chiusa automaticamente. Per modifiche contatta l'amministratore.`);
        }
        
        if (existingRecord.clockInTime && !existingRecord.clockOutTime && existingRecord.status === "in-progress") {
          const userName = userData.nome && userData.cognome ? 
            `${userData.nome} ${userData.cognome}` : userData.email;
          
          return {
            id: querySnapshot.docs[0].id,
            ...existingRecord,
            userName,
            message: `Sei già entrato oggi alle ${existingRecord.clockInTime}. Per uscire, scansiona di nuovo selezionando 'USCITA'.`,
            duplicateEntry: true,
            clockInTime: existingRecord.clockInTime
          };
        }
      }
      
      console.log(`Creating new clock-in record for ${userId}`);
      
      const recordData = {
        userId,
        userName: userData.nome && userData.cognome ? 
          `${userData.nome} ${userData.cognome}` : userData.email,
        userEmail: userData.email,
        date: dateString,
        clockInTime: timeString,
        clockInTimestamp: serverTimestamp(),
        clockOutTime: null,
        clockOutDate: null,
        clockOutTimestamp: null,
        totalHours: null,
        standardHours: null,
        overtimeHours: null,
        lunchBreakDeducted: false,
        lunchBreakMinutes: 0,
        status: "in-progress",
        year: year.toString(),
        month: month.toString(),
        day: day.toString(),
        scanInfo: {
          ...scanInfo,
          timestamp: now.toISOString()
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(timekeepingRef, recordData);
      console.log(`Clock-in successful with ID: ${docRef.id}`);
      
      return {
        id: docRef.id,
        ...recordData,
        message: "Ingresso registrato con successo",
        clockInTime: timeString,
        userName: recordData.userName
      };
    } catch (error) {
      console.error("Error during clock-in:", error);
      throw error;
    }
  },
  
  /**
   * Registra uscita - MODIFICATO CON NUOVE REGOLE
   */
  async clockOut(userId, scanInfo = {}) {
    try {
      console.log(`ClockOut attempt for user: ${userId}`);
      
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        throw new Error("Utente non trovato nel sistema");
      }
      
      const userData = userSnap.data();
      
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const currentDateString = `${year}-${month}-${day}`;
      
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeString = `${hours}:${minutes}`;
      
      console.log(`Looking for active clock-in for ${userId}`);
      
      const timekeepingRef = collection(db, "timekeeping");
      
      // Prima cerca nel giorno corrente
      let activeQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", "==", currentDateString),
        where("status", "==", "in-progress")
      );
      
      let activeSnapshot = await getDocs(activeQuery);
      
      // Se non trova nulla nel giorno corrente, cerca nel giorno precedente
      if (activeSnapshot.empty) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayString = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        
        activeQuery = query(
          timekeepingRef,
          where("userId", "==", userId),
          where("date", "==", yesterdayString),
          where("status", "==", "in-progress")
        );
        
        activeSnapshot = await getDocs(activeQuery);
      }
      
      if (activeSnapshot.empty) {
        // Verifica se c'è qualche record per oggi
        const anyQuery = query(
          timekeepingRef,
          where("userId", "==", userId),
          where("date", "==", currentDateString)
        );
        
        const anySnapshot = await getDocs(anyQuery);
        
        if (!anySnapshot.empty) {
          const existingRecord = anySnapshot.docs[0].data();
          
          if (existingRecord.status === "completed") {
            throw new Error(`Hai già timbrato l'uscita oggi alle ${existingRecord.clockOutTime}. Ore lavorate: ${existingRecord.totalHours || 0}`);
          } else if (existingRecord.status === "auto-closed") {
            throw new Error("La giornata è stata chiusa automaticamente. Per modifiche contatta l'amministratore.");
          }
        }
        
        throw new Error(`Nessun ingresso attivo trovato. Prima devi timbrare l'INGRESSO.`);
      }
      
      console.log(`Found active clock-in record, processing clock-out`);
      
      const docRef = doc(db, "timekeeping", activeSnapshot.docs[0].id);
      const record = activeSnapshot.docs[0].data();
      
      // NUOVA VALIDAZIONE: Controlla se l'uscita è nei limiti consentiti
      const validation = validateClockOutTime(
        record.clockInTime, 
        record.date, 
        currentTimeString, 
        currentDateString
      );
      
      if (!validation.isValid) {
        throw new Error(validation.reason);
      }
      
      // NUOVO CALCOLO: Usa le nuove regole per calcolare le ore
      const workResult = calculateWorkingHours(
        record.clockInTime,
        record.date,
        currentTimeString,
        currentDateString
      );
      
      const updateData = {
        clockOutTime: currentTimeString,
        clockOutDate: currentDateString,
        clockOutTimestamp: serverTimestamp(),
        totalHours: workResult.totalHours,
        standardHours: workResult.standardHours,
        overtimeHours: workResult.overtimeHours,
        lunchBreakDeducted: workResult.hasLunchBreak,
        lunchBreakMinutes: workResult.lunchBreakMinutes,
        status: "completed",
        scanInfo: {
          ...(record.scanInfo || {}),
          clockOut: {
            ...scanInfo,
            timestamp: now.toISOString()
          }
        },
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(docRef, updateData);
      console.log(`Clock-out successful for record: ${docRef.id}`);
      
      // Sincronizza con workHours
      try {
        await this.syncToWorkHours(userId, record.date, workResult.standardHours, workResult.overtimeHours);
      } catch (syncError) {
        console.error("Error syncing to workHours:", syncError);
      }
      
      const userName = userData.nome && userData.cognome ? 
        `${userData.nome} ${userData.cognome}` : userData.email;
      
      // Messaggio dettagliato con informazioni pausa pranzo
      let successMessage = `Uscita registrata con successo. Ore lavorate: ${workResult.totalHours}`;
      if (workResult.hasLunchBreak) {
        successMessage += ` (pausa pranzo di ${workResult.lunchBreakMinutes} min detratta)`;
      }
      
      return {
        id: docRef.id,
        ...record,
        ...updateData,
        userName,
        message: successMessage,
        workCalculation: workResult
      };
      
    } catch (error) {
      console.error("Error during clock-out:", error);
      throw error;
    }
  },
  
  /**
   * Auto-chiusura sessioni aperte - MODIFICATO CON NUOVE REGOLE
   */
  async autoCloseOpenSessions(userId) {
    try {
      console.log(`Auto-closing open sessions for user: ${userId}`);
      
      const timekeepingRef = collection(db, "timekeeping");
      const q = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("status", "==", "in-progress"),
        limit(50)
      );
      
      const querySnapshot = await getDocs(q);
      const closedSessions = [];
      const now = new Date();
      
      for (const docSnap of querySnapshot.docs) {
        try {
          const session = docSnap.data();
          
          if (!session.date || !session.clockInTime) {
            console.error("Session missing date or clockInTime:", docSnap.id);
            continue;
          }
          
          // NUOVO: Usa le regole per determinare quando chiudere
          const maxExitInfo = calculateMaxExitTime(session.clockInTime, session.date);
          const maxExitDateTime = new Date(`${maxExitInfo.maxExitDate}T${maxExitInfo.maxExitTime}`);
          
          // Se il tempo limite è passato, chiudi automaticamente
          if (now > maxExitDateTime) {
            const docRef = doc(db, "timekeeping", docSnap.id);
            const autoCloseData = calculateAutoClose(session.clockInTime, session.date);
            
            const updateData = {
              clockOutTime: autoCloseData.clockOutTime,
              clockOutDate: autoCloseData.clockOutDate,
              clockOutTimestamp: Timestamp.fromDate(maxExitDateTime),
              totalHours: autoCloseData.totalHours,
              standardHours: autoCloseData.standardHours,
              overtimeHours: autoCloseData.overtimeHours,
              lunchBreakDeducted: autoCloseData.hasLunchBreak,
              lunchBreakMinutes: 0,
              status: "auto-closed",
              autoClosedReason: autoCloseData.autoClosedReason,
              updatedAt: serverTimestamp()
            };
            
            await updateDoc(docRef, updateData);
            
            // Sincronizza con workHours
            try {
              await this.syncToWorkHours(userId, session.date, autoCloseData.standardHours, autoCloseData.overtimeHours);
            } catch (syncError) {
              console.error("Error syncing auto-closed session:", syncError);
            }
            
            closedSessions.push({
              id: docSnap.id,
              ...session,
              ...updateData
            });
            
            console.log(`Auto-closed session: ${docSnap.id} - ${session.clockInTime} to ${autoCloseData.clockOutTime}`);
          }
          
        } catch (sessionError) {
          console.error("Error processing session for auto-close:", sessionError, docSnap.id);
        }
      }
      
      return closedSessions;
      
    } catch (error) {
      console.error("Error during auto-closing sessions:", error);
      return [];
    }
  },

  /**
   * Ottieni stato timbrature di oggi
   */
  async getTodayStatus(userId) {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      const timekeepingRef = collection(db, "timekeeping");
      const q = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", "==", dateString)
      );
      
      const querySnapshot = await getDocs(q);
      
      // Auto-chiudi sessioni scadute
      try {
        await this.autoCloseOpenSessions(userId);
      } catch (closeError) {
        console.error("Error auto-closing sessions:", closeError);
      }
      
      if (querySnapshot.empty) {
        return {
          status: "not-started",
          message: "Non hai timbrato oggi",
          date: dateString,
          timestamp: now.toISOString()
        };
      }
      
      const record = querySnapshot.docs[0].data();
      
      return {
        id: querySnapshot.docs[0].id,
        status: record.status,
        clockInTime: record.clockInTime,
        clockOutTime: record.clockOutTime,
        clockOutDate: record.clockOutDate,
        totalHours: record.totalHours,
        standardHours: record.standardHours,
        overtimeHours: record.overtimeHours,
        lunchBreakDeducted: record.lunchBreakDeducted,
        lunchBreakMinutes: record.lunchBreakMinutes,
        date: dateString,
        message: record.status === "in-progress" 
          ? "Attualmente al lavoro" 
          : record.status === "completed"
            ? "Giornata completata"
            : "Giornata chiusa automaticamente",
        timestamp: now.toISOString()
      };
    } catch (error) {
      console.error("Error getting today's status:", error);
      throw error;
    }
  },

  /**
   * Sincronizza con workHours - INVARIATO
   */
  async syncToWorkHours(userId, date, standardHours, overtimeHours) {
    try {
      if (!date || !userId) {
        console.error("Missing required params in syncToWorkHours:", { userId, date });
        return false;
      }
      
      const [year, month, day] = date.split('-');
      
      if (!year || !month || !day) {
        console.error("Invalid date format in syncToWorkHours:", date);
        return false;
      }
      
      const normalizedMonth = month.replace(/^0+/, '');
      
      const workHoursId = `${userId}_${normalizedMonth}_${year}`;
      const workHoursRef = doc(db, "workHours", workHoursId);
      
      try {
        const workHoursSnap = await getDoc(workHoursRef);
        
        if (workHoursSnap.exists()) {
          const workHoursData = workHoursSnap.data();
          const entries = workHoursData.entries || [];
          
          const entryIndex = entries.findIndex(entry => entry.date === date);
          
          if (entryIndex >= 0) {
            const existingEntry = entries[entryIndex];
            
            if (typeof existingEntry.total === 'string' && ["M", "P", "A"].includes(existingEntry.total)) {
              return false;
            }
            
            const hasManualEntry = existingEntry.notes?.includes("Manual entry") || 
                                existingEntry.notes?.includes("Inserted by admin");
            
            if (hasManualEntry) {
              return false;
            }
            
            entries[entryIndex] = {
              ...existingEntry,
              total: standardHours,
              overtime: overtimeHours,
              notes: existingEntry.notes || "Aggiornato dal sistema di timbrature"
            };
            
            await updateDoc(workHoursRef, {
              entries,
              lastUpdated: serverTimestamp()
            });
          } else {
            const dayOfWeek = new Date(date).toLocaleDateString('it-IT', { weekday: 'long' });
            const isWeekend = [0, 6].includes(new Date(date).getDay());
            
            const newEntry = {
              date,
              day: dayOfWeek,
              total: standardHours,
              overtime: overtimeHours,
              notes: "Aggiunto dal sistema di timbrature",
              isWeekend
            };
            
            await updateDoc(workHoursRef, {
              entries: [...entries, newEntry],
              lastUpdated: serverTimestamp()
            });
          }
        } else {
          const dayOfWeek = new Date(date).toLocaleDateString('it-IT', { weekday: 'long' });
          const isWeekend = [0, 6].includes(new Date(date).getDay());
          
          const entry = {
            date,
            day: dayOfWeek,
            total: standardHours,
            overtime: overtimeHours,
            notes: "Tramite Timbratura",
            isWeekend
          };
          
          await setDoc(workHoursRef, {
            userId,
            month: normalizedMonth,
            year,
            entries: [entry],
            lastUpdated: serverTimestamp()
          });
        }
      } catch (docError) {
        console.error(`Error working with document ${workHoursId}:`, docError);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error("Error syncing to workHours:", error);
      return false;
    }
  },

  /**
   * Altre funzioni del servizio - INVARIATE
   */
  async syncOfflineRecords(offlineRecords) {
    if (!Array.isArray(offlineRecords) || offlineRecords.length === 0) {
      return {
        total: 0,
        success: 0,
        failed: 0,
        errors: []
      };
    }
    
    const results = {
      total: offlineRecords.length,
      success: 0,
      failed: 0,
      errors: []
    };
    
    for (const record of offlineRecords) {
      try {
        if (!record.userId) {
          throw new Error("Missing userId in offline record");
        }
        
        if (record.type === 'clockIn') {
          await this.clockIn(record.userId, {
            ...record.scanInfo,
            offline: true,
            originalTimestamp: record.timestamp
          });
        } else if (record.type === 'clockOut') {
          await this.clockOut(record.userId, {
            ...record.scanInfo,
            offline: true,
            originalTimestamp: record.timestamp
          });
        } else {
          throw new Error(`Unknown record type: ${record.type}`);
        }
        
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          record,
          error: error.message
        });
      }
    }
    
    return results;
  },
  
  async getUserTimekeepingHistory(userId, options = {}) {
    try {
      if (!userId) {
        console.error("Missing userId in getUserTimekeepingHistory");
        return [];
      }
      
      const { month, year, status } = options;
      
      let q = query(
        collection(db, "timekeeping"),
        where("userId", "==", userId)
      );
      
      if (month) {
        q = query(q, where("month", "==", month.toString()));
      }
      
      if (year) {
        q = query(q, where("year", "==", year.toString()));
      }
      
      if (status) {
        q = query(q, where("status", "==", status));
      }
      
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Error getting timekeeping history:", error);
      return [];
    }
  },
  
  async registerTimekeepingDevice(deviceId, deviceName, deviceInfo = {}) {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("You must be logged in to register a device");
      }
      
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists() || userSnap.data().role !== "admin") {
        throw new Error("Only administrators can register scanning devices");
      }
      
      const deviceRef = doc(db, "scanDevices", deviceId);
      const deviceSnap = await getDoc(deviceRef);
      
      if (deviceSnap.exists()) {
        await updateDoc(deviceRef, {
          deviceName,
          deviceInfo: {
            ...deviceSnap.data().deviceInfo,
            ...deviceInfo
          },
          lastUpdated: serverTimestamp(),
          updatedBy: currentUser.uid
        });
        
        return {
          id: deviceId,
          deviceName,
          updated: true,
          message: "Device updated successfully"
        };
      }
      
      await setDoc(deviceRef, {
        deviceId,
        deviceName,
        deviceInfo,
        active: true,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,
        lastUpdated: serverTimestamp(),
        lastActivity: null
      });
      
      return {
        id: deviceId,
        deviceName,
        created: true,
        message: "Device registered successfully"
      };
    } catch (error) {
      console.error("Error registering device:", error);
      throw error;
    }
  }
};

export default timekeepingService;
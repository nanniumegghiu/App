// src/services/timekeepingService.js - Versione con supporto turni multi-data
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
  limit,
  orderBy
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
 * Calcola le ore lavorative per turni multi-data
 * Restituisce ore divise per data
 */
const calculateMultiDayWorkingHours = (clockInTime, clockInDate, clockOutTime, clockOutDate) => {
  const [inHours, inMinutes] = clockInTime.split(':').map(Number);
  const [outHours, outMinutes] = clockOutTime.split(':').map(Number);
  
  let inTotalMinutes = inHours * 60 + inMinutes;
  let outTotalMinutes = outHours * 60 + outMinutes;
  
  // Se uscita è il giorno dopo, aggiungi 24 ore all'uscita
  if (clockOutDate !== clockInDate) {
    outTotalMinutes += 1440;
  }
  
  let totalWorkedMinutes = outTotalMinutes - inTotalMinutes;
  
  if (totalWorkedMinutes <= 0) {
    totalWorkedMinutes += 1440;
  }
  
  // Calcola pausa pranzo (1 ora se il turno è > 8 ore e attraversa l'orario 12:00-13:00)
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
      // Giorno successivo - controlla se attraversa l'orario pranzo in qualche giorno
      if (inTotalMinutes < lunchEnd || (outTotalMinutes - 1440) > lunchStart) {
        lunchBreakMinutes = 60;
      }
    }
  }
  
  const netWorkedMinutes = totalWorkedMinutes - lunchBreakMinutes;
  
  // Distribuzione delle ore per data
  const workDistribution = [];
  
  if (clockInDate === clockOutDate) {
    // Stesso giorno - nessuna distribuzione necessaria
    let roundedHours = Math.floor(netWorkedMinutes / 60);
    const remainingMinutes = netWorkedMinutes % 60;
    
    if (remainingMinutes >= 30) {
      roundedHours += 1;
    }
    
    const standardHours = Math.min(8, roundedHours);
    const overtimeHours = Math.max(0, roundedHours - 8);
    
    workDistribution.push({
      date: clockInDate,
      totalMinutes: netWorkedMinutes,
      totalHours: roundedHours,
      standardHours,
      overtimeHours,
      notes: `Turno ${clockInTime}-${clockOutTime}`
    });
  } else {
    // Turno multi-data - distribuisci le ore
    const startDate = new Date(clockInDate);
    const endDate = new Date(clockOutDate);
    
    let remainingMinutes = netWorkedMinutes;
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate && remainingMinutes > 0) {
      const dateString = currentDate.toISOString().split('T')[0];
      let dayMinutes = 0;
      
      if (currentDate.getTime() === startDate.getTime()) {
        // Primo giorno - calcola minuti dalla partenza alla mezzanotte
        const minutesToMidnight = 1440 - inTotalMinutes;
        dayMinutes = Math.min(remainingMinutes, minutesToMidnight);
      } else if (currentDate.getTime() === endDate.getTime()) {
        // Ultimo giorno - tutti i minuti rimanenti
        dayMinutes = remainingMinutes;
      } else {
        // Giorni intermedi - 24 ore complete (se ci sono abbastanza minuti)
        dayMinutes = Math.min(remainingMinutes, 1440);
      }
      
      // Arrotonda alle mezz'ore
      let roundedHours = Math.floor(dayMinutes / 60);
      const remainingDayMinutes = dayMinutes % 60;
      
      if (remainingDayMinutes >= 30) {
        roundedHours += 1;
      }
      
      // Calcola standard e straordinario per questo giorno
      const standardHours = Math.min(8, roundedHours);
      const overtimeHours = Math.max(0, roundedHours - 8);
      
      if (roundedHours > 0) {
        let notes = `Turno multi-data ${clockInTime}-${clockOutTime}`;
        
        if (currentDate.getTime() === startDate.getTime()) {
          notes += ` (inizio ${clockInTime})`;
        } else if (currentDate.getTime() === endDate.getTime()) {
          notes += ` (fine ${clockOutTime})`;
        } else {
          notes += ` (giorno intermedio)`;
        }
        
        workDistribution.push({
          date: dateString,
          totalMinutes: dayMinutes,
          totalHours: roundedHours,
          standardHours,
          overtimeHours,
          notes
        });
      }
      
      remainingMinutes -= dayMinutes;
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  
  // Calcola totali
  const totalRoundedHours = workDistribution.reduce((sum, day) => sum + day.totalHours, 0);
  const totalStandardHours = workDistribution.reduce((sum, day) => sum + day.standardHours, 0);
  const totalOvertimeHours = workDistribution.reduce((sum, day) => sum + day.overtimeHours, 0);
  
  return {
    totalMinutesWorked: totalWorkedMinutes,
    netMinutesWorked: netWorkedMinutes,
    lunchBreakMinutes,
    totalHours: totalRoundedHours,
    standardHours: totalStandardHours,
    overtimeHours: totalOvertimeHours,
    hasLunchBreak: lunchBreakMinutes > 0,
    workDistribution,
    isMultiDay: clockInDate !== clockOutDate
  };
};

/**
 * Sincronizza con workHours per turni multi-data
 */
const syncMultiDayToWorkHours = async (userId, workDistribution) => {
  const syncResults = [];
  
  for (const dayWork of workDistribution) {
    try {
      const { date, standardHours, overtimeHours, notes } = dayWork;
      
      if (!date || !userId) {
        console.error("Missing required params in syncMultiDayToWorkHours:", { userId, date });
        syncResults.push({ date, success: false, error: "Missing params" });
        continue;
      }
      
      const [year, month, day] = date.split('-');
      
      if (!year || !month || !day) {
        console.error("Invalid date format in syncMultiDayToWorkHours:", date);
        syncResults.push({ date, success: false, error: "Invalid date format" });
        continue;
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
            
            // Non sovrascrivere entries manuali (M, P, A)
            if (typeof existingEntry.total === 'string' && ["M", "P", "A"].includes(existingEntry.total)) {
              syncResults.push({ date, success: false, error: "Manual entry exists" });
              continue;
            }
            
            // Non sovrascrivere entries amministrative
            const hasManualEntry = existingEntry.notes?.includes("Manual entry") || 
                                 existingEntry.notes?.includes("Inserted by admin");
            
            if (hasManualEntry) {
              syncResults.push({ date, success: false, error: "Admin entry exists" });
              continue;
            }
            
            // Aggiorna l'entry esistente
            entries[entryIndex] = {
              ...existingEntry,
              total: standardHours,
              overtime: overtimeHours,
              notes: notes || "Aggiornato dal sistema di timbrature multi-data"
            };
            
            await updateDoc(workHoursRef, {
              entries,
              lastUpdated: serverTimestamp()
            });
            
            syncResults.push({ date, success: true, action: "updated" });
          } else {
            // Crea nuova entry
            const dayOfWeek = new Date(date).toLocaleDateString('it-IT', { weekday: 'long' });
            const isWeekend = [0, 6].includes(new Date(date).getDay());
            
            const newEntry = {
              date,
              day: dayOfWeek,
              total: standardHours,
              overtime: overtimeHours,
              notes: notes || "Aggiunto dal sistema di timbrature multi-data",
              isWeekend
            };
            
            await updateDoc(workHoursRef, {
              entries: [...entries, newEntry],
              lastUpdated: serverTimestamp()
            });
            
            syncResults.push({ date, success: true, action: "created" });
          }
        } else {
          // Crea nuovo documento workHours
          const dayOfWeek = new Date(date).toLocaleDateString('it-IT', { weekday: 'long' });
          const isWeekend = [0, 6].includes(new Date(date).getDay());
          
          const entry = {
            date,
            day: dayOfWeek,
            total: standardHours,
            overtime: overtimeHours,
            notes: notes || "Tramite Timbratura multi-data",
            isWeekend
          };
          
          await setDoc(workHoursRef, {
            userId,
            month: normalizedMonth,
            year,
            entries: [entry],
            lastUpdated: serverTimestamp()
          });
          
          syncResults.push({ date, success: true, action: "created_document" });
        }
      } catch (docError) {
        console.error(`Error working with document ${workHoursId} for date ${date}:`, docError);
        syncResults.push({ date, success: false, error: docError.message });
      }
    } catch (error) {
      console.error(`Error syncing date ${dayWork.date}:`, error);
      syncResults.push({ date: dayWork.date, success: false, error: error.message });
    }
  }
  
  return syncResults;
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
 * Service per la gestione delle timbrature con supporto multi-data
 */
const timekeepingService = {
  /**
   * Registra ingresso - MODIFICATO per permettere più ingressi per data
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
      
      // Controlla se ci sono sessioni in corso (in-progress) per qualsiasi data
      const activeQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("status", "==", "in-progress")
      );
      
      const activeSnapshot = await getDocs(activeQuery);
      
      if (!activeSnapshot.empty) {
        const activeRecord = activeSnapshot.docs[0].data();
        throw new Error(`Hai già un ingresso attivo del ${activeRecord.date} alle ${activeRecord.clockInTime}. Prima devi timbrare l'USCITA.`);
      }
      
      // Controlla se c'è già un record completato per oggi
      const todayQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", "==", dateString),
        where("status", "in", ["completed", "auto-closed"])
      );
      
      const todaySnapshot = await getDocs(todayQuery);
      
      // Se c'è già un turno completato oggi, permetti comunque un nuovo ingresso
      // (questo permette turni multipli nella stessa giornata)
      
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
        isMultiDay: false,
        workDistribution: null,
        shiftNumber: todaySnapshot.size + 1, // Numero del turno per la giornata
        scanInfo: {
          ...scanInfo,
          timestamp: now.toISOString()
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(timekeepingRef, recordData);
      console.log(`Clock-in successful with ID: ${docRef.id}`);
      
      let message = "Ingresso registrato con successo";
      if (todaySnapshot.size > 0) {
        message += ` (Turno #${recordData.shiftNumber} per oggi)`;
      }
      
      return {
        id: docRef.id,
        ...recordData,
        message,
        clockInTime: timeString,
        userName: recordData.userName
      };
    } catch (error) {
      console.error("Error during clock-in:", error);
      throw error;
    }
  },
  
  /**
   * Registra uscita - MODIFICATO per gestire turni multi-data
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
      
      // Cerca il record in-progress più recente (può essere di oggi o ieri)
      const activeQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("status", "==", "in-progress"),
        orderBy("clockInTimestamp", "desc"),
        limit(1)
      );
      
      const activeSnapshot = await getDocs(activeQuery);
      
      if (activeSnapshot.empty) {
        throw new Error(`Nessun ingresso attivo trovato. Prima devi timbrare l'INGRESSO.`);
      }
      
      console.log(`Found active clock-in record, processing clock-out`);
      
      const docRef = doc(db, "timekeeping", activeSnapshot.docs[0].id);
      const record = activeSnapshot.docs[0].data();
      
      // Validazione: Controlla se l'uscita è nei limiti consentiti
      const validation = validateClockOutTime(
        record.clockInTime, 
        record.date, 
        currentTimeString, 
        currentDateString
      );
      
      if (!validation.isValid) {
        throw new Error(validation.reason);
      }
      
      // NUOVO: Usa il calcolo multi-data
      const workResult = calculateMultiDayWorkingHours(
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
        isMultiDay: workResult.isMultiDay,
        workDistribution: workResult.workDistribution,
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
      
      // Sincronizza con workHours (può essere su più date)
      try {
        const syncResults = await syncMultiDayToWorkHours(userId, workResult.workDistribution);
        console.log("Multi-day sync results:", syncResults);
      } catch (syncError) {
        console.error("Error syncing multi-day to workHours:", syncError);
      }
      
      const userName = userData.nome && userData.cognome ? 
        `${userData.nome} ${userData.cognome}` : userData.email;
      
      // Messaggio dettagliato con informazioni turno multi-data
      let successMessage = `Uscita registrata con successo. Ore totali: ${workResult.totalHours}`;
      
      if (workResult.hasLunchBreak) {
        successMessage += ` (pausa pranzo di ${workResult.lunchBreakMinutes} min detratta)`;
      }
      
      if (workResult.isMultiDay) {
        successMessage += `\nTurno multi-data distribuito su ${workResult.workDistribution.length} giorni`;
        workResult.workDistribution.forEach(day => {
          successMessage += `\n- ${day.date}: ${day.totalHours}h (${day.standardHours} std + ${day.overtimeHours} straord.)`;
        });
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
   * Auto-chiusura sessioni aperte - MODIFICATO per nuove regole
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
          
          // Usa le regole per determinare quando chiudere
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
              isMultiDay: autoCloseData.clockOutDate !== session.date,
              workDistribution: [{
                date: autoCloseData.clockOutDate,
                totalHours: autoCloseData.totalHours,
                standardHours: autoCloseData.standardHours,
                overtimeHours: autoCloseData.overtimeHours,
                notes: autoCloseData.autoClosedReason
              }],
              status: "auto-closed",
              autoClosedReason: autoCloseData.autoClosedReason,
              updatedAt: serverTimestamp()
            };
            
            await updateDoc(docRef, updateData);
            
            // Sincronizza con workHours
            try {
              await syncMultiDayToWorkHours(userId, updateData.workDistribution);
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
   * Ottieni stato timbrature di oggi - MODIFICATO per gestire turni multipli
   */
  async getTodayStatus(userId) {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      const timekeepingRef = collection(db, "timekeeping");
      
      // Auto-chiudi sessioni scadute
      try {
        await this.autoCloseOpenSessions(userId);
      } catch (closeError) {
        console.error("Error auto-closing sessions:", closeError);
      }
      
      // Cerca prima qualsiasi sessione in corso (può essere di ieri)
      const activeQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("status", "==", "in-progress"),
        orderBy("clockInTimestamp", "desc"),
        limit(1)
      );
      
      const activeSnapshot = await getDocs(activeQuery);
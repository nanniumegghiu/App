// src/services/timekeepingService.js - Versione con turni notturni e sommatoria ore
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
 * Determina se un ingresso permette uscita il giorno successivo
 * Regola: Ingresso dopo le 10:00 → Uscita possibile fino alle 15:00 del giorno seguente
 */
const canExitNextDay = (clockInTime) => {
  const [hours, minutes] = clockInTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  
  // Se ingresso è dopo le 10:00 (600 minuti), può uscire il giorno dopo
  return totalMinutes > 600; // 10:00 = 600 minuti
};

/**
 * Calcola il limite massimo di uscita basato sull'orario di ingresso
 */
const calculateMaxExitTime = (clockInTime, clockInDate) => {
  const [inHours, inMinutes] = clockInTime.split(':').map(Number);
  const inTotalMinutes = inHours * 60 + inMinutes;
  
  // Regola principale: Ingresso dopo 10:00 → Uscita max 15:00 giorno seguente
  if (inTotalMinutes > 600) { // Dopo le 10:00
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
      shiftType: "night_shift"
    };
  }
  
  // Regola standard: Ingresso prima delle 10:00 → Uscita stesso giorno entro le 23:59
  return {
    maxExitTime: "23:59",
    maxExitDate: clockInDate,
    isNextDay: false,
    shiftType: "day_shift"
  };
};

/**
 * Calcola la distribuzione delle ore tra le date per turni che attraversano la mezzanotte
 */
const calculateHoursDistribution = (clockInTime, clockInDate, clockOutTime, clockOutDate, totalMinutesWorked) => {
  if (clockInDate === clockOutDate) {
    // Stesso giorno - tutte le ore vanno alla data di ingresso
    return {
      [clockInDate]: Math.round(totalMinutesWorked / 60)
    };
  }
  
  // Turno che attraversa la mezzanotte
  const [inHours, inMinutes] = clockInTime.split(':').map(Number);
  const [outHours, outMinutes] = clockOutTime.split(':').map(Number);
  
  const inTotalMinutes = inHours * 60 + inMinutes;
  const outTotalMinutes = outHours * 60 + outMinutes;
  
  // Minuti rimanenti nel giorno di ingresso (fino a mezzanotte)
  const minutesInFirstDay = 1440 - inTotalMinutes; // 1440 = 24 ore in minuti
  
  // Minuti nel giorno di uscita (dalla mezzanotte)
  const minutesInSecondDay = outTotalMinutes;
  
  // Arrotonda alle ore intere più vicine
  const hoursFirstDay = Math.round(minutesInFirstDay / 60);
  const hoursSecondDay = Math.round(minutesInSecondDay / 60);
  
  return {
    [clockInDate]: hoursFirstDay,
    [clockOutDate]: hoursSecondDay
  };
};

/**
 * Calcola le ore lavorative con le nuove regole
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
  
  // Controllo pausa pranzo (solo per turni > 8 ore)
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
      // Giorno successivo - pausa pranzo solo se attraversa il periodo 12:00-13:00
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
  
  // Calcola distribuzione ore tra le date
  const hoursDistribution = calculateHoursDistribution(
    clockInTime, clockInDate, clockOutTime, clockOutDate, netWorkedMinutes
  );
  
  const standardHours = Math.min(8, roundedHours);
  const overtimeHours = Math.max(0, roundedHours - 8);
  
  return {
    totalMinutesWorked: totalWorkedMinutes,
    netMinutesWorked: netWorkedMinutes,
    lunchBreakMinutes,
    totalHours: roundedHours,
    standardHours,
    overtimeHours,
    hasLunchBreak: lunchBreakMinutes > 0,
    hoursDistribution
  };
};

/**
 * Calcola auto-chiusura per timbrature mancanti con distribuzione ore
 */
const calculateAutoClose = (clockInTime, clockInDate) => {
  const maxExitInfo = calculateMaxExitTime(clockInTime, clockInDate);
  
  // Calcola 8 ore di lavoro dall'ingresso
  const [inHours, inMinutes] = clockInTime.split(':').map(Number);
  let workEndMinutes = (inHours * 60) + inMinutes + (8 * 60); // +8 ore
  
  let autoCloseDate = clockInDate;
  let autoCloseTime;
  
  if (workEndMinutes >= 1440) {
    // Supera la mezzanotte
    workEndMinutes -= 1440;
    const nextDate = new Date(clockInDate);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const year = nextDate.getFullYear();
    const month = String(nextDate.getMonth() + 1).padStart(2, '0');
    const day = String(nextDate.getDate()).padStart(2, '0');
    autoCloseDate = `${year}-${month}-${day}`;
  }
  
  const hours = Math.floor(workEndMinutes / 60);
  const minutes = workEndMinutes % 60;
  autoCloseTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  
  // Calcola distribuzione ore per auto-chiusura
  const hoursDistribution = calculateHoursDistribution(
    clockInTime, clockInDate, autoCloseTime, autoCloseDate, 8 * 60
  );
  
  return {
    clockOutTime: autoCloseTime,
    clockOutDate: autoCloseDate,
    totalHours: 8,
    standardHours: 8,
    overtimeHours: 0,
    autoClosedReason: `Chiusura automatica: 8 ore dall'ingresso ${clockInTime}`,
    hasLunchBreak: false,
    hoursDistribution
  };
};

/**
 * Sincronizza con workHours sommando ore se necessario
 */
const syncToWorkHoursWithSummation = async (userId, hoursDistribution, overtimeHours = 0, notes = "Aggiornato dal sistema di timbrature") => {
  try {
    for (const [date, hours] of Object.entries(hoursDistribution)) {
      if (hours <= 0) continue;
      
      const [year, month, day] = date.split('-');
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
            
            // Non modificare entry con lettere speciali (M, P, A)
            if (typeof existingEntry.total === 'string' && ["M", "P", "A"].includes(existingEntry.total)) {
              continue;
            }
            
            // Somma le ore esistenti
            const currentStandardHours = parseInt(existingEntry.total) || 0;
            const currentOvertimeHours = parseInt(existingEntry.overtime) || 0;
            
            const newTotalHours = currentStandardHours + hours;
            
            // Calcola standard e straordinario
            const standardHours = Math.min(8, newTotalHours);
            const newOvertimeHours = Math.max(0, newTotalHours - 8) + currentOvertimeHours;
            
            entries[entryIndex] = {
              ...existingEntry,
              total: standardHours,
              overtime: newOvertimeHours,
              notes: `${existingEntry.notes || ''} + ${hours}h (${notes})`.trim()
            };
          } else {
            // Nuova entry
            const dayOfWeek = new Date(date).toLocaleDateString('it-IT', { weekday: 'long' });
            const isWeekend = [0, 6].includes(new Date(date).getDay());
            
            const standardHours = Math.min(8, hours);
            const newOvertimeHours = Math.max(0, hours - 8);
            
            const newEntry = {
              date,
              day: dayOfWeek,
              total: standardHours,
              overtime: newOvertimeHours,
              notes,
              isWeekend
            };
            
            entries.push(newEntry);
          }
          
          await updateDoc(workHoursRef, {
            entries,
            lastUpdated: serverTimestamp()
          });
        } else {
          // Crea nuovo documento
          const dayOfWeek = new Date(date).toLocaleDateString('it-IT', { weekday: 'long' });
          const isWeekend = [0, 6].includes(new Date(date).getDay());
          
          const standardHours = Math.min(8, hours);
          const newOvertimeHours = Math.max(0, hours - 8);
          
          const entry = {
            date,
            day: dayOfWeek,
            total: standardHours,
            overtime: newOvertimeHours,
            notes,
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
      }
    }
    
    return true;
  } catch (error) {
    console.error("Error syncing to workHours with summation:", error);
    return false;
  }
};

/**
 * Service per la gestione delle timbrature con nuove regole
 */
const timekeepingService = {
  /**
   * Registra ingresso - MODIFICATO per permettere ingressi multipli
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
      
      // Controlla se c'è già un ingresso attivo (senza uscita)
      const activeQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("status", "==", "in-progress"),
        orderBy("clockInTimestamp", "desc"),
        limit(1)
      );
      
      const activeSnapshot = await getDocs(activeQuery);
      
      if (!activeSnapshot.empty) {
        const activeRecord = activeSnapshot.docs[0].data();
        const recordDate = activeRecord.date;
        const recordTime = activeRecord.clockInTime;
        
        // Verifica se può uscire il giorno dopo
        const canExitTomorrow = canExitNextDay(recordTime);
        
        if (canExitTomorrow) {
          // Calcola il limite di uscita
          const maxExitInfo = calculateMaxExitTime(recordTime, recordDate);
          const currentDateTime = new Date(`${dateString}T${timeString}`);
          const maxExitDateTime = new Date(`${maxExitInfo.maxExitDate}T${maxExitInfo.maxExitTime}`);
          
          if (currentDateTime <= maxExitDateTime) {
            throw new Error(`Hai un ingresso attivo dalle ${recordTime} del ${recordDate.split('-').reverse().join('/')}. Puoi timbrar l'uscita fino alle ${maxExitInfo.maxExitTime} di oggi.`);
          }
        } else {
          throw new Error(`Hai già timbrato un ingresso alle ${recordTime}. Timbra l'USCITA per completare la giornata.`);
        }
      }
      
      // Controlla se c'è già stato un ingresso completato oggi
      const todayQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", "==", dateString)
      );
      
      const todaySnapshot = await getDocs(todayQuery);
      
      let hasCompletedShiftToday = false;
      if (!todaySnapshot.empty) {
        for (const doc of todaySnapshot.docs) {
          const record = doc.data();
          if (record.status === "completed" || record.status === "auto-closed") {
            hasCompletedShiftToday = true;
            console.log(`Found completed shift today for summation: ${record.clockInTime} - ${record.clockOutTime}`);
            break;
          }
        }
      }
      
      console.log(`Creating new clock-in record for ${userId} ${hasCompletedShiftToday ? '(additional shift)' : ''}`);
      
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
        isAdditionalShift: hasCompletedShiftToday,
        shiftNumber: hasCompletedShiftToday ? 2 : 1,
        scanInfo: {
          ...scanInfo,
          timestamp: now.toISOString()
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(timekeepingRef, recordData);
      console.log(`Clock-in successful with ID: ${docRef.id}`);
      
      const successMessage = hasCompletedShiftToday 
        ? `Secondo ingresso registrato. Le ore si sommeranno a quelle già lavorate oggi.`
        : `Ingresso registrato con successo`;
      
      return {
        id: docRef.id,
        ...recordData,
        message: successMessage,
        clockInTime: timeString,
        userName: recordData.userName,
        isAdditionalShift: hasCompletedShiftToday
      };
    } catch (error) {
      console.error("Error during clock-in:", error);
      throw error;
    }
  },
  
  /**
   * Registra uscita - MODIFICATO per gestire turni notturni e sommatoria
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
      
      // Cerca ingresso attivo nell'ordine: oggi, ieri
      const searchDates = [currentDateString];
      
      // Aggiungi ieri alla ricerca
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      searchDates.push(yesterdayString);
      
      let activeRecord = null;
      let activeDocRef = null;
      
      for (const searchDate of searchDates) {
        const activeQuery = query(
          timekeepingRef,
          where("userId", "==", userId),
          where("date", "==", searchDate),
          where("status", "==", "in-progress"),
          orderBy("clockInTimestamp", "desc"),
          limit(1)
        );
        
        const activeSnapshot = await getDocs(activeQuery);
        
        if (!activeSnapshot.empty) {
          activeRecord = activeSnapshot.docs[0].data();
          activeDocRef = doc(db, "timekeeping", activeSnapshot.docs[0].id);
          console.log(`Found active record on ${searchDate}: ${activeRecord.clockInTime}`);
          break;
        }
      }
      
      if (!activeRecord) {
        // Verifica se c'è già un'uscita oggi
        const exitQuery = query(
          timekeepingRef,
          where("userId", "==", userId),
          where("date", "==", currentDateString),
          where("status", "in", ["completed", "auto-closed"])
        );
        
        const exitSnapshot = await getDocs(exitQuery);
        
        if (!exitSnapshot.empty) {
          const existingExit = exitSnapshot.docs[0].data();
          throw new Error(`Hai già timbrato l'uscita oggi alle ${existingExit.clockOutTime}. Ore lavorate: ${existingExit.totalHours || 0}`);
        }
        
        throw new Error(`Nessun ingresso attivo trovato. Prima devi timbrare l'INGRESSO.`);
      }
      
      // Valida se l'uscita è nei limiti consentiti
      const maxExitInfo = calculateMaxExitTime(activeRecord.clockInTime, activeRecord.date);
      const currentDateTime = new Date(`${currentDateString}T${currentTimeString}`);
      const maxExitDateTime = new Date(`${maxExitInfo.maxExitDate}T${maxExitInfo.maxExitTime}`);
      
      if (currentDateTime > maxExitDateTime) {
        throw new Error(`Limite di uscita superato. Per un ingresso alle ${activeRecord.clockInTime} del ${activeRecord.date.split('-').reverse().join('/')}, l'uscita doveva essere entro le ${maxExitInfo.maxExitTime} del ${maxExitInfo.maxExitDate.split('-').reverse().join('/')}.`);
      }
      
      console.log(`Processing clock-out for record from ${activeRecord.date}`);
      
      // Calcola le ore lavorative con distribuzione
      const workResult = calculateWorkingHours(
        activeRecord.clockInTime,
        activeRecord.date,
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
        hoursDistribution: workResult.hoursDistribution,
        status: "completed",
        scanInfo: {
          ...(activeRecord.scanInfo || {}),
          clockOut: {
            ...scanInfo,
            timestamp: now.toISOString()
          }
        },
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(activeDocRef, updateData);
      console.log(`Clock-out successful for record: ${activeDocRef.id}`);
      
      // Sincronizza con workHours usando la distribuzione
      try {
        await syncToWorkHoursWithSummation(
          userId, 
          workResult.hoursDistribution, 
          workResult.overtimeHours,
          `Turno ${activeRecord.clockInTime}-${currentTimeString}`
        );
      } catch (syncError) {
        console.error("Error syncing to workHours:", syncError);
      }
      
      const userName = userData.nome && userData.cognome ? 
        `${userData.nome} ${userData.cognome}` : userData.email;
      
      // Messaggio dettagliato con distribuzione ore
      let successMessage = `Uscita registrata. Ore totali: ${workResult.totalHours}`;
      
      if (Object.keys(workResult.hoursDistribution).length > 1) {
        const distribution = Object.entries(workResult.hoursDistribution)
          .map(([date, hours]) => `${hours}h il ${date.split('-').reverse().join('/')}`)
          .join(', ');
        successMessage += ` (distribuite: ${distribution})`;
      }
      
      if (workResult.hasLunchBreak) {
        successMessage += ` [pausa pranzo detratta]`;
      }
      
      return {
        id: activeDocRef.id,
        ...activeRecord,
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
   * Auto-chiusura sessioni aperte - MODIFICATO con nuove regole
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
          
          // Calcola il limite di uscita con le nuove regole
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
              hoursDistribution: autoCloseData.hoursDistribution,
              status: "auto-closed",
              autoClosedReason: autoCloseData.autoClosedReason,
              updatedAt: serverTimestamp()
            };
            
            await updateDoc(docRef, updateData);
            
            // Sincronizza con workHours usando distribuzione
            try {
              await syncToWorkHoursWithSummation(
                userId, 
                autoCloseData.hoursDistribution, 
                0,
                "Auto-chiusura"
              );
            } catch (syncError) {
              console.error("Error syncing auto-closed session:", syncError);
            }
            
            closedSessions.push({
              id: docSnap.id,
              ...session,
              ...updateData
            });
            
            console.log(`Auto-closed session: ${docSnap.id} - Hours distribution:`, autoCloseData.hoursDistribution);
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
   * Ottieni stato timbrature di oggi - AGGIORNATO
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
      
      // Cerca record per oggi (ingresso attivo o completato)
      const todayQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", "==", dateString),
        orderBy("clockInTimestamp", "desc")
      );
      
      const todaySnapshot = await getDocs(todayQuery);
      
      // Cerca anche ieri per ingressi che potrebbero essere ancora attivi
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      
      const yesterdayQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", "==", yesterdayString),
        where("status", "==", "in-progress")
      );
      
      const yesterdayActiveSnapshot = await getDocs(yesterdayQuery);
      
      // Controlla se c'è un ingresso attivo da ieri
      if (!yesterdayActiveSnapshot.empty) {
        const activeRecord = yesterdayActiveSnapshot.docs[0].data();
        
        // Controlla se può ancora uscire oggi
        if (canExitNextDay(activeRecord.clockInTime)) {
          const maxExitInfo = calculateMaxExitTime(activeRecord.clockInTime, activeRecord.date);
          const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          
          if (maxExitInfo.maxExitDate === dateString) {
            return {
              status: "in-progress",
              message: `Turno in corso dall'ingresso di ieri alle ${activeRecord.clockInTime}`,
              date: dateString,
              clockInTime: activeRecord.clockInTime,
              clockInDate: activeRecord.date,
              maxExitTime: maxExitInfo.maxExitTime,
              canExitUntil: `${maxExitInfo.maxExitTime} di oggi`,
              timestamp: now.toISOString()
            };
          }
        }
      }
      
      // Analizza i record di oggi
      if (!todaySnapshot.empty) {
        const todayRecords = todaySnapshot.docs.map(doc => doc.data());
        
        // Cerca il record più recente
        const latestRecord = todayRecords[0];
        
        if (latestRecord.status === "in-progress") {
          const maxExitInfo = calculateMaxExitTime(latestRecord.clockInTime, latestRecord.date);
          
          return {
            status: "in-progress",
            message: `Turno in corso dall'ingresso di oggi alle ${latestRecord.clockInTime}`,
            date: dateString,
            clockInTime: latestRecord.clockInTime,
            clockInDate: latestRecord.date,
            maxExitTime: maxExitInfo.maxExitTime,
            maxExitDate: maxExitInfo.maxExitDate,
            canExitUntil: maxExitInfo.isNextDay ? 
              `${maxExitInfo.maxExitTime} di domani` : 
              `${maxExitInfo.maxExitTime} di oggi`,
            timestamp: now.toISOString()
          };
        } else if (latestRecord.status === "completed" || latestRecord.status === "auto-closed") {
          // Calcola totale ore oggi (potrebbero essere multiple sessioni)
          const todayCompletedRecords = todayRecords.filter(r => 
            r.status === "completed" || r.status === "auto-closed"
          );
          
          const totalHours = todayCompletedRecords.reduce((sum, record) => {
            if (record.hoursDistribution && record.hoursDistribution[dateString]) {
              return sum + record.hoursDistribution[dateString];
            }
            return sum + (record.totalHours || 0);
          }, 0);
          
          const totalStandardHours = Math.min(8, totalHours);
          const totalOvertimeHours = Math.max(0, totalHours - 8);
          
          return {
            status: latestRecord.status,
            message: `Giornata ${latestRecord.status === "completed" ? "completata" : "auto-chiusa"}`,
            date: dateString,
            clockInTime: latestRecord.clockInTime,
            clockOutTime: latestRecord.clockOutTime,
            totalHours: totalHours,
            standardHours: totalStandardHours,
            overtimeHours: totalOvertimeHours,
            completedSessions: todayCompletedRecords.length,
            lastSession: {
              clockIn: latestRecord.clockInTime,
              clockOut: latestRecord.clockOutTime,
              hours: latestRecord.totalHours
            },
            timestamp: now.toISOString()
          };
        }
      }
      
      // Nessun record per oggi
      return {
        status: "not-started",
        message: "Nessuna timbratura oggi",
        date: dateString,
        timestamp: now.toISOString()
      };
      
    } catch (error) {
      console.error("Error getting today's status:", error);
      return {
        status: "error",
        message: "Errore nel recupero dello stato",
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString()
      };
    }
  },

  /**
   * Registra dispositivo per timbrature
   */
  async registerTimekeepingDevice(deviceId, deviceName, deviceInfo = {}) {
    try {
      const deviceRef = doc(db, "scanDevices", deviceId);
      const existingDevice = await getDoc(deviceRef);
      
      if (existingDevice.exists()) {
        // Aggiorna dispositivo esistente
        await updateDoc(deviceRef, {
          deviceName,
          deviceInfo: {
            ...existingDevice.data().deviceInfo,
            ...deviceInfo
          },
          lastActivity: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        return {
          success: true,
          message: `Dispositivo ${deviceName} aggiornato con successo`
        };
      } else {
        // Registra nuovo dispositivo
        await setDoc(deviceRef, {
          deviceName,
          deviceInfo,
          active: true,
          createdAt: serverTimestamp(),
          lastActivity: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        return {
          success: true,
          message: `Dispositivo ${deviceName} registrato con successo`
        };
      }
    } catch (error) {
      console.error("Error registering device:", error);
      throw new Error(`Errore nella registrazione del dispositivo: ${error.message}`);
    }
  },

  /**
   * Sincronizza record offline
   */
  async syncOfflineRecords(offlineRecords) {
    const results = {
      total: offlineRecords.length,
      success: 0,
      failed: 0,
      errors: []
    };
    
    for (const record of offlineRecords) {
      try {
        if (record.type === 'clockIn') {
          await this.clockIn(record.userId, record.scanInfo);
        } else if (record.type === 'clockOut') {
          await this.clockOut(record.userId, record.scanInfo);
        }
        
        results.success++;
      } catch (error) {
        console.error("Error syncing record:", error, record);
        results.failed++;
        results.errors.push({
          record,
          error: error.message
        });
      }
    }
    
    return results;
  },

  /**
   * Ottieni statistiche timbrature
   */
  async getTimekeepingStats(userId, startDate, endDate) {
    try {
      const timekeepingRef = collection(db, "timekeeping");
      const q = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", ">=", startDate),
        where("date", "<=", endDate),
        orderBy("date", "desc")
      );
      
      const querySnapshot = await getDocs(q);
      const records = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const stats = {
        totalSessions: records.length,
        completedSessions: records.filter(r => r.status === "completed").length,
        autoClosedSessions: records.filter(r => r.status === "auto-closed").length,
        inProgressSessions: records.filter(r => r.status === "in-progress").length,
        totalHours: 0,
        totalStandardHours: 0,
        totalOvertimeHours: 0,
        sessionsWithLunchBreak: 0,
        nightShifts: 0,
        additionalShifts: 0
      };
      
      records.forEach(record => {
        if (record.totalHours) {
          stats.totalHours += record.totalHours;
          stats.totalStandardHours += record.standardHours || 0;
          stats.totalOvertimeHours += record.overtimeHours || 0;
        }
        
        if (record.lunchBreakDeducted) {
          stats.sessionsWithLunchBreak++;
        }
        
        if (record.clockOutDate && record.clockOutDate !== record.date) {
          stats.nightShifts++;
        }
        
        if (record.isAdditionalShift) {
          stats.additionalShifts++;
        }
      });
      
      return {
        ...stats,
        records
      };
    } catch (error) {
      console.error("Error getting timekeeping stats:", error);
      throw error;
    }
  }
};

export default timekeepingService;
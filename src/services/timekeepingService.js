// src/services/timekeepingService.js - Sistema Turnazioni Aggiornato
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
  orderBy,
  serverTimestamp, 
  Timestamp, 
  limit
} from 'firebase/firestore';

/**
 * Service for handling time clock functionality with shift management
 */
const timekeepingService = {
  
  /**
   * Determina il tipo di turno basato sull'orario di ingresso
   * @param {Date} clockInTime - Orario di ingresso
   * @returns {Object} - Informazioni sul turno
   */
  determineShiftType(clockInTime) {
    const hours = clockInTime.getHours();
    const minutes = clockInTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;
    
    // Turno diurno: 00:00 - 10:00 (0-600 minuti)
    if (timeInMinutes >= 0 && timeInMinutes <= 600) {
      return {
        type: 'day',
        name: 'Turno Diurno',
        maxClockOutTime: '21:00',
        maxClockOutDate: clockInTime, // Stesso giorno
        description: 'Ingresso 00:00-10:00, uscita entro 21:00 stesso giorno'
      };
    }
    
    // Turno serale/notturno: 10:01 - 23:59 (601-1439 minuti)
    else {
      const nextDay = new Date(clockInTime);
      nextDay.setDate(nextDay.getDate() + 1);
      
      return {
        type: 'evening_night',
        name: 'Turno Serale/Notturno',
        maxClockOutTime: '15:00',
        maxClockOutDate: nextDay, // Giorno successivo
        description: 'Ingresso 10:01-23:59, uscita entro 15:00 giorno successivo'
      };
    }
  },

  /**
   * Verifica se l'uscita è valida per il turno
   * @param {Object} shiftInfo - Informazioni sul turno
   * @param {Date} clockOutTime - Orario di uscita
   * @returns {Object} - Risultato della validazione
   */
  validateClockOut(shiftInfo, clockOutTime) {
    const maxDate = new Date(shiftInfo.maxClockOutDate);
    const [maxHours, maxMinutes] = shiftInfo.maxClockOutTime.split(':').map(Number);
    maxDate.setHours(maxHours, maxMinutes, 0, 0);
    
    if (clockOutTime <= maxDate) {
      return { valid: true };
    }
    
    return {
      valid: false,
      message: `Uscita non valida per ${shiftInfo.name}. Orario massimo: ${shiftInfo.maxClockOutTime} del ${maxDate.toLocaleDateString('it-IT')}`,
      maxTime: maxDate
    };
  },

  /**
   * Calcola le ore lavorate considerando i turni su più giorni
   * @param {Date} clockInTime - Orario ingresso
   * @param {Date} clockOutTime - Orario uscita
   * @returns {Object} - Ore calcolate per ogni giorno
   */
  calculateWorkingHours(clockInTime, clockOutTime) {
    const clockInDate = new Date(clockInTime);
    const clockOutDate = new Date(clockOutTime);
    
    // Se ingresso e uscita sono nello stesso giorno di calendario
    if (clockInDate.toDateString() === clockOutDate.toDateString()) {
      const totalMinutes = (clockOutDate - clockInDate) / (1000 * 60);
      const roundedHours = Math.round(totalMinutes / 60 * 2) / 2; // Arrotonda ai 30 minuti
      const standardHours = Math.min(8, roundedHours);
      const overtimeHours = Math.max(0, roundedHours - 8);
      
      return {
        singleDay: true,
        date: clockInDate.toISOString().split('T')[0],
        totalHours: roundedHours,
        standardHours,
        overtimeHours,
        sessions: [{
          date: clockInDate.toISOString().split('T')[0],
          clockInTime: clockInTime.toTimeString().substring(0, 5),
          clockOutTime: clockOutTime.toTimeString().substring(0, 5),
          totalHours: roundedHours,
          standardHours,
          overtimeHours
        }]
      };
    }
    
    // Turno su due giorni - dividi le ore
    const sessions = [];
    
    // Primo giorno: dalle ore di ingresso fino alle 23:59
    const endOfFirstDay = new Date(clockInDate);
    endOfFirstDay.setHours(23, 59, 59, 999);
    
    const firstDayMinutes = (endOfFirstDay - clockInDate) / (1000 * 60);
    const firstDayHours = Math.round(firstDayMinutes / 60 * 2) / 2;
    const firstDayStandard = Math.min(8, firstDayHours);
    const firstDayOvertime = Math.max(0, firstDayHours - 8);
    
    sessions.push({
      date: clockInDate.toISOString().split('T')[0],
      clockInTime: clockInTime.toTimeString().substring(0, 5),
      clockOutTime: '23:59',
      totalHours: firstDayHours,
      standardHours: firstDayStandard,
      overtimeHours: firstDayOvertime,
      autoSplit: true // Indica che è una divisione automatica
    });
    
    // Secondo giorno: dalle 00:00 all'ora di uscita
    const startOfSecondDay = new Date(clockOutDate);
    startOfSecondDay.setHours(0, 0, 0, 0);
    
    const secondDayMinutes = (clockOutDate - startOfSecondDay) / (1000 * 60);
    const secondDayHours = Math.round(secondDayMinutes / 60 * 2) / 2;
    const secondDayStandard = Math.min(8, secondDayHours);
    const secondDayOvertime = Math.max(0, secondDayHours - 8);
    
    sessions.push({
      date: clockOutDate.toISOString().split('T')[0],
      clockInTime: '00:00',
      clockOutTime: clockOutTime.toTimeString().substring(0, 5),
      totalHours: secondDayHours,
      standardHours: secondDayStandard,
      overtimeHours: secondDayOvertime,
      autoSplit: true
    });
    
    return {
      singleDay: false,
      totalHours: firstDayHours + secondDayHours,
      standardHours: firstDayStandard + secondDayStandard,
      overtimeHours: firstDayOvertime + secondDayOvertime,
      sessions
    };
  },

  /**
   * Records a clock in event for a user with shift management
   */
  async clockIn(userId, scanInfo = {}) {
    try {
      console.log(`ClockIn attempt for user: ${userId}`);
      
      // Verify the user exists
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        throw new Error("Utente non trovato nel sistema");
      }
      
      // Check user QR status
      const userData = userSnap.data();
      if (userData.qrStatus && userData.qrStatus.active === false) {
        throw new Error("QR code disattivato dall'amministratore");
      }
      
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      // Determina il tipo di turno
      const shiftInfo = this.determineShiftType(now);
      
      console.log(`Shift type determined: ${shiftInfo.type} - ${shiftInfo.name}`);
      
      // Cerca record esistenti per oggi
      const timekeepingRef = collection(db, "timekeeping");
      const todayQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", "==", currentDate),
        orderBy("clockInTimestamp", "desc")
      );
      
      const todaySnapshot = await getDocs(todayQuery);
      
      // Se ci sono record esistenti per oggi
      if (!todaySnapshot.empty) {
        const existingRecords = todaySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Controlla se c'è un turno in corso (senza uscita)
        const activeShift = existingRecords.find(record => 
          record.status === "in-progress" && !record.clockOutTime
        );
        
        if (activeShift) {
          const userName = userData.nome && userData.cognome ? 
            `${userData.nome} ${userData.cognome}` : userData.email;
          
          return {
            id: activeShift.id,
            ...activeShift,
            userName,
            message: `Sei già in turno dalle ${activeShift.clockInTime}. Per uscire, scansiona selezionando 'USCITA'.`,
            duplicateEntry: true,
            shiftInfo: activeShift.shiftInfo
          };
        }
      }
      
      console.log(`Creating new clock-in record for ${userId}`);
      
      // Crea nuovo record di ingresso
      const recordData = {
        userId,
        userName: userData.nome && userData.cognome ? 
          `${userData.nome} ${userData.cognome}` : userData.email,
        userEmail: userData.email,
        date: currentDate,
        clockInTime: currentTime,
        clockInTimestamp: serverTimestamp(),
        clockOutTime: null,
        clockOutTimestamp: null,
        totalHours: null,
        standardHours: null,
        overtimeHours: null,
        status: "in-progress",
        shiftInfo: {
          type: shiftInfo.type,
          name: shiftInfo.name,
          maxClockOutTime: shiftInfo.maxClockOutTime,
          maxClockOutDate: shiftInfo.maxClockOutDate.toISOString().split('T')[0],
          description: shiftInfo.description
        },
        year: now.getFullYear().toString(),
        month: String(now.getMonth() + 1).padStart(2, '0'),
        day: String(now.getDate()).padStart(2, '0'),
        scanInfo: {
          ...scanInfo,
          timestamp: now.toISOString()
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(timekeepingRef, recordData);
      console.log(`Clock-in successful with ID: ${docRef.id}`);
      
      const successMessage = `Ingresso registrato: ${shiftInfo.name}. Uscita entro le ${shiftInfo.maxClockOutTime} del ${shiftInfo.maxClockOutDate.toLocaleDateString('it-IT')}`;
      
      return {
        id: docRef.id,
        ...recordData,
        message: successMessage,
        clockInTime: currentTime,
        userName: recordData.userName,
        shiftInfo
      };
    } catch (error) {
      console.error("Error during clock-in:", error);
      throw error;
    }
  },

  /**
   * Records a clock out event for a user with shift validation
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
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      // Cerca il turno attivo più recente per questo utente
      const timekeepingRef = collection(db, "timekeeping");
      const activeQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("status", "==", "in-progress"),
        orderBy("clockInTimestamp", "desc"),
        limit(1)
      );
      
      const activeSnapshot = await getDocs(activeQuery);
      
      if (activeSnapshot.empty) {
        // Controlla se ci sono turni completati oggi
        const currentDate = now.toISOString().split('T')[0];
        const todayQuery = query(
          timekeepingRef,
          where("userId", "==", userId),
          where("date", "==", currentDate),
          where("status", "==", "completed")
        );
        
        const todaySnapshot = await getDocs(todayQuery);
        
        if (!todaySnapshot.empty) {
          const completedShifts = todaySnapshot.docs.map(doc => doc.data());
          const lastShift = completedShifts[completedShifts.length - 1];
          throw new Error(`Hai già completato un turno oggi (uscita alle ${lastShift.clockOutTime}). Per iniziare un nuovo turno, timbra prima l'INGRESSO.`);
        }
        
        throw new Error(`Nessun turno attivo trovato. Prima devi timbrare l'INGRESSO.`);
      }
      
      const activeRecord = activeSnapshot.docs[0].data();
      const recordRef = doc(db, "timekeeping", activeSnapshot.docs[0].id);
      const clockInTime = new Date(`${activeRecord.date}T${activeRecord.clockInTime}:00`);
      
      // Valida l'uscita secondo le regole del turno
      const shiftValidation = this.validateClockOut(activeRecord.shiftInfo, now);
      
      if (!shiftValidation.valid) {
        throw new Error(shiftValidation.message);
      }
      
      // Calcola le ore lavorate
      const workingHours = this.calculateWorkingHours(clockInTime, now);
      
      console.log(`Working hours calculated:`, workingHours);
      
      // Se è un turno su un singolo giorno
      if (workingHours.singleDay) {
        const updateData = {
          clockOutTime: currentTime,
          clockOutTimestamp: serverTimestamp(),
          totalHours: workingHours.totalHours,
          standardHours: workingHours.standardHours,
          overtimeHours: workingHours.overtimeHours,
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
        
        await updateDoc(recordRef, updateData);
        
        // Sincronizza con workHours
        await this.syncToWorkHours(userId, activeRecord.date, workingHours.standardHours, workingHours.overtimeHours);
        
        const userName = userData.nome && userData.cognome ? 
          `${userData.nome} ${userData.cognome}` : userData.email;
        
        return {
          id: recordRef.id,
          ...activeRecord,
          ...updateData,
          userName,
          message: `Uscita registrata. Ore lavorate: ${workingHours.totalHours} (${workingHours.standardHours} standard + ${workingHours.overtimeHours} straordinario)`,
          clockOutTime: currentTime,
          singleDay: true
        };
      }
      
      // Turno su due giorni - crea record separati
      else {
        // Aggiorna il record originale per il primo giorno
        const firstDaySession = workingHours.sessions[0];
        const firstDayUpdate = {
          clockOutTime: firstDaySession.clockOutTime,
          clockOutTimestamp: Timestamp.fromDate(new Date(`${firstDaySession.date}T23:59:59`)),
          totalHours: firstDaySession.totalHours,
          standardHours: firstDaySession.standardHours,
          overtimeHours: firstDaySession.overtimeHours,
          status: "completed",
          splitShift: true,
          splitInfo: {
            type: "first_day",
            originalShiftId: activeSnapshot.docs[0].id,
            totalSessions: 2
          },
          updatedAt: serverTimestamp()
        };
        
        await updateDoc(recordRef, firstDayUpdate);
        
        // Crea nuovo record per il secondo giorno
        const secondDaySession = workingHours.sessions[1];
        const secondDayRecord = {
          userId,
          userName: userData.nome && userData.cognome ? 
            `${userData.nome} ${userData.cognome}` : userData.email,
          userEmail: userData.email,
          date: secondDaySession.date,
          clockInTime: secondDaySession.clockInTime,
          clockInTimestamp: Timestamp.fromDate(new Date(`${secondDaySession.date}T00:00:00`)),
          clockOutTime: secondDaySession.clockOutTime,
          clockOutTimestamp: serverTimestamp(),
          totalHours: secondDaySession.totalHours,
          standardHours: secondDaySession.standardHours,
          overtimeHours: secondDaySession.overtimeHours,
          status: "completed",
          splitShift: true,
          splitInfo: {
            type: "second_day",
            originalShiftId: activeSnapshot.docs[0].id,
            totalSessions: 2
          },
          shiftInfo: activeRecord.shiftInfo,
          year: new Date(secondDaySession.date).getFullYear().toString(),
          month: String(new Date(secondDaySession.date).getMonth() + 1).padStart(2, '0'),
          day: String(new Date(secondDaySession.date).getDate()).padStart(2, '0'),
          scanInfo: {
            clockOut: {
              ...scanInfo,
              timestamp: now.toISOString()
            }
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        
        await addDoc(timekeepingRef, secondDayRecord);
        
        // Sincronizza entrambi i giorni con workHours
        await this.syncToWorkHours(userId, firstDaySession.date, firstDaySession.standardHours, firstDaySession.overtimeHours);
        await this.syncToWorkHours(userId, secondDaySession.date, secondDaySession.standardHours, secondDaySession.overtimeHours);
        
        const userName = userData.nome && userData.cognome ? 
          `${userData.nome} ${userData.cognome}` : userData.email;
        
        return {
          id: recordRef.id,
          ...activeRecord,
          ...firstDayUpdate,
          userName,
          message: `Turno completato su 2 giorni. Totale ore: ${workingHours.totalHours} (${workingHours.standardHours} standard + ${workingHours.overtimeHours} straordinario)`,
          clockOutTime: currentTime,
          singleDay: false,
          sessions: workingHours.sessions
        };
      }
    } catch (error) {
      console.error("Error during clock-out:", error);
      throw error;
    }
  },

  /**
   * Get user's timekeeper status for today with shift info
   */
  async getTodayStatus(userId) {
    try {
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];
      
      // Auto-chiudi sessioni precedenti
      try {
        await this.autoCloseOpenSessions(userId);
      } catch (closeError) {
        console.error("Error auto-closing sessions:", closeError);
      }
      
      // Cerca record per oggi
      const timekeepingRef = collection(db, "timekeeping");
      const todayQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", "==", currentDate),
        orderBy("clockInTimestamp", "desc")
      );
      
      const todaySnapshot = await getDocs(todayQuery);
      
      if (todaySnapshot.empty) {
        return {
          status: "not-started",
          message: "Non hai timbrato oggi",
          date: currentDate,
          timestamp: now.toISOString()
        };
      }
      
      const records = todaySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Trova il record più recente o quello in corso
      const activeRecord = records.find(r => r.status === "in-progress");
      const lastRecord = records[0]; // Più recente
      
      if (activeRecord) {
        return {
          id: activeRecord.id,
          status: "in-progress",
          clockInTime: activeRecord.clockInTime,
          shiftInfo: activeRecord.shiftInfo,
          date: currentDate,
          message: `In turno dalle ${activeRecord.clockInTime} - ${activeRecord.shiftInfo.name}`,
          timestamp: now.toISOString()
        };
      }
      
      // Calcola totale ore per oggi (potrebbero essere multiple sessioni)
      const todayHours = records.reduce((total, record) => {
        return total + (record.totalHours || 0);
      }, 0);
      
      const todayStandardHours = records.reduce((total, record) => {
        return total + (record.standardHours || 0);
      }, 0);
      
      const todayOvertimeHours = records.reduce((total, record) => {
        return total + (record.overtimeHours || 0);
      }, 0);
      
      return {
        id: lastRecord.id,
        status: lastRecord.status,
        clockInTime: records[records.length - 1].clockInTime, // Primo ingresso
        clockOutTime: lastRecord.clockOutTime,
        totalHours: todayHours,
        standardHours: todayStandardHours,
        overtimeHours: todayOvertimeHours,
        sessionsCount: records.length,
        date: currentDate,
        message: records.length > 1 
          ? `${records.length} turni completati oggi` 
          : lastRecord.status === "completed" 
            ? "Turno completato" 
            : "Turno chiuso automaticamente",
        timestamp: now.toISOString()
      };
    } catch (error) {
      console.error("Error getting today's status:", error);
      throw error;
    }
  },

  /**
   * Chiude automaticamente turni aperti oltre i limiti di tempo
   */
  async autoCloseOpenSessions(userId) {
    try {
      const now = new Date();
      
      const timekeepingRef = collection(db, "timekeeping");
      const openQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("status", "==", "in-progress"),
        limit(10)
      );
      
      const openSnapshot = await getDocs(openQuery);
      const closedSessions = [];
      
      for (const docSnap of openSnapshot.docs) {
        try {
          const session = docSnap.data();
          
          if (!session.shiftInfo || !session.clockInTime) {
            continue;
          }
          
          const clockInDate = new Date(`${session.date}T${session.clockInTime}:00`);
          const maxClockOutDate = new Date(session.shiftInfo.maxClockOutDate + 'T' + session.shiftInfo.maxClockOutTime + ':00');
          
          // Se il tempo massimo è scaduto, chiudi automaticamente
          if (now > maxClockOutDate) {
            const workingHours = this.calculateWorkingHours(clockInDate, maxClockOutDate);
            
            if (workingHours.singleDay) {
              // Turno su un giorno - chiudi normalmente
              const updateData = {
                clockOutTime: session.shiftInfo.maxClockOutTime,
                clockOutTimestamp: Timestamp.fromDate(maxClockOutDate),
                totalHours: workingHours.totalHours,
                standardHours: workingHours.standardHours,
                overtimeHours: workingHours.overtimeHours,
                status: "auto-closed",
                autoClosedReason: "Superato tempo massimo turno",
                updatedAt: serverTimestamp()
              };
              
              await updateDoc(doc(db, "timekeeping", docSnap.id), updateData);
              await this.syncToWorkHours(userId, session.date, workingHours.standardHours, workingHours.overtimeHours);
            } else {
              // Turno su due giorni - gestisci come clock-out normale
              // (il codice per turni su due giorni sarebbe simile al clockOut)
              const updateData = {
                clockOutTime: session.shiftInfo.maxClockOutTime,
                clockOutTimestamp: Timestamp.fromDate(maxClockOutDate),
                totalHours: 8, // Default per auto-close
                standardHours: 8,
                overtimeHours: 0,
                status: "auto-closed",
                autoClosedReason: "Superato tempo massimo turno",
                updatedAt: serverTimestamp()
              };
              
              await updateDoc(doc(db, "timekeeping", docSnap.id), updateData);
              await this.syncToWorkHours(userId, session.date, 8, 0);
            }
            
            closedSessions.push({
              id: docSnap.id,
              ...session,
              autoClosed: true
            });
          }
        } catch (sessionError) {
          console.error("Error processing session for auto-close:", sessionError);
        }
      }
      
      return closedSessions;
    } catch (error) {
      console.error("Error during auto-closing sessions:", error);
      return [];
    }
  },

  /**
   * Sync timekeeping data to workHours collection
   */
  async syncToWorkHours(userId, date, standardHours, overtimeHours) {
    try {
      if (!date || !userId) {
        console.error("Missing required params in syncToWorkHours:", { userId, date });
        return false;
      }
      
      const [year, month, day] = date.split('-');
      const normalizedMonth = month.replace(/^0+/, '');
      const workHoursId = `${userId}_${normalizedMonth}_${year}`;
      const workHoursRef = doc(db, "workHours", workHoursId);
      
      const workHoursSnap = await getDoc(workHoursRef);
      
      if (workHoursSnap.exists()) {
        const workHoursData = workHoursSnap.data();
        const entries = workHoursData.entries || [];
        const entryIndex = entries.findIndex(entry => entry.date === date);
        
        if (entryIndex >= 0) {
          // Aggiorna entry esistente SOMMANDO le ore (per turni multipli)
          const existingEntry = entries[entryIndex];
          const currentStandard = typeof existingEntry.total === 'number' ? existingEntry.total : 0;
          const currentOvertime = typeof existingEntry.overtime === 'number' ? existingEntry.overtime : 0;
          
          entries[entryIndex] = {
            ...existingEntry,
            total: currentStandard + standardHours,
            overtime: currentOvertime + overtimeHours,
            notes: (existingEntry.notes || '') + ` +${standardHours}h std +${overtimeHours}h str`
          };
        } else {
          // Nuova entry
          const dayOfWeek = new Date(date).toLocaleDateString('it-IT', { weekday: 'long' });
          const isWeekend = [0, 6].includes(new Date(date).getDay());
          
          entries.push({
            date,
            day: dayOfWeek,
            total: standardHours,
            overtime: overtimeHours,
            notes: "Tramite Sistema Turnazioni",
            isWeekend
          });
        }
        
        await updateDoc(workHoursRef, {
          entries,
          lastUpdated: serverTimestamp()
        });
      } else {
        // Crea nuovo documento
        const dayOfWeek = new Date(date).toLocaleDateString('it-IT', { weekday: 'long' });
        const isWeekend = [0, 6].includes(new Date(date).getDay());
        
        await setDoc(workHoursRef, {
          userId,
          month: normalizedMonth,
          year,
          entries: [{
            date,
            day: dayOfWeek,
            total: standardHours,
            overtime: overtimeHours,
            notes: "Tramite Sistema Turnazioni",
            isWeekend
          }],
          lastUpdated: serverTimestamp()
        });
      }
      
      return true;
    } catch (error) {
      console.error("Error syncing to workHours:", error);
      return false;
    }
  },

  /**
   * Records a clock event from an offline database when connection is restored
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

  /**
   * Gets a user's timekeeping history with shift information
   */
  async getUserTimekeepingHistory(userId, options = {}) {
    try {
      if (!userId) {
        console.error("Missing userId in getUserTimekeepingHistory");
        return [];
      }
      
      const { month, year, status, includeShiftInfo = true } = options;
      
      let q = query(
        collection(db, "timekeeping"),
        where("userId", "==", userId),
        orderBy("clockInTimestamp", "desc")
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
      
      const records = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Aggiungi informazioni leggibili sui turni
          shiftTypeName: data.shiftInfo?.name || 'Turno Standard',
          shiftDescription: data.shiftInfo?.description || '',
          isSplitShift: data.splitShift || false,
          splitInfo: data.splitInfo || null
        };
      });
      
      return records;
    } catch (error) {
      console.error("Error getting timekeeping history:", error);
      return [];
    }
  },

  /**
   * Ottiene statistiche sui turni per un utente
   */
  async getShiftStatistics(userId, options = {}) {
    try {
      const { month, year } = options;
      
      let q = query(
        collection(db, "timekeeping"),
        where("userId", "==", userId),
        where("status", "in", ["completed", "auto-closed"])
      );
      
      if (month) {
        q = query(q, where("month", "==", month.toString()));
      }
      
      if (year) {
        q = query(q, where("year", "==", year.toString()));
      }
      
      const querySnapshot = await getDocs(q);
      const records = querySnapshot.docs.map(doc => doc.data());
      
      const stats = {
        totalShifts: records.length,
        dayShifts: 0,
        eveningNightShifts: 0,
        splitShifts: 0,
        autoClosedShifts: 0,
        totalHours: 0,
        totalStandardHours: 0,
        totalOvertimeHours: 0,
        averageShiftLength: 0,
        shiftsByDay: {},
        monthlyBreakdown: {}
      };
      
      records.forEach(record => {
        // Conta tipi di turno
        if (record.shiftInfo?.type === 'day') {
          stats.dayShifts++;
        } else if (record.shiftInfo?.type === 'evening_night') {
          stats.eveningNightShifts++;
        }
        
        if (record.splitShift) {
          stats.splitShifts++;
        }
        
        if (record.status === 'auto-closed') {
          stats.autoClosedShifts++;
        }
        
        // Somma ore
        stats.totalHours += record.totalHours || 0;
        stats.totalStandardHours += record.standardHours || 0;
        stats.totalOvertimeHours += record.overtimeHours || 0;
        
        // Raggruppa per giorno della settimana
        const dayOfWeek = new Date(record.date).getDay();
        const dayName = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'][dayOfWeek];
        stats.shiftsByDay[dayName] = (stats.shiftsByDay[dayName] || 0) + 1;
        
        // Raggruppa per mese
        const monthKey = `${record.year}-${record.month}`;
        if (!stats.monthlyBreakdown[monthKey]) {
          stats.monthlyBreakdown[monthKey] = {
            shifts: 0,
            hours: 0,
            standardHours: 0,
            overtimeHours: 0
          };
        }
        stats.monthlyBreakdown[monthKey].shifts++;
        stats.monthlyBreakdown[monthKey].hours += record.totalHours || 0;
        stats.monthlyBreakdown[monthKey].standardHours += record.standardHours || 0;  
        stats.monthlyBreakdown[monthKey].overtimeHours += record.overtimeHours || 0;
      });
      
      // Calcola media
      if (stats.totalShifts > 0) {
        stats.averageShiftLength = Math.round((stats.totalHours / stats.totalShifts) * 100) / 100;
      }
      
      return stats;
    } catch (error) {
      console.error("Error getting shift statistics:", error);
      return null;
    }
  },

  /**
   * Verifica e risolve conflitti di turni sovrapposti
   */
  async resolveShiftConflicts(userId) {
    try {
      const timekeepingRef = collection(db, "timekeeping");
      const userQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        orderBy("clockInTimestamp", "desc"),
        limit(50)
      );
      
      const querySnapshot = await getDocs(userQuery);
      const records = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ref: doc.ref,
        ...doc.data()
      }));
      
      const conflicts = [];
      const resolutions = [];
      
      // Identifica conflitti (turni sovrapposti)
      for (let i = 0; i < records.length - 1; i++) {
        const current = records[i];
        const next = records[i + 1];
        
        if (current.status === "in-progress" && next.status === "in-progress") {
          conflicts.push({
            type: "multiple_active",
            records: [current, next],
            description: "Più turni attivi contemporaneamente"
          });
        }
        
        // Altri tipi di conflitti...
      }
      
      // Risolvi conflitti automaticamente dove possibile
      for (const conflict of conflicts) {
        if (conflict.type === "multiple_active") {
          // Chiudi il turno più vecchio automaticamente
          const olderShift = conflict.records[1]; // Il secondo è più vecchio
          
          const updateData = {
            status: "auto-closed",
            autoClosedReason: "Conflitto risolto: nuovo turno iniziato",
            clockOutTime: "23:59",
            totalHours: 8,
            standardHours: 8,
            overtimeHours: 0,
            updatedAt: serverTimestamp()
          };
          
          await updateDoc(olderShift.ref, updateData);
          
          resolutions.push({
            conflictType: conflict.type,
            action: "auto_closed_older_shift",
            shiftId: olderShift.id
          });
        }
      }
      
      return {
        conflictsFound: conflicts.length,
        conflictsResolved: resolutions.length,
        conflicts,
        resolutions
      };
    } catch (error) {
      console.error("Error resolving shift conflicts:", error);
      return {
        conflictsFound: 0,
        conflictsResolved: 0,
        error: error.message
      };
    }
  },

  /**
   * Registra un dispositivo per la scansione QR
   */
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
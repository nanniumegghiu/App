// src/services/timekeepingService.js - Final version with time limits, lunch break, and all original features
import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  query, 
  where, 
  serverTimestamp, 
  Timestamp, 
  limit
} from 'firebase/firestore';

/**
 * Service for handling time clock functionality with time limits and lunch break calculation
 */
const timekeepingService = {
  /**
   * Validates if a clock-in time is within allowed time windows
   * @param {string} timeString - Time in HH:MM format
   * @returns {Object} - Validation result with allowed clock-out window
   */
  validateClockInTime(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const timeInMinutes = hours * 60 + minutes;
    
    // Convert time windows to minutes
    const midnight = 0 * 60;        // 00:00
    const afternoon3PM = 15 * 60;   // 15:00
    
    if (timeInMinutes >= midnight && timeInMinutes < afternoon3PM) {
      // Morning shift: 00:00 - 14:59, can clock out until 21:00 same day
      return {
        isValid: true,
        shiftType: 'morning',
        maxClockOutTime: '21:00',
        maxClockOutDay: 'same'
      };
    } else if (timeInMinutes >= afternoon3PM) {
      // Evening shift: 15:00 - 23:59, can clock out until 08:00 next day
      return {
        isValid: true,
        shiftType: 'evening',
        maxClockOutTime: '08:00',
        maxClockOutDay: 'next'
      };
    }
    
    // This should never happen since we cover 00:00-23:59
    return {
      isValid: false,
      message: 'Orario di ingresso non valido.'
    };
  },

  /**
   * Validates if a clock-out time is within the allowed window for the given clock-in
   * @param {string} clockInTime - Clock-in time in HH:MM format
   * @param {string} clockOutTime - Clock-out time in HH:MM format
   * @param {string} clockInDate - Clock-in date in YYYY-MM-DD format
   * @param {string} clockOutDate - Clock-out date in YYYY-MM-DD format
   * @returns {Object} - Validation result
   */
  validateClockOutTime(clockInTime, clockOutTime, clockInDate, clockOutDate) {
    const validation = this.validateClockInTime(clockInTime);
    
    if (!validation.isValid) {
      return validation;
    }
    
    const [outHours, outMinutes] = clockOutTime.split(':').map(Number);
    const clockOutTimeInMinutes = outHours * 60 + outMinutes;
    
    if (validation.shiftType === 'morning') {
      // Morning shift: must clock out same day before 21:00
      if (clockInDate !== clockOutDate) {
        return {
          isValid: false,
          message: 'Per il turno mattutino devi timbrare l\'uscita lo stesso giorno.',
          forceStandardHours: true
        };
      }
      
      const maxOutTime = 21 * 60; // 21:00
      if (clockOutTimeInMinutes > maxOutTime) {
        return {
          isValid: false,
          message: 'Per il turno mattutino puoi timbrare l\'uscita entro le 21:00.',
          forceStandardHours: true
        };
      }
    } else if (validation.shiftType === 'evening') {
      // Evening shift: can clock out next day until 08:00
      const nextDay = new Date(clockInDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const expectedNextDay = nextDay.toISOString().split('T')[0];
      
      if (clockOutDate === clockInDate) {
        // Same day clock-out for evening shift is allowed (short shift)
        return { isValid: true };
      } else if (clockOutDate === expectedNextDay) {
        // Next day clock-out
        const maxOutTime = 8 * 60; // 08:00
        if (clockOutTimeInMinutes > maxOutTime) {
          return {
            isValid: false,
            message: 'Per il turno serale puoi timbrare l\'uscita entro le 08:00 del giorno seguente.',
            forceStandardHours: true
          };
        }
      } else {
        return {
          isValid: false,
          message: 'Orario di uscita non valido per il turno serale.',
          forceStandardHours: true
        };
      }
    }
    
    return { isValid: true };
  },

  /**
   * Calculates worked hours with lunch break deduction
   * @param {string} clockInTime - Clock-in time in HH:MM format
   * @param {string} clockOutTime - Clock-out time in HH:MM format
   * @param {string} clockInDate - Clock-in date in YYYY-MM-DD format
   * @param {string} clockOutDate - Clock-out date in YYYY-MM-DD format
   * @returns {Object} - Calculated hours with breakdown
   */
  calculateHoursWorked(clockInTime, clockOutTime, clockInDate, clockOutDate) {
    const [inHours, inMinutes] = clockInTime.split(':').map(Number);
    const [outHours, outMinutes] = clockOutTime.split(':').map(Number);
    
    // Convert to minutes
    let clockInMinutes = inHours * 60 + inMinutes;
    let clockOutMinutes = outHours * 60 + outMinutes;
    
    // Handle overnight shifts
    if (clockOutDate !== clockInDate) {
      clockOutMinutes += 24 * 60; // Add 24 hours for next day
    }
    
    // If clock-out is earlier than clock-in on same day, assume next day
    if (clockOutDate === clockInDate && clockOutMinutes < clockInMinutes) {
      clockOutMinutes += 24 * 60;
    }
    
    // Calculate total minutes worked
    let totalMinutesWorked = clockOutMinutes - clockInMinutes;
    
    // Check if lunch break should be deducted (12:00-13:00 interval)
    let lunchBreakDeduction = 0;
    if (totalMinutesWorked > 8 * 60) { // More than 8 hours
      const lunchStart = 12 * 60; // 12:00
      const lunchEnd = 13 * 60;   // 13:00
      
      // Check if work period includes lunch time
      let workStart = clockInMinutes;
      let workEnd = clockOutMinutes;
      
      // For overnight shifts, handle the lunch break calculation
      if (clockOutDate !== clockInDate) {
        // If work spans midnight, check lunch break on both days
        const midnightMinutes = 24 * 60;
        
        // Check lunch on first day
        if (workStart < midnightMinutes) {
          const firstDayEnd = Math.min(workEnd, midnightMinutes);
          if (workStart <= lunchEnd && firstDayEnd >= lunchStart) {
            const overlapStart = Math.max(workStart, lunchStart);
            const overlapEnd = Math.min(firstDayEnd, lunchEnd);
            if (overlapEnd > overlapStart) {
              lunchBreakDeduction = Math.min(60, overlapEnd - overlapStart);
            }
          }
        }
        
        // Check lunch on second day (if no lunch break found on first day)
        if (lunchBreakDeduction === 0 && workEnd > midnightMinutes) {
          const secondDayStart = Math.max(workStart, midnightMinutes);
          const adjustedLunchStart = midnightMinutes + lunchStart;
          const adjustedLunchEnd = midnightMinutes + lunchEnd;
          
          if (secondDayStart <= adjustedLunchEnd && workEnd >= adjustedLunchStart) {
            const overlapStart = Math.max(secondDayStart, adjustedLunchStart);
            const overlapEnd = Math.min(workEnd, adjustedLunchEnd);
            if (overlapEnd > overlapStart) {
              lunchBreakDeduction = Math.min(60, overlapEnd - overlapStart);
            }
          }
        }
      } else {
        // Same day work
        if (workStart <= lunchEnd && workEnd >= lunchStart) {
          const overlapStart = Math.max(workStart, lunchStart);
          const overlapEnd = Math.min(workEnd, lunchEnd);
          if (overlapEnd > overlapStart) {
            lunchBreakDeduction = Math.min(60, overlapEnd - overlapStart);
          }
        }
      }
    }
    
    // Apply lunch break deduction
    totalMinutesWorked -= lunchBreakDeduction;
    
    // Round to nearest half hour
    let roundedHours = Math.floor(totalMinutesWorked / 60);
    const remainingMinutes = totalMinutesWorked % 60;
    
    if (remainingMinutes >= 30) {
      roundedHours += 1;
    }
    
    // Calculate standard and overtime hours
    const standardHours = Math.min(8, roundedHours);
    const overtimeHours = Math.max(0, roundedHours - 8);
    
    return {
      totalMinutesWorked: totalMinutesWorked + lunchBreakDeduction, // Original before deduction
      lunchBreakDeducted: lunchBreakDeduction,
      totalHours: roundedHours,
      standardHours,
      overtimeHours,
      hasLunchBreak: lunchBreakDeduction > 0
    };
  },

  /**
   * Records a clock in event for a user
   * @param {string} userId - The user's ID
   * @param {Object} scanInfo - Additional info about the scan (device, location, etc)
   * @returns {Promise<Object>} - The clock-in record
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
      
      // Get current date and time
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      
      // Validate clock-in time
      const timeValidation = this.validateClockInTime(timeString);
      if (!timeValidation.isValid) {
        throw new Error(timeValidation.message);
      }
      
      console.log(`Checking existing records for ${userId} on ${dateString}`);
      
      // Check if user already has ANY record for today
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
            clockInTime: existingRecord.clockInTime,
            shiftInfo: timeValidation
          };
        }
      }
      
      console.log(`Creating new clock-in record for ${userId}`);
      
      // Create new clock-in record
      const recordData = {
        userId,
        userName: userData.nome && userData.cognome ? 
          `${userData.nome} ${userData.cognome}` : userData.email,
        userEmail: userData.email,
        date: dateString,
        clockInTime: timeString,
        clockInTimestamp: serverTimestamp(),
        clockOutTime: null,
        clockOutTimestamp: null,
        totalHours: null,
        standardHours: null,
        overtimeHours: null,
        status: "in-progress",
        year: year.toString(),
        month: month.toString(),
        day: day.toString(),
        shiftType: timeValidation.shiftType,
        maxClockOutTime: timeValidation.maxClockOutTime,
        maxClockOutDay: timeValidation.maxClockOutDay,
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
        message: `Ingresso registrato con successo (${timeValidation.shiftType === 'morning' ? 'Turno mattutino' : 'Turno serale'})`,
        clockInTime: timeString,
        userName: recordData.userName,
        shiftInfo: timeValidation
      };
    } catch (error) {
      console.error("Error during clock-in:", error);
      throw error;
    }
  },
  
  /**
   * Records a clock out event for a user
   * @param {string} userId - The user's ID
   * @param {Object} scanInfo - Additional info about the scan (device, location, etc)
   * @returns {Promise<Object>} - The updated clock record
   */
  async clockOut(userId, scanInfo = {}) {
    try {
      console.log(`ClockOut attempt for user: ${userId}`);
      
      // Verify the user exists first
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        throw new Error("Utente non trovato nel sistema");
      }
      
      const userData = userSnap.data();
      
      // Get current date and time
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      
      console.log(`Looking for active clock-in for ${userId}`);
      
      // Find active clock-in record (could be from today or yesterday for evening shifts)
      const timekeepingRef = collection(db, "timekeeping");
      
      // First check today
      let activeQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", "==", dateString),
        where("status", "==", "in-progress")
      );
      
      let activeSnapshot = await getDocs(activeQuery);
      
      // If no active session today, check yesterday for evening shift
      if (activeSnapshot.empty) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayString = yesterday.toISOString().split('T')[0];
        
        activeQuery = query(
          timekeepingRef,
          where("userId", "==", userId),
          where("date", "==", yesterdayString),
          where("status", "==", "in-progress"),
          where("shiftType", "==", "evening")
        );
        
        activeSnapshot = await getDocs(activeQuery);
      }
      
      if (activeSnapshot.empty) {
        // Check if there's ANY record for today
        const anyQuery = query(
          timekeepingRef,
          where("userId", "==", userId),
          where("date", "==", dateString)
        );
        
        const anySnapshot = await getDocs(anyQuery);
        
        if (!anySnapshot.empty) {
          const existingRecord = anySnapshot.docs[0].data();
          
          if (existingRecord.status === "completed") {
            throw new Error(`Hai già timbrato l'uscita oggi alle ${existingRecord.clockOutTime}. Ore lavorate: ${existingRecord.totalHours || 0} (${existingRecord.standardHours || 0} standard + ${existingRecord.overtimeHours || 0} straordinario)`);
          } else if (existingRecord.status === "auto-closed") {
            throw new Error("La giornata è stata chiusa automaticamente. Per modifiche contatta l'amministratore.");
          }
        }
        
        throw new Error(`Nessun ingresso attivo trovato. Prima devi timbrare l'INGRESSO, poi potrai timbrare l'USCITA.`);
      }
      
      console.log(`Found active clock-in record, processing clock-out`);
      
      // Get the clock-in record
      const docRef = doc(db, "timekeeping", activeSnapshot.docs[0].id);
      const record = activeSnapshot.docs[0].data();
      const clockInDate = record.date;
      
      // Validate clock-out time
      const clockOutValidation = this.validateClockOutTime(
        record.clockInTime, 
        timeString, 
        clockInDate, 
        dateString
      );
      
      let calculatedHours;
      let statusMessage = "Uscita registrata con successo";
      
      if (!clockOutValidation.isValid) {
        if (clockOutValidation.forceStandardHours) {
          // Force 8 standard hours due to time limit violation
          calculatedHours = {
            totalHours: 8,
            standardHours: 8,
            overtimeHours: 0,
            hasLunchBreak: false,
            lunchBreakDeducted: 0
          };
          statusMessage = `Limite orario superato. Registrate 8 ore standard. ${clockOutValidation.message}`;
        } else {
          throw new Error(clockOutValidation.message);
        }
      } else {
        // Calculate hours normally
        calculatedHours = this.calculateHoursWorked(
          record.clockInTime, 
          timeString, 
          clockInDate, 
          dateString
        );
      }
      
      // Update the record with clock-out information
      const updateData = {
        clockOutTime: timeString,
        clockOutTimestamp: serverTimestamp(),
        clockOutDate: dateString,
        totalHours: calculatedHours.totalHours,
        standardHours: calculatedHours.standardHours,
        overtimeHours: calculatedHours.overtimeHours,
        lunchBreakDeducted: calculatedHours.lunchBreakDeducted || 0,
        hasLunchBreak: calculatedHours.hasLunchBreak || false,
        status: "completed",
        timeLimitViolation: !clockOutValidation.isValid,
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
      
      // Update workHours collection if needed
      try {
        await this.syncToWorkHours(
          userId, 
          clockInDate, // Use clock-in date for work hours sync
          calculatedHours.standardHours, 
          calculatedHours.overtimeHours
        );
      } catch (syncError) {
        console.error("Error syncing to workHours:", syncError);
      }
      
      const userName = userData.nome && userData.cognome ? 
        `${userData.nome} ${userData.cognome}` : userData.email;
      
      let detailedMessage = statusMessage;
      if (calculatedHours.hasLunchBreak) {
        detailedMessage += ` (Dedotta pausa pranzo: ${calculatedHours.lunchBreakDeducted} minuti)`;
      }
      
      return {
        id: docRef.id,
        ...record,
        ...updateData,
        userName,
        message: detailedMessage,
        clockInTime: record.clockInTime,
        clockOutTime: timeString,
        totalHours: calculatedHours.totalHours,
        standardHours: calculatedHours.standardHours,
        overtimeHours: calculatedHours.overtimeHours,
        lunchInfo: calculatedHours.hasLunchBreak ? {
          deducted: true,
          minutes: calculatedHours.lunchBreakDeducted
        } : null
      };
    } catch (error) {
      console.error("Error during clock-out:", error);
      throw error;
    }
  },
  
  /**
   * Closes any open clock sessions from previous days
   * Uses a default of 8 hours when auto-closing a session
   * @param {string} userId - The user ID to check for
   * @returns {Promise<Array>} - Array of auto-closed sessions
   */
  async autoCloseOpenSessions(userId) {
    try {
      // Get today's date
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Find all open clock-in records for this user before today
      const timekeepingRef = collection(db, "timekeeping");
      const q = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("status", "==", "in-progress"),
        limit(50)
      );
      
      const querySnapshot = await getDocs(q);
      const closedSessions = [];
      
      for (const docSnap of querySnapshot.docs) {
        try {
          const session = docSnap.data();
          
          if (!session.date) {
            console.error("Session missing date field:", docSnap.id);
            continue;
          }
          
          const sessionDate = new Date(`${session.date}T00:00:00`);
          
          // For evening shifts, allow until next day 08:00
          let cutoffTime = new Date(sessionDate);
          if (session.shiftType === 'evening') {
            cutoffTime.setDate(cutoffTime.getDate() + 1);
            cutoffTime.setHours(8, 0, 0, 0); // 08:00 next day
          } else {
            cutoffTime.setHours(21, 0, 0, 0); // 21:00 same day
          }
          
          // If the session has exceeded its time limit
          if (today > cutoffTime) {
            const docRef = doc(db, "timekeeping", docSnap.id);
            
            // Auto-close with 8 standard hours
            const updateData = {
              clockOutTime: session.shiftType === 'evening' ? "08:00" : "21:00",
              clockOutTimestamp: Timestamp.fromDate(cutoffTime),
              clockOutDate: session.shiftType === 'evening' ? 
                new Date(sessionDate.getTime() + 24*60*60*1000).toISOString().split('T')[0] : 
                session.date,
              totalHours: 8,
              standardHours: 8,
              overtimeHours: 0,
              status: "auto-closed",
              autoClosedReason: "Time limit exceeded",
              timeLimitViolation: true,
              updatedAt: serverTimestamp()
            };
            
            await updateDoc(docRef, updateData);
            
            // Sync to workHours
            try {
              await this.syncToWorkHours(userId, session.date, 8, 0);
            } catch (syncError) {
              console.error("Error syncing auto-closed session to workHours:", syncError);
            }
            
            closedSessions.push({
              id: docSnap.id,
              ...session,
              ...updateData
            });
          }
        } catch (sessionError) {
          console.error("Error processing session:", sessionError, docSnap.id);
        }
      }
      
      return closedSessions;
    } catch (error) {
      console.error("Error during auto-closing sessions:", error);
      return [];
    }
  },

  /**
   * Get user's timekeeper status for today
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} - Current timekeeping status
   */
  async getTodayStatus(userId) {
    try {
      // Get today's date
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      // Find clock-in record for today
      const timekeepingRef = collection(db, "timekeeping");
      const q = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", "==", dateString)
      );
      
      const querySnapshot = await getDocs(q);
      
      // Try to auto-close sessions
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
      
      // Return formatted status
      return {
        id: querySnapshot.docs[0].id,
        status: record.status,
        clockInTime: record.clockInTime,
        clockOutTime: record.clockOutTime,
        totalHours: record.totalHours,
        standardHours: record.standardHours,
        overtimeHours: record.overtimeHours,
        lunchBreakDeducted: record.lunchBreakDeducted,
        hasLunchBreak: record.hasLunchBreak,
        shiftType: record.shiftType,
        timeLimitViolation: record.timeLimitViolation,
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
   * Sync timekeeping data to workHours collection.
   * Will not overwrite existing manual entries for the date.
   * @param {string} userId - User ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {number} standardHours - Standard hours worked
   * @param {number} overtimeHours - Overtime hours worked
   * @returns {Promise<boolean>} - Success state
   */
  async syncToWorkHours(userId, date, standardHours, overtimeHours) {
    try {
      if (!date || !userId) {
        console.error("Missing required params in syncToWorkHours:", { userId, date });
        return false;
      }
      
      // Parse date information
      const [year, month, day] = date.split('-');
      
      if (!year || !month || !day) {
        console.error("Invalid date format in syncToWorkHours:", date);
        return false;
      }
      
      // Try to find existing workHours document
      const normalizedMonth = month.replace(/^0+/, ''); // Remove leading zeros
      
      const workHoursId = `${userId}_${normalizedMonth}_${year}`;
      const workHoursRef = doc(db, "workHours", workHoursId);
      
      try {
        const workHoursSnap = await getDoc(workHoursRef);
        
        if (workHoursSnap.exists()) {
          // Document exists, check if there's a manual entry for this date
          const workHoursData = workHoursSnap.data();
          const entries = workHoursData.entries || [];
          
          // Find entry for this date
          const entryIndex = entries.findIndex(entry => entry.date === date);
          
          if (entryIndex >= 0) {
            // Entry exists - only update if it doesn't have a manual value set
            const existingEntry = entries[entryIndex];
            
            // Special letters are considered manual entries - don't overwrite
            if (typeof existingEntry.total === 'string' && ["M", "P", "A"].includes(existingEntry.total)) {
              return false;
            }
            
            // Check if current entry appears to be a manual entry
            const hasManualEntry = existingEntry.notes?.includes("Manual entry") || 
                                existingEntry.notes?.includes("Inserted by admin");
            
            if (hasManualEntry) {
              return false;
            }
            
            // Update the entry with clock data
            entries[entryIndex] = {
              ...existingEntry,
              total: standardHours,
              overtime: overtimeHours,
              notes: existingEntry.notes || "Aggiornato dal sistema di timbrature"
            };
            
            // Update the document
            await updateDoc(workHoursRef, {
              entries,
              lastUpdated: serverTimestamp()
            });
          } else {
            // Entry doesn't exist for this date, add it
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
            
            // Add the new entry
            await updateDoc(workHoursRef, {
              entries: [...entries, newEntry],
              lastUpdated: serverTimestamp()
            });
          }
        } else {
          // Document doesn't exist, create it
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
   * Records a clock event from an offline database when connection is restored
   * @param {Array} offlineRecords - Array of offline records to sync
   * @returns {Promise<Object>} - Results of the sync operation
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
   * Gets a user's timekeeping history
   * @param {string} userId - The user ID
   * @param {Object} options - Filter options (month, year, status)
   * @returns {Promise<Array>} - Array of timekeeping records
   */
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
      
      // Add filters if provided
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

  /**
   * Get user's timekeeping records for a specific date range
   * @param {string} userId - The user ID
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of timekeeping records
   */
  async getRecordsByDateRange(userId, startDate, endDate) {
    try {
      const timekeepingRef = collection(db, "timekeeping");
      const q = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", ">=", startDate),
        where("date", "<=", endDate)
      );
      
      const querySnapshot = await getDocs(q);
      const records = [];
      
      querySnapshot.forEach((doc) => {
        records.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Sort by date
      records.sort((a, b) => a.date.localeCompare(b.date));
      
      return records;
    } catch (error) {
      console.error("Error getting records by date range:", error);
      throw error;
    }
  },

  /**
   * Get user's timekeeping records for a specific month
   * @param {string} userId - The user ID
   * @param {string} year - Year as string
   * @param {string} month - Month as string (1-12)
   * @returns {Promise<Array>} - Array of timekeeping records for the month
   */
  async getRecordsByMonth(userId, year, month) {
    try {
      const timekeepingRef = collection(db, "timekeeping");
      const q = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("year", "==", year),
        where("month", "==", month.padStart(2, '0'))
      );
      
      const querySnapshot = await getDocs(q);
      const records = [];
      
      querySnapshot.forEach((doc) => {
        records.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Sort by date
      records.sort((a, b) => a.date.localeCompare(b.date));
      
      return records;
    } catch (error) {
      console.error("Error getting records by month:", error);
      throw error;
    }
  },

  /**
   * Administrative function to manually adjust a timekeeping record
   * @param {string} recordId - The record ID to update
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} - Updated record
   */
  async adminUpdateRecord(recordId, updates) {
    try {
      const recordRef = doc(db, "timekeeping", recordId);
      const recordSnap = await getDoc(recordRef);
      
      if (!recordSnap.exists()) {
        throw new Error("Record not found");
      }
      
      const currentRecord = recordSnap.data();
      
      // Prepare update data
      const updateData = {
        ...updates,
        updatedAt: serverTimestamp(),
        adminModified: true,
        adminModifiedAt: serverTimestamp()
      };
      
      // If hours are being updated, recalculate totals
      if (updates.standardHours !== undefined || updates.overtimeHours !== undefined) {
        const standardHours = updates.standardHours !== undefined ? updates.standardHours : currentRecord.standardHours;
        const overtimeHours = updates.overtimeHours !== undefined ? updates.overtimeHours : currentRecord.overtimeHours;
        
        updateData.totalHours = standardHours + overtimeHours;
      }
      
      await updateDoc(recordRef, updateData);
      
      // If hours changed, sync to workHours
      if (updates.standardHours !== undefined || updates.overtimeHours !== undefined) {
        try {
          await this.syncToWorkHours(
            currentRecord.userId,
            currentRecord.date,
            updateData.standardHours || currentRecord.standardHours,
            updateData.overtimeHours || currentRecord.overtimeHours
          );
        } catch (syncError) {
          console.error("Error syncing admin update to workHours:", syncError);
        }
      }
      
      return {
        id: recordId,
        ...currentRecord,
        ...updateData
      };
    } catch (error) {
      console.error("Error in admin update:", error);
      throw error;
    }
  },

  /**
   * Delete a timekeeping record (admin function)
   * @param {string} recordId - The record ID to delete
   * @returns {Promise<boolean>} - Success state
   */
  async adminDeleteRecord(recordId) {
    try {
      const recordRef = doc(db, "timekeeping", recordId);
      const recordSnap = await getDoc(recordRef);
      
      if (!recordSnap.exists()) {
        throw new Error("Record not found");
      }
      
      const recordData = recordSnap.data();
      
      // Delete the record
      await deleteDoc(recordRef);
      
      console.log(`Deleted timekeeping record: ${recordId}`);
      return true;
    } catch (error) {
      console.error("Error deleting record:", error);
      throw error;
    }
  },

  /**
   * Get statistics for a user's timekeeping data
   * @param {string} userId - The user ID
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @returns {Promise<Object>} - Statistics object
   */
  async getStatistics(userId, startDate, endDate) {
    try {
      const records = await this.getRecordsByDateRange(userId, startDate, endDate);
      
      const stats = {
        totalDays: records.length,
        completedDays: records.filter(r => r.status === "completed").length,
        inProgressDays: records.filter(r => r.status === "in-progress").length,
        autoClosedDays: records.filter(r => r.status === "auto-closed").length,
        totalStandardHours: 0,
        totalOvertimeHours: 0,
        totalHours: 0,
        averageHoursPerDay: 0,
        daysWithLunchBreak: 0,
        timeLimitViolations: 0,
        shiftTypeBreakdown: {
          morning: 0,
          evening: 0
        }
      };
      
      records.forEach(record => {
        if (record.standardHours) stats.totalStandardHours += record.standardHours;
        if (record.overtimeHours) stats.totalOvertimeHours += record.overtimeHours;
        if (record.totalHours) stats.totalHours += record.totalHours;
        if (record.hasLunchBreak) stats.daysWithLunchBreak++;
        if (record.timeLimitViolation) stats.timeLimitViolations++;
        if (record.shiftType) stats.shiftTypeBreakdown[record.shiftType]++;
      });
      
      if (stats.completedDays > 0) {
        stats.averageHoursPerDay = stats.totalHours / stats.completedDays;
      }
      
      return stats;
    } catch (error) {
      console.error("Error calculating statistics:", error);
      throw error;
    }
  },
  
  /**
   * Registers a device for QR code scanning
   * @param {string} deviceId - Unique device identifier
   * @param {string} deviceName - Human-readable device name
   * @param {Object} deviceInfo - Additional device information
   * @returns {Promise<Object>} - Device registration info
   */
  async registerTimekeepingDevice(deviceId, deviceName, deviceInfo = {}) {
    try {
      // Check if current user is an admin
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("You must be logged in to register a device");
      }
      
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists() || userSnap.data().role !== "admin") {
        throw new Error("Only administrators can register scanning devices");
      }
      
      // Check if device already exists
      const deviceRef = doc(db, "scanDevices", deviceId);
      const deviceSnap = await getDoc(deviceRef);
      
      if (deviceSnap.exists()) {
        // Update existing device
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
      
      // Create new device
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
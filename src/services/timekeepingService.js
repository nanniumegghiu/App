// src/services/timekeepingService.js - With improved error handling for duplicate entries
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
 * Service for handling time clock functionality
 */
const timekeepingService = {
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
      
      // Get current date in YYYY-MM-DD format (based on local timezone)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      // Format time in HH:MM format
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      
      console.log(`Checking existing records for ${userId} on ${dateString}`);
      
      // Check if user already has ANY record for today (in-progress OR completed)
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
        
        // If there's a completed record for today (already clocked out)
        if (existingRecord.clockOutTime && existingRecord.status === "completed") {
          throw new Error(`Hai già completato la giornata lavorativa. Ingresso: ${existingRecord.clockInTime}, Uscita: ${existingRecord.clockOutTime}`);
        }
        
        // If there's an auto-closed record for today
        if (existingRecord.status === "auto-closed") {
          throw new Error(`Giornata precedente chiusa automaticamente. Per modifiche contatta l'amministratore.`);
        }
        
        // If there's only a clock-in (in-progress), return warning but allow continuation
        if (existingRecord.clockInTime && !existingRecord.clockOutTime && existingRecord.status === "in-progress") {
          // Return the existing record with a clear message
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
      
      // Get current date in YYYY-MM-DD format
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      // Format time in HH:MM format
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      
      console.log(`Looking for active clock-in for ${userId} on ${dateString}`);
      
      // Find active clock-in record for today
      const timekeepingRef = collection(db, "timekeeping");
      const activeQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", "==", dateString),
        where("status", "==", "in-progress")
      );
      
      const activeSnapshot = await getDocs(activeQuery);
      
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
        
        // No active clock-in found - user needs to clock in first
        const userName = userData.nome && userData.cognome ? 
          `${userData.nome} ${userData.cognome}` : userData.email;
        
        throw new Error(`Nessun ingresso trovato per oggi. Prima devi timbrare l'INGRESSO, poi potrai timbrare l'USCITA.`);
      }
      
      console.log(`Found active clock-in record, processing clock-out`);
      
      // Get the clock-in record
      const docRef = doc(db, "timekeeping", activeSnapshot.docs[0].id);
      const record = activeSnapshot.docs[0].data();
      
      // Calculate hours worked
      const clockInParts = record.clockInTime.split(':');
      const clockInHour = parseInt(clockInParts[0]);
      const clockInMinute = parseInt(clockInParts[1]);
      
      const clockOutHour = parseInt(hours);
      const clockOutMinute = parseInt(minutes);
      
      // Calculate total minutes worked
      let totalMinutesWorked = (clockOutHour - clockInHour) * 60 + (clockOutMinute - clockInMinute);
      
      // If the result is negative or zero, assume it's for overnight shifts (add 24 hours)
      if (totalMinutesWorked <= 0) {
        totalMinutesWorked += 24 * 60;
      }
      
      // Round minutes to nearest half hour
      // If minutes >= 30, round up to next hour, otherwise round down
      let roundedHoursWorked = Math.floor(totalMinutesWorked / 60);
      const remainingMinutes = totalMinutesWorked % 60;
      
      if (remainingMinutes >= 30) {
        roundedHoursWorked += 1;
      }
      
      // Split into standard hours (up to 8) and overtime
      const standardHours = Math.min(8, roundedHoursWorked);
      const overtimeHours = Math.max(0, roundedHoursWorked - 8);
      
      // Update the record with clock-out information
      const updateData = {
        clockOutTime: timeString,
        clockOutTimestamp: serverTimestamp(),
        totalHours: roundedHoursWorked,
        standardHours,
        overtimeHours,
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
      
      // Update workHours collection if needed - but don't overwrite manual entries
      try {
        await this.syncToWorkHours(userId, dateString, standardHours, overtimeHours);
      } catch (syncError) {
        console.error("Error syncing to workHours:", syncError);
        // Don't fail the clock-out if sync fails
      }
      
      const userName = userData.nome && userData.cognome ? 
        `${userData.nome} ${userData.cognome}` : userData.email;
      
      return {
        id: docRef.id,
        ...record,
        ...updateData,
        userName,
        message: "Uscita registrata con successo",
        clockInTime: record.clockInTime,
        clockOutTime: timeString,
        totalHours: roundedHoursWorked,
        standardHours,
        overtimeHours
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
      today.setHours(0, 0, 0, 0); // Set to beginning of day
      
      // Find all open clock-in records for this user before today
      const timekeepingRef = collection(db, "timekeeping");
      const q = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("status", "==", "in-progress"),
        limit(50) // Add limit to avoid processing too many at once
      );
      
      const querySnapshot = await getDocs(q);
      const closedSessions = [];
      
      // Loop through all open sessions
      for (const docSnap of querySnapshot.docs) {
        try {
          const session = docSnap.data();
          
          if (!session.date) {
            console.error("Session missing date field:", docSnap.id);
            continue; // Skip invalid sessions
          }
          
          const sessionDate = new Date(`${session.date}T00:00:00`);
          
          // If the session is from a previous day
          if (sessionDate < today) {
            const docRef = doc(db, "timekeeping", docSnap.id);
            
            // Auto-close with 8 standard hours
            const updateData = {
              clockOutTime: "23:59",
              clockOutTimestamp: Timestamp.fromDate(new Date(session.date + 'T23:59:00')),
              totalHours: 8,
              standardHours: 8,
              overtimeHours: 0,
              status: "auto-closed",
              autoClosedReason: "Missing clock-out",
              updatedAt: serverTimestamp()
            };
            
            await updateDoc(docRef, updateData);
            
            // Sync to workHours
            try {
              await this.syncToWorkHours(userId, session.date, 8, 0);
            } catch (syncError) {
              console.error("Error syncing auto-closed session to workHours:", syncError);
              // Continue even if sync fails
            }
            
            closedSessions.push({
              id: docSnap.id,
              ...session,
              ...updateData
            });
          }
        } catch (sessionError) {
          console.error("Error processing session:", sessionError, docSnap.id);
          // Continue with next session
        }
      }
      
      return closedSessions;
    } catch (error) {
      console.error("Error during auto-closing sessions:", error);
      // Return empty array instead of throwing - don't block the dashboard
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
      
      // Try to auto-close sessions regardless of today's status
      try {
        await this.autoCloseOpenSessions(userId);
      } catch (closeError) {
        console.error("Error auto-closing sessions:", closeError);
        // Don't block the rest of the function
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
            // Special values (M, P, A) are considered manual entries
            const existingEntry = entries[entryIndex];
            
            // Special letters are considered manual entries - don't overwrite
            if (typeof existingEntry.total === 'string' && ["M", "P", "A"].includes(existingEntry.total)) {
              // Do not modify manual entries with special codes
              return false;
            }
            
            // Check if current entry appears to be a manual entry
            // If overtime is already set or hours don't match timekeeping defaults, 
            // consider it a manual entry and don't update
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
            const isWeekend = [0, 6].includes(new Date(date).getDay()); // 0 = Sunday, 6 = Saturday
            
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
          const isWeekend = [0, 6].includes(new Date(date).getDay()); // 0 = Sunday, 6 = Saturday
          
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
      return false; // Return false instead of throwing - don't block timekeeping process
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
      return []; // Return empty array instead of throwing
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
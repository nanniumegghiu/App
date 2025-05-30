// src/services/timekeepingService.js - Versione con auto-chiusura turni > 18 ore
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
 * Controlla se l'orario di uscita è valido - MODIFICATO per auto-chiusura > 18 ore
 */
const validateClockOutTime = (clockInTime, clockInDate, clockOutTime, clockOutDate) => {
  const maxExitInfo = calculateMaxExitTime(clockInTime, clockInDate);
  
  // Calcola la durata del turno in ore
  const [inHours, inMinutes] = clockInTime.split(':').map(Number);
  const [outHours, outMinutes] = clockOutTime.split(':').map(Number);
  
  const inTotalMinutes = inHours * 60 + inMinutes;
  let outTotalMinutes = outHours * 60 + outMinutes;
  
  // Se uscita è il giorno dopo, aggiungi 24 ore
  if (clockOutDate !== clockInDate) {
    outTotalMinutes += 1440; // 24 ore in minuti
  }
  
  const durationMinutes = outTotalMinutes - inTotalMinutes;
  const durationHours = durationMinutes / 60;
  
  console.log(`Validazione turno: ${clockInTime} (${clockInDate}) → ${clockOutTime} (${clockOutDate})`);
  console.log(`Durata turno: ${durationHours.toFixed(2)} ore`);
  
  // REGOLA 1: Turno troppo corto (meno di 1 minuto) - sempre invalido
  if (durationMinutes < 1) {
    return {
      isValid: false,
      reason: `Durata turno troppo breve: ${durationMinutes} minuti. Minimo 1 minuto.`,
      maxExitInfo
    };
  }
  
  // REGOLA 2: NUOVA LOGICA - Turno > 18 ore → Auto-chiusura a 8 ore
  if (durationHours > 18) {
    // Calcola l'orario di auto-chiusura (ingresso + 8 ore)
    const autoCloseMinutes = inTotalMinutes + (8 * 60); // +8 ore
    
    let autoCloseDate = clockInDate;
    let autoCloseTotalMinutes = autoCloseMinutes;
    
    // Se supera la mezzanotte, passa al giorno successivo
    if (autoCloseMinutes >= 1440) {
      const nextDate = new Date(clockInDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const year = nextDate.getFullYear();
      const month = String(nextDate.getMonth() + 1).padStart(2, '0');
      const day = String(nextDate.getDate()).padStart(2, '0');
      autoCloseDate = `${year}-${month}-${day}`;
      autoCloseTotalMinutes = autoCloseMinutes - 1440;
    }
    
    const autoCloseHours = Math.floor(autoCloseTotalMinutes / 60);
    const autoCloseMin = autoCloseTotalMinutes % 60;
    const autoCloseTime = `${String(autoCloseHours).padStart(2, '0')}:${String(autoCloseMin).padStart(2, '0')}`;
    
    return {
      isValid: false,
      autoClose: true, // Flag per indicare auto-chiusura
      reason: `Turno troppo lungo (${durationHours.toFixed(1)} ore). Auto-chiuso a 8 ore lavorative.`,
      autoCloseData: {
        clockOutTime: autoCloseTime,
        clockOutDate: autoCloseDate,
        totalHours: 8,
        standardHours: 8,
        overtimeHours: 0,
        autoClosedReason: `Auto-chiuso: turno superiore a 18 ore (${durationHours.toFixed(1)}h). Limitato a 8 ore standard.`
      },
      maxExitInfo
    };
  }
  
  // REGOLA 3: Turno normale stesso giorno (≤ 12 ore) - sempre valido
  if (clockInDate === clockOutDate && durationHours <= 12) {
    console.log(`Turno normale stesso giorno: ${durationHours.toFixed(2)} ore - VALIDO`);
    return {
      isValid: true,
      reason: null,
      maxExitInfo
    };
  }
  
  // REGOLA 4: Per turni lunghi ma ≤ 18 ore, applica le regole originali
  
  // Controlla se la data di uscita è corretta secondo le regole
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
  const [outHoursFinal, outMinutesFinal] = clockOutTime.split(':').map(Number);
  const [maxHours, maxMinutes] = maxExitInfo.maxExitTime.split(':').map(Number);
  
  const outTotalMinutesFinal = outHoursFinal * 60 + outMinutesFinal;
  const maxTotalMinutes = maxHours * 60 + maxMinutes;
  
  // Controlla solo se siamo nella data limite corretta
  if (clockOutDate === maxExitInfo.maxExitDate && outTotalMinutesFinal > maxTotalMinutes) {
    return {
      isValid: false,
      reason: `Per un ingresso alle ${clockInTime}, l'uscita deve essere entro le ${maxExitInfo.maxExitTime}`,
      maxExitInfo
    };
  }
  
  console.log(`Turno lungo/multi-giorno validato: ${durationHours.toFixed(2)} ore - VALIDO`);
  
  return {
    isValid: true,
    reason: null,
    maxExitInfo
  };
};

/**
 * Calcola distribuzione multi-giorno per auto-chiusura (sempre 8 ore standard)
 */
const calculateAutoCloseMultiDay = (clockInTime, clockInDate, clockOutTime, clockOutDate) => {
  const [inHours, inMinutes] = clockInTime.split(':').map(Number);
  const [outHours, outMinutes] = clockOutTime.split(':').map(Number);
  
  let inTotalMinutes = inHours * 60 + inMinutes;
  let outTotalMinutes = outHours * 60 + outMinutes;
  
  // Se uscita è il giorno dopo, aggiungi 24 ore all'uscita
  if (clockOutDate !== clockInDate) {
    outTotalMinutes += 1440;
  }
  
  const totalWorkedMinutes = 480; // Sempre 8 ore = 480 minuti
  
  // Distribuzione delle ore per data (sempre 8 ore standard totali)
  const workDistribution = [];
  
  if (clockInDate === clockOutDate) {
    // Stesso giorno - tutte le 8 ore in un giorno
    workDistribution.push({
      date: clockInDate,
      totalMinutes: totalWorkedMinutes,
      totalHours: 8,
      standardHours: 8,
      overtimeHours: 0,
      notes: `Auto-chiuso: turno limitato a 8 ore standard (${clockInTime}-${clockOutTime})`
    });
  } else {
    // Turno multi-data - distribuisci le 8 ore
    const startDate = new Date(clockInDate);
    const endDate = new Date(clockOutDate);
    
    // Calcola quante ore nel primo giorno (dalla partenza alla mezzanotte)
    const minutesToMidnight = 1440 - inTotalMinutes;
    const hoursFirstDay = Math.min(8, Math.floor(minutesToMidnight / 60));
    const hoursSecondDay = 8 - hoursFirstDay;
    
    // Primo giorno
    if (hoursFirstDay > 0) {
      workDistribution.push({
        date: clockInDate,
        totalMinutes: hoursFirstDay * 60,
        totalHours: hoursFirstDay,
        standardHours: hoursFirstDay,
        overtimeHours: 0,
        notes: `Auto-chiuso: turno multi-data limitato a 8h std (inizio ${clockInTime})`
      });
    }
    
    // Secondo giorno
    if (hoursSecondDay > 0) {
      workDistribution.push({
        date: clockOutDate,
        totalMinutes: hoursSecondDay * 60,
        totalHours: hoursSecondDay,
        standardHours: hoursSecondDay,
        overtimeHours: 0,
        notes: `Auto-chiuso: turno multi-data limitato a 8h std (fine ${clockOutTime})`
      });
    }
  }
  
  return {
    totalMinutesWorked: totalWorkedMinutes,
    netMinutesWorked: totalWorkedMinutes,
    lunchBreakMinutes: 0, // Nessuna pausa pranzo per turni auto-chiusi a 8h
    totalHours: 8,
    standardHours: 8,
    overtimeHours: 0,
    hasLunchBreak: false,
    workDistribution,
    isMultiDay: clockInDate !== clockOutDate,
    isAutoClose: true
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
      
      // Calcola standard e straordinario per questo giorno - LOGICA CORRETTA
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
 * Sincronizza con workHours per turni multi-data - MODIFICATO per gestire turni multipli
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
            
            // NUOVO: Somma le ore e applica la regola 8h standard max per giornata
            const currentStandardHours = parseInt(existingEntry.total) || 0;
            const currentOvertimeHours = parseInt(existingEntry.overtime) || 0;
            
            // Calcola il totale delle ore della giornata
            const totalCurrentHours = currentStandardHours + currentOvertimeHours;
            const totalNewHours = standardHours + overtimeHours;
            const grandTotalHours = totalCurrentHours + totalNewHours;
            
            // Applica la regola: massimo 8 ore standard per giornata
            const finalStandardHours = Math.min(8, grandTotalHours);
            const finalOvertimeHours = Math.max(0, grandTotalHours - 8);
            
            // Combina le note
            let combinedNotes = existingEntry.notes || "";
            if (combinedNotes && !combinedNotes.includes(notes)) {
              combinedNotes += ` + ${notes}`;
            } else if (!combinedNotes) {
              combinedNotes = notes || "Turni multipli sommati dal sistema";
            }
            
            // Aggiorna l'entry esistente con la regola 8h standard
            entries[entryIndex] = {
              ...existingEntry,
              total: finalStandardHours,
              overtime: finalOvertimeHours,
              notes: combinedNotes
            };
            
            await updateDoc(workHoursRef, {
              entries,
              lastUpdated: serverTimestamp()
            });
            
            console.log(`Turni multipli per ${date}:`);
            console.log(`- Ore precedenti: ${currentStandardHours} std + ${currentOvertimeHours} straord = ${totalCurrentHours}h totali`);
            console.log(`- Ore nuovo turno: ${standardHours} std + ${overtimeHours} straord = ${totalNewHours}h totali`);
            console.log(`- Totale giornata: ${grandTotalHours}h → ${finalStandardHours} std + ${finalOvertimeHours} straord (regola 8h max)`);
            
            syncResults.push({ 
              date, 
              success: true, 
              action: "summed_with_8h_rule", 
              previousHours: { standard: currentStandardHours, overtime: currentOvertimeHours, total: totalCurrentHours },
              newTurnHours: { standard: standardHours, overtime: overtimeHours, total: totalNewHours },
              finalHours: { standard: finalStandardHours, overtime: finalOvertimeHours, total: grandTotalHours }
            });
          } else {
            // Crea nuova entry
            const dayOfWeek = new Date(date).toLocaleDateString('it-IT', { weekday: 'long' });
            const isWeekend = [0, 6].includes(new Date(date).getDay());
            
            const newEntry = {
              date,
              day: dayOfWeek,
              total: standardHours,
              overtime: overtimeHours,
              notes: notes || "Aggiunto dal sistema di timbrature",
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
            notes: notes || "Tramite Timbratura",
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
 * Service per la gestione delle timbrature con supporto multi-data e auto-chiusura
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
 * Registra uscita - MODIFICATO per gestire auto-chiusura > 18 ore
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
    
    // QUERY SEMPLIFICATA - senza orderBy per evitare errori di indice
    const activeQuery = query(
      timekeepingRef,
      where("userId", "==", userId),
      where("status", "==", "in-progress")
    );
    
    const activeSnapshot = await getDocs(activeQuery);
    
    if (activeSnapshot.empty) {
      throw new Error(`Nessun ingresso attivo trovato. Prima devi timbrare l'INGRESSO.`);
    }
    
    console.log(`Found ${activeSnapshot.size} active clock-in records`);
    
    // Ordina manualmente i risultati per trovare il più recente
    const activeRecords = activeSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Ordina per clockInTimestamp (più recente prima)
    activeRecords.sort((a, b) => {
      const aTime = a.clockInTimestamp?.toDate?.() || new Date(a.clockInTimestamp || 0);
      const bTime = b.clockInTimestamp?.toDate?.() || new Date(b.clockInTimestamp || 0);
      return bTime - aTime;
    });
    
    const record = activeRecords[0]; // Prendi il più recente
    console.log(`Processing most recent clock-in record:`, record);
    
    const docRef = doc(db, "timekeeping", record.id);
    
    // NUOVA VALIDAZIONE: Controlla se il turno supera le 18 ore
    const validation = validateClockOutTime(
      record.clockInTime, 
      record.date, 
      currentTimeString, 
      currentDateString
    );
    
    let updateData;
    let workResult;
    let successMessage;
    
    if (!validation.isValid && validation.autoClose) {
      // CASO AUTO-CHIUSURA: Turno > 18 ore
      console.log(`Auto-closing long shift: ${validation.reason}`);
      
      const autoCloseData = validation.autoCloseData;
      
      // Usa il calcolo specifico per auto-chiusura
      workResult = calculateAutoCloseMultiDay(
        record.clockInTime,
        record.date,
        autoCloseData.clockOutTime,
        autoCloseData.clockOutDate
      );
      
      updateData = {
        clockOutTime: autoCloseData.clockOutTime,
        clockOutDate: autoCloseData.clockOutDate,
        clockOutTimestamp: serverTimestamp(),
        totalHours: workResult.totalHours,
        standardHours: workResult.standardHours,
        overtimeHours: workResult.overtimeHours,
        lunchBreakDeducted: workResult.hasLunchBreak,
        lunchBreakMinutes: workResult.lunchBreakMinutes,
        isMultiDay: workResult.isMultiDay,
        workDistribution: workResult.workDistribution,
        status: "auto-closed",
        autoClosedReason: autoCloseData.autoClosedReason,
        scanInfo: {
          ...(record.scanInfo || {}),
          clockOut: {
            ...scanInfo,
            timestamp: now.toISOString(),
            originalTime: currentTimeString,
            originalDate: currentDateString,
            autoClosedTo: autoCloseData.clockOutTime,
            autoClosedDate: autoCloseData.clockOutDate
          }
        },
        updatedAt: serverTimestamp()
      };
      
      successMessage = `⚠️ TURNO AUTO-CHIUSO: Durata eccessiva rilevata.\n` +
                      `Orario effettivo: ${record.clockInTime} → ${currentTimeString}\n` +
                      `Orario registrato: ${record.clockInTime} → ${autoCloseData.clockOutTime}\n` +
                      `Ore assegnate: 8 ore standard (nessuno straordinario)`;
      
    } else if (!validation.isValid) {
      // CASO NORMALE: Errore di validazione
      throw new Error(validation.reason);
    } else {
      // CASO NORMALE: Turno valido
      workResult = calculateMultiDayWorkingHours(
        record.clockInTime,
        record.date,
        currentTimeString,
        currentDateString
      );
      
      updateData = {
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
      
      successMessage = `Uscita registrata con successo. Ore totali: ${workResult.totalHours}`;
      
      if (workResult.hasLunchBreak) {
        successMessage += ` (pausa pranzo di ${workResult.lunchBreakMinutes} min detratta)`;
      }
      
      if (workResult.isMultiDay) {
        successMessage += `\nTurno multi-data distribuito su ${workResult.workDistribution.length} giorni`;
        workResult.workDistribution.forEach(day => {
          successMessage += `\n- ${day.date}: ${day.totalHours}h (${day.standardHours} std + ${day.overtimeHours} straord.)`;
        });
      }
    }
    
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
    
    return {
      id: docRef.id,
      ...record,
      ...updateData,
      userName,
      message: successMessage,
      workCalculation: workResult,
      isAutoClose: validation.autoClose || false
    };
    
  } catch (error) {
    console.error("Error during clock-out:", error);
    throw error;
  }
},

/**
 * Ottieni stato timbrature di oggi - MODIFICATO per evitare errori di indice
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
    
    // Cerca sessioni in corso - QUERY SEMPLIFICATA
    const activeQuery = query(
      timekeepingRef,
      where("userId", "==", userId),
      where("status", "==", "in-progress")
    );
    
    const activeSnapshot = await getDocs(activeQuery);
    
    if (!activeSnapshot.empty) {
      // Ordina manualmente per timestamp
      const activeRecords = activeSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      activeRecords.sort((a, b) => {
        const aTime = a.clockInTimestamp?.toDate?.() || new Date(a.clockInTimestamp || 0);
        const bTime = b.clockInTimestamp?.toDate?.() || new Date(b.clockInTimestamp || 0);
        return bTime - aTime;
      });
      
      const activeRecord = activeRecords[0];
      
      return {
        status: "in-progress",
        message: `Turno in corso dal ${activeRecord.date} alle ${activeRecord.clockInTime}`,
        date: activeRecord.date,
        clockInTime: activeRecord.clockInTime,
        clockInDate: activeRecord.date,
        timestamp: new Date().toISOString()
      };
    }
    
    // Cerca record di oggi - QUERY SEMPLIFICATA
    const todayQuery = query(
      timekeepingRef,
      where("userId", "==", userId),
      where("date", "==", dateString),
      where("status", "in", ["completed", "auto-closed"])
    );
    
    const todaySnapshot = await getDocs(todayQuery);
    
    if (!todaySnapshot.empty) {
      // Ordina manualmente per timestamp
      const todayRecords = todaySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      todayRecords.sort((a, b) => {
        const aTime = a.clockInTimestamp?.toDate?.() || new Date(a.clockInTimestamp || 0);
        const bTime = b.clockInTimestamp?.toDate?.() || new Date(b.clockInTimestamp || 0);
        return bTime - aTime;
      });
      
      const todayRecord = todayRecords[0];
      
      if (todayRecord.status === "completed") {
        return {
          status: "completed",
          message: `Turno completato: ${todayRecord.clockInTime} - ${todayRecord.clockOutTime}`,
          date: dateString,
          clockInTime: todayRecord.clockInTime,
          clockOutTime: todayRecord.clockOutTime,
          totalHours: todayRecord.totalHours,
          standardHours: todayRecord.standardHours,
          overtimeHours: todayRecord.overtimeHours,
          timestamp: new Date().toISOString()
        };
      } else if (todayRecord.status === "auto-closed") {
        return {
          status: "auto-closed",
          message: `Turno auto-chiuso per mancata uscita: ${todayRecord.clockInTime} - ${todayRecord.clockOutTime}`,
          date: dateString,
          clockInTime: todayRecord.clockInTime,
          clockOutTime: todayRecord.clockOutTime,
          totalHours: todayRecord.totalHours,
          standardHours: todayRecord.standardHours,
          overtimeHours: todayRecord.overtimeHours,
          autoClosedReason: todayRecord.autoClosedReason,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    // Nessun record trovato per oggi
    return {
      status: "not-started",
      message: "Nessuna timbratura registrata per oggi",
      date: dateString,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("Error getting today's status:", error);
    throw error;
  }
},

  /**
   * Registra un dispositivo per la scansione
   */
  async registerTimekeepingDevice(deviceId, deviceName, deviceInfo = {}) {
    try {
      const deviceRef = doc(db, "scanDevices", deviceId);
      const existingDevice = await getDoc(deviceRef);
      
      const deviceData = {
        deviceName,
        deviceInfo,
        active: true,
        lastActivity: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      if (existingDevice.exists()) {
        await updateDoc(deviceRef, deviceData);
        return {
          success: true,
          message: `Dispositivo ${deviceName} aggiornato con successo`,
          deviceId,
          action: 'updated'
        };
      } else {
        await setDoc(deviceRef, {
          ...deviceData,
          createdAt: serverTimestamp()
        });
        return {
          success: true,
          message: `Dispositivo ${deviceName} registrato con successo`,
          deviceId,
          action: 'created'
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
    try {
      console.log(`Syncing ${offlineRecords.length} offline records`);
      
      let successCount = 0;
      let failedCount = 0;
      const errors = [];
      
      for (const record of offlineRecords) {
        try {
          if (record.type === 'clockIn') {
            await this.clockIn(record.userId, record.scanInfo);
          } else if (record.type === 'clockOut') {
            await this.clockOut(record.userId, record.scanInfo);
          }
          successCount++;
        } catch (error) {
          console.error("Error syncing record:", error, record);
          failedCount++;
          errors.push({
            record,
            error: error.message
          });
        }
      }
      
      return {
        success: successCount,
        failed: failedCount,
        total: offlineRecords.length,
        errors
      };
      
    } catch (error) {
      console.error("Error syncing offline records:", error);
      throw error;
    }
  },

  /**
   * Ottieni statistiche timbrature per un utente
   */
  async getUserTimekeepingStats(userId, startDate, endDate) {
    try {
      const timekeepingRef = collection(db, "timekeeping");
      const q = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", ">=", startDate),
        where("date", "<=", endDate),
        where("status", "in", ["completed", "auto-closed"])
      );
      
      const querySnapshot = await getDocs(q);
      const records = [];
      
      querySnapshot.forEach(doc => {
        records.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Calcola statistiche
      const totalHours = records.reduce((sum, record) => sum + (record.totalHours || 0), 0);
      const standardHours = records.reduce((sum, record) => sum + (record.standardHours || 0), 0);
      const overtimeHours = records.reduce((sum, record) => sum + (record.overtimeHours || 0), 0);
      const autoClosedCount = records.filter(record => record.status === "auto-closed").length;
      const completedCount = records.filter(record => record.status === "completed").length;
      
      return {
        totalRecords: records.length,
        totalHours,
        standardHours,
        overtimeHours,
        completedCount,
        autoClosedCount,
        records
      };
      
    } catch (error) {
      console.error("Error getting user timekeeping stats:", error);
      throw error;
    }
  },

  /**
   * Ottieni record timbrature per data range
   */
  async getTimekeepingRecords(userId, startDate, endDate) {
    try {
      const timekeepingRef = collection(db, "timekeeping");
      const q = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("date", ">=", startDate),
        where("date", "<=", endDate),
        orderBy("date", "desc"),
        orderBy("clockInTimestamp", "desc")
      );
      
      const querySnapshot = await getDocs(q);
      const records = [];
      
      querySnapshot.forEach(doc => {
        records.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return records;
      
    } catch (error) {
      console.error("Error getting timekeeping records:", error);
      throw error;
    }
  }
};

export default timekeepingService;
// Script di migrazione per garantire che tutti gli utenti esistenti abbiano un documento in Firestore
// Salva questo file come migration.js e eseguilo con Node.js

const { initializeApp } = require('firebase/app');
const { getAuth, listUsers } = require('firebase-admin/auth');
const { getFirestore, doc, getDoc, setDoc } = require('firebase-admin/firestore');
const admin = require('firebase-admin');

// Configurazione del progetto Firebase - sostituisci con i tuoi dati
const serviceAccount = require('./path-to-your-serviceAccount.json');

// Inizializza l'app con credenziali admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = getAuth();
const db = getFirestore();

async function migrateUsers() {
  console.log('Avvio migrazione utenti...');
  
  try {
    // Ottieni tutti gli utenti dall'autenticazione Firebase
    const listUsersResult = await auth.listUsers();
    console.log(`Trovati ${listUsersResult.users.length} utenti in Firebase Authentication`);
    
    // Per ogni utente, verifica se esiste un documento in Firestore
    let createdCount = 0;
    let existingCount = 0;
    
    for (const user of listUsersResult.users) {
      const uid = user.uid;
      const email = user.email || '';
      
      console.log(`Controllo utente: ${email} (${uid})`);
      
      // Verifica se esiste già un documento per questo utente
      const userDocRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        // Documento mancante, crealo
        console.log(`Creazione documento per l'utente: ${email}`);
        
        // Estrai nome e cognome dall'email o dal displayName
        let nome = '';
        let cognome = '';
        
        if (user.displayName) {
          const nameParts = user.displayName.split(' ');
          nome = nameParts[0] || '';
          cognome = nameParts.slice(1).join(' ') || '';
        }
        
        // Determina il ruolo (admin solo se necessario, altrimenti user)
        const role = user.customClaims && user.customClaims.admin ? 'admin' : 'user';
        
        // Crea il documento
        await setDoc(userDocRef, {
          email: email,
          nome: nome,
          cognome: cognome,
          role: role,
          createdAt: new Date(),
          lastLogin: new Date(),
          migratedAt: new Date()
        });
        
        createdCount++;
      } else {
        console.log(`Documento esistente per l'utente: ${email}`);
        existingCount++;
      }
    }
    
    console.log('\nMigrazione completata:');
    console.log(`- Documenti creati: ${createdCount}`);
    console.log(`- Documenti già esistenti: ${existingCount}`);
    console.log(`- Totale utenti: ${listUsersResult.users.length}`);
    
  } catch (error) {
    console.error('Errore durante la migrazione:', error);
  }
}

// Esegui lo script
migrateUsers()
  .then(() => {
    console.log('Script di migrazione completato');
    process.exit(0);
  })
  .catch(error => {
    console.error('Errore nello script di migrazione:', error);
    process.exit(1);
  });
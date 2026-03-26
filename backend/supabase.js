const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const sUrl = 'SUPA' + 'BASE_URL';
const sKey = 'SUPA' + 'BASE_SERVICE_KEY';
const supabaseUrl = process.env[sUrl];
const supabaseKey = process.env[sKey];

if (!supabaseUrl || !supabaseKey) {
    console.warn("⚠️ Credenziali Supabase mancanti. Il database non funzionerà correttamente.");
}

// Aggiungiamo una sanitizzazione aggressiva in caso di copia-incolla errati da parte dell'utente in Railway
// Gestiamo anche il caso in cui sia presente un '=' iniziale o doppi protocolli
let cleanUrl = (supabaseUrl || 'https://placeholder.supabase.co').trim();
cleanUrl = cleanUrl.replace(/^["'=]+|["']+$/g, ''); // Rimuove ", ', = all'inizio e alla fine

// Se l'utente ha incollato qualcosa di assurdo come https://=https://...
if (cleanUrl.includes('https://') || cleanUrl.includes('http://')) {
    // Estraiamo l'ultimo URL valido se ce ne sono multipli concatenati
    const urls = cleanUrl.split(/https?:\/\//);
    cleanUrl = 'https://' + urls[urls.length - 1];
}

let cleanKey = (supabaseKey || 'placeholder').trim().replace(/^["'=]+|["']+$/g, '');

if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
}

console.log("[SUPABASE] Initializing client with:", cleanUrl);
const supabase = createClient(cleanUrl, cleanKey);
console.log("[SUPABASE] Client initialized successfully.");

module.exports = supabase;

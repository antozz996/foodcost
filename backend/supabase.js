const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const sUrl = 'SUPA' + 'BASE_URL';
const sKey = 'SUPA' + 'BASE_SERVICE_KEY';
const supabaseUrl = process.env[sUrl];
const supabaseKey = process.env[sKey];

if (!supabaseUrl || !supabaseKey) {
    console.warn("⚠️ Credenziali Supabase mancanti. Il database non funzionerà correttamente.");
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

module.exports = supabase;

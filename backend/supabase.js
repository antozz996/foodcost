const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env['SUPABASE_URL'];
const supabaseKey = process.env['SUPABASE_SERVICE_KEY'];

if (!supabaseUrl || !supabaseKey) {
    console.warn("⚠️ SUPABASE_URL o SUPABASE_SERVICE_KEY mancanti. Il database non funzionerà correttamente.");
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

module.exports = supabase;

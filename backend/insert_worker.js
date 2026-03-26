const supabase = require('./supabase');
async function run() {
    try {
        const payload = JSON.parse(process.argv[2]);
        const dbRes = await supabase.from('ingredienti').insert(payload).select();
        console.log(JSON.stringify({ success: true, dbRes }));
    } catch(e) {
        console.log(JSON.stringify({ success: false, error: e.message, stack: e.stack }));
    }
}
run();

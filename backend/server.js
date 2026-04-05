const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const supabase = require('./supabase');

const app = express();

// Performance: Gzip/Brotli Compression
app.use(compression());

// Security Headers
app.use(helmet({
    contentSecurityPolicy: false // Disabilitato per l'MVP per evitare blocchi su script inline di Vite
}));

// CORS Firewall
app.use(cors({
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '5mb' }));

// Rate Limiting contro attacchi DoS/Brute Force
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 500, 
    message: { error: 'Troppe richieste dal tuo IP, riprova più tardi.' }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url} | Headers: ${JSON.stringify(req.headers)}`);
    next();
});

app.post('/api/ghost-test', (req, res) => {
    console.log("[GHOST HIT] Body length:", JSON.stringify(req.body).length);
    res.json({ success: true, received: req.body });
});

// Debug Env endpoint
app.get('/api/debug-env', (req, res) => {
    res.json({ 
        keys: Object.keys(process.env).filter(k => k.includes('SUPA')),
        node: process.version,
        env: process.env.NODE_ENV
    });
});

// Middleware per proteggere le API e recuperare lo user_id
const authMiddleware = async (req, res, next) => {
    console.log(`[AUTH] ${req.method} ${req.url} - Inizio...`);
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        console.log(`[AUTH] Header mancante per ${req.url}`);
        return res.status(401).json({ error: 'Auth token missing' });
    }
    const token = authHeader.split(' ')[1];
    
    try {
        console.log(`[AUTH] Chiamata Supabase getUser...`);
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            console.error(`[AUTH] Errore Supabase per ${req.url}:`, error?.message || 'User null');
            return res.status(401).json({ 
                error: 'Invalid token', 
                details: error?.message || 'User non trovato'
            });
        }
        console.log(`[AUTH] Successo per user: ${user.id}`);
        req.user = user;
        next();
    } catch (err) {
        console.error(`[AUTH CRASH] ${req.url}:`, err.message);
        res.status(500).json({ error: "Crash durante Auth", details: err.message });
    }
};

app.post('/api/debug-outbound-get', async (req, res) => {
    try {
        const r = await fetch('https://httpbin.org/get');
        const t = await r.text();
        res.json({ ok: r.ok, text: t.substring(0, 100) });
    } catch(e) {
        res.status(500).json({ err: e.message });
    }
});

app.post('/api/debug-outbound-post', async (req, res) => {
    try {
        const r = await fetch('https://httpbin.org/post', {
            method: 'POST',
            body: JSON.stringify({ test: 123 }),
            headers: { 'Content-Type': 'application/json' }
        });
        const t = await r.text();
        res.json({ ok: r.ok, text: t.substring(0, 100) });
    } catch(e) {
        res.status(500).json({ err: e.message });
    }
});

app.post('/api/ingredienti/batch', authMiddleware, apiLimiter, async (req, res) => {
    try {
        const { ingredienti } = req.body;
        if (!ingredienti || !Array.isArray(ingredienti) || ingredienti.length === 0) {
            return res.status(400).json({ error: "Formato non valido" });
        }

        const data_aggiornamento = new Date().toISOString().split('T')[0];
        const inserts = ingredienti.map(i => {
            const prezzo = parseFloat(i.prezzo_attuale);
            const scarto = parseFloat(i.scarto);
            return {
                user_id: req.user.id,
                nome: i.nome || 'Sconosciuto',
                unita: i.unita || 'pz',
                prezzo_attuale: isNaN(prezzo) || prezzo < 0 ? 0 : prezzo,
                scarto: isNaN(scarto) || scarto < 0 || scarto > 99 ? 0 : scarto,
                data_aggiornamento
            };
        });

        // High-performance single database transaction for the entire batch
        const { data, error } = await supabase.from('ingredienti').insert(inserts).select();
        
        if (error) {
            console.warn('[BATCH BULK FAILED] error.code:', error.code, 'message:', error.message);
            // Fallback: If bulk insert fails because of a stale schema cache (PostgREST specific error),
            // try to insert them one by one. It's slower but much more resilient to cache issues.
            if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('schema cache')) {
                console.log('[BATCH FALLBACK] Tentativo di inserimento sequenziale...');
                let inserted = 0;
                for (const i of inserts) {
                    const { error: errLoop } = await supabase.from('ingredienti').insert([i]);
                    if (!errLoop) inserted++;
                    else console.error('[BATCH FALLBACK ERR]', i.nome, errLoop.message);
                }
                return res.json({ count: inserted, fallback: true });
            }
            return res.status(500).json({ error: "Errore inserimento database", details: error.message });
        }

        res.json({ count: data?.length || 0 });

    } catch (err) {
        console.error('[BATCH CRASH]', err.message, err.stack);
        res.status(500).json({ error: 'Crash generale batch', details: err.message });
    }
});

app.use('/api/', apiLimiter);

// ================= INGREDIENTI =================
app.get('/api/ingredienti', authMiddleware, async (req, res) => {
    const { data, error } = await supabase.from('ingredienti').select('*').eq('user_id', req.user.id).order('nome');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/ingredienti', authMiddleware, async (req, res) => {
    try {
        const { nome, unita, prezzo_attuale, scarto } = req.body;
        
        // Business Logic Validation
        if (prezzo_attuale < 0) return res.status(400).json({ error: "Il prezzo non può essere negativo." });
        if (scarto < 0 || scarto > 99) return res.status(400).json({ error: "Lo scarto deve essere tra 0 e 99." });

        const data_aggiornamento = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase.from('ingredienti').insert([
            { user_id: req.user.id, nome, unita, prezzo_attuale, scarto: scarto || 0, data_aggiornamento }
        ]).select();
        
        if (error) {
            if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('schema cache')) {
                return res.status(400).json({ 
                    error: "Errore Schema Database", 
                    details: "Colonna mancante o cache scaduta su Supabase. Controlla il SQL Editor."
                });
            }
            throw error;
        }
        if (!data || data.length === 0) throw new Error("Errore durante l'inserimento dell'ingrediente.");
        
        res.json({ id: data[0].id });
    } catch (err) {
        console.error('[API ERROR] POST /api/ingredienti:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/ingredienti/:id', authMiddleware, async (req, res) => {
    try {
        const { prezzo_attuale, scarto } = req.body;

        // Business Logic Validation
        if (prezzo_attuale < 0) return res.status(400).json({ error: "Il prezzo non può essere negativo." });
        if (scarto < 0 || scarto > 99) return res.status(400).json({ error: "Lo scarto deve essere tra 0 e 99." });

        const data_aggiornamento = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase.from('ingredienti')
            .update({ prezzo_attuale, scarto: scarto || 0, data_aggiornamento })
            .eq('id', req.params.id)
            .eq('user_id', req.user.id)
            .select();
            
        if (error) throw error;
        res.json({ updated: data?.length || 0 });
    } catch (err) {
        console.error('[API ERROR] PUT /api/ingredienti/:id:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/ingredienti/:id', authMiddleware, async (req, res) => {
    try {
        const { error } = await supabase.from('ingredienti').delete().eq('id', req.params.id).eq('user_id', req.user.id);
        if (error) throw error;
        res.json({ deleted: 1 });
    } catch (err) {
        console.error('[API ERROR] DELETE /api/ingredienti/:id:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Helper for Real Cost calculating Yield (Scarto)
const getRealCost = (qty, price, scarto) => {
    const yieldPercent = 1 - ((scarto || 0) / 100);
    return qty * (price / (yieldPercent === 0 ? 1 : yieldPercent));
};

// ================= RICETTE =================
app.get('/api/ricette', authMiddleware, async (req, res) => {
    try {
        // Step 1: Fetch main recipes
        const { data: ricette, error } = await supabase
            .from('ricette')
            .select('*')
            .eq('user_id', req.user.id)
            .order('nome');

        if (error) throw error;
        if (!ricette || ricette.length === 0) return res.json([]);

        // Step 2: Batch fetch ALL related ingredients in one go (avoids N+1 and complex deep joins)
        const ricettaIds = ricette.map(r => r.id);
        const { data: ricetta_ingredienti, error: err2 } = await supabase
            .from('ricetta_ingredienti')
            .select('ricetta_id, quantita, ingredienti(prezzo_attuale, scarto)')
            .in('ricetta_id', ricettaIds);
            
        if (err2) throw err2;

        const results = ricette.map(r => {
            const ings = (ricetta_ingredienti || []).filter(ri => ri.ricetta_id === r.id);
            const costo_totale = ings.reduce((sum, ri) => {
                return sum + getRealCost(ri.quantita, ri.ingredienti?.prezzo_attuale || 0, ri.ingredienti?.scarto || 0);
            }, 0);
            
            return {
                ...r,
                costo_totale: parseFloat(costo_totale.toFixed(2)),
                costo_porzione: parseFloat((costo_totale / r.porzioni).toFixed(2))
            };
        });

        res.json(results);
    } catch (err) {
        console.error('[API ERROR] GET /api/ricette:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ricette', authMiddleware, async (req, res) => {
    try {
        const { nome, porzioni, ingredienti } = req.body;

        // Business Logic Validation
        if (porzioni < 1) return res.status(400).json({ error: "Le porzioni non possono essere inferiori a 1." });

        const { data: ricetta, error } = await supabase.from('ricette').insert([
            { user_id: req.user.id, nome, porzioni: porzioni || 1 }
        ]).select();
        
        if (error) throw error;
        if (!ricetta || ricetta.length === 0) throw new Error("Errore creazione ricetta");
        
        const ricetta_id = ricetta[0].id;
        
        if (ingredienti && ingredienti.length > 0) {
            const inserts = ingredienti.map(i => ({
                ricetta_id, ingrediente_id: i.ingrediente_id, quantita: i.quantita
            }));
            const { error: errIns } = await supabase.from('ricetta_ingredienti').insert(inserts);
            if (errIns) throw errIns;
        }
        res.json({ id: ricetta_id });
    } catch (err) {
        console.error('[API ERROR] POST /api/ricette:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/ricette/:id/ingredienti', authMiddleware, async (req, res) => {
    const { data, error } = await supabase.from('ricetta_ingredienti')
        .select('id, quantita, ingredienti(id, nome, unita, prezzo_attuale, scarto)')
        .eq('ricetta_id', req.params.id);
        
    if (error) return res.status(500).json({ error: error.message });
    
    const results = data.map(row => {
        const cost = getRealCost(row.quantita, row.ingredienti.prezzo_attuale, row.ingredienti.scarto);
        return {
            id_riga: row.id,
            id: row.ingredienti.id,
            nome: row.ingredienti.nome,
            unita: row.ingredienti.unita,
            prezzo_attuale: row.ingredienti.prezzo_attuale,
            scarto: row.ingredienti.scarto,
            quantita: row.quantita,
            costo: parseFloat(cost.toFixed(2))
        };
    });
    res.json(results);
});

app.delete('/api/ricette/:id', authMiddleware, async (req, res) => {
    try {
        const { error } = await supabase.from('ricette').delete().eq('id', req.params.id).eq('user_id', req.user.id);
        if (error) throw error;
        res.json({ deleted: 1 });
    } catch (err) {
        console.error('[API ERROR] DELETE /api/ricette/:id:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ================= MENU =================
app.get('/api/menu', authMiddleware, async (req, res) => {
    try {
        // Step 1: Fetch Menus
        const { data: menus, error } = await supabase
            .from('menu')
            .select('*')
            .eq('user_id', req.user.id)
            .order('nome');

        if (error) throw error;
        if (!menus || menus.length === 0) return res.json([]);

        const menuIds = menus.map(m => m.id);

        // Step 2: Fetch Menu-Recipes mapping
        const { data: menu_ricette, error: err2 } = await supabase
            .from('menu_ricette')
            .select('menu_id, ricetta_id')
            .in('menu_id', menuIds);
        
        if (err2) throw err2;
        if (!menu_ricette || menu_ricette.length === 0) {
            return res.json(menus.map(m => ({ ...m, costo_menu: 0, prezzo_netto: m.prezzo_vendita, margine_netto: m.prezzo_vendita, margine_netto_percent: 100 })));
        }

        // Step 3: Fetch Recipes & Ingredients in one batch (2-step vs N+1)
        const ricettaIds = [...new Set(menu_ricette.map(mr => mr.ricetta_id))];
        const { data: ricetta_full, error: err3 } = await supabase
            .from('ricette')
            .select('id, porzioni, ricetta_ingredienti(quantita, ingredienti(prezzo_attuale, scarto))')
            .in('id', ricettaIds);

        if (err3) throw err3;

        // Pre-calculate costs per recipe
        const recipeCosts = {};
        (ricetta_full || []).forEach(r => {
            const ings = r.ricetta_ingredienti || [];
            const costo_totale = ings.reduce((sum, ri) => {
                return sum + getRealCost(ri.quantita, ri.ingredienti?.prezzo_attuale || 0, ri.ingredienti?.scarto || 0);
            }, 0);
            recipeCosts[r.id] = costo_totale / r.porzioni;
        });

        const formatted = menus.map(m => {
            const m_ricette = menu_ricette.filter(mr => mr.menu_id === m.id);
            const costo_menu = m_ricette.reduce((sum, mr) => sum + (recipeCosts[mr.ricetta_id] || 0), 0);
            
            const net_price = m.prezzo_vendita / (1 + (m.iva || 0) / 100);
            const margine_lordo = m.prezzo_vendita - costo_menu;
            const margine_netto = net_price - costo_menu;
            
            const margine_lordo_percent = m.prezzo_vendita > 0 ? (margine_lordo / m.prezzo_vendita) * 100 : 0;
            const margine_netto_percent = net_price > 0 ? (margine_netto / net_price) * 100 : 0;
            
            return {
                ...m,
                costo_menu: parseFloat(costo_menu.toFixed(2)),
                prezzo_netto: parseFloat(net_price.toFixed(2)),
                margine_lordo: parseFloat(margine_lordo.toFixed(2)),
                margine_netto: parseFloat(margine_netto.toFixed(2)),
                margine_lordo_percent: parseFloat(margine_lordo_percent.toFixed(2)),
                margine_netto_percent: parseFloat(margine_netto_percent.toFixed(2))
            };
        });

        res.json(formatted);
    } catch (err) {
        console.error('[API ERROR] GET /api/menu:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/menu', authMiddleware, async (req, res) => {
    try {
        const { nome, prezzo_vendita, iva, ricette } = req.body;

        // Business Logic Validation
        if (prezzo_vendita < 0) return res.status(400).json({ error: "Il prezzo non può essere negativo." });
        if (iva < 0 || iva > 100) return res.status(400).json({ error: "IVA non valida." });

        const { data: menu, error } = await supabase.from('menu').insert([
            { user_id: req.user.id, nome, prezzo_vendita, iva: iva || 10 }
        ]).select();
        
        if (error) throw error;
        if (!menu || menu.length === 0) throw new Error("Errore creazione menu");
        
        const menu_id = menu[0].id;
        
        if (ricette && ricette.length > 0) {
            const inserts = ricette.map(rid => ({ menu_id, ricetta_id: rid }));
            const { error: errIns } = await supabase.from('menu_ricette').insert(inserts);
            if (errIns) throw errIns;
        }
        res.json({ id: menu_id });
    } catch (err) {
        console.error('[API ERROR] POST /api/menu:', err.message, err.stack);
        if (err.details) console.error('[SB ERROR DETAILS]', err.details);
        res.status(500).json({ error: err.message, details: err.details });
    }
});

app.delete('/api/menu/:id', authMiddleware, async (req, res) => {
    try {
        const { error } = await supabase.from('menu').delete().eq('id', req.params.id).eq('user_id', req.user.id);
        if (error) throw error;
        res.json({ deleted: 1 });
    } catch (err) {
        console.error('[API ERROR] DELETE /api/menu/:id:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Avvio Server
const PORT = process.env.PORT || 4000;

console.log("--- PROD DIAGNOSTIC ---");
console.log("SUPABASE_URL definita:", !!process.env['SUPABASE_URL']);
console.log("SUPABASE_SERVICE_KEY definita:", !!process.env['SUPABASE_SERVICE_KEY']);
console.log("PORT:", PORT);

app.get(/.*/, (req, res) => {
    const indexPath = path.join(__dirname, '../frontend/dist/index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('[SERVER] Error sending index.html:', err.message);
            res.status(404).send('Frontend build not found. Please run build first.');
        }
    });
});

app.use((err, req, res, next) => {
    console.error('[GLOBAL ERROR]', err);
    res.status(500).json({ error: 'Errore Globale Server', details: err.message });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Global Error Listeners to prevent silent crashes
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown:', err.message);
    // Optional: exit if too critical
});

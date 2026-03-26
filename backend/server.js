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

app.use(express.json());

// Rate Limiting contro attacchi DoS/Brute Force
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 200, 
    message: { error: 'Troppe richieste dal tuo IP, riprova più tardi.' }
});
app.use('/api/', apiLimiter);

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Middleware per proteggere le API e recuperare lo user_id
const authMiddleware = async (req, res, next) => {
    console.log(`[API] ${req.method} ${req.url} - Inizio Auth...`);
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        console.log(`[API] ${req.method} ${req.url} - Token mancante`);
        return res.status(401).json({ error: 'Auth token missing' });
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            console.error(`[API] Auth Error for ${req.url}:`, error?.message || 'User non trovato');
            return res.status(401).json({ 
                error: 'Invalid token', 
                details: error?.message || 'User non trovato',
                hint: 'Controlla le variabili d\'ambiente SUPABASE_URL e SUPABASE_SERVICE_KEY su Railway' 
            });
        }
        console.log(`[API] Auth Success for user: ${user.id}`);
        req.user = user;
        next();
    } catch (err) {
        console.error(`[API] CRITICAL Auth Hang/Crash for ${req.url}:`, err.message);
        res.status(500).json({ error: "Errore interno durante l'autenticazione", details: err.message });
    }
};

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
        
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Errore durante l'inserimento dell'ingrediente.");
        
        res.json({ id: data[0].id });
    } catch (err) {
        console.error('[API ERROR] POST /api/ingredienti:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ingredienti/batch', authMiddleware, async (req, res) => {
    try {
        const { ingredienti } = req.body;
        if (!ingredienti || !Array.isArray(ingredienti)) return res.status(400).json({ error: "Formato non valido" });

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

        const { data, error } = await supabase.from('ingredienti').insert(inserts).select();
        if (error) throw error;
        res.json({ count: data?.length || 0 });
    } catch (err) {
        console.error('[API ERROR] POST /api/ingredienti/batch:', err.message);
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
    // Single query using relational join to get ingredients directly
    const { data: ricette, error } = await supabase
        .from('ricette')
        .select(`
            *,
            ricetta_ingredienti (
                quantita,
                ingredienti (prezzo_attuale, scarto)
            )
        `)
        .eq('user_id', req.user.id)
        .order('nome');

    if (error) return res.status(500).json({ error: error.message });
    if (!ricette || ricette.length === 0) return res.json([]);

    const results = ricette.map(r => {
        const costo_totale = r.ricetta_ingredienti.reduce((sum, ri) => {
            return sum + getRealCost(ri.quantita, ri.ingredienti?.prezzo_attuale || 0, ri.ingredienti?.scarto || 0);
        }, 0);
        
        return {
            ...r,
            costo_totale: parseFloat(costo_totale.toFixed(2)),
            costo_porzione: parseFloat((costo_totale / r.porzioni).toFixed(2))
        };
    });

    res.json(results);
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
    // Relational query: single database roundtrip for all nested data
    const { data: results, error } = await supabase
        .from('menu')
        .select(`
            *,
            menu_ricette (
                ricette (
                    id, porzioni,
                    ricetta_ingredienti (
                        quantita,
                        ingredienti (prezzo_attuale, scarto)
                    )
                )
            )
        `)
        .eq('user_id', req.user.id)
        .order('nome');

    if (error) return res.status(500).json({ error: error.message });
    if (!results || results.length === 0) return res.json([]);

    const formatted = results.map(m => {
        let costo_menu = 0;
        
        // Deep calculation logic remains same but data structure is flatter
        if (m.menu_ricette) {
            m.menu_ricette.forEach(mr => {
                const r = mr.ricette;
                if (!r) return;
                const costo_ricetta = r.ricetta_ingredienti.reduce((sum, ri) => {
                    return sum + getRealCost(ri.quantita, ri.ingredienti?.prezzo_attuale || 0, ri.ingredienti?.scarto || 0);
                }, 0);
                costo_menu += costo_ricetta / r.porzioni;
            });
        }

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
        console.error('[API ERROR] POST /api/menu:', err.message);
        res.status(500).json({ error: err.message });
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

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const supabase = require('./supabase');

const app = express();

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
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Auth token missing' });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });

    req.user = user;
    next();
};

// ================= INGREDIENTI =================
app.get('/api/ingredienti', authMiddleware, async (req, res) => {
    const { data, error } = await supabase.from('ingredienti').select('*').eq('user_id', req.user.id).order('nome');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

app.post('/api/ingredienti', authMiddleware, async (req, res) => {
    const { nome, unita, prezzo_attuale, scarto } = req.body;
    
    // Business Logic Validation
    if (prezzo_attuale < 0) return res.status(400).json({ error: "Il prezzo non può essere negativo." });
    if (scarto < 0 || scarto > 99) return res.status(400).json({ error: "Lo scarto deve essere tra 0 e 99." });

    const data_aggiornamento = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('ingredienti').insert([
        { user_id: req.user.id, nome, unita, prezzo_attuale, scarto: scarto || 0, data_aggiornamento }
    ]).select();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data[0].id });
});

app.post('/api/ingredienti/batch', authMiddleware, async (req, res) => {
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
    if (error) return res.status(500).json({ error: error.message });
    res.json({ count: data.length });
});

app.put('/api/ingredienti/:id', authMiddleware, async (req, res) => {
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
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ updated: data.length });
});

app.delete('/api/ingredienti/:id', authMiddleware, async (req, res) => {
    const { error } = await supabase.from('ingredienti').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ deleted: 1 });
});

// Helper for Real Cost calculating Yield (Scarto)
const getRealCost = (qty, price, scarto) => {
    const yieldPercent = 1 - ((scarto || 0) / 100);
    return qty * (price / (yieldPercent === 0 ? 1 : yieldPercent));
};

// ================= RICETTE =================
app.get('/api/ricette', authMiddleware, async (req, res) => {
    const { data: ricette, error } = await supabase.from('ricette').select('*').eq('user_id', req.user.id).order('nome');
    if (error) return res.status(500).json({ error: error.message });
    
    if (!ricette || ricette.length === 0) return res.json([]);

    const { data: ricetta_ingredienti, error: err2 } = await supabase.from('ricetta_ingredienti')
        .select('ricetta_id, quantita, ingredienti(prezzo_attuale, scarto)')
        .in('ricetta_id', ricette.map(r => r.id));
        
    if (err2) return res.status(500).json({ error: err2.message });

    const results = ricette.map(r => {
        const ings = ricetta_ingredienti.filter(ri => ri.ricetta_id === r.id);
        const costo_totale = ings.reduce((sum, ri) => sum + getRealCost(ri.quantita, ri.ingredienti?.prezzo_attuale || 0, ri.ingredienti?.scarto || 0), 0);
        return {
            ...r,
            costo_totale: parseFloat(costo_totale.toFixed(2)),
            costo_porzione: parseFloat((costo_totale / r.porzioni).toFixed(2))
        };
    });

    res.json(results);
});

app.post('/api/ricette', authMiddleware, async (req, res) => {
    const { nome, porzioni, ingredienti } = req.body;

    // Business Logic Validation
    if (porzioni < 1) return res.status(400).json({ error: "Le porzioni non possono essere inferiori a 1." });

    const { data: ricetta, error } = await supabase.from('ricette').insert([
        { user_id: req.user.id, nome, porzioni: porzioni || 1 }
    ]).select();
    
    if (error) return res.status(500).json({ error: error.message });
    const ricetta_id = ricetta[0].id;
    
    if (ingredienti && ingredienti.length > 0) {
        const inserts = ingredienti.map(i => ({
            ricetta_id, ingrediente_id: i.ingrediente_id, quantita: i.quantita
        }));
        await supabase.from('ricetta_ingredienti').insert(inserts);
    }
    res.json({ id: ricetta_id });
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
    const { error } = await supabase.from('ricette').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ deleted: 1 });
});

// ================= MENU =================
app.get('/api/menu', authMiddleware, async (req, res) => {
    const { data: menus, error } = await supabase.from('menu').select('*').eq('user_id', req.user.id).order('nome');
    if (error) return res.status(500).json({ error: error.message });
    
    if (!menus || menus.length === 0) return res.json([]);

    const menuIds = menus.map(m => m.id);
    const { data: menu_ricette } = await supabase.from('menu_ricette').select('menu_id, ricetta_id').in('menu_id', menuIds);
    if (!menu_ricette || menu_ricette.length === 0) return res.json(menus.map(m => ({ ...m, costo_menu: 0, margine_netto: m.prezzo_vendita, margine_netto_percent: 100 })));

    const ricettaIds = [...new Set(menu_ricette.map(mr => mr.ricetta_id))];
    const { data: ricette } = await supabase.from('ricette').select('id, porzioni').in('id', ricettaIds);
    const { data: ricetta_ingredienti } = await supabase.from('ricetta_ingredienti')
        .select('ricetta_id, quantita, ingredienti(prezzo_attuale, scarto)').in('ricetta_id', ricettaIds);

    const recipeCosts = {};
    for (const r of ricette || []) {
        const ings = ricetta_ingredienti.filter(ri => ri.ricetta_id === r.id);
        const costo_totale = ings.reduce((sum, ri) => sum + getRealCost(ri.quantita, ri.ingredienti?.prezzo_attuale || 0, ri.ingredienti?.scarto || 0), 0);
        recipeCosts[r.id] = costo_totale / r.porzioni;
    }

    const results = menus.map(m => {
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
    
    res.json(results);
});

app.post('/api/menu', authMiddleware, async (req, res) => {
    const { nome, prezzo_vendita, iva, ricette } = req.body;

    // Business Logic Validation
    if (prezzo_vendita < 0) return res.status(400).json({ error: "Il prezzo non può essere negativo." });
    if (iva < 0 || iva > 100) return res.status(400).json({ error: "IVA non valida." });

    const { data: menu, error } = await supabase.from('menu').insert([
        { user_id: req.user.id, nome, prezzo_vendita, iva: iva || 10 }
    ]).select();
    
    if (error) return res.status(500).json({ error: error.message });
    const menu_id = menu[0].id;
    
    if (ricette && ricette.length > 0) {
        const inserts = ricette.map(rid => ({ menu_id, ricetta_id: rid }));
        await supabase.from('menu_ricette').insert(inserts);
    }
    res.json({ id: menu_id });
});

app.delete('/api/menu/:id', authMiddleware, async (req, res) => {
    const { error } = await supabase.from('menu').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ deleted: 1 });
});

// Avvio Server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

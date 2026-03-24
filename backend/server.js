const express = require('express');
const cors = require('cors');
const path = require('path');
const supabase = require('./supabase');

const app = express();
app.use(cors());
app.use(express.json());

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
    const { nome, unita, prezzo_attuale } = req.body;
    const data_aggiornamento = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase.from('ingredienti').insert([
        { user_id: req.user.id, nome, unita, prezzo_attuale, data_aggiornamento }
    ]).select();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data[0].id });
});

app.put('/api/ingredienti/:id', authMiddleware, async (req, res) => {
    const { prezzo_attuale } = req.body;
    const data_aggiornamento = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase.from('ingredienti')
        .update({ prezzo_attuale, data_aggiornamento })
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

// ================= RICETTE =================
app.get('/api/ricette', authMiddleware, async (req, res) => {
    const { data: ricette, error } = await supabase.from('ricette').select('*').eq('user_id', req.user.id).order('nome');
    if (error) return res.status(500).json({ error: error.message });
    
    if (!ricette || ricette.length === 0) return res.json([]);

    const { data: ricetta_ingredienti, error: err2 } = await supabase.from('ricetta_ingredienti')
        .select('ricetta_id, quantita, ingredienti(prezzo_attuale)')
        .in('ricetta_id', ricette.map(r => r.id));
        
    if (err2) return res.status(500).json({ error: err2.message });

    const results = ricette.map(r => {
        const ings = ricetta_ingredienti.filter(ri => ri.ricetta_id === r.id);
        const costo_totale = ings.reduce((sum, ri) => sum + (ri.quantita * (ri.ingredienti?.prezzo_attuale || 0)), 0);
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
        .select('id, quantita, ingredienti(id, nome, unita, prezzo_attuale)')
        .eq('ricetta_id', req.params.id);
        
    if (error) return res.status(500).json({ error: error.message });
    
    const results = data.map(row => ({
        id_riga: row.id,
        id: row.ingredienti.id,
        nome: row.ingredienti.nome,
        unita: row.ingredienti.unita,
        prezzo_attuale: row.ingredienti.prezzo_attuale,
        quantita: row.quantita,
        costo: row.quantita * row.ingredienti.prezzo_attuale
    }));
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
    if (!menu_ricette || menu_ricette.length === 0) return res.json(menus.map(m => ({ ...m, costo_menu: 0, margine: m.prezzo_vendita, margine_percent: 100 })));

    const ricettaIds = [...new Set(menu_ricette.map(mr => mr.ricetta_id))];
    const { data: ricette } = await supabase.from('ricette').select('id, porzioni').in('id', ricettaIds);
    const { data: ricetta_ingredienti } = await supabase.from('ricetta_ingredienti')
        .select('ricetta_id, quantita, ingredienti(prezzo_attuale)').in('ricetta_id', ricettaIds);

    const recipeCosts = {};
    for (const r of ricette || []) {
        const ings = ricetta_ingredienti.filter(ri => ri.ricetta_id === r.id);
        const costo_totale = ings.reduce((sum, ri) => sum + (ri.quantita * (ri.ingredienti?.prezzo_attuale || 0)), 0);
        recipeCosts[r.id] = costo_totale / r.porzioni;
    }

    const results = menus.map(m => {
        const m_ricette = menu_ricette.filter(mr => mr.menu_id === m.id);
        const costo_menu = m_ricette.reduce((sum, mr) => sum + (recipeCosts[mr.ricetta_id] || 0), 0);
        
        const margine = m.prezzo_vendita - costo_menu;
        const margine_percent = m.prezzo_vendita > 0 ? (margine / m.prezzo_vendita) * 100 : 0;
        
        return {
            ...m,
            costo_menu: parseFloat(costo_menu.toFixed(2)),
            margine: parseFloat(margine.toFixed(2)),
            margine_percent: parseFloat(margine_percent.toFixed(2))
        };
    });
    
    res.json(results);
});

app.post('/api/menu', authMiddleware, async (req, res) => {
    const { nome, prezzo_vendita, ricette } = req.body;
    const { data: menu, error } = await supabase.from('menu').insert([
        { user_id: req.user.id, nome, prezzo_vendita }
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

const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// ================= INGREDIENTI =================
app.get('/api/ingredienti', (req, res) => {
    db.all("SELECT * FROM ingredienti ORDER BY nome", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/ingredienti', (req, res) => {
    const { nome, unita, prezzo_attuale } = req.body;
    const data_aggiornamento = new Date().toISOString().split('T')[0];
    db.run("INSERT INTO ingredienti (nome, unita, prezzo_attuale, data_aggiornamento) VALUES (?, ?, ?, ?)",
        [nome, unita, prezzo_attuale, data_aggiornamento],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.put('/api/ingredienti/:id', (req, res) => {
    const { prezzo_attuale } = req.body;
    const data_aggiornamento = new Date().toISOString().split('T')[0];
    db.run("UPDATE ingredienti SET prezzo_attuale = ?, data_aggiornamento = ? WHERE id = ?",
        [prezzo_attuale, data_aggiornamento, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: this.changes });
        });
});

app.delete('/api/ingredienti/:id', (req, res) => {
    db.run("DELETE FROM ingredienti WHERE id = ?", req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

// ================= RICETTE =================
// Calcolare il costo totale basandosi sugli ingredienti
app.get('/api/ricette', (req, res) => {
    const query = `
        SELECT r.id, r.nome, r.porzioni, 
               COALESCE(SUM(ri.quantita * i.prezzo_attuale), 0) as costo_totale,
               COALESCE(SUM(ri.quantita * i.prezzo_attuale) / r.porzioni, 0) as costo_porzione
        FROM ricette r
        LEFT JOIN ricetta_ingredienti ri ON r.id = ri.ricetta_id
        LEFT JOIN ingredienti i ON ri.ingrediente_id = i.id
        GROUP BY r.id
        ORDER BY r.nome
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/ricette', (req, res) => {
    const { nome, porzioni, ingredienti } = req.body; // ingredienti è array di { ingrediente_id, quantita }
    db.run("INSERT INTO ricette (nome, porzioni) VALUES (?, ?)", [nome, porzioni || 1], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const ricetta_id = this.lastID;
        
        if (ingredienti && ingredienti.length > 0) {
            const stmt = db.prepare("INSERT INTO ricetta_ingredienti (ricetta_id, ingrediente_id, quantita) VALUES (?, ?, ?)");
            ingredienti.forEach(ing => {
                stmt.run(ricetta_id, ing.ingrediente_id, ing.quantita);
            });
            stmt.finalize();
        }
        res.json({ id: ricetta_id });
    });
});

app.get('/api/ricette/:id/ingredienti', (req, res) => {
    const query = `
        SELECT ri.id as id_riga, i.id, i.nome, i.unita, i.prezzo_attuale, ri.quantita, 
               (ri.quantita * i.prezzo_attuale) as costo
        FROM ricetta_ingredienti ri
        JOIN ingredienti i ON ri.ingrediente_id = i.id
        WHERE ri.ricetta_id = ?
    `;
    db.all(query, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/ricette/:id', (req, res) => {
    db.run("DELETE FROM ricette WHERE id = ?", req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

// ================= MENU =================
app.get('/api/menu', (req, res) => {
    // Calcoliamo il costo per porzione di ogni ricetta nel menu e sommiamo
    const query = `
        SELECT m.id, m.nome, m.prezzo_vendita,
               COALESCE(SUM(costi.costo_porzione), 0) as costo_menu
        FROM menu m
        LEFT JOIN menu_ricette mr ON m.id = mr.menu_id
        LEFT JOIN (
            SELECT r.id, COALESCE(SUM(ri.quantita * i.prezzo_attuale) / r.porzioni, 0) as costo_porzione
            FROM ricette r
            LEFT JOIN ricetta_ingredienti ri ON r.id = ri.ricetta_id
            LEFT JOIN ingredienti i ON ri.ingrediente_id = i.id
            GROUP BY r.id
        ) costi ON mr.ricetta_id = costi.id
        GROUP BY m.id
        ORDER BY m.nome
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Aggiungiamo il calcolo del margine in JS
        const results = rows.map(m => {
            const margine = m.prezzo_vendita - m.costo_menu;
            const margine_percent = m.prezzo_vendita > 0 ? (margine / m.prezzo_vendita) * 100 : 0;
            return {
                ...m,
                margine: parseFloat(margine.toFixed(2)),
                margine_percent: parseFloat(margine_percent.toFixed(2))
            };
        });
        res.json(results);
    });
});

app.post('/api/menu', (req, res) => {
    const { nome, prezzo_vendita, ricette } = req.body; // ricette è array di ricetta_id
    db.run("INSERT INTO menu (nome, prezzo_vendita) VALUES (?, ?)", [nome, prezzo_vendita], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const menu_id = this.lastID;
        
        if (ricette && ricette.length > 0) {
            const stmt = db.prepare("INSERT INTO menu_ricette (menu_id, ricetta_id) VALUES (?, ?)");
            ricette.forEach(rid => {
                stmt.run(menu_id, rid);
            });
            stmt.finalize();
        }
        res.json({ id: menu_id });
    });
});

app.delete('/api/menu/:id', (req, res) => {
    db.run("DELETE FROM menu WHERE id = ?", req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'foodcost.db');
const db = new sqlite3.Database(dbPath);

const initializeDB = () => {
    db.serialize(() => {
        db.run("PRAGMA foreign_keys = ON;"); // Abilita foreign keys

        db.run(`CREATE TABLE IF NOT EXISTS ingredienti (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            unita TEXT NOT NULL,
            prezzo_attuale REAL NOT NULL,
            data_aggiornamento TEXT NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS ricette (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            porzioni INTEGER NOT NULL DEFAULT 1
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS ricetta_ingredienti (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ricetta_id INTEGER NOT NULL,
            ingrediente_id INTEGER NOT NULL,
            quantita REAL NOT NULL,
            FOREIGN KEY(ricetta_id) REFERENCES ricette(id) ON DELETE CASCADE,
            FOREIGN KEY(ingrediente_id) REFERENCES ingredienti(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS menu (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            prezzo_vendita REAL NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS menu_ricette (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            menu_id INTEGER NOT NULL,
            ricetta_id INTEGER NOT NULL,
            FOREIGN KEY(menu_id) REFERENCES menu(id) ON DELETE CASCADE,
            FOREIGN KEY(ricetta_id) REFERENCES ricette(id) ON DELETE CASCADE
        )`);
    });
};

initializeDB();

module.exports = db;

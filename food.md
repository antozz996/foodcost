# 🧠 Blueprint Web App Food Cost (MVP)

## 🎯 Obiettivo

Avere una visione **rapida, coerente e utilizzabile** dei margini di piatti e menù con il minimo sforzo operativo.

---

# 🧱 Architettura

## Entità Database

### Ingredienti

* id
* nome
* unità (kg, g, pezzi)
* prezzo_attuale
* data_aggiornamento

---

### Ricette

* id
* nome
* porzioni

---

### Ricetta_Ingredienti

* id
* ricetta_id
* ingrediente_id
* quantità

---

### Menù

* id
* nome
* prezzo_vendita

---

### Menu_Ricette

* id
* menu_id
* ricetta_id

---

# ⚙️ Logica di Calcolo

## Costo Ricetta

```
costo = Σ (quantità ingrediente × prezzo_attuale)
```

## Costo Porzione

```
costo_porzione = costo_totale / porzioni
```

## Costo Menù

```
costo_menu = somma costi porzione ricette
```

## Margine

```
margine = prezzo_vendita - costo_menu
margine_% = (margine / prezzo_vendita) × 100
```

---

# 🖥️ UX / Schermate

## 1. Dashboard

* margine medio menù
* menù più profittevole
* menù meno profittevole

---

## 2. Ingredienti

* lista ingredienti
* modifica prezzo veloce

---

## 3. Ricette

* lista piatti
* ingredienti + quantità
* costo automatico

---

## 4. Menù

* creazione menù
* aggiunta piatti
* prezzo vendita

Output:

* costo
* margine €
* margine %

---

## 5. Upload Fattura (opzionale)

* upload XML
* estrazione prodotti
* mapping manuale ingrediente (prima volta)
* automazione successiva

---

# 🔄 Flusso Operativo

## Settimanale (30 min)

* aggiornamento prezzi ingredienti principali

## Creazione Menù

* verifica margini

---

# ⚠️ Regole Chiave

1. Velocità > precisione
2. Manuale > automatico (inizio)
3. Poche feature, alta usabilità
4. Aggiornamento minimo settimanale

---

# 💣 Rischi

* dati non aggiornati
* ricette non rispettate
* abbandono per complessità

---

# 🚀 Evoluzioni Future

* storico prezzi
* alert margini
* analisi trend
* gestione fornitori
* resa/scarti

---

# 🎯 KPI da Monitorare

* margine medio %
* top 3 piatti profittevoli
* bottom 3 piatti

---

# 📌 MVP Checklist

* [ ] inserimento ingredienti
* [ ] inserimento ricette
* [ ] calcolo automatico costi
* [ ] creazione menù
* [ ] calcolo margini

---

# 🔍 Domande Strategiche

1. Quali ingredienti incidono di più sui costi?
2. Quali piatti hanno margine più basso?
3. Quali menù sono meno profittevoli?

---

# 🧠 Filosofia

Sistema semplice, usato ogni settimana > sistema perfetto mai usato.

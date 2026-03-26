import { api } from './api.js';
import { escapeHTML } from './utils.js';

export async function renderIngredients(container) {
    const ingredients = await api.get('/ingredienti');

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2>Gestione Ingredienti</h2>
            <div class="flex gap-4">
                <button class="btn btn-secondary" id="btn-download-template">
                    <span class="icon">📥</span> Scarica Modello
                </button>
                <button class="btn btn-secondary" id="btn-import-csv">
                    <span class="icon">📁</span> Importa CSV
                </button>
                <input type="file" id="csv-file-input" accept=".csv" class="hidden">
                <button class="btn" id="btn-add-ingredient">
                    <span class="icon">+</span> Nuovo Ingrediente
                </button>
            </div>
        </div>
        <div class="card">
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Unità di Misura</th>
                            <th>Prezzo Attuale</th>
                            <th>Scarto %</th>
                            <th>Ultimo Aggiornamento</th>
                            <th>Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ingredients.map(i => `
                            <tr>
                                <td>${escapeHTML(i.nome)}</td>
                                <td>${escapeHTML(i.unita)}</td>
                                <td>€<input type="number" step="0.01" value="${i.prezzo_attuale}" class="form-control" style="width:80px; display:inline-block; padding:4px 8px;" id="price-${i.id}"></td>
                                <td><input type="number" step="1" value="${i.scarto || 0}" class="form-control" style="width:70px; display:inline-block; padding:4px 8px;" id="waste-${i.id}">%</td>
                                <td class="text-muted">${i.data_aggiornamento}</td>
                                <td>
                                    <button class="btn btn-secondary btn-save" data-id="${i.id}">Salva</button>
                                    <button class="btn btn-danger btn-delete" data-id="${i.id}">Elimina</button>
                                </td>
                            </tr>
                        `).join('')}
                        ${ingredients.length === 0 ? '<tr><td colspan="6" class="text-center text-muted">Nessun ingrediente presente.</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Modal -->
        <div id="modal-add" class="modal-overlay hidden">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Aggiungi Ingrediente</h3>
                    <button class="modal-close" id="btn-close-modal">&times;</button>
                </div>
                <form id="form-add-ingredient">
                    <div class="form-group">
                        <label>Nome</label>
                        <input type="text" id="ing-name" class="form-control" required>
                    </div>
                    <div class="grid grid-cols-2" style="gap: 16px;">
                        <div class="form-group">
                            <label>Unità di Misura</label>
                            <select id="ing-unit" class="form-control" required>
                                <option value="kg">Chilogrammi (kg)</option>
                                <option value="g">Grammi (g)</option>
                                <option value="l">Litri (l)</option>
                                <option value="ml">Millilitri (ml)</option>
                                <option value="pz">Pezzi (pz)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Prezzo / Unità (€)</label>
                            <input type="number" step="0.01" id="ing-price" class="form-control" required>
                        </div>
                    </div>
                    <div class="form-group mt-4">
                        <label>Scarto / Calo Peso (%) <small class="text-muted ml-2">Es. Buccia delle patate</small></label>
                        <input type="number" step="1" id="ing-waste" class="form-control" value="0" min="0" max="99" required>
                    </div>
                    <div style="margin-top: 24px">
                        <button type="submit" class="btn w-100">Salva Ingrediente</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Download Template Logic
    document.getElementById('btn-download-template').addEventListener('click', () => {
        const headers = "Nome;Unita;Prezzo;Scarto\n";
        const rows = [
            "Farina 00;kg;1.20;0",
            "Uova;pz;0.25;0",
            "Patate;kg;0.80;15",
            "Olio EVO;l;9.50;0"
        ].join("\n");
        const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "modello_ingredienti.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // Upload CSV logic
    const btnImportHover = document.getElementById('btn-import-csv');
    const fileInput = document.getElementById('csv-file-input');
    
    btnImportHover.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const csvText = event.target.result;
            const lines = csvText.split('\n').filter(line => line.trim() !== '');
            const parsedIngredients = [];
            
            // Assume the first row is header, skip it. Or detect if it's header.
            const startIndex = (lines[0].toLowerCase().includes('nome') || lines[0].toLowerCase().includes('prezzo')) ? 1 : 0;

            for (let i = startIndex; i < lines.length; i++) {
                // simple csv split by comma or semicolon
                const separator = lines[i].includes(';') ? ';' : ',';
                const cols = lines[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
                if (cols.length >= 3) {
                    parsedIngredients.push({
                        nome: cols[0],
                        unita: (cols[1] || 'pz').toLowerCase(),
                        prezzo_attuale: parseFloat((cols[2] || '0').replace(',', '.') || 0),
                        scarto: parseFloat((cols[3] || '0').replace(',', '.'))
                    });
                }
            }

            if (parsedIngredients.length > 0) {
                console.log('[IMPORT DEBUG] Inviando ingredienti:', parsedIngredients);
                btnImportHover.disabled = true;
                
                const chunkSize = 100;
                let importedCount = 0;
                const total = parsedIngredients.length;

                try {
                    for (let i = 0; i < total; i += chunkSize) {
                        const chunk = parsedIngredients.slice(i, i + chunkSize);
                        btnImportHover.textContent = `Importando ${i + chunk.length}/${total}...`;
                        await api.post('/bulk-ingredients-root', { ingredienti: chunk });
                        importedCount += chunk.length;
                    }
                    alert(`✅ Importati ${importedCount} ingredienti con successo!`);
                    renderIngredients(container);
                } catch (err) {
                    alert("❌ Errore durante l'importazione: " + err.message);
                } finally {
                    btnImportHover.disabled = false;
                    btnImportHover.innerHTML = '<span class="icon">📁</span> Importa CSV';
                }
            } else {
                alert('Nessun ingrediente valido trovato nel file CSV. Assicurati che le colonne siano: Nome, Unità, Prezzo, Scarto (opzionale).');
            }
        };
        reader.readAsText(file);
        
        // simple reset
        e.target.value = '';
    });

    // Row Actions
    container.querySelectorAll('.btn-save').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const newPrice = document.getElementById(`price-${id}`).value;
            const newWaste = document.getElementById(`waste-${id}`).value;
            await api.put(`/ingredienti/${id}`, { 
                prezzo_attuale: parseFloat(newPrice),
                scarto: parseFloat(newWaste)
            });
            renderIngredients(container);
        });
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm('Sei sicuro di voler eliminare questo ingrediente?')) {
                const id = e.target.dataset.id;
                await api.delete(`/ingredienti/${id}`);
                renderIngredients(container);
            }
        });
    });

    const modalAdd = document.getElementById('modal-add');
    document.getElementById('btn-add-ingredient').addEventListener('click', () => {
        modalAdd.classList.remove('hidden');
    });
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        modalAdd.classList.add('hidden');
    });
    
    document.getElementById('form-add-ingredient').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('ing-name').value;
        const unita = document.getElementById('ing-unit').value;
        const prezzo_attuale = document.getElementById('ing-price').value;
        const scarto = document.getElementById('ing-waste').value;
        
        await api.post('/ingredienti', { 
            nome, 
            unita, 
            prezzo_attuale: parseFloat(prezzo_attuale),
            scarto: parseFloat(scarto)
        });
        
        modalAdd.classList.add('hidden');
        renderIngredients(container);
    });
}

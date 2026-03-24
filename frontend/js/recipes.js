import { api } from './api.js';
import { escapeHTML } from './utils.js';

export async function renderRecipes(container) {
    const recipes = await api.get('/ricette');
    const allIngredients = await api.get('/ingredienti');

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2>Gestione Ricette</h2>
            <button class="btn" id="btn-add-recipe">
                <span class="icon">+</span> Nuova Ricetta
            </button>
        </div>
        <div class="card">
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Nome Ricetta</th>
                            <th>Porzioni</th>
                            <th>Costo Totale </th>
                            <th>Costo Porzione</th>
                            <th>Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recipes.map(r => `
                            <tr>
                                <td><strong>${escapeHTML(r.nome)}</strong></td>
                                <td>${r.porzioni}</td>
                                <td>€${r.costo_totale.toFixed(2)}</td>
                                <td class="text-success font-medium">€${r.costo_porzione.toFixed(2)}</td>
                                <td>
                                    <button class="btn btn-secondary btn-view" data-id="${r.id}">Vedi Ing.</button>
                                    <button class="btn btn-danger btn-delete" data-id="${r.id}">Elimina</button>
                                </td>
                            </tr>
                        `).join('')}
                        ${recipes.length === 0 ? '<tr><td colspan="5" class="text-center text-muted">Nessuna ricetta presente.</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add Recipe Modal -->
        <div id="modal-add-recipe" class="modal-overlay hidden">
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>Crea Nuova Ricetta</h3>
                    <button class="modal-close" id="btn-close-recipe-modal">&times;</button>
                </div>
                <form id="form-add-recipe">
                    <div class="grid grid-cols-2">
                        <div class="form-group">
                            <label>Nome Ricetta</label>
                            <input type="text" id="recipe-name" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label>Numero Porzioni</label>
                            <input type="number" id="recipe-portions" class="form-control" value="1" min="1" required>
                        </div>
                    </div>
                    
                    <div class="form-group mt-4">
                        <label>Ingredienti</label>
                        <div id="ingredients-list" class="mb-4"></div>
                        <div class="flex gap-4">
                            <div style="flex: 2; display: flex; flex-direction: column;">
                                <input type="text" id="ingredient-search" list="ingredients-datalist" class="form-control" placeholder="Cerca Ingrediente..." autocomplete="off">
                                <datalist id="ingredients-datalist">
                                    ${allIngredients.map(i => `<option data-id="${i.id}" data-unit="${escapeHTML(i.unita)}" value="${escapeHTML(i.nome)} (€${i.prezzo_attuale}/${escapeHTML(i.unita)})"></option>`).join('')}
                                </datalist>
                            </div>
                            <input type="number" id="ingredient-qty" class="form-control" placeholder="Quantità" step="0.01" style="flex: 1;">
                            <span id="ingredient-unit-label" style="align-self: center; width: 40px;" class="text-muted"></span>
                            <button type="button" id="btn-add-ingredient-to-list" class="btn btn-secondary">Aggiungi</button>
                        </div>
                    </div>
                    
                    <div style="margin-top: 32px">
                        <button type="submit" class="btn">Salva Ricetta</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Recipe Ingredients UI Logics
    let currentIngredients = [];
    const updateIngredientsList = () => {
        const listDiv = document.getElementById('ingredients-list');
        listDiv.innerHTML = currentIngredients.map((item, idx) => `
            <div class="flex justify-between items-center bg-dark p-2 rounded mb-2" style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px;">
                <span>${escapeHTML(item.nome)} - ${item.quantita} ${escapeHTML(item.unita)}</span>
                <button type="button" class="btn-danger btn-remove-ing" data-idx="${idx}" style="padding: 2px 8px; border:none; border-radius:4px;">&times;</button>
            </div>
        `).join('');
        
        listDiv.querySelectorAll('.btn-remove-ing').forEach(btn => {
            btn.addEventListener('click', (e) => {
                currentIngredients.splice(e.target.dataset.idx, 1);
                updateIngredientsList();
            });
        });
    };

    document.getElementById('ingredient-search').addEventListener('input', (e) => {
        const selectedValue = e.target.value;
        const option = Array.from(document.querySelectorAll('#ingredients-datalist option')).find(opt => opt.value === selectedValue);
        if (option) {
            document.getElementById('ingredient-unit-label').textContent = option.dataset.unit;
        } else {
            document.getElementById('ingredient-unit-label').textContent = '';
        }
    });

    document.getElementById('btn-add-ingredient-to-list').addEventListener('click', () => {
        const searchInput = document.getElementById('ingredient-search');
        const qtyInput = document.getElementById('ingredient-qty');
        
        const selectedValue = searchInput.value;
        const option = Array.from(document.querySelectorAll('#ingredients-datalist option')).find(opt => opt.value === selectedValue);
        
        if (!option) {
            alert('Seleziona un ingrediente valido dalla lista!');
            return;
        }

        const id = option.dataset.id;
        const nome = selectedValue.split(' (')[0];
        const unita = option.dataset.unit;
        const quantita = parseFloat(qtyInput.value);

        if (id && quantita > 0) {
            currentIngredients.push({ ingrediente_id: id, nome, unita, quantita });
            searchInput.value = '';
            qtyInput.value = '';
            document.getElementById('ingredient-unit-label').textContent = '';
            updateIngredientsList();
        } else {
            alert('Inserisci una quantità valida (maggiore di zero).');
        }
    });

    // Modals
    const modalAdd = document.getElementById('modal-add-recipe');
    document.getElementById('btn-add-recipe').addEventListener('click', () => {
        currentIngredients = [];
        updateIngredientsList();
        modalAdd.classList.remove('hidden');
    });
    document.getElementById('btn-close-recipe-modal').addEventListener('click', () => {
        modalAdd.classList.add('hidden');
    });

    // Form
    document.getElementById('form-add-recipe').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('recipe-name').value;
        const porzioni = document.getElementById('recipe-portions').value;
        
        await api.post('/ricette', { 
            nome, 
            porzioni: parseInt(porzioni), 
            ingredienti: currentIngredients.map(i => ({ ingrediente_id: i.ingrediente_id, quantita: i.quantita })) 
        });
        
        modalAdd.classList.add('hidden');
        renderRecipes(container);
    });

    // Table Actions
    container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm('Sei sicuro di voler eliminare questa ricetta?')) {
                const id = e.target.dataset.id;
                await api.delete(`/ricette/${id}`);
                renderRecipes(container);
            }
        });
    });

    container.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const items = await api.get(`/ricette/${id}/ingredienti`);
            let msg = items.map(i => `${i.nome}: ${i.quantita}${i.unita} (€${i.costo.toFixed(2)})`).join('\\n');
            alert(`Ingredienti:\\n${msg}`);
        });
    });
}

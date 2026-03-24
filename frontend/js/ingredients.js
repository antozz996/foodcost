import { api } from './api.js';

export async function renderIngredients(container) {
    const ingredients = await api.get('/ingredienti');

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2>Gestione Ingredienti</h2>
            <button class="btn" id="btn-add-ingredient">
                <span class="icon">+</span> Nuovo Ingrediente
            </button>
        </div>
        <div class="card">
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Unità di Misura</th>
                            <th>Prezzo Attuale</th>
                            <th>Ultimo Aggiornamento</th>
                            <th>Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ingredients.map(i => `
                            <tr>
                                <td>${i.nome}</td>
                                <td>${i.unita}</td>
                                <td>€<input type="number" step="0.01" value="${i.prezzo_attuale}" class="form-control" style="width:100px; display:inline-block; padding:4px 8px;" id="price-${i.id}"></td>
                                <td class="text-muted">${i.data_aggiornamento}</td>
                                <td>
                                    <button class="btn btn-secondary btn-save" data-id="${i.id}">Salva</button>
                                    <button class="btn btn-danger btn-delete" data-id="${i.id}">Elimina</button>
                                </td>
                            </tr>
                        `).join('')}
                        ${ingredients.length === 0 ? '<tr><td colspan="5" class="text-center text-muted">Nessun ingrediente presente.</td></tr>' : ''}
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
                    <div style="margin-top: 24px">
                        <button type="submit" class="btn">Salva Ingrediente</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    container.querySelectorAll('.btn-save').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const newPrice = document.getElementById(`price-${id}`).value;
            await api.put(`/ingredienti/${id}`, { prezzo_attuale: parseFloat(newPrice) });
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
        await api.post('/ingredienti', { nome, unita, prezzo_attuale });
        modalAdd.classList.add('hidden');
        renderIngredients(container);
    });
}

import { api } from './api.js';

export async function renderMenus(container) {
    const menus = await api.get('/menu');
    const allRecipes = await api.get('/ricette');

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2>Gestione Menù</h2>
            <button class="btn" id="btn-add-menu">
                <span class="icon">+</span> Nuovo Menù
            </button>
        </div>
        <div class="grid grid-cols-2">
            ${menus.map(m => `
                <div class="card relative">
                    <button class="btn-danger btn-delete" data-id="${m.id}" style="position:absolute; top: 16px; right: 16px; padding: 4px 8px; border:none; border-radius:4px; cursor:pointer;">&times;</button>
                    <h3>${m.nome}</h3>
                    <div class="grid grid-cols-2 mt-4" style="gap:12px;">
                        <div>
                            <div class="text-muted" style="font-size: 13px;">Prezzo Vendita</div>
                            <div class="text-xl">€${parseFloat(m.prezzo_vendita).toFixed(2)}</div>
                        </div>
                        <div>
                            <div class="text-muted" style="font-size: 13px;">Food Cost</div>
                            <div class="text-xl">€${parseFloat(m.costo_menu).toFixed(2)}</div>
                        </div>
                    </div>
                    <div class="mt-4 pt-4" style="border-top: 1px solid var(--border-color)">
                        <div class="flex justify-between items-center">
                            <span class="text-muted">Margine</span>
                            <strong class="${m.margine_percent >= 50 ? 'text-success' : (m.margine_percent > 20 ? 'text-warning' : 'text-danger')}">
                                €${m.margine} (${m.margine_percent}%)
                            </strong>
                        </div>
                    </div>
                </div>
            `).join('')}
            ${menus.length === 0 ? '<div class="text-muted text-center" style="grid-column: span 2;">Nessun menù trovato.</div>' : ''}
        </div>

        <!-- Add Menu Modal -->
        <div id="modal-add-menu" class="modal-overlay hidden">
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>Componi Menù</h3>
                    <button class="modal-close" id="btn-close-menu-modal">&times;</button>
                </div>
                <form id="form-add-menu">
                    <div class="form-group">
                        <label>Nome Menù (es. Menù Degustazione)</label>
                        <input type="text" id="menu-name" class="form-control" required>
                    </div>
                    
                    <div class="form-group mt-4">
                        <label>Ricette Incluse</label>
                        <div class="grid" style="gap:8px; max-height: 200px; overflow-y:auto; padding: 8px; border: 1px solid var(--border-color); border-radius: 8px;">
                            ${allRecipes.map(r => `
                                <label class="flex items-center gap-4 cursor-pointer">
                                    <input type="checkbox" value="${r.id}" class="menu-recipe-cb" style="width: 16px; height: 16px;">
                                    <span>${r.nome} <small class="text-muted">(Costo: €${r.costo_porzione.toFixed(2)})</small></span>
                                </label>
                            `).join('')}
                            ${allRecipes.length === 0 ? '<div class="text-muted text-sm text-center">Nessuna ricetta disponibile. Creane prima una.</div>' : ''}
                        </div>
                    </div>

                    <div class="form-group mt-4">
                        <label>Prezzo di Vendita (§)</label>
                        <input type="number" id="menu-price" class="form-control" step="0.5" required>
                    </div>
                    
                    <div style="margin-top: 32px">
                        <button type="submit" class="btn w-100">Crea Menù</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Menu Add Logics
    const modalAdd = document.getElementById('modal-add-menu');
    document.getElementById('btn-add-menu').addEventListener('click', () => {
        modalAdd.classList.remove('hidden');
    });
    document.getElementById('btn-close-menu-modal').addEventListener('click', () => {
        modalAdd.classList.add('hidden');
    });

    document.getElementById('form-add-menu').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('menu-name').value;
        const prezzo = document.getElementById('menu-price').value;
        
        const ricetteSelezionate = Array.from(document.querySelectorAll('.menu-recipe-cb:checked')).map(cb => cb.value);

        if (ricetteSelezionate.length === 0) {
            alert("Seleziona almeno una ricetta per il menù.");
            return;
        }

        await api.post('/menu', { 
            nome, 
            prezzo_vendita: parseFloat(prezzo), 
            ricette: ricetteSelezionate 
        });
        
        modalAdd.classList.add('hidden');
        renderMenus(container);
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm('Sei sicuro di voler eliminare questo menù?')) {
                const id = e.target.dataset.id;
                await api.delete(`/menu/${id}`);
                renderMenus(container);
            }
        });
    });
}

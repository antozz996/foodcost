import { api } from './api.js';
import { escapeHTML } from './utils.js';

export async function renderDashboard(container) {
    const menus = await api.get('/menu');

    let totalMargin = 0;
    let mostProfitableMenu = null;
    let leastProfitableMenu = null;

    menus.forEach(m => {
        totalMargin += m.margine_netto_percent; // Use net margin for reporting!
        if (!mostProfitableMenu || m.margine_netto_percent > mostProfitableMenu.margine_netto_percent) {
            mostProfitableMenu = m;
        }
        if (!leastProfitableMenu || m.margine_netto_percent < leastProfitableMenu.margine_netto_percent) {
            leastProfitableMenu = m;
        }
    });

    const avgMargin = menus.length > 0 ? (totalMargin / menus.length).toFixed(2) : 0;

    container.innerHTML = `
        <div class="grid grid-cols-3 mb-6">
            <div class="card">
                <div class="text-muted mb-4">Margine Netto Medio</div>
                <div class="text-2xl text-success">${avgMargin}%</div>
                <div class="text-muted mt-4 text-sm">Basato su ${menus.length} menù configurati</div>
            </div>
            <div class="card">
                <div class="text-muted mb-4">Menù Più Profittevole</div>
                <div class="text-2xl">${mostProfitableMenu ? escapeHTML(mostProfitableMenu.nome) : '-'}</div>
                <div class="text-success mt-4">▲ ${mostProfitableMenu ? mostProfitableMenu.margine_netto_percent + '%' : ''}</div>
            </div>
            <div class="card">
                <div class="text-muted mb-4">Menù Meno Profittevole</div>
                <div class="text-2xl">${leastProfitableMenu ? escapeHTML(leastProfitableMenu.nome) : '-'}</div>
                <div class="text-danger mt-4">▼ ${leastProfitableMenu ? leastProfitableMenu.margine_netto_percent + '%' : ''}</div>
            </div>
        </div>

        <div class="card">
            <div class="flex justify-between items-center mb-6">
                <h3>Panoramica Menù Recenti (IVA esclusa dall'Utile)</h3>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Nome Menù</th>
                            <th>Food Cost</th>
                            <th>Prezzo (Netto IVA)</th>
                            <th>Utile Netto Reale €</th>
                            <th>Margine Netto %</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${menus.map(m => `
                            <tr>
                                <td><strong>${escapeHTML(m.nome)}</strong></td>
                                <td>€${parseFloat(m.costo_menu).toFixed(2)}</td>
                                <td>€${parseFloat(m.prezzo_netto).toFixed(2)}</td>
                                <td class="${m.margine_netto > 0 ? 'text-success' : 'text-danger'}">€${m.margine_netto}</td>
                                <td>
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${m.margine_netto_percent >= 50 ? 'bg-success text-success' : (m.margine_netto_percent > 20 ? 'text-warning' : 'text-danger')}">
                                        ${m.margine_netto_percent}%
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                        ${menus.length === 0 ? '<tr><td colspan="5" class="text-center text-muted">Nessun menù trovato. Creane uno per iniziare.</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

import { renderDashboard } from './js/dashboard.js';
import { renderIngredients } from './js/ingredients.js';
import { renderRecipes } from './js/recipes.js';
import { renderMenus } from './js/menus.js';

const viewContainer = document.getElementById('view-container');
const pageTitle = document.getElementById('page-title');
const navLinks = document.querySelectorAll('.nav-links a');

const views = {
    'dashboard': { title: 'Dashboard', render: renderDashboard },
    'ingredients': { title: 'Ingredienti', render: renderIngredients },
    'recipes': { title: 'Ricette', render: renderRecipes },
    'menus': { title: 'Menù', render: renderMenus }
};

export async function navigateTo(viewId) {
    navLinks.forEach(link => {
        if (link.dataset.view === viewId) link.classList.add('active');
        else link.classList.remove('active');
    });

    const view = views[viewId];
    if (view) {
        pageTitle.textContent = view.title;
        viewContainer.innerHTML = '<div class="text-muted">Caricamento in corso...</div>';
        try {
            await view.render(viewContainer);
        } catch (error) {
            viewContainer.innerHTML = `<div class="text-danger">Errore durante il caricamento: ${error.message}</div>`;
        }
    }
}

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(e.target.dataset.view);
    });
});

document.addEventListener('DOMContentLoaded', () => {
    navigateTo('dashboard');
});

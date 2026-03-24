import { renderDashboard } from './js/dashboard.js';
import { renderIngredients } from './js/ingredients.js';
import { renderRecipes } from './js/recipes.js';
import { renderMenus } from './js/menus.js';
import { supabase, renderAuth } from './js/auth.js';

const viewContainer = document.getElementById('view-container');
const pageTitle = document.getElementById('page-title');
const navLinks = document.querySelectorAll('.nav-links a');
const sidebar = document.querySelector('.sidebar');
const topHeader = document.querySelector('.top-header');

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
            if (error.message.includes('Auth') || error.message.includes('token')) {
                supabase.auth.signOut();
            }
        }
    }
}

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(e.target.dataset.view);
    });
});

document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
});

async function initApp() {
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            if (session) {
                sidebar.style.display = 'flex';
                topHeader.style.display = 'flex';
                navigateTo('dashboard');
            } else {
                sidebar.style.display = 'none';
                topHeader.style.display = 'none';
                renderAuth(viewContainer, () => navigateTo('dashboard'));
            }
        } else if (event === 'SIGNED_OUT') {
            sidebar.style.display = 'none';
            topHeader.style.display = 'none';
            renderAuth(viewContainer, () => navigateTo('dashboard'));
        }
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        sidebar.style.display = 'none';
        topHeader.style.display = 'none';
        renderAuth(viewContainer, () => navigateTo('dashboard'));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function renderAuth(container, onSuccess) {
    container.innerHTML = `
        <div style="max-width: 400px; margin: 100px auto;" class="card">
            <h2 class="text-center mb-6" id="auth-title">Accedi a FoodCost</h2>
            
            <form id="auth-form">
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="auth-email" class="form-control" placeholder="es. chef@ristorante.com" required>
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="auth-password" class="form-control" required minlength="6">
                </div>
                <div style="margin-top: 24px;">
                    <button type="submit" class="btn" style="width: 100%; justify-content: center" id="btn-submit">Accedi</button>
                </div>
            </form>
            
            <div class="text-center mt-6 pt-4" style="border-top: 1px solid var(--border-color)">
                <span class="text-muted" id="auth-switch-text">Non hai un account?</span>
                <a href="#" id="auth-switch-mode" style="color: var(--primary); font-weight: 500; margin-left: 8px; text-decoration: none;">Registrati</a>
            </div>
            
            <div id="auth-error" class="text-danger mt-4 text-center text-sm hidden" style="background: rgba(239, 68, 68, 0.1); padding: 12px; border-radius: var(--radius-sm);"></div>
        </div>
    `;

    let isLogin = true;
    const form = document.getElementById('auth-form');
    const title = document.getElementById('auth-title');
    const btnSubmit = document.getElementById('btn-submit');
    const switchText = document.getElementById('auth-switch-text');
    const switchMode = document.getElementById('auth-switch-mode');
    const errorDiv = document.getElementById('auth-error');

    switchMode.addEventListener('click', (e) => {
        e.preventDefault();
        isLogin = !isLogin;
        title.textContent = isLogin ? 'Accedi a FoodCost' : 'Registrati a FoodCost';
        btnSubmit.textContent = isLogin ? 'Accedi' : 'Registrati';
        switchText.textContent = isLogin ? 'Non hai un account?' : 'Hai già un account?';
        switchMode.textContent = isLogin ? 'Registrati' : 'Accedi';
        errorDiv.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        
        errorDiv.classList.add('hidden');
        btnSubmit.disabled = true;
        btnSubmit.style.opacity = '0.7';
        btnSubmit.textContent = 'Caricamento...';

        let result;
        if (isLogin) {
            result = await supabase.auth.signInWithPassword({ email, password });
        } else {
            result = await supabase.auth.signUp({ email, password });
        }

        btnSubmit.disabled = false;
        btnSubmit.style.opacity = '1';
        btnSubmit.textContent = isLogin ? 'Accedi' : 'Registrati';

        if (result.error) {
            errorDiv.textContent = result.error.message === 'Invalid login credentials' ? 'Email o password errati.' : result.error.message;
            errorDiv.classList.remove('hidden');
        } else {
            if (!isLogin && result.data?.user?.identities?.length === 0) {
                errorDiv.textContent = 'Account già esistente. Usa Accedi.';
                errorDiv.classList.remove('hidden');
            } else {
                onSuccess();
            }
        }
    });
}

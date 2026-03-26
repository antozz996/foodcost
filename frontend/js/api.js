import { supabase } from './auth.js';

const API_URL = '/api';

const getHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
};

const cache = new Map();

export const api = {
    get: async (endpoint, useCache = true) => {
        if (useCache && cache.has(endpoint)) {
            console.log(`[CACHE HIT] GET ${endpoint}`);
            return cache.get(endpoint);
        }
        console.log(`[FETCH] GET ${endpoint} initiated...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const res = await fetch(`${API_URL}${endpoint}`, { 
                headers: await getHeaders(),
                signal: controller.signal 
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                const contentType = res.headers.get('content-type');
                if (contentType && contentType.includes('text/html')) {
                    throw new Error('Il server ha risposto con una pagina HTML invece di dati JSON. Possibile errore di routing (Fallback SPA).');
                }
                let errorData;
                try { errorData = await res.json(); } catch(e) {}
                const msg = errorData?.details || errorData?.error || res.statusText || 'Errore Sconosciuto';
                throw new Error(msg);
            }
            const data = await res.json();
            cache.set(endpoint, data);
            return data;
        } catch (err) {
            clearTimeout(timeoutId);
            const errorMsg = err.name === 'AbortError' ? 'Richiesta scaduta (Timeout 15s)' : err.message;
            console.error(`[FETCH ERROR] GET ${endpoint}:`, errorMsg);
            throw new Error(errorMsg);
        }
    },
    post: async (endpoint, data) => {
        api.invalidate(endpoint.split('/')[2]);
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            let errorData;
            try { errorData = await res.json(); } catch(e) {}
            const bodyStr = errorData ? JSON.stringify(errorData) : 'NoJSON';
            const msg = `[Status ${res.status}] ${res.statusText || 'NoText'} | Body: ${bodyStr}`;
            throw new Error(msg);
        }
        return res.json();
    },
    put: async (endpoint, data) => {
        api.invalidate(endpoint.split('/')[2]);
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'PUT',
            headers: await getHeaders(),
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            let errorData;
            try { errorData = await res.json(); } catch(e) {}
            const msg = errorData?.details || errorData?.error || res.statusText || 'API Error';
            throw new Error(msg);
        }
        return res.json();
    },
    delete: async (endpoint) => {
        api.invalidate(endpoint.split('/')[2]);
        const res = await fetch(`${API_URL}${endpoint}`, { 
            method: 'DELETE',
            headers: await getHeaders()
        });
        if (!res.ok) {
            let errorData;
            try { errorData = await res.json(); } catch(e) {}
            const msg = errorData?.details || errorData?.error || res.statusText || 'API Error';
            throw new Error(msg);
        }
        return res.json();
    },
    invalidate: (key) => {
        console.log(`[CACHE] Invalida cache per: ${key}`);
        for (const k of cache.keys()) {
            if (k.includes(key)) cache.delete(k);
        }
    },
    clearCache: () => cache.clear()
};

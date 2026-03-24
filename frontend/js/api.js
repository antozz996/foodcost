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

export const api = {
    get: async (endpoint) => {
        const res = await fetch(`${API_URL}${endpoint}`, { headers: await getHeaders() });
        if (!res.ok) throw new Error('API Error');
        return res.json();
    },
    post: async (endpoint, data) => {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: await getHeaders(),
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('API Error');
        return res.json();
    },
    put: async (endpoint, data) => {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'PUT',
            headers: await getHeaders(),
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('API Error');
        return res.json();
    },
    delete: async (endpoint) => {
        const res = await fetch(`${API_URL}${endpoint}`, { 
            method: 'DELETE',
            headers: await getHeaders()
        });
        if (!res.ok) throw new Error('API Error');
        return res.json();
    }
};

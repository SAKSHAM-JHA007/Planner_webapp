// Supabase Client Configuration and Initialization
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.FlowSupabaseConfig = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    // Default placeholders - can be overridden via localStorage or window.ENV_SUPABASE_...
    const DEFAULT_URL = '';
    const DEFAULT_ANON_KEY = '';

    const STORAGE_URL_KEY = 'flowboard_supabase_url';
    const STORAGE_KEY_KEY = 'flowboard_supabase_anon_key';

    function sanitizeUrl(url) {
        if (!url) return '';
        let cleaned = String(url).trim();
        cleaned = cleaned.replace(/^["']|["']$/g, '');
        if (cleaned && !cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
            cleaned = 'https://' + cleaned;
        }
        cleaned = cleaned.replace(/\/+$/, '');
        cleaned = cleaned.replace(/\/auth\/v1\/?$/i, '');
        cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
        return cleaned;
    }

    function sanitizeKey(key) {
        if (!key) return '';
        let cleaned = String(key).trim();
        cleaned = cleaned.replace(/^["']|["']$/g, '');
        cleaned = cleaned.replace(/^Bearer\s+/i, '');
        cleaned = cleaned.replace(/\s+/g, '');
        return cleaned;
    }

    function getStoredConfig() {
        const url = (typeof window !== 'undefined' && window.ENV_SUPABASE_URL) 
            || (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_URL_KEY)) 
            || DEFAULT_URL;

        const anonKey = (typeof window !== 'undefined' && window.ENV_SUPABASE_ANON_KEY) 
            || (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_KEY)) 
            || DEFAULT_ANON_KEY;

        return {
            url: sanitizeUrl(url),
            anonKey: sanitizeKey(anonKey)
        };
    }

    let supabaseInstance = null;

    function initSupabase() {
        const config = getStoredConfig();
        if (!config.url || !config.anonKey) {
            supabaseInstance = null;
            return null;
        }

        const createClient = (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) 
            || (typeof supabase !== 'undefined' && supabase.createClient);

        if (typeof createClient === 'function') {
            try {
                supabaseInstance = createClient(config.url, config.anonKey, {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: true,
                        storage: typeof localStorage !== 'undefined' ? localStorage : undefined
                    }
                });
                return supabaseInstance;
            } catch (err) {
                console.error('Failed to initialize Supabase client:', err);
                supabaseInstance = null;
                return null;
            }
        } else {
            console.warn('Supabase JS library (@supabase/supabase-js) is not yet loaded in this environment.');
            return null;
        }
    }

    // Auto-fetch environment config from server if not already stored locally (supports Vercel environment variables)
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
        const stored = getStoredConfig();
        if (!stored.url || !stored.anonKey) {
            fetch('/api/config')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data && data.supabaseUrl && data.supabaseAnonKey) {
                        window.ENV_SUPABASE_URL = data.supabaseUrl;
                        window.ENV_SUPABASE_ANON_KEY = data.supabaseAnonKey;
                        if (typeof localStorage !== 'undefined') {
                            localStorage.setItem(STORAGE_URL_KEY, data.supabaseUrl);
                            localStorage.setItem(STORAGE_KEY_KEY, data.supabaseAnonKey);
                        }
                        initSupabase();
                        window.dispatchEvent(new CustomEvent('supabase-config-loaded'));
                    }
                })
                .catch(() => {});
        }
    }

    return {
        getConfig: getStoredConfig,
        sanitizeUrl: sanitizeUrl,
        sanitizeKey: sanitizeKey,
        isConfigured: function () {
            const config = getStoredConfig();
            return Boolean(config.url && config.anonKey && config.url.startsWith('http'));
        },
        saveConfig: function (url, anonKey) {
            const cleanUrl = sanitizeUrl(url);
            const cleanKey = sanitizeKey(anonKey);
            if (typeof localStorage !== 'undefined') {
                if (cleanUrl) localStorage.setItem(STORAGE_URL_KEY, cleanUrl);
                if (cleanKey) localStorage.setItem(STORAGE_KEY_KEY, cleanKey);
            }
            return initSupabase();
        },
        clearConfig: function () {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(STORAGE_URL_KEY);
                localStorage.removeItem(STORAGE_KEY_KEY);
            }
            if (typeof window !== 'undefined') {
                window.ENV_SUPABASE_URL = '';
                window.ENV_SUPABASE_ANON_KEY = '';
            }
            supabaseInstance = null;
        },
        getClient: function () {
            if (!supabaseInstance) {
                initSupabase();
            }
            return supabaseInstance;
        }
    };
}));

// FlowBoard Supabase Authentication Helper Service
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./supabase-config'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./supabase-config'));
    } else {
        root.FlowAuth = factory(root.FlowSupabaseConfig);
    }
}(typeof self !== 'undefined' ? self : this, function (Config) {

    function getClient() {
        if (Config && typeof Config.getClient === 'function') {
            return Config.getClient();
        }
        return null;
    }

    function isConfigured() {
        return Boolean(Config && Config.isConfigured && Config.isConfigured());
    }

    function formatUser(supabaseUser) {
        if (!supabaseUser) return null;
        const meta = supabaseUser.user_metadata || {};
        const fullName = meta.full_name || meta.name || meta.user_name || (supabaseUser.email ? supabaseUser.email.split('@')[0] : 'User');
        return {
            id: supabaseUser.id,
            email: supabaseUser.email,
            name: fullName,
            avatar_url: meta.avatar_url || meta.picture || '',
            provider: supabaseUser.app_metadata?.provider || 'email',
            created_at: supabaseUser.created_at
        };
    }

    function storeUserLocally(userObj) {
        if (typeof localStorage !== 'undefined') {
            if (userObj) {
                localStorage.setItem('user', JSON.stringify(userObj));
            } else {
                localStorage.removeItem('user');
            }
        }
    }

    // Auto-listen to auth state changes and sync
    let authListenerInitialized = false;
    function initAuthListener() {
        if (authListenerInitialized) return;
        const client = getClient();
        if (client && client.auth) {
            authListenerInitialized = true;
            client.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                    if (session?.user) {
                        const userObj = formatUser(session.user);
                        storeUserLocally(userObj);
                    }
                } else if (event === 'SIGNED_OUT') {
                    storeUserLocally(null);
                }
            });
        }
    }

    // Attempt listener initialization if client already exists
    if (typeof window !== 'undefined') {
        window.addEventListener('DOMContentLoaded', () => {
            initAuthListener();
        });
    }

    const FlowAuth = {
        isConfigured: isConfigured,

        getClient: getClient,

        // Sign Up with Email and Password
        async signUpWithEmail(email, password, fullName) {
            if (!isConfigured()) {
                throw new Error('Supabase is not configured yet. Please configure your Supabase Project URL and Anon Key.');
            }
            const client = getClient();
            if (!client) throw new Error('Supabase client failed to initialize.');

            const cleanEmail = (email || '').trim().toLowerCase();
            const cleanName = (fullName || '').trim();

            const { data, error } = await client.auth.signUp({
                email: cleanEmail,
                password: password,
                options: {
                    data: {
                        full_name: cleanName,
                        name: cleanName
                    }
                }
            });

            if (error) throw error;

            if (data?.session && data?.user) {
                const userObj = formatUser(data.user);
                storeUserLocally(userObj);
                return { user: userObj, session: data.session, emailConfirmationRequired: false };
            } else {
                // Email confirmation is required by Supabase project settings
                return { 
                    user: data?.user ? formatUser(data.user) : null, 
                    session: null, 
                    emailConfirmationRequired: true,
                    message: 'Please check your email to verify your account before logging in.'
                };
            }
        },

        // Sign In with Email and Password
        async signInWithEmail(email, password) {
            if (!isConfigured()) {
                throw new Error('Supabase is not configured yet. Please configure your Supabase Project URL and Anon Key.');
            }
            const client = getClient();
            if (!client) throw new Error('Supabase client failed to initialize.');

            const cleanEmail = (email || '').trim().toLowerCase();

            const { data, error } = await client.auth.signInWithPassword({
                email: cleanEmail,
                password: password
            });

            if (error) throw error;

            if (data?.user) {
                const userObj = formatUser(data.user);
                storeUserLocally(userObj);
                return { user: userObj, session: data.session };
            }

            throw new Error('Sign in succeeded but no user data received.');
        },

        // Sign In with Google OAuth
        async signInWithGoogle() {
            if (!isConfigured()) {
                throw new Error('Supabase is not configured yet. Please configure your Supabase Project URL and Anon Key.');
            }
            const client = getClient();
            if (!client) throw new Error('Supabase client failed to initialize.');

            const redirectTo = window.location.origin + '/home.html';

            const { data, error } = await client.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectTo
                }
            });

            if (error) throw error;
            return data;
        },

        // Send Password Reset Email
        async sendPasswordReset(email) {
            if (!isConfigured()) {
                throw new Error('Supabase is not configured yet. Please configure your Supabase Project URL and Anon Key.');
            }
            const client = getClient();
            if (!client) throw new Error('Supabase client failed to initialize.');

            const cleanEmail = (email || '').trim().toLowerCase();
            const redirectTo = window.location.origin + '/login.html';

            const { data, error } = await client.auth.resetPasswordForEmail(cleanEmail, {
                redirectTo: redirectTo
            });

            if (error) throw error;
            return data;
        },

        // Sign Out User
        async signOutUser() {
            try {
                const client = getClient();
                if (client && client.auth) {
                    await client.auth.signOut();
                }
            } catch (err) {
                console.warn('Error during Supabase signOut:', err);
            } finally {
                storeUserLocally(null);
                if (typeof window !== 'undefined') {
                    window.location.href = 'login.html';
                }
            }
        },

        // Get Current Active User
        async getCurrentUser() {
            const client = getClient();
            if (client && client.auth) {
                try {
                    // Check if URL has OAuth callback params (e.g. ?code=... or #access_token=...)
                    const hasAuthParams = typeof window !== 'undefined' && (
                        window.location.search.includes('code=') ||
                        window.location.hash.includes('access_token=')
                    );

                    let { data: { session }, error } = await client.auth.getSession();

                    // If URL contains OAuth code/tokens but session isn't ready yet, wait for PKCE exchange
                    if (!session && hasAuthParams) {
                        session = await new Promise((resolve) => {
                            const timeout = setTimeout(() => resolve(null), 4000);
                            const { data: { subscription } } = client.auth.onAuthStateChange((event, newSession) => {
                                if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && newSession) {
                                    clearTimeout(timeout);
                                    subscription?.unsubscribe();
                                    resolve(newSession);
                                }
                            });
                        });

                        // Clean up URL query/hash without reloading page
                        if (typeof window !== 'undefined' && window.history?.replaceState) {
                            window.history.replaceState({}, document.title, window.location.pathname);
                        }
                    }

                    if (session?.user) {
                        const userObj = formatUser(session.user);
                        storeUserLocally(userObj);
                        return userObj;
                    }
                } catch (e) {
                    console.warn('Failed to retrieve current Supabase session:', e);
                }
            }

            // Fallback to localStorage cached user
            if (typeof localStorage !== 'undefined') {
                try {
                    const stored = localStorage.getItem('user');
                    if (stored) return JSON.parse(stored);
                } catch (e) {}
            }
            return null;
        },

        // Protected Route Guard: Redirects to login.html if not authenticated
        async checkAuth(redirectOnFail = true) {
            initAuthListener();
            const user = await this.getCurrentUser();
            if (!user) {
                if (redirectOnFail && typeof window !== 'undefined') {
                    window.location.href = 'login.html';
                }
                return null;
            }
            return user;
        },

        // Guest Route Guard: Redirects to home.html if already logged in
        async redirectIfLoggedIn() {
            initAuthListener();
            const user = await this.getCurrentUser();
            if (user && user.id && typeof window !== 'undefined') {
                window.location.href = 'home.html';
            }
        },

        // Test Supabase Connection with specified or saved credentials
        async testConnection(url, anonKey) {
            const rawUrl = url || Config.getConfig().url || '';
            const rawKey = anonKey || Config.getConfig().anonKey || '';

            const testUrl = Config.sanitizeUrl ? Config.sanitizeUrl(rawUrl) : String(rawUrl).trim().replace(/\/+$/, '');
            const testKey = Config.sanitizeKey ? Config.sanitizeKey(rawKey) : String(rawKey).trim().replace(/\s+/g, '');

            if (!testUrl || !testKey) {
                throw new Error('Project URL and Anon Key are both required.');
            }

            if (!testUrl.startsWith('https://') && !testUrl.startsWith('http://')) {
                throw new Error('Project URL must start with https:// (e.g. https://your-project.supabase.co)');
            }

            try {
                // Live check against Supabase Auth endpoint
                const res = await fetch(`${testUrl}/auth/v1/settings`, {
                    method: 'GET',
                    headers: {
                        'apikey': testKey,
                        'Authorization': `Bearer ${testKey}`
                    }
                });

                if (res.status === 401 || res.status === 403) {
                    throw new Error('Invalid API Key (Unauthorized). Please make sure you copied the "anon" "public" key from Supabase Dashboard -> Project Settings -> API.');
                }

                if (!res.ok) {
                    throw new Error(`Supabase returned status ${res.status}. Please check your Project URL.`);
                }

                return true;
            } catch (err) {
                if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
                    throw new Error('Failed to reach Supabase server. Please verify the Project URL (e.g. https://xyz.supabase.co) and check that no browser ad-blocker or Brave Shield is blocking supabase.co requests.');
                }
                throw err;
            }
        }
    };

    return FlowAuth;
}));

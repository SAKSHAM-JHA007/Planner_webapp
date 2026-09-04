// FlowBoard Supabase UI Helper (Configuration Modal, Alerts & Forgot Password)
(function () {
    function injectStyles() {
        if (document.getElementById('supabase-ui-styles')) return;
        const style = document.createElement('style');
        style.id = 'supabase-ui-styles';
        style.textContent = `
            .flow-modal-backdrop {
                position: fixed;
                inset: 0;
                background: rgba(15, 23, 42, 0.6);
                backdrop-filter: blur(4px);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1rem;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease-in-out;
            }
            .flow-modal-backdrop.open {
                opacity: 1;
                pointer-events: auto;
            }
            .flow-modal-card {
                background: #ffffff;
                border-radius: 16px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                max-width: 480px;
                width: 100%;
                overflow: hidden;
                transform: scale(0.95);
                transition: transform 0.2s ease-in-out;
                border: 1px solid #e2bfb0;
            }
            .flow-modal-backdrop.open .flow-modal-card {
                transform: scale(1);
            }
            .flow-toast {
                position: fixed;
                top: 24px;
                right: 24px;
                z-index: 10000;
                max-width: 400px;
                padding: 12px 18px;
                border-radius: 10px;
                box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 14px;
                font-family: 'Inter', sans-serif;
                animation: slideInToast 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes slideInToast {
                from { transform: translateY(-20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    function showToast(message, type = 'info') {
        injectStyles();
        const existing = document.querySelector('.flow-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'flow-toast';

        let bg = '#1e293b';
        let text = '#f8fafc';
        let icon = 'info';

        if (type === 'success') {
            bg = '#065f46';
            text = '#ecfdf5';
            icon = 'check_circle';
        } else if (type === 'error') {
            bg = '#991b1b';
            text = '#fef2f2';
            icon = 'error';
        } else if (type === 'warning') {
            bg = '#854d0e';
            text = '#fefce8';
            icon = 'warning';
        }

        toast.style.background = bg;
        toast.style.color = text;
        toast.innerHTML = `
            <span class="material-symbols-outlined text-[20px]">${icon}</span>
            <div class="flex-1 font-medium leading-snug">${message}</div>
            <button onclick="this.parentElement.remove()" class="opacity-70 hover:opacity-100">&times;</button>
        `;

        document.body.appendChild(toast);
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 5000);
    }

    function openConfigModal() {
        injectStyles();
        let modal = document.getElementById('supabase-config-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'supabase-config-modal';
            modal.className = 'flow-modal-backdrop';
            modal.innerHTML = `
                <div class="flow-modal-card">
                    <div class="p-6 border-b border-outline-variant/30 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                <span class="material-symbols-outlined text-[20px]">tune</span>
                            </div>
                            <div>
                                <h3 class="font-bold text-on-surface text-base">Supabase Settings</h3>
                                <p class="text-xs text-secondary">Connect your own Supabase backend project</p>
                            </div>
                        </div>
                        <button id="close-supabase-modal-btn" class="text-secondary hover:text-on-surface p-1 rounded-md">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <form id="supabase-config-form" class="p-6 space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                                Supabase Project URL
                            </label>
                            <input 
                                type="url" 
                                id="modal-supabase-url" 
                                required
                                placeholder="https://your-project-id.supabase.co" 
                                class="w-full text-sm border border-outline rounded-lg p-2.5 bg-surface-container-low text-on-surface focus:outline-none focus:border-primary"
                            />
                            <p class="text-[11px] text-secondary mt-1">Found in Supabase Dashboard > Project Settings > API</p>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                                Supabase Anon / Public Key
                            </label>
                            <textarea 
                                id="modal-supabase-key" 
                                required
                                rows="3"
                                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." 
                                class="w-full text-sm font-mono border border-outline rounded-lg p-2.5 bg-surface-container-low text-on-surface focus:outline-none focus:border-primary resize-none"
                            ></textarea>
                            <p class="text-[11px] text-secondary mt-1">Found under 'Project API keys' (anon public)</p>
                        </div>

                        <div id="modal-status-msg" class="hidden text-xs p-2.5 rounded-lg"></div>

                        <div class="flex items-center justify-between pt-2 gap-3">
                            <button 
                                type="button" 
                                id="modal-test-btn" 
                                class="px-3.5 py-2 border border-outline rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-variant transition-colors flex items-center gap-1.5"
                            >
                                <span class="material-symbols-outlined text-[16px]">bolt</span>
                                Test Connection
                            </button>

                            <div class="flex items-center gap-2">
                                <button 
                                    type="button" 
                                    id="modal-cancel-btn" 
                                    class="px-3.5 py-2 text-xs font-semibold text-secondary hover:text-on-surface"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    id="modal-save-btn" 
                                    class="px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:opacity-95 active:scale-95 transition-all shadow-sm"
                                >
                                    Save & Connect
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);

            const form = document.getElementById('supabase-config-form');
            const closeBtn = document.getElementById('close-supabase-modal-btn');
            const cancelBtn = document.getElementById('modal-cancel-btn');
            const testBtn = document.getElementById('modal-test-btn');
            const statusMsg = document.getElementById('modal-status-msg');

            function closeModal() {
                modal.classList.remove('open');
            }

            closeBtn.addEventListener('click', closeModal);
            cancelBtn.addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });

            testBtn.addEventListener('click', async () => {
                const url = document.getElementById('modal-supabase-url').value;
                const key = document.getElementById('modal-supabase-key').value;
                statusMsg.className = 'text-xs p-2.5 rounded-lg bg-blue-50 text-blue-700 block';
                statusMsg.textContent = 'Testing connection...';
                try {
                    await window.FlowAuth.testConnection(url, key);
                    statusMsg.className = 'text-xs p-2.5 rounded-lg bg-green-50 text-green-700 block';
                    statusMsg.textContent = '✓ Connection successful! Project URL and Key are valid.';
                } catch (err) {
                    statusMsg.className = 'text-xs p-2.5 rounded-lg bg-red-50 text-red-700 block';
                    statusMsg.textContent = '✗ Connection failed: ' + (err.message || 'Invalid URL or Key');
                }
            });

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const url = document.getElementById('modal-supabase-url').value;
                const key = document.getElementById('modal-supabase-key').value;
                window.FlowSupabaseConfig.saveConfig(url, key);
                showToast('Supabase settings saved successfully!', 'success');
                closeModal();
                updateConfigStatusBadge();
            });
        }

        const currentConfig = window.FlowSupabaseConfig ? window.FlowSupabaseConfig.getConfig() : { url: '', anonKey: '' };
        document.getElementById('modal-supabase-url').value = currentConfig.url || '';
        document.getElementById('modal-supabase-key').value = currentConfig.anonKey || '';
        document.getElementById('modal-status-msg').className = 'hidden';

        modal.classList.add('open');
    }

    function openForgotPasswordModal() {
        injectStyles();
        let modal = document.getElementById('forgot-password-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'forgot-password-modal';
            modal.className = 'flow-modal-backdrop';
            modal.innerHTML = `
                <div class="flow-modal-card">
                    <div class="p-6 border-b border-outline-variant/30 flex items-center justify-between">
                        <div>
                            <h3 class="font-bold text-on-surface text-base">Reset Your Password</h3>
                            <p class="text-xs text-secondary">We'll send a password recovery link to your email</p>
                        </div>
                        <button id="close-forgot-modal-btn" class="text-secondary hover:text-on-surface p-1 rounded-md">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <form id="forgot-password-form" class="p-6 space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                                Account Email
                            </label>
                            <input 
                                type="email" 
                                id="forgot-email" 
                                required
                                placeholder="your@email.com" 
                                class="w-full text-sm border border-outline rounded-lg p-2.5 bg-surface-container-low text-on-surface focus:outline-none focus:border-primary"
                            />
                        </div>

                        <div id="forgot-status-msg" class="hidden text-xs p-2.5 rounded-lg"></div>

                        <div class="flex items-center justify-end pt-2 gap-2">
                            <button 
                                type="button" 
                                id="forgot-cancel-btn" 
                                class="px-3.5 py-2 text-xs font-semibold text-secondary hover:text-on-surface"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                id="forgot-submit-btn" 
                                class="px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:opacity-95 active:scale-95 transition-all shadow-sm"
                            >
                                Send Reset Link
                            </button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);

            const form = document.getElementById('forgot-password-form');
            const closeBtn = document.getElementById('close-forgot-modal-btn');
            const cancelBtn = document.getElementById('forgot-cancel-btn');
            const statusMsg = document.getElementById('forgot-status-msg');

            function closeModal() {
                modal.classList.remove('open');
            }

            closeBtn.addEventListener('click', closeModal);
            cancelBtn.addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('forgot-email').value;
                const submitBtn = document.getElementById('forgot-submit-btn');
                submitBtn.disabled = true;
                submitBtn.textContent = 'Sending...';

                try {
                    await window.FlowAuth.sendPasswordReset(email);
                    statusMsg.className = 'text-xs p-2.5 rounded-lg bg-green-50 text-green-700 block';
                    statusMsg.textContent = 'Password reset instructions sent! Please check your inbox.';
                    setTimeout(closeModal, 4000);
                } catch (err) {
                    statusMsg.className = 'text-xs p-2.5 rounded-lg bg-red-50 text-red-700 block';
                    statusMsg.textContent = 'Error: ' + (err.message || 'Failed to send reset link.');
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Send Reset Link';
                }
            });
        }

        const emailInput = document.getElementById('email');
        if (emailInput && emailInput.value) {
            document.getElementById('forgot-email').value = emailInput.value;
        }
        document.getElementById('forgot-status-msg').className = 'hidden';
        modal.classList.add('open');
    }

    function updateConfigStatusBadge() {
        const badge = document.getElementById('supabase-status-badge');
        if (!badge) return;

        const isConfigured = window.FlowAuth && window.FlowAuth.isConfigured();
        if (isConfigured) {
            badge.innerHTML = `
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span class="text-xs font-semibold text-emerald-800">Supabase Connected</span>
                <button onclick="FlowSupabaseUI.openConfigModal()" class="text-emerald-900 hover:text-emerald-950 font-bold ml-1 text-xs">⚙️</button>
            `;
            badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 shadow-sm';
        } else {
            badge.innerHTML = `
                <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                <span class="text-xs font-semibold text-amber-800">Supabase Setup Required</span>
                <button onclick="FlowSupabaseUI.openConfigModal()" class="bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded text-[11px] font-bold ml-1 transition-colors">Configure</button>
            `;
            badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 shadow-sm';
        }
    }

    window.FlowSupabaseUI = {
        openConfigModal: openConfigModal,
        openForgotPasswordModal: openForgotPasswordModal,
        showToast: showToast,
        updateConfigStatusBadge: updateConfigStatusBadge
    };

    document.addEventListener('DOMContentLoaded', () => {
        updateConfigStatusBadge();
    });
})();

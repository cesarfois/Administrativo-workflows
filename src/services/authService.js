import axios from 'axios';
import api from './api';

const AUTH_KEY = 'docuware_auth';

// Environment Variables
const CLIENT_ID = import.meta.env.VITE_DOCUWARE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_DOCUWARE_CLIENT_SECRET;
const REDIRECT_URI = import.meta.env.VITE_DOCUWARE_REDIRECT_URI;

// Flag to prevent multiple simultaneous refresh calls
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

export const authService = {
    /**
     * @function login
     * @description Initiates the OAuth Authorization Code Flow by redirecting the user.
     * @param {string} url - The DocuWare Platform URL provided by user (e.g. https://rcsangola.docuware.cloud)
     */
    login: async (url) => {
        try {
            // Normalize URL
            let baseUrl = url.replace(/\/$/, '').trim();
            if (baseUrl.includes('.docuware.cloud') && baseUrl.startsWith('http://')) {
                baseUrl = baseUrl.replace('http://', 'https://');
            }

            // 1. Get Identity Service Info to find the correct Identity Provider URL
            // Use /discovery endpoint to bypass DocuWare firewall (clean server-to-server request)
            const serviceDesc = await axios.get(`http://localhost:3001/discovery?target=${encodeURIComponent(baseUrl)}`);
            const identityUrl = serviceDesc.data.IdentityServiceUrl;

            // Extract the org ID from the URL if possible, or just use the identity endpoint
            // Example IdentityURL: https://login-emea.docuware.cloud/cabfaa...

            // 2. Discover Endpoints
            const proxiedIdentity = `/docuware-proxy${new URL(identityUrl).pathname}`;
            const identityOrigin = new URL(identityUrl).origin;

            const discovery = await axios.get(`${proxiedIdentity}/.well-known/openid-configuration`, {
                headers: { 'x-target-url': identityOrigin }
            });

            const authorizationEndpoint = discovery.data.authorization_endpoint;

            // 3. Construct Authorization URL
            const authUrl = new URL(authorizationEndpoint);
            authUrl.searchParams.append('response_type', 'code');
            authUrl.searchParams.append('client_id', CLIENT_ID);
            authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
            authUrl.searchParams.append('scope', 'docuware.platform docuware.settings offline_access');
            authUrl.searchParams.append('ui_locales', 'pt-PT en-US'); // Improve UX

            // Save the Base URL to session so we know where to connect after callback
            sessionStorage.setItem('docuware_pre_login_url', baseUrl);

            // Redirect User
            window.location.href = authUrl.toString();

        } catch (error) {
            console.error('Login Initialization Failed:', error);
            throw error;
        }
    },

    /**
     * @function exchangeCodeForToken
     * @description Exchanges the authorization code for access/refresh tokens.
     */
    exchangeCodeForToken: async (code) => {
        const baseUrl = sessionStorage.getItem('docuware_pre_login_url');
        if (!baseUrl) throw new Error('Base URL lost during redirect.');

        try {
            // 1. Rediscover endpoints using /discovery endpoint
            // This bypasses WAF by making clean server-to-server requests without browser headers
            const serviceDescResp = await axios.get(`http://localhost:3001/discovery?target=${encodeURIComponent(baseUrl)}`);
            const serviceDesc = serviceDescResp.data;

            const identityUrl = serviceDesc.IdentityServiceUrl;
            const proxiedIdentity = `/docuware-proxy${new URL(identityUrl).pathname}`;
            const identityOrigin = new URL(identityUrl).origin;

            const discoveryResp = await fetch(`${proxiedIdentity}/.well-known/openid-configuration`, {
                method: 'GET',
                credentials: 'omit', // CRITICAL: Do not send cookies
                headers: {
                    'x-target-url': identityOrigin,
                    'Accept': 'application/json'
                }
            });

            if (!discoveryResp.ok) throw new Error(`OpenID Discovery failed: ${discoveryResp.status}`);
            const discovery = await discoveryResp.json();

            const tokenEndpoint = discovery.token_endpoint;
            const tokenPath = new URL(tokenEndpoint).pathname;
            const tokenOrigin = new URL(tokenEndpoint).origin;
            const proxiedToken = `/docuware-proxy${tokenPath}`;

            // 2. Prepare Token Request
            const params = new URLSearchParams();
            params.append('grant_type', 'authorization_code');
            params.append('code', code);
            params.append('client_id', CLIENT_ID);
            params.append('client_secret', CLIENT_SECRET); // Safe to use here as we are in a controllable Env/Proxy context (client-side but using our App reg)
            params.append('redirect_uri', REDIRECT_URI);

            const response = await axios.post(proxiedToken, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'x-target-url': tokenOrigin
                }
            });

            const { access_token, refresh_token } = response.data;

            // Save to SessionStorage
            const authData = {
                token: access_token,
                refreshToken: refresh_token,
                url: baseUrl,
                tokenEndpoint: tokenEndpoint
            };

            sessionStorage.setItem(AUTH_KEY, JSON.stringify(authData));
            sessionStorage.removeItem('docuware_pre_login_url'); // Cleanup

            // Set default header
            api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

            return authData;

        } catch (error) {
            console.error('Token Exchange Failed:', error);
            throw error;
        }
    },

    refreshToken: async () => {
        const stored = sessionStorage.getItem(AUTH_KEY);
        if (!stored) throw new Error('No session data found');
        const authData = JSON.parse(stored);

        try {
            const tokenPath = new URL(authData.tokenEndpoint).pathname;
            const tokenOrigin = new URL(authData.tokenEndpoint).origin;
            const proxiedToken = `/docuware-proxy${tokenPath}`;

            const params = new URLSearchParams();
            params.append('grant_type', 'refresh_token');
            params.append('refresh_token', authData.refreshToken);
            params.append('client_id', CLIENT_ID);
            params.append('client_secret', CLIENT_SECRET);

            const response = await axios.post(proxiedToken, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'x-target-url': tokenOrigin
                }
            });

            const newAccessToken = response.data.access_token;
            const newRefreshToken = response.data.refresh_token; // Rotate refresh token if provided

            console.log('✅ Token refreshed successfully!');

            // Update Storage
            const newAuthData = {
                ...authData,
                token: newAccessToken,
                refreshToken: newRefreshToken || authData.refreshToken
            };
            sessionStorage.setItem(AUTH_KEY, JSON.stringify(newAuthData));
            localStorage.setItem('docuware_session_start', Date.now().toString()); // Reset timer logic

            // Update Headers
            api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;

            return newAccessToken;

        } catch (error) {
            console.error('❌ Token refresh failed:', error);
            authService.logout(); // Force logout if refresh fails
            throw error;
        }
    },

    // 3. Logout Function
    logout: () => {
        console.group('🚪 authService.logout() called');
        console.trace('Logout Triggered By:');
        console.groupEnd();

        sessionStorage.removeItem(AUTH_KEY);
        localStorage.removeItem('docuware_session_start');
        delete api.defaults.headers.common['Authorization'];
        window.location.href = '/'; // Hard redirect to login
    },

    // 4. Get Current User
    getCurrentUser: () => {
        const stored = sessionStorage.getItem(AUTH_KEY);
        if (stored) {
            const authData = JSON.parse(stored);
            api.defaults.headers.common['Authorization'] = `Bearer ${authData.token}`;
            return authData;
        }
        return null;
    },

    // 5. Setup Interceptors (Call this in main.jsx)
    setupAxiosInterceptors: () => {
        api.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;

                // If error is 401 and we haven't retried yet
                if (error.response && error.response.status === 401 && !originalRequest._retry) {

                    if (isRefreshing) {
                        // If refreshing, queue this request
                        return new Promise(function (resolve, reject) {
                            failedQueue.push({ resolve, reject });
                        }).then(token => {
                            originalRequest.headers['Authorization'] = 'Bearer ' + token;
                            return api(originalRequest);
                        }).catch(err => {
                            return Promise.reject(err);
                        });
                    }

                    originalRequest._retry = true;
                    isRefreshing = true;

                    try {
                        const newToken = await authService.refreshToken();
                        processQueue(null, newToken);

                        // Retry original request with new token
                        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                        return api(originalRequest);

                    } catch (refreshErr) {
                        processQueue(refreshErr, null);
                        console.error('❌ Session expired. Logging out...', refreshErr);
                        authService.logout();
                        return Promise.reject(refreshErr);
                    } finally {
                        isRefreshing = false;
                    }
                }

                return Promise.reject(error);
            }
        );
        console.log('🛡️ Axios Interceptors Configured for Silent Refresh');
    }
};

import axios from 'axios';
import api from './api';

const AUTH_KEY = 'docuware_auth';

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
    // 1. Login Function
    login: async (url, username, password) => {
        try {
            // Normalize URL (remove trailing slash and ensure https for cloud)
            let baseUrl = url.replace(/\/$/, '').trim();

            // Force HTTPS for DocuWare Cloud URLs
            if (baseUrl.includes('.docuware.cloud') && baseUrl.startsWith('http://')) {
                baseUrl = baseUrl.replace('http://', 'https://');
                console.warn('Automatically converted HTTP to HTTPS for DocuWare Cloud');
            }

            // Step 1: Get Identity Service URL
            console.log('Step 1: Getting Identity Service Info...');
            const serviceDesc = await api.get('/Home/IdentityServiceInfo', {
                headers: { 'x-target-url': baseUrl }
            });
            const identityUrl = serviceDesc.data.IdentityServiceUrl;

            // Extract path/origin
            const identityPath = new URL(identityUrl).pathname;
            const identityOrigin = new URL(identityUrl).origin;
            const orgId = identityPath.replace(/^\//, '');

            // Step 2: Get OpenID Config
            console.log('Step 2: Getting OpenID Configuration...');
            const proxiedIdentity = `/docuware-proxy${identityPath}`;
            const discovery = await axios.get(`${proxiedIdentity}/.well-known/openid-configuration`, {
                headers: { 'x-target-url': identityOrigin }
            });
            const tokenEndpoint = discovery.data.token_endpoint;

            // Extract token path/origin
            const tokenPath = new URL(tokenEndpoint).pathname;
            const tokenOrigin = new URL(tokenEndpoint).origin;

            // Step 3: Request Access Token
            console.log('Step 3: Requesting Access Token...');
            const proxiedToken = `/docuware-proxy${tokenPath}`;
            const params = new URLSearchParams();
            params.append('grant_type', 'password');
            params.append('username', username);
            params.append('password', password);
            params.append('client_id', 'docuware.platform.net.client');
            params.append('scope', 'docuware.platform');

            const tokenResponse = await axios.post(proxiedToken, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'x-target-url': tokenOrigin
                }
            });

            const accessToken = tokenResponse.data.access_token;
            const refreshToken = tokenResponse.data.refresh_token; // Capture Refresh Token
            console.log('✅ Authentication successful!');

            // Save to SessionStorage
            const authData = {
                token: accessToken,
                refreshToken: refreshToken,
                username: username,
                url: baseUrl,
                organizationId: orgId,
                tokenEndpoint: tokenEndpoint // Save endpoint URL for refreshing
            };
            sessionStorage.setItem(AUTH_KEY, JSON.stringify(authData));
            localStorage.setItem('docuware_session_start', Date.now().toString()); // Sync timer

            // Set default header
            api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

            return authData;
        } catch (error) {
            console.error('❌ Login failed:', error);
            if (error.response) {
                const data = error.response.data;
                const errorMsg = data.error_description || data.error || `Error ${error.response.status}`;
                throw new Error(`Login Failed: ${errorMsg}`);
            }
            throw error;
        }
    },

    // 2. Refresh Token Function
    refreshToken: async () => {
        const stored = sessionStorage.getItem(AUTH_KEY);
        if (!stored) throw new Error('No session data found');

        const authData = JSON.parse(stored);
        if (!authData.refreshToken || !authData.tokenEndpoint) throw new Error('No refresh token available');

        try {
            console.log('🔄 Attempting to refresh token...');

            const tokenPath = new URL(authData.tokenEndpoint).pathname;
            const tokenOrigin = new URL(authData.tokenEndpoint).origin;
            const proxiedToken = `/docuware-proxy${tokenPath}`;

            const params = new URLSearchParams();
            params.append('grant_type', 'refresh_token');
            params.append('refresh_token', authData.refreshToken);
            params.append('client_id', 'docuware.platform.net.client');

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

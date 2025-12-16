import axios from 'axios';

/**
 * Admin Workflow Service - Administrative Access using Power Automate API Key
 * 
 * This service provides UNRESTRICTED access to ALL DocuWare workflows for
 * administrative monitoring purposes. It uses a dedicated Power Automate API Key
 * instead of the logged-in user's token to provide a global view.
 * 
 * IMPORTANT: This is separate from workflowService.js which uses user authentication.
 */

// Create a dedicated axios instance for admin workflow API
const adminWorkflowApi = axios.create({
    baseURL: '/DocuWare/Platform/Workflow',
    timeout: 30000,
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
});

// Add request interceptor to include User Token from Session Storage
// This avoids the 1-hour expiration limit of the API Key
adminWorkflowApi.interceptors.request.use(
    (config) => {
        const authData = sessionStorage.getItem('docuware_auth');
        let targetUrl = null;

        if (authData) {
            try {
                const parsed = JSON.parse(authData);
                if (parsed.token) {
                    config.headers.Authorization = `Bearer ${parsed.token}`;
                    console.log('[AdminWorkflowService] Using user token for admin access');
                }
                if (parsed.url) {
                    targetUrl = parsed.url;
                }
            } catch (error) {
                console.error('[AdminWorkflowService] Error parsing auth data:', error);
            }
        } else {
            console.warn('[AdminWorkflowService] No user logged in');
        }

        // Allow overriding target URL (e.g. from .env if needed, but prefer user session)
        if (!targetUrl) {
            targetUrl = import.meta.env.VITE_DOCUWARE_ADMIN_URL || import.meta.env.VITE_DOCUWARE_WORKFLOW_URL;
        }

        // Set target URL for proxy
        if (targetUrl) {
            config.headers['x-target-url'] = targetUrl;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add response interceptor for error handling
adminWorkflowApi.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            console.error('❌ Admin API authentication failed - User token may be expired');
        }
        return Promise.reject(error);
    }
);

export const adminWorkflowService = {
    /**
     * Get ALL workflows with administrative access
     * Uses /ControllerWorkflows endpoint which requires Admin permissions
     * @returns {Promise<Array>} Array of ALL workflow objects
     */
    getWorkflows: async () => {
        try {
            console.log('[AdminWorkflowService] Fetching ALL workflows (Controller endpoint)...');

            // Explicitly use the Controller endpoint for Admin view
            const response = await adminWorkflowApi.get('/ControllerWorkflows');
            console.log('[AdminWorkflowService] ControllerWorkflows endpoint response:', response.status);

            const workflows = response.data.Workflow || [];
            console.log(`[AdminWorkflowService] ✅ Found ${workflows.length} workflows`);
            return workflows;

        } catch (error) {
            console.error('[AdminWorkflowService] Error fetching admin workflows:', error);
            throw new Error(`Falha ao buscar workflows administrativos. Verifique se seu usuário tem permissão de administrador.\nErro: ${error.message}`);
        }
    },

    /**
     * Get active tasks/instances for a specific workflow (admin access)
     * @param {string} workflowId - The workflow ID
     * @returns {Promise<Array>} Array of task objects
     */
    getWorkflowTasks: async (workflowId) => {
        try {
            // Use ControllerWorkflows tasks endpoint
            const response = await adminWorkflowApi.get(`/ControllerWorkflows/${workflowId}/Tasks`);
            const tasks = response.data.Task || [];
            return tasks;
        } catch (error) {
            console.warn(`[AdminWorkflowService] Failed to get admin tasks for ${workflowId}:`, error.message);
            return [];
        }
    },

    /**
     * Get ALL workflows with their active instance counts (admin access)
     * @returns {Promise<Array>} Array of ALL workflow objects with counts
     */
    getWorkflowsWithCounts: async () => {
        try {
            console.log('[AdminWorkflowService] Fetching ALL workflows with instance counts (ADMIN ACCESS)...');

            // Step 1: Get all workflows
            const workflows = await adminWorkflowService.getWorkflows();

            if (workflows.length === 0) {
                console.log('[AdminWorkflowService] No workflows found');
                return [];
            }

            // Step 2: Fetch task counts for all workflows with concurrency control
            // We have 166+ workflows, firing all requests at once causes timeouts
            console.log(`[AdminWorkflowService] Fetching task counts for ${workflows.length} workflows...`);

            const CONCURRENCY_LIMIT = 5; // Process 5 requests at a time
            const results = [];

            // Process workflows in chunks to avoid overwhelming the server/browser
            for (let i = 0; i < workflows.length; i += CONCURRENCY_LIMIT) {
                const chunk = workflows.slice(i, i + CONCURRENCY_LIMIT);
                console.log(`[AdminWorkflowService] Processing chunk ${Math.floor(i / CONCURRENCY_LIMIT) + 1}/${Math.ceil(workflows.length / CONCURRENCY_LIMIT)}`);

                const chunkResults = await Promise.all(
                    chunk.map(async (workflow) => {
                        try {
                            const tasks = await adminWorkflowService.getWorkflowTasks(workflow.Id);
                            return {
                                id: workflow.Id,
                                name: workflow.Name || workflow.Id,
                                description: workflow.Description || '',
                                activeInstanceCount: tasks.length
                            };
                        } catch (error) {
                            console.error(`[AdminWorkflowService] Failed to get count for workflow ${workflow.Id}:`, error);
                            return {
                                id: workflow.Id,
                                name: workflow.Name || workflow.Id,
                                description: workflow.Description || '',
                                activeInstanceCount: 0
                            };
                        }
                    })
                );

                results.push(...chunkResults);
            }

            console.log('[AdminWorkflowService] ✅ Successfully fetched all workflow counts (ADMIN)');
            return results;
        } catch (error) {
            console.error('[AdminWorkflowService] Error fetching workflows with counts:', error);
            throw error;
        }
    }
};

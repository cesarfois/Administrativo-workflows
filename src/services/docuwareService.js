import api from './api';

export const docuwareService = {
    // 1. Get File Cabinets
    getCabinets: async () => {
        const response = await api.get('/FileCabinets');
        return response.data.FileCabinet || [];
    },

    // 2. Get File Cabinet Fields (for filtering)
    getCabinetFields: async (cabinetId) => {
        if (!cabinetId) throw new Error("Cabinet ID is required");
        try {
            const response = await api.get(`/FileCabinets/${cabinetId}`);
            if (response.data && response.data.Fields) {
                return response.data.Fields;
            }

            // Fallback: try direct fields endpoint
            console.warn(`Fields not found in cabinet root for ${cabinetId}, trying /Fields...`);
            try {
                // Try the dedicated fields endpoint often present in DocuWare REST API
                const fieldRes = await api.get(`/FileCabinets/${cabinetId}/Fields`);
                if (fieldRes.data && fieldRes.data.Fields) {
                    return fieldRes.data.Fields;
                }
            } catch (fallbackErr) {
                console.warn("Fallback to /Fields failed:", fallbackErr);
            }

            return [];
        } catch (error) {
            console.error("Error in getCabinetFields:", error);
            throw error;
        }
    },

    // 2.5 Get Cabinet Document Count
    getCabinetCount: async (cabinetId) => {
        try {
            const response = await api.get(`/FileCabinets/${cabinetId}/Documents`, {
                params: {
                    count: 0,
                    calculateTotalCount: true
                }
            });

            if (typeof response.data.Count === 'object' && response.data.Count !== null) {
                return response.data.Count.Value || 0;
            }
            return response.data.Count || 0;
        } catch (error) {
            console.error('Error getting cabinet count:', error);
            return 0;
        }
    },

    // 3. Get Dialogs for a Cabinet
    getDialogs: async (cabinetId) => {
        const response = await api.get(`/FileCabinets/${cabinetId}/Dialogs`);
        return response.data.Dialog || [];
    },

    // 4. Search Documents with Filters
    searchDocuments: async (cabinetId, filters = [], resultLimit = 1000) => {
        // If no filters, just list documents
        if (filters.length === 0) {
            const response = await api.get(`/FileCabinets/${cabinetId}/Documents`, {
                params: {
                    count: resultLimit,
                    calculateTotalCount: true
                }
            });

            const total = (typeof response.data.Count === 'object' && response.data.Count !== null)
                ? (response.data.Count.Value || 0)
                : (response.data.Count || 0);

            return {
                items: response.data.Items || [],
                total: total
            };
        }

        // Get the first search dialog (or use custom dialog)
        const dialogs = await docuwareService.getDialogs(cabinetId);
        const searchDialog = dialogs.find(d => d.Type === 'Search') || dialogs[0];

        if (!searchDialog) {
            throw new Error('No search dialog found for this cabinet');
        }

        // Build the search query
        const conditions = filters.map(filter => ({
            DBName: filter.fieldName,
            Value: [filter.value]
        }));

        const queryBody = {
            Condition: conditions,
            Operation: 'And',
            CalculateTotalCount: true
        };

        // Execute search using DialogExpression
        const response = await api.post(
            `/FileCabinets/${cabinetId}/Query/DialogExpression`,
            queryBody,
            {
                params: {
                    dialogId: searchDialog.Id,
                    count: resultLimit  // Use the dynamic result limit
                }
            }
        );

        // Helper to extract count
        const getCount = (data) => {
            if (typeof data.Count === 'object' && data.Count !== null) {
                return data.Count.Value || 0;
            }
            return data.Count || 0;
        };

        return {
            items: response.data.Items || [],
            total: getCount(response.data)
        };
    },

    // 4.4 Get Select List (Unique Values for a Field)
    getSelectList: async (cabinetId, fieldName) => {
        try {
            const dialogs = await docuwareService.getDialogs(cabinetId);
            const searchDialog = dialogs.find(d => d.Type === 'Search') || dialogs[0];

            if (!searchDialog) return [];

            const response = await api.post(
                `/FileCabinets/${cabinetId}/Query/SelectListExpression`,
                {
                    DialogId: searchDialog.Id,
                    FieldName: fieldName,
                    ExcludeExternalData: false
                },
                {
                    params: { dialogId: searchDialog.Id }
                }
            );

            return response.data.Value || [];
        } catch (error) {
            console.error("Failed to get select list:", error);
            return [];
        }
    },

    // 4.5 Get All Documents for Analytics (Optimized Parallel Fetch)
    getAllDocuments: async (cabinetId, onProgress) => {
        try {
            console.log(`[Service] Starting optimized fetch for cabinet: ${cabinetId}`);

            // Step 1: Get total count first
            const totalCount = await docuwareService.getCabinetCount(cabinetId);
            console.log(`[Service] Total documents to fetch: ${totalCount}`);

            if (totalCount === 0) return [];

            if (onProgress) {
                onProgress(0, totalCount);
            }

            const CHUNK_SIZE = 2000;
            const BATCH_SIZE = 5;
            const TIMEOUT_MS = 120000;
            let allItems = [];
            let totalLoaded = 0;
            const starts = [];

            // Step 2: Calculate all start positions
            for (let start = 0; start < totalCount; start += CHUNK_SIZE) {
                starts.push(start);
            }

            console.log(`[Service] Plan: ${starts.length} requests in batches of ${BATCH_SIZE}`);

            // Step 3: Process in batches
            for (let i = 0; i < starts.length; i += BATCH_SIZE) {
                const currentBatchStarts = starts.slice(i, i + BATCH_SIZE);
                console.log(`[Service] Fetching batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(starts.length / BATCH_SIZE)} (Items ${currentBatchStarts[0]} - ${currentBatchStarts[currentBatchStarts.length - 1] + CHUNK_SIZE})...`);

                const batchPromises = currentBatchStarts.map(start =>
                    api.get(`/FileCabinets/${cabinetId}/Documents`, {
                        params: {
                            count: CHUNK_SIZE,
                            calculateTotalCount: false,
                            start: start
                        },
                        timeout: TIMEOUT_MS
                    }).then(response => {
                        const items = response.data.Items || [];
                        totalLoaded += items.length;
                        if (onProgress) onProgress(totalLoaded, totalCount);
                        return items;
                    })
                        .catch(err => {
                            console.error(`[Service] Failed to fetch chunk starting at ${start}`, err);
                            return [];
                        })
                );

                const batchResults = await Promise.all(batchPromises);

                batchResults.forEach(items => {
                    allItems = [...allItems, ...items];
                });
            }

            console.log(`[Service] Fetch complete. Total loaded: ${allItems.length}`);
            return allItems;
        } catch (error) {
            console.error('Error fetching all items for analytics:', error);
            throw error;
        }
    },

    // 5. Get Document View URL
    getDocumentViewUrl: (cabinetId, documentId) => {
        // Get the base URL from session storage
        const authData = sessionStorage.getItem('docuware_auth');
        let baseUrl = 'https://rcsangola.docuware.cloud'; // Default fallback
        let orgId = 'bcb91903-58eb-49c6-8572-be5e3bb9611e'; // Default org ID

        if (authData) {
            try {
                const parsed = JSON.parse(authData);
                baseUrl = parsed.url;
                // Try to get org ID if stored
                if (parsed.organizationId) {
                    orgId = parsed.organizationId;
                }
            } catch (e) {
                console.error('Error parsing auth data:', e);
            }
        }

        // DocuWare WebClient URL format:
        // https://{domain}/DocuWare/Platform/WebClient/{orgId}/Integration?fc={cabinetId}&did={docId}&p=V
        return `${baseUrl}/DocuWare/Platform/WebClient/${orgId}/Integration?fc=${cabinetId}&did=${documentId}&p=V`;
    },

    // 6. Download Document
    downloadDocument: async (cabinetId, documentId) => {
        const response = await api.get(
            `/FileCabinets/${cabinetId}/Documents/${documentId}/FileDownload`,
            {
                params: {
                    targetFileType: 'pdf',
                    keepAnnotations: true // Ensure annotations like stamps are included
                },
                responseType: 'blob',
                timeout: 120000 // 2 minutes timeout for downloads
            }
        );
        return response.data;
    },

    // 7. Replace Document Content (Full Overwrite Strategy)
    uploadReplacement: async (cabinetId, documentId, fileBlob) => {
        console.log(`[uploadReplacement] Starting overwrite for doc ${documentId} in cabinet ${cabinetId}`);

        try {
            // Step 1: Fetch the current document state to identify ALL existing sections
            const docResponse = await api.get(`/FileCabinets/${cabinetId}/Documents/${documentId}`);
            const originalDoc = docResponse.data;
            const originalSections = originalDoc.Sections || [];

            console.log(`[uploadReplacement] Found ${originalSections.length} existing sections to replace.`);

            // Step 2: Append the NEW file as a fresh section
            // We use POST to /Sections to append.
            const appendUrl = `/FileCabinets/${cabinetId}/Sections?docId=${documentId}`;
            console.log(`[uploadReplacement] Appending new file via: ${appendUrl}`);

            await api.post(
                appendUrl,
                fileBlob,
                {
                    headers: {
                        'Content-Type': fileBlob.type || 'application/pdf',
                        'Content-Disposition': `inline; filename="${fileBlob.name || 'reduced_document.pdf'}"`
                    },
                    timeout: 120000 // 2 min timeout
                }
            );
            console.log('[uploadReplacement] New file appended successfully.');

            // Step 3: Delete ALL original sections
            // We must be careful not to delete the new section we just added.
            // Since we captured 'originalSections' BEFORE the append, we are safe to delete exactly those IDs.

            if (originalSections.length > 0) {
                console.log('[uploadReplacement] Deleting old sections...');

                // Process deletions sequentially to avoid race conditions or overload
                for (const section of originalSections) {
                    const deleteUrl = `/FileCabinets/${cabinetId}/Sections/${section.Id}`;
                    console.log(`[uploadReplacement] Deleting old section: ${section.Id}`);

                    try {
                        await api.delete(deleteUrl);
                    } catch (delErr) {
                        console.error(`[uploadReplacement] Failed to delete section ${section.Id}`, delErr);
                        // We continue even if one fails, to try to clean up as much as possible
                    }
                }
                console.log('[uploadReplacement] All old sections deleted.');
            } else {
                console.log('[uploadReplacement] No old sections found (strange for a replacement, but proceeding).');
            }

            // Step 4: Return final state
            const finalDocResponse = await api.get(`/FileCabinets/${cabinetId}/Documents/${documentId}`);
            return finalDocResponse.data;

        } catch (error) {
            console.error('[uploadReplacement] Critical Error during overwrite:', error);
            throw error;
        }
    },

    // 8. Update Document Fields
    updateDocumentFields: async (cabinetId, documentId, fieldName, value) => {
        console.log(`[updateDocumentFields] Updating ${fieldName} = ${value} for doc ${documentId}`);

        // Construct standard DocuWare field structure
        const body = {
            Field: [
                {
                    FieldName: fieldName,
                    Item: value,
                    ItemElementName: 'String'
                }
            ]
        };

        const response = await api.put(
            `/FileCabinets/${cabinetId}/Documents/${documentId}/Fields`,
            body
        );
        return response.data;
    }
};

import { useState, useEffect, useRef } from 'react';
import Navbar from '../components/Layout/Navbar';
import Footer from '../components/Layout/Footer';
import SearchForm from '../components/Features/SearchForm';
import ResultsTable from '../components/Features/ResultsTable';
import LogConsole from '../components/Features/LogConsole';
import { docuwareService } from '../services/docuwareService';
import { FaDownload, FaFolderOpen, FaSync, FaStop, FaPlay } from 'react-icons/fa';

const DownloadPage = () => {
    const [results, setResults] = useState([]);
    const [totalDocs, setTotalDocs] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const [logs, setLogs] = useState([]);
    const [cabinetId, setCabinetId] = useState('');

    // Bulk Download State
    const [selectedIds, setSelectedIds] = useState([]);
    const [destinationHandle, setDestinationHandle] = useState(null);
    const [folderName, setFolderName] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
    const cancelDownloadRef = useRef(false);

    // Round-Trip Monitor State
    const [monitorHandle, setMonitorHandle] = useState(null);
    const [monitorFolderName, setMonitorFolderName] = useState('');
    const [isMonitoring, setIsMonitoring] = useState(false);
    const monitorIntervalRef = useRef(null);

    // -- NEW: Track failed attempts --
    const failedUploads = useRef({});

    const addLog = (message) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
    };

    const handleCabinetSelect = async (selectedCabinetId) => {
        try {
            setCabinetId(selectedCabinetId);
            setResults([]); // Clear previous results
            setTotalDocs(0);
            setSelectedIds([]); // Clear selection

            if (selectedCabinetId) {
                addLog(`Cabinet selected: ${selectedCabinetId}. Fetching total count...`);
                const count = await docuwareService.getCabinetCount(selectedCabinetId);
                setTotalCount(count);
                addLog(`Total documents in cabinet: ${count}`);
            } else {
                setTotalCount(0);
            }
        } catch (error) {
            console.error('Error fetching cabinet count:', error);
            addLog(`❌ Error fetching total count: ${error.message}`);
        }
    };

    const handleSearch = async (selectedCabinetId, filters) => {
        try {
            if (selectedCabinetId !== cabinetId) {
                setCabinetId(selectedCabinetId);
            }
            setSelectedIds([]); // Clear selection on new search
            addLog(`Searching cabinet ${selectedCabinetId} with ${filters.length} filter(s)...`);

            if (filters.length > 0) {
                filters.forEach(f => {
                    addLog(`  - ${f.fieldName} = "${f.value}"`);
                });
            }

            const response = await docuwareService.searchDocuments(selectedCabinetId, filters);
            setResults(response.items);
            setTotalDocs(response.total);
            addLog(`✅ Found ${response.items.length} documents (Total available: ${response.total})`);
        } catch (error) {
            addLog(`❌ Search failed: ${error.message}`);
            console.error('Search error:', error);
        }
    };

    const handleSelectionChange = (newSelectedIds) => {
        setSelectedIds(newSelectedIds);
    };

    const verifyPermission = async (fileHandle, readWrite) => {
        const options = {};
        if (readWrite) {
            options.mode = 'readwrite';
        }
        // Check if permission was already granted. If so, return true.
        if ((await fileHandle.queryPermission(options)) === 'granted') {
            return true;
        }
        // Request permission. If the user grants permission, return true.
        if ((await fileHandle.requestPermission(options)) === 'granted') {
            return true;
        }
        // The user didn't grant permission, so return false.
        return false;
    };

    const handleSelectFolder = async () => {
        try {
            if (!window.showDirectoryPicker) {
                alert("Your browser does not support the File System Access API. Please use Chrome, Edge, or Opera.");
                return;
            }

            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setDestinationHandle(handle);
            setFolderName(handle.name);
            addLog(`📁 Folder selected for Download: ${handle.name}`);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error selecting folder:', error);
                addLog(`❌ Error selecting folder: ${error.message}`);
            }
        }
    };

    const handleBulkDownload = async () => {
        if (!destinationHandle) {
            alert('Please select a destination folder first.');
            return;
        }

        if (selectedIds.length === 0) {
            alert('Please select at least one document to download.');
            return;
        }

        const hasPermission = await verifyPermission(destinationHandle, true);
        if (!hasPermission) {
            alert('Permission to write to the selected folder was denied.');
            return;
        }

        setIsDownloading(true);
        cancelDownloadRef.current = false; // Reset cancel flag
        setDownloadProgress({ current: 0, total: selectedIds.length });
        addLog(`⬇️ Starting bulk download of ${selectedIds.length} documents...`);

        try {
            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < selectedIds.length; i++) {
                // Check if download was cancelled
                if (cancelDownloadRef.current) {
                    addLog(`⏹️ Download cancelled by user at ${i}/${selectedIds.length}`);
                    break;
                }

                const id = selectedIds[i];
                const doc = results.find(r => r.Id === id);
                const title = doc?.Title || doc?.Id || `document_${id}`;

                // Sanitize filename for local system, but keep unique identifiers
                // Format: {DOC_ID}___{CABINET_ID}___{ORIGINAL_NAME}.pdf
                const safeName = title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
                const filename = `${id}___${cabinetId}___${safeName}.pdf`;

                setDownloadProgress({ current: i + 1, total: selectedIds.length });

                try {
                    // Fetch blob
                    const blob = await docuwareService.downloadDocument(cabinetId, id);

                    // Write to file
                    const fileHandle = await destinationHandle.getFileHandle(filename, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();

                    successCount++;
                    addLog(`  ✅ Saved: ${filename}`);
                } catch (err) {
                    console.error(`Failed to download ${id}:`, err);
                    failCount++;
                    addLog(`  ❌ Failed: ${filename} - ${err.message}`);
                }
            }

            if (cancelDownloadRef.current) {
                addLog(`🛑 Download cancelled. Completed: ${successCount}, Failed: ${failCount}, Remaining: ${selectedIds.length - successCount - failCount}`);
                alert(`Download cancelled!\n\nCompleted: ${successCount}\nFailed: ${failCount}\nCancelled: ${selectedIds.length - successCount - failCount}`);
            } else {
                addLog(`🎉 Download complete. Success: ${successCount}, Failed: ${failCount}`);
                if (failCount === 0) {
                    alert('All files downloaded successfully!');
                } else {
                    alert(`Download complete with errors. Success: ${successCount}, Failed: ${failCount}`);
                }
            }

        } catch (error) {
            console.error('Bulk download error:', error);
            addLog(`❌ Critical error during bulk download: ${error.message}`);
        } finally {
            setIsDownloading(false);
            setDownloadProgress({ current: 0, total: 0 });
            cancelDownloadRef.current = false;
        }
    };

    const handleCancelDownload = () => {
        cancelDownloadRef.current = true;
        addLog('🛑 Cancelling download...');
    };

    // --- Round Trip Monitoring ---

    const handleSelectMonitorFolder = async () => {
        try {
            if (!window.showDirectoryPicker) {
                alert("Your browser does not support the File System Access API.");
                return;
            }
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setMonitorHandle(handle);
            setMonitorFolderName(handle.name);
            addLog(`📁 Folder selected for Monitoring: ${handle.name}`);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error selecting monitor folder:', error);
                addLog(`❌ Error selecting monitor folder: ${error.message}`);
            }
        }
    };

    // Monitoring Statistics
    const [monitorStats, setMonitorStats] = useState({ success: 0, error: 0 });

    // Monitoring Metadata Update State
    const [availableFields, setAvailableFields] = useState([]);
    const [updateField, setUpdateField] = useState('');
    const [updateValue, setUpdateValue] = useState('');

    // Fetch fields when cabinetId changes (for the dropdown)
    useEffect(() => {
        const fetchFields = async () => {
            if (!cabinetId) {
                setAvailableFields([]);
                return;
            }
            try {
                const fields = await docuwareService.getCabinetFields(cabinetId);
                // Sort fields alphabetically by DisplayName or Name
                if (fields) {
                    fields.sort((a, b) => (a.DisplayName || a.Name).localeCompare(b.DisplayName || b.Name));
                }
                setAvailableFields(fields || []);
            } catch (err) {
                console.error("Failed to fetch fields for cabinet:", err);
                addLog(`⚠️ Failed to load fields list: ${err.message}`);
            }
        };
        fetchFields();
    }, [cabinetId]);

    // Idle Timer (to stop automatically if empty for 1 min)
    const lastActivityRef = useRef(Date.now());

    const startMonitoring = async () => {
        if (!monitorHandle) {
            alert('Please select a folder to monitor.');
            return;
        }

        const hasPermission = await verifyPermission(monitorHandle, true);
        if (!hasPermission) {
            alert('Permission to read/write the monitor folder is required.');
            return;
        }

        setIsMonitoring(true);
        setMonitorStats({ success: 0, error: 0 }); // Reset stats
        addLog(`👀 Starting monitoring of folder: ${monitorFolderName}...`);
        addLog(`⏳ Will auto-stop if no files found for 5 minutes.`);

        // Clear previous failure history & Reset activity timer
        failedUploads.current = {};
        lastActivityRef.current = Date.now();

        monitorIntervalRef.current = setInterval(async () => {
            await checkFolderForUploads();
        }, 5000); // Check every 5 seconds
    };

    const stopMonitoring = () => {
        setIsMonitoring(false);
        if (monitorIntervalRef.current) {
            clearInterval(monitorIntervalRef.current);
            monitorIntervalRef.current = null;
        }
        addLog('⏹️ Monitoring stopped.');

        // Show final stats alert
        // We use a timeout to let the state update or just read from current logs (but state is easier)
        // Since state updates are async, we might not get the absolute latest if a race happens, 
        // but for a stop action it's generally fine.
        setTimeout(() => {
            alert(`Monitoramento Finalizado.\n\n✅ Sucessos: ${monitorStats.success}\n❌ Erros: ${monitorStats.error}`);
        }, 500);
    };

    // Processing Lock to prevent race conditions
    const isProcessingRef = useRef(false);

    // Helper to "move" file (Copy + Delete) for File System Access API
    const moveFile = async (sourceDir, destDir, filename) => {
        try {
            const sourceFileHandle = await sourceDir.getFileHandle(filename);
            const file = await sourceFileHandle.getFile();

            const destFileHandle = await destDir.getFileHandle(filename, { create: true });
            const writable = await destFileHandle.createWritable();
            await writable.write(file);
            await writable.close();

            await sourceDir.removeEntry(filename);
            return true;
        } catch (error) {
            console.error(`Error moving file ${filename}:`, error);
            throw error;
        }
    };

    const checkFolderForUploads = async () => {
        if (!monitorHandle || isProcessingRef.current) return;

        isProcessingRef.current = true;
        try {
            // Ensure destination folders exist
            const successDir = await monitorHandle.getDirectoryHandle('Processados', { create: true });
            const errorDir = await monitorHandle.getDirectoryHandle('Erros', { create: true });

            let filesProcessedInThisCycle = 0;

            for await (const entry of monitorHandle.values()) {
                if (entry.kind === 'file') {
                    // Check regex: start with digits, then ___, then text
                    const match = entry.name.match(/^(\d+)___(.+)___(.+)\.pdf$/i);

                    if (match) {
                        filesProcessedInThisCycle++; // Mark activity

                        const filename = entry.name;

                        // Check retry limit
                        if (failedUploads.current[filename] && failedUploads.current[filename] >= 3) {
                            addLog(`⚠️ ${filename} failed 3 times. Moving to 'Erros' folder.`);
                            try {
                                await moveFile(monitorHandle, errorDir, filename);
                                addLog(`   📂 Moved to /Erros`);
                                setMonitorStats(prev => ({ ...prev, error: prev.error + 1 })); // Increment Error
                                delete failedUploads.current[filename]; // Stop tracking
                            } catch (moveErr) {
                                addLog(`   ❌ Failed to move to Error folder: ${moveErr.message}`);
                            }
                            continue;
                        }

                        const docId = match[1];
                        const fileCabinetId = match[2];

                        addLog(`🔎 Detected file for replacement: ${filename}`);
                        addLog(`   ID: ${docId}, Cabinet: ${fileCabinetId}`);

                        try {
                            // Check if file still exists
                            try {
                                await monitorHandle.getFileHandle(filename);
                            } catch (e) {
                                console.warn("File vanished before processing:", filename);
                                continue;
                            }

                            const file = await entry.getFile();
                            addLog(`   📤 Uploading replacement for ID ${docId}...`);

                            await docuwareService.uploadReplacement(fileCabinetId, docId, file);
                            addLog(`   ✅ Upload successful!`);

                            // Metadata Update Logic
                            if (updateField && updateValue) {
                                try {
                                    addLog(`   📝 Updating metadata: ${updateField} = "${updateValue}"...`);
                                    await docuwareService.updateDocumentFields(fileCabinetId, docId, updateField, updateValue);
                                    addLog(`   ✅ Metadata updated.`);
                                } catch (metaErr) {
                                    console.error("Metadata update failed:", metaErr);
                                    addLog(`   ⚠️ Metadata update failed: ${metaErr.message} (File upload was successful)`);
                                }
                            }

                            addLog(`   🚚 Moving to 'Processados'...`);

                            // Move processed file
                            try {
                                await moveFile(monitorHandle, successDir, filename);
                                addLog(`   📂 Moved to /Processados`);
                                setMonitorStats(prev => ({ ...prev, success: prev.success + 1 })); // Increment Success
                                delete failedUploads.current[filename];
                            } catch (moveErr) {
                                if (moveErr.name === 'NotFoundError') {
                                    addLog(`   ℹ️ File already gone (race condition avoiding).`);
                                } else {
                                    throw moveErr;
                                }
                            }

                        } catch (err) {
                            console.error(`Failed to process ${entry.name}:`, err);
                            addLog(`   ❌ Error processing ${entry.name}: ${err.message}`);

                            failedUploads.current[filename] = (failedUploads.current[filename] || 0) + 1;
                            addLog(`   🔄 Retry count: ${failedUploads.current[filename]}/3`);
                        }
                    }
                }
            }

            // --- Idle Check Logic ---
            if (filesProcessedInThisCycle > 0) {
                lastActivityRef.current = Date.now(); // Reset timer if we did work
            } else {
                const idleTime = Date.now() - lastActivityRef.current;
                if (idleTime > 300000) { // 5 minutes (300,000 ms)
                    addLog('💤 No files found for 5 minutes. Finishing job automatically.');
                    // Don't call stopMonitoring directly here to avoid state closure issues with alert,
                    // but we can just trigger it. The stats state will be whatever it is.
                    stopMonitoring();
                }
            }

        } catch (error) {
            console.error('Error checking folder:', error);
        } finally {
            isProcessingRef.current = false;
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (monitorIntervalRef.current) {
                clearInterval(monitorIntervalRef.current);
            }
        };
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-base-200">
            <Navbar />

            <main className="flex-1 container mx-auto p-4">
                <div className="flex items-center gap-3 mb-6">
                    <FaDownload className="w-6 h-6 text-primary" />
                    <h1 className="text-3xl font-bold">Baixar Arquivos</h1>
                </div>

                {/* Split View: Search & Logs */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Left Column: Search */}
                    <div className="flex flex-col gap-4">
                        <SearchForm
                            onSearch={handleSearch}
                            onLog={addLog}
                            totalCount={totalCount}
                            onCabinetChange={handleCabinetSelect}
                        />
                    </div>

                    {/* Right Column: Logs */}
                    <div className="h-full max-h-[220px]">
                        <LogConsole logs={logs} />
                    </div>
                </div>

                {/* Bulk Download Controls */}
                <div className="card bg-base-100 shadow-xl mb-4">
                    <div className="card-body py-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-lg">1. Download em Massa</h3>
                                <div className="badge badge-neutral">
                                    {selectedIds.length} selecionado{selectedIds.length !== 1 ? 's' : ''}
                                </div>
                            </div>

                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-2 bg-base-200 px-3 py-2 rounded-lg">
                                    <span className="text-sm font-medium">Pasta:</span>
                                    <span className="text-sm truncate max-w-[200px]" title={folderName || "Nenhuma selecionada"}>
                                        {folderName || "Nenhuma selecionada"}
                                    </span>
                                    <button
                                        className="btn btn-xs btn-ghost btn-circle"
                                        onClick={handleSelectFolder}
                                        title="Selecionar Pasta"
                                    >
                                        <FaFolderOpen />
                                    </button>
                                </div>

                                <button
                                    className="btn btn-outline btn-sm gap-2"
                                    onClick={() => setSelectedIds(results.map(r => r.Id))}
                                    disabled={results.length === 0}
                                    title="Selecionar todos os documentos encontrados"
                                >
                                    ☑️ Selecionar Todos ({results.length})
                                </button>

                                <button
                                    className="btn btn-primary gap-2"
                                    disabled={selectedIds.length === 0 || !destinationHandle || isDownloading}
                                    onClick={handleBulkDownload}
                                >
                                    {isDownloading ? (
                                        <span className="loading loading-spinner loading-xs"></span>
                                    ) : (
                                        <FaDownload />
                                    )}
                                    {isDownloading
                                        ? `Baixando (${downloadProgress.current}/${downloadProgress.total})`
                                        : 'Baixar Selecionados'}
                                </button>

                                {isDownloading && (
                                    <button
                                        className="btn btn-error gap-2"
                                        onClick={handleCancelDownload}
                                    >
                                        <FaStop /> Cancelar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Round-Trip Upload Controls */}
                <div className="card bg-base-100 shadow-xl mb-4 border-l-4 border-secondary">
                    <div className="card-body py-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-lg">2. Upload de Retorno</h3>
                                <div className="badge badge-neutral">
                                    Sucesso: {monitorStats.success} | Erros: {monitorStats.error}
                                </div>
                                {isMonitoring && <span className="loading loading-ring loading-md text-secondary"></span>}
                            </div>

                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-2 bg-base-200 px-3 py-2 rounded-lg">
                                    <span className="text-sm font-medium">Pasta Monitorada:</span>
                                    <span className="text-sm truncate max-w-[200px]" title={monitorFolderName || "Nenhuma selecionada"}>
                                        {monitorFolderName || "Nenhuma selecionada"}
                                    </span>
                                    <button
                                        className="btn btn-xs btn-ghost btn-circle"
                                        onClick={handleSelectMonitorFolder}
                                        title="Selecionar Pasta para Monitorar"
                                        disabled={isMonitoring}
                                    >
                                        <FaFolderOpen />
                                    </button>
                                </div>

                                {!isMonitoring ? (
                                    <button
                                        className="btn btn-secondary gap-2"
                                        onClick={startMonitoring}
                                        disabled={!monitorHandle}
                                    >
                                        <FaPlay /> Iniciar Monitoramento
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-error gap-2 text-white"
                                        onClick={stopMonitoring}
                                    >
                                        <FaStop /> Parar
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Metadata Update Options */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 p-2 bg-base-200 rounded-lg">
                            <div className="form-control w-full">
                                <label className="label py-1">
                                    <span className="label-text text-xs font-medium">Atualizar Campo (Opcional):</span>
                                </label>
                                <select
                                    className="select select-bordered select-sm w-full text-xs"
                                    value={updateField}
                                    onChange={(e) => setUpdateField(e.target.value)}
                                    disabled={isMonitoring}
                                >
                                    <option value="">-- Não atualizar metadados --</option>
                                    {availableFields.map((field) => (
                                        <option key={field.DBName || field.Name} value={field.DBName || field.Name}>
                                            {field.DisplayName || field.Name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-control w-full">
                                <label className="label py-1">
                                    <span className="label-text text-xs font-medium">Valor a Gravar:</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ex: PROCESSADO"
                                    className="input input-bordered input-sm w-full text-xs"
                                    value={updateValue}
                                    onChange={(e) => setUpdateValue(e.target.value)}
                                    disabled={!updateField || isMonitoring}
                                />
                            </div>
                        </div>


                    </div>
                </div>

                <ResultsTable
                    results={results}
                    totalDocs={totalDocs}
                    cabinetId={cabinetId}
                    selectable={true}
                    selectedIds={selectedIds}
                    onSelectionChange={handleSelectionChange}
                />
            </main>

            <Footer />
        </div>
    );
};

export default DownloadPage;

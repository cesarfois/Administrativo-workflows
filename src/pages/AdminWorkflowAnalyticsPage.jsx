import { useState, useEffect } from 'react';
import Navbar from '../components/Layout/Navbar';
import Footer from '../components/Layout/Footer';
import { adminWorkflowService } from '../services/adminWorkflowService';
import { FaSitemap, FaSync, FaTasks, FaShieldAlt, FaCopy } from 'react-icons/fa';
import WorkflowDetailsModal from '../components/Dashboard/WorkflowDetailsModal';

const AdminWorkflowAnalyticsPage = () => {
    const [workflows, setWorkflows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [countProgress, setCountProgress] = useState({ current: 0, total: 0 }); // Phase 1
    const [enrichProgress, setEnrichProgress] = useState({ current: 0, total: 0 }); // Phase 2
    const [loadingStatus, setLoadingStatus] = useState('Iniciando...');
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [showOnlyActive, setShowOnlyActive] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedWorkflow, setSelectedWorkflow] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    const fetchWorkflows = async (signal) => {
        try {
            setError(null);
            setLoading(true);
            setLoadingStatus('Contando tarefas e instâncias...');
            setCountProgress({ current: 0, total: 0 });
            setEnrichProgress({ current: 0, total: 0 });
            console.log('[AdminWorkflowAnalyticsPage] Fetching workflows with ADMIN access...');

            const data = await adminWorkflowService.getWorkflowsWithCounts(
                signal,
                (current, total) => {
                    setCountProgress({ current, total });
                }
            );

            // Step 2: Load File Cabinet Map (One Request!)
            setLoadingStatus('Carregando mapa de armários...');
            console.log('[AdminWorkflowAnalyticsPage] 📂 Loading File Cabinet Map...');
            const fcMap = await adminWorkflowService.getFileCabinetMap();

            // Step 3: Enrich workflows using the Map (BATCHED to avoid timeouts)
            // Step 3: Enrich workflows using the Map (BATCHED to avoid timeouts)
            setLoadingStatus('Identificando armários dos workflows...');
            setEnrichProgress({ current: 0, total: data.length });
            console.log(`[AdminWorkflowAnalyticsPage] 📂 Enriching ${data.length} workflows...`);

            const batchSize = 5;
            const enrichedData = [];

            for (let i = 0; i < data.length; i += batchSize) {
                if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
                const batch = data.slice(i, i + batchSize);
                const batchResults = await Promise.all(
                    batch.map(async (workflow) => {
                        try {
                            const details = await adminWorkflowService.getWorkflowDetails(workflow.id);
                            const fcId = details?.FileCabinetId || null;

                            return {
                                ...workflow,
                                fileCabinetId: fcId,
                                fileCabinetName: fcId ? (fcMap[fcId] || 'Unknown FC') : null
                            };
                        } catch (error) {
                            return {
                                ...workflow,
                                fileCabinetId: null,
                                fileCabinetName: null
                            };
                        }
                    })
                );
                enrichedData.push(...batchResults);

                // Update progress manually
                setEnrichProgress({ current: enrichedData.length, total: data.length });
                console.log(`[AdminWorkflowAnalyticsPage] ⏳ Processed ${enrichedData.length}/${data.length}...`);
            }

            console.log('[AdminWorkflowAnalyticsPage] 🔍 First workflow after enrichment:', enrichedData[0]);

            // Map to consistent structure - using name and id from enrichedData
            // EnrichedData has lowercase properties from getWorkflowsWithCounts + our new FC props
            const mappedData = enrichedData.map(wf => ({
                id: wf.id || wf.Id,
                name: wf.name || wf.Name || wf.id || wf.Id || 'Unnamed Workflow',
                description: wf.description || wf.Description || '',
                activeInstanceCount: wf.activeInstanceCount || wf.InstanceCount || 0,
                fileCabinetId: wf.fileCabinetId,
                fileCabinetName: wf.fileCabinetName
            }));

            // Sort by Name A-Z by default for better visibility
            const sortedData = mappedData.sort((a, b) =>
                (a.name || '').localeCompare(b.name || '')
            );

            setWorkflows(sortedData);

            console.log('[AdminWorkflowAnalyticsPage] Loaded ' + sortedData.length + ' workflows (ADMIN)');
            console.log('[AdminWorkflowAnalyticsPage] 🔍 Sample final workflow:', sortedData[0]);
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[AdminWorkflowAnalyticsPage] Fetch cancelled');
                return;
            }
            console.error('[AdminWorkflowAnalyticsPage] ❌ Error loading workflows:', err);
            setError(err.message || 'Erro ao carregar workflows. Verifique a configuração da API Key de administrador.');
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
                setRefreshing(false);
                setCountProgress({ current: 0, total: 0 });
                setEnrichProgress({ current: 0, total: 0 });
            }
        }
    };

    useEffect(() => {
        const controller = new AbortController();
        fetchWorkflows(controller.signal);

        return () => {
            console.log('[AdminWorkflowAnalyticsPage] Unmounting/Cleanup - Cancelling fetch');
            controller.abort();
        };
    }, []);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchWorkflows();
    };

    const getTotalInstances = () => {
        return workflows.reduce((sum, wf) => sum + wf.activeInstanceCount, 0);
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    const handleWorkflowClick = async (workflow) => {
        setSelectedWorkflow({ ...workflow, tasks: [], loadingTasks: true });
        setShowDetailsModal(true);

        try {
            console.log(`[AdminWorkflowAnalyticsPage] Loading tasks for workflow: ${workflow.id}`);

            // FC ID and Name already loaded during initial fetch
            const fileCabinetId = workflow.fileCabinetId;
            const fileCabinetName = workflow.fileCabinetName;

            console.log(`[AdminWorkflowAnalyticsPage] 📂 Using FC: ${fileCabinetName} (${fileCabinetId})`);

            const tasks = await adminWorkflowService.getWorkflowTasks(workflow.id);
            console.log(`[AdminWorkflowAnalyticsPage] Loaded ${tasks.length} tasks for ${workflow.id}`);

            // Pass File Cabinet info to modal
            setSelectedWorkflow({
                ...workflow,
                tasks,
                loadingTasks: false,
                fileCabinetId: fileCabinetId,
                fileCabinetName: fileCabinetName
            });
        } catch (error) {
            console.error('[AdminWorkflowAnalyticsPage] Error loading tasks:', error);
            setSelectedWorkflow({ ...workflow, tasks: [], loadingTasks: false, error: error.message });
        }
    };

    const handleCloseModal = () => {
        setShowDetailsModal(false);
        setSelectedWorkflow(null);
    };

    // Filter logic
    const filteredWorkflows = workflows.filter(w => {
        const name = w.name || w.id;
        const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            w.id.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesActive = showOnlyActive ? w.activeInstanceCount > 0 : true;

        return matchesSearch && matchesActive;
    });

    return (
        <div className="min-h-screen flex flex-col bg-base-200">
            <Navbar />

            <main className="flex-1 container mx-auto p-4">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <FaShieldAlt className="w-6 h-6 text-error" />
                        <h1 className="text-3xl font-bold">Análise Administrativa de Workflows</h1>
                    </div>

                    <button
                        onClick={handleRefresh}
                        disabled={loading || refreshing}
                        className={`btn btn-error btn-sm gap-2 ${refreshing ? 'loading' : ''}`}
                    >
                        {!refreshing && !loading && <FaSync />}
                        Atualizar
                    </button>
                </div>

                {/* Admin Warning Banner */}
                <div className="alert alert-warning shadow-lg mb-6">
                    <FaShieldAlt className="w-5 h-5" />
                    <div>
                        <h3 className="font-bold">⚠️ Acesso Administrativo Global</h3>
                        <div className="text-sm">
                            Esta visão utiliza suas credenciais de usuário para acessar os endpoints administrativos do sistema.
                        </div>
                    </div>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <span className="loading loading-spinner loading-lg text-error mb-4"></span>
                        <p className="text-lg font-bold mb-2">Carregando dados globais...</p>

                        {/* Phase 1: Counting Tasks */}
                        {countProgress.total > 0 && (
                            <div className="w-full max-w-md mb-4 bg-base-100 p-3 rounded-lg shadow-sm">
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-semibold">Fase 1: Contando Tarefas</span>
                                    <span className="font-mono">{countProgress.current}/{countProgress.total} workflows</span>
                                </div>
                                <progress
                                    className={`progress w-full ${countProgress.current === countProgress.total ? 'progress-success' : 'progress-error'}`}
                                    value={countProgress.current}
                                    max={countProgress.total}
                                ></progress>
                            </div>
                        )}

                        {/* Phase 2: Enriching with FC Maps */}
                        {enrichProgress.total > 0 && (
                            <div className="w-full max-w-md bg-base-100 p-3 rounded-lg shadow-sm">
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-semibold">Fase 2: Identificando Armários</span>
                                    <span className="font-mono">{enrichProgress.current}/{enrichProgress.total}</span>
                                </div>
                                <progress
                                    className="progress progress-info w-full"
                                    value={enrichProgress.current}
                                    max={enrichProgress.total}
                                ></progress>
                                <p className="text-xs text-center mt-2 opacity-70">
                                    {Math.round((enrichProgress.current / enrichProgress.total) * 100)}% processado
                                </p>
                            </div>
                        )}

                        {countProgress.total === 0 && enrichProgress.total === 0 && (
                            <p className="text-sm opacity-70">Iniciando contagem de tarefas...</p>
                        )}
                    </div>
                )}

                {/* Error State */}
                {error && !loading && (
                    <div className="alert alert-error shadow-lg mb-6">
                        <div>
                            <h3 className="font-bold">Erro ao carregar workflows (Admin)</h3>
                            <div className="text-sm">{error}</div>
                        </div>
                    </div>
                )}

                {/* Content */}
                {!loading && !error && workflows.length > 0 && (
                    <>
                        {/* Summary Cards */}
                        <div className="stats shadow mb-6 w-full border-2 border-error">
                            <div className="stat">
                                <div className="stat-figure text-error">
                                    <FaSitemap className="w-8 h-8" />
                                </div>
                                <div className="stat-title">Total de Workflows</div>
                                <div className="stat-value text-error">{filteredWorkflows.length}</div>
                                <div className="stat-desc">
                                    {showOnlyActive
                                        ? `${filteredWorkflows.length} ativos de ${workflows.length} total`
                                        : 'Disponíveis no sistema'
                                    }
                                </div>
                            </div>

                            <div className="stat">
                                <div className="stat-figure text-warning">
                                    <FaTasks className="w-8 h-8" />
                                </div>
                                <div className="stat-title">Instâncias Ativas</div>
                                <div className="stat-value text-warning">{getTotalInstances()}</div>
                                <div className="stat-desc">Total de tarefas pendentes</div>
                            </div>
                        </div>

                        {/* Search and Filter */}
                        <div className="flex flex-col md:flex-row items-center gap-4 mb-6">
                            <input
                                type="text"
                                placeholder="Buscar workflow..."
                                className="input input-bordered input-sm w-full md:w-64"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <label className="cursor-pointer label gap-2">
                                <span className="label-text font-semibold whitespace-nowrap">Apenas Ativos</span>
                                <input
                                    type="checkbox"
                                    className="toggle toggle-error"
                                    checked={showOnlyActive}
                                    onChange={() => setShowOnlyActive(!showOnlyActive)}
                                />
                            </label>
                        </div>

                        {/* Workflows Table */}
                        <div className="overflow-x-auto shadow-xl rounded-lg border border-base-200 bg-base-100">
                            <table className="table table-zebra w-full">
                                <thead className="bg-base-200">
                                    <tr>
                                        <th>Workflow</th>
                                        <th>ID do Workflow</th>
                                        <th>Armário</th>
                                        <th>GUID do Armário</th>
                                        <th className="text-center">Instâncias Ativas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredWorkflows.map((workflow) => (
                                        <tr
                                            key={workflow.id}
                                            onClick={() => handleWorkflowClick(workflow)}
                                            className="hover:bg-base-200 cursor-pointer transition-colors"
                                        >
                                            <td>
                                                <div className="flex items-center space-x-3">
                                                    <div className="avatar placeholder">
                                                        <div className="mask mask-squircle w-10 h-10 bg-error/10 text-error">
                                                            <FaSitemap />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="font-bold">{workflow.name}</div>
                                                        <div className="text-sm opacity-50 truncate max-w-md" title={workflow.description}>
                                                            {workflow.description || 'Sem descrição'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <code className="text-xs bg-base-200 px-2 py-1 rounded">{workflow.id}</code>
                                                    <button
                                                        className="btn btn-ghost btn-xs"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            copyToClipboard(workflow.id);
                                                        }}
                                                        title="Copiar ID"
                                                    >
                                                        <FaCopy />
                                                    </button>
                                                </div>
                                            </td>
                                            <td>
                                                {workflow.fileCabinetName ? (
                                                    <span className="font-medium">{workflow.fileCabinetName}</span>
                                                ) : (
                                                    <span className="text-base-content/50 text-xs">N/A</span>
                                                )}
                                            </td>
                                            <td>
                                                {workflow.fileCabinetId ? (
                                                    <code className="text-xs bg-base-200 px-2 py-1 rounded">
                                                        {workflow.fileCabinetId}
                                                    </code>
                                                ) : (
                                                    <span className="text-base-content/50 text-xs">N/A</span>
                                                )}
                                            </td>
                                            <td className="text-center">
                                                <div className={`badge badge-lg ${workflow.activeInstanceCount > 0 ? 'badge-error text-white' : 'badge-ghost'}`}>
                                                    {workflow.activeInstanceCount}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* Empty State */}
                {!loading && !error && workflows.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <FaSitemap className="w-20 h-20 text-base-content/20 mb-4" />
                        <h2 className="text-2xl font-bold text-base-content/60 mb-2">
                            Nenhum Workflow Encontrado
                        </h2>
                        <p className="text-base-content/50">
                            Não há workflows disponíveis no sistema.
                        </p>
                    </div>
                )}
            </main>

            <Footer />

            {/* Workflow Details Modal */}
            <WorkflowDetailsModal
                workflow={selectedWorkflow}
                isOpen={showDetailsModal}
                onClose={handleCloseModal}
            />
        </div>
    );
};

export default AdminWorkflowAnalyticsPage;

import { useState, useEffect } from 'react';
import Navbar from '../components/Layout/Navbar';
import Footer from '../components/Layout/Footer';
import { adminWorkflowService } from '../services/adminWorkflowService';
import { FaSitemap, FaSync, FaTasks, FaShieldAlt } from 'react-icons/fa';

const AdminWorkflowAnalyticsPage = () => {
    const [workflows, setWorkflows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    // Default to false to show ALL workflows (even those with 0 instances)
    const [showOnlyActive, setShowOnlyActive] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchWorkflows = async (signal) => {
        try {
            setError(null);
            setLoading(true);
            console.log('[AdminWorkflowAnalyticsPage] Fetching workflows with ADMIN access...');

            const data = await adminWorkflowService.getWorkflowsWithCounts(signal);

            // Sort by Name A-Z by default for better visibility
            const sortedData = data.sort((a, b) => a.name.localeCompare(b.name));

            setWorkflows(sortedData);

            console.log('[AdminWorkflowAnalyticsPage] Loaded ' + data.length + ' workflows (ADMIN)');
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[AdminWorkflowAnalyticsPage] Fetch cancelled');
                return;
            }
            console.error('[AdminWorkflowAnalyticsPage] ❌ Error loading workflows:', err);
            setError(err.message || 'Erro ao carregar workflows. Verifique a configuração da API Key de administrador.');
        } finally {
            // Only stop loading if not aborted (or if we want to reset UI)
            if (!signal?.aborted) {
                setLoading(false);
                setRefreshing(false);
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
        fetchWorkflows(); // No signal for manual refresh, or create new one if needed, but manual usually single instance
    };

    const getTotalInstances = () => {
        return workflows.reduce((sum, wf) => sum + wf.activeInstanceCount, 0);
    };

    // Filter logic: Active Only checkbox AND Search Term
    const filteredWorkflows = workflows.filter(w => {
        const matchesActive = showOnlyActive ? w.activeInstanceCount > 0 : true;
        const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            w.id.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesActive && matchesSearch;
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

                    <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                        {/* Search Input */}
                        <input
                            type="text"
                            placeholder="Buscar workflow..."
                            className="input input-bordered input-sm w-full md:w-64"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />

                        {/* Toggles and Actions */}
                        <div className="flex items-center gap-4">
                            <label className="cursor-pointer label gap-2">
                                <span className="label-text font-semibold whitespace-nowrap">Apenas Ativos</span>
                                <input
                                    type="checkbox"
                                    className="toggle toggle-error"
                                    checked={showOnlyActive}
                                    onChange={() => setShowOnlyActive(!showOnlyActive)}
                                />
                            </label>
                            <button
                                onClick={handleRefresh}
                                disabled={loading || refreshing}
                                className={`btn btn-error btn-sm gap-2 ${refreshing ? 'loading' : ''}`}
                            >
                                {!refreshing && <FaSync />}
                                Atualizar
                            </button>
                        </div>
                    </div>
                </div>

                {/* Admin Warning Banner */}
                <div className="alert alert-warning shadow-lg mb-6">
                    <FaShieldAlt className="w-5 h-5" />
                    <div>
                        <h3 className="font-bold">⚠️ Acesso Administrativo Global</h3>
                        <div className="text-sm">
                            Esta visão utiliza suas credenciais de usuário para acessar os endpoints administrativos do sistema.
                            <br />
                            <strong>Nota:</strong> É necessário ter permissões de administrador no DocuWare.
                        </div>
                    </div>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <span className="loading loading-spinner loading-lg text-error"></span>
                        <p className="mt-4 text-lg font-bold">Carregando dados globais...</p>
                        <p className="text-sm opacity-70">Processando workflows e contando instâncias (pode demorar um pouco)</p>
                    </div>
                )}

                {/* Error State */}
                {error && !loading && (
                    <div className="alert alert-error shadow-lg">
                        <div>
                            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                                <h3 className="font-bold">Erro ao carregar workflows (Admin)</h3>
                                <div className="text-sm">{error}</div>
                                <div className="text-xs mt-2 opacity-75">
                                    💡 Verifique se seu usuário tem permissão para acessar 'ControllerWorkflows' ou tente fazer login novamente.
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Summary Card */}
                {!loading && !error && workflows.length > 0 && (
                    <div className="stats shadow mb-6 w-full border-2 border-error">
                        <div className="stat">
                            <div className="stat-figure text-error">
                                <FaSitemap className="w-8 h-8" />
                            </div>
                            <div className="stat-title">
                                {showOnlyActive ? 'Workflows Ativos (Filtrado)' : 'Total de Workflows (Sistema)'}
                            </div>
                            <div className="stat-value text-error transition-all duration-300">
                                {filteredWorkflows.length}
                            </div>
                            <div className="stat-desc">
                                {showOnlyActive
                                    ? `Exibindo apenas workflows com instâncias (${workflows.length} total)`
                                    : 'Exibindo todos os workflows definidos no sistema'}
                            </div>
                        </div>

                        <div className="stat">
                            <div className="stat-figure text-warning">
                                <FaTasks className="w-8 h-8" />
                            </div>
                            <div className="stat-title">Instâncias Ativas (Global)</div>
                            <div className="stat-value text-warning">{getTotalInstances()}</div>
                            <div className="stat-desc">Total de tarefas em todos os workflows</div>
                        </div>
                    </div>
                )}



                {/* Workflows Table */}
                {!loading && !error && filteredWorkflows.length > 0 && (
                    <div className="overflow-x-auto shadow-xl rounded-lg border border-base-200 bg-base-100">
                        <table className="table table-zebra w-full">
                            {/* head */}
                            <thead className="bg-base-200">
                                <tr>
                                    <th>Workflow</th>
                                    <th>ID</th>
                                    <th className="text-center">Instâncias Ativas</th>
                                    <th>Distribuição</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredWorkflows.map((workflow) => (
                                    <tr key={workflow.id} className="hover">
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
                                        <td className="font-mono text-xs opacity-50">{workflow.id.substring(0, 8)}...</td>
                                        <td className="text-center">
                                            <div className={`badge badge-lg ${workflow.activeInstanceCount > 0 ? 'badge-error text-white' : 'badge-ghost'}`}>
                                                {workflow.activeInstanceCount}
                                            </div>
                                        </td>
                                        <td className="w-48">
                                            {workflow.activeInstanceCount > 0 && (
                                                <div className="flex flex-col gap-1">
                                                    <progress
                                                        className="progress progress-error w-full"
                                                        value={workflow.activeInstanceCount}
                                                        max={getTotalInstances()}
                                                    ></progress>
                                                    <span className="text-xs text-center opacity-60">
                                                        {((workflow.activeInstanceCount / getTotalInstances()) * 100).toFixed(1)}%
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !error && workflows.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <FaSitemap className="w-20 h-20 text-base-content/20 mb-4" />
                        <h2 className="text-2xl font-bold text-base-content/60 mb-2">
                            Nenhum Workflow Encontrado
                        </h2>
                        <p className="text-base-content/50">
                            Não há workflows ativos no sistema no momento.
                        </p>
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
};

export default AdminWorkflowAnalyticsPage;

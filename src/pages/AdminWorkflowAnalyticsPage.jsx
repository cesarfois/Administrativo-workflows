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
    const [showOnlyActive, setShowOnlyActive] = useState(true);

    const fetchWorkflows = async () => {
        try {
            setError(null);
            setLoading(true);
            console.log('[AdminWorkflowAnalyticsPage] Fetching workflows with ADMIN access...');

            const data = await adminWorkflowService.getWorkflowsWithCounts();
            setWorkflows(data);

            console.log(`[AdminWorkflowAnalyticsPage] ✅ Loaded ${data.length} workflows (ADMIN)`);
        } catch (err) {
            console.error('[AdminWorkflowAnalyticsPage] ❌ Error loading workflows:', err);
            setError(err.message || 'Erro ao carregar workflows. Verifique a configuração da API Key de administrador.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchWorkflows();
    }, []);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchWorkflows();
    };

    const getTotalInstances = () => {
        return workflows.reduce((sum, wf) => sum + wf.activeInstanceCount, 0);
    };

    const filteredWorkflows = showOnlyActive
        ? workflows.filter(w => w.activeInstanceCount > 0)
        : workflows;

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
                    <div className="flex items-center gap-4">
                        <label className="cursor-pointer label gap-2">
                            <span className="label-text font-semibold">Apenas Ativos</span>
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

                {/* Workflows Grid */}
                {!loading && !error && filteredWorkflows.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredWorkflows.map((workflow) => (
                            <div key={workflow.id} className="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow border-l-4 border-error">
                                <div className="card-body">
                                    <h2 className="card-title text-lg">
                                        <FaSitemap className="text-error" />
                                        <span className="truncate">{workflow.name}</span>
                                    </h2>

                                    {workflow.description && (
                                        <p className="text-sm text-base-content/70 line-clamp-2 mb-2">
                                            {workflow.description}
                                        </p>
                                    )}

                                    <div className="divider my-2"></div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-base-content/60">
                                            Instâncias Ativas:
                                        </span>
                                        <div className={`badge ${workflow.activeInstanceCount > 0 ? 'badge-error' : 'badge-ghost'} badge-lg`}>
                                            {workflow.activeInstanceCount}
                                        </div>
                                    </div>

                                    {workflow.activeInstanceCount > 0 && (
                                        <div className="mt-2">
                                            <progress
                                                className="progress progress-error w-full"
                                                value={workflow.activeInstanceCount}
                                                max={getTotalInstances()}
                                            ></progress>
                                            <p className="text-xs text-center mt-1 text-base-content/50">
                                                {((workflow.activeInstanceCount / getTotalInstances()) * 100).toFixed(1)}% do total global
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
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

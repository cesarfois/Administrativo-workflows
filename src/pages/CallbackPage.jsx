import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/authService';

const CallbackPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('Processando login...');
    const [error, setError] = useState(null);

    useEffect(() => {
        const processCallback = async () => {
            const code = searchParams.get('code');
            const state = searchParams.get('state'); // Optional: Validate state for security

            if (!code) {
                setError('Nenhum código de autorização encontrado na URL.');
                return;
            }

            try {
                setStatus('Trocando código por token...');
                await authService.exchangeCodeForToken(code);

                setStatus('Login realizado com sucesso! Redirecionando...');
                // Give a small delay for user to see success or just redirect immediately
                setTimeout(() => {
                    navigate('/dashboard');
                }, 500);

            } catch (err) {
                console.error('Callback Error:', err);
                setError(err.message || 'Falha ao processar login.');
            }
        };

        processCallback();
    }, [searchParams, navigate]);

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f4f7f9',
            fontFamily: 'Inter, sans-serif'
        }}>
            <div style={{
                background: 'white',
                padding: '2rem',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                textAlign: 'center',
                maxWidth: '400px'
            }}>
                <h2 style={{ color: '#333', marginBottom: '1rem' }}>Autenticação DocuWare</h2>

                {error ? (
                    <div style={{ color: '#dc3545', marginBottom: '1rem' }}>
                        <p>❌ {error}</p>
                        <button
                            onClick={() => navigate('/')}
                            style={{
                                marginTop: '1rem',
                                padding: '0.5rem 1rem',
                                background: '#002a42',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Voltar ao Login
                        </button>
                    </div>
                ) : (
                    <div>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            border: '4px solid #f3f3f3',
                            borderTop: '4px solid #3498db',
                            borderRadius: '50%',
                            margin: '0 auto 1rem',
                            animation: 'spin 1s linear infinite'
                        }}></div>
                        <p style={{ color: '#666' }}>{status}</p>
                        <style>{`
                            @keyframes spin {
                                0% { transform: rotate(0deg); }
                                100% { transform: rotate(360deg); }
                            }
                        `}</style>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CallbackPage;

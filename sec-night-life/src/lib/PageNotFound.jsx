import { useLocation, useNavigate } from 'react-router-dom';
import * as authService from '@/services/authService';
import { useQuery } from '@tanstack/react-query';


export default function PageNotFound() {
    const location = useLocation();
    const navigate = useNavigate();
    const path = location.pathname;
    const pageName = path.length > 1 ? path.substring(1).split('?')[0] : path;

    const { data: authData, isFetched } = useQuery({
        queryKey: ['user'],
        queryFn: async () => {
            try {
                const user = await authService.getCurrentUser();
                return { user, isAuthenticated: true };
            } catch (error) {
                return { user: null, isAuthenticated: false };
            }
        }
    });
    
    const goHome = () => navigate('/');

    return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
            <div className="max-w-md w-full">
                <div className="text-center space-y-6">
                    {/* 404 Error Code */}
                    <div className="space-y-2">
                        <h1 className="text-7xl font-light" style={{ color: 'var(--sec-text-muted)' }}>404</h1>
                        <div className="h-0.5 w-16 mx-auto" style={{ backgroundColor: 'var(--sec-border)' }}></div>
                    </div>
                    
                    {/* Main Message */}
                    <div className="space-y-3">
                        <h2 className="text-2xl font-medium text-slate-800">
                            Page Not Found
                        </h2>
                        <p className="text-slate-600 leading-relaxed">
                            The page <span className="font-medium text-slate-700">"{pageName}"</span> could not be found in this application.
                        </p>
                    </div>
                    
                    {/* Admin Note */}
                    {isFetched && authData?.isAuthenticated && ['SUPER_ADMIN', 'ADMIN', 'admin'].includes(authData.user?.role) && (
                        <div className="mt-8 p-4 rounded-lg" style={{ backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)' }}>
                            <p className="text-sm text-left" style={{ color: 'var(--sec-text-secondary)' }}>
                                Admin: Check that the URL is correct.
                            </p>
                        </div>
                    )}
                    
                    {/* Action Button */}
                    <div className="pt-6">
                        <button
                            onClick={goHome}
                            className="sec-btn sec-btn-primary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            Go Home
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
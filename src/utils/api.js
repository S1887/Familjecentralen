export const getApiUrl = (endpoint) => {
    // Remove leading slash if present
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

    const pathname = window.location.pathname;
    const hostname = window.location.hostname;
    const port = window.location.port;

    // If we're on port 3001 directly (production serving static), use absolute paths
    if (port === '3001') {
        return '/' + cleanEndpoint;
    }

    // If on port 5173 (Vite dev), use absolute paths (proxy handles routing)
    if (port === '5173') {
        return '/' + cleanEndpoint;
    }

    // Check if running via HA Ingress (local or nabu.casa remote access)
    const isNabuCasa = hostname.includes('nabu.casa');
    const isHALocal = hostname.includes('homeassistant.local') || hostname.includes('supervisor');
    const hasIngressPath = pathname.includes('ingress') || pathname.includes('hassio');

    if (isNabuCasa || isHALocal || hasIngressPath) {
        // For HA ingress, we need to append to the current pathname
        // pathname might be like: /7716521d_ortendahls_familjecentral/ingress
        // We need to return: /7716521d_ortendahls_familjecentral/ingress/api/trash
        const basePath = pathname.replace(/\/+$/, ''); // Remove trailing slashes
        return basePath + '/' + cleanEndpoint;
    }

    // Default fallback
    return '/' + cleanEndpoint;
};

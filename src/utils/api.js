export const getApiUrl = (endpoint) => {
    // Remove leading slash if present
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

    // Check if running in Home Assistant context
    const pathname = window.location.pathname;
    const hostname = window.location.hostname;

    // If we're on port 3001 directly (production serving static), use absolute paths
    if (window.location.port === '3001') {
        return '/' + cleanEndpoint;
    }

    // Check if running via HA Ingress (local or nabu.casa remote access)
    // nabu.casa URLs look like: *.ui.nabu.casa
    const isNabuCasa = hostname.includes('nabu.casa');
    const isHAIngress = pathname.includes('ingress') || pathname.includes('hassio') || isNabuCasa;

    if (isHAIngress) {
        // For HA ingress, use relative path from current location
        // This works because the ingress proxy handles the routing
        return './' + cleanEndpoint;
    }

    // Default fallback - relative to current location
    // Works for Vite dev server (port 5173) via proxy, and most other cases
    return './' + cleanEndpoint;
};

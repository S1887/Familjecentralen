export const getApiUrl = (endpoint) => {
    // Remove leading slash if present
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

    // Check if running in Home Assistant Ingress context
    const pathname = window.location.pathname;

    // If we're on port 3001 directly (production serving static), use absolute paths
    if (window.location.port === '3001') {
        return '/' + cleanEndpoint;
    }

    // If in Ingress, the pathname will contain 'ingress' or similar
    // We need to use the current path as base
    if (pathname.includes('ingress') || pathname.includes('hassio')) {
        // Get the base path up to and including the ingress segment
        const basePath = pathname.replace(/\/+$/, ''); // Remove trailing slashes
        return basePath + '/' + cleanEndpoint;
    }

    // Default fallback - relative to current location
    // Works for Vite dev server (port 5173) via proxy, and most other cases
    return './' + cleanEndpoint;
};

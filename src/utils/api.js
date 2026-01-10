export const getApiUrl = (endpoint) => {
    // Remove leading slash if present
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

    const pathname = window.location.pathname;
    const port = window.location.port;

    // For debugging - remove in future
    // console.log(`[API Debug] Resolving ${endpoint} on port ${port}, path ${pathname}`);

    // If we're on dev ports, use absolute paths
    if (port === '3001') {
        return '/' + cleanEndpoint;
    }
    if (port === '5173') {
        return '/' + cleanEndpoint;
    }

    // Production Ingress (HA, Nabu Casa, etc)
    // We assume the API is mounted at the same base path as the app
    let basePath = pathname.replace(/\/+$/, ''); // Remove trailing slashes

    // Safety check: strip index.html if present (though unlikely in current setup)
    if (basePath.endsWith('/index.html')) {
        basePath = basePath.substring(0, basePath.length - '/index.html'.length);
    }

    const finalUrl = basePath + '/' + cleanEndpoint;
    console.log(`[API] ${endpoint} -> ${finalUrl}`);
    return finalUrl;
};

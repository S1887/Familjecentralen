export const getApiUrl = (endpoint) => {
    // Remove leading slash if present
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

    const port = window.location.port;

    // Dev mode
    if (port === '3001' || port === '5173') {
        const url = '/' + cleanEndpoint;
        console.log(`[API] Dev mode: ${url}`);
        return url;
    }

    // Production / Ingress logic
    // We use document.baseURI which should point to the correct ingress root
    const base = document.baseURI;

    // Ensure we append to the base, effectively treating base as a directory
    const separator = base.endsWith('/') ? '' : '/';
    const finalUrl = `${base}${separator}${cleanEndpoint}`;

    console.log(`[API] Base: ${base} -> Final: ${finalUrl}`);
    return finalUrl;
};

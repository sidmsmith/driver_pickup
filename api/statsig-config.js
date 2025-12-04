// api/statsig-config.js
// Endpoint to provide Statsig Client SDK Key to the client
// This keeps the key server-side and injects it into the page

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get Client SDK Key from environment variable
  // Note: You need STATSIG_CLIENT_KEY (not STATSIG_SERVER_SECRET) for client-side
  const clientKey = process.env.STATSIG_CLIENT_KEY || process.env.STATSIG_CLIENT_SDK_KEY || null;

  if (!clientKey) {
    return res.status(200).json({ 
      key: null,
      error: 'STATSIG_CLIENT_KEY environment variable not set. Please add it in Vercel project settings.',
      note: 'You need a Client SDK Key (starts with "client-"), not a Server Secret (starts with "secret-")'
    });
  }

  // Return the client key
  return res.status(200).json({ 
    key: clientKey,
    note: 'Client SDK Key retrieved successfully'
  });
}


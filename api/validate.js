// api/validate.js
import fetch from 'node-fetch';

const HA_WEBHOOK_URL = "http://sidmsmith.zapto.org:8123/api/webhook/manhattan_driverpickup";
const AUTH_HOST = "salep-auth.sce.manh.com";
const API_HOST = "salep.sce.manh.com";
const CLIENT_ID = "omnicomponent.1.0.0";
const CLIENT_SECRET = process.env.MANHATTAN_SECRET || "b4s8rgTyg55XYNun";
const PASSWORD = process.env.MANHATTAN_PASSWORD || "Blu3sk!es2300";
const USERNAME_BASE = "sdtadmin@";

// Helper: send to HA
async function sendHA(action, org, data = {}) {
  console.log(`[HA] Sending: ${action} | Org: ${org}`);
  try {
    const payload = {
      type: "driver_pickup_action",
      action,
      org: org || "unknown",
      ...data
    };
    const response = await fetch(HA_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log(`[HA] Status: ${response.status}`);
  } catch (e) {
    console.error("[HA] ERROR:", e.message);
  }
}

// Get OAuth token
async function getToken(org) {
  const url = `https://${AUTH_HOST}/oauth/token`;
  const username = `${USERNAME_BASE}${org.toLowerCase()}`;
  const body = new URLSearchParams({
    grant_type: 'password',
    username,
    password: PASSWORD
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
    },
    body
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token;
}

// API call wrapper
async function apiCall(method, path, token, org, body = null) {
  const url = `https://${API_HOST}${path}`;
  // Convert org to uppercase for API consistency (as used in other apps)
  const orgUpper = org ? org.toUpperCase() : org;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    selectedOrganization: orgUpper,
    selectedLocation: `${orgUpper}-DM1`
  };

  const res = await fetch(url, { 
    method, 
    headers, 
    body: body ? JSON.stringify(body) : undefined 
  });
  return res.ok ? await res.json() : { error: await res.text() };
}

// Export handler
export default async function handler(req, res) {
  console.log(`[API] ${req.method} ${req.url}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, org: orgFromBody, shipmentId } = req.body;
  let org = orgFromBody;

  // === APP OPENED (NO ORG) ===
  if (action === 'app_opened') {
    await sendHA("app_opened", "unknown");
    return res.json({ success: true });
  }

  // === AUTHENTICATE ===
  if (action === 'auth') {
    const token = await getToken(org);
    if (!token) {
      await sendHA("auth_failed", org);
      return res.json({ success: false, error: "Auth failed" });
    }
    await sendHA("auth_success", org);
    return res.json({ success: true, token });
  }

  // === Need token for secure actions ===
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "No token" });

  // === VALIDATE BARCODE / GET SHIPMENT ===
  if (action === 'validate_barcode') {
    if (!shipmentId) {
      return res.status(400).json({ success: false, error: "ShipmentId required" });
    }
    
    // Get org from request body (required for selectedOrganization header)
    const requestOrg = req.body.org;
    if (!requestOrg) {
      return res.status(400).json({ success: false, error: "ORG required for barcode validation" });
    }

    const payload = {
      Query: `ShipmentId = '${shipmentId}'`,
      Size: 1
    };

    console.log('[validate_barcode] Request', JSON.stringify({ org: requestOrg, payload }, null, 2));
    const shipmentRes = await apiCall('POST', '/shipment/api/shipment/shipment/search', token, requestOrg, payload);
    console.log('[validate_barcode] Response', JSON.stringify(shipmentRes, null, 2));

    if (shipmentRes.error) {
      await sendHA("barcode_validation_failed", requestOrg, { shipmentId });
      return res.json({ success: false, error: shipmentRes.error });
    }

    // Extract shipment data
    const shipment = shipmentRes.data && shipmentRes.data.length > 0 ? shipmentRes.data[0] : null;
    if (!shipment) {
      await sendHA("barcode_not_found", requestOrg, { shipmentId });
      return res.json({ success: false, error: "Shipment not found" });
    }

    // Extract required fields
    const result = {
      success: true,
      shipmentId: shipment.ShipmentId,
      assignedCarrierId: shipment.AssignedCarrierId,
      trailerNumber: shipment.TrailerNumber,
      billOfLadingNumber: null
    };

    // Find Bill of Lading Number from Stop where StopActionId.StopActionId is "PU"
    if (shipment.Stop && Array.isArray(shipment.Stop)) {
      const pickupStop = shipment.Stop.find(stop => 
        stop.StopActionId && stop.StopActionId.StopActionId === "PU"
      );
      if (pickupStop && pickupStop.BillOfLadingNumber) {
        result.billOfLadingNumber = pickupStop.BillOfLadingNumber;
      }
    }

    await sendHA("barcode_validated", requestOrg, { shipmentId });
    return res.json(result);
  }

  // Unknown action
  return res.status(400).json({ error: "Unknown action" });
}

export const config = { api: { bodyParser: true } };


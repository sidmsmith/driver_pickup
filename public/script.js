// Driver Pickup App - Main Script
const orgInput = document.getElementById('org');
const authSection = document.getElementById('authSection');
const mainUI = document.getElementById('mainUI');
const barcodeInput = document.getElementById('barcodeInput');
const cameraBtn = document.getElementById('cameraBtn');
const statusEl = document.getElementById('status');
const shipmentInfo = document.getElementById('shipmentInfo');
const shipmentIdField = document.getElementById('shipmentId');
const carrierField = document.getElementById('carrier');
const trailerField = document.getElementById('trailer');
const billOfLadingField = document.getElementById('billOfLading');
const driverField = document.getElementById('driver');
const cameraModal = document.getElementById('cameraModal');
const closeCameraBtn = document.getElementById('closeCameraBtn');
const cameraViewport = document.getElementById('cameraViewport');
const saveSignatureBtn = document.getElementById('saveSignatureBtn');
const clearSignatureBtn = document.getElementById('clearSignatureBtn');
const downloadSignatureBtn = document.getElementById('downloadSignatureBtn');

let token = null;
let signaturePad = null;
let currentShipmentId = null;
let isScanning = false;

// Initialize Signature Pad
function initSignaturePad() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  
  signaturePad = new SignaturePad(canvas, {
    backgroundColor: '#ffffff',
    penColor: '#000000',
    minWidth: 1,
    maxWidth: 3,
    throttle: 16
  });
  
  // Adjust canvas size for high DPI displays
  function resizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    signaturePad.clear(); // Clear after resize
  }
  
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
}

// Show status message
function showStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
}

function hideStatus() {
  statusEl.style.display = 'none';
}

// API call helper
async function apiCall(action, data = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  
  return fetch('/api/validate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...data })
  }).then(r => r.json());
}

// Auto-authenticate from URL parameter
function checkAutoAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlOrg = urlParams.get('Organization');
  
  if (urlOrg && urlOrg.trim()) {
    orgInput.value = urlOrg.trim();
    authenticate();
  }
}

// Authenticate
async function authenticate() {
  const org = orgInput.value.trim();
  if (!org) {
    showStatus('ORG required', 'error');
    return;
  }
  
  showStatus('Authenticating...', 'info');
  const res = await apiCall('auth', { org });
  
  if (!res.success) {
    showStatus(res.error || 'Authentication failed', 'error');
    mainUI.style.display = 'none';
    return;
  }
  
  token = res.token;
  showStatus('Authenticated!', 'success');
  authSection.style.display = 'none';
  mainUI.style.display = 'block';
  
  // Initialize signature pad after UI is shown
  setTimeout(initSignaturePad, 100);
}

// Validate barcode
async function validateBarcode(shipmentId) {
  if (!shipmentId || !shipmentId.trim()) {
    showStatus('Please enter or scan a barcode', 'error');
    return;
  }
  
  showStatus('Validating barcode...', 'info');
  const res = await apiCall('validate_barcode', { shipmentId: shipmentId.trim() });
  
  if (!res.success) {
    showStatus(res.error || 'Barcode validation failed', 'error');
    shipmentInfo.style.display = 'none';
    return;
  }
  
  // Populate shipment information
  currentShipmentId = res.shipmentId;
  shipmentIdField.value = res.shipmentId || '';
  carrierField.value = res.assignedCarrierId || '';
  trailerField.value = res.trailerNumber || '';
  billOfLadingField.value = res.billOfLadingNumber || '';
  driverField.value = ''; // Clear driver field
  
  shipmentInfo.style.display = 'block';
  showStatus('Barcode validated successfully!', 'success');
}

// Initialize QuaggaJS for barcode scanning
function initBarcodeScanner() {
  if (isScanning) return;
  
  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: cameraViewport,
      constraints: {
        width: 640,
        height: 480,
        facingMode: "environment" // Use back camera on mobile
      }
    },
    decoder: {
      readers: [
        "code_128_reader",
        "ean_reader",
        "ean_8_reader",
        "code_39_reader",
        "code_39_vin_reader",
        "codabar_reader",
        "upc_reader",
        "upc_e_reader",
        "i2of5_reader"
      ]
    },
    locate: true
  }, (err) => {
    if (err) {
      console.error('QuaggaJS initialization error:', err);
      showStatus('Camera initialization failed. Please use manual entry.', 'error');
      closeCamera();
      return;
    }
    
    isScanning = true;
    Quagga.start();
    showStatus('Camera ready. Point at barcode to scan.', 'info');
  });
  
  // Handle successful barcode detection
  Quagga.onDetected((result) => {
    const code = result.codeResult.code;
    if (code) {
      barcodeInput.value = code;
      closeCamera();
      validateBarcode(code);
    }
  });
}

// Open camera modal
function openCamera() {
  cameraModal.classList.add('active');
  setTimeout(() => {
    initBarcodeScanner();
  }, 100);
}

// Close camera modal
function closeCamera() {
  if (isScanning) {
    Quagga.stop();
    isScanning = false;
  }
  cameraModal.classList.remove('active');
  cameraViewport.innerHTML = ''; // Clear viewport
}

// Save signature (client-side only for now)
function saveSignature() {
  if (signaturePad.isEmpty()) {
    showStatus('Please sign before saving', 'error');
    return;
  }
  
  // For now, just show success message
  // TODO: In future, this will save to backend
  showStatus('Signature saved (client-side only)', 'success');
  
  // Store in localStorage as backup
  const dataURL = signaturePad.toDataURL();
  localStorage.setItem(`signature_${currentShipmentId || 'temp'}`, dataURL);
}

// Clear signature
function clearSignature() {
  if (signaturePad) {
    signaturePad.clear();
    showStatus('Signature cleared', 'info');
  }
}

// Download signature
function downloadSignature() {
  if (signaturePad.isEmpty()) {
    showStatus('Please sign before downloading', 'error');
    return;
  }
  
  const dataURL = signaturePad.toDataURL('image/png');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `signature_${timestamp}_${currentShipmentId || 'unknown'}.png`;
  
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataURL;
  link.click();
  
  showStatus(`Signature downloaded: ${filename}`, 'success');
}

// Event Listeners
orgInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    authenticate();
  }
});

barcodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    validateBarcode(barcodeInput.value);
  }
});

cameraBtn.addEventListener('click', openCamera);
closeCameraBtn.addEventListener('click', closeCamera);

saveSignatureBtn.addEventListener('click', saveSignature);
clearSignatureBtn.addEventListener('click', clearSignature);
downloadSignatureBtn.addEventListener('click', downloadSignature);

// Close camera on background click
cameraModal.addEventListener('click', (e) => {
  if (e.target === cameraModal) {
    closeCamera();
  }
});

// App opened - send tracking event
window.addEventListener('load', async () => {
  await apiCall('app_opened');
  
  // Check for auto-authenticate
  checkAutoAuth();
});


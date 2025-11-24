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
const authStatusEl = document.getElementById('authStatus');

let token = null;
let currentOrg = null; // Store org after authentication
let signaturePad = null;
let currentShipmentId = null;
let isScanning = false;

// Initialize Signature Pad
function initSignaturePad() {
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) {
    console.warn('Signature canvas not found');
    return;
  }
  
  // Ensure signature section is visible
  const signatureSection = document.querySelector('.signature-section');
  if (!signatureSection || signatureSection.style.display === 'none') {
    console.warn('Signature section is not visible');
    return;
  }
  
  // Clear existing signature pad if it exists
  if (signaturePad) {
    signaturePad.clear();
    signaturePad.off(); // Remove event listeners
  }
  
  // Get computed style to get actual dimensions
  const computedStyle = window.getComputedStyle(canvas);
  const width = parseInt(computedStyle.width, 10) || canvas.offsetWidth || 400;
  const height = parseInt(computedStyle.height, 10) || canvas.offsetHeight || 200;
  
  // Adjust canvas size for high DPI displays
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  
  // Create signature pad
  signaturePad = new SignaturePad(canvas, {
    backgroundColor: '#ffffff',
    penColor: '#000000',
    minWidth: 1,
    maxWidth: 3,
    throttle: 16
  });
  
  // Handle window resize
  function resizeCanvas() {
    const computedStyle = window.getComputedStyle(canvas);
    const newWidth = parseInt(computedStyle.width, 10) || canvas.offsetWidth || 400;
    const newHeight = parseInt(computedStyle.height, 10) || canvas.offsetHeight || 200;
    
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = newWidth * ratio;
    canvas.height = newHeight * ratio;
    canvas.style.width = newWidth + 'px';
    canvas.style.height = newHeight + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    
    if (signaturePad) {
      signaturePad.clear();
    }
  }
  
  window.addEventListener('resize', resizeCanvas);
  
  console.log('Signature pad initialized', { width, height, ratio });
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

// Show auth status message (in auth section)
function showAuthStatus(message, type = 'info') {
  if (authStatusEl) {
    authStatusEl.textContent = message;
    authStatusEl.className = `status ${type}`;
    authStatusEl.style.display = 'block';
  }
}

function hideAuthStatus() {
  if (authStatusEl) {
    authStatusEl.style.display = 'none';
  }
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
    showAuthStatus('ORG required', 'error');
    return;
  }
  
  showAuthStatus('Authenticating...', 'info');
  
  try {
    const res = await apiCall('auth', { org });
    
    if (!res.success) {
      showAuthStatus('Authentication Failed!', 'error');
      mainUI.style.display = 'none';
      return;
    }
    
    token = res.token;
    currentOrg = org.toUpperCase(); // Store org in uppercase for API consistency
    hideAuthStatus(); // Hide auth status on success
    authSection.style.display = 'none';
    mainUI.style.display = 'block';
    
    // Don't initialize signature pad here - it will be initialized when signature section is shown
  } catch (error) {
    console.error('Authentication error:', error);
    showAuthStatus('Authentication Failed!', 'error');
    mainUI.style.display = 'none';
  }
}

// Validate barcode
async function validateBarcode(shipmentId) {
  if (!shipmentId || !shipmentId.trim()) {
    showStatus('Please enter or scan a barcode', 'error');
    return;
  }
  
  showStatus('Validating barcode...', 'info');
  const res = await apiCall('validate_barcode', { 
    org: currentOrg,
    shipmentId: shipmentId.trim() 
  });
  
  if (!res.success) {
    showStatus(res.error || 'Barcode validation failed', 'error');
    shipmentInfo.style.display = 'none';
    
    // Hide signature section on validation failure
    const signatureSection = document.querySelector('.signature-section');
    if (signatureSection) {
      signatureSection.style.display = 'none';
    }
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
  
  // Show signature section after successful validation
  const signatureSection = document.querySelector('.signature-section');
  if (signatureSection) {
    signatureSection.style.display = 'block';
    
    // Initialize signature pad when section becomes visible
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      setTimeout(() => {
        initSignaturePad();
      }, 100);
    });
  }
  
  // Hide status message on success (UI change is obvious)
  hideStatus();
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

// Save signature (upload to Manhattan WMS)
async function saveSignature() {
  // Validate signature is not empty
  if (signaturePad.isEmpty()) {
    showStatus('Please sign before saving', 'error');
    return;
  }
  
  // Validate token exists
  if (!token) {
    showStatus('Authentication required. Please authenticate first.', 'error');
    return;
  }
  
  // Validate shipment ID exists
  if (!currentShipmentId) {
    showStatus('Shipment ID required. Please validate a barcode first.', 'error');
    return;
  }
  
  // Disable button and show loading state
  saveSignatureBtn.disabled = true;
  const originalText = saveSignatureBtn.innerHTML;
  saveSignatureBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  showStatus('Uploading signature...', 'info');
  
  try {
    // Get signature as base64 (strip data URL prefix)
    const dataURL = signaturePad.toDataURL('image/png');
    const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
    
    // Generate filename with same format as download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `${currentShipmentId}_Signature_${timestamp}.png`;
    
    // Upload to Manhattan WMS
    const res = await apiCall('upload_signature', {
      org: currentOrg,
      shipmentId: currentShipmentId,
      filename: filename,
      fileData: base64Data
    });
    
    if (!res.success) {
      // Show error with actual server response for troubleshooting
      const errorMsg = res.error || 'Signature upload failed';
      showStatus(`Upload failed: ${errorMsg}`, 'error');
      return;
    }
    
    // Success - show success message
    showStatus('Signature uploaded successfully!', 'success');
    
    // Store in localStorage as backup
    localStorage.setItem(`signature_${currentShipmentId}`, dataURL);
    
  } catch (error) {
    console.error('Signature upload error:', error);
    showStatus(`Upload error: ${error.message || 'Unknown error'}`, 'error');
  } finally {
    // Re-enable button
    saveSignatureBtn.disabled = false;
    saveSignatureBtn.innerHTML = originalText;
  }
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
  // Format: SHI000000020_Signature_2025-11-24T17-30-20.png
  const filename = `${currentShipmentId || 'unknown'}_Signature_${timestamp}.png`;
  
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


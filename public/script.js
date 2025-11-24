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
const confirmPickupBtn = document.getElementById('confirmPickupBtn');
const clearSignatureBtn = document.getElementById('clearSignatureBtn');
const authStatusEl = document.getElementById('authStatus');
const themeSelectorBtn = document.getElementById('themeSelectorBtn');
const themeModal = document.getElementById('themeModal');
const themeList = document.getElementById('themeList');
const modalBackdrop = document.getElementById('modalBackdrop');
const errorModal = document.getElementById('errorModal');
const errorModalMessage = document.getElementById('errorModalMessage');
const errorModalCloseBtn = document.getElementById('errorModalCloseBtn');

let token = null;
let currentOrg = null; // Store org after authentication
let signaturePad = null;
let currentShipmentId = null;
let isScanning = false;
let qrScanInterval = null; // For QR code scanning
let cameraModalHistoryState = null; // Track if we pushed a history state for camera modal

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

// Show error modal (for critical errors that need user attention)
function showErrorModal(message) {
  if (errorModal && errorModalMessage) {
    errorModalMessage.textContent = message;
    errorModal.removeAttribute('hidden');
  } else {
    // Fallback to regular status if modal elements not found
    showStatus(message, 'error');
  }
}

// Hide error modal
function hideErrorModal() {
  if (errorModal) {
    errorModal.setAttribute('hidden', '');
  }
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

// Auto-authenticate from URL parameter and check for ShipmentId
function checkAutoAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlOrg = urlParams.get('Organization');
  const urlShipmentId = urlParams.get('ShipmentId');
  
  // Store ShipmentId from URL for later use (after authentication)
  if (urlShipmentId && urlShipmentId.trim()) {
    window.urlShipmentId = urlShipmentId.trim();
  }
  
  // Always require authentication - if Organization is provided, auto-authenticate
  if (urlOrg && urlOrg.trim()) {
    orgInput.value = urlOrg.trim();
    authenticate();
  }
  // If no Organization in URL, user will need to authenticate manually
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
    
    // If ShipmentId was provided in URL, automatically validate it
    if (window.urlShipmentId) {
      // Pre-populate the barcode input field with the ShipmentId from URL
      barcodeInput.value = window.urlShipmentId;
      
      // Small delay to ensure UI is ready
      setTimeout(() => {
        validateBarcode(window.urlShipmentId);
        // Clear the stored value so we don't re-validate on subsequent auths
        window.urlShipmentId = null;
      }, 300);
    }
    
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
    // Show same error message as before
    showStatus(res.error || 'Barcode validation failed', 'error');
    shipmentInfo.style.display = 'none';
    
    // Hide signature section on validation failure
    const signatureSection = document.querySelector('.signature-section');
    if (signatureSection) {
      signatureSection.style.display = 'none';
    }
    
    // Ensure barcode input is visible and ready for user to enter new ShipmentId
    // (This handles the case where ShipmentId came from URL and was invalid)
    barcodeInput.focus();
    
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
  
  // Get container dimensions to constrain video size
  const container = cameraViewport.parentElement;
  const maxWidth = Math.min(400, window.innerWidth * 0.9);
  const maxHeight = Math.min(300, window.innerHeight * 0.6);
  
  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: cameraViewport,
      constraints: {
        width: { min: 320, ideal: 640, max: 1280 },
        height: { min: 240, ideal: 480, max: 720 },
        facingMode: "environment" // Use back camera on mobile
      }
      // Removed area constraint - scan full viewport for better 1D barcode detection
    },
    decoder: {
      readers: [
        "code_128_reader",  // Primary format for shipment IDs
        "code_39_reader",
        "code_39_vin_reader",
        "ean_reader",
        "ean_8_reader",
        "codabar_reader",
        "upc_reader",
        "upc_e_reader",
        "i2of5_reader"
      ],
      debug: {
        drawBoundingBox: true,
        showFrequency: false,
        drawScanline: true,
        showPattern: false
      },
      // Additional options for better 1D barcode detection
      patchSize: "medium", // Try different patch sizes
      showCanvas: false,
      showPatches: false
    },
    locate: true,
    numOfWorkers: 4, // More workers for better performance
    frequency: 30, // Check every 30 frames (more frequent scanning)
    halfSample: false // Don't downsample - use full resolution for better accuracy
  }, (err) => {
    if (err) {
      console.error('QuaggaJS initialization error:', err);
      showStatus('Camera initialization failed. Please use manual entry.', 'error');
      closeCamera();
      return;
    }
    
    isScanning = true;
    Quagga.start();
    showStatus('Camera ready. Point at barcode (Code 128) or QR code to scan.', 'info');
  });
  
  // Handle successful 1D barcode detection (QuaggaJS)
  Quagga.onDetected((result) => {
    const code = result.codeResult.code;
    const format = result.codeResult.format;
    const confidence = result.codeResult.decodedCodes ? 
      result.codeResult.decodedCodes.filter(x => x.error === 0).length / result.codeResult.decodedCodes.length : 0;
    
    console.log('1D Barcode detected:', { code, format, confidence });
    
    if (code) {
      // Lower confidence threshold for 1D barcodes (they're harder to scan than QR codes)
      // Accept if at least 30% of codes decoded correctly, or if format is Code 128 (our primary format)
      const minConfidence = (format === 'code_128' || format === 'code_39') ? 0.25 : 0.4;
      
      if (confidence < minConfidence) {
        console.warn('Low confidence scan, ignoring:', code, 'format:', format, 'confidence:', confidence.toFixed(2));
        return;
      }
      
      console.log('Accepting 1D barcode scan:', { code, format, confidence: confidence.toFixed(2) });
      
      // Validate and process the scanned code
      processScannedCode(code, '1D Barcode: ' + format);
    }
  });
  
  // Start QR code scanning (jsQR) - runs alongside QuaggaJS
  startQRCodeScanning();
}

// QR code scanning using jsQR
function startQRCodeScanning() {
  if (!window.jsQR) {
    console.warn('jsQR library not loaded, QR code scanning disabled');
    return;
  }
  
  const video = cameraViewport.querySelector('video');
  if (!video) {
    // Wait for video element to be created by QuaggaJS
    setTimeout(startQRCodeScanning, 500);
    return;
  }
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  qrScanInterval = setInterval(() => {
    if (!isScanning || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    
    if (code) {
      console.log('QR Code detected:', { code: code.data });
      processScannedCode(code.data, 'QR Code');
    }
  }, 300); // Check every 300ms
}

// Process scanned code (from either 1D barcode or QR code)
function processScannedCode(code, source) {
  // Validate format - shipment IDs should be alphanumeric
  if (code.length > 0 && /^[A-Z0-9]+$/i.test(code)) {
    console.log(`Processing scanned code from ${source}:`, code);
    barcodeInput.value = code;
    closeCamera();
    validateBarcode(code);
  } else {
    console.warn(`Invalid code format detected from ${source}:`, code);
    showStatus(`Scanned: "${code}" - Does not look like a valid shipment ID. Please try again.`, 'error');
  }
}

// Open camera modal
function openCamera() {
  cameraModal.classList.add('active');
  
  // Push a history state to intercept back button
  // This prevents users from accidentally navigating away
  if (history.pushState) {
    cameraModalHistoryState = { modal: 'camera', timestamp: Date.now() };
    history.pushState(cameraModalHistoryState, '', window.location.href);
  }
  
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
  
  // Stop QR code scanning
  if (qrScanInterval) {
    clearInterval(qrScanInterval);
    qrScanInterval = null;
  }
  
  cameraModal.classList.remove('active');
  cameraViewport.innerHTML = ''; // Clear viewport
  
  // Remove the history state we added when opening the modal
  // If user clicked Close button (not back button), we need to clean up the history state
  if (cameraModalHistoryState && history.state && history.state.modal === 'camera') {
    // Replace the state with current state to remove our modal state from history
    history.replaceState(null, '', window.location.href);
    cameraModalHistoryState = null;
  }
}

// Confirm pickup (upload signature to Manhattan WMS)
async function confirmPickup() {
  // Validate signature is not empty
  if (signaturePad.isEmpty()) {
    showErrorModal('Please sign before confirming pickup');
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
  confirmPickupBtn.disabled = true;
  const originalText = confirmPickupBtn.innerHTML;
  confirmPickupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  showStatus('Uploading signature...', 'info');
  
  try {
    // Get signature as base64 (strip data URL prefix)
    const dataURL = signaturePad.toDataURL('image/png');
    const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
    
    // Generate filename: Signature_{ShipmentId}.png
    const filename = `Signature_${currentShipmentId}.png`;
    
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
    showStatus('Pickup confirmed successfully!', 'success');
    
    // Store in localStorage as backup
    localStorage.setItem(`signature_${currentShipmentId}`, dataURL);
    
    // Reset UI: clear barcode input, hide sections, clear signature pad
    setTimeout(() => {
      barcodeInput.value = '';
      currentShipmentId = null;
      shipmentInfo.style.display = 'none';
      const signatureSection = document.querySelector('.signature-section');
      if (signatureSection) {
        signatureSection.style.display = 'none';
      }
      if (signaturePad) {
        signaturePad.clear();
      }
      hideStatus();
      
      // Remove ShipmentId from URL if it was there (after processing first shipment)
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('ShipmentId')) {
        urlParams.delete('ShipmentId');
        const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newUrl);
      }
      
      // Focus back on barcode input for next scan
      barcodeInput.focus();
    }, 1500); // Wait 1.5 seconds to show success message
    
  } catch (error) {
    console.error('Signature upload error:', error);
    showStatus(`Upload error: ${error.message || 'Unknown error'}`, 'error');
  } finally {
    // Re-enable button
    confirmPickupBtn.disabled = false;
    confirmPickupBtn.innerHTML = originalText;
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

// Theme Management
const DEFAULT_THEME_KEY = 'manhattan';

const THEMES = {
  default: {
    name: 'Default (Dark)',
    colors: {
      '--bg-color': '#121212',
      '--text-color': '#e0e0e0',
      '--text-muted': '#bbbbbb',
      '--card-bg': '#1e1e1e',
      '--border-color': '#333',
      '--input-bg': '#2d2d2d',
      '--input-border': '#444',
      '--input-focus-bg': '#333',
      '--input-focus-border': '#0d6efd',
      '--input-focus-shadow': 'rgba(13, 110, 253, 0.25)',
      '--primary-color': '#0d6efd',
      '--primary-hover': '#0b5ed7',
      '--success-color': '#28a745',
      '--danger-color': '#dc3545',
      '--header-bg': '#111827',
      '--header-text': '#e5e7eb'
    }
  },
  loves: {
    name: "Love's Travel Stops",
    colors: {
      '--bg-color': '#f8f9fa',
      '--text-color': '#212529',
      '--text-muted': '#6c757d',
      '--card-bg': '#ffffff',
      '--border-color': '#dee2e6',
      '--input-bg': '#f5f5f5',
      '--input-border': '#ced4da',
      '--input-focus-bg': '#ffffff',
      '--input-focus-border': '#E31837',
      '--input-focus-shadow': 'rgba(227, 24, 55, 0.25)',
      '--primary-color': '#E31837',
      '--primary-hover': '#C0142D',
      '--success-color': '#28a745',
      '--danger-color': '#dc3545',
      '--header-bg': '#f1f5f9',
      '--header-text': '#1f2933'
    }
  },
  manhattan: {
    name: 'Manhattan',
    colors: {
      '--bg-color': '#f5f7fa',
      '--text-color': '#1a1a1a',
      '--text-muted': '#4a5568',
      '--card-bg': '#ffffff',
      '--border-color': '#e1e8ed',
      '--input-bg': '#f0f2f5',
      '--input-border': '#cbd5e0',
      '--input-focus-bg': '#ffffff',
      '--input-focus-border': '#0066cc',
      '--input-focus-shadow': 'rgba(0, 102, 204, 0.25)',
      '--primary-color': '#0066cc',
      '--primary-hover': '#0052a3',
      '--success-color': '#28a745',
      '--danger-color': '#dc3545',
      '--header-bg': '#dce7f5',
      '--header-text': '#0f172a'
    }
  },
  msc: {
    name: 'MSC Industrial',
    colors: {
      '--bg-color': '#fafafa',
      '--text-color': '#1a1a1a',
      '--text-muted': '#757575',
      '--card-bg': '#ffffff',
      '--border-color': '#e0e0e0',
      '--input-bg': '#f0f0f0',
      '--input-border': '#bdbdbd',
      '--input-focus-bg': '#ffffff',
      '--input-focus-border': '#003d82',
      '--input-focus-shadow': 'rgba(0,61,130,0.25)',
      '--primary-color': '#003d82',
      '--primary-hover': '#002d5f',
      '--success-color': '#28a745',
      '--danger-color': '#dc3545',
      '--header-bg': '#e5e7eb',
      '--header-text': '#1f1f1f'
    }
  },
  'corporate-blue': {
    name: 'Corporate Blue',
    colors: {
      '--bg-color': '#e3f2fd',
      '--text-color': '#0d47a1',
      '--text-muted': '#1976d2',
      '--card-bg': '#ffffff',
      '--border-color': '#90caf9',
      '--input-bg': '#f5f5f5',
      '--input-border': '#90caf9',
      '--input-focus-bg': '#ffffff',
      '--input-focus-border': '#1565c0',
      '--input-focus-shadow': 'rgba(21,101,192,0.25)',
      '--primary-color': '#1565c0',
      '--primary-hover': '#0d47a1',
      '--success-color': '#28a745',
      '--danger-color': '#dc3545',
      '--header-bg': '#bbdefb',
      '--header-text': '#0d47a1'
    }
  },
  'minimal-light': {
    name: 'Minimal Light',
    colors: {
      '--bg-color': '#ffffff',
      '--text-color': '#1f2933',
      '--text-muted': '#616e7c',
      '--card-bg': '#f8fafc',
      '--border-color': '#d9e2ec',
      '--input-bg': '#ffffff',
      '--input-border': '#cbd5e0',
      '--input-focus-bg': '#ffffff',
      '--input-focus-border': '#5a67d8',
      '--input-focus-shadow': 'rgba(90,103,216,0.25)',
      '--primary-color': '#5a67d8',
      '--primary-hover': '#4c51bf',
      '--success-color': '#28a745',
      '--danger-color': '#dc3545',
      '--header-bg': '#d9e2ec',
      '--header-text': '#1f2933'
    }
  }
};

function applyTheme(themeKey) {
  const theme = THEMES[themeKey];
  if (!theme) return;
  
  Object.entries(theme.colors).forEach(([prop, value]) => {
    document.documentElement.style.setProperty(prop, value);
  });
  
  localStorage.setItem('driverPickupTheme', themeKey);
}

function loadTheme() {
  const saved = localStorage.getItem('driverPickupTheme') || DEFAULT_THEME_KEY;
  applyTheme(saved);
}

function renderThemeList() {
  if (!themeList) {
    console.error('themeList element not found');
    return;
  }
  const current = localStorage.getItem('driverPickupTheme') || DEFAULT_THEME_KEY;
  themeList.innerHTML = '';
  Object.entries(THEMES).forEach(([key, theme]) => {
    const btn = document.createElement('button');
    btn.textContent = theme.name;
    btn.className = key === current ? 'active' : '';
    btn.onclick = () => {
      applyTheme(key);
      closeThemeModal();
    };
    themeList.appendChild(btn);
  });
  console.log('Theme list rendered', themeList.children.length, 'themes');
  console.log('Theme modal element:', themeModal);
  console.log('Theme modal hidden attribute:', themeModal?.getAttribute('hidden'));
  console.log('Theme modal computed display:', window.getComputedStyle(themeModal).display);
}

function isModalVisible(el) {
  return el && !el.hidden;
}

function showBackdrop() {
  if (modalBackdrop) modalBackdrop.hidden = false;
}

function hideBackdropIfNone() {
  if (modalBackdrop && !isModalVisible(themeModal)) {
    modalBackdrop.hidden = true;
  }
}

function openThemeModal() {
  if (!themeModal) return;
  renderThemeList();
  themeModal.removeAttribute('hidden');
  themeModal.style.display = 'flex'; // Explicitly set display
  themeModal.style.visibility = 'visible';
  themeModal.style.opacity = '1';
  themeModal.style.zIndex = '1001';
  showBackdrop();
  console.log('Theme modal opened', themeModal);
  console.log('Theme modal computed display after open:', window.getComputedStyle(themeModal).display);
  console.log('Theme modal computed visibility:', window.getComputedStyle(themeModal).visibility);
  console.log('Theme modal computed opacity:', window.getComputedStyle(themeModal).opacity);
  console.log('Theme modal computed z-index:', window.getComputedStyle(themeModal).zIndex);
  console.log('Theme modal parent:', themeModal.parentElement);
}

function closeThemeModal() {
  if (!themeModal) return;
  themeModal.setAttribute('hidden', '');
  themeModal.style.display = 'none'; // Explicitly set display
  hideBackdropIfNone();
  console.log('Theme modal closed');
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

confirmPickupBtn.addEventListener('click', confirmPickup);
clearSignatureBtn.addEventListener('click', clearSignature);

// Error modal close button
errorModalCloseBtn?.addEventListener('click', hideErrorModal);

// Close error modal when clicking outside
errorModal?.addEventListener('click', (e) => {
  if (e.target === errorModal) {
    hideErrorModal();
  }
});

// Theme selector
themeSelectorBtn?.addEventListener('click', openThemeModal);

// Close theme modal on backdrop click
modalBackdrop?.addEventListener('click', () => {
  if (isModalVisible(themeModal)) {
    closeThemeModal();
  }
});

// Close camera on background click
cameraModal.addEventListener('click', (e) => {
  if (e.target === cameraModal) {
    closeCamera();
  }
});

// Handle browser back button - intercept when camera modal is open
window.addEventListener('popstate', (event) => {
  // If camera modal is open and user pressed back button, close the modal instead
  if (cameraModal.classList.contains('active')) {
    // User pressed back while modal is open - close modal instead of navigating
    // Don't call closeCamera() here because it will try to clean up history again
    // Just close the modal directly
    if (isScanning) {
      Quagga.stop();
      isScanning = false;
    }
    if (qrScanInterval) {
      clearInterval(qrScanInterval);
      qrScanInterval = null;
    }
    cameraModal.classList.remove('active');
    cameraViewport.innerHTML = '';
    cameraModalHistoryState = null;
    return;
  }
  
  // If the state was for our camera modal (but modal already closed), just clean up
  if (event.state && event.state.modal === 'camera') {
    cameraModalHistoryState = null;
  }
});

// App opened - send tracking event
window.addEventListener('load', async () => {
  loadTheme(); // Load saved theme
  await apiCall('app_opened');
  
  // Check for auto-authenticate
  checkAutoAuth();
});


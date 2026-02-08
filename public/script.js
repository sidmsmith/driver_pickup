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

// ===== SESSION TRACKING =====
const SESSION_STORAGE_KEY = 'driver_pickup_session';
let sessionId = null;
let pageLoadTime = null;
let authAttemptCount = 0;
let firstAuthSuccess = true;
let signatureClearCount = 0;

// Initialize session on page load
(function initSession() {
  pageLoadTime = Date.now();
  
  // Get or create session ID
  sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionId) {
    sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
  
  // Check if returning user
  const hasSavedPreferences = localStorage.getItem('selectedTheme') !== null;
  
  // Store for metadata collection
  window._appSession = {
    sessionId,
    pageLoadTime,
    hasSavedPreferences
  };
})();

// ===== GENERIC METADATA COLLECTION (Reusable across all apps) =====
function getCommonMetadata(additionalMetadata = {}) {
  const now = Date.now();
  const timeOnPage = pageLoadTime ? Math.floor((now - pageLoadTime) / 1000) : 0;
  
  // Parse user agent
  const ua = navigator.userAgent;
  const browserInfo = parseUserAgent(ua);
  
  // Get screen info
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  const screenResolution = `${screenWidth}x${screenHeight}`;
  
  // Get URL parameters
  const urlParamsObj = {};
  const currentUrlParams = new URLSearchParams(window.location.search);
  for (const [key, value] of currentUrlParams.entries()) {
    urlParamsObj[key] = value;
  }
  
  // Get theme
  const currentTheme = localStorage.getItem('selectedTheme') || 'default';
  
  // Check for auto-authentication via URL params
  const urlOrg = urlParamsObj.Organization || null;
  
  // Build common metadata
  const commonMetadata = {
    // Category 1: User/Browser Information
    user_agent: ua,
    browser_name: browserInfo.name,
    browser_version: browserInfo.version,
    device_type: getDeviceType(),
    os_name: browserInfo.os,
    os_version: browserInfo.osVersion,
    screen_resolution: screenResolution,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language || navigator.userLanguage,
    
    // Category 2: Session & Context
    session_id: sessionId,
    page_load_time: pageLoadTime ? new Date(pageLoadTime).toISOString() : null,
    time_on_page: timeOnPage,
    referrer: document.referrer || null,
    url_params: Object.keys(urlParamsObj).length > 0 ? urlParamsObj : null,
    auto_authenticated: !!urlOrg,
    
    // Category 3: App State & Preferences
    theme: currentTheme,
    has_saved_preferences: window._appSession?.hasSavedPreferences || false,
    
    // Category 4: Authentication Context (will be overridden by event-specific data)
    auth_method: urlOrg ? 'url_param' : 'manual',
    auth_attempt_count: authAttemptCount,
    first_auth_success: firstAuthSuccess,
    
    // Category 7: Error & Debugging (will be populated if error occurs)
    // error_code, error_message, stack_trace, api_error_details - added per event
    
    // Category 8: Cross-App Integration
    source_app: urlOrg ? 'cross_app' : null,
    integration_type: urlOrg ? 'url_params' : 'direct',
    
    // Category 10: Geographic/Network
    request_origin: window.location.origin,
    
    // Merge any additional metadata
    ...additionalMetadata
  };
  
  return commonMetadata;
}

// Helper: Parse user agent
function parseUserAgent(ua) {
  let name = 'Unknown';
  let version = 'Unknown';
  let os = 'Unknown';
  let osVersion = 'Unknown';
  
  // Browser detection
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    name = 'Chrome';
    const match = ua.match(/Chrome\/([\d.]+)/);
    version = match ? match[1] : 'Unknown';
  } else if (ua.includes('Firefox')) {
    name = 'Firefox';
    const match = ua.match(/Firefox\/([\d.]+)/);
    version = match ? match[1] : 'Unknown';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    name = 'Safari';
    const match = ua.match(/Version\/([\d.]+)/);
    version = match ? match[1] : 'Unknown';
  } else if (ua.includes('Edg')) {
    name = 'Edge';
    const match = ua.match(/Edg\/([\d.]+)/);
    version = match ? match[1] : 'Unknown';
  }
  
  // OS detection
  if (ua.includes('Windows')) {
    os = 'Windows';
    const match = ua.match(/Windows NT ([\d.]+)/);
    if (match) {
      const ntVersion = match[1];
      const versionMap = {
        '10.0': '10/11',
        '6.3': '8.1',
        '6.2': '8',
        '6.1': '7'
      };
      osVersion = versionMap[ntVersion] || ntVersion;
    }
  } else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) {
    os = 'macOS';
    const match = ua.match(/Mac OS X ([\d_]+)/);
    if (match) {
      osVersion = match[1].replace(/_/g, '.');
    }
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  } else if (ua.includes('Android')) {
    os = 'Android';
    const match = ua.match(/Android ([\d.]+)/);
    osVersion = match ? match[1] : 'Unknown';
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    os = 'iOS';
    const match = ua.match(/OS ([\d_]+)/);
    if (match) {
      osVersion = match[1].replace(/_/g, '.');
    }
  }
  
  return { name, version, os, osVersion };
}

// Helper: Get device type
function getDeviceType() {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    return 'tablet';
  }
  if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

// Home Assistant tracking helper with enhanced metadata
async function trackEvent(eventName, metadata = {}) {
  try {
    // Get common metadata and merge with event-specific metadata
    const fullMetadata = getCommonMetadata(metadata);
    
    await apiCall('ha-track', {
      event_name: eventName,
      metadata: fullMetadata
    });
  } catch (error) {
    // Silently fail - don't interrupt user experience
    console.warn('[HA] Failed to track event:', error);
  }
}

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
  
  // Handle window resize - save and restore signature to prevent clearing on mobile keyboard
  let resizeTimeout = null;
  function resizeCanvas() {
    // Debounce resize events to avoid multiple calls
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    
    resizeTimeout = setTimeout(() => {
      if (!signaturePad || signaturePad.isEmpty()) {
        // No signature to save, just resize
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
        return;
      }
      
      // Save signature data before resizing
      const signatureData = signaturePad.toDataURL('image/png');
      
      // Get new dimensions
      const computedStyle = window.getComputedStyle(canvas);
      const newWidth = parseInt(computedStyle.width, 10) || canvas.offsetWidth || 400;
      const newHeight = parseInt(computedStyle.height, 10) || canvas.offsetHeight || 200;
      
      // Check if dimensions actually changed significantly (more than 10px difference)
      const currentWidth = canvas.offsetWidth || parseInt(computedStyle.width, 10) || 400;
      const currentHeight = canvas.offsetHeight || parseInt(computedStyle.height, 10) || 200;
      
      const widthDiff = Math.abs(newWidth - currentWidth);
      const heightDiff = Math.abs(newHeight - currentHeight);
      
      // Only resize if dimensions changed significantly (not just keyboard appearing)
      if (widthDiff < 10 && heightDiff < 10) {
        return; // Skip resize for minor changes (like keyboard appearing)
      }
      
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = newWidth * ratio;
      canvas.height = newHeight * ratio;
      canvas.style.width = newWidth + 'px';
      canvas.style.height = newHeight + 'px';
      
      const ctx = canvas.getContext('2d');
      ctx.scale(ratio, ratio);
      
      // Restore signature after resize
      const img = new Image();
      img.onload = () => {
        // Clear and redraw the signature on the resized canvas
        ctx.clearRect(0, 0, newWidth, newHeight);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, newWidth, newHeight);
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        // Update signature pad's internal state by loading the data URL
        if (signaturePad && typeof signaturePad.fromDataURL === 'function') {
          signaturePad.fromDataURL(signatureData);
        }
      };
      img.src = signatureData;
    }, 150); // Debounce resize events by 150ms
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
  
  // Increment auth attempt count
  authAttemptCount++;
  const authStartTime = Date.now();
  
  // Track auth attempt
  trackEvent('auth_attempt', {
    org: org || 'unknown',
    auth_attempt_count: authAttemptCount
  });
  
  showAuthStatus('Authenticating...', 'info');
  
  try {
    const res = await apiCall('auth', { org });
    const authDuration = Date.now() - authStartTime;
    
    if (!res.success) {
      showAuthStatus('Authentication Failed!', 'error');
      mainUI.style.display = 'none';
      
      // Track auth failure
      trackEvent('auth_failed', {
        org: org || 'unknown',
        error: res.error || 'Auth failed',
        error_message: res.error || 'Auth failed',
        auth_attempt_count: authAttemptCount,
        auth_duration_ms: authDuration,
        token_received: false
      });
      firstAuthSuccess = false;
      return;
    }
    
    token = res.token;
    currentOrg = org.toUpperCase(); // Store org in uppercase for API consistency
    hideAuthStatus(); // Hide auth status on success
    authSection.style.display = 'none';
    mainUI.style.display = 'block';
    
    // Track auth success
    trackEvent('auth_success', {
      org: org,
      auth_attempt_count: authAttemptCount,
      auth_duration_ms: authDuration,
      token_received: true,
      first_auth_success: firstAuthSuccess
    });
    
    // Reset for next session (if they log out and back in)
    firstAuthSuccess = false;
    
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
    
    // Track auth error
    trackEvent('auth_failed', {
      org: org || 'unknown',
      error: error.message || 'Unknown error',
      error_message: error.message || 'Unknown error',
      auth_attempt_count: authAttemptCount,
      auth_duration_ms: Date.now() - authStartTime,
      token_received: false
    });
    firstAuthSuccess = false;
  }
}

// Validate barcode
async function validateBarcode(shipmentId) {
  if (!shipmentId || !shipmentId.trim()) {
    showStatus('Please enter or scan a barcode', 'error');
    return;
  }
  
  showStatus('Validating barcode...', 'info');
  
  // Determine validation method (manual entry vs camera scan)
  const validationMethod = window._lastScanSource || 'manual_entry';
  const validationStartTime = Date.now();
  
  // Track barcode validation attempt with driver pickup specific metadata
  trackEvent('barcode_validation_attempt', {
    org: currentOrg || 'unknown',
    barcode: shipmentId.trim(),
    shipment_id: shipmentId.trim(),
    barcode_validation_method: validationMethod,
    code_length: String(shipmentId.trim().length)
  });
  
  const apiStartTime = Date.now();
  const res = await apiCall('validate_barcode', { 
    org: currentOrg,
    shipmentId: shipmentId.trim() 
  });
  const apiResponseTime = Date.now() - apiStartTime;
  const validationDuration = Date.now() - validationStartTime;
  
  if (!res.success) {
    // Show same error message as before
    showStatus(res.error || 'Barcode validation failed', 'error');
    shipmentInfo.style.display = 'none';
    
    // Hide signature section on validation failure
    const signatureSection = document.querySelector('.signature-section');
    if (signatureSection) {
      signatureSection.style.display = 'none';
    }
    
    // Track validation failure with driver pickup specific metadata
    trackEvent('barcode_validation_failed', {
      org: currentOrg || 'unknown',
      barcode: shipmentId.trim(),
      shipment_id: shipmentId.trim(),
      barcode_validation_method: validationMethod,
      error: res.error || 'Validation failed',
      error_message: res.error || 'Validation failed',
      validation_duration_ms: validationDuration,
      api_response_time_ms: apiResponseTime,
      shipment_found: false
    });
    
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
  
  // Track successful validation with driver pickup specific metadata
  trackEvent('barcode_validated', {
    org: currentOrg || 'unknown',
    barcode: shipmentId.trim(),
    shipment_id: res.shipmentId || shipmentId.trim(),
    carrier_id: res.assignedCarrierId || null,
    trailer_number: res.trailerNumber || null,
    bill_of_lading: res.billOfLadingNumber || null,
    has_bill_of_lading: !!res.billOfLadingNumber,
    barcode_validation_method: validationMethod,
    validation_duration_ms: validationDuration,
    api_response_time_ms: apiResponseTime,
    shipment_found: true
  });
  
  // Clear the scan source after successful validation
  window._lastScanSource = null;
  
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
  // Store scan source for validation tracking
  window._lastScanSource = source === 'QR Code' ? 'qr_code' : 'camera';
  
  // Track barcode scan with driver pickup specific metadata
  trackEvent('barcode_scanned', {
    org: currentOrg || 'unknown',
    scan_source: source === 'QR Code' ? 'qr_code' : 'camera',
    barcode: code.substring(0, 100), // Limit length for metadata
    code_length: String(code.length),
    camera_used: true
  });
  
  // Validate format - shipment IDs should be alphanumeric
  if (code.length > 0 && /^[A-Z0-9]+$/i.test(code)) {
    console.log(`Processing scanned code from ${source}:`, code);
    barcodeInput.value = code;
    closeCamera();
    validateBarcode(code);
  } else {
    console.warn(`Invalid code format detected from ${source}:`, code);
    showStatus(`Scanned: "${code}" - Does not look like a valid shipment ID. Please try again.`, 'error');
    
    // Track invalid scan with driver pickup specific metadata
    trackEvent('barcode_scan_invalid', {
      org: currentOrg || 'unknown',
      scan_source: source === 'QR Code' ? 'qr_code' : 'camera',
      barcode: code.substring(0, 50), // Limit length
      code_length: String(code.length),
      camera_used: true
    });
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

// Enhance signature image with logo and metadata above the signature
async function enhanceSignatureImage() {
  return new Promise((resolve, reject) => {
    const canvas = signaturePad.canvas;
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;
    
    // Load and draw the Manhattan logo
    const logo = new Image();
    logo.onload = () => {
      // Logo dimensions - scale to fit nicely in upper left
      const logoWidth = 120;
      const logoHeight = (logo.height / logo.width) * logoWidth;
      const padding = 10;
      
      // Prepare text data
      const shipmentId = currentShipmentId || 'N/A';
      const billOfLading = billOfLadingField.value || 'N/A';
      const driver = driverField.value || 'N/A';
      const timestamp = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      // Calculate header height needed for logo + text
      const lineHeight = 18;
      const textLines = 4; // Shipment, BOL, Signed by, Timestamp
      const textSpacing = 15; // Space between logo and first text line
      const headerHeight = padding + logoHeight + textSpacing + (textLines * lineHeight) + padding;
      
      // Create a new canvas that's taller (original height + header height)
      const enhancedCanvas = document.createElement('canvas');
      enhancedCanvas.width = originalWidth;
      enhancedCanvas.height = originalHeight + headerHeight;
      const ctx = enhancedCanvas.getContext('2d');
      
      // Fill entire canvas with white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, enhancedCanvas.width, enhancedCanvas.height);
      
      // Draw logo in upper left corner of header area
      ctx.drawImage(logo, padding, padding, logoWidth, logoHeight);
      
      // Text settings
      ctx.font = '12px Arial, sans-serif';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      // Starting position below logo in header area
      let textY = padding + logoHeight + textSpacing;
      const textX = padding;
      
      // Draw text lines in header area
      ctx.fillText(`Shipment ${shipmentId}`, textX, textY);
      textY += lineHeight;
      
      ctx.fillText(`BOL: ${billOfLading}`, textX, textY);
      textY += lineHeight;
      
      ctx.fillText(`Signed by: ${driver}`, textX, textY);
      textY += lineHeight;
      
      ctx.fillText(timestamp, textX, textY);
      
      // Draw the original signature below the header area
      ctx.drawImage(canvas, 0, headerHeight);
      
      // Convert to base64
      const enhancedDataURL = enhancedCanvas.toDataURL('image/png');
      const base64Data = enhancedDataURL.replace(/^data:image\/png;base64,/, '');
      resolve({ dataURL: enhancedDataURL, base64Data: base64Data });
    };
    
    logo.onerror = () => {
      console.warn('Logo failed to load, using signature without logo');
      // If logo fails, just use the original signature
      const dataURL = signaturePad.toDataURL('image/png');
      const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
      resolve({ dataURL: dataURL, base64Data: base64Data });
    };
    
    // Load logo from the same directory
    logo.src = './manhattan-logo.png';
  });
}

// Confirm pickup (upload signature to Manhattan WMS)
async function confirmPickup() {
  // Validate signature is not empty
  if (signaturePad.isEmpty()) {
    showErrorModal('Please sign before confirming pickup');
    return;
  }
  
  // Validate driver name is provided
  const driverName = driverField.value.trim();
  if (!driverName) {
    showErrorModal('Driver name is required. Please enter the driver name before confirming pickup.');
    driverField.focus();
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
  
  // Track pickup confirmation attempt
  await trackEvent('pickup_confirmation_attempt', {
    org: currentOrg || 'unknown',
    shipment_id: currentShipmentId,
    driver: driverField.value || '',
    timestamp: new Date().toISOString()
  });
  
  // Disable button and show loading state
  confirmPickupBtn.disabled = true;
  const originalText = confirmPickupBtn.innerHTML;
  confirmPickupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  showStatus('Uploading signature...', 'info');
  
  try {
    // Get enhanced signature with logo and metadata
    const { dataURL, base64Data } = await enhanceSignatureImage();
    
    // Generate filename: Signature_{ShipmentId}.png
    const filename = `Signature_${currentShipmentId}.png`;
    
    // Driver name already validated above, use it for Notes field
    
    // Format timestamp to match signature image format (same timezone)
    const timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    // Upload to Manhattan WMS
    const res = await apiCall('upload_signature', {
      org: currentOrg,
      shipmentId: currentShipmentId,
      filename: filename,
      fileData: base64Data,
      driver: driverName,
      timestamp: timestamp
    });
    
    if (!res.success) {
      // Show error with actual server response for troubleshooting
      const errorMsg = res.error || 'Signature upload failed';
      showStatus(`Upload failed: ${errorMsg}`, 'error');
      
      // Track upload failure
      await trackEvent('pickup_confirmation_failed', {
        org: currentOrg || 'unknown',
        shipment_id: currentShipmentId,
        error: errorMsg,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // Success - show success message
    showStatus('Pickup confirmed successfully!', 'success');
    
    // Track successful pickup confirmation
    await trackEvent('pickup_confirmed', {
      org: currentOrg || 'unknown',
      shipment_id: currentShipmentId,
      driver: driverField.value || '',
      carrier: carrierField.value || '',
      trailer: trailerField.value || '',
      timestamp: new Date().toISOString()
    });
    
    // Store in localStorage as backup (using enhanced image)
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
    
    // Track upload error with driver pickup specific metadata
    trackEvent('pickup_confirmation_failed', {
      org: currentOrg || 'unknown',
      shipment_id: currentShipmentId || '',
      driver_name: driverName || '',
      error: error.message || 'Unknown error',
      error_message: error.message || 'Unknown error',
      upload_duration_ms: Date.now() - pickupStartTime,
      upload_success: false
    });
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
    signatureClearCount++;
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
  
  // Track app opened with full metadata
  trackEvent('app_opened', {});
  
  await apiCall('app_opened');
  
  // Check for auto-authenticate
  checkAutoAuth();
});


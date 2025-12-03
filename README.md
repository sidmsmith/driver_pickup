# Driver Pickup App

Driver pickup application for truck drivers to scan barcodes, view shipment information, and capture digital signatures.

## Features

- **Barcode Scanning**: Manual entry or camera-based scanning using QuaggaJS
- **Shipment Validation**: Validates barcode against Manhattan WMS Shipment API
- **Shipment Information Display**: Shows shipment details with editable fields
- **Digital Signature Capture**: Touch-friendly signature pad using Signature Pad.js
- **Signature Management**: Save (client-side), Clear, and Download signature functionality

## Setup

### Environment Variables (Vercel)

Set the following environment variables in Vercel:

- `MANHATTAN_PASSWORD` - Manhattan WMS password
- `MANHATTAN_SECRET` - Manhattan OAuth client secret

### Local Development

```bash
npm install
npm run dev
```

### Deployment

The app is configured for Vercel deployment. Push to GitHub and connect to Vercel.

## API Endpoints

- `POST /api/validate` - Main API endpoint
  - `action: 'app_opened'` - Track app usage
  - `action: 'auth'` - Authenticate with ORG
  - `action: 'validate_barcode'` - Validate shipment barcode

## Usage

1. Enter ORG and authenticate (or use `?Organization=XXX` URL parameter for auto-auth)
2. Enter or scan barcode/shipment ID
3. Review shipment information
4. Sign in the signature area
5. Save or download signature

## Notes

- Signature Save and Download are currently separate buttons for testing purposes
- Will eventually be combined into a single action
- Signatures are currently stored client-side only (may change in future)















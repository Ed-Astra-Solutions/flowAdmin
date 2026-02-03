/**
 * Flow Hydration Admin - API Configuration
 * 
 * Central configuration for all admin API endpoints.
 * Change the PRODUCTION_API_URL below to update all admin pages.
 */

// ============================================
// CHANGE THIS URL TO UPDATE ALL API ENDPOINTS
// ============================================
const PRODUCTION_API_URL = 'https://api.flowhydration.in';

// ============================================
// DO NOT MODIFY BELOW THIS LINE
// ============================================
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = IS_LOCAL ? '/api' : `${PRODUCTION_API_URL}/api`;
const API_BASE_URL = IS_LOCAL ? '/api' : `${PRODUCTION_API_URL}/api`;
const AUTH_API = IS_LOCAL ? '/api/admin' : `${PRODUCTION_API_URL}/api/admin`;
const UPLOAD_API = IS_LOCAL ? '/api/upload' : `${PRODUCTION_API_URL}/api/upload`;

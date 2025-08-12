// ==UserScript==
// @name Faction Hospital Details
// @namespace master.torn.hospital.details
// @version 1.4.0
// @description On faction profile pages, append a details row under members in Hospital using Torn v2 members API.
// @author VinPetrol [2060292]
// @match https://www.torn.com/factions.php*
// @run-at document-idle
// @grant  GM.xmlHttpRequest
// @grant  GM_xmlhttpRequest
// @connect api.torn.com
// ==/UserScript==

(function () {
  'use strict';

  // --- CONFIG ---
  const API_BASE = 'https://api.torn.com/v2';
  const XHR = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : GM_xmlhttpRequest;
  const STORAGE_KEY = 'tornHospitalDetailsApiKey_v2'; // Unique storage key

  // --- CUSTOM API KEY POPUP ---
  function createApiKeyPopup() {
    // Remove any existing popup
    const existingPopup = document.getElementById('torn-hospital-api-popup');
    if (existingPopup) {
      existingPopup.remove();
    }

    const popup = document.createElement('div');
    popup.id = 'torn-hospital-api-popup';
    popup.innerHTML = `
      <div class="torn-hospital-popup-overlay">
        <div class="torn-hospital-popup-content">
          <div class="torn-hospital-popup-header">
            <h3>Torn Hospital Details - API Key Required</h3>
          </div>
          <div class="torn-hospital-popup-body">
            <p>To show hospital details, please enter your Torn API key:</p>
            <ol>
              <li>Go to <a href="https://www.torn.com/preferences.php#tab=api" target="_blank">https://www.torn.com/preferences.php#tab=api</a></li>
              <li>Create a new API key with <strong>"Minimal"</strong> access level</li>
              <li>Copy and paste the key below</li>
            </ol>
            <div class="torn-hospital-input-group">
              <label for="torn-hospital-api-input">API Key:</label>
              <input type="text" id="torn-hospital-api-input" placeholder="Enter your API key here..." />
            </div>
            <div id="torn-hospital-popup-status" class="torn-hospital-status"></div>
          </div>
          <div class="torn-hospital-popup-footer">
            <button id="torn-hospital-validate-btn" class="torn-hospital-btn torn-hospital-btn-primary">Validate & Save</button>
            <button id="torn-hospital-cancel-btn" class="torn-hospital-btn torn-hospital-btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
    `;

    // Add CSS styles
    const style = document.createElement('style');
    style.textContent = `
      .torn-hospital-popup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        padding: 20px;
        box-sizing: border-box;
      }

      .torn-hospital-popup-content {
        background: #2a2a2a;
        border-radius: 8px;
        max-width: 500px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        color: #ddd;
        font-family: Arial, sans-serif;
      }

      .torn-hospital-popup-header {
        padding: 20px;
        border-bottom: 1px solid #444;
      }

      .torn-hospital-popup-header h3 {
        margin: 0;
        color: #fff;
        font-size: 18px;
      }

      .torn-hospital-popup-body {
        padding: 20px;
      }

      .torn-hospital-popup-body p {
        margin: 0 0 15px 0;
        line-height: 1.5;
      }

      .torn-hospital-popup-body ol {
        margin: 0 0 20px 0;
        padding-left: 20px;
      }

      .torn-hospital-popup-body li {
        margin-bottom: 8px;
        line-height: 1.4;
      }

      .torn-hospital-popup-body a {
        color: #4CAF50;
        text-decoration: none;
      }

      .torn-hospital-popup-body a:hover {
        text-decoration: underline;
      }

      .torn-hospital-input-group {
        margin: 20px 0;
      }

      .torn-hospital-input-group label {
        display: block;
        margin-bottom: 8px;
        font-weight: bold;
        color: #fff;
      }

      .torn-hospital-input-group input {
        width: 100%;
        padding: 12px;
        border: 1px solid #555;
        border-radius: 4px;
        background: #333;
        color: #fff;
        font-size: 14px;
        box-sizing: border-box;
      }

      .torn-hospital-input-group input:focus {
        outline: none;
        border-color: #4CAF50;
        box-shadow: 0 0 5px rgba(76, 175, 80, 0.3);
      }

      .torn-hospital-status {
        margin: 10px 0;
        padding: 10px;
        border-radius: 4px;
        font-size: 14px;
        text-align: center;
        display: none;
      }

      .torn-hospital-status.show {
        display: block;
      }

      .torn-hospital-status.success {
        background: #4CAF50;
        color: white;
      }

      .torn-hospital-status.error {
        background: #f44336;
        color: white;
      }

      .torn-hospital-status.loading {
        background: #2196F3;
        color: white;
      }

      .torn-hospital-popup-footer {
        padding: 20px;
        border-top: 1px solid #444;
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }

      .torn-hospital-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
        min-width: 100px;
      }

      .torn-hospital-btn-primary {
        background: #4CAF50;
        color: white;
      }

      .torn-hospital-btn-primary:hover {
        background: #45a049;
      }

      .torn-hospital-btn-primary:disabled {
        background: #666;
        cursor: not-allowed;
      }

      .torn-hospital-btn-secondary {
        background: #666;
        color: white;
      }

      .torn-hospital-btn-secondary:hover {
        background: #555;
      }

      /* Mobile styles */
      @media (max-width: 768px) {
        .torn-hospital-popup-overlay {
          padding: 10px;
        }

        .torn-hospital-popup-content {
          max-height: 95vh;
        }

        .torn-hospital-popup-header,
        .torn-hospital-popup-body,
        .torn-hospital-popup-footer {
          padding: 15px;
        }

        .torn-hospital-popup-footer {
          flex-direction: column;
        }

        .torn-hospital-btn {
          width: 100%;
          margin-bottom: 10px;
        }

        .torn-hospital-btn:last-child {
          margin-bottom: 0;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(popup);

    return popup;
  }

  // --- API KEY MANAGEMENT ---
  function getStoredApiKey() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      console.warn('[Torn Hospital Details] Error retrieving API key:', e);
      return null;
    }
  }

  function storeApiKey(apiKey) {
    try {
      localStorage.setItem(STORAGE_KEY, apiKey);
      return true;
    } catch (e) {
      console.error('[Torn Hospital Details] Error storing API key:', e);
      return false;
    }
  }

  function clearStoredApiKey() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (e) {
      console.error('[Torn Hospital Details] Error clearing API key:', e);
      return false;
    }
  }

  async function validateApiKey(apiKey) {
    return new Promise((resolve) => {
      const testUrl = `${API_BASE}/user?selections=basic&key=${encodeURIComponent(apiKey)}`;
      XHR({
        method: 'GET',
        url: testUrl,
        headers: { 'Accept': 'application/json' },
        timeout: 10000,
        onload: (res) => {
          resolve(res.status >= 200 && res.status < 300);
        },
        onerror: () => resolve(false),
        ontimeout: () => resolve(false),
      });
    });
  }

  function showApiKeyPopup() {
    return new Promise((resolve) => {
      const popup = createApiKeyPopup();
      const input = popup.querySelector('#torn-hospital-api-input');
      const validateBtn = popup.querySelector('#torn-hospital-validate-btn');
      const cancelBtn = popup.querySelector('#torn-hospital-cancel-btn');
      const status = popup.querySelector('#torn-hospital-popup-status');

      function showStatus(message, type) {
        status.textContent = message;
        status.className = `torn-hospital-status show ${type}`;
      }

      function hideStatus() {
        status.className = 'torn-hospital-status';
      }

      async function validateAndSave() {
        const apiKey = input.value.trim();
        
        if (!apiKey) {
          showStatus('Please enter an API key', 'error');
          return;
        }

        validateBtn.disabled = true;
        validateBtn.textContent = 'Validating...';
        showStatus('Validating API key, please wait...', 'loading');

        const isValid = await validateApiKey(apiKey);

        if (isValid) {
          const stored = storeApiKey(apiKey);
          if (stored) {
            showStatus('API key validated and saved successfully!', 'success');
            setTimeout(() => {
              popup.remove();
              resolve(apiKey);
            }, 1500);
          } else {
            showStatus('Error saving API key. Please try again.', 'error');
            validateBtn.disabled = false;
            validateBtn.textContent = 'Validate & Save';
          }
        } else {
          showStatus('Invalid API key. Please check and try again.', 'error');
          validateBtn.disabled = false;
          validateBtn.textContent = 'Validate & Save';
        }
      }

      function cancel() {
        popup.remove();
        resolve(null);
      }

      validateBtn.addEventListener('click', validateAndSave);
      cancelBtn.addEventListener('click', cancel);
      
      // Allow Enter key to validate
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          validateAndSave();
        }
      });

      // Focus the input
      setTimeout(() => input.focus(), 100);
    });
  }

  async function ensureApiKey() {
    let apiKey = getStoredApiKey();
    
    if (!apiKey) {
      console.log('[Torn Hospital Details] No API key found, showing popup...');
      apiKey = await showApiKeyPopup();
      
      if (!apiKey) {
        console.log('[Torn Hospital Details] No API key provided, script disabled.');
        return null;
      }
    }
    
    return apiKey;
  }

  // --- UTILITY FUNCTIONS FOR USERS ---
  // Add global functions for API key management
  window.tornHospitalDetails = {
    async resetApiKey() {
      const confirmed = confirm('This will delete your stored API key and prompt you to enter a new one. Continue?');
      if (confirmed) {
        try {
          clearStoredApiKey();
          alert('API key cleared. Please refresh the page to enter a new one.');
          location.reload();
        } catch (e) {
          console.error('[Torn Hospital Details] Error clearing API key:', e);
          alert('Error clearing API key.');
        }
      }
    },
    async changeApiKey() {
      const newKey = await showApiKeyPopup();
      if (newKey) {
        alert('API key updated successfully. Refreshing page...');
        location.reload();
      }
    },
    getVersion() {
      return '1.4.0';
    },
    getStoredKey() {
      const key = getStoredApiKey();
      if (key) {
        return key.substring(0, 8) + '...'; // Show only first 8 chars for security
      }
      return 'No key stored';
    }
  };

  // Initialize when DOM is ready
  function waitForDOMReady() {
    return new Promise((resolve) => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resolve);
      } else {
        resolve();
      }
    });
  }

  // Main initialization
  async function initialize() {
    try {
      console.log('[Torn Hospital Details] Starting initialization...');
      
      // Wait for DOM to be ready
      await waitForDOMReady();
      
      // Check if we're on the right page
      const url = new URL(window.location.href);
      if (url.pathname !== '/factions.php' || url.searchParams.get('step') !== 'profile') {
        console.log('[Torn Hospital Details] Not on faction profile page, skipping');
        return;
      }

      const factionId = url.searchParams.get('ID');
      if (!factionId) {
        console.log('[Torn Hospital Details] No faction ID found, skipping');
        return;
      }

      // Get API key
      console.log('[Torn Hospital Details] Checking for API key...');
      const apiKey = await ensureApiKey();
      
      if (!apiKey) {
        console.warn('[Torn Hospital Details] No API key available, script disabled');
        return;
      }

      console.log('[Torn Hospital Details] API key found, initializing script...');
      API_KEY = apiKey;
      
      // Initialize the main script functionality
      initializeHospitalDetails(factionId);
      
    } catch (error) {
      console.error('[Torn Hospital Details] Initialization error:', error);
    }
  }

  let API_KEY = null;

  function initializeHospitalDetails(factionId) {
    console.log('[Torn Hospital Details] Script loaded successfully');
    console.log('[Torn Hospital Details] Available commands:');
    console.log('  - tornHospitalDetails.changeApiKey()');
    console.log('  - tornHospitalDetails.resetApiKey()');
    console.log('  - tornHospitalDetails.getVersion()');
    console.log('  - tornHospitalDetails.getStoredKey()');
    
    // Inject styles for responsive design
    injectStyles();

    // --- Styles to match native table cells ---
    function injectStyles() {
      const css = `
        li.hospital-extra-row {
          background: inherit !important;
          border-top: 1px solid rgba(255,255,255,0.08) !important;
          min-height: auto !important;
          height: auto !important;
          display: grid !important;
          grid-template-columns: 1fr 1fr 1fr !important;
          gap: 0 !important;
          align-items: stretch !important;
          padding: 8px 0 !important;
        }
        
        /* Tablet layout */
        @media (max-width: 1024px) and (min-width: 769px) {
          li.hospital-extra-row {
            grid-template-columns: 2fr 1fr 1fr !important;
          }
        }
        
        li.hospital-extra-row .hospital-extra-cell {
          padding: 8px 15px !important;
          white-space: normal !important;
          color: inherit !important;
          font-size: inherit !important;
          line-height: inherit !important;
          overflow: visible !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: center !important;
          opacity: 0.85 !important;
          font-family: inherit !important;
          font-weight: inherit !important;
          text-shadow: none !important;
          word-wrap: break-word !important;
          text-align: center !important;
          min-height: 50px !important;
          height: auto !important;
        }
        
        li.hospital-extra-row .hospital-label {
          font-weight: bold !important;
          display: block !important;
          margin-bottom: 4px !important;
          font-size: 0.9em !important;
          opacity: 0.8 !important;
          line-height: 1.2 !important;
        }
        
        li.hospital-extra-row .hospital-value {
          font-weight: normal !important;
          display: block !important;
          line-height: 1.3 !important;
          flex: 1 !important;
        }
        
        /* Mobile: Smaller text and better spacing */
        @media (max-width: 768px) {
          li.hospital-extra-row {
            padding: 10px 0 !important;
          }
          
          li.hospital-extra-row .hospital-extra-cell {
            padding: 8px 8px !important;
            text-align: center !important;
            min-height: 45px !important;
          }
          
          li.hospital-extra-row .hospital-label {
            font-size: 10px !important;
            margin-bottom: 3px !important;
            line-height: 1.2 !important;
          }
          
          li.hospital-extra-row .hospital-value {
            font-size: 11px !important;
            line-height: 1.3 !important;
          }
        }
        
        /* Very small mobile screens */
        @media (max-width: 480px) {
          li.hospital-extra-row {
            padding: 8px 0 !important;
          }
          
          li.hospital-extra-row .hospital-extra-cell {
            padding: 6px 6px !important;
            min-height: 40px !important;
          }
          
          li.hospital-extra-row .hospital-label {
            font-size: 9px !important;
            margin-bottom: 2px !important;
          }
          
          li.hospital-extra-row .hospital-value {
            font-size: 10px !important;
          }
        }
      `;
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }

    // --- Helpers ---
    function debounce(fn, wait = 150) {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
      };
    }

    function fmtBool(v) {
      if (typeof v === 'boolean') return v ? 'Yes' : 'No';
      return String(v);
    }

    function fmtUntil(epochSeconds, isLive = false) {
      if (!epochSeconds || isNaN(epochSeconds)) return 'N/A';
      
      const now = Math.floor(Date.now() / 1000);
      const remaining = epochSeconds - now;
      
      if (remaining <= 0) return 'Released';
      
      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;
      
      const parts = [];
      if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
      if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
      if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
      if (seconds > 0 || parts.length === 0) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
      
      return parts.join(', ');
    }

    function buildInfoRow({ until, is_revivable, has_early_discharge }, xid) {
      const li = document.createElement('li');
      li.className = 'table-row hospital-extra-row';
      li.setAttribute('data-xid', xid);

      // Cell 1: Time Left in Hospital
      const cell1 = document.createElement('div');
      cell1.className = 'table-cell hospital-extra-cell';
      const label1 = document.createElement('span');
      label1.className = 'hospital-label';
      label1.textContent = 'Time Left in Hospital';
      const timerSpan = document.createElement('span');
      timerSpan.className = 'hospital-value hospital-timer';
      timerSpan.setAttribute('data-until', until);
      timerSpan.textContent = fmtUntil(until);
      cell1.appendChild(label1);
      cell1.appendChild(timerSpan);

      // Cell 2: Is Revivable
      const cell2 = document.createElement('div');
      cell2.className = 'table-cell hospital-extra-cell';
      const label2 = document.createElement('span');
      label2.className = 'hospital-label';
      label2.textContent = 'Is Revivable';
      const value2 = document.createElement('span');
      value2.className = 'hospital-value';
      value2.textContent = fmtBool(is_revivable);
      cell2.appendChild(label2);
      cell2.appendChild(value2);

      // Cell 3: Early Discharge
      const cell3 = document.createElement('div');
      cell3.className = 'table-cell hospital-extra-cell';
      const label3 = document.createElement('span');
      label3.className = 'hospital-label';
      label3.textContent = 'Early Discharge';
      const value3 = document.createElement('span');
      value3.className = 'hospital-value';
      value3.textContent = fmtBool(has_early_discharge);
      cell3.appendChild(label3);
      cell3.appendChild(value3);

      li.appendChild(cell1);
      li.appendChild(cell2);
      li.appendChild(cell3);
      return li;
    }

    function getXIDFromRow(row) {
      // Look for any anchor pointing to /profiles.php?XID=
      const a = row.querySelector('a[href*="/profiles.php?XID="], a.linkWrap___ZS6r9[href*="/profiles.php?XID="]');
      if (!a) return null;
      const m = a.getAttribute('href').match(/XID=(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    }

    function hasInjectedRowAfter(row) {
      const next = row.nextElementSibling;
      return next && next.classList.contains('hospital-extra-row');
    }

    function isHospitalRow(row) {
      // Prefer the last cell (Status column) if present
      const statusCell =
        row.querySelector('.table-cell.status') ||
        row.querySelector('.table-cell:last-child');
      if (!statusCell) return false;
      const text = statusCell.textContent.trim().toLowerCase();
      return text.includes('hospital');
    }

    // --- API ---
    function fetchMembers(factionId) {
      return new Promise((resolve, reject) => {
        if (!API_KEY) {
          reject(new Error('No API key available'));
          return;
        }
        
        const u = `${API_BASE}/faction/${encodeURIComponent(factionId)}/members?striptags=true&comment=api_test&key=${encodeURIComponent(API_KEY)}`;
        XHR({
          method: 'GET',
          url: u,
          headers: { 'Accept': 'application/json' },
          timeout: 10000, // 10 second timeout
          onload: (res) => {
            try {
              if (res.status < 200 || res.status >= 300) {
                console.error('[Torn Hospital Details] API error:', res.status, res.statusText);
                return reject(new Error(`API error ${res.status}: ${res.statusText}`));
              }
              const data = JSON.parse(res.responseText);
              if (!data || !Array.isArray(data.members)) {
                console.error('[Torn Hospital Details] Unexpected API payload:', data);
                return reject(new Error('Unexpected API payload structure'));
              }
              console.log(`[Torn Hospital Details] Successfully fetched ${data.members.length} members`);
              resolve(data.members);
            } catch (e) {
              console.error('[Torn Hospital Details] Error parsing API response:', e);
              reject(e);
            }
          },
          onerror: (err) => {
            console.error('[Torn Hospital Details] Network error:', err);
            reject(new Error('Network error occurred'));
          },
          ontimeout: () => {
            console.error('[Torn Hospital Details] API request timed out');
            reject(new Error('API request timed out'));
          },
        });
      });
    }

    let membersById = null;
    let processing = false;
    let timerInterval = null;
    let lastStatusSnapshot = new Map(); // Track last known statuses to detect changes

    // --- Real-time timer updates ---
    function updateTimers() {
      const timers = document.querySelectorAll('.hospital-timer[data-until]');
      timers.forEach(timer => {
        const until = parseInt(timer.getAttribute('data-until'), 10);
        const newText = fmtUntil(until);
        if (timer.textContent !== newText) {
          timer.textContent = newText;
          
          // If timer shows "Released", trigger a status check
          if (newText === 'Released') {
            setTimeout(() => checkForStatusChanges(), 1000);
          }
        }
      });
    }

    function startTimerUpdates() {
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(updateTimers, 1000);
    }

    function stopTimerUpdates() {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }

    // --- Status change detection ---
    function getCurrentStatusSnapshot() {
      const snapshot = new Map();
      const list = document.querySelector('ul.table-body') || document.querySelector('ul.faction-members .table-body');
      if (!list) return snapshot;

      const rows = list.querySelectorAll(':scope > li.table-row:not(.hospital-extra-row)');
      rows.forEach(row => {
        const xid = getXIDFromRow(row);
        if (!xid) return;

        const statusCell = row.querySelector('.table-cell.status') || row.querySelector('.table-cell:last-child');
        if (statusCell) {
          const status = statusCell.textContent.trim().toLowerCase();
          snapshot.set(xid, status);
        }
      });
      return snapshot;
    }

    async function checkForStatusChanges() {
      const currentSnapshot = getCurrentStatusSnapshot();
      let hasChanges = false;

      // Check if any hospital members are no longer in hospital
      for (const [xid, oldStatus] of lastStatusSnapshot) {
        const newStatus = currentSnapshot.get(xid);
        if (oldStatus.includes('hospital') && newStatus && !newStatus.includes('hospital')) {
          hasChanges = true;
          console.log(`[Torn Hospital Details] Status change detected for XID ${xid}: ${oldStatus} -> ${newStatus}`);
        }
      }

      // Check if any new members entered hospital
      for (const [xid, newStatus] of currentSnapshot) {
        const oldStatus = lastStatusSnapshot.get(xid);
        if (newStatus.includes('hospital') && (!oldStatus || !oldStatus.includes('hospital'))) {
          hasChanges = true;
          console.log(`[Torn Hospital Details] New hospital member detected: XID ${xid}`);
        }
      }

      lastStatusSnapshot = currentSnapshot;

      if (hasChanges) {
        console.log('[Torn Hospital Details] Status changes detected, refreshing API data...');
        membersById = null; // Invalidate cache
        await processTableOnce(); // Refresh the display
      }
    }

    async function ensureMembersLoaded() {
      if (membersById) return;
      
      try {
        console.log('[Torn Hospital Details] Fetching members data...');
        const members = await fetchMembers(factionId);
        membersById = new Map(members.map(m => [Number(m.id), m]));
        console.log(`[Torn Hospital Details] Loaded ${membersById.size} members into cache`);
      } catch (error) {
        console.error('[Torn Hospital Details] Failed to load members:', error);
        // Don't throw - let the script continue but log the error
        // This allows the user to try again later or fix API key issues
      }
    }

    async function processTableOnce() {
      if (processing) return;
      processing = true;
      try {
        await ensureMembersLoaded();
        
        // If we don't have members data, don't try to process
        if (!membersById) {
          console.warn('[Torn Hospital Details] No members data available, skipping processing');
          return;
        }

        const list =
          document.querySelector('ul.table-body') ||
          document.querySelector('ul.faction-members .table-body');
        if (!list) return;

        const rows = list.querySelectorAll(':scope > li.table-row');
        let hasHospitalRows = false;

        rows.forEach(row => {
          if (!isHospitalRow(row)) return;
          if (hasInjectedRowAfter(row)) {
            // Update existing row
            const existingRow = row.nextElementSibling;
            const xid = getXIDFromRow(row);
            if (xid) {
              const m = membersById.get(Number(xid));
              if (m && m.status && m.status.state === 'Hospital') {
                const timer = existingRow.querySelector('.hospital-timer[data-until]');
                if (timer) {
                  timer.setAttribute('data-until', m.status.until);
                  timer.textContent = fmtUntil(m.status.until);
                }
                hasHospitalRows = true;
              } else {
                // Member no longer in hospital, remove the detail row
                existingRow.remove();
              }
            }
            return;
          }

          const xid = getXIDFromRow(row);
          if (!xid) return;

          const m = membersById.get(Number(xid));
          if (!m || !m.status || m.status.state !== 'Hospital') return;

          const infoRow = buildInfoRow({
            until: m.status.until,
            is_revivable: !!m.is_revivable,
            has_early_discharge: !!m.has_early_discharge
          }, xid);

          row.insertAdjacentElement('afterend', infoRow);
          hasHospitalRows = true;
        });

        // Start or stop timer updates based on whether we have hospital rows
        if (hasHospitalRows) {
          startTimerUpdates();
        } else {
          stopTimerUpdates();
        }

        // Update status snapshot for change detection
        lastStatusSnapshot = getCurrentStatusSnapshot();

      } catch (e) {
        console.warn('[Torn Hospital Details] Error in processTableOnce:', e);
      } finally {
        processing = false;
      }
    }

    const run = debounce(processTableOnce, 200);
    run();

    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });

    // Periodic status change check (every 30 seconds)
    const statusCheckInterval = setInterval(checkForStatusChanges, 30000);

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      stopTimerUpdates();
      clearInterval(statusCheckInterval);
    });

    // React to SPA-like URL changes
    let lastHref = location.href;
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        const newUrl = new URL(location.href);
        if (newUrl.pathname === '/factions.php' && newUrl.searchParams.get('step') === 'profile') {
          const newFactionId = newUrl.searchParams.get('ID');
          if (newFactionId && newFactionId !== factionId) {
            factionId = newFactionId;
            membersById = null; // reset cache for new faction
            lastStatusSnapshot.clear(); // reset status tracking
          }
          run();
        } else {
          // Not on faction profile page, stop timers
          stopTimerUpdates();
          lastStatusSnapshot.clear();
        }
      }
    }, 500);

  } // End of initializeHospitalDetails()

  // Start initialization
  initialize();

})();
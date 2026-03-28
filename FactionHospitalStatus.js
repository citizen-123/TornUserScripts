// ==UserScript==
// @name         Faction Hospital Status
// @namespace    master.torn.hospital.details
// @version      1.6.0
// @description  On faction profile pages, append a details row under members in Hospital using Torn v2 members API.
// @author       VinPetrol [2060292]
// @match        https://www.torn.com/*
// @run-at       document-idle
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// @updateURL    https://raw.githubusercontent.com/citizen-123/TornUserScripts/refs/heads/main/FactionHospitalStatus.js
// @downloadURL  https://raw.githubusercontent.com/citizen-123/TornUserScripts/refs/heads/main/FactionHospitalStatus.js
// ==/UserScript==

(function () {
  'use strict';

  // --- CONFIG ---
  const API_BASE = 'https://api.torn.com/v2';
  const STORAGE_KEY = 'factionHospitalStatusApiKey_v1';
  const SCRIPT_VERSION = '1.6.0';

  // TornPDA injects the user's API key by replacing this placeholder at load time
  const PDA_API_KEY = '###PDA-APIKEY###';
  const IS_PDA = PDA_API_KEY !== '###PDA-APIKEY###';

  // --- XHR with fetch fallback for TornPDA ---
  function fetchFallback(opts) {
    fetch(opts.url, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      signal: AbortSignal.timeout(opts.timeout || 10000),
    })
      .then(async (res) => {
        const text = await res.text();
        if (opts.onload) opts.onload({ status: res.status, statusText: res.statusText, responseText: text });
      })
      .catch((err) => {
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
          if (opts.ontimeout) opts.ontimeout();
        } else {
          if (opts.onerror) opts.onerror(err);
        }
      });
  }

  const XHR = (typeof GM !== 'undefined' && GM.xmlHttpRequest)
    ? GM.xmlHttpRequest
    : (typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : fetchFallback);

  // --- PROFILE PAGE SETTINGS PANEL ---
  function getLoggedInUserXID() {
    // Try sidebar/nav selectors that point to the logged-in user's profile
    const selectors = [
      '#sidebarroot a[class*="profileLink"]',
      '#sidebar a[href*="/profiles.php?XID="]',
      'a[class*="menu-value___"][href*="/profiles.php?XID="]',
      '.settings-menu > .link > a[href*="/profiles.php?XID="]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const match = el.getAttribute('href')?.match(/XID=(\d+)/);
        if (match) return match[1];
      }
    }
    return null;
  }

  function injectSettingsPanel() {
    if (IS_PDA) return; // Key is managed by TornPDA

    const url = new URL(window.location.href);
    if (url.pathname !== '/profiles.php') return;

    const pageXID = url.searchParams.get('XID');
    if (!pageXID) return;

    const ownXID = getLoggedInUserXID();
    if (!ownXID || ownXID !== pageXID) return;

    // Don't inject twice
    if (document.getElementById('fhs-settings-panel')) return;

    const waitForProfile = () => {
      const anchor = document.querySelector('.profile-wrapper') ||
                     document.querySelector('.basic-information') ||
                     document.querySelector('#profileroot');
      if (anchor) {
        const panel = createSettingsPanel();
        anchor.parentNode.insertBefore(panel, anchor.nextSibling);
      } else {
        setTimeout(waitForProfile, 500);
      }
    };
    waitForProfile();
  }

  function createSettingsPanel() {
    const storedKey = getStoredApiKey() || '';

    const details = document.createElement('details');
    details.id = 'fhs-settings-panel';
    details.className = 'fhs-settings-accordion';
    if (!storedKey) details.open = true; // Auto-open if no key set

    const summary = document.createElement('summary');
    summary.className = 'fhs-settings-summary';
    summary.textContent = `Faction Hospital Status v${SCRIPT_VERSION}`;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'fhs-settings-body';
    body.innerHTML = `
      <p class="fhs-settings-desc">Enter your Torn API key to enable hospital status details on faction pages.
        You can create one at <a href="/preferences.php#tab=api" target="_blank">Preferences &gt; API</a> with <strong>Public</strong> access.</p>
      <div class="fhs-settings-row">
        <label for="fhs-api-key-input">API Key:</label>
        <input type="text" id="fhs-api-key-input" class="fhs-api-input fhs-blur"
               placeholder="Paste your API key here..." value="${storedKey}" autocomplete="off" />
        <button id="fhs-save-btn" class="fhs-btn fhs-btn-primary">Save</button>
        <button id="fhs-clear-btn" class="fhs-btn fhs-btn-secondary">Clear</button>
      </div>
      <div id="fhs-settings-status" class="fhs-settings-status"></div>
    `;
    details.appendChild(body);

    // Inject styles
    if (!document.getElementById('fhs-settings-styles')) {
      const style = document.createElement('style');
      style.id = 'fhs-settings-styles';
      style.textContent = `
        .fhs-settings-accordion {
          margin: 10px 0;
          padding: 0;
          background: #1a1a2e;
          border: 1px solid #444;
          border-radius: 5px;
          color: #ddd;
          font-family: Arial, sans-serif;
          font-size: 13px;
        }
        .fhs-settings-summary {
          padding: 10px 14px;
          cursor: pointer;
          font-weight: bold;
          color: #fff;
          user-select: none;
        }
        .fhs-settings-summary:hover {
          background: rgba(255,255,255,0.05);
        }
        .fhs-settings-body {
          padding: 0 14px 14px;
        }
        .fhs-settings-desc {
          margin: 0 0 12px;
          line-height: 1.5;
        }
        .fhs-settings-desc a {
          color: #4CAF50;
          text-decoration: none;
        }
        .fhs-settings-desc a:hover {
          text-decoration: underline;
        }
        .fhs-settings-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .fhs-settings-row label {
          font-weight: bold;
          color: #fff;
          white-space: nowrap;
        }
        .fhs-api-input {
          flex: 1;
          min-width: 180px;
          padding: 7px 10px;
          background: #333;
          color: #fff;
          border: 1px solid #555;
          border-radius: 4px;
          font-size: 13px;
        }
        .fhs-api-input:focus {
          outline: none;
          border-color: #4CAF50;
          box-shadow: 0 0 4px rgba(76,175,80,0.3);
        }
        .fhs-api-input.fhs-blur {
          filter: blur(3px);
          transition: filter 0.3s;
        }
        .fhs-api-input.fhs-blur:focus {
          filter: blur(0);
        }
        .fhs-btn {
          padding: 7px 14px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          transition: background-color 0.2s;
        }
        .fhs-btn-primary {
          background: #4CAF50;
          color: #fff;
        }
        .fhs-btn-primary:hover { background: #45a049; }
        .fhs-btn-primary:disabled { background: #666; cursor: not-allowed; }
        .fhs-btn-secondary {
          background: #666;
          color: #fff;
        }
        .fhs-btn-secondary:hover { background: #555; }
        .fhs-settings-status {
          margin-top: 8px;
          padding: 0;
          font-size: 13px;
          border-radius: 4px;
          display: none;
        }
        .fhs-settings-status.show {
          display: block;
          padding: 8px 10px;
        }
        .fhs-settings-status.success { background: #4CAF50; color: #fff; }
        .fhs-settings-status.error { background: #f44336; color: #fff; }
        .fhs-settings-status.loading { background: #2196F3; color: #fff; }
        @media (max-width: 600px) {
          .fhs-settings-row { flex-direction: column; align-items: stretch; }
          .fhs-api-input { min-width: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    // Wire up events after insertion
    setTimeout(() => {
      const input = document.getElementById('fhs-api-key-input');
      const saveBtn = document.getElementById('fhs-save-btn');
      const clearBtn = document.getElementById('fhs-clear-btn');
      const status = document.getElementById('fhs-settings-status');

      function showStatus(msg, type) {
        status.textContent = msg;
        status.className = `fhs-settings-status show ${type}`;
      }

      saveBtn.addEventListener('click', async () => {
        const key = input.value.trim();
        if (!key) { showStatus('Please enter an API key.', 'error'); return; }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Validating...';
        showStatus('Validating API key...', 'loading');

        const valid = await validateApiKey(key);
        if (valid) {
          storeApiKey(key);
          showStatus('API key saved! Hospital details will appear on faction pages.', 'success');
        } else {
          showStatus('Invalid API key. Check your key and try again.', 'error');
        }
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      });

      clearBtn.addEventListener('click', () => {
        clearStoredApiKey();
        input.value = '';
        showStatus('API key cleared.', 'success');
      });

      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveBtn.click();
      });
    }, 0);

    return details;
  }

  // --- API KEY MANAGEMENT ---
  function getStoredApiKey() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      console.warn('[Faction Hospital Status] Error retrieving API key:', e);
      return null;
    }
  }

  function storeApiKey(apiKey) {
    try {
      localStorage.setItem(STORAGE_KEY, apiKey);
      return true;
    } catch (e) {
      console.error('[Faction Hospital Status] Error storing API key:', e);
      return false;
    }
  }

  function clearStoredApiKey() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (e) {
      console.error('[Faction Hospital Status] Error clearing API key:', e);
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

  function ensureApiKey() {
    if (IS_PDA) return PDA_API_KEY;
    return getStoredApiKey();
  }

  // --- UTILITY FUNCTIONS FOR USERS ---
  window.tornHospitalDetails = {
    resetApiKey() {
      if (IS_PDA) { alert('API key is managed by TornPDA. Change it in the app settings.'); return; }
      const confirmed = confirm('This will delete your stored API key. Continue?');
      if (confirmed) {
        clearStoredApiKey();
        alert('API key cleared. Visit your profile page to set a new one.');
      }
    },
    getVersion() {
      return SCRIPT_VERSION;
    },
    getStoredKey() {
      if (IS_PDA) return 'Managed by TornPDA';
      const key = getStoredApiKey();
      return key ? key.substring(0, 8) + '...' : 'No key stored';
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

  // Show a non-intrusive banner on the faction page when no API key is configured
  function showNoKeyBanner() {
    const ownXID = getLoggedInUserXID();
    const profileLink = ownXID ? `/profiles.php?XID=${ownXID}` : '/profiles.php';
    const list = document.querySelector('ul.table-body') || document.querySelector('ul.faction-members .table-body');
    if (list && !list.querySelector('.hospital-setup-banner')) {
      const banner = document.createElement('li');
      banner.className = 'hospital-setup-banner';
      banner.style.cssText = 'padding:10px 12px;background:#1a1a2e;border:1px solid #444;margin:4px 0;border-radius:4px;font-size:13px;color:#ddd;';
      banner.innerHTML = `<strong>[Hospital Status]</strong> API key not configured. <a href="${profileLink}" style="color:#4CAF50;">Go to your profile</a> to set it up.`;
      list.prepend(banner);
    }
  }

  // Main initialization
  async function initialize() {
    try {
      console.log('[Faction Hospital Status] Starting initialization...');

      await waitForDOMReady();

      const url = new URL(window.location.href);

      // Profile page: inject settings panel for own profile
      if (url.pathname === '/profiles.php') {
        injectSettingsPanel();
        return;
      }

      // Faction page: run hospital details
      if (url.pathname !== '/factions.php' || url.searchParams.get('step') !== 'profile') {
        return;
      }

      const factionId = url.searchParams.get('ID');
      if (!factionId) return;

      const apiKey = ensureApiKey();
      if (!apiKey) {
        console.log('[Faction Hospital Status] No API key configured');
        // Wait a moment for the member list to render, then show banner
        setTimeout(showNoKeyBanner, 1000);
        return;
      }

      console.log('[Faction Hospital Status] API key found, initializing script...');
      API_KEY = apiKey;
      initializeHospitalDetails(factionId);

    } catch (error) {
      console.error('[Faction Hospital Status] Initialization error:', error);
    }
  }

  let API_KEY = null;

  function initializeHospitalDetails(factionId) {
    console.log('[Faction Hospital Status] Script loaded successfully');
    
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
      li.setAttribute('data-hospital-details', 'true'); // Mark for easy identification

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
      // Skip if this is a hospital details row
      if (row.classList.contains('hospital-extra-row')) return false;
      
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
              if (data && data.error) {
                const errCode = data.error.code;
                const errMsg = data.error.error || 'Unknown API error';
                console.error(`[Torn Hospital Details] Torn API error code ${errCode}: ${errMsg}`);
                // For invalid/incorrect key errors, clear stored key so user gets re-prompted
                if (errCode === 1 || errCode === 2 || errCode === 10) {
                  try { localStorage.removeItem(STORAGE_KEY); } catch(e) { /* ignore */ }
                  API_KEY = null;
                }
                return reject(new Error(`Torn API error (code ${errCode}): ${errMsg}`));
              }
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
    let lastProcessedRowOrder = []; // Track the order of player rows to detect sorting
    let releasedCheckTimeout = null; // Debounce for "Released" timer triggers

    // --- Table structure monitoring ---
    function getCurrentRowOrder() {
      const list = document.querySelector('ul.table-body') || document.querySelector('ul.faction-members .table-body');
      if (!list) return [];

      const rows = list.querySelectorAll(':scope > li.table-row:not(.hospital-extra-row)');
      return Array.from(rows).map(row => getXIDFromRow(row)).filter(xid => xid !== null);
    }

    function hasTableBeenSorted() {
      const currentOrder = getCurrentRowOrder();
      const orderChanged = JSON.stringify(currentOrder) !== JSON.stringify(lastProcessedRowOrder);
      if (orderChanged) {
        console.log('[Faction Hospital Status] Table order changed - sorting detected');
        lastProcessedRowOrder = [...currentOrder];
      }
      return orderChanged;
    }

    // --- Clean up orphaned hospital rows ---
    function removeAllHospitalRows() {
      const list = document.querySelector('ul.table-body') || document.querySelector('ul.faction-members .table-body');
      if (!list) return;

      const hospitalRows = list.querySelectorAll('.hospital-extra-row');
      hospitalRows.forEach(row => {
        console.log('[Faction Hospital Status] Removing hospital row for XID:', row.getAttribute('data-xid'));
        row.remove();
      });
    }

    function removeOrphanedHospitalRows() {
      const list = document.querySelector('ul.table-body') || document.querySelector('ul.faction-members .table-body');
      if (!list) return;

      const hospitalRows = list.querySelectorAll('.hospital-extra-row');
      hospitalRows.forEach(row => {
        const xid = row.getAttribute('data-xid');
        const prevRow = row.previousElementSibling;
        
        // Check if the previous row is the correct player row
        const prevXid = prevRow ? getXIDFromRow(prevRow) : null;
        const isCorrectlyPositioned = prevXid && prevXid.toString() === xid;
        const isPrevRowHospital = prevRow ? isHospitalRow(prevRow) : false;
        
        if (!isCorrectlyPositioned || !isPrevRowHospital) {
          console.log('[Faction Hospital Status] Removing orphaned hospital row for XID:', xid);
          row.remove();
        }
      });
    }

    // --- Real-time timer updates ---
    function updateTimers() {
      const timers = document.querySelectorAll('.hospital-timer[data-until]');
      timers.forEach(timer => {
        const until = parseInt(timer.getAttribute('data-until'), 10);
        const newText = fmtUntil(until);
        if (timer.textContent !== newText) {
          timer.textContent = newText;
          
          // If timer shows "Released", trigger a debounced status check
          if (newText === 'Released' && !releasedCheckTimeout) {
            releasedCheckTimeout = setTimeout(() => {
              releasedCheckTimeout = null;
              checkForStatusChanges();
            }, 1000);
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
      if (releasedCheckTimeout) {
        clearTimeout(releasedCheckTimeout);
        releasedCheckTimeout = null;
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
          console.log(`[Faction Hospital Status] Status change detected for XID ${xid}: ${oldStatus} -> ${newStatus}`);
        }
      }

      // Check if any new members entered hospital
      for (const [xid, newStatus] of currentSnapshot) {
        const oldStatus = lastStatusSnapshot.get(xid);
        if (newStatus.includes('hospital') && (!oldStatus || !oldStatus.includes('hospital'))) {
          hasChanges = true;
          console.log(`[Faction Hospital Status] New hospital member detected: XID ${xid}`);
        }
      }

      lastStatusSnapshot = currentSnapshot;

      if (hasChanges) {
        console.log('[Faction Hospital Status] Status changes detected, refreshing API data...');
        membersById = null; // Invalidate cache
        await processTableOnce(); // Refresh the display
      }
    }

    async function ensureMembersLoaded() {
      if (membersById) return;

      const maxRetries = 3;
      const baseDelay = 2000;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[Faction Hospital Status] Fetching members data (attempt ${attempt}/${maxRetries})...`);
          const members = await fetchMembers(factionId);
          membersById = new Map(members.map(m => [Number(m.id), m]));
          console.log(`[Faction Hospital Status] Loaded ${membersById.size} members into cache`);
          return;
        } catch (error) {
          console.error(`[Faction Hospital Status] Attempt ${attempt} failed:`, error);

          // Don't retry for auth errors — these won't resolve by retrying
          if (error.message && error.message.includes('Torn API error')) {
            break;
          }

          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`[Faction Hospital Status] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // All retries exhausted — show user-visible error
      console.error('[Faction Hospital Status] Failed to load members after all retries');
      const list = document.querySelector('ul.table-body') || document.querySelector('ul.faction-members .table-body');
      if (list && !list.querySelector('.hospital-error-banner')) {
        const banner = document.createElement('li');
        banner.className = 'hospital-error-banner';
        banner.style.cssText = 'padding:8px 12px;color:#d32f2f;background:#fff3f3;border:1px solid #d32f2f;margin:4px 0;font-size:12px;border-radius:4px;';
        banner.textContent = '[Hospital Status] Failed to load data after multiple attempts. Will retry on next status change.';
        list.prepend(banner);
      }
    }

    async function processTableOnce() {
      if (processing) return;
      processing = true;
      try {
        // Clear any previous error banner
        const existingBanner = document.querySelector('.hospital-error-banner');
        if (existingBanner) existingBanner.remove();

        await ensureMembersLoaded();

        // If we don't have members data, don't try to process
        if (!membersById) {
          console.warn('[Faction Hospital Status] No members data available, skipping processing');
          return;
        }

        const list =
          document.querySelector('ul.table-body') ||
          document.querySelector('ul.faction-members .table-body');
        if (!list) return;

        // Check if table has been sorted - if so, clean up all hospital rows first
        if (hasTableBeenSorted()) {
          console.log('[Faction Hospital Status] Sorting detected, cleaning up all hospital rows');
          removeAllHospitalRows();
        } else {
          // Just clean up orphaned rows if no sorting detected
          removeOrphanedHospitalRows();
        }

        const rows = list.querySelectorAll(':scope > li.table-row:not(.hospital-extra-row)');
        let hasHospitalRows = false;

        rows.forEach(row => {
          if (!isHospitalRow(row)) return;
          
          // Check if we already have a hospital row after this one
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
          console.log(`[Faction Hospital Status] Added hospital details for XID ${xid}`);
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
        console.warn('[Faction Hospital Status] Error in processTableOnce:', e);
      } finally {
        processing = false;
      }
    }

    // Enhanced debouncing with special handling for sorting
    function createSmartDebouncer() {
      let normalTimeout = null;
      let sortingTimeout = null;
      let lastMutationTime = 0;
      
      return function(mutationRecords) {
        const now = Date.now();
        lastMutationTime = now;
        
        // Clear existing timeouts
        clearTimeout(normalTimeout);
        clearTimeout(sortingTimeout);
        
        // Check if this looks like a sorting operation (many DOM changes at once)
        const hasMultipleChanges = mutationRecords && mutationRecords.length > 5;
        const hasListChanges = mutationRecords && mutationRecords.some(record => 
          record.type === 'childList' && 
          (record.target.classList.contains('table-body') || 
           record.target.querySelector('.table-body'))
        );
        
        if (hasMultipleChanges || hasListChanges) {
          console.log('[Faction Hospital Status] Detected potential sorting operation, using extended delay');
          // Use longer delay for potential sorting operations
          sortingTimeout = setTimeout(() => {
            // Double-check that no more mutations happened recently
            if (Date.now() - lastMutationTime >= 450) {
              processTableOnce();
            }
          }, 500);
        } else {
          // Use normal delay for other changes
          normalTimeout = setTimeout(processTableOnce, 150);
        }
      };
    }

    const smartRun = createSmartDebouncer();
    
    // Initial run
    smartRun();

    // Set up mutation observer with improved handling
    const observer = new MutationObserver((mutationRecords) => {
      // Filter out mutations that are just our own hospital row additions
      const relevantMutations = mutationRecords.filter(record => {
        if (record.type !== 'childList') return true;
        
        // Ignore mutations that are just our hospital rows being added/removed
        const addedNodes = Array.from(record.addedNodes);
        const removedNodes = Array.from(record.removedNodes);
        
        const isOurChanges = [...addedNodes, ...removedNodes].every(node => 
          node.nodeType === Node.ELEMENT_NODE && 
          node.classList && 
          node.classList.contains('hospital-extra-row')
        );
        
        return !isOurChanges;
      });
      
      if (relevantMutations.length > 0) {
        smartRun(relevantMutations);
      }
    });
    
    const observerOptions = { childList: true, subtree: true, attributes: false, characterData: false };
    observer.observe(document.body, observerOptions);

    // Periodic status change check (every 30 seconds)
    let statusCheckInterval = setInterval(checkForStatusChanges, 30000);

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      stopTimerUpdates();
      clearInterval(statusCheckInterval);
      clearInterval(urlCheckInterval);
      observer.disconnect();
    });

    // React to SPA-like URL changes
    let lastHref = location.href;
    const urlCheckInterval = setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        const newUrl = new URL(location.href);
        if (newUrl.pathname === '/factions.php' && newUrl.searchParams.get('step') === 'profile') {
          const newFactionId = newUrl.searchParams.get('ID');
          if (newFactionId && newFactionId !== factionId) {
            factionId = newFactionId;
            membersById = null; // reset cache for new faction
            lastStatusSnapshot.clear(); // reset status tracking
            lastProcessedRowOrder = []; // reset row order tracking
          }
          // Re-enable observer and periodic checks when back on faction page
          observer.observe(document.body, observerOptions);
          statusCheckInterval = setInterval(checkForStatusChanges, 30000);
          smartRun();
        } else {
          // Not on faction profile page, stop everything
          stopTimerUpdates();
          clearInterval(statusCheckInterval);
          observer.disconnect();
          lastStatusSnapshot.clear();
          lastProcessedRowOrder = [];
        }
      }
    }, 500);

  } // End of initializeHospitalDetails()

  // Start initialization
  initialize();

})();
// ==UserScript==
// @name         Torn Profile Stats Viewer
// @namespace    master.torn.stats.viewer
// @version      1.5.2
// @description  Duplicates the existing stats button on Torn profile pages and adds API-powered stats overlay with searchable, nested, expandable personal statistics.
// @author       VinPetrol [2060292]
// @match        https://www.torn.com/profiles.php*
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// @updateURL    https://raw.githubusercontent.com/citizen-123/TornUserScripts/refs/heads/main/TornProfileStatsViewer.js
// @downloadURL  https://raw.githubusercontent.com/citizen-123/TornUserScripts/refs/heads/main/TornProfileStatsViewer.js
// ==/UserScript==

(function () {
  'use strict';

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function getXID() {
    const u = new URL(location.href);
    const xid = u.searchParams.get('XID');
    if (xid) return xid;

    const link = qsa('a[href*="profiles.php?XID="]').map(a => {
      try { return new URL(a.href, location.origin); } catch { return null; }
    }).find(url => url && url.searchParams.get('XID'));
    return link ? link.searchParams.get('XID') : null;
  }

  async function ensureApiKey() {
    let key = GM_getValue('torn_api_key', '');
    if (!key) {
      key = prompt('Enter your Torn API Key:');
      if (key && key.trim()) {
        GM_setValue('torn_api_key', key.trim());
      } else {
        alert('No API key entered. Script will not work until a key is set.');
      }
    }
    return key;
  }

  function insertButton() {
    // Find the existing personal stats button specifically in the profile actions
    // Look for the button that links to personalstats.php with user IDs
    let existingStatsButton = qs('a[href*="/personalstats.php?ID="]');
    
    // If not found, try alternative approaches
    if (!existingStatsButton) {
      existingStatsButton = qs('.profile-button-personalStats');
    }
    
    if (!existingStatsButton) {
      // Look through all personalstats links to find the profile-specific one
      const allStatsLinks = qsa('a[href*="/personalstats.php"]');
      existingStatsButton = allStatsLinks.find(btn => {
        const isProfileContext = btn.closest('.profile-container') || 
                                btn.closest('.buttons-list') ||
                                btn.closest('.actions') ||
                                btn.className.includes('profile-button');
        const hasUserIDs = btn.href.includes('ID=');
        return isProfileContext && hasUserIDs;
      });
    }
    
    if (!existingStatsButton) {
      console.warn('Could not find existing profile stats button to clone');
      console.log('Available personalstats links:', qsa('a[href*="/personalstats.php"]').map(a => ({
        href: a.href,
        classes: a.className,
        hasIDs: a.href.includes('ID='),
        parent: a.parentNode?.className,
        inProfile: !!(a.closest('.profile-container') || a.closest('.buttons-list') || a.closest('.actions'))
      })));
      return false;
    }

    // Double-check we found a profile-specific stats button
    const isProfileButton = existingStatsButton.closest('.profile-container') || 
                           existingStatsButton.closest('.buttons-list') ||
                           existingStatsButton.closest('.actions') ||
                           existingStatsButton.className.includes('profile-button') ||
                           existingStatsButton.href.includes('ID=');
    
    if (!isProfileButton) {
      console.warn('Found stats button but it\'s not in the profile actions section');
      return false;
    }

    // Get the XID for the button ID
    const xid = getXID();
    if (!xid) {
      console.warn('Could not get XID for button');
      return false;
    }

    // Check if our custom button already exists
    const customButtonId = `button-api-stats-profile-${xid}`;
    if (qs(`#${customButtonId}`)) {
      console.log('API Stats button already exists');
      return true;
    }

    // Clone the existing button
    const btn = existingStatsButton.cloneNode(true);
    
    // Modify the cloned button
    btn.id = customButtonId;
    btn.href = '#';
    btn.className = btn.className.replace('profile-button-personalStats', 'profile-button-apiStats');
    btn.setAttribute('aria-label', 'View API Stats');
    btn.setAttribute('title', 'View detailed stats via API');

    // Find the parent container (buttons list)
    const buttonsList = existingStatsButton.parentNode;
    
    // Insert our button right after the original stats button
    buttonsList.insertBefore(btn, existingStatsButton.nextSibling);
    
    console.log('API Stats button added successfully next to profile stats button');

    // Add click event listener to override the default behavior
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onOpenStats();
    });

    return true;
  }

  function createFloatingWindow(userName = '', userId = '') {
    // Remove existing overlay if present
    const existing = qs('#tm-stats-overlay');
    if (existing) {
      existing.remove();
    }

    const title = userName && userId ? 
      `${userName} [${userId}] Stats` : 
      'Personal Statistics (API)';

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'tm-stats-overlay';
    overlay.innerHTML = `
      <div class="tm-stats-modal">
        <div class="tm-stats-header">
          <h3>${title}</h3>
          <button class="tm-stats-close" type="button">&times;</button>
        </div>
        <div class="tm-stats-search-container">
          <div class="tm-stats-search-wrapper">
            <input type="text" 
                   id="tm-stats-search" 
                   placeholder="Search any stat..." 
                   autocomplete="off"
                   spellcheck="false">
            <div class="tm-stats-search-icon">🔍</div>
            <button class="tm-stats-search-clear" type="button" style="display: none;">&times;</button>
          </div>
          <div class="tm-stats-search-results" style="display: none;">
            <span id="tm-stats-results-count">0 results found</span>
          </div>
        </div>
        <div class="tm-stats-content">
          <div class="tm-stats-loading">Loading stats from API...</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Add close functionality with proper event handling
    const closeButton = overlay.querySelector('.tm-stats-close');
    const modal = overlay.querySelector('.tm-stats-modal');
    
    // Close on button click
    closeButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      overlay.remove();
    });
    
    // Close on overlay background click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
    
    // Prevent modal content clicks from closing
    modal.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Close on Escape key
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // Clean up event listener when overlay is removed
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (node === overlay) {
            document.removeEventListener('keydown', handleKeyDown);
            observer.disconnect();
          }
        });
      });
    });
    observer.observe(document.body, { childList: true });

    return overlay;
  }

  function renderStatsData(overlay, data) {
    const content = overlay.querySelector('.tm-stats-content');
    
    // Store original data for search
    overlay._originalData = data;
    
    // Render the stats
    renderStats(overlay, data);
    
    // Add search functionality
    setupSearch(overlay);
  }
  
  function renderStats(overlay, data) {
    const content = overlay.querySelector('.tm-stats-content');
    
    // Create a more organized display of the stats
    let html = '<div class="tm-stats-categories">';
    
    // Group and organize the stats by category
    const categories = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null) {
        // This is a category with nested stats
        categories[key] = value;
      } else {
        // This is a standalone stat - put in "General" category
        if (!categories['General']) categories['General'] = {};
        categories['General'][key] = value;
      }
    }
    
    // Render each category
    for (const [categoryName, categoryData] of Object.entries(categories)) {
      html += renderCategory(categoryName, categoryData, 'category');
    }
    
    html += '</div>';
    
    // Add summary info
    const totalCategories = Object.keys(categories).length;
    const totalStats = countTotalStats(categories);
    
    html += `
      <div class="tm-stats-summary">
        <div class="tm-stats-summary-item">
          <span class="tm-stats-summary-label">Categories:</span>
          <span class="tm-stats-summary-value">${totalCategories}</span>
        </div>
        <div class="tm-stats-summary-item">
          <span class="tm-stats-summary-label">Total Stats:</span>
          <span class="tm-stats-summary-value">${totalStats}</span>
        </div>
      </div>
    `;
    
    content.innerHTML = html;
    
    // Add toggle functionality for all expandable sections
    content.addEventListener('click', handleToggleClick);
  }
  
  function setupSearch(overlay) {
    const searchInput = overlay.querySelector('#tm-stats-search');
    const clearButton = overlay.querySelector('.tm-stats-search-clear');
    const resultsDiv = overlay.querySelector('.tm-stats-search-results');
    const resultsCount = overlay.querySelector('#tm-stats-results-count');
    
    let searchTimeout;
    
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      
      // Show/hide clear button
      if (query) {
        clearButton.style.display = 'flex';
        resultsDiv.style.display = 'block';
      } else {
        clearButton.style.display = 'none';
        resultsDiv.style.display = 'none';
      }
      
      // Debounce search
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        performSearch(overlay, query);
      }, 150);
    });
    
    clearButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      searchInput.value = '';
      clearButton.style.display = 'none';
      resultsDiv.style.display = 'none';
      performSearch(overlay, '');
      searchInput.focus();
    });
    
    // Clear search on escape
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        clearButton.click();
      }
    });
  }
  
  function performSearch(overlay, query) {
    const content = overlay.querySelector('.tm-stats-content');
    const resultsCount = overlay.querySelector('#tm-stats-results-count');
    const resultsDiv = overlay.querySelector('.tm-stats-search-results');
    
    // Clear previous search state
    content.querySelectorAll('.tm-stats-search-hidden').forEach(el => {
      el.classList.remove('tm-stats-search-hidden');
    });
    content.querySelectorAll('.tm-stats-search-expanded').forEach(el => {
      el.classList.remove('tm-stats-search-expanded');
    });
    content.querySelectorAll('.tm-stats-search-highlight').forEach(el => {
      const parent = el.parentNode;
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    });
    
    if (!query) {
      resultsCount.textContent = '';
      resultsDiv.classList.remove('has-results');
      return;
    }
    
    const searchResults = searchInData(overlay._originalData, query.toLowerCase());
    const matchCount = searchResults.matches.length;
    
    // Update results count
    resultsCount.textContent = `${matchCount} result${matchCount !== 1 ? 's' : ''} found`;
    resultsDiv.classList.toggle('has-results', matchCount > 0);
    
    if (matchCount === 0) {
      // Hide all items if no matches
      content.querySelectorAll('.tm-stats-item, .tm-stats-category, .tm-stats-subsection').forEach(el => {
        el.classList.add('tm-stats-search-hidden');
      });
      return;
    }
    
    // Process search results
    const pathsToShow = new Set();
    const pathsToExpand = new Set();
    
    searchResults.matches.forEach(match => {
      // Add all parent paths to show
      let currentPath = '';
      match.path.forEach((segment, index) => {
        if (index > 0) currentPath += '.';
        currentPath += segment;
        pathsToShow.add(currentPath);
        
        // Add parent paths to expand
        if (index < match.path.length - 1) {
          pathsToExpand.add(currentPath);
        }
      });
    });
    
    // Hide elements not in search results
    content.querySelectorAll('[data-search-path]').forEach(el => {
      const elementPath = el.getAttribute('data-search-path');
      if (!pathsToShow.has(elementPath) && !hasChildInResults(elementPath, pathsToShow)) {
        el.classList.add('tm-stats-search-hidden');
      }
    });
    
    // Expand parent containers of matches
    pathsToExpand.forEach(path => {
      const element = content.querySelector(`[data-search-path="${path}"]`);
      if (element) {
        element.classList.add('tm-stats-search-expanded');
      }
    });
    
    // Highlight matches
    searchResults.matches.forEach(match => {
      const element = content.querySelector(`[data-search-path="${match.path.join('.')}"] .tm-stats-label`);
      if (element) {
        highlightText(element, query);
      }
    });
  }
  
  function searchInData(data, query, path = []) {
    const matches = [];
    
    function searchRecursive(obj, currentPath) {
      for (const [key, value] of Object.entries(obj)) {
        const newPath = [...currentPath, key];
        const keyLower = key.toLowerCase();
        
        // Check if key matches search query
        if (keyLower.includes(query)) {
          matches.push({
            path: newPath,
            key: key,
            value: value
          });
        }
        
        // Recursively search nested objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          searchRecursive(value, newPath);
        }
      }
    }
    
    searchRecursive(data, path);
    
    return { matches };
  }
  
  function hasChildInResults(parentPath, resultPaths) {
    for (const path of resultPaths) {
      if (path.startsWith(parentPath + '.')) {
        return true;
      }
    }
    return false;
  }
  
  function highlightText(element, query) {
    const text = element.textContent;
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    const highlightedText = text.replace(regex, '<span class="tm-stats-search-highlight">$1</span>');
    element.innerHTML = highlightedText;
  }
  
  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  function renderCategory(name, data, level = 'category', depth = 0, parentPath = []) {
    const formattedName = formatStatName(name);
    const levelClass = `tm-stats-${level}`;
    const depthClass = depth > 0 ? `tm-stats-depth-${depth}` : '';
    const currentPath = [...parentPath, name];
    const pathString = currentPath.join('.');
    
    let html = `
      <div class="${levelClass} ${depthClass}" data-search-path="${pathString}">
        <div class="${levelClass}-header" data-target="${generateId(name, depth)}">
          <h${Math.min(4 + depth, 6)}>${formattedName}</h${Math.min(4 + depth, 6)}>
          <div class="${levelClass}-toggle">−</div>
        </div>
        <div class="${levelClass}-content" id="${generateId(name, depth)}">
    `;
    
    if (typeof data === 'object' && data !== null) {
      const entries = Object.entries(data);
      
      if (entries.length > 0) {
        // Check if we have nested objects that should be subsections
        const hasNestedObjects = entries.some(([key, value]) => 
          typeof value === 'object' && value !== null && !Array.isArray(value)
        );
        
        if (hasNestedObjects && level === 'category') {
          // Render as subsections
          for (const [key, value] of entries) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              html += renderCategory(key, value, 'subsection', depth + 1, currentPath);
            } else {
              // Single stat item
              html += renderStatItem(key, value, currentPath);
            }
          }
        } else {
          // Render as grid of stats
          html += '<div class="tm-stats-grid">';
          
          for (const [key, value] of entries) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              // Nested object - create expandable subsection
              html += renderNestedObjectItem(key, value, depth + 1, currentPath);
            } else {
              // Regular stat item
              html += renderStatItem(key, value, currentPath);
            }
          }
          
          html += '</div>';
        }
      } else {
        html += '<div class="tm-stats-empty">No data available</div>';
      }
    } else {
      // Single value
      html += `
        <div class="tm-stats-single-value">
          <div class="tm-stats-value">${formatStatValue(data)}</div>
        </div>
      `;
    }
    
    html += `
        </div>
      </div>
    `;
    
    return html;
  }
  
  function renderStatItem(key, value, parentPath = []) {
    const formattedKey = formatStatName(key);
    const formattedValue = formatStatValue(value);
    const currentPath = [...parentPath, key];
    const pathString = currentPath.join('.');
    
    return `
      <div class="tm-stats-item" data-search-path="${pathString}">
        <div class="tm-stats-label">${formattedKey}</div>
        <div class="tm-stats-value">${formattedValue}</div>
      </div>
    `;
  }
  
  function renderNestedObjectItem(key, value, depth, parentPath = []) {
    const formattedKey = formatStatName(key);
    const objectSize = Object.keys(value).length;
    const currentPath = [...parentPath, key];
    const pathString = currentPath.join('.');
    const itemId = generateId(key, depth);
    
    return `
      <div class="tm-stats-item tm-stats-expandable" data-search-path="${pathString}">
        <div class="tm-stats-label">${formattedKey}</div>
        <div class="tm-stats-value">
          <div class="tm-stats-nested-header" data-target="${itemId}">
            <span class="tm-stats-object-info">{${objectSize} properties}</span>
            <div class="tm-stats-nested-toggle">+</div>
          </div>
        </div>
        <div class="tm-stats-nested-content" id="${itemId}" style="display: none;">
          <div class="tm-stats-nested-grid">
            ${Object.entries(value).map(([subKey, subValue]) => 
              renderStatItem(subKey, subValue, currentPath)
            ).join('')}
          </div>
        </div>
      </div>
    `;
  }
  
  function handleToggleClick(e) {
    const toggle = e.target;
    
    // Handle main category/subsection toggles
    if (toggle.classList.contains('tm-stats-category-toggle') || 
        toggle.classList.contains('tm-stats-subsection-toggle')) {
      const targetId = toggle.closest('[data-target]').getAttribute('data-target');
      const content = document.getElementById(targetId);
      
      if (content) {
        if (content.style.display === 'none') {
          content.style.display = 'block';
          toggle.textContent = '−';
        } else {
          content.style.display = 'none';
          toggle.textContent = '+';
        }
      }
    }
    
    // Handle nested object toggles within stat items
    if (toggle.classList.contains('tm-stats-nested-toggle')) {
      const targetId = toggle.closest('[data-target]').getAttribute('data-target');
      const content = document.getElementById(targetId);
      
      if (content) {
        if (content.style.display === 'none') {
          content.style.display = 'block';
          toggle.textContent = '−';
          toggle.closest('.tm-stats-item').classList.add('expanded');
        } else {
          content.style.display = 'none';
          toggle.textContent = '+';
          toggle.closest('.tm-stats-item').classList.remove('expanded');
        }
      }
    }
    
    // Handle clicking on headers
    if (toggle.classList.contains('tm-stats-category-header') || 
        toggle.classList.contains('tm-stats-subsection-header') ||
        toggle.classList.contains('tm-stats-nested-header')) {
      const toggleButton = toggle.querySelector('[class*="toggle"]');
      if (toggleButton) {
        toggleButton.click();
      }
    }
  }
  
  function generateId(name, depth) {
    return `tm-stats-${name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${depth}-${Date.now()}`;
  }
  
  function countTotalStats(data) {
    let count = 0;
    
    function countRecursive(obj) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          countRecursive(value);
        } else {
          count++;
        }
      }
    }
    
    countRecursive(data);
    return count;
  }
  
  function formatStatName(name) {
    return name
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/_/g, ' ') // Replace underscores with spaces
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim();
  }
  
  function formatStatValue(value) {
    if (value === null || value === undefined) {
      return '<span class="tm-stats-null">N/A</span>';
    }
    
    if (typeof value === 'number') {
      // Format large numbers with commas
      if (Math.abs(value) >= 1000) {
        return value.toLocaleString();
      }
      return value.toString();
    }
    
    if (typeof value === 'boolean') {
      return `<span class="tm-stats-boolean tm-stats-boolean-${value}">${value ? 'Yes' : 'No'}</span>`;
    }
    
    if (typeof value === 'object') {
      // Handle nested objects
      if (Array.isArray(value)) {
        return `<span class="tm-stats-array">[${value.length} items]</span>`;
      }
      return `<span class="tm-stats-object">{${Object.keys(value).length} properties}</span>`;
    }
    
    // Handle timestamps (Unix timestamps)
    if (typeof value === 'string' && /^\d{10}$/.test(value)) {
      const date = new Date(parseInt(value) * 1000);
      return `<span class="tm-stats-date">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</span>`;
    }
    
    return String(value);
  }

  function renderError(overlay, error) {
    const content = overlay.querySelector('.tm-stats-content');
    content.innerHTML = `<div class="tm-stats-error">Error: ${error}</div>`;
  }

  GM_addStyle(`
    /* Subtle styling to differentiate our API stats button */
    .profile-button-apiStats {
      position: relative;
    }
    
    .profile-button-apiStats::after {
      content: '';
      position: absolute;
      top: 2px;
      right: 2px;
      width: 6px;
      height: 6px;
      background: #1f6feb;
      border-radius: 50%;
      border: 1px solid #2a2a2a;
    }

    #tm-stats-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }

    .tm-stats-modal {
      background: linear-gradient(135deg, #1e1e1e 0%, #2a2a2a 100%);
      color: #fff;
      border-radius: 16px;
      max-width: 900px;
      max-height: 85vh;
      width: 95%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      border: 1px solid #3a3a3a;
    }

    .tm-stats-header {
      background: linear-gradient(135deg, #1f6feb 0%, #0d47a1 100%);
      padding: 20px 25px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 10px rgba(31, 111, 235, 0.3);
    }

    .tm-stats-header h3 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }

    .tm-stats-close {
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: #fff;
      font-size: 20px;
      cursor: pointer;
      padding: 8px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      transition: all 0.2s ease;
      font-weight: bold;
      line-height: 1;
    }

    .tm-stats-close:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: scale(1.05);
    }

    .tm-stats-close:active {
      transform: scale(0.95);
    }

    .tm-stats-content {
      padding: 0;
      max-height: 60vh;
      overflow-y: auto;
    }

    /* Search functionality */
    .tm-stats-search-container {
      padding: 20px 25px 15px 25px;
      background: #252525;
      border-bottom: 1px solid #3a3a3a;
    }

    .tm-stats-search-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    #tm-stats-search {
      width: 100%;
      padding: 12px 40px 12px 40px;
      background: #1e1e1e;
      border: 2px solid #3a3a3a;
      border-radius: 25px;
      color: #fff;
      font-size: 14px;
      transition: all 0.3s ease;
      outline: none;
    }

    #tm-stats-search:focus {
      border-color: #1f6feb;
      box-shadow: 0 0 0 3px rgba(31, 111, 235, 0.1);
    }

    #tm-stats-search::placeholder {
      color: #666;
    }

    .tm-stats-search-icon {
      position: absolute;
      left: 12px;
      color: #666;
      font-size: 16px;
      pointer-events: none;
    }

    .tm-stats-search-clear {
      position: absolute;
      right: 8px;
      background: #666;
      border: none;
      color: #fff;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s ease;
      font-weight: bold;
      line-height: 1;
    }

    .tm-stats-search-clear:hover {
      background: #999;
    }

    .tm-stats-search-clear:active {
      transform: scale(0.9);
    }

    .tm-stats-search-results {
      margin-top: 8px;
      font-size: 12px;
      color: #999;
      text-align: center;
    }

    .tm-stats-search-results.has-results {
      color: #1f6feb;
    }

    /* Search highlighting */
    .tm-stats-search-highlight {
      background: rgba(255, 235, 59, 0.3);
      color: #fff;
      padding: 1px 3px;
      border-radius: 3px;
      font-weight: bold;
    }

    /* Hidden elements during search */
    .tm-stats-search-hidden {
      display: none !important;
    }

    /* Expanded elements during search */
    .tm-stats-search-expanded .tm-stats-category-content,
    .tm-stats-search-expanded .tm-stats-subsection-content,
    .tm-stats-search-expanded .tm-stats-nested-content {
      display: block !important;
    }

    .tm-stats-search-expanded .tm-stats-category-toggle,
    .tm-stats-search-expanded .tm-stats-subsection-toggle,
    .tm-stats-search-expanded .tm-stats-nested-toggle {
      background: #22c55e !important;
    }

    .tm-stats-loading {
      text-align: center;
      padding: 60px 20px;
      font-size: 16px;
      color: #ccc;
    }

    .tm-stats-loading::before {
      content: '';
      display: block;
      width: 40px;
      height: 40px;
      margin: 0 auto 20px;
      border: 3px solid #3a3a3a;
      border-top: 3px solid #1f6feb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .tm-stats-error {
      text-align: center;
      padding: 40px;
      color: #ff6b6b;
      font-size: 16px;
    }

    .tm-stats-categories {
      padding: 0;
    }

    .tm-stats-category {
      border-bottom: 1px solid #3a3a3a;
    }

    .tm-stats-category:last-child {
      border-bottom: none;
    }

    .tm-stats-category-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 25px;
      background: linear-gradient(90deg, #2a2a2a 0%, #252525 100%);
      cursor: pointer;
      transition: background 0.2s ease;
      border-left: 4px solid #1f6feb;
    }

    .tm-stats-category-header:hover {
      background: linear-gradient(90deg, #303030 0%, #2a2a2a 100%);
    }

    .tm-stats-category-header h4 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #fff;
    }

    .tm-stats-category-toggle {
      background: #1f6feb;
      color: white;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      transition: all 0.2s ease;
    }

    .tm-stats-category-toggle:hover {
      background: #0d47a1;
      transform: scale(1.1);
    }

    .tm-stats-category-content {
      padding: 20px 25px;
      background: #1e1e1e;
    }

    /* Subsection styles */
    .tm-stats-subsection {
      border-bottom: 1px solid #404040;
      margin-bottom: 15px;
    }

    .tm-stats-subsection:last-child {
      border-bottom: none;
      margin-bottom: 0;
    }

    .tm-stats-subsection-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      background: linear-gradient(90deg, #353535 0%, #303030 100%);
      cursor: pointer;
      transition: background 0.2s ease;
      border-left: 3px solid #0d47a1;
      border-radius: 8px;
      margin-bottom: 10px;
    }

    .tm-stats-subsection-header:hover {
      background: linear-gradient(90deg, #3a3a3a 0%, #353535 100%);
    }

    .tm-stats-subsection-header h5 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #e0e0e0;
    }

    .tm-stats-subsection-toggle {
      background: #0d47a1;
      color: white;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 12px;
      transition: all 0.2s ease;
    }

    .tm-stats-subsection-toggle:hover {
      background: #1565c0;
      transform: scale(1.1);
    }

    .tm-stats-subsection-content {
      padding: 15px 20px;
      background: #252525;
      border-radius: 0 0 8px 8px;
    }

    /* Depth-based indentation */
    .tm-stats-depth-1 {
      margin-left: 20px;
    }

    .tm-stats-depth-2 {
      margin-left: 40px;
    }

    .tm-stats-depth-3 {
      margin-left: 60px;
    }

    .tm-stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }

    .tm-stats-item {
      background: linear-gradient(135deg, #2a2a2a 0%, #252525 100%);
      padding: 16px 20px;
      border-radius: 12px;
      border: 1px solid #3a3a3a;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
    }

    .tm-stats-item::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 3px;
      height: 100%;
      background: linear-gradient(180deg, #1f6feb 0%, #0d47a1 100%);
    }

    .tm-stats-item:hover {
      background: linear-gradient(135deg, #303030 0%, #2a2a2a 100%);
      border-color: #1f6feb;
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(31, 111, 235, 0.2);
    }

    /* Expandable stat items */
    .tm-stats-expandable {
      cursor: pointer;
    }

    .tm-stats-expandable.expanded {
      background: linear-gradient(135deg, #303030 0%, #2a2a2a 100%);
      border-color: #0d47a1;
    }

    .tm-stats-nested-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      padding: 4px 0;
    }

    .tm-stats-nested-toggle {
      background: #0d47a1;
      color: white;
      border-radius: 50%;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 12px;
      transition: all 0.2s ease;
      margin-left: 8px;
    }

    .tm-stats-nested-toggle:hover {
      background: #1565c0;
      transform: scale(1.1);
    }

    .tm-stats-object-info {
      color: #8b5cf6;
      font-style: italic;
      font-size: 14px;
    }

    .tm-stats-nested-content {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #404040;
    }

    .tm-stats-nested-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .tm-stats-nested-grid .tm-stats-item {
      background: linear-gradient(135deg, #1a1a1a 0%, #1e1e1e 100%);
      padding: 10px 12px;
      margin: 0;
      border-radius: 6px;
      border-left: 2px solid #0d47a1;
    }

    .tm-stats-nested-grid .tm-stats-item::before {
      display: none;
    }

    .tm-stats-nested-grid .tm-stats-label {
      font-size: 11px;
      color: #aaa;
    }

    .tm-stats-nested-grid .tm-stats-value {
      font-size: 14px;
    }

    .tm-stats-label {
      font-size: 12px;
      color: #999;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 8px;
      font-weight: 500;
    }

    .tm-stats-value {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      word-break: break-word;
    }

    .tm-stats-single-value {
      text-align: center;
      padding: 20px;
    }

    .tm-stats-single-value .tm-stats-value {
      font-size: 24px;
      color: #1f6feb;
    }

    .tm-stats-empty {
      text-align: center;
      color: #666;
      font-style: italic;
      padding: 40px;
    }

    .tm-stats-summary {
      display: flex;
      justify-content: center;
      gap: 40px;
      padding: 25px;
      background: linear-gradient(90deg, #1e1e1e 0%, #252525 50%, #1e1e1e 100%);
      border-top: 1px solid #3a3a3a;
    }

    .tm-stats-summary-item {
      text-align: center;
    }

    .tm-stats-summary-label {
      display: block;
      font-size: 12px;
      color: #999;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 8px;
    }

    .tm-stats-summary-value {
      font-size: 24px;
      font-weight: 700;
      color: #1f6feb;
    }

    /* Special value type styling */
    .tm-stats-null {
      color: #666;
      font-style: italic;
    }

    .tm-stats-boolean {
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .tm-stats-boolean-true {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
    }

    .tm-stats-boolean-false {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }

    .tm-stats-array {
      color: #f59e0b;
      font-style: italic;
    }

    .tm-stats-object {
      color: #8b5cf6;
      font-style: italic;
    }

    .tm-stats-date {
      color: #06b6d4;
      font-family: monospace;
      font-size: 14px;
    }

    /* Scrollbar styling */
    .tm-stats-content::-webkit-scrollbar {
      width: 8px;
    }

    .tm-stats-content::-webkit-scrollbar-track {
      background: #1e1e1e;
    }

    .tm-stats-content::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, #1f6feb 0%, #0d47a1 100%);
      border-radius: 4px;
    }

    .tm-stats-content::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, #0d47a1 0%, #1f6feb 100%);
    }

    /* Mobile responsiveness */
    @media (max-width: 768px) {
      .tm-stats-modal {
        width: 98%;
        max-height: 90vh;
        margin: 0 1%;
      }

      .tm-stats-search-container {
        padding: 15px 20px 10px 20px;
      }

      #tm-stats-search {
        padding: 10px 35px 10px 35px;
        font-size: 16px; /* Prevent zoom on iOS */
      }

      .tm-stats-grid {
        grid-template-columns: 1fr;
      }

      .tm-stats-summary {
        flex-direction: column;
        gap: 20px;
      }

      .tm-stats-category-header {
        padding: 15px 20px;
      }

      .tm-stats-category-content {
        padding: 15px 20px;
      }

      .tm-stats-subsection-header {
        padding: 12px 15px;
      }

      .tm-stats-subsection-content {
        padding: 12px 15px;
      }

      .tm-stats-depth-1 {
        margin-left: 10px;
      }

      .tm-stats-depth-2 {
        margin-left: 20px;
      }

      .tm-stats-depth-3 {
        margin-left: 30px;
      }

      .tm-stats-nested-grid {
        grid-template-columns: 1fr;
      }
    }
  `);

  async function onOpenStats() {
    const xid = getXID();
    if (!xid) {
      alert('Could not determine player ID (XID) from this page.');
      return;
    }

    const apiKey = await ensureApiKey();
    if (!apiKey) return;

    // Try to get the user's name from the page
    const userName = getUserName();

    // Create and show the floating window with user info
    const overlay = createFloatingWindow(userName, xid);

    const url = `https://api.torn.com/v2/user/${encodeURIComponent(xid)}/personalstats?cat=all&stat=&key=${encodeURIComponent(apiKey)}`;

    try {
      const data = await apiGetJson(url);
      const statsObj = data.personalstats || data;
      
      // Update title with more accurate user info if available from API
      if (data.name && data.name !== userName) {
        updateModalTitle(overlay, data.name, xid);
      }
      
      renderStatsData(overlay, statsObj);
    } catch (err) {
      renderError(overlay, String(err));
    }
  }

  function getUserName() {
    // Try multiple selectors to find the user's name on the profile page
    const nameSelectors = [
      '.profile-header h1',
      '.profile-container h1',
      '.title-container h1',
      'h1[class*="profile"]',
      '.user-info h1',
      '.player-name'
    ];
    
    for (const selector of nameSelectors) {
      const element = qs(selector);
      if (element) {
        let name = element.textContent.trim();
        // Clean up common patterns like [ID] or rank prefixes
        name = name.replace(/\[\d+\]/g, '').replace(/^\w+\s+/, '').trim();
        if (name && name.length > 0) {
          return name;
        }
      }
    }
    
    // Fallback: try to get from page title
    const title = document.title;
    if (title && title.includes('Profile')) {
      const match = title.match(/(.+?)\s*(?:Profile|\[|\-)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return 'Unknown User';
  }

  function updateModalTitle(overlay, userName, userId) {
    const titleElement = overlay.querySelector('.tm-stats-header h3');
    if (titleElement) {
      titleElement.textContent = `${userName} [${userId}] Stats`;
    }
  }

  function apiGetJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url,
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        onload: (res) => {
          try {
            resolve(JSON.parse(res.responseText));
          } catch {
            reject(new Error('Failed to parse API response.'));
          }
        },
        onerror: () => reject(new Error('Network error contacting Torn API.')),
        ontimeout: () => reject(new Error('Request timed out contacting Torn API.')),
        timeout: 30000,
      });
    });
  }

  (async function init() {
    await ensureApiKey();
    
    // Try to insert button with retries for dynamic content
    let attempts = 0;
    const maxAttempts = 10;
    const retryDelay = 500;
    
    const tryInsertButton = async () => {
      attempts++;
      console.log(`Attempt ${attempts} to insert stats button`);
      
      const success = insertButton();
      if (success) {
        console.log('Stats button inserted successfully');
        return;
      }
      
      if (attempts < maxAttempts) {
        console.log(`Button insertion failed, retrying in ${retryDelay}ms...`);
        setTimeout(tryInsertButton, retryDelay);
      } else {
        console.error('Failed to insert stats button after', maxAttempts, 'attempts');
        console.log('Page structure:', {
          url: location.href,
          xid: getXID(),
          allPersonalStatsLinks: qsa('a[href*="/personalstats.php"]').length,
          profilePersonalStatsLinks: qsa('a[href*="/personalstats.php?ID="]').length,
          profileContainer: qs('.profile-container') ? 'found' : 'not found',
          buttonsList: qs('.buttons-list') ? 'found' : 'not found',
          actionsSection: qs('.actions') ? 'found' : 'not found'
        });
      }
    };
    
    // Start trying to insert the button
    tryInsertButton();
    
    // Also try when DOM changes (for dynamic content)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if we have the profile personal stats button but our custom button is missing
          const hasProfileStatsBtn = qs('a[href*="/personalstats.php?ID="]') ||
                                    qsa('a[href*="/personalstats.php"]').find(btn => 
                                      btn.href.includes('ID=') && 
                                      btn.closest('.profile-container, .buttons-list, .actions')
                                    );
          const hasOurBtn = qs('[id^="button-api-stats-profile-"]');
          
          if (hasProfileStatsBtn && !hasOurBtn) {
            console.log('Profile personal stats button detected, trying to add API stats button');
            insertButton();
          }
        }
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  })();

})();

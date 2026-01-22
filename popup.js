// Popup script for Hail-O - Enhanced Version

const statusDiv = document.getElementById('status');
const autoDetectBtn = document.getElementById('autoDetect');
const searchLocationBtn = document.getElementById('searchLocation');
const checkNowBtn = document.getElementById('checkNow');
const viewBOMBtn = document.getElementById('viewBOM');
const lastCheckSpan = document.getElementById('lastCheck');
const locationInput = document.getElementById('locationInput');
const messageDiv = document.getElementById('message');
const currentLocationDiv = document.getElementById('currentLocation');
const locationText = document.getElementById('locationText');
const warningsContainer = document.getElementById('warningsContainer');
const notificationBanner = document.getElementById('notificationBanner');

// Show notification banner at top of popup
function showNotification(message, type = 'success', duration = 8000) {
  if (!notificationBanner) {
    return;
  }
  
  notificationBanner.textContent = message;
  notificationBanner.className = `notification-banner show ${type}`;
  
  if (duration > 0) {
    setTimeout(() => {
      notificationBanner.classList.remove('show');
    }, duration);
  }
}

// Search location by name using Nominatim geocoding API
async function searchLocationByName(query) {
  try {
    // Use Nominatim (OpenStreetMap) geocoding API - free and no API key needed
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)},Australia&format=json&limit=1&addressdetails=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Hail-O Weather Extension' // Nominatim requires User-Agent
      }
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      const result = data[0];
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);
      
      // Verify it's in Australia
      if (lat >= -44 && lat <= -10 && lon >= 113 && lon <= 154) {
        // Build a nice display name
        const address = result.address || {};
        const city = address.city || address.town || address.suburb || address.village || result.display_name.split(',')[0];
        const state = address.state || '';
        
        return {
          lat: lat,
          lon: lon,
          name: state ? `${city}, ${state}` : city
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

function displayWarnings(warnings) {
  if (!warnings || warnings.length === 0) {
    warningsContainer.style.display = 'none';
    return;
  }
  
  warningsContainer.style.display = 'block';
  warningsContainer.innerHTML = '';
  
  warnings.forEach(warning => {
    const warningDiv = document.createElement('div');
    warningDiv.className = `warning-item ${warning.severity.toLowerCase()}`;
    
    const header = document.createElement('div');
    header.className = 'warning-header';
    
    const title = document.createElement('div');
    title.className = 'warning-title';
    title.textContent = warning.title;
    
    const badge = document.createElement('span');
    badge.className = `warning-badge ${warning.severity.toLowerCase()}`;
    badge.textContent = warning.severity;
    
    header.appendChild(title);
    header.appendChild(badge);
    
    const meta = document.createElement('div');
    meta.className = 'warning-meta';
    
    if (warning.type) {
      const type = document.createElement('span');
      type.className = 'warning-type';
      type.textContent = warning.type;
      meta.appendChild(type);
    }
    
    if (warning.state) {
      const state = document.createElement('span');
      state.textContent = warning.state;
      meta.appendChild(state);
    }
    
    if (warning.pubDate) {
      const date = new Date(warning.pubDate);
      if (!isNaN(date.getTime())) {
        const time = document.createElement('span');
        time.textContent = date.toLocaleTimeString('en-AU', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        meta.appendChild(time);
      }
    }
    
    warningDiv.appendChild(header);
    if (meta.children.length > 0) {
      warningDiv.appendChild(meta);
    }
    
    // Click to open warning
    warningDiv.addEventListener('click', () => {
      if (warning.link) {
        chrome.tabs.create({ url: warning.link });
      }
    });
    
    warningsContainer.appendChild(warningDiv);
  });
}

async function updateStatus() {
  try {
    const result = await chrome.storage.local.get([
      'latitude', 
      'longitude', 
      'lastCheck', 
      'alertCount',
      'state',
      'locationName',
      'warnings'
    ]);
    
    // Update location display
    if (result.locationName) {
      currentLocationDiv.style.display = 'block';
      locationText.textContent = result.locationName;
    } else if (result.latitude && result.longitude) {
      currentLocationDiv.style.display = 'block';
      locationText.textContent = `${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)} (${result.state})`;
    }
    
    // Display warnings
    if (result.warnings && result.warnings.length > 0) {
      displayWarnings(result.warnings);
    } else {
      warningsContainer.style.display = 'none';
    }
    
    // Update status
    if (!result.latitude || !result.longitude) {
      statusDiv.className = 'status checking';
      statusDiv.textContent = 'Please set your location first';
    } else if (result.alertCount > 0) {
      statusDiv.className = 'status warning';
      statusDiv.textContent = `${result.alertCount} ACTIVE WARNING${result.alertCount > 1 ? 'S' : ''}`;
    } else {
      statusDiv.className = 'status no-warning';
      statusDiv.textContent = 'No active warnings in your area';
    }
    
    // Update last check time
    if (result.lastCheck) {
      const checkDate = new Date(result.lastCheck);
      const now = new Date();
      const diffMinutes = Math.floor((now - checkDate) / 60000);
      
      if (diffMinutes < 1) {
        lastCheckSpan.textContent = 'Just now';
      } else if (diffMinutes < 60) {
        lastCheckSpan.textContent = `${diffMinutes} min ago`;
      } else {
        const hours = Math.floor(diffMinutes / 60);
        lastCheckSpan.textContent = `${hours} hour${hours > 1 ? 's' : ''} ago`;
      }
    }
  } catch (error) {
    console.error('Error updating status:', error);
  }
}

function showMessage(text, type = 'success') {
  messageDiv.innerHTML = `<div class="message ${type}">${text}</div>`;
  setTimeout(() => messageDiv.innerHTML = '', 4000);
}

// Search location by name
searchLocationBtn.addEventListener('click', async () => {
  const query = locationInput.value.trim();
  
  if (!query) {
    showMessage('Please enter a location', 'error');
    return;
  }
  
  searchLocationBtn.disabled = true;
  searchLocationBtn.textContent = 'Searching...';
  
  const location = await searchLocationByName(query);
  
  if (location) {
    await chrome.storage.local.set({
      latitude: location.lat,
      longitude: location.lon,
      locationName: location.name
    });
    
    showMessage(`Location set to ${location.name}`, 'success');
    locationInput.value = '';
    
    chrome.runtime.sendMessage({ action: 'checkNow' });
    setTimeout(updateStatus, 2000);
  } else {
    showMessage('Location not found in Australia. Try a different search.', 'error');
  }
  
  searchLocationBtn.disabled = false;
  searchLocationBtn.textContent = 'Search';
});

// Allow Enter key in location input
locationInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    searchLocationBtn.click();
  }
});

// Auto-detect location
autoDetectBtn.addEventListener('click', () => {
  autoDetectBtn.disabled = true;
  autoDetectBtn.textContent = 'Detecting...';
  showMessage('Detecting your location...', 'success');
  
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      
      const isAustralia = lat >= -44 && lat <= -10 && lon >= 113 && lon <= 154;
      
      if (!isAustralia) {
        showMessage('Location detected outside Australia.', 'error');
        autoDetectBtn.disabled = false;
        autoDetectBtn.textContent = 'Use My Current Location';
        return;
      }
      
      await chrome.storage.local.set({
        latitude: lat,
        longitude: lon,
        locationName: null // Will be determined by background script
      });
      
      showMessage('Location detected successfully!', 'success');

      autoDetectBtn.disabled = false;
      autoDetectBtn.textContent = 'Use My Current Location';
      
      chrome.runtime.sendMessage({ action: 'checkNow' });
      setTimeout(updateStatus, 2000);
    },
    (error) => {
      let errorMsg = 'Could not detect location. ';

      if (error.code === error.PERMISSION_DENIED) {
        errorMsg += 'Permission denied. Please enable location access.';
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        errorMsg += 'Location unavailable. Please search for your city.';
      } else {
        errorMsg += 'Please search for your city.';
      }

      showMessage(errorMsg, 'error');
      autoDetectBtn.disabled = false;
      autoDetectBtn.textContent = 'Use My Current Location';
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
});

checkNowBtn.addEventListener('click', async () => {
  const result = await chrome.storage.local.get(['latitude', 'longitude']);

  if (!result.latitude || !result.longitude) {
    showMessage('Please set your location first', 'error');
    return;
  }

  checkNowBtn.disabled = true;
  checkNowBtn.textContent = 'Checking...';
  statusDiv.textContent = 'Checking for warnings...';
  statusDiv.className = 'status checking';
  
  chrome.runtime.sendMessage({ action: 'checkNow' }, () => {
    setTimeout(() => {
      updateStatus();
      checkNowBtn.disabled = false;
      checkNowBtn.textContent = 'Check for Warnings Now';
    }, 2000);
  });
});

viewBOMBtn.addEventListener('click', async () => {
  const result = await chrome.storage.local.get(['state']);
  let url = 'https://www.bom.gov.au/weather-and-climate/warnings-and-alerts';
  
  if (result.state) {
    const stateUrls = {
      'NSW': 'http://www.bom.gov.au/nsw/warnings/',
      'VIC': 'http://www.bom.gov.au/vic/warnings/',
      'QLD': 'http://www.bom.gov.au/qld/warnings/',
      'SA': 'http://www.bom.gov.au/sa/warnings/',
      'WA': 'http://www.bom.gov.au/wa/warnings/',
      'TAS': 'http://www.bom.gov.au/tas/warnings/',
      'NT': 'http://www.bom.gov.au/nt/warnings/',
      'ACT': 'http://www.bom.gov.au/act/warnings/'
    };
    url = stateUrls[result.state] || url;
  }
  
  chrome.tabs.create({ url });
});

// Initial update
updateStatus();

// Auto-refresh every 30 seconds
setInterval(updateStatus, 30000);

// Listen for warning alerts from background service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'warningAlert') {
    const warning = request.warning;
    const locationName = request.locationName;
    showNotification(
      `🚨 ${warning.type}: ${warning.title.substring(0, 50)}...`,
      'warning',
      6000
    );
    updateStatus(); // Refresh to show new warning
  }
});
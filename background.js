// Background service worker for Hail-O - Shows ALL warnings in your region

let lastAlerts = new Set();

function isAustralia(lat, lon) {
  return lat >= -44 && lat <= -10 && lon >= 113 && lon <= 154;
}

function getAustralianState(lat, lon) {
  // ACT check FIRST (most specific, small territory)
  // ACT boundaries: roughly -35.92 to -35.12 lat, 148.76 to 149.40 lon
  if (lat >= -35.92 && lat <= -35.12 && lon >= 148.76 && lon <= 149.40) {
    return 'ACT';
  }

  // Then check other states
  if (lat >= -29 && lat <= -10 && lon >= 138 && lon <= 154) return 'QLD';
  if (lat >= -38 && lat <= -28 && lon >= 141 && lon <= 154) return 'NSW';
  if (lat >= -39.2 && lat <= -34 && lon >= 140.9 && lon <= 150) return 'VIC';
  if (lat >= -44 && lat <= -39 && lon >= 144 && lon <= 149) return 'TAS';
  if (lat >= -38 && lat <= -26 && lon >= 129 && lon <= 141) return 'SA';
  if (lat >= -35 && lat <= -13.5 && lon >= 113 && lon <= 129) return 'WA';
  if (lat >= -26 && lat <= -10.5 && lon >= 129 && lon <= 138) return 'NT';

  // Fallback based on longitude/latitude
  if (lon < 135) return 'WA';
  if (lon > 148) return 'NSW';
  if (lat < -35) return 'VIC';
  return 'NSW';
}

// Get BOM RSS feed URL for state (ACT uses NSW feed)
function getBOMRSSURL(state) {
  const rssUrls = {
    'NSW': 'http://www.bom.gov.au/fwo/IDZ00054.warnings_nsw.xml',
    'VIC': 'http://www.bom.gov.au/fwo/IDZ00059.warnings_vic.xml',
    'QLD': 'http://www.bom.gov.au/fwo/IDZ00056.warnings_qld.xml',
    'SA': 'http://www.bom.gov.au/fwo/IDZ00057.warnings_sa.xml',
    'WA': 'http://www.bom.gov.au/fwo/IDZ00060.warnings_wa.xml',
    'TAS': 'http://www.bom.gov.au/fwo/IDZ00058.warnings_tas.xml',
    'NT': 'http://www.bom.gov.au/fwo/IDZ00055.warnings_nt.xml',
    'ACT': 'http://www.bom.gov.au/fwo/IDZ00054.warnings_nsw.xml' // ACT uses NSW feed
  };
  return rssUrls[state];
}

function getBOMWarningsURL(state) {
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
  return stateUrls[state] || 'https://www.bom.gov.au/weather-and-climate/warnings-and-alerts';
}

async function getLocationName(latitude, longitude) {
  const cities = [
    { name: 'Canberra', lat: -35.28, lon: 149.13, range: 0.5 },
    { name: 'Sydney', lat: -33.87, lon: 151.21, range: 0.5 },
    { name: 'Melbourne', lat: -37.81, lon: 144.96, range: 0.5 },
    { name: 'Brisbane', lat: -27.47, lon: 153.03, range: 0.5 },
    { name: 'Perth', lat: -31.95, lon: 115.86, range: 0.5 },
    { name: 'Adelaide', lat: -34.93, lon: 138.60, range: 0.5 },
    { name: 'Hobart', lat: -42.88, lon: 147.33, range: 0.5 },
    { name: 'Darwin', lat: -12.46, lon: 130.84, range: 0.5 }
  ];
  
  for (const city of cities) {
    if (Math.abs(latitude - city.lat) < city.range && Math.abs(longitude - city.lon) < city.range) {
      return city.name;
    }
  }
  
  return null;
}

// Parse RSS XML without DOMParser (service worker compatible)
function parseRSSFeed(xmlText) {
  const items = [];
  
  console.log(`🔍 parseRSSFeed: Starting to parse XML (length: ${xmlText.length})`);
  
  // Extract all <item> blocks
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
  const itemMatches = [...xmlText.matchAll(itemPattern)];
  
  console.log(`🔍 parseRSSFeed: Found ${itemMatches.length} <item> blocks`);
  
  itemMatches.forEach((itemMatch, idx) => {
    const itemContent = itemMatch[1];
    
    console.log(`🔍 parseRSSFeed: Processing item ${idx + 1}, content length: ${itemContent.length}`);
    console.log(`🔍 Item ${idx + 1} content preview:`, itemContent.substring(0, 200));
    
    // Extract title - try multiple patterns
    let title = '';
    
    // Pattern 1: CDATA
    const cdataMatch = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/is);
    if (cdataMatch) {
      title = cdataMatch[1].trim();
      console.log(`🔍 Found title via CDATA: ${title.substring(0, 50)}`);
    }
    
    // Pattern 2: Regular title tag
    if (!title) {
      const regularMatch = itemContent.match(/<title>(.*?)<\/title>/is);
      if (regularMatch) {
        title = regularMatch[1].trim();
        console.log(`🔍 Found title via regular tag: ${title.substring(0, 50)}`);
      }
    }
    
    // Pattern 3: Try without case sensitivity and with newlines
    if (!title) {
      const flexMatch = itemContent.match(/<title[^>]*>\s*(.*?)\s*<\/title>/is);
      if (flexMatch) {
        title = flexMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
        console.log(`🔍 Found title via flexible match: ${title.substring(0, 50)}`);
      }
    }
    
    console.log(`🔍 parseRSSFeed: Item ${idx + 1} final title: "${title.substring(0, 50)}"`);
    
    // Extract description
    const descMatch = itemContent.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/is) || 
                     itemContent.match(/<description>(.*?)<\/description>/is);
    const description = descMatch ? descMatch[1].trim() : '';
    
    // Extract link
    const linkMatch = itemContent.match(/<link>(.*?)<\/link>/is);
    const link = linkMatch ? linkMatch[1].trim() : '';
    
    // Extract pubDate
    const dateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/is);
    const pubDate = dateMatch ? dateMatch[1].trim() : '';
    
    if (title) {
      // Skip cancellation warnings
      if (title.toLowerCase().includes('cancellation')) {
        console.log(`🔍 parseRSSFeed: Skipped item ${idx + 1} (cancellation)`);
        return;
      }
      
      items.push({ title, description, link, pubDate });
      console.log(`🔍 parseRSSFeed: Added item ${idx + 1}`);
    } else {
      console.log(`🔍 parseRSSFeed: Skipped item ${idx + 1} (no title found)`);
    }
  });
  
  console.log(`🔍 parseRSSFeed: Returning ${items.length} items`);
  return items;
}

async function fetchStateRSSWarnings(state, locationName) {
  try {
    const rssUrl = getBOMRSSURL(state);
    console.log(`📡 Fetching RSS for ${state}: ${rssUrl}`);
    
    const response = await fetch(rssUrl);
    console.log(`📡 Response status: ${response.status}`);
    console.log(`📡 Response ok: ${response.ok}`);
    
    if (!response.ok) {
      console.log(`❌ ${state} RSS returned ${response.status}`);
      return [];
    }
    
    const xmlText = await response.text();
    console.log(`✅ ${state} RSS fetched, length: ${xmlText.length} chars`);
    
    // Debug: Show first 1000 chars of XML to see the structure
    console.log(`📄 XML START:`);
    console.log(xmlText.substring(0, 1000));
    console.log(`📄 XML END`);
    
    // Check if xmlText actually has content
    if (!xmlText || xmlText.length === 0) {
      console.log(`❌ XML text is empty!`);
      return [];
    }
    
    // Parse RSS feed
    const items = parseRSSFeed(xmlText);
    console.log(`📋 ${state}: parseRSSFeed returned ${items.length} items`);
    
    if (items.length === 0) {
      console.log(`⚠️ No items parsed from RSS feed!`);
      return [];
    }
    
    const warnings = [];
    
    items.forEach((item, i) => {
      const { title, description, link, pubDate } = item;
      
      console.log(`  ${i + 1}. ${title.substring(0, 70)}`);
      
      // Check if this warning mentions the location
      const fullText = (title + ' ' + description).toLowerCase();
      
      console.log(`     Full text preview: ${fullText.substring(0, 100)}...`);
      
      const mentionsLocation = locationName && fullText.includes(locationName.toLowerCase());
      const mentionsState = fullText.includes(state.toLowerCase());
      
      console.log(`     Location name: ${locationName}, State: ${state}`);
      console.log(`     Mentions location: ${mentionsLocation}`);
      console.log(`     Mentions state: ${mentionsState}`);
      
      // For ACT, also check if it mentions ACT or Canberra specifically
      if (state === 'ACT') {
        // Look for ACT as a standalone word, not substring in other words
        const hasACT = /\bact\b/i.test(fullText); // Word boundary match
        const hasCanberra = fullText.includes('canberra');
        const hasACTFull = fullText.includes('australian capital territory');
        
        console.log(`     Has 'ACT' (word): ${hasACT}`);
        console.log(`     Has 'canberra': ${hasCanberra}`);
        console.log(`     Has 'australian capital territory': ${hasACTFull}`);
        
        const isACTWarning = hasACT || hasCanberra || hasACTFull;
        
        if (isACTWarning || mentionsLocation) {
          console.log(`     ✅ ACT warning found!`);
          
          const warningType = getWarningType(title);
          const severity = getSeverity(title);
          
          warnings.push({
            id: link || `${state}-${i}-${Date.now()}`,
            title: title,
            description: description.substring(0, 300),
            link: link || getBOMWarningsURL(state),
            state: state,
            pubDate: pubDate,
            type: warningType,
            severity: severity,
            source: 'RSS'
          });
        } else {
          console.log(`     ⏭️  NSW warning (not for ACT) - skipping`);
        }
      } else {
        // For other states, include all warnings
        const warningType = getWarningType(title);
        const severity = getSeverity(title);
        
        warnings.push({
          id: link || `${state}-${i}-${Date.now()}`,
          title: title,
          description: description.substring(0, 300),
          link: link || getBOMWarningsURL(state),
          state: state,
          pubDate: pubDate,
          type: warningType,
          severity: severity,
          source: 'RSS'
        });
      }
    });
    
    console.log(`📊 ${state}: Collected ${warnings.length} warnings`);
    console.log('─'.repeat(60));
    
    return warnings;
    
  } catch (error) {
    console.error(`❌ Error fetching ${state} RSS:`, error);
    return [];
  }
}

async function fetchAllWarnings(userState, locationName) {
  const warnings = [];
  
  // Fetch warnings for user's state only
  const stateWarnings = await fetchStateRSSWarnings(userState, locationName);
  warnings.push(...stateWarnings);
  
  console.log(`📊 Total warnings for ${userState}: ${warnings.length}`);
  return warnings;
}

function getWarningType(title) {
  const lower = title.toLowerCase();
  
  if (lower.includes('severe thunderstorm') || lower.includes('hail') || lower.includes('damaging wind')) {
    return 'Severe Thunderstorm';
  }
  if (lower.includes('flood')) {
    return 'Flood';
  }
  if (lower.includes('fire')) {
    return 'Fire Weather';
  }
  if (lower.includes('wind')) {
    return 'Wind';
  }
  if (lower.includes('rain')) {
    return 'Heavy Rain';
  }
  if (lower.includes('cyclone')) {
    return 'Cyclone';
  }
  if (lower.includes('surf')) {
    return 'Surf';
  }
  if (lower.includes('sheep')) {
    return 'Sheep Graziers';
  }
  
  return 'General';
}

function getSeverity(title) {
  const lower = title.toLowerCase();
  
  if (lower.includes('severe') || lower.includes('destructive') || lower.includes('dangerous')) {
    return 'Severe';
  }
  if (lower.includes('hail') || lower.includes('damaging')) {
    return 'High';
  }
  return 'Moderate';
}

function shouldNotify(warning) {
  const title = warning.title.toLowerCase();
  
  return title.includes('severe') || 
         title.includes('destructive') ||
         title.includes('hail') ||
         title.includes('damaging') ||
         title.includes('dangerous') ||
         title.includes('flash flood');
}

async function checkWeatherAlerts() {
  const debugLog = [];
  
  function log(message) {
    console.log(message);
    debugLog.push(message);
  }
  
  try {
    const { latitude, longitude } = await chrome.storage.local.get(['latitude', 'longitude']);
    
    if (!latitude || !longitude) {
      log('📍 No location set');
      return;
    }

    if (!isAustralia(latitude, longitude)) {
      log('⚠️ Location outside Australia');
      await chrome.storage.local.set({
        lastCheck: new Date().toISOString(),
        alertCount: 0,
        warnings: [],
        debugLog: debugLog
      });
      return;
    }

    const state = getAustralianState(latitude, longitude);
    const locationName = await getLocationName(latitude, longitude);
    
    log('='.repeat(60));
    log(`🌩️ Checking warnings for: ${locationName || 'Unknown'}, ${state}`);
    log(`📍 Coordinates: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    log('='.repeat(60));
    
    // Fetch warnings from RSS feed for user's state
    const allWarnings = await fetchAllWarnings(state, locationName);
    
    // All warnings are already filtered for the user's state/location
    const stateWarnings = allWarnings;
    
    // Deduplicate
    const uniqueWarnings = [];
    const seenTitles = new Set();
    
    for (const warning of stateWarnings) {
      const normalizedTitle = warning.title.toLowerCase().trim().replace(/[^\w\s]/g, '');
      
      if (!seenTitles.has(normalizedTitle)) {
        seenTitles.add(normalizedTitle);
        uniqueWarnings.push(warning);
      }
    }
    
    log(`✨ Unique warnings for ${state}: ${uniqueWarnings.length}`);
    log('='.repeat(60));
    
    // Log each warning
    if (uniqueWarnings.length > 0) {
      log('📋 ACTIVE WARNINGS:');
      uniqueWarnings.forEach((w, i) => {
        log(`${i + 1}. [${w.severity}] ${w.title}`);
      });
    } else {
      log('✅ No active warnings for your area');
    }
    log('='.repeat(60));
    
    // Send notifications for new important warnings
    const currentAlertIds = new Set();
    
    for (const warning of uniqueWarnings) {
      const alertId = warning.id;
      currentAlertIds.add(alertId);
      
      if (!lastAlerts.has(alertId) && shouldNotify(warning)) {
        log(`🔔 SENDING NOTIFICATION: ${warning.title}`);
        
        // Create a more detailed notification message
        const warningAreas = warning.description ? warning.description : '';
        const notificationMessage = warningAreas 
          ? `${warning.type} for ${locationName || state}\n\n${warningAreas.substring(0, 150)}...`
          : `${warning.type} warning active for ${locationName || state}`;
        
        await chrome.notifications.create(String(alertId), {
          type: 'basic',
          iconUrl: 'icon128.png',
          title: `Weather Alert: ${locationName || state}`,
          message: warning.title,
          contextMessage: warning.severity === 'Severe' ? 'SEVERE WARNING' : warning.type,
          priority: warning.severity === 'Severe' ? 2 : 1,
          requireInteraction: warning.severity === 'Severe',
          buttons: [{ title: 'View Warning Details' }],
          silent: false
        });
        
        await chrome.storage.local.set({
          [`warning_${alertId}`]: warning
        });
      }
    }
    
    lastAlerts = currentAlertIds;
    
    await chrome.storage.local.set({ 
      lastCheck: new Date().toISOString(),
      alertCount: uniqueWarnings.length,
      state: state,
      locationName: locationName,
      warnings: uniqueWarnings,
      debugLog: debugLog
    });
    
    log(`✅ Check complete at ${new Date().toLocaleTimeString()}`);
    
  } catch (error) {
    log(`❌ Error: ${error}`);
    console.error('❌ Error:', error);
    await chrome.storage.local.set({ debugLog: debugLog });
  }
}

chrome.alarms.create('weatherCheck', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'weatherCheck') {
    checkWeatherAlerts();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkNow') {
    console.log('📱 Manual check from popup');
    checkWeatherAlerts().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log('🚀 Extension started');
  checkWeatherAlerts();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('📦 Extension installed');
  checkWeatherAlerts();
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const result = await chrome.storage.local.get([`warning_${notificationId}`, 'state']);
  const warning = result[`warning_${notificationId}`];
  
  const url = warning?.link || (result.state ? getBOMWarningsURL(result.state) : 'https://www.bom.gov.au/weather-and-climate/warnings-and-alerts');
  
  chrome.tabs.create({ url });
  chrome.notifications.clear(notificationId);
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    const result = await chrome.storage.local.get([`warning_${notificationId}`, 'state']);
    const warning = result[`warning_${notificationId}`];
    
    const url = warning?.link || (result.state ? getBOMWarningsURL(result.state) : 'https://www.bom.gov.au/weather-and-climate/warnings-and-alerts');
    
    chrome.tabs.create({ url });
  }
});
/**
 * PersistIQ Chrome Extension
 * Simple popup script with explicit view management
 */

document.addEventListener('DOMContentLoaded', function() {
  // First make auth-view visible with transition
  setTimeout(() => {
    document.getElementById('auth-view').classList.add('visible');
  }, 100);
  
  initializePopup();
  setupEventListeners();
  
  // Initialize pop-up Flatpickr calendar for the schedule date input
  flatpickr("#schedule-date", { 
    minDate: "today",
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "F j, Y"
  });
  
  // Initialize campaign selector for the Add Lead tab
  chrome.storage.local.get('apiKey', function(result) {
    if (result.apiKey) {
      loadCampaignsForSelect();
      
      // Restore last searched lead if available
      chrome.storage.local.get('lastSearchedLeadId', function(result) {
        if (result.lastSearchedLeadId) {
          const leadInfoTab = document.querySelector('.tab[data-tab="lead-info-tab"]');
          if (leadInfoTab && (leadInfoTab.classList.contains('active') || document.getElementById('lead-info-tab').style.display !== 'none')) {
            document.getElementById('lead-id-search').value = result.lastSearchedLeadId;
            setTimeout(() => searchLeadById(), 300);
          }
        }
      });
    }
  });
  
  // Set up field caching for all input fields
  setupFieldCaching();
});

/**
 * Initialize the popup UI based on authentication state
 */
function initializePopup() {
  // Get stored lead email and ID
  chrome.storage.local.get(['leadEmail', 'leadId', 'apiKey', 'selectedUser', 'selectedMailbox', 'userEmail'], function(data) {
    console.log('Initializing popup with data:', data);
    
    // Check if we have a valid API key
    if (!data.apiKey) {
      console.log('No API key found, showing auth view');
      showView('auth-view');
      return;
    }
    
    // Check if we have a selected user
    if (!data.selectedUser) {
      console.log('No selected user found, showing auth view');
      showView('auth-view');
      return;
    }
    
    // Check if we have a selected mailbox
    if (!data.selectedMailbox) {
      console.log('No selected mailbox found, showing auth view');
      showView('auth-view');
      return;
    }
    
    // Show main view and load data
    showView('main-view');
    loadUserInfo();
    loadCampaigns();
    
    // If we have a lead email or ID, search for it
    if (data.leadEmail) {
      console.log('Found stored lead email, searching:', data.leadEmail);
      const leadEmailSearchInput = document.getElementById('lead-email-search');
      if (leadEmailSearchInput) {
        leadEmailSearchInput.value = data.leadEmail;
        // Trigger the search after setting the value
        searchLeadByEmail(); 
      } else {
        console.warn('Lead email search input not found during initialization.');
      }
    } else if (data.leadId) {
      console.log('Found stored lead ID, searching:', data.leadId);
      document.getElementById('lead-id').value = data.leadId;
      searchLeadById();
    }
  });
}

/**
 * Set up event listeners for UI interactions
 */
function setupEventListeners() {
  // Auth view
  document.getElementById('connect-btn').addEventListener('click', handleConnect);
  
  // Email and API key caching is handled by setupFieldCaching()
  
  // User view
  document.getElementById('user-select').addEventListener('change', handleUserChange);
  document.getElementById('user-continue').addEventListener('click', handleUserContinue);
  document.getElementById('disconnect-btn').addEventListener('click', handleDisconnect);
  
  // Main view
  document.getElementById('change-user-btn').addEventListener('click', function() {
    // Call handleDisconnect to log out completely
    handleDisconnect();
  });
  
  // Lead Info tab - search by email first, then by ID
  document.getElementById('search-lead-email-btn').addEventListener('click', searchLeadByEmail);
  
  // Unified Lead Creation
  const tabElement = document.querySelector('.tab[data-tab="add-lead-tab"]');
  tabElement.addEventListener('click', function() {
    // Pre-load lead fields and campaigns before showing the tab
    loadLeadFields();
    loadCampaignsForSelect();
  });
  
  // Create unified lead button
  document.getElementById('create-unified-lead').addEventListener('click', function() {
    createUnifiedLead();
  });
  
  // Add campaign dynamically loading on tab select  
  document.querySelector('.tab[data-tab="add-lead-tab"]').addEventListener('click', function() {
    // Load campaigns for the campaign selector if not already loaded
    const campaignSelect = document.getElementById('add-to-campaign-select');
    if (campaignSelect.options.length <= 1) {
      loadCampaignsForSelect();
    }
  });
  
  // Tabs with smooth transitions
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      const tabId = this.getAttribute('data-tab');
      const selectedTab = document.getElementById(tabId);
      
      // First fade out all tabs
      const allTabs = document.querySelectorAll('.tab-content');
      allTabs.forEach(content => {
        content.classList.remove('visible');
      });
      
      // After a short delay, hide old tabs and show the new one
      setTimeout(() => {
        allTabs.forEach(content => {
          content.style.display = 'none';
        });
        
        // Display the selected tab and prepare for fade-in
        selectedTab.style.display = 'block';
        
        // Force a reflow to ensure the transition works
        selectedTab.offsetHeight;
        
        // Fade in the selected tab
        setTimeout(() => {
          selectedTab.classList.add('visible');
        }, 30);
      }, 300); // Match the transition duration
      
      // Save selected tab to storage
      chrome.storage.local.set({ lastActiveTab: tabId });
    });
  });
  
  // Campaign search
  document.getElementById('campaign-search').addEventListener('input', function() {
    const searchTerm = this.value.toLowerCase();
    const campaignItems = document.querySelectorAll('.campaign-item');
    
    campaignItems.forEach(item => {
      const title = item.querySelector('.campaign-title').textContent.toLowerCase();
      if (title.includes(searchTerm)) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  });
}

/**
 * Handle connect button click
 */
function handleConnect() {
  const apiKeyInput = document.getElementById('api-key');
  const userEmailInput = document.getElementById('user-email');
  const connectBtn = document.getElementById('connect-btn');
  
  const apiKey = apiKeyInput.value.trim();
  const userEmail = userEmailInput.value.trim();
  
  // Disable button and show loading state
  connectBtn.textContent = 'Connecting...';
  connectBtn.disabled = true;
  
  // Hide any previous errors
  document.getElementById('auth-error').style.display = 'none';
  
  if (!apiKey) {
    showError('auth-error', 'Please enter your API key');
    connectBtn.textContent = 'Connect';
    connectBtn.disabled = false;
    return;
  }
  
  // Test if API key is valid and find the user with matching email
  fetch('https://api.persistiq.com/v1/users', {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    }
  })
  .then(response => {
    if (response.ok) {
      return response.json();
    } else {
      throw new Error('Invalid API key');
    }
  })
  .then(data => {
    if (!data.users || data.users.length === 0) {
      throw new Error('No users found in your PersistIQ account');
    }
    
    // If no email provided, use the first user
    if (!userEmail) {
      const firstUser = data.users[0];
      // Store API key and user info
      chrome.storage.local.set({ 
        apiKey: apiKey,
        selectedUser: firstUser.id,
        selectedMailbox: firstUser.default_mailbox_id,
        userEmail: firstUser.email
      }, function() {
        if (chrome.runtime.lastError) {
          console.error('Error saving API key:', chrome.runtime.lastError);
          showError('auth-error', 'Error saving API key. Please try again.');
          connectBtn.textContent = 'Connect';
          connectBtn.disabled = false;
          return;
        }
        console.log('API key and user info saved successfully');
        showView('main-view');
        loadUserInfo();
        loadCampaigns();
      });
    } else {
      // Find user with matching email
      const matchingUser = data.users.find(user => user.email.toLowerCase() === userEmail.toLowerCase());
      if (!matchingUser) {
        throw new Error('No user found with the provided email');
      }
      
      // Store API key and user info
      chrome.storage.local.set({ 
        apiKey: apiKey,
        selectedUser: matchingUser.id,
        selectedMailbox: matchingUser.default_mailbox_id,
        userEmail: matchingUser.email
      }, function() {
        if (chrome.runtime.lastError) {
          console.error('Error saving API key:', chrome.runtime.lastError);
          showError('auth-error', 'Error saving API key. Please try again.');
          connectBtn.textContent = 'Connect';
          connectBtn.disabled = false;
          return;
        }
        console.log('API key and user info saved successfully');
        showView('main-view');
        loadUserInfo();
        loadCampaigns();
      });
    }
  })
  .catch(error => {
    console.error('Connection error:', error);
    showError('auth-error', error.message);
    connectBtn.textContent = 'Connect';
    connectBtn.disabled = false;
  });
}

/**
 * Handle user selection change
 */
function handleUserChange() {
  const userSelect = document.getElementById('user-select');
  const selectedUserId = userSelect.value;
  const selectedOption = userSelect.options[userSelect.selectedIndex];
  const defaultMailboxId = selectedOption.dataset.defaultMailbox;
  const userEmail = selectedOption.dataset.email;
  
  if (selectedUserId && defaultMailboxId) {
    // Auto-select the default mailbox directly
    console.log('Using default mailbox ID:', defaultMailboxId);
    
    // Populate the mailbox field directly with the default mailbox
    const mailboxContainer = document.getElementById('mailbox-container');
    const mailboxSelect = document.getElementById('mailbox-select');
    
    mailboxContainer.style.display = 'block';
    mailboxSelect.innerHTML = `<option value="${defaultMailboxId}" selected>${userEmail}</option>`;
  }
}

/**
 * Handle user continue button click
 */
function handleUserContinue() {
  const userSelect = document.getElementById('user-select');
  const mailboxSelect = document.getElementById('mailbox-select');
  
  const selectedUserId = userSelect.value;
  const selectedMailboxId = mailboxSelect.value;
  
  // Hide previous errors
  document.getElementById('user-error').style.display = 'none';
  
  if (!selectedUserId) {
    showError('user-error', 'Please select a user');
    return;
  }
  
  if (!selectedMailboxId) {
    showError('user-error', 'Please select a mailbox');
    return;
  }
  
  // Store selections
  chrome.storage.local.set({
    selectedUser: selectedUserId,
    selectedMailbox: selectedMailboxId
  }, function() {
    // Switch to main view
    showView('main-view');
    loadUserInfo();
    loadCampaigns();
  });
}

/**
 * Handle disconnect button click
 */
function handleDisconnect() {
  // Clear stored data including persistence data
  chrome.storage.local.remove([
    'apiKey', 
    'selectedUser', 
    'selectedMailbox',
    'lastActiveTab',
    'leadEmail',
    'userEmail',
    'leadEmailSearch',
    'campaignSearch',
    'formFields',
    'leadFormStep',
    'lastSearchedLeadEmail',
    'lastSearchedLeadId',
    'cachedLeadData'
  ], function() {
    showView('auth-view');
  });
}

/**
 * Load users from PersistIQ API
 */
function loadUsers() {
  const userSelect = document.getElementById('user-select');
  userSelect.innerHTML = '<option value="" disabled selected>Loading users...</option>';
  
  chrome.storage.local.get('apiKey', function(result) {
    const apiKey = result.apiKey;
    
    if (!apiKey) {
      userSelect.innerHTML = '<option value="" disabled selected>No API key found</option>';
      return;
    }
    
    fetch('https://api.persistiq.com/v1/users', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Failed to load users');
      }
    })
    .then(data => {
      if (data && data.users && data.users.length > 0) {
        userSelect.innerHTML = '<option value="" disabled selected>Select a user</option>';
        
        data.users.forEach(user => {
          const option = document.createElement('option');
          option.value = user.id;
          option.textContent = `${user.name} (${user.email})`;
          option.dataset.defaultMailbox = user.default_mailbox_id;
          option.dataset.email = user.email;
          userSelect.appendChild(option);
        });
        
        // Select previously selected user if available
        chrome.storage.local.get('selectedUser', function(result) {
          if (result.selectedUser) {
            userSelect.value = result.selectedUser;
            // Call handleUserChange() instead of loadMailboxes() to use the default mailbox
            handleUserChange();
          }
        });
      } else {
        userSelect.innerHTML = '<option value="" disabled selected>No users found</option>';
      }
    })
    .catch(error => {
      console.error('Error loading users:', error);
      userSelect.innerHTML = '<option value="" disabled selected>Error loading users</option>';
    });
  });
}

/**
 * Load mailboxes for a specific user
 */
function loadMailboxes(userId) {
  const mailboxContainer = document.getElementById('mailbox-container');
  const mailboxSelect = document.getElementById('mailbox-select');
  
  // Show mailbox selection
  mailboxContainer.style.display = 'block';
  mailboxSelect.innerHTML = '<option value="" disabled selected>Loading mailboxes...</option>';
  
  chrome.storage.local.get('apiKey', function(result) {
    const apiKey = result.apiKey;
    
    fetch(`https://api.persistiq.com/v1/users/${userId}/mailboxes`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Failed to load mailboxes');
      }
    })
    .then(data => {
      if (data && data.mailboxes && data.mailboxes.length > 0) {
        mailboxSelect.innerHTML = '<option value="" disabled selected>Select a mailbox</option>';
        
        data.mailboxes.forEach(mailbox => {
          const option = document.createElement('option');
          option.value = mailbox.id;
          option.textContent = mailbox.email;
          mailboxSelect.appendChild(option);
        });
        
        // Get the default mailbox ID from the selected user
        const userSelect = document.getElementById('user-select');
        const selectedOption = userSelect.options[userSelect.selectedIndex];
        const defaultMailboxId = selectedOption.dataset.defaultMailbox;
        
        // First try to use stored mailbox if available
        chrome.storage.local.get('selectedMailbox', function(result) {
          if (result.selectedMailbox) {
            mailboxSelect.value = result.selectedMailbox;
          } 
          // Otherwise try to use default mailbox
          else if (defaultMailboxId) {
            // Find the matching mailbox
            const defaultMailbox = data.mailboxes.find(m => m.id === defaultMailboxId);
            if (defaultMailbox) {
              mailboxSelect.value = defaultMailboxId;
              console.log('Auto-selected default mailbox:', defaultMailbox.email);
            }
          }
        });
      } else {
        mailboxSelect.innerHTML = '<option value="" disabled selected>No mailboxes found</option>';
      }
    })
    .catch(error => {
      console.error('Error loading mailboxes:', error);
      mailboxSelect.innerHTML = '<option value="" disabled selected>Error loading mailboxes</option>';
    });
  });
}

/**
 * Load user information
 */
function loadUserInfo() {
  chrome.storage.local.get(['apiKey', 'selectedUser', 'selectedMailbox'], function(result) {
    const apiKey = result.apiKey;
    const userId = result.selectedUser;
    
    if (!apiKey || !userId) {
      document.getElementById('current-user').textContent = 'Error: Missing user information';
      document.getElementById('current-mailbox').textContent = 'Error: Missing mailbox information';
      return;
    }
    
    // Fetch user details
    fetch(`https://api.persistiq.com/v1/users`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    })
    .then(response => response.json())
    .then(data => {
      if (data && data.users) {
        const user = data.users.find(u => u.id === userId);
        if (user) {
          document.getElementById('current-user').textContent = `${user.name} (${user.email})`;
          
          // Display mailbox info from the user data directly
          document.getElementById('current-mailbox').textContent = user.email;
        }
      }
    })
    .catch(error => {
      console.error('Error loading user info:', error);
      document.getElementById('current-user').textContent = 'Error loading user information';
      document.getElementById('current-mailbox').textContent = 'Error loading mailbox information';
    });
  });
}

/**
 * Load campaigns
 */
function loadCampaigns() {
  const campaignsContainer = document.getElementById('campaigns-container');
  campaignsContainer.innerHTML = '<div style="text-align: center; padding: 20px;"><p>Loading campaigns...</p></div>';
  
  chrome.storage.local.get(['apiKey', 'selectedUser'], function(result) {
    const apiKey = result.apiKey;
    const currentUserId = result.selectedUser;
    
    if (!currentUserId) {
      campaignsContainer.innerHTML = '<div style="text-align: center; padding: 20px;"><p>No user selected</p></div>';
      return;
    }
    
    fetch('https://api.persistiq.com/v1/campaigns', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Failed to load campaigns');
      }
    })
    .then(data => {
      if (data && data.campaigns && data.campaigns.length > 0) {
        // Filter to only show campaigns created by the current user
        const userCampaigns = data.campaigns.filter(campaign => 
          campaign.creator && campaign.creator.id === currentUserId
        );
        
        if (userCampaigns.length > 0) {
          campaignsContainer.innerHTML = '';
          
          userCampaigns.forEach(campaign => {
            const campaignElement = createCampaignElement(campaign);
            campaignsContainer.appendChild(campaignElement);
          });
        } else {
          campaignsContainer.innerHTML = '<div style="text-align: center; padding: 20px;"><p>You do not have any campaigns you can use</p><p>Create a campaign in PersistIQ first</p></div>';
        }
      } else {
        campaignsContainer.innerHTML = '<div style="text-align: center; padding: 20px;"><p>No campaigns found</p></div>';
      }
    })
    .catch(error => {
      console.error('Error loading campaigns:', error);
      campaignsContainer.innerHTML = '<div style="text-align: center; padding: 20px;"><p>Error loading campaigns</p></div>';
    });
  });
}

/**
 * Create a campaign element
 */
function createCampaignElement(campaign) {
  const div = document.createElement('div');
  div.className = 'campaign-item';
  div.setAttribute('data-campaign-id', campaign.id);
  
  // Use stats from the campaign data
  const contactedCount = campaign.stats?.prospects_contacted || 0;
  const reachedCount = campaign.stats?.prospects_reached || 0;
  const openedCount = campaign.stats?.prospects_opened || 0;
  const repliedCount = campaign.stats?.prospects_replied || 0;
  
  // Show creator info
  const creatorName = campaign.creator?.name || 'Unknown';
  
  div.innerHTML = `
    <div class="campaign-header">
      <div class="campaign-title">${campaign.name}</div>
      <div class="campaign-creator">Created by: ${creatorName}</div>
    </div>
    <div class="campaign-stats">
      <div class="campaign-stat">
        <span>${contactedCount}</span> Contacted
      </div>
      <div class="campaign-stat">
        <span>${reachedCount}</span> Reached
      </div>
      <div class="campaign-stat">
        <span>${openedCount}</span> Opened
      </div>
      <div class="campaign-stat">
        <span>${repliedCount}</span> Replied
      </div>
    </div>
    <div class="campaign-status-container">
      <div id="campaign-status-${campaign.id}" class="campaign-status"></div>
    </div>
    <div class="campaign-actions" style="display: flex; justify-content: flex-end; align-items: center; margin-top: 8px;">
      <a href="https://persistiq.com/app#/campaigns/${campaign.id}" target="_blank" style="display: inline-block; padding: 4px 8px; background-color: #f3f4f6; border-radius: 4px; text-decoration: none; color: #374151; font-size: 12px;">
        View in PersistIQ
      </a>
    </div>
  `;
  
  return div;
}

/**
 * Show a specific view and hide others with smooth transitions
 */
function showView(viewId) {
  const views = ['auth-view', 'user-view', 'main-view'];
  
  console.log('Showing view:', viewId);
  
  // First remove visible class from all views to fade them out
  views.forEach(view => {
    const element = document.getElementById(view);
    element.classList.remove('visible');
  });
  
  // After fade-out completes, hide previous views and show the new one
  setTimeout(() => {
    views.forEach(view => {
      const element = document.getElementById(view);
      
      if (view === viewId) {
        // Show the selected view
        element.style.display = 'block';
        
        // Force a reflow
        element.offsetHeight;
        
        // Begin fading in the selected view after a short delay
        setTimeout(() => {
          element.classList.add('visible');
          
          // If showing main view, make sure first tab is visible
          if (viewId === 'main-view') {
            // Apply visible class to the first tab content
            const firstTab = document.querySelector('.tab-content');
            if (firstTab && !firstTab.classList.contains('visible')) {
              firstTab.style.display = 'block';
              firstTab.offsetHeight; // Force reflow
              firstTab.classList.add('visible');
            }
            
            // Get last active tab from storage and activate it
            chrome.storage.local.get('lastActiveTab', (result) => {
              if (result.lastActiveTab) {
                // Find and click the tab that corresponds to the stored active tab
                const tabToActivate = document.querySelector(`.tab[data-tab="${result.lastActiveTab}"]`);
                if (tabToActivate) {
                  tabToActivate.click();
                }
              }
            });
          }
        }, 30);
      } else {
        // Hide all other views
        element.style.display = 'none';
      }
    });
  }, 300); // Match the transition duration
}

/**
 * Show an error message
 */
function showError(elementId, message) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
    element.style.display = 'block';
  } else {
    console.error(`Error element with id '${elementId}' not found:`, message);
  }
}

/**
 * Show a success message
 */
function showSuccess(elementId, message) {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.style.display = 'block';
}

// Store the current lead information
let currentLead = null;
let currentLeadFields = null;
let cachedLeadData = {}; // Cache for lead data
let cachedLeadEmails = {}; // Cache for email to lead ID mapping

/**
 * Search for a lead by ID and display all information
 */
/**
 * Search for a lead by email first, then by ID
 */
function searchLeadByEmail() {
  const leadEmail = document.getElementById('lead-email-search').value.trim();
  
  // Reset everything
  document.getElementById('lead-details').style.display = 'none';
  document.getElementById('lead-info-error').style.display = 'none';
  document.getElementById('lead-edit-form').style.display = 'none';
  
  if (!leadEmail) {
    showError('lead-info-error', 'Please enter a lead email');
    return;
  }
  
  // Save the email for persistence
  chrome.storage.local.set({ lastSearchedLeadEmail: leadEmail });
  
  // Check if we have this email in cache
  if (cachedLeadEmails[leadEmail]) {
    console.log('Using cached lead ID for email:', leadEmail);
    const leadId = cachedLeadEmails[leadEmail];
    document.getElementById('lead-id-search').value = leadId;
    searchLeadById();
    return;
  }
  
  // Get API key
  chrome.storage.local.get('apiKey', function(result) {
    const apiKey = result.apiKey;
    
    if (!apiKey) {
      showError('lead-info-error', 'API key not found. Please reconnect your account.');
      return;
    }
    
    // Show loading state
    document.getElementById('lead-info-error').textContent = 'Searching...';
    document.getElementById('lead-info-error').style.display = 'block';
    
    // First, search for lead by email
    fetch(`https://api.persistiq.com/v1/leads?email=${encodeURIComponent(leadEmail)}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Failed to search for leads');
      }
    })
    .then(data => {
      if (data && data.leads && data.leads.length > 0) {
        const leadId = data.leads[0].id;
        
        // Cache the email to ID mapping
        if (!cachedLeadEmails) cachedLeadEmails = {};
        cachedLeadEmails[leadEmail] = leadId;
        
        // Set the lead ID in the hidden field
        document.getElementById('lead-id-search').value = leadId;
        
        // Now search by the lead ID
        searchLeadById();
      } else {
        showError('lead-info-error', 'No lead found with this email address');
      }
    })
    .catch(error => {
      console.error('Error searching for lead by email:', error);
      showError('lead-info-error', 'Error searching for lead: ' + error.message);
    });
  });
}

/**
 * Search for a lead by ID
 */
function searchLeadById() {
  const leadId = document.getElementById('lead-id-search').value.trim();
  
  // Reset everything
  document.getElementById('lead-details').style.display = 'none';
  document.getElementById('lead-info-error').style.display = 'none';
  document.getElementById('lead-edit-form').style.display = 'none';
  
  if (!leadId) {
    showError('lead-info-error', 'No lead ID available');
    return;
  }
  
  // Check if we have this lead in cache
  if (cachedLeadData[leadId]) {
    console.log('Using cached lead data for', leadId);
    currentLead = cachedLeadData[leadId].lead;
    displayLeadDetails(cachedLeadData[leadId].lead);
    
    // Still fetch campaigns and activity as they might have changed
    fetchLeadCampaigns(leadId);
    fetchLeadActivity(leadId);
    
    // Fetch lead fields for editing if needed
    if (!currentLeadFields) {
      fetchLeadFields();
    } else {
      // Setup edit button listeners
      setupEditButtonListeners();
    }
    
    // Save the lead ID to storage for persistence across popup opens
    chrome.storage.local.set({ lastSearchedLeadId: leadId });
    
    return;
  }
  
  // Get API key
  chrome.storage.local.get('apiKey', function(result) {
    const apiKey = result.apiKey;
    
    if (!apiKey) {
      showError('lead-info-error', 'API key not found. Please reconnect your account.');
      return;
    }
    
    // Show loading state
    document.getElementById('lead-info-error').textContent = 'Searching...';
    document.getElementById('lead-info-error').style.display = 'block';
    
    // Fetch lead by ID
    fetch(`https://api.persistiq.com/v1/leads/${leadId}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else if (response.status === 404) {
        throw new Error('Lead not found');
      } else {
        throw new Error('Failed to retrieve lead');
      }
    })
    .then(data => {
      document.getElementById('lead-info-error').style.display = 'none';
      
      if (data && data.lead) {
        // Store in cache
        cachedLeadData[leadId] = data;
        
        // Set current lead
        currentLead = data.lead;
        
        // Display lead details
        displayLeadDetails(data.lead);
        
        // Fetch campaigns information
        fetchLeadCampaigns(leadId);
        
        // Fetch lead activity
        fetchLeadActivity(leadId);
        
        // Also fetch lead fields for editing
        fetchLeadFields();
        
        // Save the lead ID to storage for persistence across popup opens
        chrome.storage.local.set({ lastSearchedLeadId: leadId });
      } else {
        showError('lead-info-error', 'No lead found with this ID');
      }
    })
    .catch(error => {
      console.error('Error retrieving lead:', error);
      showError('lead-info-error', 'Error retrieving lead: ' + error.message);
    });
  });
}

/**
 * Fetch lead fields for the edit form
 */
function fetchLeadFields() {
  const container = document.getElementById('lead-fields-container');
  if (!container) return;

  // Show loading message
  container.innerHTML = '<div style="text-align: center; padding: 10px;"><p>Loading fields...</p></div>';

  // Get API key from storage
  chrome.storage.local.get('apiKey', function(result) {
    const apiKey = result.apiKey;
    
    if (!apiKey) {
      container.innerHTML = '<div class="error">API key not found</div>';
      return;
    }

    // Fetch lead fields from API
    fetch('https://api.persistiq.com/v1/lead_fields', {
      headers: {
        'x-api-key': apiKey
      }
    })
    .then(response => response.json())
    .then(data => {
      // Check if data has the expected structure
      if (data && data.lead_fields && Array.isArray(data.lead_fields)) {
        dynamicallyBuildLeadForm(data.lead_fields);
      } else {
        throw new Error('Invalid response format from API');
      }
    })
    .catch(error => {
      container.innerHTML = `<div class="error">Error loading fields: ${error.message}</div>`;
    });
  });
}

function dynamicallyBuildLeadForm(leadFields) {
  const container = document.getElementById('lead-fields-container');
  if (!container) return;

  let html = '';
  
  // Sort fields to put standard fields first
  const standardFields = ['first_name', 'last_name', 'company', 'title', 'phone'];
  leadFields.sort((a, b) => {
    const aIndex = standardFields.indexOf(a.name);
    const bIndex = standardFields.indexOf(b.name);
    
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  // Skip email field as it's already in the form
  leadFields = leadFields.filter(field => field.name !== 'email');
  
  // Add each field to the form
  leadFields.forEach(field => {
    const fieldId = `lead-field-${field.name}`;
    html += `
      <div class="form-group">
        <label for="${fieldId}">${formatFieldName(field.name)}</label>
    `;

    if (field.type === 'select' && field.options) {
      html += `
        <select id="${fieldId}" name="${field.name}" class="form-control">
          <option value="">Select ${formatFieldName(field.name)}</option>
          ${field.options.map(option => `<option value="${option}">${option}</option>`).join('')}
        </select>
      `;
    } else {
      html += `
        <input type="${field.type === 'date' ? 'date' : 'text'}"
               id="${fieldId}"
               name="${field.name}"
               class="form-control"
               ${field.required ? 'required' : ''}
               placeholder="Enter ${formatFieldName(field.name)}">
      `;
    }

    html += '</div>';
  });

  container.innerHTML = html;

  // Restore any previously cached values
  restoreFormFieldsData();
}

/**
 * Setup edit button listeners
 */
function setupEditButtonListeners() {
  // Edit lead button
  document.getElementById('edit-lead-btn').addEventListener('click', function() {
    document.getElementById('lead-edit-form').style.display = 'block';
    document.getElementById('lead-attributes').style.display = 'none';
    buildEditForm();
  });
  
  // Cancel edit button
  document.getElementById('cancel-edit-btn').addEventListener('click', function() {
    document.getElementById('lead-edit-form').style.display = 'none';
    document.getElementById('lead-attributes').style.display = 'block';
    document.getElementById('edit-lead-error').style.display = 'none';
    document.getElementById('edit-lead-success').style.display = 'none';
  });
  
  // Save changes button
  document.getElementById('save-lead-btn').addEventListener('click', saveLeadChanges);
}

/**
 * Build the edit form with current lead data
 */
function buildEditForm() {
  if (!currentLead || !currentLeadFields) {
    console.error('Cannot build edit form: missing lead data or fields');
    return;
  }
  
  const editFieldsContainer = document.getElementById('lead-edit-fields');
  editFieldsContainer.innerHTML = '';
  
  // Sort the fields to keep standard fields at the top
  const standardFields = ['email', 'first_name', 'last_name', 'company_name', 'title', 'phone'];
  
  // Create a sorted copy of the fields array
  const sortedFields = [...currentLeadFields].sort((a, b) => {
    const aIndex = standardFields.indexOf(a.name);
    const bIndex = standardFields.indexOf(b.name);
    
    // If both are standard fields, sort by their order in standardFields
    if (aIndex >= 0 && bIndex >= 0) {
      return aIndex - bIndex;
    }
    
    // If only a is a standard field, a comes first
    if (aIndex >= 0) return -1;
    
    // If only b is a standard field, b comes first
    if (bIndex >= 0) return 1;
    
    // Otherwise sort alphabetically
    return a.name.localeCompare(b.name);
  });
  
  // Create form fields for each lead field
  sortedFields.forEach(field => {
    // Create a form group
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    
    // Create label
    const label = document.createElement('label');
    label.htmlFor = `edit-field-${field.name}`;
    label.textContent = field.label || formatFieldName(field.name);
    
    // Create input
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `edit-field-${field.name}`;
    input.name = field.name;
    input.placeholder = field.label || formatFieldName(field.name);
    
    // Set current value if available
    if (currentLead.data && currentLead.data[field.name]) {
      input.value = currentLead.data[field.name];
    }
    
    // Add to form group
    formGroup.appendChild(label);
    formGroup.appendChild(input);
    
    // Add to container
    editFieldsContainer.appendChild(formGroup);
  });
}

/**
 * Save lead changes
 */
function saveLeadChanges() {
  if (!currentLead) {
    showError('edit-lead-error', 'No lead data available');
    return;
  }
  
  const leadId = currentLead.id;
  
  // Get all input fields from the form
  const formContainer = document.getElementById('lead-edit-fields');
  const inputFields = formContainer.querySelectorAll('input[type="text"]');
  
  // Prepare lead data object
  const leadData = {
    lead: {
      data: {}
    }
  };
  
  // Add all field values to the lead object
  inputFields.forEach(input => {
    if (input.value.trim()) {
      // Extract field name from the input ID
      const fieldName = input.name;
      leadData.lead.data[fieldName] = input.value.trim();
    }
  });
  
  // Show loading state
  const saveBtn = document.getElementById('save-lead-btn');
  const originalBtnText = saveBtn.textContent;
  saveBtn.textContent = 'Saving...';
  saveBtn.disabled = true;
  
  document.getElementById('edit-lead-error').style.display = 'none';
  document.getElementById('edit-lead-success').style.display = 'none';
  
  // Get API key
  chrome.storage.local.get('apiKey', function(result) {
    const apiKey = result.apiKey;
    
    if (!apiKey) {
      showError('edit-lead-error', 'API key not found');
      saveBtn.textContent = originalBtnText;
      saveBtn.disabled = false;
      return;
    }
    
    // Update the lead
    fetch(`https://api.persistiq.com/v1/leads/${leadId}`, {
      method: 'PATCH',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(leadData)
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Failed to update lead');
      }
    })
    .then(data => {
      if (data && data.lead) {
        // Update the current lead with new data
        currentLead = data.lead;
        
        // Show success message
        const successMsg = document.getElementById('edit-lead-success');
        successMsg.textContent = 'Lead updated successfully';
        successMsg.style.display = 'block';
        
        // Update the displayed lead details
        displayLeadDetails(data.lead);
        
        // Hide edit form after a delay
        setTimeout(() => {
          document.getElementById('lead-edit-form').style.display = 'none';
          document.getElementById('lead-attributes').style.display = 'block';
        }, 1500);
      }
    })
    .catch(error => {
      console.error('Error updating lead:', error);
      showError('edit-lead-error', 'Error updating lead: ' + error.message);
    })
    .finally(() => {
      // Reset button
      saveBtn.textContent = originalBtnText;
      saveBtn.disabled = false;
    });
  });
}

/**
 * Display detailed lead information
 * @param {Object} lead - The lead data
 */
function displayLeadDetails(lead) {
  // First ensure we're in the main view
  showView('main-view');
  
  // Switch to lead info tab
  const leadInfoTab = document.querySelector('[data-tab="lead-info-tab"]');
  if (leadInfoTab) {
    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    // Add active class to lead info tab
    leadInfoTab.classList.add('active');
    
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
    // Show lead info tab content
    const leadInfoContent = document.getElementById('lead-info-tab');
    if (leadInfoContent) {
      leadInfoContent.style.display = 'block';
    }
  }
  
  // Display the lead details container
  const leadDetails = document.getElementById('lead-details');
  if (leadDetails) {
    leadDetails.style.display = 'block';
  }
  
  // Display basic info
  const basicInfoContainer = document.getElementById('lead-basic-info');
  // Define isOptedOut here so it's available throughout the function
  const isOptedOut = (lead.data && (lead.data.optedout === true || lead.data.opted_out === true));
  
  if (basicInfoContainer) {
    basicInfoContainer.innerHTML = '';
    
    // Create a list of basic information
    const infoList = document.createElement('ul');
    infoList.style.cssText = 'list-style: none; padding: 0; margin: 0;';
    
    // Add opted out status if applicable
    if (isOptedOut) {
      const optedOutStatus = document.createElement('li');
      optedOutStatus.style.cssText = 'margin-bottom: 6px; color: #ef4444; font-weight: bold;';
      optedOutStatus.textContent = 'Lead Overview Opted out';
      infoList.appendChild(optedOutStatus);
    }
    
    // Only show ID and Email and Status (hide Created At and Updated At)
    const items = [
      { label: 'Email', value: (lead.data && lead.data.email) || 'N/A' },
      { label: 'Status', value: lead.status || 'N/A' }
    ];
    
    items.forEach(item => {
      const li = document.createElement('li');
      li.style.cssText = 'margin-bottom: 6px;';
      li.innerHTML = `<strong>${item.label}:</strong> ${item.value}`;
      infoList.appendChild(li);
    });
    
    basicInfoContainer.appendChild(infoList);
    
    // Add email stats
    const statsContainer = document.createElement('div');
    statsContainer.className = 'lead-stats';
    statsContainer.innerHTML = `
      <div class="lead-stat">
        <div class="lead-stat-label">Emails Sent</div>
        <div class="lead-stat-value">${lead.sent_count || 0}</div>
      </div>
      <div class="lead-stat">
        <div class="lead-stat-label">Replies</div>
        <div class="lead-stat-value">${lead.replied_count || 0}</div>
      </div>
    `;
    
    basicInfoContainer.appendChild(statsContainer);
  }
  
  // Display attributes
  const attributesContainer = document.getElementById('lead-attributes');
  if (attributesContainer) {
    displayLeadAttributes(lead);
  }
  
  // Fetch campaigns and activity
  if (lead.id) {
    fetchLeadCampaigns(lead.id);
    fetchLeadActivity(lead.id);
  }
  
  // Update subscribe button state
  const toggleSubscribeBtn = document.getElementById('toggle-subscribe-btn');
  if (toggleSubscribeBtn) {
    if (isOptedOut) {
      // If lead is opted out, hide the button and show a message
      toggleSubscribeBtn.style.display = 'none';
      const optOutMessage = document.createElement('div');
      optOutMessage.style.cssText = 'color: #ef4444; font-weight: bold; margin-top: 10px;';
      optOutMessage.textContent = 'This lead has opted out and cannot be resubscribed.';
      toggleSubscribeBtn.parentNode.appendChild(optOutMessage);
    } else {
      // Only show unsubscribe option for active leads
      toggleSubscribeBtn.style.display = 'block';
      toggleSubscribeBtn.textContent = 'Unsubscribe';
      toggleSubscribeBtn.style.backgroundColor = '#ef4444';
    }
  }
}

/**
 * Display lead attributes
 * @param {Object} lead - The lead data
 */
function displayLeadAttributes(lead) {
  const attributesContainer = document.getElementById('lead-attributes');
  attributesContainer.innerHTML = '';
  
  if (lead.data && Object.keys(lead.data).length > 0) {
    // Create a list of attributes
    const attrList = document.createElement('ul');
    attrList.style.cssText = 'list-style: none; padding: 0; margin: 0;';
    
    // Sort attributes alphabetically
    const sortedAttrs = Object.entries(lead.data).sort((a, b) => a[0].localeCompare(b[0]));
    
    sortedAttrs.forEach(([key, value]) => {
      if (value) { // Only show attributes with values
        const li = document.createElement('li');
        li.style.cssText = 'margin-bottom: 6px;';
        li.innerHTML = `<strong>${formatFieldName(key)}:</strong> ${value}`;
        attrList.appendChild(li);
      }
    });
    
    if (attrList.children.length > 0) {
      attributesContainer.appendChild(attrList);
    } else {
      attributesContainer.textContent = 'No attributes available';
    }
  } else {
    attributesContainer.textContent = 'No attributes available';
  }
}

/**
 * Fetch campaigns for a lead
 * @param {string} leadId - The lead ID
 */
function fetchLeadCampaigns(leadId) {
  const campaignsContainer = document.getElementById('lead-campaigns');
  campaignsContainer.innerHTML = '<p>Loading campaigns...</p>';
  
  chrome.storage.local.get(['apiKey', 'selectedUser'], function(result) {
    const apiKey = result.apiKey;
    const currentUserId = result.selectedUser;
    
    if (!apiKey) {
      console.error('No API key found');
      campaignsContainer.innerHTML = '<p>Error: API key not found</p>';
      return;
    }
    
    if (!currentUserId) {
      console.error('No user selected');
      campaignsContainer.innerHTML = '<p>Error: No user selected</p>';
      return;
    }
    
    // First get all campaigns
    fetch('https://api.persistiq.com/v1/campaigns', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Failed to load campaigns');
      }
    })
    .then(allCampaignsData => {
      // Then get campaigns the lead belongs to
      return fetch(`https://api.persistiq.com/v1/campaigns?lead_id=${leadId}`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      })
      .then(response => {
        if (response.ok) {
          return response.json();
        } else {
          throw new Error('Failed to load lead campaigns');
        }
      })
      .then(leadCampaignsData => {
        return {
          allCampaigns: allCampaignsData.campaigns || [],
          leadCampaigns: leadCampaignsData.campaigns || []
        };
      });
    })
    .then(data => {
      // Clear loading message
      campaignsContainer.innerHTML = '';
      
      // Filter campaigns to only show those created by the current user
      const userCampaigns = data.allCampaigns.filter(campaign => 
        campaign.creator && campaign.creator.id === currentUserId
      );
      
      if (userCampaigns.length > 0) {
        // Create a container for campaigns
        const campaignList = document.createElement('div');
        campaignList.className = 'campaign-list';
        
        // Create a message for campaigns
        const campaignsHeader = document.createElement('div');
        campaignsHeader.className = 'lead-campaigns-header';
        campaignsHeader.textContent = 'Your Campaigns';
        campaignsContainer.appendChild(campaignsHeader);
        
        // Create a campaign element for each campaign
        userCampaigns.forEach(campaign => {
          const isLeadInCampaign = data.leadCampaigns.some(c => c.id === campaign.id);
          
          const campaignItem = document.createElement('div');
          campaignItem.className = 'campaign-card';
          campaignItem.setAttribute('data-campaign-id', campaign.id);
          
          // Create campaign content
          campaignItem.innerHTML = `
            <div class="campaign-card-header">
              <div class="campaign-card-title">${campaign.name}</div>
            </div>
            <div class="campaign-actions">
              <button class="campaign-action-btn ${isLeadInCampaign ? 'remove' : 'add'}" data-campaign-id="${campaign.id}">
                ${isLeadInCampaign ? 'Remove' : 'Add'}
              </button>
            </div>
          `;
          
          // Add click handler to the button
          const actionButton = campaignItem.querySelector('.campaign-action-btn');
          actionButton.addEventListener('click', function() {
            const isCurrentlyInCampaign = this.classList.contains('remove');
            
            // Disable button and show loading state
            this.disabled = true;
            this.style.opacity = '0.7';
            this.textContent = isCurrentlyInCampaign ? 'Removing...' : 'Adding...';
            
            if (isCurrentlyInCampaign) {
              removeLeadFromCampaign(campaign.id, leadId);
              // Wait 10 seconds then update button
              setTimeout(() => {
                this.classList.remove('remove');
                this.classList.add('add');
                this.textContent = 'Add';
                this.disabled = false;
                this.style.opacity = '1';
              }, 10000);
            } else {
              addLeadToCampaign(campaign.id, leadId);
              // Wait 10 seconds then update button
              setTimeout(() => {
                this.classList.remove('add');
                this.classList.add('remove');
                this.textContent = 'Remove';
                this.disabled = false;
                this.style.opacity = '1';
              }, 10000);
            }
          });
          
          // Add to container
          campaignList.appendChild(campaignItem);
        });
        
        campaignsContainer.appendChild(campaignList);
      } else {
        campaignsContainer.innerHTML = '<p>You have no campaigns. Create a campaign in PersistIQ first.</p>';
      }
    })
    .catch(error => {
      console.error('Error loading campaigns:', error);
      campaignsContainer.innerHTML = `<p>Error loading campaigns: ${error.message}</p>`;
    });
  });
}

/**
 * Add a lead to a campaign
 * @param {string} campaignId - The campaign ID
 * @param {string} leadId - The lead ID
 */
function addLeadToCampaign(campaignId, leadId) {
  chrome.storage.local.get(['apiKey', 'selectedMailbox'], function(result) {
    const apiKey = result.apiKey;
    const mailboxId = result.selectedMailbox;
    
    if (!apiKey) {
      console.error('No API key found');
      return;
    }
    
    if (!mailboxId) {
      console.error('No mailbox selected');
      return;
    }
    
    fetch(`https://api.persistiq.com/v1/campaigns/${campaignId}/leads`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lead_id: leadId,
        mailbox_id: mailboxId
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text().then(text => text ? JSON.parse(text) : {});
    })
    .then(data => {
      console.log('Add to campaign response:', data);
      
      // Update the button state immediately
      const button = document.querySelector(`.campaign-action-btn[data-campaign-id="${campaignId}"]`);
      if (button) {
        button.classList.remove('add');
        button.classList.add('remove');
        button.textContent = 'Remove';
        button.disabled = false;
        button.style.opacity = '1';
      }
      
      // Refresh the campaigns list to show updated state
      fetchLeadCampaigns(leadId);
    })
    .catch(error => {
      console.error('Error adding lead to campaign:', error);
      
      // Reset button state on error
      const button = document.querySelector(`.campaign-action-btn[data-campaign-id="${campaignId}"]`);
      if (button) {
        button.classList.remove('remove');
        button.classList.add('add');
        button.textContent = 'Add';
        button.disabled = false;
        button.style.opacity = '1';
      }
    });
  });
}

/**
 * Remove a lead from a campaign
 * @param {string} campaignId - The campaign ID
 * @param {string} leadId - The lead ID
 */
function removeLeadFromCampaign(campaignId, leadId) {
  chrome.storage.local.get('apiKey', function(result) {
    const apiKey = result.apiKey;
    
    if (!apiKey) {
      console.error('No API key found');
      return;
    }

    fetch(`https://api.persistiq.com/v1/campaigns/${campaignId}/leads/${leadId}`, {
      method: 'DELETE',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text().then(text => text ? JSON.parse(text) : {});
    })
    .then(data => {
      console.log('Remove from campaign response:', data);
      
      // Update the button state immediately
      const button = document.querySelector(`.campaign-action-btn[data-campaign-id="${campaignId}"]`);
      if (button) {
        button.classList.remove('remove');
        button.classList.add('add');
        button.textContent = 'Add';
        button.disabled = false;
        button.style.opacity = '1';
      }
      
      // Refresh the campaigns list to show updated state
      fetchLeadCampaigns(leadId);
    })
    .catch(error => {
      console.error('Error removing lead from campaign:', error);
      
      // Reset button state on error
      const button = document.querySelector(`.campaign-action-btn[data-campaign-id="${campaignId}"]`);
      if (button) {
        button.classList.remove('add');
        button.classList.add('remove');
        button.textContent = 'Remove';
        button.disabled = false;
        button.style.opacity = '1';
      }
    });
  });
}

/**
 * Fetch activity for a lead
 * @param {string} leadId - The lead ID
 */
function fetchLeadActivity(leadId) {
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'loading-indicator';
  loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading activity...';
  document.getElementById('lead-activity').appendChild(loadingIndicator);

  chrome.storage.local.get(['apiKey'], function(result) {
    const apiKey = result.apiKey;
    
    if (!apiKey) {
      showError('lead-activity', 'API key not found. Please reconnect your account.');
      loadingIndicator.remove();
      return;
    }

    fetch(`https://api.persistiq.com/v1/events?lead=${leadId}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Lead activity response:', data);
      loadingIndicator.remove();
      
      const activityContainer = document.getElementById('lead-activity');
      activityContainer.innerHTML = '';
      
      if (data.events && data.events.length > 0) {
        const activityList = document.createElement('ul');
        activityList.className = 'activity-list';
        
        data.events.forEach(event => {
          const activityItem = document.createElement('li');
          activityItem.className = 'activity-item';
          
          const timestamp = formatDateTime(event.event_at);
          const activityType = formatActivityType(event.kind);
          
          let description = '';
          if (event.params) {
            // Create a description based on params, but only show meaningful data
            const meaningfulParams = {};
            
            // Only include non-null and non-object values
            Object.entries(event.params).forEach(([key, value]) => {
              if (value !== null && typeof value !== 'object') {
                meaningfulParams[key] = value;
              }
            });
            
            if (Object.keys(meaningfulParams).length > 0) {
              const paramsList = Object.entries(meaningfulParams)
                .map(([key, value]) => `${formatFieldName(key)}: ${value}`)
                .join(', ');
              description = `<div class="activity-description">${paramsList}</div>`;
            }
          }
          
          // Add campaign info if present
          if (event.campaign) {
            description += `<div class="activity-campaign">Campaign: ${event.campaign.name}</div>`;
          }
          
          activityItem.innerHTML = `
            <div class="activity-time">${timestamp}</div>
            <div class="activity-type">${activityType}</div>
            ${description}
          `;
          
          activityList.appendChild(activityItem);
        });
        
        activityContainer.appendChild(activityList);
      } else {
        activityContainer.innerHTML = '<p>No activity found for this lead.</p>';
      }
    })
    .catch(error => {
      console.error('Error fetching lead activity:', error);
      showError('lead-activity', `Error fetching lead activity: ${error.message}`);
      loadingIndicator.remove();
    });
  });
}

/**
 * Format a date string
 * @param {string} dateString - The date string to format
 * @returns {string} - The formatted date
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

/**
 * Format a date and time string
 * @param {string} dateString - The date string to format
 * @returns {string} - The formatted date and time
 */
function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Format an activity type into a readable string
 * @param {string} type - The activity type
 * @returns {string} - The formatted activity type
 */
function formatActivityType(type) {
  if (!type) return 'Unknown Activity';
  
  // Convert snake_case to Title Case with spaces
  const formatted = type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  return formatted;
}

/**
 * Load lead fields from PersistIQ API and build the form
 */
function loadLeadFields() {
  const container = document.getElementById('lead-fields-container');
  if (!container) return;

  // Show loading message
  container.innerHTML = '<div style="text-align: center; padding: 10px;"><p>Loading fields...</p></div>';

  // Get API key from storage
  chrome.storage.local.get('apiKey', function(result) {
    const apiKey = result.apiKey;
    
    if (!apiKey) {
      container.innerHTML = '<div class="error">API key not found</div>';
      return;
    }

    // Fetch lead fields from API
    fetch('https://api.persistiq.com/v1/lead_fields', {
      headers: {
        'x-api-key': apiKey
      }
    })
    .then(response => response.json())
    .then(data => {
      // Check if data has the expected structure
      if (data && data.lead_fields && Array.isArray(data.lead_fields)) {
        dynamicallyBuildLeadForm(data.lead_fields);
      } else {
        throw new Error('Invalid response format from API');
      }
    })
    .catch(error => {
      container.innerHTML = `<div class="error">Error loading fields: ${error.message}</div>`;
    });
  });
}

function dynamicallyBuildLeadForm(leadFields) {
  const container = document.getElementById('lead-fields-container');
  if (!container) return;

  let html = '';
  
  // Sort fields to put standard fields first
  const standardFields = ['first_name', 'last_name', 'company', 'title', 'phone'];
  leadFields.sort((a, b) => {
    const aIndex = standardFields.indexOf(a.name);
    const bIndex = standardFields.indexOf(b.name);
    
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  // Skip email field as it's already in the form
  leadFields = leadFields.filter(field => field.name !== 'email');
  
  // Add each field to the form
  leadFields.forEach(field => {
    const fieldId = `lead-field-${field.name}`;
    html += `
      <div class="form-group">
        <label for="${fieldId}">${formatFieldName(field.name)}</label>
    `;

    if (field.type === 'select' && field.options) {
      html += `
        <select id="${fieldId}" name="${field.name}" class="form-control">
          <option value="">Select ${formatFieldName(field.name)}</option>
          ${field.options.map(option => `<option value="${option}">${option}</option>`).join('')}
        </select>
      `;
    } else {
      html += `
        <input type="${field.type === 'date' ? 'date' : 'text'}"
               id="${fieldId}"
               name="${field.name}"
               class="form-control"
               ${field.required ? 'required' : ''}
               placeholder="Enter ${formatFieldName(field.name)}">
      `;
    }

    html += '</div>';
  });

  container.innerHTML = html;

  // Restore any previously cached values
  restoreFormFieldsData();
}

function formatFieldName(name) {
  // Convert snake_case to Title Case
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Load campaigns for the Add Lead tab's campaign select dropdown
 * Used in the unified lead form to populate the campaign options
 */
function loadCampaignsForSelect() {
  const campaignSelect = document.getElementById('add-to-campaign-select');
  
  // Show loading state
  if (campaignSelect.options.length <= 1) {
    campaignSelect.innerHTML = '<option value="">Loading campaigns...</option>';
  }
  
  chrome.storage.local.get(['apiKey', 'selectedUser'], function(result) {
    const apiKey = result.apiKey;
    const currentUserId = result.selectedUser;
    
    if (!currentUserId) {
      console.error('No user selected');
      campaignSelect.innerHTML = '<option value="">No user selected</option>';
      return;
    }
    
    // Also load the lead fields when loading campaigns
    loadLeadFields();
    
    fetch('https://api.persistiq.com/v1/campaigns', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Failed to load campaigns');
      }
    })
    .then(data => {
      if (data && data.campaigns && data.campaigns.length > 0) {
        campaignSelect.innerHTML = '<option value="" disabled selected>Select a campaign</option>';
        
        // Get compatible campaigns only (created by current user)
        const compatibleCampaigns = data.campaigns.filter(campaign => 
          campaign.creator && campaign.creator.id === currentUserId
        );
        
        // Check if we have any compatible campaigns
        if (compatibleCampaigns.length > 0) {
          // Add compatible campaigns to the select
          compatibleCampaigns.forEach(campaign => {
            const option = document.createElement('option');
            option.value = campaign.id;
            option.textContent = campaign.name;
            
            // Store creator info as data attributes
            if (campaign.creator) {
              option.dataset.creatorId = campaign.creator.id;
              option.dataset.creatorName = campaign.creator.name;
              option.dataset.creatorEmail = campaign.creator.email;
            }
            
            campaignSelect.appendChild(option);
          });
          
          // Remove any previous explanation note
          const previousNote = document.querySelector('.campaign-compatibility-note');
          if (previousNote) {
            previousNote.remove();
          }
        } else {
          // No compatible campaigns - add a message
          const option = document.createElement('option');
          option.disabled = true;
          option.textContent = 'No compatible campaigns found';
          campaignSelect.appendChild(option);
          
          // Add explanation about campaign compatibility
          const explanation = document.createElement('div');
          explanation.className = 'campaign-compatibility-note';
          explanation.innerHTML = '<small>You can only add leads to campaigns that you created. Please create a campaign in PersistIQ first.</small>';
          campaignSelect.parentElement.appendChild(explanation);
        }
      }
    })
    .catch(error => {
      console.error('Error loading campaigns for select:', error);
    });
  });
}

/**
 * Add a new lead to PersistIQ
 */
function addNewLead() {
  // Get email and campaign ID
  const email = document.getElementById('new-lead-email').value.trim();
  const campaignId = document.getElementById('add-to-campaign-select').value;
  
  // Hide previous messages
  document.getElementById('add-lead-error').style.display = 'none';
  document.getElementById('add-lead-success').style.display = 'none';
  
  // Validate required fields
  if (!email) {
    showError('add-lead-error', 'Email address is required');
    return;
  }
  
  // Get API key and selected mailbox
  chrome.storage.local.get(['apiKey', 'selectedMailbox'], function(result) {
    const apiKey = result.apiKey;
    const mailboxId = result.selectedMailbox;
    
    if (!apiKey) {
      showError('add-lead-error', 'API key not found. Please reconnect your account.');
      return;
    }
    
    if (!mailboxId && campaignId) {
      showError('add-lead-error', 'Mailbox not selected. Please go back to user selection.');
      return;
    }
    
    // Prepare lead data for API format
    const leadObj = {
      email: email
    };
    
    // Get all input fields from the form
    const formContainer = document.getElementById('add-lead-tab');
    const inputFields = formContainer.querySelectorAll('input[type="text"], input[type="email"]');
    
    // Add all field values to the lead object
    inputFields.forEach(input => {
      // Skip the email field as we already have it
      if (input.id !== 'new-lead-email' && input.value.trim()) {
        // Extract the field name from the input ID (remove 'new-lead-' prefix)
        const fieldName = input.name || input.id.replace('new-lead-', '');
        leadObj[fieldName] = input.value.trim();
      }
    });
    
    console.log('Lead data being sent:', leadObj);
    
    // Format data according to API requirements
    const leadData = {
      leads: [leadObj]
    };
    
    // Show loading state
    const submitButton = document.getElementById('submit-new-lead');
    submitButton.textContent = 'Adding Lead...';
    submitButton.disabled = true;
    
    // Update debug section with request data
    const debugRequest = document.getElementById('debug-api-request');
    debugRequest.textContent = JSON.stringify(leadData, null, 2);
    
    // Create the lead using the proper API format
    fetch('https://api.persistiq.com/v1/leads', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(leadData)
    })
    .then(response => {
      console.log('Lead creation response status:', response.status);
      
      // Get the response body
      return response.text().then(text => {
        const debugResponse = document.getElementById('debug-api-response');
        
        // Try to parse as JSON if possible
        if (text) {
          try {
            const responseData = JSON.parse(text);
            debugResponse.textContent = JSON.stringify(responseData, null, 2);
            return { ok: response.ok, status: response.status, data: responseData, text };
          } catch (e) {
            // Not JSON, show as text
            debugResponse.textContent = text;
            return { ok: response.ok, status: response.status, text };
          }
        } else {
          debugResponse.textContent = "Empty response";
          return { ok: response.ok, status: response.status };
        }
      });
    })
    .then(result => {
      if (!result.ok) {
        let errorMsg = 'Failed to create lead';
        if (result.data && result.data.error) {
          errorMsg += ': ' + result.data.error;
        } else if (result.text) {
          errorMsg += ': ' + result.text;
        }
        throw new Error(errorMsg);
      }
      
      // Check for proper response format
      if (result.data && result.data.leads && result.data.leads.length > 0) {
        const lead = result.data.leads[0];
        console.log('Lead created successfully:', lead);
        
        showSuccess('add-lead-success', 'Lead created successfully!');
        
        // Show the campaign selection section
        showCampaignSelectionForLead(lead);
        
        // Hide the main form fields to focus on campaign selection
        const formGroups = document.querySelectorAll('#add-lead-tab .form-group');
        formGroups.forEach(group => {
          if (!group.contains(document.getElementById('add-to-campaign-select'))) {
            group.style.display = 'none';
          }
        });
        
        // Hide the submit button
        document.getElementById('submit-new-lead').style.display = 'none';
      } else {
        console.error('Unexpected API response format:', result);
        throw new Error('Unexpected response format: ' + JSON.stringify(result.data));
      }
    })
    .catch(error => {
      console.error('Error creating lead:', error);
      showError('add-lead-error', 'Error creating lead: ' + error.message);
    })
    .finally(() => {
      // Reset button
      submitButton.textContent = 'Add Lead';
      submitButton.disabled = false;
    });
  });
}

/**
 * Set up the campaign selection for a lead
 * @param {Object} lead - The lead object
 */
function setupCampaignSelection(lead) {
  // Update the lead info text
  document.getElementById('created-lead-info').textContent = 
    `Lead "${lead.email}" created successfully! You can now add this lead to a campaign (optional).`;
  
  // Store the lead ID for the add to campaign button
  document.getElementById('add-to-campaign-button').setAttribute('data-lead-id', lead.id);
  
  // Load campaigns for the dropdown
  loadCampaignsForStep3();
}

/**
 * Load campaigns for step 3
 */
function loadCampaignsForStep3() {
  const campaignSelect = document.getElementById('add-to-campaign-select');
  campaignSelect.innerHTML = '<option value="" disabled selected>Loading campaigns...</option>';
  
  chrome.storage.local.get(['apiKey', 'selectedUser', 'selectedMailbox'], function(result) {
    const apiKey = result.apiKey;
    const currentUserId = result.selectedUser;
    
    if (!currentUserId) {
      console.error('No user selected');
      campaignSelect.innerHTML = '<option value="" disabled selected>Error: No user selected</option>';
      return;
    }
    
    fetch('https://api.persistiq.com/v1/campaigns', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Failed to load campaigns');
      }
    })
    .then(data => {
      if (data && data.campaigns && data.campaigns.length > 0) {
        campaignSelect.innerHTML = '<option value="" disabled selected>Select a campaign</option>';
        
        // Get compatible campaigns only (created by current user)
        const compatibleCampaigns = data.campaigns.filter(campaign => 
          campaign.creator && campaign.creator.id === currentUserId
        );
        
        // Check if we have any compatible campaigns
        if (compatibleCampaigns.length > 0) {
          // Add compatible campaigns to the select
          compatibleCampaigns.forEach(campaign => {
            const option = document.createElement('option');
            option.value = campaign.id;
            option.textContent = campaign.name;
            
            // Store creator info as data attributes
            if (campaign.creator) {
              option.dataset.creatorId = campaign.creator.id;
              option.dataset.creatorName = campaign.creator.name;
              option.dataset.creatorEmail = campaign.creator.email;
            }
            
            campaignSelect.appendChild(option);
          });
          
          // Remove any previous explanation note
          const previousNote = document.querySelector('.campaign-compatibility-note');
          if (previousNote) {
            previousNote.remove();
          }
        } else {
          // No compatible campaigns - add a message
          const option = document.createElement('option');
          option.disabled = true;
          option.textContent = 'No compatible campaigns found';
          campaignSelect.appendChild(option);
          
          // Add explanation about campaign compatibility
          const explanation = document.createElement('div');
          explanation.className = 'campaign-compatibility-note';
          explanation.innerHTML = '<small>You can only add leads to campaigns that you created. Please create a campaign in PersistIQ first.</small>';
          campaignSelect.parentElement.appendChild(explanation);
        }
      } else {
        campaignSelect.innerHTML = '<option value="" disabled selected>No campaigns found</option>';
      }
    })
    .catch(error => {
      console.error('Error loading campaigns for select:', error);
      campaignSelect.innerHTML = '<option value="" disabled selected>Error loading campaigns</option>';
    });
  });
}

/**
 * Create a new lead with all information in one step
 */
async function createUnifiedLead() {
  try {
    const storage = await new Promise((resolve) => {
      chrome.storage.local.get(['apiKey'], resolve);
    });

    const { apiKey } = storage;

    if (!apiKey) {
      showError('create-lead-error', 'API key not found. Please reconnect.');
      return;
    }

    const emailInput = document.getElementById('new-lead-email');
    const email = emailInput?.value;
    const campaignSelect = document.getElementById('add-to-campaign-select');
    const campaignId = campaignSelect?.value;

    // Hide any previous error messages
    const errorElements = document.querySelectorAll('.error, .success');
    errorElements.forEach(element => {
      element.style.display = 'none';
    });

    if (!email) {
      showError('create-lead-error', 'Email is required');
      return;
    }

    // Get all form fields
    const formData = {
      email: email
    };

    // Add other form fields if they exist
    const formFields = document.querySelectorAll('#lead-fields-container input, #lead-fields-container select');
    formFields.forEach(field => {
      if (field.value) {
        formData[field.id.replace('lead-field-', '')] = field.value;
      }
    });

    console.log('Sending form data:', formData);

    // Create the lead
    const response = await fetch('https://api.persistiq.com/v1/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        leads: [formData]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create lead');
    }

    if (data.leads && data.leads.length > 0) {
      const lead = data.leads[0];
      console.log('Lead created successfully:', lead);

      // Hide the form section
      document.getElementById('lead-form-section').style.display = 'none';

      if (campaignId) {
        // Show calendar section and update its information
        const calendarSection = document.getElementById('calendar-section');
        document.getElementById('scheduled-lead-email').textContent = email;
        document.getElementById('scheduled-campaign-name').textContent = `${campaignSelect.options[campaignSelect.selectedIndex].text} (ID: ${campaignId})`;
        document.getElementById('scheduled-lead-id').textContent = lead.id;
        
        // Initialize the date picker
        const dateInput = document.getElementById('schedule-date');
        const today = new Date().toISOString().split('T')[0];
        dateInput.min = today;
        dateInput.value = today;

        // Show the calendar section
        calendarSection.style.display = 'block';

        // Initialize Flatpickr
        if (typeof flatpickr === 'function') {
          flatpickr(dateInput, {
            minDate: "today",
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "F j, Y",
            appendTo: calendarSection
          });
        }

        // Add event listener for Schedule Campaign button
        const scheduleBtn = document.getElementById('schedule-btn');
        if (scheduleBtn) {
          scheduleBtn.onclick = async () => {
            const startDate = dateInput?.value;
            if (!startDate) {
              showError('schedule-error', 'Please select a start date');
              return;
            }

            try {
              // Formatear la fecha para el endpoint
              const formattedDate = `${startDate} 14:30:00`;
              const scheduleData = {
                lead_id: lead.id,
                campaign_id: campaignId,
                start_date: formattedDate
              };

              // Enviar datos al endpoint
              const response = await fetch('https://website-4c67a44a.fvq.uim.temporary.site/api/schedule.php', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(scheduleData)
              });

              if (response.ok) {
                showSuccess('schedule-success', 'Campaign scheduled successfully!');
                scheduleBtn.disabled = true;
                scheduleBtn.textContent = 'Campaign Scheduled';
              } else {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to schedule campaign');
              }
            } catch (error) {
              showError('schedule-error', error.message);
            }
          };
        }
      }

      // Add event listener for Add Another Lead button
      const addAnotherBtn = document.getElementById('add-another-lead');
      if (addAnotherBtn) {
        addAnotherBtn.onclick = () => {
          // Reset the form
          resetLeadForm();
          // Hide calendar section and show form section
          document.getElementById('calendar-section').style.display = 'none';
          document.getElementById('lead-form-section').style.display = 'block';
          // Clear the form fields
          document.getElementById('new-lead-email').value = '';
          document.getElementById('add-to-campaign-select').value = '';
          // Reset any error or success messages
          document.querySelectorAll('.error, .success').forEach(el => el.style.display = 'none');
        };
      }
    } else {
      throw new Error('Unexpected response format');
    }
  } catch (error) {
    console.error('Error creating lead:', error);
    showError('create-lead-error', 'Error creating lead: ' + error.message);
  }
}

// Modify resetLeadForm function to handle the new layout
function resetLeadForm() {
  // Reset email
  document.getElementById('new-lead-email').value = '';
  
  // Clear stored email
  chrome.storage.local.remove('leadEmail');
  
  // Clear stored form fields data and step
  chrome.storage.local.remove(['formFields', 'leadFormStep'], function() {
    console.log('Form fields data and step cleared');
  });
  
  // Reset error and success messages
  document.querySelectorAll('.error, .success').forEach(el => el.style.display = 'none');
  
  // Show form section and hide calendar section
  document.getElementById('lead-form-section').style.display = 'block';
  document.getElementById('calendar-section').style.display = 'none';
  
  // Ensure form is visible
  document.getElementById('unified-lead-form').style.display = 'block';
  
  // Reset campaign select
  const campaignSelect = document.getElementById('add-to-campaign-select');
  if (campaignSelect) {
    campaignSelect.value = '';
  }
  
  // Reload lead fields
  loadLeadFields();
}

/**
 * Show the campaign selection section for a lead
 * @param {Object} lead - The lead object
 */
function showCampaignSelectionForLead(lead) {
  // Get the campaign selection section
  const campaignSection = document.getElementById('campaign-selection-section');
  
  // Set the lead info
  const leadInfo = document.getElementById('created-lead-info');
  leadInfo.textContent = `Lead created: ${lead.email} (ID: ${lead.id})`;
  
  // Store the lead ID on the button for later use
  const addToCampaignButton = document.getElementById('add-to-campaign-button');
  addToCampaignButton.setAttribute('data-lead-id', lead.id);
  
  // Reset any previous messages
  document.getElementById('add-to-campaign-error').style.display = 'none';
  document.getElementById('add-to-campaign-success').style.display = 'none';
  
  // Show the section
  campaignSection.style.display = 'block';
  
  // Load campaigns if they haven't been loaded yet
  if (document.getElementById('add-to-campaign-select').options.length <= 1) {
    loadCampaignsForSelect();
  }
}

/**
 * Second step of adding a lead to a campaign
 * @param {string} campaignId - The campaign ID
 * @param {string} leadId - The lead ID
 */
function addLeadToCampaignStep2(campaignId, leadId) {
  // Get the mailbox ID
  chrome.storage.local.get('selectedMailbox', function(result) {
    const mailboxId = result.selectedMailbox;
    
    if (!mailboxId) {
      showError('add-to-campaign-error', 'Mailbox not selected. Please go back to user selection.');
      return;
    }
    
    // Update button state
    const button = document.getElementById('add-to-campaign-button');
    button.textContent = 'Adding to Campaign...';
    button.disabled = true;
    
    // Call the existing function to add the lead to the campaign
    addLeadToCampaign(campaignId, leadId, mailboxId);
  });
}

/**
 * Set up field caching for all input fields
 * This function adds event listeners to persistently save form field values
 */
function setupFieldCaching() {
  // Define fields to cache with their storage keys
  const fieldsToCache = [
    { id: 'user-email', key: 'userEmail' },
    { id: 'api-key', key: 'apiKey' },
    { id: 'lead-email-search', key: 'leadEmailSearch' },
    { id: 'campaign-search', key: 'campaignSearch' },
    { id: 'new-lead-email', key: 'leadEmail' }
  ];
  
  // Set up listeners for each field
  fieldsToCache.forEach(field => {
    const element = document.getElementById(field.id);
    if (element) {
      // Add input event listener to save as user types
      element.addEventListener('input', function() {
        const value = this.value.trim();
        if (value) {
          // Save to Chrome storage
          const data = {};
          data[field.key] = value;
          chrome.storage.local.set(data);
        }
      });
      
      // Also save on blur (when field loses focus)
      element.addEventListener('blur', function() {
        const value = this.value.trim();
        if (value) {
          const data = {};
          data[field.key] = value;
          chrome.storage.local.set(data);
        }
      });
      
      // Restore value from storage if element is empty
      if (!element.value) {
        chrome.storage.local.get(field.key, function(result) {
          if (result[field.key]) {
            element.value = result[field.key];
          }
        });
      }
    }
  });
  
  // Save custom form fields dynamically added during lead creation
  document.addEventListener('change', function(e) {
    // Check if the changed element is within lead form fields container
    const leadFieldsContainer = document.getElementById('lead-fields-container');
    if (leadFieldsContainer && leadFieldsContainer.contains(e.target) && e.target.name) {
      // Save form fields data
      saveFormFieldsData();
    }
  });
  
  // Also listen for input events for real-time saving
  document.addEventListener('input', function(e) {
    // Check if the changed element is within lead form fields container
    const leadFieldsContainer = document.getElementById('lead-fields-container');
    if (leadFieldsContainer && leadFieldsContainer.contains(e.target) && e.target.name) {
      // Save form fields data with a short delay to avoid too many writes
      if (window.saveFormDebounceTimer) {
        clearTimeout(window.saveFormDebounceTimer);
      }
      window.saveFormDebounceTimer = setTimeout(saveFormFieldsData, 300);
    }
  });
}

/**
 * Save all form fields data to storage
 */
function saveFormFieldsData() {
  // Get the lead fields container
  const container = document.getElementById('lead-fields-container');
  if (!container) return;
  
  // Create an object to store form fields data
  const formData = {};
  
  // Get all input elements
  const inputs = container.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    if (input.name) {
      if (input.type === 'checkbox') {
        formData[input.name] = input.checked;
      } else {
        formData[input.name] = input.value;
      }
    }
  });
  
  // Check which step is currently visible
  let currentStep = 1;
  const step2Element = document.getElementById('lead-step-2');
  const step3Element = document.getElementById('lead-step-3');
  
  if (step2Element && step2Element.style.display === 'block') {
    currentStep = 2;
  } else if (step3Element && step3Element.style.display === 'block') {
    currentStep = 3;
  }
  
  // Save to storage with the current step
  chrome.storage.local.set({ 
    formFields: formData,
    leadFormStep: currentStep 
  });
  console.log('Form fields data saved:', formData, 'Current step:', currentStep);
}

/**
 * Restore form fields data from storage
 */
function restoreFormFieldsData() {
  // Get the lead fields container
  const container = document.getElementById('lead-fields-container');
  if (!container) return;
  
  // Get form fields data and current step from storage
  chrome.storage.local.get(['formFields', 'leadFormStep'], function(result) {
    const formData = result.formFields;
    const currentStep = result.leadFormStep || 1;
    
    if (!formData) return;
    
    // Apply values to form fields
    Object.keys(formData).forEach(fieldName => {
      const input = container.querySelector(`[name="${fieldName}"]`);
      if (input) {
        if (input.type === 'checkbox') {
          input.checked = formData[fieldName];
        } else {
          input.value = formData[fieldName];
        }
      }
    });
    
    console.log('Form fields data restored:', formData);
    
    // If in step 2 or 3, make sure to transition correctly
    if (currentStep === 2) {
      // Move to step 2 only after a short delay to make sure the form is fully built
      setTimeout(() => {
        document.getElementById('lead-step-1').style.display = 'none';
        document.getElementById('lead-step-2').style.display = 'block';
      }, 100);
    } else if (currentStep === 3) {
      // Lead is already created but campaign selection is still in progress
      document.getElementById('lead-step-1').style.display = 'none';
      document.getElementById('lead-step-2').style.display = 'none';
      document.getElementById('lead-step-3').style.display = 'block';
    }
  });
}

/**
 * Format a date string
 * @param {string} dateString - The date string to format
 * @returns {string} - The formatted date
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

/**
 * Format a date and time string
 * @param {string} dateString - The date string to format
 * @returns {string} - The formatted date and time
 */
function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format an activity type into a readable string
 * @param {string} type - The activity type
 * @returns {string} - The formatted activity type
 */
function formatActivityType(type) {
  if (!type) return 'Unknown Activity';
  
  // Convert snake_case to Title Case with spaces
  const formatted = type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  return formatted;
}

/**
 * Handle unsubscribing a lead
 * @param {string} leadId - The lead ID
 */
function toggleSubscribe(leadId) {
  chrome.storage.local.get('apiKey', function(result) {
    const apiKey = result.apiKey;
    
    if (!apiKey) {
      showError('subscribe-error', 'API key not found. Please reconnect your account.');
      return;
    }
    
    const button = document.getElementById('toggle-subscribe-btn');
    if (button) {
      button.disabled = true;
      button.textContent = 'Unsubscribing...';
    }
    
    // Update the lead's optedout status using PUT method
    fetch(`https://api.persistiq.com/v1/leads/${leadId}`, {
      method: 'PUT',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: {
          optedout: true,
          opted_out: true
        }
      })
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Failed to update subscription status');
      }
    })
    .then(data => {
      if (button) {
        // Hide the button after successful unsubscribe
        button.style.display = 'none';
        
        // Show the opted out message
        const optOutMessage = document.createElement('div');
        optOutMessage.style.cssText = 'color: #ef4444; font-weight: bold; margin-top: 10px;';
        optOutMessage.textContent = 'This lead has opted out and cannot be resubscribed.';
        button.parentNode.appendChild(optOutMessage);
      }
      
      showSuccess('subscribe-success', 'Successfully unsubscribed from communications');
      
      // Update the cached lead data
      if (cachedLeadData[leadId]) {
        cachedLeadData[leadId].lead.data.optedout = true;
        cachedLeadData[leadId].lead.data.opted_out = true;
      }
      
      // Refresh the lead details display
      if (currentLead) {
        currentLead.data.optedout = true;
        currentLead.data.opted_out = true;
        displayLeadDetails(currentLead);
      }
    })
    .catch(error => {
      console.error('Error updating subscription status:', error);
      showError('subscribe-error', 'Failed to update subscription status: ' + error.message);
      
      if (button) {
        button.disabled = false;
        button.textContent = 'Unsubscribe';
      }
    });
  });
}

// Add event listener for the subscribe button
document.addEventListener('DOMContentLoaded', function() {
  const toggleSubscribeBtn = document.getElementById('toggle-subscribe-btn');
  if (toggleSubscribeBtn) {
    toggleSubscribeBtn.addEventListener('click', function() {
      const leadId = document.getElementById('lead-id-search').value;
      if (leadId && currentLead && !currentLead.data.optedout) {
        toggleSubscribe(leadId);
      }
    });
  }
});

function createDatePicker(inputElement) {
  const datePicker = document.createElement('input');
  datePicker.type = 'date';
  datePicker.className = 'date-picker';
  datePicker.style.width = '100%';
  datePicker.style.padding = '8px';
  datePicker.style.border = '1px solid #ccc';
  datePicker.style.borderRadius = '4px';
  datePicker.style.marginTop = '8px';
  
  // Set min date to today
  const today = new Date();
  datePicker.min = today.toISOString().split('T')[0];
  
  // Replace the input element with the date picker
  inputElement.parentNode.replaceChild(datePicker, inputElement);
  
  return datePicker;
}

// Initialize the test calendar when the tab is shown
document.querySelector('.tab[data-tab="add-lead-tab"]').addEventListener('click', function() {
  const testCalendar = document.getElementById('test-calendar');
  if (testCalendar) {
    const today = new Date().toISOString().split('T')[0];
    testCalendar.min = today;
    testCalendar.value = today;
  }
});

// Función para crear un nuevo schedule
async function createSchedule(leadId, campaignId, startDate) {
    try {
        const scheduleData = {
            lead_id: leadId,
            campaign_id: campaignId,
            start_date: startDate
        };

        console.log('Sending schedule data:', scheduleData);

        const response = await fetch('https://website-4c67a44a.fvq.uim.temporary.site/api/schedule.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(scheduleData)
        });

        console.log('Schedule API response status:', response.status);
        
        // Intentar obtener el texto de la respuesta primero
        const responseText = await response.text();
        console.log('Raw response:', responseText);
        
        let data;
        try {
            data = JSON.parse(responseText);
            console.log('Parsed response data:', data);
        } catch (e) {
            console.error('Error parsing response:', e);
            throw new Error('Invalid response from schedule API');
        }

        if (!response.ok) {
            const errorMessage = data.message || data.error || 'Failed to create schedule';
            throw new Error(errorMessage);
        }
        
        if (data.error) {
            throw new Error(data.message || 'Unknown error from schedule API');
        }
        
        return data;
    } catch (error) {
        console.error('Error in createSchedule:', error);
        throw new Error(`Failed to create schedule: ${error.message}`);
    }
}
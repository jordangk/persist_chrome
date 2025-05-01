document.addEventListener('DOMContentLoaded', function() {
  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const leadEmail = urlParams.get('leadEmail');
  const campaignName = urlParams.get('campaignName');
  const leadId = urlParams.get('leadId');
  const campaignId = urlParams.get('campaignId');

  // Display lead and campaign info
  document.getElementById('lead-email').textContent = leadEmail;
  document.getElementById('campaign-name').textContent = campaignName;

  // Set minimum date to today
  const dateInput = document.getElementById('schedule-date');
  const today = new Date().toISOString().split('T')[0];
  dateInput.min = today;
  dateInput.value = today;

  // Schedule button click handler
  document.getElementById('schedule-btn').addEventListener('click', async function() {
    const selectedDate = dateInput.value;
    if (!selectedDate) {
      showError('Please select a date');
      return;
    }

    try {
      // Get API key from storage
      const { apiKey } = await chrome.storage.local.get('apiKey');
      if (!apiKey) {
        showError('API key not found');
        return;
      }

      // Schedule the campaign
      const response = await fetch(`https://api.persistiq.com/v1/campaigns/${campaignId}/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          lead_id: leadId,
          start_date: selectedDate
        })
      });

      if (response.ok) {
        showSuccess('Campaign scheduled successfully!');
        // Disable the schedule button after successful scheduling
        this.disabled = true;
        this.textContent = 'Campaign Scheduled';
      } else {
        throw new Error('Failed to schedule campaign');
      }
    } catch (error) {
      showError(error.message);
    }
  });

  // Cancel button click handler
  document.getElementById('cancel-btn').addEventListener('click', function() {
    window.close();
  });

  function showError(message) {
    const errorElement = document.getElementById('schedule-error');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    document.getElementById('schedule-success').style.display = 'none';
  }

  function showSuccess(message) {
    const successElement = document.getElementById('schedule-success');
    successElement.textContent = message;
    successElement.style.display = 'block';
    document.getElementById('schedule-error').style.display = 'none';
  }
}); 
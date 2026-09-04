const scriptStr = `
  // Enhanced donor contact functionality without confirm to avoid browser suppression issues
  function contactDonor(requestId, donorUserId) {
    console.log('Navigating to contact donor. Request ID:', requestId, 'Donor User ID:', donorUserId);
    window.location.href = \`/contact-donor/\${requestId}/\${donorUserId}\`;
  }

  // Test function to verify JavaScript execution
  function testDelete() {
    alert('Delete function is working!');
  }

  function showDonors(requestId) {
    console.log('Button clicked for request ID:', requestId);
    const modal = document.getElementById('donor-modal-' + requestId);
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      modal.style.zIndex = '9999';
      document.body.style.overflow = 'hidden';
      console.log('Modal shown for request ID:', requestId);
    } else {
      console.error('Error: Modal element with ID donor-modal-' + requestId + ' was not found in the HTML.');
    }
  }

  function closeDonorModal(requestId) {
    const modal = document.getElementById('donor-modal-' + requestId);
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  function markFulfilled(requestId) {
    // Open the schedule modal instead of browser confirm
    console.log('Fulfill button clicked for request ID:', requestId);
    const modal = document.getElementById('schedule-modal-' + requestId);
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      modal.style.zIndex = '9999';
      document.body.style.overflow = 'hidden';
    } else {
      console.error('Error: Modal element with ID schedule-modal-' + requestId + ' was not found in the HTML.');
    }
  }

  function closeScheduleModal(requestId) {
    const modal = document.getElementById('schedule-modal-' + requestId);
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  function submitSchedule(event, requestId) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    
    // Construct payload
    const payload = {
      donorId: formData.get('donorId') || null,
      unitsProvided: formData.get('unitsProvided'),
      scheduledDate: formData.get('scheduledDate') || null,
      notes: formData.get('notes') || ''
    };

    fetch(\`/admin/fulfill-request/\${requestId}\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert(data.message || 'Request updated successfully!');
          location.reload();
        } else {
          alert('Error: ' + data.message);
        }
      })
      .catch(error => {
        alert('Error processing request');
        console.error(error);
      });
  }
`;
console.log("Syntax is valid");

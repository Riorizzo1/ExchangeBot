(() => {
  const button = document.querySelector('#enable-alerts');
  if (!button) return;
  const settingsButton = document.querySelector('#notification-settings-button');
  const settingsDialog = document.querySelector('#notification-settings');
  const settingsClose = document.querySelector('#notification-settings-close');
  const dailyToggle = document.querySelector('#notify-daily-delta');
  const cheapToggle = document.querySelector('#notify-under-400');
  const testButton = document.querySelector('#notification-test');
  const settingsStatus = document.querySelector('#notification-settings-status');
  const statusText = document.querySelector('#alert-status');
  const setStatus = (message, error = false) => {
    if (!statusText) return;
    statusText.textContent = message;
    statusText.classList.toggle('error', error);
  };
  const setSettingsStatus = (message, error = false) => {
    if (!settingsStatus) return;
    settingsStatus.textContent = message;
    settingsStatus.classList.toggle('error', error);
  };
  const withTimeout = (promise, label, ms = 10000) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);

  const api = path => withTimeout(fetch(path, {cache: 'no-store'}), 'Daily Delta server').then(response => {
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json();
  });
  const base64 = value => {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const raw = atob(padded);
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  };

  async function status() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      button.textContent = 'Alerts unavailable'; button.disabled = true; return;
    }
    try {
      const info = await api('/api/push/watch/status');
      if (dailyToggle) dailyToggle.checked = info.preferences?.daily_delta !== false;
      if (cheapToggle) cheapToggle.checked = info.preferences?.under_400 !== false;
      const registration = await navigator.serviceWorker.register('./sw.js?v=7', {scope: './', updateViaCache: 'none'});
      await withTimeout(navigator.serviceWorker.ready, 'Service worker');
      let subscription = await withTimeout(registration.pushManager.getSubscription(), 'Push subscription');
      // If iOS retained permission but discarded the endpoint, silently
      // recreate it on app startup. The visible button remains a fallback for
      // browsers that require a user gesture for subscribe().
      if (!subscription && Notification.permission === 'granted' && info.public_key) {
        try {
          subscription = await withTimeout(registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: base64(info.public_key)}), 'Push subscription');
          await withTimeout(fetch('/api/push/watch/subscribe', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(subscription)}), 'Subscription sync');
        } catch (_) { subscription = null; }
      }
      if (subscription && Notification.permission === 'granted') {
        // Refresh the server-side record on every app visit. This is an
        // idempotent upsert and also repairs endpoint rotations after iOS
        // renews an installed PWA subscription.
        await withTimeout(fetch('/api/push/watch/subscribe', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(subscription)}), 'Subscription sync');
        button.textContent = info.subscription_count ? 'Daily Delta alerts enabled · tap to resync' : 'Sync Daily Delta alerts';
        button.disabled = false;
        setStatus(info.subscription_count ? 'Ready' : 'Device subscription needs syncing');
      } else if (info.configured) {
        button.textContent = 'Enable Daily Delta alerts';
        button.disabled = false;
        setStatus(Notification.permission === 'denied' ? 'Notifications are blocked in iPhone Settings' : 'Tap to enable alerts');
      } else {
        button.textContent = 'Alerts unavailable'; button.disabled = true;
        setStatus('Push is not configured on the server', true);
      }
    } catch (error) {
      button.textContent = 'Enable Daily Delta alerts';
      button.disabled = false;
      button.title = error.message;
      setStatus(error.message, true);
    }
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Enabling…';
    setStatus('Connecting to Daily Delta…');
    try {
      const info = await api('/api/push/watch/status');
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Notifications were not allowed.');
      }
      const registration = await navigator.serviceWorker.register('./sw.js?v=7', {scope: './', updateViaCache: 'none'});
      await withTimeout(navigator.serviceWorker.ready, 'Service worker');
      // A previously installed Daily Delta worker can retain an endpoint that
      // the server still accepts even though this Home Screen app is no longer
      // the active installation.  A deliberate tap on this control is the
      // resync action, so rotate the device subscription before saving it.
      let subscription = await withTimeout(registration.pushManager.getSubscription(), 'Push subscription');
      if (subscription) {
        try { await subscription.unsubscribe(); } catch (_) { /* recreate below */ }
        subscription = null;
      }
      subscription = await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: base64(info.public_key)});
      await withTimeout(fetch('/api/push/watch/subscribe', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(subscription)}), 'Subscription save').then(response => { if (!response.ok) throw new Error(`Subscription failed (${response.status})`); return response.json(); });
      button.textContent = 'Daily Delta alerts enabled · tap to resync';
      button.disabled = false;
      setStatus('Enabled and synced.');
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Enable Daily Delta alerts';
      button.title = error.message;
      setStatus(error.message, true);
    }
  });

  settingsButton?.addEventListener('click', async () => {
    if (!settingsDialog) return;
    settingsDialog.showModal();
    try { const info = await api('/api/push/watch/status'); if (dailyToggle) dailyToggle.checked = info.preferences?.daily_delta !== false; if (cheapToggle) cheapToggle.checked = info.preferences?.under_400 !== false; setSettingsStatus('Preferences loaded.'); }
    catch (error) { setSettingsStatus(error.message, true); }
  });
  settingsClose?.addEventListener('click', () => settingsDialog?.close());
  async function savePreferences() {
    try {
      const response = await withTimeout(fetch('/api/push/watch/preferences', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({daily_delta:dailyToggle?.checked, under_400:cheapToggle?.checked})}), 'Preference save');
      if (!response.ok) throw new Error(`Preference save failed (${response.status})`);
      const info = await response.json();
      if (dailyToggle) dailyToggle.checked = info.preferences?.daily_delta !== false;
      if (cheapToggle) cheapToggle.checked = info.preferences?.under_400 !== false;
      setSettingsStatus('Preferences saved.');
    } catch (error) { setSettingsStatus(error.message, true); }
  }
  dailyToggle?.addEventListener('change', savePreferences);
  cheapToggle?.addEventListener('change', savePreferences);
  testButton?.addEventListener('click', async () => {
    testButton.disabled = true;
    setSettingsStatus('Sending test…');
    try {
      const response = await withTimeout(fetch('/api/push/watch/send', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title:'Daily Delta test',body:'Your Daily Delta notification channel is working.',tag:'watch-settings-test',url:`${location.origin}/daily/`})}), 'Test notification');
      if (!response.ok) throw new Error(`Test failed (${response.status})`);
      setSettingsStatus('Test sent. Check your notifications.');
    } catch (error) { setSettingsStatus(error.message, true); }
    finally { testButton.disabled = false; }
  });

  status();
})();

let API_BASE = '';
let API_SECRET = '';

let currentUser = null;
let authToken = localStorage.getItem('authToken');
let vms = [];
let currentPage = 'emojis';

document.addEventListener('DOMContentLoaded', () => {
  if (window.PANEL_CONFIG && window.PANEL_CONFIG.apiUrl) {
    const apiUrl = window.PANEL_CONFIG.apiUrl;
    API_BASE = apiUrl.endsWith('/api') ? apiUrl : `${apiUrl}/api`;
    API_SECRET = window.PANEL_CONFIG.apiSecret || '';
    console.log('API Base URL:', API_BASE);
  } else {
    console.error('PANEL_CONFIG or apiUrl not found!', window.PANEL_CONFIG);
    alert('Configuration error: API URL not set. Please check your config.json file.');
    return;
  }

  window.addEventListener('hashchange', handleRoute);

  const rulesAccepted = localStorage.getItem('rulesAccepted') === 'true';

  if (authToken) {
    checkAuth().then(() => {
      loadVMs();
      if (!rulesAccepted) {
        showRulesModal();
      } else {
        handleRoute();
      }
    });
  } else {
    showLogin();
  }

  setupEventListeners();

  const rulesCheckbox = document.getElementById('rules-accepted');
  const acceptBtn = document.getElementById('rules-accept-btn');
  if (rulesCheckbox && acceptBtn) {
    rulesCheckbox.addEventListener('change', function() {
      acceptBtn.disabled = !this.checked;
    });
  }
});

function handleRoute() {
  if (!currentUser) return;

  const hash = window.location.hash.slice(1) || 'emojis';
  currentPage = hash;

  document.querySelectorAll('.page-section').forEach(section => {
    section.classList.remove('active');
    section.style.display = 'none';
  });

  const pageElement = document.getElementById(`${hash}-page`);
  if (pageElement) {
    pageElement.classList.add('active');
    pageElement.style.display = 'block';
  } else {
    console.error(`Page element not found: ${hash}-page`);
  }

  document.querySelectorAll('#nav-pages .nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${hash}`) {
      link.classList.add('active');
    }
  });

  switch(hash) {
    case 'emojis':
      loadEmojis();
      break;
    case 'gifs':
      loadGIFs();
      break;
    case 'vms':
      loadVMs();
      break;
    case 'users':
      if (currentUser.is_admin) loadUsers();
      break;
    case 'commands':
      if (currentUser.is_admin || currentUser.is_moderator) loadCommands();
      break;
    case 'reports':
      if (currentUser.is_admin || currentUser.is_moderator) loadReports();
      break;
    case 'extensions':
      if (currentUser.is_admin || currentUser.is_moderator) loadExtensions();
      break;
    case 'settings':
      if (currentUser.is_admin) loadSettings();
      break;
    case 'administration':
      if (currentUser.is_admin) {
        loadBlockedDomains();
        loadEmojiRequests();
      }
      break;
  }
}

function navigate(page) {
  window.location.hash = page;
}

function apiRequest(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-secret': API_SECRET,
    ...(options.headers || {})
  };

  if (authToken && !options.skipAuth) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  return fetch(url, {
    ...options,
    headers
  });
}

async function loadVMs() {
  try {
    const response = await apiRequest(`${API_BASE}/vms`);
    if (response.ok) {
      const data = await response.json();
      vms = data.vms;
      renderVMSTable(data.vms);
    }
  } catch (error) {
    console.error('Failed to load VMs:', error);
  }
}

function renderVMSTable(vmsList) {
  const tbody = document.getElementById('vms-table-body');
  if (vmsList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">No VMs configured yet.</td></tr>';
    return;
  }

  tbody.innerHTML = vmsList.map(vm => `
    <tr>
      <td>${vm.id}</td>
      <td>${vm.display_name}</td>
      <td><code>${vm.node_id}</code></td>
      <td><code>${vm.websocket_uri}</code></td>
      <td>${vm.bot_name || 'Default'}</td>
      <td>
        ${(currentUser.is_admin || currentUser.is_moderator) ? `
          <button class="btn btn-sm btn-primary" onclick="showEditVMModal(${vm.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteVM(${vm.id})">Delete</button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

function setupEventListeners() {
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('register-form')?.addEventListener('submit', handleRegister);
  document.getElementById('settings-form')?.addEventListener('submit', handleSettingsSubmit);
}

function showRulesModal() {
  const modal = new bootstrap.Modal(document.getElementById('rulesModal'), {
    backdrop: 'static',
    keyboard: false
  });
  modal.show();
}

function acceptRules() {
  localStorage.setItem('rulesAccepted', 'true');
  const modal = bootstrap.Modal.getInstance(document.getElementById('rulesModal'));
  modal.hide();
  handleRoute();
}

async function checkAuth() {
  try {
    const response = await apiRequest(`${API_BASE}/me`);
    if (response.ok) {
      const data = await response.json();
      currentUser = data.user;
      showDashboard();
    } else {
      localStorage.removeItem('authToken');
      authToken = null;
      showLogin();
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    showLogin();
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');
  errorDiv.style.display = 'none';

  try {
    const response = await apiRequest(`${API_BASE}/login`, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      skipAuth: true
    });
    const data = await response.json();

    if (response.ok) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('authToken', authToken);
      showDashboard();
    } else {
      errorDiv.textContent = data.error || 'Login failed';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const errorDiv = document.getElementById('register-error');
  const successDiv = document.getElementById('register-success');
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';

  try {
    const response = await apiRequest(`${API_BASE}/register`, {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
      skipAuth: true
    });
    const data = await response.json();

    if (response.ok) {
      successDiv.style.display = 'block';
      document.getElementById('register-form').reset();
      setTimeout(() => showLogin(), 2000);
    } else {
      errorDiv.textContent = data.error || 'Registration failed';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

function showLogin() {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.getElementById('login-section').classList.add('active');
  document.getElementById('nav-login').style.display = 'block';
  document.getElementById('nav-register').style.display = 'block';
  document.getElementById('nav-user').style.display = 'none';
  document.getElementById('nav-pages').style.display = 'none';
}

function showRegister() {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.getElementById('register-section').classList.add('active');
}

async function showDashboard() {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.getElementById('nav-login').style.display = 'none';
  document.getElementById('nav-register').style.display = 'none';
  document.getElementById('nav-user').style.display = 'block';
  document.getElementById('nav-pages').style.display = 'flex';
  document.getElementById('user-name').textContent = currentUser.username;

  if (currentUser.is_admin) {
    document.getElementById('nav-users').style.display = 'block';
      document.getElementById('nav-commands').style.display = 'block';
      document.getElementById('nav-reports').style.display = 'block';
      document.getElementById('nav-extensions').style.display = 'block';
      document.getElementById('nav-settings').style.display = 'block';
    document.getElementById('nav-admin').style.display = 'block';
    document.getElementById('add-vm-btn').style.display = 'block';
    document.getElementById('add-command-btn').style.display = 'block';
    const addExtBtn = document.getElementById('add-extension-btn');
    if (addExtBtn) addExtBtn.style.display = 'block';
  } else if (currentUser.is_moderator) {
    document.getElementById('nav-users').style.display = 'none';
    document.getElementById('nav-commands').style.display = 'block';
    document.getElementById('nav-reports').style.display = 'block';
    document.getElementById('nav-extensions').style.display = 'block';
    document.getElementById('nav-settings').style.display = 'none';
    document.getElementById('nav-admin').style.display = 'none';
    document.getElementById('add-vm-btn').style.display = 'block';
    document.getElementById('add-command-btn').style.display = 'block';
    const addExtBtn = document.getElementById('add-extension-btn');
    if (addExtBtn) addExtBtn.style.display = 'block';
  } else {
    document.getElementById('nav-users').style.display = 'none';
    document.getElementById('nav-commands').style.display = 'none';
    document.getElementById('nav-reports').style.display = 'none';
    document.getElementById('nav-extensions').style.display = 'none';
    document.getElementById('nav-settings').style.display = 'none';
    document.getElementById('nav-admin').style.display = 'none';
    document.getElementById('add-vm-btn').style.display = 'none';
    document.getElementById('add-command-btn').style.display = 'none';
    const addExtBtn = document.getElementById('add-extension-btn');
    if (addExtBtn) addExtBtn.style.display = 'none';
  }

  handleRoute();
}

function logout() {
  localStorage.removeItem('authToken');
  authToken = null;
  currentUser = null;
  showLogin();
}

async function deleteMyAccount() {
  if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;

  try {
    const response = await apiRequest(`${API_BASE}/users/${currentUser.id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      alert('Account deleted successfully.');
      logout();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to delete account');
    }
  } catch (error) {
    console.error('Failed to delete account:', error);
    alert('Network error');
  }
}

async function loadUsers() {
  try {
    const response = await apiRequest(`${API_BASE}/users`);
    if (response.ok) {
      const data = await response.json();
      renderUsersTable(data.users);
    }
  } catch (error) {
    console.error('Failed to load users:', error);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = users.map(user => {
    const role = user.is_admin ? 'admin' : (user.is_moderator ? 'moderator' : 'user');
    return `
    <tr>
      <td>${user.id}</td>
      <td>${user.username}</td>
      <td>${user.email}</td>
      <td>
        <select class="form-select form-select-sm" onchange="updateUserRole(${user.id}, this.value)" ${user.id === currentUser.id && user.is_admin ? 'disabled' : ''} ${!currentUser.is_admin ? 'disabled' : ''}>
          <option value="user" ${role === 'user' ? 'selected' : ''}>User</option>
          <option value="moderator" ${role === 'moderator' ? 'selected' : ''}>Moderator</option>
          <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td>
      <td>
        ${user.is_verified ? '<span class="badge badge-verified">Verified</span>' : '<span class="badge bg-warning">Unverified</span>'}
        ${user.is_blocked ? '<span class="badge badge-blocked">Blocked</span>' : ''}
      </td>
      <td>${new Date(user.created_at).toLocaleDateString()}</td>
      <td>
        ${currentUser.is_admin ? `
          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" ${user.is_verified ? 'checked' : ''} onchange="updateUserVerified(${user.id}, this.checked)">
            <label class="form-check-label">Verified</label>
          </div>
          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" ${user.is_blocked ? 'checked' : ''} onchange="updateUserBlocked(${user.id}, this.checked)">
            <label class="form-check-label">Blocked</label>
          </div>
          ${user.id !== currentUser.id ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">Delete</button>` : ''}
        ` : ''}
        ${currentUser.is_moderator && !currentUser.is_admin ? `
          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" ${user.is_verified ? 'checked' : ''} onchange="updateUserVerified(${user.id}, this.checked)">
            <label class="form-check-label">Verified</label>
          </div>
          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" ${user.is_blocked ? 'checked' : ''} onchange="updateUserBlocked(${user.id}, this.checked)">
            <label class="form-check-label">Blocked</label>
          </div>
        ` : ''}
      </td>
    </tr>
    `;
  }).join('');
}

async function updateUserRole(userId, role) {
  try {
    const updates = {};
    if (role === 'admin') {
      updates.is_admin = true;
      updates.is_moderator = false;
    } else if (role === 'moderator') {
      updates.is_moderator = true;
      updates.is_admin = false;
    } else {
      updates.is_admin = false;
      updates.is_moderator = false;
    }

    const response = await apiRequest(`${API_BASE}/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    if (response.ok) {
      loadUsers();
    } else {
      alert('Failed to update user role');
    }
  } catch (error) {
    console.error('Failed to update user role:', error);
    alert('Network error');
  }
}

async function updateUserVerified(userId, verified) {
  try {
    const response = await apiRequest(`${API_BASE}/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_verified: verified })
    });

    if (!response.ok) {
      alert('Failed to update user');
    }
  } catch (error) {
    console.error('Failed to update user:', error);
    alert('Network error');
  }
}

async function updateUserBlocked(userId, blocked) {
  try {
    const response = await apiRequest(`${API_BASE}/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_blocked: blocked })
    });

    if (!response.ok) {
      alert('Failed to update user');
    }
  } catch (error) {
    console.error('Failed to update user:', error);
    alert('Network error');
  }
}

async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;

  try {
    const response = await apiRequest(`${API_BASE}/users/${userId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      loadUsers();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to delete user');
    }
  } catch (error) {
    console.error('Failed to delete user:', error);
    alert('Network error');
  }
}

async function loadEmojis() {
  try {
    const response = await apiRequest(`${API_BASE}/emojis`);
    if (response.ok) {
      const data = await response.json();
      renderEmojisTable(data.emojis);
    }
  } catch (error) {
    console.error('Failed to load emojis:', error);
  }
}

function renderEmojisTable(emojis) {
  const tbody = document.getElementById('emojis-table-body');
  if (emojis.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No emojis created yet.</td></tr>';
    return;
  }

  tbody.innerHTML = emojis.map(emoji => `
    <tr>
      <td>${emoji.id}</td>
      <td><strong>${emoji.name}</strong></td>
      <td><img src="${emoji.web_address}" alt="${emoji.name}" class="emoji-preview" onerror="this.style.display='none'"></td>
      <td>${emoji.description}</td>
      <td>${emoji.vm_node_ids.join(', ') || 'None'}</td>
      <td>${emoji.created_by_username || 'Unknown'}</td>
      <td>
        ${(currentUser.is_admin || currentUser.is_moderator || emoji.created_by === currentUser.id) ? `<button class="btn btn-sm btn-danger" onclick="deleteEmoji(${emoji.id})">Delete</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function showCreateEmojiModal() {
  const vmCheckboxes = document.getElementById('emoji-vm-checkboxes');
  vmCheckboxes.innerHTML = vms.map(vm => `
    <div class="form-check">
      <input class="form-check-input" type="checkbox" value="${vm.node_id}" id="emoji-vm-${vm.id}" name="emoji-vm-node-ids">
      <label class="form-check-label" for="emoji-vm-${vm.id}">${vm.display_name} (${vm.node_id})</label>
    </div>
  `).join('');

  const modal = new bootstrap.Modal(document.getElementById('createEmojiModal'));
  modal.show();
}

async function createEmoji() {
  const name = document.getElementById('emoji-name').value;
  const webAddress = document.getElementById('emoji-web-address').value;
  const description = document.getElementById('emoji-description').value;
  const checkboxes = document.querySelectorAll('input[name="emoji-vm-node-ids"]:checked');
  const vmNodeIds = Array.from(checkboxes).map(cb => cb.value);

  if (!name || !webAddress || !description || vmNodeIds.length === 0) {
    const errorDiv = document.getElementById('create-emoji-error');
    errorDiv.textContent = 'Please fill in all fields and select at least one VM.';
    errorDiv.style.display = 'block';
    return;
  }

  const errorDiv = document.getElementById('create-emoji-error');
  errorDiv.style.display = 'none';

  try {
    const response = await apiRequest(`${API_BASE}/emojis`, {
      method: 'POST',
      body: JSON.stringify({ name, web_address: webAddress, description, vm_node_ids: vmNodeIds })
    });
    const data = await response.json();

    if (response.ok) {
      const modal = bootstrap.Modal.getInstance(document.getElementById('createEmojiModal'));
      modal.hide();
      document.getElementById('create-emoji-form').reset();
      loadEmojis();
    } else {
      errorDiv.textContent = data.error || 'Failed to create emoji';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

async function deleteEmoji(emojiId) {
  if (!confirm('Are you sure you want to delete this emoji?')) return;

  try {
    const response = await apiRequest(`${API_BASE}/emojis/${emojiId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      loadEmojis();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to delete emoji');
    }
  } catch (error) {
    console.error('Failed to delete emoji:', error);
    alert('Network error');
  }
}

async function loadGIFs() {
  try {
    const response = await apiRequest(`${API_BASE}/gifs`);
    if (response.ok) {
      const data = await response.json();
      renderGIFsTable(data.gifs);
    }
  } catch (error) {
    console.error('Failed to load GIFs:', error);
  }
}

function renderGIFsTable(gifs) {
  const tbody = document.getElementById('gifs-table-body');
  if (gifs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No GIFs created yet.</td></tr>';
    return;
  }

  tbody.innerHTML = gifs.map(gif => `
    <tr>
      <td>${gif.id}</td>
      <td><strong>${gif.name}</strong></td>
      <td><img src="${gif.web_address}" alt="${gif.name}" class="emoji-preview" onerror="this.style.display='none'"></td>
      <td>${gif.description}</td>
      <td>${gif.vm_node_ids.join(', ') || 'None'}</td>
      <td>${gif.created_by_username || 'Unknown'}</td>
      <td>
        ${(currentUser.is_admin || currentUser.is_moderator || gif.created_by === currentUser.id) ? `<button class="btn btn-sm btn-danger" onclick="deleteGIF(${gif.id})">Delete</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function showCreateGIFModal() {
  const vmCheckboxes = document.getElementById('gif-vm-checkboxes');
  vmCheckboxes.innerHTML = vms.map(vm => `
    <div class="form-check">
      <input class="form-check-input" type="checkbox" value="${vm.node_id}" id="gif-vm-${vm.id}" name="gif-vm-node-ids">
      <label class="form-check-label" for="gif-vm-${vm.id}">${vm.display_name} (${vm.node_id})</label>
    </div>
  `).join('');

  const modal = new bootstrap.Modal(document.getElementById('createGIFModal'));
  modal.show();
}

async function createGIF() {
  const name = document.getElementById('gif-name').value;
  const webAddress = document.getElementById('gif-web-address').value;
  const description = document.getElementById('gif-description').value;
  const checkboxes = document.querySelectorAll('input[name="gif-vm-node-ids"]:checked');
  const vmNodeIds = Array.from(checkboxes).map(cb => cb.value);

  if (!name || !webAddress || !description || vmNodeIds.length === 0) {
    const errorDiv = document.getElementById('create-gif-error');
    errorDiv.textContent = 'Please fill in all fields and select at least one VM.';
    errorDiv.style.display = 'block';
    return;
  }

  const errorDiv = document.getElementById('create-gif-error');
  errorDiv.style.display = 'none';

  try {
    const response = await apiRequest(`${API_BASE}/gifs`, {
      method: 'POST',
      body: JSON.stringify({ name, web_address: webAddress, description, vm_node_ids: vmNodeIds })
    });
    const data = await response.json();

    if (response.ok) {
      const modal = bootstrap.Modal.getInstance(document.getElementById('createGIFModal'));
      modal.hide();
      document.getElementById('create-gif-form').reset();
      loadGIFs();
    } else {
      errorDiv.textContent = data.error || 'Failed to create GIF';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

async function deleteGIF(gifId) {
  if (!confirm('Are you sure you want to delete this GIF?')) return;

  try {
    const response = await apiRequest(`${API_BASE}/gifs/${gifId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      loadGIFs();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to delete GIF');
    }
  } catch (error) {
    console.error('Failed to delete GIF:', error);
    alert('Network error');
  }
}

function showCreateVMModal() {
  const modal = new bootstrap.Modal(document.getElementById('createVMModal'));
  modal.show();
}

async function createVM() {
  const websocketUri = document.getElementById('vm-websocket-uri').value;
  const nodeId = document.getElementById('vm-node-id').value;
  const displayName = document.getElementById('vm-display-name').value;
  const adminPassword = document.getElementById('vm-admin-password').value;
  const botName = document.getElementById('vm-bot-name').value;

  if (!websocketUri || !nodeId || !displayName || !adminPassword) {
    const errorDiv = document.getElementById('create-vm-error');
    errorDiv.textContent = 'Please fill in all required fields.';
    errorDiv.style.display = 'block';
    return;
  }

  const errorDiv = document.getElementById('create-vm-error');
  errorDiv.style.display = 'none';

  try {
    const response = await apiRequest(`${API_BASE}/vms`, {
      method: 'POST',
      body: JSON.stringify({ websocket_uri: websocketUri, node_id: nodeId, display_name: displayName, admin_password: adminPassword, bot_name: botName || null })
    });
    const data = await response.json();

    if (response.ok) {
      const modal = bootstrap.Modal.getInstance(document.getElementById('createVMModal'));
      modal.hide();
      document.getElementById('create-vm-form').reset();
      loadVMs();
    } else {
      errorDiv.textContent = data.error || 'Failed to create VM';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

function showEditVMModal(vmId) {
  const vm = vms.find(v => v.id === vmId);
  if (!vm) return;

  document.getElementById('edit-vm-id').value = vm.id;
  document.getElementById('edit-vm-websocket-uri').value = vm.websocket_uri;
  document.getElementById('edit-vm-node-id').value = vm.node_id;
  document.getElementById('edit-vm-display-name').value = vm.display_name;
  document.getElementById('edit-vm-admin-password').value = '';
  document.getElementById('edit-vm-bot-name').value = vm.bot_name || '';

  const modal = new bootstrap.Modal(document.getElementById('editVMModal'));
  modal.show();
}

async function updateVM() {
  const vmId = parseInt(document.getElementById('edit-vm-id').value);
  const websocketUri = document.getElementById('edit-vm-websocket-uri').value;
  const nodeId = document.getElementById('edit-vm-node-id').value;
  const displayName = document.getElementById('edit-vm-display-name').value;
  const adminPassword = document.getElementById('edit-vm-admin-password').value;
  const botName = document.getElementById('edit-vm-bot-name').value;

  if (!websocketUri || !nodeId || !displayName || !adminPassword) {
    const errorDiv = document.getElementById('edit-vm-error');
    errorDiv.textContent = 'Please fill in all required fields.';
    errorDiv.style.display = 'block';
    return;
  }

  const errorDiv = document.getElementById('edit-vm-error');
  errorDiv.style.display = 'none';

  try {
    const response = await apiRequest(`${API_BASE}/vms/${vmId}`, {
      method: 'PATCH',
      body: JSON.stringify({ websocket_uri: websocketUri, node_id: nodeId, display_name: displayName, admin_password: adminPassword, bot_name: botName || null })
    });
    const data = await response.json();

    if (response.ok) {
      const modal = bootstrap.Modal.getInstance(document.getElementById('editVMModal'));
      modal.hide();
      loadVMs();
    } else {
      errorDiv.textContent = data.error || 'Failed to update VM';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

async function deleteVM(vmId) {
  if (!confirm('Are you sure you want to delete this VM? This cannot be undone.')) return;

  try {
    const response = await apiRequest(`${API_BASE}/vms/${vmId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      loadVMs();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to delete VM');
    }
  } catch (error) {
    console.error('Failed to delete VM:', error);
    alert('Network error');
  }
}

async function loadCommands() {
  try {
    const response = await apiRequest(`${API_BASE}/commands`);
    if (response.ok) {
      const data = await response.json();
      renderCommandsTable(data.commands);
    }
  } catch (error) {
    console.error('Failed to load commands:', error);
  }
}

function renderCommandsTable(commands) {
  const tbody = document.getElementById('commands-table-body');
  tbody.innerHTML = commands.map(cmd => {
    const typeLabel = cmd.type === 'builtin' ? 'Built-in' : (cmd.type === 'text' ? 'Text' : (cmd.type === 'xss' ? 'XSS' : (cmd.type === 'qemu' ? 'QEMU' : 'Unknown')));
    return `
    <tr>
      <td>${cmd.id}</td>
      <td><code>${cmd.name}</code></td>
      <td>${typeLabel}</td>
      <td>
        <div class="form-check">
          <input class="form-check-input" type="checkbox" ${cmd.enabled ? 'checked' : ''} onchange="updateCommand(${cmd.id}, 'enabled', this.checked)">
        </div>
      </td>
      <td>
        <div class="form-check">
          <input class="form-check-input" type="checkbox" ${cmd.mod_only ? 'checked' : ''} onchange="updateCommand(${cmd.id}, 'mod_only', this.checked)">
        </div>
      </td>
      <td>
        ${cmd.type !== 'builtin' ? `
          <button class="btn btn-sm btn-primary" onclick="showEditCommandModal(${cmd.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCommand(${cmd.id})">Delete</button>
        ` : ''}
      </td>
    </tr>
    `;
  }).join('');
}

function showCreateCommandModal() {
  const modal = new bootstrap.Modal(document.getElementById('createCommandModal'));
  modal.show();
}

async function createCommand() {
  const name = document.getElementById('command-name').value.trim();
  const type = document.getElementById('command-type').value;
  const helpText = document.getElementById('command-help').value.trim();
  const responseText = document.getElementById('command-response').value.trim();
  const enabled = document.getElementById('command-enabled').checked;
  const modOnly = document.getElementById('command-mod-only').checked;

  if (!name || !helpText || !responseText) {
    const errorDiv = document.getElementById('create-command-error');
    errorDiv.textContent = 'Please fill in all required fields.';
    errorDiv.style.display = 'block';
    return;
  }

  const errorDiv = document.getElementById('create-command-error');
  errorDiv.style.display = 'none';

  try {
    const response = await apiRequest(`${API_BASE}/commands`, {
      method: 'POST',
      body: JSON.stringify({ name, type, help_text: helpText, response_text: responseText, enabled, mod_only: modOnly })
    });
    const data = await response.json();

    if (response.ok) {
      const modal = bootstrap.Modal.getInstance(document.getElementById('createCommandModal'));
      modal.hide();
      document.getElementById('create-command-form').reset();
      loadCommands();
    } else {
      errorDiv.textContent = data.error || 'Failed to create command';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

function showEditCommandModal(commandId) {
  loadCommandForEdit(commandId);
}

async function loadCommandForEdit(commandId) {
  try {
    const response = await apiRequest(`${API_BASE}/commands`);
    if (response.ok) {
      const data = await response.json();
      const command = data.commands.find(c => c.id === commandId);
      if (!command || command.type === 'builtin') return;

      document.getElementById('edit-command-id').value = command.id;
      document.getElementById('edit-command-name').value = command.name;
      document.getElementById('edit-command-type').value = command.type;
      document.getElementById('edit-command-help').value = command.help_text || '';
      document.getElementById('edit-command-response').value = command.response_text || '';
      document.getElementById('edit-command-enabled').checked = command.enabled;
      document.getElementById('edit-command-mod-only').checked = command.mod_only;

      const modal = new bootstrap.Modal(document.getElementById('editCommandModal'));
      modal.show();
    }
  } catch (error) {
    console.error('Failed to load command:', error);
    alert('Network error');
  }
}

async function updateCommandFull() {
  const commandId = parseInt(document.getElementById('edit-command-id').value);
  const type = document.getElementById('edit-command-type').value;
  const helpText = document.getElementById('edit-command-help').value.trim();
  const responseText = document.getElementById('edit-command-response').value.trim();
  const enabled = document.getElementById('edit-command-enabled').checked;
  const modOnly = document.getElementById('edit-command-mod-only').checked;

  if (!helpText || !responseText) {
    const errorDiv = document.getElementById('edit-command-error');
    errorDiv.textContent = 'Please fill in all required fields.';
    errorDiv.style.display = 'block';
    return;
  }

  const errorDiv = document.getElementById('edit-command-error');
  errorDiv.style.display = 'none';

  try {
    const response = await apiRequest(`${API_BASE}/commands/${commandId}`, {
      method: 'PATCH',
      body: JSON.stringify({ type, help_text: helpText, response_text: responseText, enabled, mod_only: modOnly })
    });
    const data = await response.json();

    if (response.ok) {
      const modal = bootstrap.Modal.getInstance(document.getElementById('editCommandModal'));
      modal.hide();
      loadCommands();
    } else {
      errorDiv.textContent = data.error || 'Failed to update command';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

async function deleteCommand(commandId) {
  if (!confirm('Are you sure you want to delete this command? This cannot be undone.')) return;

  try {
    const response = await apiRequest(`${API_BASE}/commands/${commandId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      loadCommands();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to delete command');
    }
  } catch (error) {
    console.error('Failed to delete command:', error);
    alert('Network error');
  }
}

async function updateCommand(commandId, field, value) {
  try {
    const updates = {};
    updates[field] = value;

    const response = await apiRequest(`${API_BASE}/commands/${commandId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      alert('Failed to update command');
      loadCommands();
    }
  } catch (error) {
    console.error('Failed to update command:', error);
    alert('Network error');
    loadCommands();
  }
}

async function loadSettings() {
  try {
    const response = await apiRequest(`${API_BASE}/settings`);
    if (response.ok) {
      const data = await response.json();
      document.getElementById('default-bot-name').value = data.default_bot_name || 'enixBot';
      document.getElementById('prefix').value = data.prefix || '-';
      document.getElementById('panel-url').value = data.panel_url || '';
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const defaultBotName = document.getElementById('default-bot-name').value;
  const prefix = document.getElementById('prefix').value;
  const panelUrl = document.getElementById('panel-url').value;

  try {
    const response = await apiRequest(`${API_BASE}/settings`, {
      method: 'POST',
      body: JSON.stringify({ default_bot_name: defaultBotName, prefix, panel_url: panelUrl })
    });

    if (response.ok) {
      alert('Settings applied successfully! Bots will reconnect with new settings.');
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to save settings');
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    alert('Network error');
  }
}

async function loadEmojiRequests() {
  try {
    const response = await apiRequest(`${API_BASE}/emoji-requests?limit=100`);
    if (response.ok) {
      const data = await response.json();
      renderEmojiRequestsTable(data.requests);
    }
  } catch (error) {
    console.error('Failed to load emoji requests:', error);
  }
}

function renderEmojiRequestsTable(requests) {
  const tbody = document.getElementById('emoji-requests-table-body');
  if (requests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No emoji requests yet.</td></tr>';
    return;
  }

  tbody.innerHTML = requests.map(req => `
    <tr>
      <td>${req.id}</td>
      <td>${req.username || 'Unknown'}</td>
      <td>${req.emoji_name || 'Unknown'}</td>
      <td>${req.vm_node_id}</td>
      <td>${new Date(req.created_at).toLocaleString()}</td>
    </tr>
  `).join('');
}

async function loadBlockedDomains() {
  try {
    const response = await apiRequest(`${API_BASE}/blocked-domains`);
    if (response.ok) {
      const data = await response.json();
      renderBlockedDomainsTable(data.domains);
    }
  } catch (error) {
    console.error('Failed to load blocked domains:', error);
  }
}

function renderBlockedDomainsTable(domains) {
  const tbody = document.getElementById('blocked-domains-table-body');
  if (domains.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" class="text-center">No blocked domains.</td></tr>';
    return;
  }

  tbody.innerHTML = domains.map(domain => `
    <tr>
      <td><code>${domain}</code></td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="removeBlockedDomain('${domain}')">Remove</button>
      </td>
    </tr>
  `).join('');
}

function showAddDomainModal() {
  const modal = new bootstrap.Modal(document.getElementById('addDomainModal'));
  modal.show();
}

async function addBlockedDomain() {
  const domain = document.getElementById('blocked-domain').value.trim();
  if (!domain) {
    const errorDiv = document.getElementById('add-domain-error');
    errorDiv.textContent = 'Please enter a domain name.';
    errorDiv.style.display = 'block';
    return;
  }

  const errorDiv = document.getElementById('add-domain-error');
  errorDiv.style.display = 'none';

  try {
    const response = await apiRequest(`${API_BASE}/blocked-domains`, {
      method: 'POST',
      body: JSON.stringify({ domain })
    });

    if (response.ok) {
      const modal = bootstrap.Modal.getInstance(document.getElementById('addDomainModal'));
      modal.hide();
      document.getElementById('add-domain-form').reset();
      loadBlockedDomains();
    } else {
      const data = await response.json();
      errorDiv.textContent = data.error || 'Failed to add blocked domain';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

async function removeBlockedDomain(domain) {
  if (!confirm(`Are you sure you want to remove ${domain} from the blocked list?`)) return;

  try {
    const response = await apiRequest(`${API_BASE}/blocked-domains/${encodeURIComponent(domain)}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      loadBlockedDomains();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to remove blocked domain');
    }
  } catch (error) {
    console.error('Failed to remove blocked domain:', error);
    alert('Network error');
  }
}

window.showLogin = showLogin;
window.showRegister = showRegister;
window.logout = logout;
window.deleteMyAccount = deleteMyAccount;
window.navigate = navigate;
window.acceptRules = acceptRules;
window.updateUserRole = updateUserRole;
window.updateUserVerified = updateUserVerified;
window.updateUserBlocked = updateUserBlocked;
window.deleteUser = deleteUser;
window.showCreateEmojiModal = showCreateEmojiModal;
window.createEmoji = createEmoji;
window.deleteEmoji = deleteEmoji;
window.showCreateGIFModal = showCreateGIFModal;
window.createGIF = createGIF;
window.deleteGIF = deleteGIF;
window.showCreateVMModal = showCreateVMModal;
window.createVM = createVM;
window.showEditVMModal = showEditVMModal;
window.updateVM = updateVM;
window.deleteVM = deleteVM;
window.updateCommand = updateCommand;
window.loadEmojiRequests = loadEmojiRequests;
window.showAddDomainModal = showAddDomainModal;
window.addBlockedDomain = addBlockedDomain;
window.removeBlockedDomain = removeBlockedDomain;
window.showCreateCommandModal = showCreateCommandModal;
window.createCommand = createCommand;
window.showEditCommandModal = showEditCommandModal;
window.updateCommandFull = updateCommandFull;
window.deleteCommand = deleteCommand;

async function loadReports() {
  try {
    const response = await apiRequest(`${API_BASE}/reports`);
    if (response.ok) {
      const data = await response.json();
      renderReportsTable(data.reports);
    }
  } catch (error) {
    console.error('Failed to load reports:', error);
  }
}

function renderReportsTable(reports) {
  const tbody = document.getElementById('reports-table-body');
  if (!tbody) return;
  
  if (reports.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No reports found.</td></tr>';
    return;
  }
  
  tbody.innerHTML = reports.map(report => {
    const statusBadge = report.resolved 
      ? '<span class="badge bg-success">Resolved</span>' 
      : '<span class="badge bg-warning">Pending</span>';
    const ipDisplay = report.reported_ip || '<em>Not available</em>';
    const createdDate = new Date(report.created_at).toLocaleString();
    
    return `
    <tr>
      <td>${report.id}</td>
      <td><strong>${report.reported_username}</strong></td>
      <td>${ipDisplay}</td>
      <td>${report.reporter_username}</td>
      <td>${report.reason}</td>
      <td>${statusBadge}</td>
      <td>${createdDate}</td>
      <td>
        ${!report.resolved ? `
          <button class="btn btn-sm btn-danger" onclick="banFromReport(${report.id}, '${report.reported_username.replace(/'/g, "\\'")}')">Ban User</button>
          <button class="btn btn-sm btn-success" onclick="resolveReport(${report.id})">Mark Resolved</button>
        ` : ''}
        <button class="btn btn-sm btn-secondary" onclick="deleteReportFromPanel(${report.id})">Delete</button>
      </td>
    </tr>
    `;
  }).join('');
}

async function resolveReport(reportId) {
  if (!confirm('Mark this report as resolved?')) return;

  try {
    const response = await apiRequest(`${API_BASE}/reports/${reportId}/resolve`, {
      method: 'POST'
    });

    if (response.ok) {
      loadReports();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to resolve report');
    }
  } catch (error) {
    console.error('Failed to resolve report:', error);
    alert('Network error');
  }
}

async function deleteReportFromPanel(reportId) {
  if (!confirm('Are you sure you want to delete this report? This cannot be undone.')) return;

  try {
    const response = await apiRequest(`${API_BASE}/reports/${reportId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      loadReports();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to delete report');
    }
  } catch (error) {
    console.error('Failed to delete report:', error);
    alert('Network error');
  }
}

async function banFromReport(reportId, username) {
  if (!confirm(`Are you sure you want to ban ${username}?`)) return;

  try {
    const vmsResponse = await apiRequest(`${API_BASE}/vms`);
    if (!vmsResponse.ok) {
      alert('Failed to load VMs');
      return;
    }
    const vmsData = await vmsResponse.json();
    const vms = vmsData.vms || [];
    
    if (vms.length === 0) {
      alert('No VMs available');
      return;
    }

    const vmList = vms.map(vm => `${vm.node_id}: ${vm.display_name}`).join('\n');
    const vmSelect = prompt(`Select VM to ban from:\n\n${vmList}\n\nEnter node_id:`, vms[0].node_id);
    
    if (!vmSelect) return;

    const response = await apiRequest(`${API_BASE}/reports/${reportId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ node_id: vmSelect })
    });

    if (response.ok) {
      const data = await response.json();
      alert(data.message || `Banned ${username}`);
      loadReports();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to ban user');
    }
  } catch (error) {
    console.error('Failed to ban user:', error);
    alert('Network error');
  }
}

window.loadReports = loadReports;
window.resolveReport = resolveReport;
window.deleteReportFromPanel = deleteReportFromPanel;
window.banFromReport = banFromReport;

async function loadExtensions() {
  try {
    console.log('Loading extensions...');
    const response = await apiRequest(`${API_BASE}/extensions`);
    console.log('Extensions response:', response);
    if (response.ok) {
      const data = await response.json();
      console.log('Extensions data:', data);
      renderExtensionsTable(data.extensions);
    } else {
      console.error('Failed to load extensions:', response.status, response.statusText);
      const data = await response.json();
      console.error('Error data:', data);
    }
  } catch (error) {
    console.error('Failed to load extensions:', error);
  }
}

function renderExtensionsTable(extensions) {
  const tbody = document.getElementById('extensions-table-body');
  console.log('Rendering extensions table, tbody:', tbody, 'extensions:', extensions);
  if (!tbody) {
    console.error('extensions-table-body not found!');
    return;
  }
  
  if (!extensions || extensions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No extensions found.</td></tr>';
    return;
  }
  
  tbody.innerHTML = extensions.map(ext => {
    const statusBadge = ext.enabled 
      ? '<span class="badge bg-success">Enabled</span>' 
      : '<span class="badge bg-secondary">Disabled</span>';
    const commandsList = (ext.commands || []).map(c => `<code>${c.name}</code>`).join(', ') || 'None';
    let permissionsList = 'None';
    try {
      const perms = typeof ext.permissions === 'string' ? JSON.parse(ext.permissions || '[]') : (ext.permissions || []);
      permissionsList = Array.isArray(perms) ? perms.join(', ') : 'None';
    } catch (e) {
      console.error('Error parsing permissions:', e, ext.permissions);
    }
    
    return `
    <tr>
      <td>${ext.extension_id}</td>
      <td><strong>${ext.display_name}</strong></td>
      <td>${ext.description || ''}</td>
      <td>${ext.version || 'N/A'}</td>
      <td>${commandsList}</td>
      <td>${permissionsList}</td>
      <td>${statusBadge}</td>
      <td>
        <button class="btn btn-sm btn-${ext.enabled ? 'warning' : 'success'}" onclick="toggleExtension('${ext.extension_id.replace(/'/g, "\\'")}', ${!ext.enabled})">
          ${ext.enabled ? 'Disable' : 'Enable'}
        </button>
        <button class="btn btn-sm btn-info" onclick="showExtensionConfig('${ext.extension_id.replace(/'/g, "\\'")}')">Config</button>
        <button class="btn btn-sm btn-danger" onclick="deleteExtension('${ext.extension_id.replace(/'/g, "\\'")}')">Delete</button>
      </td>
    </tr>
    `;
  }).join('');
}

function showAddExtensionModal() {
  const modal = new bootstrap.Modal(document.getElementById('addExtensionModal'));
  modal.show();
  document.getElementById('extension-details').style.display = 'none';
  document.getElementById('add-extension-next-btn').style.display = 'block';
  document.getElementById('add-extension-add-btn').style.display = 'none';
}

async function loadExtensionDetails() {
  const uri = document.getElementById('extension-websocket-uri').value.trim();
  if (!uri) {
    const errorDiv = document.getElementById('add-extension-error');
    errorDiv.textContent = 'Please enter a WebSocket URI.';
    errorDiv.style.display = 'block';
    return;
  }

  const errorDiv = document.getElementById('add-extension-error');
  errorDiv.style.display = 'none';

  try {
    const response = await apiRequest(`${API_BASE}/extensions`, {
      method: 'POST',
      body: JSON.stringify({ websocket_uri: uri })
    });
    const data = await response.json();

    if (response.ok) {
      document.getElementById('ext-display-name').textContent = data.extension.display_name;
      document.getElementById('ext-description').textContent = data.extension.description || 'No description';
      document.getElementById('ext-version').textContent = data.extension.version || 'N/A';
      document.getElementById('ext-commands').textContent = (data.extension.commands || []).map(c => c.name).join(', ') || 'None';
      document.getElementById('ext-permissions').textContent = (JSON.parse(data.extension.permissions || '[]')).join(', ') || 'None';
      document.getElementById('extension-details').style.display = 'block';
      document.getElementById('add-extension-next-btn').style.display = 'none';
      document.getElementById('add-extension-add-btn').style.display = 'block';
    } else {
      errorDiv.textContent = data.error || 'Failed to load extension details';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

async function addExtension() {
  const uri = document.getElementById('extension-websocket-uri').value.trim();
  
  try {
    const response = await apiRequest(`${API_BASE}/extensions`, {
      method: 'POST',
      body: JSON.stringify({ websocket_uri: uri })
    });
    const data = await response.json();

    if (response.ok) {
      const modal = bootstrap.Modal.getInstance(document.getElementById('addExtensionModal'));
      modal.hide();
      document.getElementById('add-extension-form').reset();
      loadExtensions();
    } else {
      const errorDiv = document.getElementById('add-extension-error');
      errorDiv.textContent = data.error || 'Failed to add extension';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    const errorDiv = document.getElementById('add-extension-error');
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

async function toggleExtension(extensionId, enabled) {
  try {
    const response = await apiRequest(`${API_BASE}/extensions/${encodeURIComponent(extensionId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled })
    });

    if (response.ok) {
      loadExtensions();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to toggle extension');
    }
  } catch (error) {
    console.error('Failed to toggle extension:', error);
    alert('Network error');
  }
}

async function showExtensionConfig(extensionId) {
  try {
    const response = await apiRequest(`${API_BASE}/extensions/${encodeURIComponent(extensionId)}/config`);
    if (response.ok) {
      const data = await response.json();
      const config = data.config || {};
      const configStr = JSON.stringify(config, null, 2);
      const newConfig = prompt('Extension Configuration (JSON):', configStr);
      if (newConfig) {
        try {
          const parsed = JSON.parse(newConfig);
          const updateResponse = await apiRequest(`${API_BASE}/extensions/${encodeURIComponent(extensionId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ config: parsed })
          });
          if (updateResponse.ok) {
            alert('Configuration updated successfully');
          } else {
            const updateData = await updateResponse.json();
            alert(updateData.error || 'Failed to update configuration');
          }
        } catch (e) {
          alert('Invalid JSON format');
        }
      }
    }
  } catch (error) {
    console.error('Failed to load extension config:', error);
    alert('Network error');
  }
}

async function deleteExtension(extensionId) {
  if (!confirm(`Are you sure you want to delete extension ${extensionId}? This cannot be undone.`)) return;

  try {
    const response = await apiRequest(`${API_BASE}/extensions/${encodeURIComponent(extensionId)}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      loadExtensions();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to delete extension');
    }
  } catch (error) {
    console.error('Failed to delete extension:', error);
    alert('Network error');
  }
}

window.loadExtensions = loadExtensions;
window.showAddExtensionModal = showAddExtensionModal;
window.loadExtensionDetails = loadExtensionDetails;
window.addExtension = addExtension;
window.toggleExtension = toggleExtension;
window.showExtensionConfig = showExtensionConfig;
window.deleteExtension = deleteExtension;


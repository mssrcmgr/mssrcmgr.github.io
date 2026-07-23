// --- CONFIGURATION ---
const API_URL = 'https://channel-manager.makesensedeveloper.workers.dev/'; // Placeholder for Worker URL

// AES Key/IV Shift Logic (matching the mobile app)
const _k = [0x6e, 0x62, 0x6c, 0x66, 0x74, 0x66, 0x6f, 0x74, 0x66, 0x41, 0x33, 0x31, 0x33, 0x37, 0x6e, 0x62, 0x6c, 0x66, 0x74, 0x66, 0x6f, 0x74, 0x66, 0x41, 0x33, 0x31, 0x33, 0x37, 0x22, 0x22, 0x22, 0x22];
const _i = [0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37];

const KEY = CryptoJS.enc.Utf8.parse(_k.map(b => String.fromCharCode(b - 1)).join(''));
const IV = CryptoJS.enc.Utf8.parse(_i.map(b => String.fromCharCode(b - 1)).join(''));

let currentChannels = [];
let authToken = localStorage.getItem('admin_token');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        showDashboard();
    }
    setupEventListeners();
});

function showDashboard() {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('dashboard').style.display = 'grid';
    loadChannels();
}

function setupEventListeners() {
    // Login
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // UI Navigation
    document.getElementById('importBtn').onclick = () => document.getElementById('importModal').style.display = 'block';
    document.getElementById('logoutBtn').onclick = logout;
    document.getElementById('refreshBtn').onclick = loadChannels;

    // Modals
    document.querySelector('.close').onclick = () => document.getElementById('importModal').style.display = 'none';
    document.getElementById('confirmImport').onclick = processImport;

    // Search
    document.getElementById('channelSearch').oninput = (e) => filterTable(e.target.value);

    // Actions
    document.getElementById('exportBtn').onclick = exportAll;
    document.getElementById('appUrlBtn').onclick = copyAppUrl;
}

async function handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;
    const message = document.getElementById('loginMessage');

    try {
        const result = await apiCall('login', { password });
        if (result.success) {
            authToken = result.token;
            localStorage.setItem('admin_token', authToken);
            showDashboard();
        } else {
            message.textContent = 'Invalid access token.';
            message.style.display = 'block';
        }
    } catch (err) {
        message.textContent = 'Connection error.';
        message.style.display = 'block';
    }
}

async function loadChannels() {
    try {
        const result = await apiCall('getChannels');
        if (result.success) {
            currentChannels = result.data;
            renderTable(currentChannels);
            updateStats();
        }
    } catch (err) {
        console.error('Failed to load channels:', err);
    }
}

function renderTable(data) {
    const body = document.getElementById('channelsBody');
    body.innerHTML = data.map((ch, i) => `
        <tr>
            <td><img src="${ch.logo}" class="chan-logo" onerror="this.src='https://placehold.co/40x40?text=TV'"></td>
            <td><input type="text" value="${ch.name}" onchange="updateChannel(${i}, 'name', this.value)"></td>
            <td><input type="text" value="${ch.category}" onchange="updateChannel(${i}, 'category', this.value)"></td>
            <td><input type="text" value="${ch.url}" class="url-input" onchange="updateChannel(${i}, 'url', this.value)"></td>
            <td>
                <span class="status-badge ${ch.status.toLowerCase()}" onclick="toggleStatus(${i})">
                    ${ch.status.toUpperCase()}
                </span>
            </td>
            <td>
                <button onclick="deleteChannel(${i})" class="btn-text text-error"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

async function updateChannel(index, field, value) {
    const channel = currentChannels[index];
    channel[field] = value;
    await apiCall('saveChannels', { data: JSON.stringify(currentChannels) });
    updateStats();
}

async function toggleStatus(index) {
    const channel = currentChannels[index];
    channel.status = channel.status === 'Active' ? 'Inactive' : 'Active';
    await apiCall('saveChannels', { data: JSON.stringify(currentChannels) });
    renderTable(currentChannels);
    updateStats();
}

async function deleteChannel(index) {
    if (!confirm('Remove this channel?')) return;
    currentChannels.splice(index, 1);
    await apiCall('saveChannels', { data: JSON.stringify(currentChannels) });
    renderTable(currentChannels);
    updateStats();
}

function processImport() {
    const content = document.getElementById('importArea').value.trim();
    if (!content) return;

    let newChannels = [];
    if (content.startsWith('#EXTM3U')) {
        newChannels = parseM3u(content);
    } else {
        try { newChannels = JSON.parse(content); } catch(e) { alert('Invalid format'); return; }
    }

    // Add default status
    newChannels = newChannels.map(c => ({ ...c, status: 'Active' }));

    currentChannels = [...currentChannels, ...newChannels];
    apiCall('saveChannels', { data: JSON.stringify(currentChannels) }).then(() => {
        document.getElementById('importModal').style.display = 'none';
        document.getElementById('importArea').value = '';
        loadChannels();
    });
}

function parseM3u(content) {
    const channels = [];
    const lines = content.split('\n');
    let currentChannel = {};

    lines.forEach(line => {
        line = line.trim();
        if (line.startsWith('#EXTINF')) {
            const nameMatch = line.match(/,(.*)$/);
            const logoMatch = line.match(/tvg-logo="(.*?)"/);
            const groupMatch = line.match(/group-title="(.*?)"/);
            currentChannel = {
                name: nameMatch ? nameMatch[1] : 'Unknown',
                logo: logoMatch ? logoMatch[1] : '',
                category: groupMatch ? groupMatch[1] : 'General'
            };
        } else if (line.startsWith('http')) {
            currentChannel.url = line;
            channels.push(currentChannel);
            currentChannel = {};
        }
    });
    return channels;
}

function exportAll() {
    const json = JSON.stringify(currentChannels, null, 2);
    const encrypted = encrypt(json);
    copyToClipboard(encrypted, 'Encrypted export copied!');
}

function copyAppUrl() {
    const url = `${API_URL}?action=getAppSource`;
    copyToClipboard(url, 'App Source URL copied! Use this in the MakesenseTV app.');
}

// --- UTILS ---

function encrypt(text) {
    const encrypted = CryptoJS.AES.encrypt(text, KEY, { iv: IV, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
    return encrypted.toString();
}

async function apiCall(action, params = {}) {
    const query = new URLSearchParams({ action, token: authToken, ...params });
    const response = await fetch(`${API_URL}?${query.toString()}`);
    return await response.json();
}

function copyToClipboard(text, msg) {
    navigator.clipboard.writeText(text).then(() => alert(msg));
}

function logout() {
    localStorage.removeItem('admin_token');
    window.location.reload();
}

function filterTable(query) {
    const filtered = currentChannels.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.category.toLowerCase().includes(query.toLowerCase())
    );
    renderTable(filtered);
}

function updateStats() {
    document.getElementById('totalChannels').textContent = currentChannels.length;
    document.getElementById('activeChannels').textContent = currentChannels.filter(c => c.status === 'Active').length;
}

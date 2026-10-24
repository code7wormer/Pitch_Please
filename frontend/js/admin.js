// Admin Command Panel Logic for Pitch Please!

function getApiBaseUrl() {
    // 1. Check URL query parameter: ?api=https://...
    try {
        const params = new URLSearchParams(window.location.search);
        const queryApi = params.get('api');
        if (queryApi) {
            const cleanApi = queryApi.trim().replace(/\/+$/, '');
            localStorage.setItem('PITCH_API_URL', cleanApi);
            return cleanApi;
        }
    } catch (e) {}

    // 2. Check localStorage
    const custom = localStorage.getItem('PITCH_API_URL');
    if (custom && custom.trim()) {
        return custom.trim().replace(/\/+$/, '');
    }

    // 3. Check window.PITCH_CONFIG
    if (window.PITCH_CONFIG && window.PITCH_CONFIG.BACKEND_API_URL && window.PITCH_CONFIG.BACKEND_API_URL.trim()) {
        return window.PITCH_CONFIG.BACKEND_API_URL.trim().replace(/\/+$/, '');
    }

    // 4. Localhost fallback
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:8000';
    }

    // 5. Origin fallback
    return window.location.origin;
}

let API_BASE = getApiBaseUrl();
let WS_BASE = API_BASE.replace(/^http/, 'ws');

// State
let adminKey = localStorage.getItem('pitch_admin_key') || '';
let adminWs = null;
let allTeams = [];
let activeTeams = [];
let currentPitcher = null;
let activePoll = null;
let pollCountdownInterval = null;
let pitchWheel = null;

// DOM Elements
const adminAuthModal = document.getElementById('adminAuthModal');
const formAdminAuth = document.getElementById('formAdminAuth');
const inputAdminKey = document.getElementById('inputAdminKey');
const adminAuthError = document.getElementById('adminAuthError');
const adminNotice = document.getElementById('adminNotice');
const adminConnDot = document.getElementById('adminConnDot');
const adminWsStatus = document.getElementById('adminWsStatus');
const btnAdminLogout = document.getElementById('btnAdminLogout');
const btnSoundToggle = document.getElementById('btnSoundToggle');

const navTabBtns = document.querySelectorAll('.nav-tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Teams tab elements
const formAddTeam = document.getElementById('formAddTeam');
const inputTeamName = document.getElementById('inputTeamName');
const btnAddTeam = document.getElementById('btnAddTeam');
const btnRefreshTeams = document.getElementById('btnRefreshTeams');
const teamsTableBody = document.getElementById('teamsTableBody');
const countActiveTeams = document.getElementById('countActiveTeams');
const countTotalTeams = document.getElementById('countTotalTeams');
const quickPitchingTeamDisplay = document.getElementById('quickPitchingTeamDisplay');

// Wheel tab elements
const btnSpinWheel = document.getElementById('btnSpinWheel');
const selectManualTeam = document.getElementById('selectManualTeam');
const btnManualSelect = document.getElementById('btnManualSelect');
const selectedPitcherBigName = document.getElementById('selectedPitcherBigName');
const selectedPitcherCodeBadge = document.getElementById('selectedPitcherCodeBadge');
const btnGoToPoll = document.getElementById('btnGoToPoll');
const winnerModal = document.getElementById('winnerModal');
const winnerModalTeamName = document.getElementById('winnerModalTeamName');
const btnConfirmWinner = document.getElementById('btnConfirmWinner');

// Poll tab elements
const pollTargetTeamDisplay = document.getElementById('pollTargetTeamDisplay');
const btnStartPoll = document.getElementById('btnStartPoll');
const pollStatusBadge = document.getElementById('pollStatusBadge');
const adminPollTimer = document.getElementById('adminPollTimer');
const liveVoteCount = document.getElementById('liveVoteCount');
const liveVoteEligible = document.getElementById('liveVoteEligible');
const btnExtendPoll = document.getElementById('btnExtendPoll');
const btnEndPoll = document.getElementById('btnEndPoll');

// Results tab elements
const btnRefreshResults = document.getElementById('btnRefreshResults');
const resultsList = document.getElementById('resultsList');

// API Modal elements
const btnConfigApi = document.getElementById('btnConfigApi');
const apiUrlModal = document.getElementById('apiUrlModal');
const inputCustomApiUrl = document.getElementById('inputCustomApiUrl');
const btnSaveApiUrl = document.getElementById('btnSaveApiUrl');
const btnCloseApiModal = document.getElementById('btnCloseApiModal');

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initWheel();
    bindEvents();

    if (adminKey) {
        verifyAndLoad();
    } else {
        adminAuthModal.style.display = 'flex';
    }
});

function initWheel() {
    pitchWheel = new WheelOfPitch('wheelCanvas', (winner) => {
        onWheelWinnerSelected(winner);
    });
}

function bindEvents() {
    // Auth
    formAdminAuth.addEventListener('submit', (e) => {
        e.preventDefault();
        adminKey = inputAdminKey.value.trim();
        verifyAndLoad();
    });

    btnAdminLogout.addEventListener('click', () => {
        if (confirm('Log out from Admin Command?')) {
            localStorage.removeItem('pitch_admin_key');
            location.reload();
        }
    });

    // Sound toggle
    btnSoundToggle.addEventListener('click', () => {
        if (window.arcadeSound) {
            window.arcadeSound.muted = !window.arcadeSound.muted;
            btnSoundToggle.textContent = window.arcadeSound.muted ? '🔇 MUTED' : '🔊 SOUND';
        }
    });

    // API Config modal
    btnConfigApi.addEventListener('click', () => {
        inputCustomApiUrl.value = localStorage.getItem('PITCH_API_URL') || '';
        apiUrlModal.style.display = 'flex';
    });

    btnSaveApiUrl.addEventListener('click', () => {
        const val = inputCustomApiUrl.value.trim();
        if (val) {
            localStorage.setItem('PITCH_API_URL', val);
        } else {
            localStorage.removeItem('PITCH_API_URL');
        }
        API_BASE = getApiBaseUrl();
        WS_BASE = API_BASE.replace(/^http/, 'ws');
        apiUrlModal.style.display = 'none';
        location.reload();
    });

    btnCloseApiModal.addEventListener('click', () => {
        apiUrlModal.style.display = 'none';
    });

    // Tabs
    navTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // Teams
    formAddTeam.addEventListener('submit', handleAddTeam);
    btnRefreshTeams.addEventListener('click', fetchTeams);

    // Wheel & Pitcher selection
    btnSpinWheel.addEventListener('click', () => {
        if (pitchWheel) {
            pitchWheel.spin();
            if (window.arcadeSound) window.arcadeSound.click();
        }
    });

    btnManualSelect.addEventListener('click', handleManualSelect);

    btnConfirmWinner.addEventListener('click', () => {
        winnerModal.style.display = 'none';
        switchTab('tabPoll');
    });

    btnGoToPoll.addEventListener('click', () => {
        switchTab('tabPoll');
    });

    // Poll controls
    btnStartPoll.addEventListener('click', handleStartPoll);
    btnExtendPoll.addEventListener('click', handleExtendPoll);
    btnEndPoll.addEventListener('click', handleEndPoll);

    // Results
    btnRefreshResults.addEventListener('click', fetchResults);
}

function switchTab(tabId) {
    navTabBtns.forEach(b => {
        if (b.dataset.tab === tabId) b.classList.add('active');
        else b.classList.remove('active');
    });

    tabContents.forEach(c => {
        if (c.id === tabId) c.classList.add('active');
        else c.classList.remove('active');
    });

    if (tabId === 'tabWheel' && pitchWheel) {
        setTimeout(() => pitchWheel.resize(), 50);
    }
    if (tabId === 'tabResults') {
        fetchResults();
    }
}

function showNotice(msg, isError = false) {
    adminNotice.textContent = msg;
    adminNotice.style.display = 'block';
    adminNotice.style.borderColor = isError ? 'var(--neon-pink)' : 'var(--neon-green)';
    adminNotice.style.color = isError ? '#ff6699' : 'var(--neon-green)';
    setTimeout(() => {
        adminNotice.style.display = 'none';
    }, 5000);
}

// ==========================================
// Authentication
// ==========================================
async function verifyAndLoad() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/teams`, {
            headers: { 'x-admin-key': adminKey }
        });

        if (!res.ok) {
            throw new Error('Invalid Admin Secret.');
        }

        localStorage.setItem('pitch_admin_key', adminKey);
        adminAuthModal.style.display = 'none';
        initAdminWebSocket();
        await fetchTeams();
        await fetchCurrentPitching();
        await syncAdminPoll();
    } catch (err) {
        adminAuthError.textContent = err.message;
        adminAuthError.style.display = 'block';
        adminAuthModal.style.display = 'flex';
    }
}

// ==========================================
// Team Management (Add, List, Toggle, Delete)
// ==========================================
async function fetchTeams() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/teams`, {
            headers: { 'x-admin-key': adminKey }
        });
        if (!res.ok) throw new Error('Failed to load teams');
        allTeams = await res.json();
        activeTeams = allTeams.filter(t => t.is_active);

        renderTeamsTable();
        updateOverviewStats();
        updateWheelAndSelectOptions();
    } catch (e) {
        showNotice(e.message, true);
    }
}

async function handleAddTeam(e) {
    e.preventDefault();
    const name = inputTeamName.value.trim();
    if (!name) return;

    btnAddTeam.disabled = true;
    btnAddTeam.textContent = 'GENERATING CODE...';

    try {
        const res = await fetch(`${API_BASE}/api/admin/teams`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': adminKey
            },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to add team');

        inputTeamName.value = '';
        showNotice(`✅ Team "${data.name}" added with Code: ${data.code}`);
        if (window.arcadeSound) window.arcadeSound.voteSuccess();
        await fetchTeams();
    } catch (err) {
        showNotice(err.message, true);
        if (window.arcadeSound) window.arcadeSound.errorBuzz();
    } finally {
        btnAddTeam.disabled = false;
        btnAddTeam.innerHTML = '<span>+ GENERATE CODE &amp; ADD TEAM</span>';
    }
}

function renderTeamsTable() {
    if (!allTeams || allTeams.length === 0) {
        teamsTableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    No teams registered yet. Add a team above to generate their 6-digit code.
                </td>
            </tr>
        `;
        return;
    }

    teamsTableBody.innerHTML = allTeams.map(t => `
        <tr>
            <td>
                <strong style="color: #fff; font-size: 15px;">${escapeHtml(t.name)}</strong>
            </td>
            <td>
                <span class="code-pill">
                    #${t.code}
                    <button 
                        class="btn-arcade-secondary" 
                        style="padding: 2px 6px; font-size: 8px;"
                        onclick="copyTeamCode('${t.code}')"
                        title="Copy Code"
                    >📋</button>
                </span>
            </td>
            <td>
                <span class="status-badge ${t.is_active ? 'status-active' : 'status-paused'}">
                    ${t.is_active ? 'PLAYING' : 'PAUSED'}
                </span>
            </td>
            <td style="text-align: right; white-space: nowrap;">
                <button 
                    class="btn-arcade-secondary" 
                    style="padding: 6px 10px; font-size: 9px; margin-right: 6px;"
                    onclick="toggleTeamActive(${t.id})"
                >
                    ${t.is_active ? 'PAUSE' : 'ACTIVATE'}
                </button>
                <button 
                    class="btn-arcade-danger" 
                    style="padding: 6px 10px; font-size: 9px;"
                    onclick="deleteTeam(${t.id}, '${escapeHtml(t.name)}')"
                >
                    REMOVE
                </button>
            </td>
        </tr>
    `).join('');
}

function updateOverviewStats() {
    countTotalTeams.textContent = allTeams.length;
    countActiveTeams.textContent = activeTeams.length;
    liveVoteEligible.textContent = Math.max(0, activeTeams.length - 1);
}

function updateWheelAndSelectOptions() {
    if (pitchWheel) {
        pitchWheel.setTeams(activeTeams);
    }

    selectManualTeam.innerHTML = '<option value="">-- Select a Team --</option>' + 
        activeTeams.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (#${t.code})</option>`).join('');
}

window.copyTeamCode = (code) => {
    navigator.clipboard.writeText(code);
    showNotice(`📋 Copied code #${code} to clipboard!`);
    if (window.arcadeSound) window.arcadeSound.click();
};

window.toggleTeamActive = async (teamId) => {
    try {
        const res = await fetch(`${API_BASE}/api/admin/teams/${teamId}/toggle`, {
            method: 'PATCH',
            headers: { 'x-admin-key': adminKey }
        });
        if (!res.ok) throw new Error('Failed to toggle team');
        await fetchTeams();
    } catch (e) {
        showNotice(e.message, true);
    }
};

window.deleteTeam = async (teamId, teamName) => {
    if (!confirm(`Are you sure you want to remove team "${teamName}"?`)) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/teams/${teamId}`, {
            method: 'DELETE',
            headers: { 'x-admin-key': adminKey }
        });
        if (!res.ok) throw new Error('Failed to delete team');
        showNotice(`Team "${teamName}" removed.`);
        await fetchTeams();
    } catch (e) {
        showNotice(e.message, true);
    }
};

// ==========================================
// Pitcher Selection (Wheel / Manual)
// ==========================================
async function onWheelWinnerSelected(winningTeam) {
    if (!winningTeam) return;
    await setPitchingTeam(winningTeam.id, winningTeam.name, winningTeam.code);
    winnerModalTeamName.textContent = winningTeam.name;
    winnerModal.style.display = 'flex';
}

async function handleManualSelect() {
    const teamId = parseInt(selectManualTeam.value, 10);
    if (!teamId) {
        showNotice('Please pick a team from the dropdown.', true);
        return;
    }
    const team = activeTeams.find(t => t.id === teamId);
    if (!team) return;

    await setPitchingTeam(team.id, team.name, team.code);
    showNotice(`✅ ${team.name} selected as current pitcher!`);
    if (window.arcadeSound) window.arcadeSound.voteSuccess();
}

async function setPitchingTeam(teamId, teamName, teamCode) {
    try {
        const res = await fetch(`${API_BASE}/api/admin/pitching/select`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': adminKey
            },
            body: JSON.stringify({ team_id: teamId })
        });
        if (!res.ok) throw new Error('Failed to set pitching team');

        currentPitcher = { id: teamId, name: teamName, code: teamCode };
        updatePitcherDisplay();
    } catch (e) {
        showNotice(e.message, true);
    }
}

async function fetchCurrentPitching() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/pitching/current`, {
            headers: { 'x-admin-key': adminKey }
        });
        const data = await res.json();
        if (data.team) {
            currentPitcher = data.team;
            updatePitcherDisplay();
        }
    } catch (e) {}
}

function updatePitcherDisplay() {
    if (currentPitcher) {
        quickPitchingTeamDisplay.textContent = currentPitcher.name;
        selectedPitcherBigName.textContent = currentPitcher.name;
        selectedPitcherCodeBadge.textContent = `#${currentPitcher.code}`;
        pollTargetTeamDisplay.textContent = `${currentPitcher.name} (#${currentPitcher.code})`;
        btnGoToPoll.disabled = false;
        btnStartPoll.disabled = false;
    } else {
        quickPitchingTeamDisplay.textContent = 'NONE SELECTED YET';
        selectedPitcherBigName.textContent = 'NONE SELECTED';
        selectedPitcherCodeBadge.textContent = 'Spin wheel or choose manually above';
        pollTargetTeamDisplay.textContent = 'NO TEAM SELECTED';
        btnGoToPoll.disabled = true;
        btnStartPoll.disabled = true;
    }
}

// ==========================================
// Poll Controls (Start, Extend, End)
// ==========================================
async function handleStartPoll() {
    if (!currentPitcher) {
        showNotice('Please select a pitching team first from the Wheel tab.', true);
        return;
    }

    const selectedDur = document.querySelector('input[name="pollDuration"]:checked');
    const durationSecs = selectedDur ? parseInt(selectedDur.value, 10) : 30;

    btnStartPoll.disabled = true;
    btnStartPoll.textContent = 'ACTIVATING POLL...';

    try {
        const res = await fetch(`${API_BASE}/api/admin/poll/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': adminKey
            },
            body: JSON.stringify({
                pitching_team_id: currentPitcher.id,
                duration_secs: durationSecs
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to start poll');

        showNotice(`🚀 Voting poll activated for ${currentPitcher.name} (${durationSecs}s)!`);
        if (window.arcadeSound) window.arcadeSound.countdownTick();
        activePoll = data;
        onPollStartedUI(data);
    } catch (err) {
        showNotice(err.message, true);
        if (window.arcadeSound) window.arcadeSound.errorBuzz();
    } finally {
        btnStartPoll.disabled = false;
        btnStartPoll.innerHTML = '<span>🚀 START VOTING POLL</span>';
    }
}

async function handleExtendPoll() {
    btnExtendPoll.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/api/admin/poll/extend`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': adminKey
            },
            body: JSON.stringify({ seconds: 15 })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to extend poll');

        showNotice('⏳ Poll extended by 15 seconds!');
        if (window.arcadeSound) window.arcadeSound.countdownTick();
    } catch (err) {
        showNotice(err.message, true);
    } finally {
        btnExtendPoll.disabled = false;
    }
}

async function handleEndPoll() {
    if (!confirm('End the current voting poll now? All votes will be locked and finalized.')) return;

    btnEndPoll.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/api/admin/poll/end`, {
            method: 'POST',
            headers: { 'x-admin-key': adminKey }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to end poll');

        showNotice(`🏁 Poll concluded! Average score: ${data.average_score} / 10`);
        if (window.arcadeSound) window.arcadeSound.winnerFanfare();
        onPollEndedUI();
        switchTab('tabResults');
    } catch (err) {
        showNotice(err.message, true);
    } finally {
        btnEndPoll.disabled = false;
    }
}

function onPollStartedUI(pollData) {
    pollStatusBadge.className = 'status-badge status-active';
    pollStatusBadge.textContent = 'ACTIVE';
    btnExtendPoll.disabled = false;
    btnEndPoll.disabled = false;
    liveVoteCount.textContent = '0';

    startAdminCountdown(pollData.ends_at);
}

function onPollEndedUI() {
    if (pollCountdownInterval) clearInterval(pollCountdownInterval);
    pollStatusBadge.className = 'status-badge status-paused';
    pollStatusBadge.textContent = 'CONCLUDED';
    btnExtendPoll.disabled = true;
    btnEndPoll.disabled = true;
    adminPollTimer.textContent = '00:00';
    adminPollTimer.className = 'timer-digits';
    activePoll = null;
}

function startAdminCountdown(endsAtIso) {
    if (pollCountdownInterval) clearInterval(pollCountdownInterval);
    const target = new Date(endsAtIso).getTime();

    function update() {
        const now = Date.now();
        const diff = Math.max(0, target - now);
        const totalSecs = Math.ceil(diff / 1000);

        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        adminPollTimer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        if (totalSecs <= 5) {
            adminPollTimer.className = 'timer-digits urgent';
        } else if (totalSecs <= 15) {
            adminPollTimer.className = 'timer-digits warning';
        } else {
            adminPollTimer.className = 'timer-digits';
        }

        if (diff <= 0) {
            clearInterval(pollCountdownInterval);
            onPollEndedUI();
        }
    }

    update();
    pollCountdownInterval = setInterval(update, 1000);
}

async function syncAdminPoll() {
    try {
        const res = await fetch(`${API_BASE}/api/poll/current`);
        const data = await res.json();
        if (data.active && data.poll) {
            activePoll = data.poll;
            onPollStartedUI(data.poll);
        } else {
            onPollEndedUI();
        }
    } catch (e) {}
}

// ==========================================
// Results & Averages (Round 1 Scores & Deletion)
// ==========================================
async function fetchResults() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/results`, {
            headers: { 'x-admin-key': adminKey }
        });
        if (!res.ok) throw new Error('Failed to load results');
        const results = await res.json();
        renderResults(results);
    } catch (e) {
        showNotice(e.message, true);
    }
}

function renderResults(results) {
    if (!results || results.length === 0) {
        resultsList.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 30px;">
                No completed polls yet. Complete a vote to see the average scores here.
            </div>
        `;
        return;
    }

    resultsList.innerHTML = results.map(r => {
        const total = r.total_votes || 0;
        const avg = r.average_score.toFixed(1);

        // Build breakdown bars 1..10
        let breakdownHtml = '';
        for (let score = 10; score >= 1; score--) {
            const count = (r.breakdown && r.breakdown[score]) || 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            breakdownHtml += `
                <div class="breakdown-row">
                    <span class="breakdown-label">${score}★</span>
                    <div class="breakdown-track">
                        <div class="breakdown-fill" style="width: ${pct}%;"></div>
                    </div>
                    <span class="breakdown-count">${count}</span>
                </div>
            `;
        }

        return `
            <div class="admin-card" style="border-left: 4px solid var(--neon-green);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <div style="font-family: var(--font-pixel); font-size: 16px; color: #fff;">
                            ${escapeHtml(r.pitching_team_name)}
                        </div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                            Poll ID #${r.poll_id} &bull; Total Votes Cast: <strong style="color: #fff;">${total}</strong>
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="text-align: right;">
                            <div style="font-family: var(--font-pixel); font-size: 26px; color: var(--neon-green);">
                                ${avg} <span style="font-size: 14px; color: var(--text-muted);">/ 10</span>
                            </div>
                            <div style="font-size: 10px; color: var(--neon-cyan); letter-spacing: 1px;">ROUND 1 AVERAGE</div>
                        </div>

                        <!-- Delete result button for testing -->
                        <button 
                            class="btn-arcade-danger" 
                            style="padding: 8px 12px; font-size: 9px;"
                            onclick="deletePollResult(${r.poll_id}, '${escapeHtml(r.pitching_team_name)}')"
                            title="Delete this result (useful for test votes)"
                        >
                            🗑️ DELETE
                        </button>
                    </div>
                </div>

                <div style="margin-top: 14px; background: #000; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                    <div style="font-family: var(--font-pixel); font-size: 9px; color: var(--text-muted); margin-bottom: 8px;">
                        VOTE DISTRIBUTION BREAKDOWN:
                    </div>
                    <div class="breakdown-bars">
                        ${breakdownHtml}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.deletePollResult = async (pollId, teamName) => {
    if (!confirm(`Delete all voting results for "${teamName}" (Poll #${pollId})?\n\nThis will permanently delete these votes and remove it from the averages. Useful for clearing test runs.`)) {
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/admin/poll/${pollId}`, {
            method: 'DELETE',
            headers: { 'x-admin-key': adminKey }
        });
        if (!res.ok) throw new Error('Failed to delete poll result');
        showNotice(`🗑️ Poll #${pollId} result deleted.`);
        if (window.arcadeSound) window.arcadeSound.click();
        await fetchResults();
    } catch (e) {
        showNotice(e.message, true);
    }
};

// ==========================================
// Admin WebSocket
// ==========================================
function initAdminWebSocket() {
    if (adminWs) {
        try { adminWs.close(); } catch (e) {}
    }

    const wsUrl = `${WS_BASE}/ws/admin`;
    adminWs = new WebSocket(wsUrl);

    adminWs.onopen = () => {
        adminConnDot.classList.remove('offline');
        adminWsStatus.textContent = 'ONLINE';
        adminWs._ping = setInterval(() => {
            if (adminWs.readyState === WebSocket.OPEN) adminWs.send('ping');
        }, 20000);
    };

    adminWs.onclose = () => {
        adminConnDot.classList.add('offline');
        adminWsStatus.textContent = 'OFFLINE';
        if (adminWs._ping) clearInterval(adminWs._ping);
        setTimeout(() => {
            if (adminKey) initAdminWebSocket();
        }, 3000);
    };

    adminWs.onerror = () => {
        adminConnDot.classList.add('offline');
        adminWsStatus.textContent = 'ERROR';
    };

    adminWs.onmessage = (event) => {
        if (event.data === 'pong') return;
        try {
            const data = JSON.parse(event.data);
            handleAdminWsMessage(data);
        } catch (e) {}
    };
}

function handleAdminWsMessage(msg) {
    switch (msg.event) {
        case 'vote_cast':
            liveVoteCount.textContent = msg.total_votes;
            showNotice(`🗳️ Vote cast by "${msg.latest_voter_team}"! Total: ${msg.total_votes}`);
            if (window.arcadeSound) window.arcadeSound.wheelTick();
            break;

        case 'teams_updated':
            fetchTeams();
            break;

        case 'pitching_selected':
            currentPitcher = msg.team;
            updatePitcherDisplay();
            break;

        case 'poll_started':
            onPollStartedUI(msg);
            break;

        case 'poll_extended':
            startAdminCountdown(msg.ends_at);
            showNotice(`⏳ Poll extended by ${msg.added_seconds}s!`);
            break;

        case 'poll_ended':
            onPollEndedUI();
            fetchResults();
            break;

        case 'results_updated':
            fetchResults();
            break;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[m]);
}

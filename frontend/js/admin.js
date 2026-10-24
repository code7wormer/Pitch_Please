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
let judgeScores = JSON.parse(localStorage.getItem('pitch_judge_scores') || '{}');
let consideredTeams = JSON.parse(localStorage.getItem('pitch_considered_teams') || '{}');
let finalizedRowsCache = [];

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

// Finalize tab elements
const btnExportExcel = document.getElementById('btnExportExcel');
const btnRefreshFinalize = document.getElementById('btnRefreshFinalize');
const finalizeTableBody = document.getElementById('finalizeTableBody');

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

    // Finalize Results & Export
    if (btnRefreshFinalize) btnRefreshFinalize.addEventListener('click', loadFinalizeTable);
    if (btnExportExcel) btnExportExcel.addEventListener('click', exportFinalResultsToExcel);
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
    if (tabId === 'tabFinalize') {
        loadFinalizeTable();
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
                ${t.has_pitched ? '<span class="status-badge" style="background: rgba(0, 229, 255, 0.15); color: var(--neon-cyan); border-color: var(--neon-cyan); margin-left: 6px;">🎤 PITCHED</span>' : ''}
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
    // Only active teams that have NOT pitched yet can be spun on the wheel!
    const eligibleWheelTeams = activeTeams.filter(t => !t.has_pitched);

    if (pitchWheel) {
        pitchWheel.setTeams(eligibleWheelTeams, activeTeams.length);
    }

    if (eligibleWheelTeams.length === 0 && activeTeams.length > 0) {
        btnSpinWheel.disabled = true;
        btnSpinWheel.innerHTML = '<span>🏆 ALL TEAMS HAVE PITCHED!</span>';
    } else {
        btnSpinWheel.disabled = false;
        btnSpinWheel.innerHTML = '<span>🎡 SPIN THE WHEEL!</span>';
    }

    selectManualTeam.innerHTML = '<option value="">-- Select a Team --</option>' + 
        activeTeams.map(t => {
            const label = t.has_pitched ? `${escapeHtml(t.name)} (#${t.code}) [ALREADY PITCHED]` : `${escapeHtml(t.name)} (#${t.code})`;
            return `<option value="${t.id}">${label}</option>`;
        }).join('');
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
    pollCountdownInterval = null;
    pollStatusBadge.className = 'status-badge status-paused';
    pollStatusBadge.textContent = 'CONCLUDED';
    btnExtendPoll.disabled = true;
    btnEndPoll.disabled = true;
    adminPollTimer.textContent = '00:00';
    adminPollTimer.className = 'timer-digits';
    activePoll = null;
    fetchTeams();
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
            pollCountdownInterval = null;
            adminPollTimer.textContent = '00:00';
            adminPollTimer.className = 'timer-digits urgent';
            pollStatusBadge.className = 'status-badge status-warning';
            pollStatusBadge.textContent = "TIME'S UP (EXTEND OR END)";
            // KEEP EXTEND AND END BUTTONS FULLY ACTIVE AFTER TIME COMPLETION!
            btnExtendPoll.disabled = false;
            btnEndPoll.disabled = false;
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
            if (data.poll.remaining_secs <= 0) {
                adminPollTimer.textContent = '00:00';
                adminPollTimer.className = 'timer-digits urgent';
                pollStatusBadge.className = 'status-badge status-warning';
                pollStatusBadge.textContent = "TIME'S UP (EXTEND OR END)";
                btnExtendPoll.disabled = false;
                btnEndPoll.disabled = false;
            }
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

                        <!-- Delete result button -->
                        <button 
                            class="btn-arcade-danger" 
                            style="padding: 8px 12px; font-size: 9px;"
                            onclick="deletePollResult(${r.poll_id}, '${escapeHtml(r.pitching_team_name)}')"
                            title="Delete this poll result"
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
    if (!confirm(`Permanently delete voting results for "${teamName}" (Poll #${pollId})?`)) {
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
        await fetchTeams();
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
            pollStatusBadge.className = 'status-badge status-active';
            pollStatusBadge.textContent = 'ACTIVE (+EXTENDED)';
            btnExtendPoll.disabled = false;
            btnEndPoll.disabled = false;
            showNotice(`⏳ Poll extended by ${msg.added_seconds}s!`);
            break;

        case 'poll_ended':
            onPollEndedUI();
            fetchResults();
            fetchTeams();
            break;

        case 'results_updated':
            fetchResults();
            fetchTeams();
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

// ==========================================
// TAB 5: FINALIZE RESULTS & EXCEL EXPORT
// Weightage: 60% Peer/Audience + 40% Judges
// ==========================================
async function loadFinalizeTable() {
    if (!finalizeTableBody) return;

    finalizeTableBody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
                Computing latest scores and rankings...
            </td>
        </tr>
    `;

    try {
        const [teamsRes, resultsRes] = await Promise.all([
            fetch(`${API_BASE}/api/admin/teams`, { headers: { 'x-admin-key': adminKey } }),
            fetch(`${API_BASE}/api/admin/results`, { headers: { 'x-admin-key': adminKey } })
        ]);

        if (!teamsRes.ok || !resultsRes.ok) throw new Error('Failed to load final scoreboard data');

        const teams = await teamsRes.json();
        const results = await resultsRes.json();

        // Map teamId to latest voting average
        const teamVotingMap = {};
        results.forEach(r => {
            if (teamVotingMap[r.pitching_team_id] === undefined) {
                teamVotingMap[r.pitching_team_id] = r.average_score;
            }
        });

        // Filter to active teams
        const activeOnly = teams.filter(t => t.is_active);

        finalizedRowsCache = activeOnly.map(t => {
            const hasScore = teamVotingMap[t.id] !== undefined;
            const votingAvg = hasScore ? teamVotingMap[t.id] : 0.0;
            const judgeVal = judgeScores[t.id] !== undefined ? judgeScores[t.id] : '';
            const judgeNum = judgeVal !== '' ? (parseFloat(judgeVal) || 0.0) : 0.0;
            
            const isConsidered = consideredTeams[t.id] !== undefined ? Boolean(consideredTeams[t.id]) : true;
            const finalScore = isConsidered ? ((votingAvg * 0.6) + (judgeNum * 0.4)) : 0.0;

            return {
                id: t.id,
                name: t.name,
                code: t.code,
                hasVoted: hasScore,
                votingAvg: votingAvg,
                votingWeighted: votingAvg * 0.6,
                judgeVal: judgeVal,
                judgeNum: judgeNum,
                judgeWeighted: judgeNum * 0.4,
                isConsidered: isConsidered,
                finalScore: finalScore
            };
        });

        renderFinalizeTable();
    } catch (e) {
        showNotice(e.message, true);
    }
}

function renderFinalizeTable() {
    if (!finalizeTableBody) return;

    if (!finalizedRowsCache || finalizedRowsCache.length === 0) {
        finalizeTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    No teams registered yet.
                </td>
            </tr>
        `;
        return;
    }

    // Sort: Considered teams first by finalScore descending, then unconsidered
    const considered = finalizedRowsCache.filter(r => r.isConsidered);
    const unconsidered = finalizedRowsCache.filter(r => !r.isConsidered);

    considered.sort((a, b) => b.finalScore - a.finalScore);
    considered.forEach((r, idx) => {
        r.rank = idx + 1;
    });

    const displayList = [...considered, ...unconsidered];

    finalizeTableBody.innerHTML = displayList.map(r => {
        let rankHtml = '<span style="color: var(--text-muted);">-</span>';
        if (r.isConsidered) {
            let rankClass = 'rank-badge';
            let medal = '';
            if (r.rank === 1) { rankClass += ' rank-1'; medal = '🥇 '; }
            else if (r.rank === 2) { rankClass += ' rank-2'; medal = '🥈 '; }
            else if (r.rank === 3) { rankClass += ' rank-3'; medal = '🥉 '; }

            rankHtml = `<span class="${rankClass}">${medal}${r.rank}</span>`;
        }

        const votingDisplay = r.hasVoted 
            ? `<div style="font-family: var(--font-pixel); font-size: 13px; color: #fff;">${r.votingAvg.toFixed(2)} / 10</div>
               <div style="font-size: 10px; color: var(--neon-cyan); margin-top: 2px;">60% = +${r.votingWeighted.toFixed(2)}</div>`
            : `<div style="color: var(--text-muted); font-size: 12px; font-style: italic;">No votes yet</div>`;

        return `
            <tr style="${r.isConsidered ? '' : 'opacity: 0.45; background: rgba(0,0,0,0.3);'}">
                <td style="text-align: center;">
                    <input 
                        type="checkbox" 
                        class="checkbox-consider" 
                        ${r.isConsidered ? 'checked' : ''} 
                        onchange="toggleTeamConsidered(${r.id}, this.checked)"
                        title="Include in final scoreboard"
                    >
                </td>
                <td style="text-align: center;">
                    ${rankHtml}
                </td>
                <td>
                    <strong style="color: #fff; font-size: 15px;">${escapeHtml(r.name)}</strong>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">#${r.code}</div>
                </td>
                <td style="text-align: center;">
                    ${votingDisplay}
                </td>
                <td style="text-align: center;">
                    <input 
                        type="number" 
                        min="0" 
                        max="10" 
                        step="0.1" 
                        placeholder="0.0" 
                        value="${r.judgeVal}" 
                        class="judge-score-input"
                        ${r.isConsidered ? '' : 'disabled'}
                        oninput="onJudgeScoreChange(${r.id}, this.value)"
                    >
                    <div style="font-size: 10px; color: var(--neon-yellow); margin-top: 2px;">
                        40% = +${r.judgeWeighted.toFixed(2)}
                    </div>
                </td>
                <td style="text-align: right;">
                    <span class="final-score-pill ${r.isConsidered ? '' : 'excluded'}">
                        ${r.isConsidered ? r.finalScore.toFixed(2) + ' / 10' : 'EXCLUDED'}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

window.toggleTeamConsidered = (teamId, isChecked) => {
    consideredTeams[teamId] = isChecked;
    localStorage.setItem('pitch_considered_teams', JSON.stringify(consideredTeams));
    
    const row = finalizedRowsCache.find(r => r.id === teamId);
    if (row) {
        row.isConsidered = isChecked;
        row.finalScore = isChecked ? ((row.votingAvg * 0.6) + (row.judgeNum * 0.4)) : 0.0;
    }
    renderFinalizeTable();
    if (window.arcadeSound) window.arcadeSound.click();
};

window.onJudgeScoreChange = (teamId, val) => {
    judgeScores[teamId] = val;
    localStorage.setItem('pitch_judge_scores', JSON.stringify(judgeScores));

    const num = val !== '' ? Math.max(0, Math.min(10, parseFloat(val) || 0)) : 0.0;
    const row = finalizedRowsCache.find(r => r.id === teamId);
    if (row) {
        row.judgeVal = val;
        row.judgeNum = num;
        row.judgeWeighted = num * 0.4;
        row.finalScore = row.isConsidered ? ((row.votingAvg * 0.6) + row.judgeWeighted) : 0.0;
    }
    renderFinalizeTable();
};

function exportFinalResultsToExcel() {
    if (!finalizedRowsCache || finalizedRowsCache.length === 0) {
        showNotice('No results to export yet.', true);
        return;
    }

    const considered = finalizedRowsCache.filter(r => r.isConsidered).sort((a, b) => b.finalScore - a.finalScore);
    const unconsidered = finalizedRowsCache.filter(r => !r.isConsidered);
    const exportList = [...considered, ...unconsidered];
    const timestamp = new Date().toLocaleString();

    if (window.XLSX) {
        const wb = XLSX.utils.book_new();

        const sheetData = [
            ["DIMENSIONS CLUB — PITCH PLEASE!"],
            ["ROUND 1 OFFICIAL FINAL SCOREBOARD & QUALIFICATION RESULTS"],
            ["Formula: (Peer / Audience Voting Avg × 60%) + (Judge's Score × 40%)"],
            ["Export Date & Time:", timestamp],
            [], // blank spacer
            [
                "Rank",
                "Team Name",
                "Team Code",
                "Peer Voting Score (Out of 10)",
                "Voting Weighted (60%)",
                "Judge's Score (Out of 10)",
                "Judge Weighted (40%)",
                "Final Score (Out of 10)",
                "Status"
            ]
        ];

        exportList.forEach((r, idx) => {
            sheetData.push([
                r.isConsidered ? (idx + 1) : "N/A",
                r.name,
                "#" + r.code,
                r.hasVoted ? parseFloat(r.votingAvg.toFixed(2)) : 0.0,
                parseFloat(r.votingWeighted.toFixed(2)),
                parseFloat(r.judgeNum.toFixed(2)),
                parseFloat(r.judgeWeighted.toFixed(2)),
                parseFloat(r.finalScore.toFixed(2)),
                r.isConsidered ? "CONSIDERED / QUALIFIED" : "EXCLUDED"
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(sheetData);

        // Auto column widths
        ws['!cols'] = [
            { wch: 8 },  // Rank
            { wch: 28 }, // Team Name
            { wch: 14 }, // Code
            { wch: 28 }, // Peer Voting
            { wch: 22 }, // 60%
            { wch: 24 }, // Judge Score
            { wch: 22 }, // 40%
            { wch: 24 }, // Final Score
            { wch: 26 }  // Status
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Round 1 Final Scores");
        XLSX.writeFile(wb, `Pitch_Please_Round1_Final_Results_${Date.now()}.xlsx`);
        showNotice("📥 Excel workbook downloaded successfully!");
        if (window.arcadeSound) window.arcadeSound.winnerFanfare();
    } else {
        // Fallback: CSV export that opens directly in Microsoft Excel
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "DIMENSIONS CLUB — PITCH PLEASE! ROUND 1 FINAL RESULTS\n";
        csvContent += `Formula: (Peer Voting * 60%) + (Judge Score * 40%)\n`;
        csvContent += `Exported: ${timestamp}\n\n`;
        csvContent += "Rank,Team Name,Team Code,Voting Score (10),Voting 60%,Judge Score (10),Judge 40%,Final Score (10),Status\n";

        exportList.forEach((r, idx) => {
            const rankStr = r.isConsidered ? (idx + 1) : "N/A";
            const statusStr = r.isConsidered ? "CONSIDERED" : "EXCLUDED";
            csvContent += `"${rankStr}","${r.name.replace(/"/g, '""')}","#${r.code}",${r.votingAvg.toFixed(2)},${r.votingWeighted.toFixed(2)},${r.judgeNum.toFixed(2)},${r.judgeWeighted.toFixed(2)},${r.finalScore.toFixed(2)},"${statusStr}"\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Pitch_Please_Round1_Final_Results_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotice("📥 Results exported as CSV!");
    }
}

// ==========================================
// WHEEL OF MISFORTUNE — Standalone Spin Wheel
// ==========================================

const WOM_PRESETS = {
    punishments: [
        'Do 20 pushups NOW', 'Wear a funny hat all day', 'Speak in rhymes for 5 min',
        'Give someone a piggyback ride', 'No phone for 30 min', 'Act like a chicken',
        'Sing your next sentence', 'Do your best robot dance', 'Eat something spicy',
        'Text your crush right now', 'Hold a plank for 1 min', 'Talk in slow motion',
        'Swap seats with someone', 'Do 10 jumping jacks', 'Make animal sounds',
    ],
    truths: [
        'Biggest secret revealed!', 'Who do you have a crush on?', 'Most embarrassing moment',
        'Worst grade you ever got', 'Last lie you told', 'Craziest dream you had',
        'Something you never told your parents', 'Favorite person in the room?',
        "Weirdest thing you've Googled", 'Most awkward date story',
        'What are you most afraid of?', 'Best prank you pulled',
        'Celebrity you have a crush on', 'Stupidest thing you believed as a kid',
        'Most used emoji and why?',
    ],
    tasks: [
        'Freestyle rap for 30 sec', 'Mime an animal until guessed', 'Do an impression',
        'Draw a portrait in 60 sec', 'Say tongue twister 3 times fast', 'Hum a song till guessed',
        'Recreate a famous movie scene', 'Do a magic trick', 'Teach a word in another language',
        'Make up a jingle on the spot', 'Do a news anchor impression', 'Read a text in dramatic voice',
        'Describe a color without naming it', 'Act out your day without words', 'Tell a joke in 10 sec',
    ]
};

let womWheel = null;
let womItems = JSON.parse(localStorage.getItem('wom_items') || '[]');
let womLastWinner = null;

const WOM_COLORS = [
    '#8B0000', '#4B0082', '#B22222', '#800080',
    '#CC2200', '#6600AA', '#FF4500', '#7B0D1E',
    '#9B1B30', '#551A8B', '#D2042D', '#3D0066',
];

function initWOM() {
    if (typeof WheelOfMisfortune === 'undefined') {
        setTimeout(initWOM, 100);
        return;
    }
    womWheel = new WheelOfMisfortune('womCanvas', onWOMWinnerSelected);
    womWheel.setItems(womItems);
    renderWOMItems();
    updateWOMCount();
    bindWOMEvents();
}

function bindWOMEvents() {
    const btnSpin = document.getElementById('btnSpinMisfortune');
    const btnAdd = document.getElementById('btnWomAdd');
    const inputEl = document.getElementById('womItemInput');
    const btnClear = document.getElementById('btnWomClear');
    const btnShuffle = document.getElementById('btnWomShuffle');
    const btnRemoveWinner = document.getElementById('btnWomRemoveWinner');
    const btnSpinAgain = document.getElementById('btnWomSpinAgain');
    const btnAcceptFate = document.getElementById('btnWomAcceptFate');
    const btnDismiss = document.getElementById('btnWomDismissModal');

    if (btnSpin) btnSpin.addEventListener('click', () => {
        if (!womWheel || womItems.length < 2) {
            showNotice('Add at least 2 items to spin the Wheel of Misfortune!', true);
            return;
        }
        womWheel.spin();
        if (window.arcadeSound) window.arcadeSound.click();
    });

    if (btnAdd) btnAdd.addEventListener('click', addWOMItem);
    if (inputEl) {
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addWOMItem(); }
        });
    }

    if (btnClear) btnClear.addEventListener('click', () => {
        if (womItems.length === 0) return;
        if (!confirm('Clear all fates from the Wheel of Misfortune?')) return;
        womItems = [];
        saveWOMItems();
        renderWOMItems();
        updateWOMCount();
        if (womWheel) womWheel.setItems(womItems);
        const rc = document.getElementById('womResultCard');
        if (rc) rc.style.display = 'none';
        womLastWinner = null;
        showNotice('Wheel of Misfortune cleared.');
    });

    if (btnShuffle) btnShuffle.addEventListener('click', () => {
        for (let i = womItems.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [womItems[i], womItems[j]] = [womItems[j], womItems[i]];
        }
        saveWOMItems();
        renderWOMItems();
        if (womWheel) womWheel.setItems(womItems);
        showNotice('Fates shuffled!');
        if (window.arcadeSound) window.arcadeSound.click();
    });

    if (btnRemoveWinner) btnRemoveWinner.addEventListener('click', () => {
        if (womLastWinner === null) return;
        womItems.splice(womLastWinner, 1);
        saveWOMItems();
        renderWOMItems();
        updateWOMCount();
        if (womWheel) womWheel.setItems(womItems);
        womLastWinner = null;
        const rc = document.getElementById('womResultCard');
        if (rc) rc.style.display = 'none';
        showNotice('Fate removed from the wheel.');
    });

    if (btnSpinAgain) btnSpinAgain.addEventListener('click', () => {
        if (!womWheel || womItems.length < 2) {
            showNotice('Need at least 2 items!', true);
            return;
        }
        womWheel.spin();
        if (window.arcadeSound) window.arcadeSound.click();
    });

    if (btnAcceptFate) btnAcceptFate.addEventListener('click', () => {
        const modal = document.getElementById('womWinnerModal');
        if (modal) modal.style.display = 'none';
    });

    if (btnDismiss) btnDismiss.addEventListener('click', () => {
        const modal = document.getElementById('womWinnerModal');
        if (modal) modal.style.display = 'none';
    });

    const womModal = document.getElementById('womWinnerModal');
    if (womModal) {
        womModal.addEventListener('click', (e) => {
            if (e.target === womModal) womModal.style.display = 'none';
        });
    }

    // Resize wheel when its tab is activated
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-tab-btn');
        if (btn && btn.dataset.tab === 'tabMisfortune' && womWheel) {
            setTimeout(() => womWheel.resize(), 60);
        }
    });
}

function addWOMItem() {
    const inputEl = document.getElementById('womItemInput');
    if (!inputEl) return;
    const val = inputEl.value.trim();
    if (!val) return;
    if (womItems.length >= 20) {
        showNotice('Maximum 20 fates on the wheel at once!', true);
        return;
    }
    if (womItems.includes(val)) {
        showNotice('This fate is already on the wheel!', true);
        return;
    }
    womItems.push(val);
    inputEl.value = '';
    inputEl.focus();
    saveWOMItems();
    renderWOMItems();
    updateWOMCount();
    if (womWheel) womWheel.setItems(womItems);
    if (window.arcadeSound) window.arcadeSound.click();
}

function removeWOMItem(index) {
    womItems.splice(index, 1);
    if (womLastWinner !== null && womLastWinner >= index) womLastWinner = null;
    saveWOMItems();
    renderWOMItems();
    updateWOMCount();
    if (womWheel) womWheel.setItems(womItems);
    if (window.arcadeSound) window.arcadeSound.click();
}
window.removeWOMItem = removeWOMItem;

function renderWOMItems() {
    const list = document.getElementById('womItemsList');
    if (!list) return;
    if (womItems.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; color: #5a2020; padding: 20px; font-size: 9px; font-family: var(--font-pixel); line-height: 2;">
                \u{1F480} NO FATES LOADED<br><span style="font-size: 8px; color: #3d0000;">ADD ITEMS OR USE A PRESET</span>
            </div>`;
        return;
    }
    list.innerHTML = womItems.map((item, i) => {
        const color = WOM_COLORS[i % WOM_COLORS.length];
        return `
            <div class="wom-item-row">
                <div class="wom-item-color-dot" style="background: ${color}; box-shadow: 0 0 6px ${color};"></div>
                <span class="wom-item-label" title="${escapeHtml(item)}">${escapeHtml(item)}</span>
                <button class="btn-wom-remove-item" onclick="removeWOMItem(${i})" title="Remove">\u2715</button>
            </div>`;
    }).join('');
}

function updateWOMCount() {
    const el = document.getElementById('womItemCount');
    if (el) el.textContent = womItems.length + ' ITEM' + (womItems.length !== 1 ? 'S' : '');
}

function saveWOMItems() {
    localStorage.setItem('wom_items', JSON.stringify(womItems));
}

function onWOMWinnerSelected(winner, segmentIndex) {
    if (winner === undefined || winner === null) return;
    womLastWinner = segmentIndex;

    const rc = document.getElementById('womResultCard');
    const rt = document.getElementById('womResultText');
    if (rc) rc.style.display = 'block';
    if (rt) rt.textContent = winner;

    const modal = document.getElementById('womWinnerModal');
    const modalText = document.getElementById('womWinnerText');
    if (modal && modalText) {
        modalText.textContent = winner;
        modal.style.display = 'flex';
    }
}

window.loadWomPreset = function(presetKey) {
    const preset = WOM_PRESETS[presetKey];
    if (!preset) return;
    if (womItems.length > 0 && !confirm('Replace current fates with "' + presetKey + '" preset?')) return;
    womItems = [...preset];
    saveWOMItems();
    renderWOMItems();
    updateWOMCount();
    if (womWheel) womWheel.setItems(womItems);
    const rc = document.getElementById('womResultCard');
    if (rc) rc.style.display = 'none';
    womLastWinner = null;
    showNotice('\uD83C\uDFAD "' + presetKey + '" preset loaded with ' + preset.length + ' fates!');
    if (window.arcadeSound) window.arcadeSound.click();
};

// Init after DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWOM);
} else {
    setTimeout(initWOM, 0);
}

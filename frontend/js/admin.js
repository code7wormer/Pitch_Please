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

// Round 2 Tab elements
const promotionCountBadge = document.getElementById('promotionCountBadge');
const promotedCountNum = document.getElementById('promotedCountNum');
const btnLockPromotedTeams = document.getElementById('btnLockPromotedTeams');
const btnRefreshR2Teams = document.getElementById('btnRefreshR2Teams');
const r2PromotionTableBody = document.getElementById('r2PromotionTableBody');

const selectTeamA = document.getElementById('selectTeamA');
const selectTeamB = document.getElementById('selectTeamB');
const btnRollFirstPitcher = document.getElementById('btnRollFirstPitcher');
const firstPitcherAnnouncement = document.getElementById('firstPitcherAnnouncement');
const btnLockInBattle = document.getElementById('btnLockInBattle');

const projectorBattleArena = document.getElementById('projectorBattleArena');
const battleArenaCanvas = document.getElementById('battleArenaCanvas');
const battleBgVideo = document.getElementById('battleBgVideo');
const arenaLiveStatusBadge = document.getElementById('arenaLiveStatusBadge');

const stageStep1 = document.getElementById('stageStep1');
const stageStep2 = document.getElementById('stageStep2');
const stageStep3 = document.getElementById('stageStep3');
const stageStep4 = document.getElementById('stageStep4');

const fighterCardA = document.getElementById('fighterCardA');
const fighterCardB = document.getElementById('fighterCardB');
const arenaTeamAName = document.getElementById('arenaTeamAName');
const arenaTeamBName = document.getElementById('arenaTeamBName');
const arenaTeamAStatus = document.getElementById('arenaTeamAStatus');
const arenaTeamBStatus = document.getElementById('arenaTeamBStatus');
const arenaVotesDisplayA = document.getElementById('arenaVotesDisplayA');
const arenaVotesDisplayB = document.getElementById('arenaVotesDisplayB');
const arenaCountdownTimer = document.getElementById('arenaCountdownTimer');
const arenaSubstatusText = document.getElementById('arenaSubstatusText');

const meterFillA = document.getElementById('meterFillA');
const meterFillB = document.getElementById('meterFillB');

const controlsPitch1 = document.getElementById('controlsPitch1');
const controlsPitch2 = document.getElementById('controlsPitch2');
const controlsOpenVoting = document.getElementById('controlsOpenVoting');
const controlsVotingLive = document.getElementById('controlsVotingLive');
const controlsJudgement = document.getElementById('controlsJudgement');

const pitch1SpeakerName = document.getElementById('pitch1SpeakerName');
const pitch2SpeakerName = document.getElementById('pitch2SpeakerName');
const btnFinishPitch1 = document.getElementById('btnFinishPitch1');
const btnFinishPitch2 = document.getElementById('btnFinishPitch2');

const selectBattleDuration = document.getElementById('selectBattleDuration');
const btnOpenVotingNow = document.getElementById('btnOpenVotingNow');
const btnExtendBattleTimer = document.getElementById('btnExtendBattleTimer');
const btnEndBattleVoting = document.getElementById('btnEndBattleVoting');

const judgeInputNameA = document.getElementById('judgeInputNameA');
const judgeInputNameB = document.getElementById('judgeInputNameB');
const calcAudScoreA = document.getElementById('calcAudScoreA');
const calcAudScoreB = document.getElementById('calcAudScoreB');
const weightAudA = document.getElementById('weightAudA');
const weightAudB = document.getElementById('weightAudB');
const inputJudgeA = document.getElementById('inputJudgeA');
const inputJudgeB = document.getElementById('inputJudgeB');
const calcFinalA = document.getElementById('calcFinalA');
const calcFinalB = document.getElementById('calcFinalB');
const btnDeclareWinner = document.getElementById('btnDeclareWinner');

const arenaWinnerSpotlight = document.getElementById('arenaWinnerSpotlight');
const winnerTeamBanner = document.getElementById('winnerTeamBanner');
const winnerScoreSummary = document.getElementById('winnerScoreSummary');
const btnResetBattleArena = document.getElementById('btnResetBattleArena');

const inputBattleVideoUrl = document.getElementById('inputBattleVideoUrl');
const btnApplyBattleVideo = document.getElementById('btnApplyBattleVideo');
const btnToggleVideoVsCanvas = document.getElementById('btnToggleVideoVsCanvas');
const btnCopyGeminiPrompt = document.getElementById('btnCopyGeminiPrompt');
const geminiVideoPromptText = document.getElementById('geminiVideoPromptText');

// Round 2 State
let r2PromotedIds = new Set();
let r2SelectedFirstPitcherId = null;
let currentRound2Battle = null;
let r2BattleCountdownInterval = null;
let battleCanvasAnimId = null;

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

    // Round 2 Promotion & Battles
    if (btnRefreshR2Teams) btnRefreshR2Teams.addEventListener('click', loadRound2PromotionTeams);
    if (btnLockPromotedTeams) btnLockPromotedTeams.addEventListener('click', handleLockPromotedTeams);

    if (selectTeamA) selectTeamA.addEventListener('change', updateMatchmakerPreviews);
    if (selectTeamB) selectTeamB.addEventListener('change', updateMatchmakerPreviews);
    if (btnRollFirstPitcher) btnRollFirstPitcher.addEventListener('click', rollRandomFirstPitcher);
    if (btnLockInBattle) btnLockInBattle.addEventListener('click', handleLockInBattle);

    if (btnFinishPitch1) btnFinishPitch1.addEventListener('click', () => advanceBattleStage('pitch2'));
    if (btnFinishPitch2) btnFinishPitch2.addEventListener('click', () => advanceBattleStage('voting_ready'));
    if (btnOpenVotingNow) btnOpenVotingNow.addEventListener('click', handleOpenBattleVoting);
    if (btnExtendBattleTimer) btnExtendBattleTimer.addEventListener('click', handleExtendBattleTimer);
    if (btnEndBattleVoting) btnEndBattleVoting.addEventListener('click', handleEndBattleVoting);

    if (inputJudgeA) inputJudgeA.addEventListener('input', calculateLiveJudgement);
    if (inputJudgeB) inputJudgeB.addEventListener('input', calculateLiveJudgement);
    if (btnDeclareWinner) btnDeclareWinner.addEventListener('click', handleDeclareWinner);
    if (btnResetBattleArena) btnResetBattleArena.addEventListener('click', resetBattleArena);

    if (btnCopyGeminiPrompt) btnCopyGeminiPrompt.addEventListener('click', copyGeminiPrompt);
    if (btnApplyBattleVideo) btnApplyBattleVideo.addEventListener('click', applyBattleVideo);
    if (btnToggleVideoVsCanvas) btnToggleVideoVsCanvas.addEventListener('click', toggleVideoVsCanvas);
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
    if (tabId === 'tabRound2') {
        loadRound2PromotionTeams();
        syncCurrentRound2Battle();
        initBattleCanvas();
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

function initAdminWebSocket() {
    if (adminWs) {
        try { adminWs.close(); } catch (e) {}
    }
    const wsUrl = `${WS_BASE}/ws/admin`;
    adminWs = new WebSocket(wsUrl);

    adminWs.onopen = () => {
        if (adminConnDot) adminConnDot.classList.remove('offline');
        if (adminWsStatus) adminWsStatus.textContent = 'ONLINE';
        adminWs._ping = setInterval(() => {
            if (adminWs.readyState === WebSocket.OPEN) adminWs.send('ping');
        }, 20000);
    };

    adminWs.onclose = () => {
        if (adminConnDot) adminConnDot.classList.add('offline');
        if (adminWsStatus) adminWsStatus.textContent = 'OFFLINE';
        if (adminWs._ping) clearInterval(adminWs._ping);
        setTimeout(() => {
            if (adminKey) initAdminWebSocket();
        }, 3000);
    };

    adminWs.onerror = () => {
        if (adminConnDot) adminConnDot.classList.add('offline');
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
            if (activePoll && activePoll.id === msg.poll_id) {
                if (liveVoteCount) liveVoteCount.textContent = msg.total_votes;
            }
            if (currentRound2Battle && currentRound2Battle.id === msg.poll_id) {
                updateRound2VoteMeters(msg.votes_team_a, msg.votes_team_b, msg.total_votes);
            }
            break;
        case 'teams_updated':
            fetchTeams();
            loadRound2PromotionTeams();
            break;
        case 'results_updated':
            fetchResults();
            break;
        case 'round2_battle_locked':
        case 'round2_stage_updated':
        case 'round2_voting_started':
        case 'round2_voting_ended':
        case 'round2_winner_declared':
            syncCurrentRound2Battle();
            break;
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


// =========================================================================
// ROUND 2: PROMOTION, MATCHMAKER & 1v1 BATTLE ENGINE
// =========================================================================

async function loadRound2PromotionTeams() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/round2/teams`, {
            headers: { 'x-admin-key': adminKey }
        });
        if (!res.ok) throw new Error('Failed to load Round 2 teams');
        const teams = await res.json();

        r2PromotedIds.clear();
        teams.forEach(t => {
            if (t.is_promoted) r2PromotedIds.add(t.id);
        });

        renderRound2PromotionTable(teams);
        updatePromotedCountBadge();
        updateRound2MatchmakerDropdowns(teams.filter(t => r2PromotedIds.has(t.id)));
    } catch (e) {
        showNotice(e.message, true);
    }
}

function renderRound2PromotionTable(teams) {
    if (!teams || teams.length === 0) {
        r2PromotionTableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">
                    No teams available for Round 2.
                </td>
            </tr>
        `;
        return;
    }

    r2PromotionTableBody.innerHTML = teams.map(t => {
        const isChecked = r2PromotedIds.has(t.id);
        return `
            <tr style="${isChecked ? 'background: rgba(0, 255, 102, 0.04);' : ''}">
                <td style="text-align: center;">
                    <input 
                        type="checkbox" 
                        class="checkbox-consider" 
                        data-team-id="${t.id}"
                        ${isChecked ? 'checked' : ''}
                        onchange="toggleR2PromoteTeam(${t.id}, this.checked)"
                    >
                </td>
                <td>
                    <strong style="color: #fff; font-size: 14px;">${escapeHtml(t.name)}</strong>
                    <span style="font-size: 11px; color: var(--text-muted); margin-left: 6px;">#${t.code}</span>
                </td>
                <td style="text-align: center; font-family: var(--font-pixel); font-size: 12px; color: var(--neon-cyan);">
                    ${t.round1_avg ? t.round1_avg.toFixed(2) : '0.00'} / 10
                </td>
                <td style="text-align: right;">
                    <span class="round2-promotion-badge ${isChecked ? 'valid' : 'invalid'}" style="font-size: 9px;">
                        ${isChecked ? '⭐ PROMOTED' : 'UNSELECTED'}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

window.toggleR2PromoteTeam = function(teamId, isChecked) {
    if (isChecked) {
        r2PromotedIds.add(teamId);
    } else {
        r2PromotedIds.delete(teamId);
    }
    updatePromotedCountBadge();
    loadRound2PromotionTeams();
};

function updatePromotedCountBadge() {
    const count = r2PromotedIds.size;
    promotedCountNum.textContent = count;
    const isEven = (count >= 2 && count % 2 === 0);

    if (isEven) {
        promotionCountBadge.className = 'round2-promotion-badge valid';
        promotionCountBadge.innerHTML = `SELECTED: <span id="promotedCountNum">${count}</span> (VALID EVEN NUMBER) ✅`;
        btnLockPromotedTeams.disabled = false;
        btnLockPromotedTeams.style.opacity = '1';
    } else {
        promotionCountBadge.className = 'round2-promotion-badge invalid';
        promotionCountBadge.innerHTML = `SELECTED: <span id="promotedCountNum">${count}</span> (EVEN NUMBER REQUIRED) ⚠️`;
        btnLockPromotedTeams.disabled = (count === 0);
        btnLockPromotedTeams.style.opacity = isEven ? '1' : '0.7';
    }
}

async function handleLockPromotedTeams() {
    const count = r2PromotedIds.size;
    if (count < 2 || count % 2 !== 0) {
        showNotice(`⚠️ Exactly an even number of teams is required (Selected: ${count}). Please select 2, 4, 6, 8... teams.`, true);
        return;
    }

    btnLockPromotedTeams.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/api/admin/round2/promote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': adminKey
            },
            body: JSON.stringify({ team_ids: Array.from(r2PromotedIds) })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to lock promoted teams');

        showNotice(`🔒 Successfully locked ${count} teams for Round 2 battles!`);
        if (window.arcadeSound) window.arcadeSound.gameStart();
        await loadRound2PromotionTeams();
    } catch (e) {
        showNotice(e.message, true);
    } finally {
        btnLockPromotedTeams.disabled = false;
    }
}

function updateRound2MatchmakerDropdowns(promotedTeams) {
    const currentA = selectTeamA.value;
    const currentB = selectTeamB.value;

    selectTeamA.innerHTML = '<option value="">-- Select Team A --</option>' + 
        promotedTeams.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (#${t.code})</option>`).join('');

    selectTeamB.innerHTML = '<option value="">-- Select Team B --</option>' + 
        promotedTeams.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (#${t.code})</option>`).join('');

    if (currentA) selectTeamA.value = currentA;
    if (currentB) selectTeamB.value = currentB;

    updateMatchmakerPreviews();
}

function updateMatchmakerPreviews() {
    const teamAId = parseInt(selectTeamA.value, 10);
    const teamBId = parseInt(selectTeamB.value, 10);

    const teamA = allTeams.find(t => t.id === teamAId);
    const teamB = allTeams.find(t => t.id === teamBId);

    if (teamAId && teamBId && teamAId === teamBId) {
        showNotice('⚠️ You cannot match a team against itself!', true);
        selectTeamB.value = '';
        return;
    }

    if (teamA) arenaTeamAName.textContent = teamA.name;
    else arenaTeamAName.textContent = 'SELECT TEAM A';

    if (teamB) arenaTeamBName.textContent = teamB.name;
    else arenaTeamBName.textContent = 'SELECT TEAM B';

    r2SelectedFirstPitcherId = null;
    firstPitcherAnnouncement.textContent = 'CLICK RANDOM SELECTOR TO DECIDE WHO TAKES THE STAGE FIRST';
    firstPitcherAnnouncement.style.color = 'var(--neon-yellow)';
}

function rollRandomFirstPitcher() {
    const teamAId = parseInt(selectTeamA.value, 10);
    const teamBId = parseInt(selectTeamB.value, 10);

    if (!teamAId || !teamBId) {
        showNotice('Please select both Team A and Team B before rolling!', true);
        return;
    }

    const teamA = allTeams.find(t => t.id === teamAId);
    const teamB = allTeams.find(t => t.id === teamBId);
    if (!teamA || !teamB) return;

    btnRollFirstPitcher.disabled = true;
    let ticks = 0;
    const maxTicks = 18;

    const rollInterval = setInterval(() => {
        ticks++;
        const isA = (ticks % 2 === 0);
        firstPitcherAnnouncement.textContent = `ROLLING... 👉 ${isA ? teamA.name : teamB.name}`;
        if (window.arcadeSound) window.arcadeSound.countdownTick();

        if (ticks >= maxTicks) {
            clearInterval(rollInterval);
            const winner = (Math.random() < 0.5) ? teamA : teamB;
            r2SelectedFirstPitcherId = winner.id;
            firstPitcherAnnouncement.textContent = `🎤 ${winner.name.toUpperCase()} PITCHES FIRST!`;
            firstPitcherAnnouncement.style.color = 'var(--neon-green)';
            if (window.arcadeSound) window.arcadeSound.winnerFanfare();
            btnRollFirstPitcher.disabled = false;
        }
    }, 100);
}

async function handleLockInBattle() {
    const teamAId = parseInt(selectTeamA.value, 10);
    const teamBId = parseInt(selectTeamB.value, 10);

    if (!teamAId || !teamBId) {
        showNotice('Please select both Team A and Team B for the battle!', true);
        return;
    }

    if (!r2SelectedFirstPitcherId) {
        r2SelectedFirstPitcherId = teamAId; // default fallback if unrolled
    }

    btnLockInBattle.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/api/admin/round2/battle/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': adminKey
            },
            body: JSON.stringify({
                team_a_id: teamAId,
                team_b_id: teamBId,
                first_pitcher_id: r2SelectedFirstPitcherId
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to start battle');

        currentRound2Battle = data;
        showNotice(`⚔️ 1v1 Battle locked between ${data.team_a.name} and ${data.team_b.name}!`);
        if (window.arcadeSound) window.arcadeSound.gameStart();

        applyRound2BattleUI(data);
        projectorBattleArena.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
        showNotice(e.message, true);
    } finally {
        btnLockInBattle.disabled = false;
    }
}

function applyRound2BattleUI(battle) {
    currentRound2Battle = battle;
    arenaLiveStatusBadge.textContent = '1v1 BATTLE IN PROGRESS';
    arenaLiveStatusBadge.style.color = 'var(--neon-green)';
    arenaLiveStatusBadge.style.borderColor = 'var(--neon-green)';

    arenaTeamAName.textContent = battle.team_a.name;
    arenaTeamBName.textContent = battle.team_b.name;

    const firstPitcherId = battle.first_pitcher_id || battle.team_a.id;
    const isFirstPitcherA = (firstPitcherId === battle.team_a.id);

    const firstPitcherName = isFirstPitcherA ? battle.team_a.name : battle.team_b.name;
    const secondPitcherName = isFirstPitcherA ? battle.team_b.name : battle.team_a.name;

    // Reset breadcrumb steps
    [stageStep1, stageStep2, stageStep3, stageStep4].forEach(s => s.className = 'stage-step');
    [controlsPitch1, controlsPitch2, controlsOpenVoting, controlsVotingLive, controlsJudgement, arenaWinnerSpotlight].forEach(c => c.style.display = 'none');

    // Stage progression
    const stage = battle.pitch_stage || 'pitch1';

    if (stage === 'pitch1') {
        stageStep1.className = 'stage-step active';
        controlsPitch1.style.display = 'flex';
        pitch1SpeakerName.textContent = firstPitcherName;

        fighterCardA.className = isFirstPitcherA ? 'fighter-card team-a active-pitcher' : 'fighter-card team-a';
        fighterCardB.className = !isFirstPitcherA ? 'fighter-card team-b active-pitcher' : 'fighter-card team-b';

        arenaTeamAStatus.textContent = isFirstPitcherA ? '🎤 PITCHING FIRST' : 'WAITING FOR TURN';
        arenaTeamBStatus.textContent = !isFirstPitcherA ? '🎤 PITCHING FIRST' : 'WAITING FOR TURN';
        arenaSubstatusText.textContent = `${firstPitcherName} is pitching on stage`;
    } else if (stage === 'pitch2') {
        stageStep1.className = 'stage-step completed';
        stageStep2.className = 'stage-step active';
        controlsPitch2.style.display = 'flex';
        pitch2SpeakerName.textContent = secondPitcherName;

        fighterCardA.className = !isFirstPitcherA ? 'fighter-card team-a active-pitcher' : 'fighter-card team-a';
        fighterCardB.className = isFirstPitcherA ? 'fighter-card team-b active-pitcher' : 'fighter-card team-b';

        arenaTeamAStatus.textContent = !isFirstPitcherA ? '🎤 PITCHING NOW' : 'PITCH FINISHED';
        arenaTeamBStatus.textContent = isFirstPitcherA ? '🎤 PITCHING NOW' : 'PITCH FINISHED';
        arenaSubstatusText.textContent = `${secondPitcherName} is pitching on stage`;
    } else if (stage === 'voting_ready') {
        stageStep1.className = 'stage-step completed';
        stageStep2.className = 'stage-step completed';
        stageStep3.className = 'stage-step active';
        controlsOpenVoting.style.display = 'flex';

        fighterCardA.className = 'fighter-card team-a';
        fighterCardB.className = 'fighter-card team-b';

        arenaTeamAStatus.textContent = 'PITCH FINISHED';
        arenaTeamBStatus.textContent = 'PITCH FINISHED';
        arenaSubstatusText.textContent = 'Both pitches complete! Ready for audience vote.';
    } else if (stage === 'voting_live' || battle.is_active) {
        stageStep1.className = 'stage-step completed';
        stageStep2.className = 'stage-step completed';
        stageStep3.className = 'stage-step active';
        controlsVotingLive.style.display = 'flex';

        arenaTeamAStatus.textContent = 'VOTING LIVE';
        arenaTeamBStatus.textContent = 'VOTING LIVE';
        arenaSubstatusText.textContent = 'Audience voting in progress';

        if (battle.ends_at) {
            startBattleCountdown(battle.ends_at);
        }
    } else if (stage === 'voting_ended' || stage === 'finalized') {
        stageStep1.className = 'stage-step completed';
        stageStep2.className = 'stage-step completed';
        stageStep3.className = 'stage-step completed';
        stageStep4.className = 'stage-step active';
        controlsJudgement.style.display = 'block';

        judgeInputNameA.textContent = battle.team_a.name;
        judgeInputNameB.textContent = battle.team_b.name;

        arenaTeamAStatus.textContent = 'VOTING CLOSED';
        arenaTeamBStatus.textContent = 'VOTING CLOSED';
        arenaSubstatusText.textContent = 'Enter Judge score to crown winner';

        calculateLiveJudgement();
    }
}

async function advanceBattleStage(newStage) {
    if (!currentRound2Battle) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/round2/battle/stage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': adminKey
            },
            body: JSON.stringify({
                poll_id: currentRound2Battle.id || currentRound2Battle.poll_id,
                stage: newStage
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to advance stage');

        currentRound2Battle.pitch_stage = newStage;
        applyRound2BattleUI(currentRound2Battle);
        if (window.arcadeSound) window.arcadeSound.buttonClick();
    } catch (e) {
        showNotice(e.message, true);
    }
}

async function handleOpenBattleVoting() {
    if (!currentRound2Battle) return;
    const duration = parseInt(selectBattleDuration.value, 10) || 60;

    btnOpenVotingNow.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/api/admin/round2/battle/open_voting`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': adminKey
            },
            body: JSON.stringify({
                poll_id: currentRound2Battle.id || currentRound2Battle.poll_id,
                duration_secs: duration
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to open voting');

        showNotice(`🚀 1v1 Audience voting open for ${duration}s!`);
        if (window.arcadeSound) window.arcadeSound.countdownTick();

        currentRound2Battle.pitch_stage = 'voting_live';
        currentRound2Battle.is_active = true;
        currentRound2Battle.ends_at = data.ends_at;

        applyRound2BattleUI(currentRound2Battle);
    } catch (e) {
        showNotice(e.message, true);
    } finally {
        btnOpenVotingNow.disabled = false;
    }
}

async function handleExtendBattleTimer() {
    btnExtendBattleTimer.disabled = true;
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
        if (!res.ok) throw new Error(data.detail || 'Failed to extend battle timer');

        showNotice('⏳ 1v1 Battle poll extended by +15s!');
        if (window.arcadeSound) window.arcadeSound.countdownTick();
        if (currentRound2Battle) {
            currentRound2Battle.ends_at = data.ends_at;
            startBattleCountdown(data.ends_at);
        }
    } catch (e) {
        showNotice(e.message, true);
    } finally {
        btnExtendBattleTimer.disabled = false;
    }
}

async function handleEndBattleVoting() {
    btnEndBattleVoting.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/api/admin/round2/battle/end`, {
            method: 'POST',
            headers: { 'x-admin-key': adminKey }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to end voting');

        showNotice(`🛑 Voting concluded! Total audience votes: ${data.total_votes}`);
        if (window.arcadeSound) window.arcadeSound.winnerFanfare();

        if (currentRound2Battle) {
            currentRound2Battle.pitch_stage = 'voting_ended';
            currentRound2Battle.is_active = false;
            currentRound2Battle.votes_team_a = data.team_a.votes;
            currentRound2Battle.votes_team_b = data.team_b.votes;
            currentRound2Battle.total_votes = data.total_votes;
            applyRound2BattleUI(currentRound2Battle);
            updateRound2VoteMeters(data.team_a.votes, data.team_b.votes, data.total_votes);
        }
    } catch (e) {
        showNotice(e.message, true);
    } finally {
        btnEndBattleVoting.disabled = false;
    }
}

function startBattleCountdown(endsAtIso) {
    if (r2BattleCountdownInterval) clearInterval(r2BattleCountdownInterval);
    const target = new Date(endsAtIso).getTime();

    function update() {
        const now = Date.now();
        const diff = Math.max(0, target - now);
        const totalSecs = Math.ceil(diff / 1000);

        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        arenaCountdownTimer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        if (diff <= 0) {
            clearInterval(r2BattleCountdownInterval);
            r2BattleCountdownInterval = null;
            arenaCountdownTimer.textContent = '00:00';
            arenaSubstatusText.textContent = "Time's up! You can extend (+15s) or end voting.";
        }
    }

    update();
    r2BattleCountdownInterval = setInterval(update, 1000);
}

function updateRound2VoteMeters(votesA = 0, votesB = 0, total = 0) {
    if (!currentRound2Battle) return;

    currentRound2Battle.votes_team_a = votesA;
    currentRound2Battle.votes_team_b = votesB;
    currentRound2Battle.total_votes = total;

    const pctA = total > 0 ? Math.round((votesA / total) * 100) : 50;
    const pctB = 100 - pctA;

    arenaVotesDisplayA.textContent = `${votesA} VOTES (${pctA}%)`;
    arenaVotesDisplayB.textContent = `${votesB} VOTES (${pctB}%)`;

    meterFillA.style.width = `${pctA}%`;
    meterFillA.textContent = `${currentRound2Battle.team_a.name}: ${votesA} (${pctA}%)`;

    meterFillB.style.width = `${pctB}%`;
    meterFillB.textContent = `${currentRound2Battle.team_b.name}: ${votesB} (${pctB}%)`;

    calculateLiveJudgement();
}

function calculateLiveJudgement() {
    if (!currentRound2Battle) return;

    const votesA = currentRound2Battle.votes_team_a || 0;
    const votesB = currentRound2Battle.votes_team_b || 0;
    const total = (currentRound2Battle.total_votes !== undefined) ? currentRound2Battle.total_votes : (votesA + votesB);

    const audScoreA = total > 0 ? (votesA / total) * 10 : 0.0;
    const audScoreB = total > 0 ? (votesB / total) * 10 : 0.0;

    const judgeA = parseFloat(inputJudgeA.value) || 0.0;
    const judgeB = parseFloat(inputJudgeB.value) || 0.0;

    // 40% Audience Weightage + 60% Judge Weightage
    const audWeightedA = audScoreA * 0.40;
    const audWeightedB = audScoreB * 0.40;

    const judgeWeightedA = judgeA * 0.60;
    const judgeWeightedB = judgeB * 0.60;

    const finalA = (audWeightedA + judgeWeightedA).toFixed(2);
    const finalB = (audWeightedB + judgeWeightedB).toFixed(2);

    calcAudScoreA.textContent = `${audScoreA.toFixed(2)} / 10`;
    calcAudScoreB.textContent = `${audScoreB.toFixed(2)} / 10`;

    weightAudA.textContent = audWeightedA.toFixed(2);
    weightAudB.textContent = audWeightedB.toFixed(2);

    calcFinalA.textContent = `FINAL SCORE: ${finalA} / 10`;
    calcFinalB.textContent = `FINAL SCORE: ${finalB} / 10`;
}

async function handleDeclareWinner() {
    if (!currentRound2Battle) return;

    const judgeA = parseFloat(inputJudgeA.value);
    const judgeB = parseFloat(inputJudgeB.value);

    if (isNaN(judgeA) || isNaN(judgeB) || judgeA < 0 || judgeA > 10 || judgeB < 0 || judgeB > 10) {
        showNotice("Please enter valid Judge's scores between 0 and 10 for both teams.", true);
        return;
    }

    btnDeclareWinner.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/api/admin/round2/battle/finalize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': adminKey
            },
            body: JSON.stringify({
                poll_id: currentRound2Battle.id || currentRound2Battle.poll_id,
                judge_score_a: judgeA,
                judge_score_b: judgeB
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to finalize battle');

        showNotice(`👑 1v1 Battle Winner: ${data.winner.name}!`);
        if (window.arcadeSound) window.arcadeSound.winnerFanfare();

        // Display winner spotlight
        arenaWinnerSpotlight.style.display = 'block';
        winnerTeamBanner.textContent = data.winner.name;
        winnerScoreSummary.textContent = `${data.team_a.name} (${data.team_a.final_score}) vs ${data.team_b.name} (${data.team_b.final_score})`;
        arenaWinnerSpotlight.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
        showNotice(e.message, true);
    } finally {
        btnDeclareWinner.disabled = false;
    }
}

function resetBattleArena() {
    currentRound2Battle = null;
    arenaWinnerSpotlight.style.display = 'none';
    selectTeamA.value = '';
    selectTeamB.value = '';
    updateMatchmakerPreviews();
    applyRound2BattleUI({
        team_a: { name: 'SELECT TEAM A' },
        team_b: { name: 'SELECT TEAM B' },
        pitch_stage: 'pitch1'
    });
    arenaLiveStatusBadge.textContent = 'READY FOR NEXT BATTLE';
}

async function syncCurrentRound2Battle() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/round2/battle/current`, {
            headers: { 'x-admin-key': adminKey }
        });
        const data = await res.json();
        if (data.battle) {
            currentRound2Battle = data.battle;
            applyRound2BattleUI(data.battle);
            updateRound2VoteMeters(data.battle.votes_team_a, data.battle.votes_team_b, data.battle.total_votes);
        }
    } catch (e) {}
}

// Background Canvas Animation (High-energy Synthwave Grid & Lightning)
function initBattleCanvas() {
    if (!battleArenaCanvas) return;
    const canvas = battleArenaCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = canvas.parentElement.offsetWidth || 800;
    let height = canvas.height = canvas.parentElement.offsetHeight || 400;

    window.addEventListener('resize', () => {
        if (canvas.parentElement) {
            width = canvas.width = canvas.parentElement.offsetWidth || 800;
            height = canvas.height = canvas.parentElement.offsetHeight || 400;
        }
    });

    let gridOffset = 0;
    const sparks = [];

    for (let i = 0; i < 40; i++) {
        sparks.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            size: Math.random() * 2.5 + 1,
            color: Math.random() > 0.5 ? '#00e5ff' : '#ff0055'
        });
    }

    function render() {
        ctx.fillStyle = '#020308';
        ctx.fillRect(0, 0, width, height);

        // Perspective Synthwave Grid Horizon
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.18)';
        ctx.lineWidth = 1;

        const horizonY = height * 0.45;
        const numLines = 14;

        // Vertical converging lines
        for (let i = -numLines; i <= numLines; i++) {
            const xBottom = width / 2 + i * 50;
            ctx.beginPath();
            ctx.moveTo(width / 2 + i * 8, horizonY);
            ctx.lineTo(xBottom, height);
            ctx.stroke();
        }

        // Horizontal moving lines
        gridOffset = (gridOffset + 0.8) % 30;
        for (let y = horizonY; y < height; y += (y - horizonY + 15) * 0.35) {
            const lineY = y + gridOffset * ((y - horizonY) / height);
            if (lineY <= height) {
                ctx.beginPath();
                ctx.moveTo(0, lineY);
                ctx.lineTo(width, lineY);
                ctx.stroke();
            }
        }

        // Cyber energy sparks
        sparks.forEach(s => {
            s.x += s.vx;
            s.y += s.vy;
            if (s.x < 0) s.x = width;
            if (s.x > width) s.x = 0;
            if (s.y < 0) s.y = height;
            if (s.y > height) s.y = 0;

            ctx.fillStyle = s.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        // Periodic Electric Lightning Arcs in Center
        if (Math.random() < 0.15) {
            ctx.strokeStyle = Math.random() > 0.5 ? '#ffe600' : '#00ff66';
            ctx.lineWidth = 2;
            ctx.shadowBlur = 15;
            ctx.shadowColor = ctx.strokeStyle;
            ctx.beginPath();
            let curX = width / 2 + (Math.random() - 0.5) * 60;
            let curY = horizonY - 40;
            ctx.moveTo(curX, curY);
            for (let j = 0; j < 5; j++) {
                curX += (Math.random() - 0.5) * 40;
                curY += 25;
                ctx.lineTo(curX, curY);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        battleCanvasAnimId = requestAnimationFrame(render);
    }

    if (battleCanvasAnimId) cancelAnimationFrame(battleCanvasAnimId);
    render();
}

function copyGeminiPrompt() {
    if (!geminiVideoPromptText) return;
    navigator.clipboard.writeText(geminiVideoPromptText.value).then(() => {
        showNotice('📋 Gemini Video prompt copied to clipboard!');
        btnCopyGeminiPrompt.textContent = '✅ COPIED!';
        setTimeout(() => {
            btnCopyGeminiPrompt.textContent = '📋 COPY PROMPT';
        }, 2500);
    }).catch(() => {
        geminiVideoPromptText.select();
        document.execCommand('copy');
        showNotice('📋 Gemini Video prompt copied!');
    });
}

function applyBattleVideo() {
    const url = inputBattleVideoUrl.value.trim();
    if (!url) return;

    battleBgVideo.src = url;
    battleBgVideo.style.display = 'block';
    battleArenaCanvas.style.opacity = '0.35'; // overlay subtle cyber sparks over video
    battleBgVideo.play().catch(e => {
        showNotice('Could not autoplay video. Please ensure video path is correct.', true);
    });
    showNotice(`🎬 Battle background video applied: ${url}`);
}

function toggleVideoVsCanvas() {
    if (battleBgVideo.style.display === 'none') {
        battleBgVideo.style.display = 'block';
        battleArenaCanvas.style.opacity = '0.35';
        battleBgVideo.play().catch(e => {});
        showNotice('Video background enabled');
    } else {
        battleBgVideo.style.display = 'none';
        battleArenaCanvas.style.opacity = '0.85';
        showNotice('Procedural canvas background enabled');
    }
}



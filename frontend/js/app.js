// Team Device Logic for Pitch Please!

// Dynamic backend API URL configuration
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

const API_BASE = getApiBaseUrl();
const WS_BASE = API_BASE.replace(/^http/, 'ws');

// State
let currentTeam = null;
let currentPoll = null;
let selectedScore = null;
let timerInterval = null;
let teamWs = null;

// DOM Elements
const viewLogin = document.getElementById('viewLogin');
const viewTeam = document.getElementById('viewTeam');
const teamCodeInput = document.getElementById('teamCodeInput');
const btnSubmitLogin = document.getElementById('btnSubmitLogin');
const loginError = document.getElementById('loginError');

const displayTeamName = document.getElementById('displayTeamName');
const displayTeamCode = document.getElementById('displayTeamCode');
const teamConnDot = document.getElementById('teamConnDot');
const btnLogout = document.getElementById('btnLogout');
const teamErrorBanner = document.getElementById('teamErrorBanner');

const stateWaiting = document.getElementById('stateWaiting');
const statePitchingNotice = document.getElementById('statePitchingNotice');
const stateVoting = document.getElementById('stateVoting');
const stateLocked = document.getElementById('stateLocked');

const pollCountdown = document.getElementById('pollCountdown');
const pitchingTeamName = document.getElementById('pitchingTeamName');
const scoreBtns = document.querySelectorAll('.score-btn');
const scoreDescriptor = document.getElementById('scoreDescriptor');
const btnSubmitVote = document.getElementById('btnSubmitVote');
const lockedScoreDisplay = document.getElementById('lockedScoreDisplay');

const SCORE_LABELS = {
    1: '1/10 — NEEDS MAJOR WORK ❌',
    2: '2/10 — ROUGH PROTOTYPE ⚠️',
    3: '3/10 — UNCLEAR HOOK 🤔',
    4: '4/10 — BASIC CONCEPT 📦',
    5: '5/10 — AVERAGE PITCH ⚖️',
    6: '6/10 — SOLID MECHANICS 🕹️',
    7: '7/10 — VERY PROMISING! ✨',
    8: '8/10 — AWESOME GAMEPLAY! 🚀',
    9: '9/10 — INCREDIBLE PITCH! 🔥',
    10: '10/10 — ABSOLUTE MASTERPIECE! 🏆'
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    checkSavedSession();
    bindEvents();
});

function bindEvents() {
    // Only numbers in code input
    teamCodeInput.addEventListener('input', (e) => {
        teamCodeInput.value = teamCodeInput.value.replace(/[^0-9]/g, '');
        loginError.style.display = 'none';
        if (teamCodeInput.value.length === 6) {
            handleLogin();
        }
    });

    teamCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    btnSubmitLogin.addEventListener('click', handleLogin);
    btnLogout.addEventListener('click', handleLogout);

    // Score selection
    scoreBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.arcadeSound) window.arcadeSound.click();
            const score = parseInt(btn.dataset.score, 10);
            selectScore(score);
        });
    });

    btnSubmitVote.addEventListener('click', submitVote);
}

function checkSavedSession() {
    const saved = localStorage.getItem('pitch_team_session');
    if (saved) {
        try {
            currentTeam = JSON.parse(saved);
            showTeamView();
            initTeamWebSocket();
            syncCurrentPoll();
            return;
        } catch (e) {
            localStorage.removeItem('pitch_team_session');
        }
    }
    showLoginView();
}

async function handleLogin() {
    const code = teamCodeInput.value.trim();
    if (code.length !== 6) {
        showLoginError('Please enter a full 6-digit team code.');
        if (window.arcadeSound) window.arcadeSound.errorBuzz();
        return;
    }

    btnSubmitLogin.disabled = true;
    btnSubmitLogin.innerText = 'AUTHENTICATING...';

    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || 'Invalid code.');
        }

        currentTeam = data;
        localStorage.setItem('pitch_team_session', JSON.stringify(currentTeam));
        if (window.arcadeSound) window.arcadeSound.voteSuccess();
        showTeamView();
        initTeamWebSocket();
        syncCurrentPoll();
    } catch (err) {
        showLoginError(err.message);
        if (window.arcadeSound) window.arcadeSound.errorBuzz();
    } finally {
        btnSubmitLogin.disabled = false;
        btnSubmitLogin.innerHTML = '<span>START PLAYING</span> &gt;';
    }
}

function handleLogout() {
    if (confirm('Exit this team session? You can log back in anytime with your 6-digit code.')) {
        if (teamWs) teamWs.close();
        if (timerInterval) clearInterval(timerInterval);
        localStorage.removeItem('pitch_team_session');
        currentTeam = null;
        showLoginView();
    }
}

function showLoginView() {
    viewLogin.style.display = 'flex';
    viewTeam.style.display = 'none';
    teamCodeInput.value = '';
    loginError.style.display = 'none';
}

function showTeamView() {
    viewLogin.style.display = 'none';
    viewTeam.style.display = 'flex';
    displayTeamName.textContent = currentTeam.name;
    displayTeamCode.textContent = `#${currentTeam.code}`;
    hideAllSubstates();
    stateWaiting.style.display = 'flex';
}

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.style.display = 'block';
}

function showTeamError(msg) {
    teamErrorBanner.textContent = msg;
    teamErrorBanner.style.display = 'block';
    setTimeout(() => {
        teamErrorBanner.style.display = 'none';
    }, 6000);
}

function hideAllSubstates() {
    stateWaiting.style.display = 'none';
    statePitchingNotice.style.display = 'none';
    stateVoting.style.display = 'none';
    stateLocked.style.display = 'none';
}

// Score Selector
function selectScore(score) {
    selectedScore = score;
    scoreBtns.forEach(b => {
        if (parseInt(b.dataset.score, 10) === score) {
            b.classList.add('selected');
        } else {
            b.classList.remove('selected');
        }
    });
    scoreDescriptor.textContent = SCORE_LABELS[score] || `Score: ${score}/10`;
    btnSubmitVote.disabled = false;
}

function resetScoreSelection() {
    selectedScore = null;
    scoreBtns.forEach(b => b.classList.remove('selected'));
    scoreDescriptor.textContent = 'Select a score above';
    btnSubmitVote.disabled = true;
}

// Vote Submission
async function submitVote() {
    if (!selectedScore || !currentPoll) return;

    btnSubmitVote.disabled = true;
    btnSubmitVote.textContent = 'TRANSMITTING...';

    try {
        const res = await fetch(`${API_BASE}/api/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-team-code': currentTeam.code
            },
            body: JSON.stringify({ score: selectedScore })
        });

        const data = await res.json();
        if (!res.ok) {
            if (res.status === 409) {
                // Already voted by someone on the team
                lockVoteView(selectedScore || '--', 'A member of your team has already voted!');
                return;
            }
            throw new Error(data.detail || 'Failed to submit vote.');
        }

        lockVoteView(selectedScore);
        if (window.arcadeSound) window.arcadeSound.voteSuccess();
    } catch (err) {
        showTeamError(err.message);
        if (window.arcadeSound) window.arcadeSound.errorBuzz();
        btnSubmitVote.disabled = false;
        btnSubmitVote.innerHTML = '<span>LOCK IN VOTE</span> &gt;';
    }
}

function lockVoteView(score, customMsg) {
    if (timerInterval) clearInterval(timerInterval);
    hideAllSubstates();
    stateLocked.style.display = 'flex';
    lockedScoreDisplay.textContent = `${score} / 10`;
    if (customMsg) {
        showTeamError(customMsg);
    }
}

// Countdown Timer
function startCountdown(endsAtIso) {
    if (timerInterval) clearInterval(timerInterval);

    const targetTime = new Date(endsAtIso).getTime();

    function update() {
        const now = Date.now();
        const diff = Math.max(0, targetTime - now);
        const totalSecs = Math.ceil(diff / 1000);

        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        pollCountdown.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        if (totalSecs <= 5) {
            pollCountdown.className = 'timer-digits urgent';
            if (totalSecs > 0 && window.arcadeSound) window.arcadeSound.countdownTick();
        } else if (totalSecs <= 15) {
            pollCountdown.className = 'timer-digits warning';
        } else {
            pollCountdown.className = 'timer-digits';
        }

        if (diff <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            if (window.arcadeSound) window.arcadeSound.countdownFinal();
            if (stateVoting.style.display !== 'none') {
                btnSubmitVote.disabled = true;
                btnSubmitVote.textContent = 'POLL CLOSED';
            }
        }
    }

    update();
    timerInterval = setInterval(update, 1000);
}

// Sync current poll state on load / reconnect
async function syncCurrentPoll() {
    if (!currentTeam) return;
    try {
        const res = await fetch(`${API_BASE}/api/poll/current`, {
            headers: { 'x-team-code': currentTeam.code }
        });
        const data = await res.json();
        if (data.active && data.poll) {
            applyPollState(data.poll);
        } else {
            hideAllSubstates();
            stateWaiting.style.display = 'flex';
        }
    } catch (e) {
        console.warn('Could not sync current poll:', e);
    }
}

function applyPollState(poll) {
    currentPoll = poll;

    if (poll.is_pitching_team) {
        // You are pitching!
        hideAllSubstates();
        statePitchingNotice.style.display = 'flex';
        return;
    }

    if (poll.user_has_voted) {
        // Already voted
        lockVoteView('LOCKED');
        return;
    }

    // Active voting state
    hideAllSubstates();
    pitchingTeamName.textContent = poll.pitching_team_name;
    resetScoreSelection();
    stateVoting.style.display = 'flex';
    startCountdown(poll.ends_at);
}

// WebSocket Connection
function initTeamWebSocket() {
    if (!currentTeam) return;
    if (teamWs) {
        try { teamWs.close(); } catch (e) {}
    }

    const wsUrl = `${WS_BASE}/ws/team/${currentTeam.code}`;
    teamWs = new WebSocket(wsUrl);

    teamWs.onopen = () => {
        teamConnDot.classList.remove('offline');
        // Keep alive ping
        teamWs._ping = setInterval(() => {
            if (teamWs.readyState === WebSocket.OPEN) teamWs.send('ping');
        }, 20000);
    };

    teamWs.onclose = () => {
        teamConnDot.classList.add('offline');
        if (teamWs._ping) clearInterval(teamWs._ping);
        // Retry connection in 3 seconds
        setTimeout(() => {
            if (currentTeam) initTeamWebSocket();
        }, 3000);
    };

    teamWs.onerror = () => {
        teamConnDot.classList.add('offline');
    };

    teamWs.onmessage = (event) => {
        if (event.data === 'pong') return;
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (e) {
            console.error('Invalid WS message:', e);
        }
    };
}

function handleWebSocketMessage(msg) {
    switch (msg.event) {
        case 'poll_started':
            if (window.arcadeSound) window.arcadeSound.countdownTick();
            syncCurrentPoll();
            break;

        case 'poll_extended':
            if (currentPoll && currentPoll.id === msg.poll_id) {
                currentPoll.ends_at = msg.ends_at;
                startCountdown(msg.ends_at);
                showTeamError(`⏳ Poll extended by +${msg.added_seconds}s!`);
            }
            break;

        case 'poll_ended':
            if (timerInterval) clearInterval(timerInterval);
            hideAllSubstates();
            stateWaiting.style.display = 'flex';
            currentPoll = null;
            break;

        case 'already_voted':
            lockVoteView('--', msg.message);
            break;

        case 'vote_confirmed':
            lockVoteView(msg.score);
            break;
    }
}

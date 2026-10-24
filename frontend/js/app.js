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
const stateRound2BattlingNotice = document.getElementById('stateRound2BattlingNotice');
const stateRound2Watching = document.getElementById('stateRound2Watching');
const r2WatchTitle = document.getElementById('r2WatchTitle');
const r2WatchSub = document.getElementById('r2WatchSub');
const stateVoting = document.getElementById('stateVoting');
const stateRound2Voting = document.getElementById('stateRound2Voting');
const r2PollCountdown = document.getElementById('r2PollCountdown');
const btnVoteTeamA = document.getElementById('btnVoteTeamA');
const btnVoteTeamB = document.getElementById('btnVoteTeamB');
const duelNameA = document.getElementById('duelNameA');
const duelNameB = document.getElementById('duelNameB');
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
        if (e.key === 'Enter') {
            e.preventDefault();
            handleLogin();
        }
    });

    btnSubmitLogin.addEventListener('click', handleLogin);
    btnLogout.addEventListener('click', handleLogout);

    // Score button selection (Round 1)
    scoreBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const score = parseInt(btn.dataset.score, 10);
            selectScore(score);
            if (window.arcadeSound) window.arcadeSound.buttonClick();
        });
    });

    btnSubmitVote.addEventListener('click', submitVote);

    // Round 2 Duel Voting Buttons
    btnVoteTeamA.addEventListener('click', () => {
        if (!currentPoll || !currentPoll.pitching_team_id) return;
        submitRound2Vote(currentPoll.pitching_team_id, currentPoll.pitching_team_name);
    });

    btnVoteTeamB.addEventListener('click', () => {
        if (!currentPoll || !currentPoll.pitching_team_b_id) return;
        submitRound2Vote(currentPoll.pitching_team_b_id, currentPoll.pitching_team_b_name);
    });
}

// Session Management
async function checkSavedSession() {
    const saved = localStorage.getItem('pitch_current_team');
    if (saved) {
        try {
            currentTeam = JSON.parse(saved);
            showTeamView();
            initTeamWebSocket();
            syncCurrentPoll();
            return;
        } catch (e) {
            localStorage.removeItem('pitch_current_team');
        }
    }
    showLoginView();
}

async function handleLogin() {
    const code = teamCodeInput.value.trim();
    if (code.length !== 6) {
        showLoginError('Please enter a valid 6-digit team code.');
        return;
    }

    btnSubmitLogin.disabled = true;
    btnSubmitLogin.textContent = 'CONNECTING...';

    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || 'Invalid team code.');
        }

        currentTeam = data;
        localStorage.setItem('pitch_current_team', JSON.stringify(data));
        showTeamView();
        initTeamWebSocket();
        syncCurrentPoll();
        if (window.arcadeSound) window.arcadeSound.gameStart();
    } catch (err) {
        showLoginError(err.message);
        if (window.arcadeSound) window.arcadeSound.errorBuzz();
    } finally {
        btnSubmitLogin.disabled = false;
        btnSubmitLogin.innerHTML = '<span>START PLAYING</span> &gt;';
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to exit and disconnect on this device?')) {
        if (teamWs) {
            try { teamWs.close(); } catch (e) {}
        }
        localStorage.removeItem('pitch_current_team');
        currentTeam = null;
        currentPoll = null;
        if (timerInterval) clearInterval(timerInterval);
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
    stateRound2BattlingNotice.style.display = 'none';
    stateRound2Watching.style.display = 'none';
    stateVoting.style.display = 'none';
    stateRound2Voting.style.display = 'none';
    stateLocked.style.display = 'none';
}

// Score Selector (Round 1)
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

// Vote Submission (Round 1)
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
                lockVoteView(selectedScore || '--', 'A member of your team has already voted!');
                return;
            }
            throw new Error(data.detail || 'Failed to submit vote.');
        }

        lockVoteView(`${selectedScore} / 10`);
        if (window.arcadeSound) window.arcadeSound.voteSuccess();
    } catch (err) {
        showTeamError(err.message);
        if (window.arcadeSound) window.arcadeSound.errorBuzz();
        btnSubmitVote.disabled = false;
        btnSubmitVote.innerHTML = '<span>LOCK IN VOTE</span> &gt;';
    }
}

// Vote Submission (Round 2 1v1 Duel)
async function submitRound2Vote(votedForTeamId, votedTeamName) {
    if (!currentPoll) return;

    btnVoteTeamA.disabled = true;
    btnVoteTeamB.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/api/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-team-code': currentTeam.code
            },
            body: JSON.stringify({ voted_for_team_id: votedForTeamId })
        });

        const data = await res.json();
        if (!res.ok) {
            if (res.status === 409) {
                lockVoteView(`VOTED`, 'A member of your team has already voted!');
                return;
            }
            throw new Error(data.detail || 'Failed to submit vote.');
        }

        lockVoteView(`FOR ${votedTeamName}`);
        if (window.arcadeSound) window.arcadeSound.voteSuccess();
    } catch (err) {
        showTeamError(err.message);
        if (window.arcadeSound) window.arcadeSound.errorBuzz();
        btnVoteTeamA.disabled = false;
        btnVoteTeamB.disabled = false;
    }
}

function lockVoteView(scoreBadge, customMsg) {
    if (timerInterval) clearInterval(timerInterval);
    hideAllSubstates();
    stateLocked.style.display = 'flex';
    lockedScoreDisplay.textContent = scoreBadge;
    if (customMsg) {
        showTeamError(customMsg);
    }
}

// Countdown Timer
function startCountdown(endsAtIso, timerEl = pollCountdown) {
    if (timerInterval) clearInterval(timerInterval);

    const targetTime = new Date(endsAtIso).getTime();

    function update() {
        const now = Date.now();
        const diff = Math.max(0, targetTime - now);
        const totalSecs = Math.ceil(diff / 1000);

        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        if (totalSecs <= 5) {
            timerEl.className = 'timer-digits urgent';
            if (totalSecs > 0 && window.arcadeSound) window.arcadeSound.countdownTick();
        } else if (totalSecs <= 15) {
            timerEl.className = 'timer-digits warning';
        } else {
            timerEl.className = 'timer-digits';
        }

        if (diff <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            timerEl.textContent = '00:00';
            if (window.arcadeSound) window.arcadeSound.countdownFinal();
            if (stateVoting.style.display !== 'none') {
                btnSubmitVote.disabled = true;
                btnSubmitVote.textContent = "TIME'S UP (WAIT FOR EXTEND)";
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

    const isRound2 = (poll.round_number === 2 || poll.pitching_team_b_id !== null);

    if (poll.is_pitching_team) {
        // You are in the arena / pitching!
        hideAllSubstates();
        if (isRound2) {
            stateRound2BattlingNotice.style.display = 'block';
        } else {
            statePitchingNotice.style.display = 'flex';
        }
        return;
    }

    if (poll.user_has_voted) {
        // Already voted
        lockVoteView('LOCKED IN');
        return;
    }

    if (isRound2) {
        hideAllSubstates();
        if (poll.pitch_stage === 'voting_live' || poll.is_active) {
            // Live 1v1 audience voting!
            stateRound2Voting.style.display = 'flex';
            duelNameA.textContent = poll.pitching_team_name;
            duelNameB.textContent = poll.pitching_team_b_name || 'TEAM B';
            btnVoteTeamA.disabled = false;
            btnVoteTeamB.disabled = false;
            startCountdown(poll.ends_at, r2PollCountdown);
        } else {
            // Watching pitches before voting opens
            stateRound2Watching.style.display = 'flex';
            r2WatchTitle.textContent = (poll.pitch_stage === 'pitch1' ? `${poll.pitching_team_name} IS PITCHING...` : `${poll.pitching_team_b_name || 'Team 2'} IS PITCHING...`);
            r2WatchSub.textContent = "Listen closely! Once both teams have pitched, 1v1 voting will open on your screen.";
        }
        return;
    }

    // Round 1 active voting state
    hideAllSubstates();
    pitchingTeamName.textContent = poll.pitching_team_name;
    resetScoreSelection();
    stateVoting.style.display = 'flex';
    startCountdown(poll.ends_at, pollCountdown);
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
        case 'round2_voting_started':
            if (window.arcadeSound) window.arcadeSound.countdownTick();
            syncCurrentPoll();
            break;

        case 'round2_battle_locked':
        case 'round2_stage_updated':
            syncCurrentPoll();
            break;

        case 'poll_extended':
            if (currentPoll && currentPoll.id === msg.poll_id) {
                currentPoll.ends_at = msg.ends_at;
                
                // If already voted, keep locked in
                if (stateLocked.style.display === 'flex') {
                    showTeamError(`⏳ Poll extended by +${msg.added_seconds}s! (Your vote is already recorded)`);
                } else if (statePitchingNotice.style.display === 'flex' || stateRound2BattlingNotice.style.display === 'block') {
                    // Battling teams stay locked
                } else {
                    if (currentPoll.round_number === 2 || currentPoll.pitching_team_b_id) {
                        hideAllSubstates();
                        stateRound2Voting.style.display = 'flex';
                        startCountdown(msg.ends_at, r2PollCountdown);
                    } else {
                        hideAllSubstates();
                        stateVoting.style.display = 'flex';
                        startCountdown(msg.ends_at, pollCountdown);
                        btnSubmitVote.disabled = !selectedScore;
                    }
                    showTeamError(`⏳ Poll extended by +${msg.added_seconds}s! Cast your vote now!`);
                    if (window.arcadeSound) window.arcadeSound.countdownTick();
                }
            } else {
                syncCurrentPoll();
            }
            break;

        case 'poll_ended':
        case 'round2_voting_ended':
            if (timerInterval) clearInterval(timerInterval);
            hideAllSubstates();
            stateWaiting.style.display = 'flex';
            currentPoll = null;
            break;

        case 'already_voted':
            lockVoteView('LOCKED', msg.message);
            break;

        case 'vote_confirmed':
            lockVoteView(msg.score ? `${msg.score} / 10` : 'VOTE LOCKED');
            break;
    }
}

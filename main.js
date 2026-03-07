const resultContainer = document.querySelector('#lotto-results-container');
const generateBtn = document.querySelector('#generate-btn');
const numSetsSelect = document.querySelector('#num-sets');
const themeBtn = document.querySelector('#theme-btn');
const historyContainer = document.querySelector('#history-container');
const html = document.documentElement;

// --- Theme Logic ---
const savedTheme = localStorage.getItem('theme') || 'light';
html.setAttribute('data-theme', savedTheme);
updateThemeButtonText(savedTheme);

themeBtn.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeButtonText(newTheme);
});

function updateThemeButtonText(theme) {
    themeBtn.textContent = theme === 'light' ? '🌙 Switch to Dark Mode' : '☀️ Switch to Light Mode';
}

// --- Lotto Generation Logic ---
function generateSingleSet() {
    const numbers = new Set();
    while (numbers.size < 6) {
        numbers.add(Math.floor(Math.random() * 45) + 1);
    }
    return Array.from(numbers).sort((a, b) => a - b);
}

generateBtn.addEventListener('click', () => {
    resultContainer.innerHTML = '';
    const numSets = parseInt(numSetsSelect.value);

    for (let i = 0; i < numSets; i++) {
        const set = generateSingleSet();
        const rowDiv = document.createElement('div');
        rowDiv.classList.add('lotto-row');

        set.forEach((num, index) => {
            const ball = document.createElement('div');
            ball.classList.add('lotto-number');
            ball.textContent = num;
            ball.style.animationDelay = `${(i * 0.1) + (index * 0.05)}s`;
            rowDiv.appendChild(ball);
        });
        resultContainer.appendChild(rowDiv);
    }
});

// --- Winning History Logic (Past Year) ---
const LOTTO_BASE_URL = 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=';
const LOTTO_HISTORY_MIRROR_URL = 'https://gist.githubusercontent.com/anthonyminyungi/a7237c0717400512855c890d5b0e1ba3/raw/lotto-winning-history.json';
const HISTORY_WEEKS = 52;
const ROUND_1_DATE = new Date('2002-12-07T20:00:00+09:00');

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function fetchJsonWithTimeout(url, timeoutMs = 2500) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        const parsed = safeJsonParse(text);
        if (!parsed) {
            throw new Error('Invalid JSON response');
        }
        return parsed;
    } finally {
        clearTimeout(timeoutId);
    }
}

function buildRoundSources(round) {
    const officialUrl = `${LOTTO_BASE_URL}${round}`;
    return [
        officialUrl,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(officialUrl)}`
    ];
}

function normalizeRoundData(data) {
    const numbers = [
        data.drwtNo1,
        data.drwtNo2,
        data.drwtNo3,
        data.drwtNo4,
        data.drwtNo5,
        data.drwtNo6
    ].filter((n) => Number.isInteger(n));

    if (data.returnValue !== 'success' || !Number.isInteger(data.drwNo) || numbers.length !== 6) {
        return null;
    }

    return {
        round: data.drwNo,
        date: data.drwNoDate,
        numbers,
        bonus: data.bnusNo
    };
}

async function fetchRoundResult(round) {
    const sources = buildRoundSources(round);

    for (const sourceUrl of sources) {
        try {
            const data = await fetchJsonWithTimeout(sourceUrl);
            const normalized = normalizeRoundData(data);
            if (normalized) {
                return normalized;
            }
        } catch {
            // Try the next source.
        }
    }

    throw new Error(`Round ${round} fetch failed`);
}

function getExpectedCurrentRound() {
    const diffMs = Date.now() - ROUND_1_DATE.getTime();
    const elapsedWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return Math.max(1, elapsedWeeks + 1);
}

async function findLatestAvailableRound() {
    const expected = getExpectedCurrentRound();

    for (let round = expected + 1; round >= expected - 3; round -= 1) {
        if (round < 1) {
            continue;
        }
        try {
            const result = await fetchRoundResult(round);
            return result.round;
        } catch {
            // Continue probing nearby rounds.
        }
    }

    throw new Error('Latest round probe failed');
}

function normalizeMirrorHistoryData(payload) {
    if (!payload || !Array.isArray(payload.history)) {
        return [];
    }

    return payload.history
        .map((entry) => ({
            round: entry.round,
            date: entry.createdAt,
            numbers: entry.numbers,
            bonus: entry.bonus
        }))
        .filter((entry) =>
            Number.isInteger(entry.round) &&
            Array.isArray(entry.numbers) &&
            entry.numbers.length === 6 &&
            entry.numbers.every((n) => Number.isInteger(n))
        )
        .sort((a, b) => b.round - a.round)
        .slice(0, HISTORY_WEEKS);
}

async function fetchHistoryFromMirror() {
    const mirrorPayload = await fetchJsonWithTimeout(LOTTO_HISTORY_MIRROR_URL, 8000);
    const recentResults = normalizeMirrorHistoryData(mirrorPayload);
    if (!recentResults.length) {
        throw new Error('Mirror history is empty');
    }
    return recentResults;
}

async function fetchLottoHistory() {
    historyContainer.innerHTML = '<p>최근 당첨 결과를 불러오는 중...</p>';

    try {
        const latestRound = await findLatestAvailableRound();
        const startRound = Math.max(1, latestRound - HISTORY_WEEKS + 1);
        const rounds = [];

        for (let r = latestRound; r >= startRound; r -= 1) {
            rounds.push(r);
        }

        const settled = await Promise.allSettled(rounds.map((round) => fetchRoundResult(round)));
        const recentResults = settled
            .filter((result) => result.status === 'fulfilled')
            .map((result) => result.value)
            .sort((a, b) => b.round - a.round);

        if (!recentResults.length) {
            throw new Error('No available results');
        }

        renderHistory(recentResults);
    } catch (error) {
        console.warn('Official history fetch failed, switching to mirror:', error);
        try {
            const fallbackResults = await fetchHistoryFromMirror();
            renderHistory(fallbackResults);
        } catch (fallbackError) {
            console.error('History Fetch Error:', fallbackError);
            historyContainer.innerHTML = '<p>당첨번호 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
        }
    }
}

function renderHistory(results) {
    historyContainer.innerHTML = '';
    results.forEach(res => {
        const item = document.createElement('div');
        item.classList.add('history-item');
        
        const round = document.createElement('div');
        round.classList.add('history-round');
        round.textContent = res.date ? `${res.round}회 (${res.date})` : `${res.round}회`;

        const numsDiv = document.createElement('div');
        numsDiv.classList.add('history-nums');
        
        // Handling both array of numbers or individual keys based on common API structures
        const numbers = res.numbers || [res.drwtNo1, res.drwtNo2, res.drwtNo3, res.drwtNo4, res.drwtNo5, res.drwtNo6];
        
        numbers.forEach(n => {
            const miniBall = document.createElement('div');
            miniBall.classList.add('mini-ball');
            miniBall.textContent = n;
            numsDiv.appendChild(miniBall);
        });

        item.appendChild(round);
        item.appendChild(numsDiv);
        historyContainer.appendChild(item);
    });
}

// Initial fetch
fetchLottoHistory();

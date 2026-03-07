const resultContainer = document.querySelector('#lotto-results-container');
const generateBtn = document.querySelector('#generate-btn');
const numSetsSelect = document.querySelector('#num-sets');
const strategySelect = document.querySelector('#strategy-select');
const strategyStatus = document.querySelector('#strategy-status');
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

// --- Recommendation Logic ---
const LOTTO_NUM_MAX = 45;
const PICK_COUNT = 6;

const aiState = {
    model: null,
    trainedRounds: 0,
    isTraining: false
};

let modelHistory = [];

strategySelect.addEventListener('change', () => {
    if (strategySelect.value === 'ai') {
        void ensureAiModelReady();
    } else {
        setStrategyStatus('완전 랜덤 방식으로 추천합니다.');
    }
});

function setStrategyStatus(message) {
    strategyStatus.textContent = message;
}

function generateSingleSet() {
    const numbers = new Set();
    while (numbers.size < PICK_COUNT) {
        numbers.add(Math.floor(Math.random() * LOTTO_NUM_MAX) + 1);
    }
    return Array.from(numbers).sort((a, b) => a - b);
}

function renderGeneratedSets(sets) {
    resultContainer.innerHTML = '';

    sets.forEach((set, setIndex) => {
        const rowDiv = document.createElement('div');
        rowDiv.classList.add('lotto-row');

        set.forEach((num, index) => {
            const ball = document.createElement('div');
            ball.classList.add('lotto-number');
            ball.textContent = num;
            ball.style.animationDelay = `${(setIndex * 0.1) + (index * 0.05)}s`;
            rowDiv.appendChild(ball);
        });

        resultContainer.appendChild(rowDiv);
    });
}

function buildFeatureVector(roundsAsc, endIndex, windowSize) {
    const freq = Array(LOTTO_NUM_MAX).fill(0);

    for (let i = endIndex - windowSize; i < endIndex; i += 1) {
        for (const n of roundsAsc[i].numbers) {
            freq[n - 1] += 1;
        }
    }

    const denom = windowSize * PICK_COUNT;
    return freq.map((v) => v / denom);
}

function buildTrainingSamples(roundsAsc, windowSize) {
    const samples = [];

    for (let i = windowSize; i < roundsAsc.length; i += 1) {
        const x = buildFeatureVector(roundsAsc, i, windowSize);
        const y = Array(LOTTO_NUM_MAX).fill(0);
        for (const n of roundsAsc[i].numbers) {
            y[n - 1] = 1;
        }
        samples.push({ x, y });
    }

    return samples;
}

function createModel(inputSize, hiddenSize, outputSize) {
    const w1 = Array.from({ length: inputSize }, () =>
        Array.from({ length: hiddenSize }, () => (Math.random() - 0.5) * 0.1)
    );
    const b1 = Array(hiddenSize).fill(0);

    const w2 = Array.from({ length: hiddenSize }, () =>
        Array.from({ length: outputSize }, () => (Math.random() - 0.5) * 0.1)
    );
    const b2 = Array(outputSize).fill(0);

    return { w1, b1, w2, b2 };
}

function sigmoid(z) {
    return 1 / (1 + Math.exp(-z));
}

function predictProbabilities(model, x) {
    const hiddenRaw = model.b1.map((b, j) => {
        let sum = b;
        for (let i = 0; i < x.length; i += 1) {
            sum += x[i] * model.w1[i][j];
        }
        return sum;
    });

    const hidden = hiddenRaw.map((v) => (v > 0 ? v : 0));

    return model.b2.map((b, k) => {
        let sum = b;
        for (let j = 0; j < hidden.length; j += 1) {
            sum += hidden[j] * model.w2[j][k];
        }
        return sigmoid(sum);
    });
}

function trainSimpleNetwork(samples, options) {
    const { inputSize, hiddenSize, outputSize, epochs, learningRate } = options;
    const model = createModel(inputSize, hiddenSize, outputSize);

    for (let epoch = 0; epoch < epochs; epoch += 1) {
        for (const sample of samples) {
            const x = sample.x;
            const y = sample.y;

            const hiddenRaw = model.b1.map((b, j) => {
                let sum = b;
                for (let i = 0; i < inputSize; i += 1) {
                    sum += x[i] * model.w1[i][j];
                }
                return sum;
            });
            const hidden = hiddenRaw.map((v) => (v > 0 ? v : 0));

            const out = model.b2.map((b, k) => {
                let sum = b;
                for (let j = 0; j < hiddenSize; j += 1) {
                    sum += hidden[j] * model.w2[j][k];
                }
                return sigmoid(sum);
            });

            const dOut = out.map((pred, k) => pred - y[k]);
            const dHidden = Array(hiddenSize).fill(0);

            for (let j = 0; j < hiddenSize; j += 1) {
                let grad = 0;
                for (let k = 0; k < outputSize; k += 1) {
                    grad += dOut[k] * model.w2[j][k];
                }
                dHidden[j] = hiddenRaw[j] > 0 ? grad : 0;
            }

            for (let j = 0; j < hiddenSize; j += 1) {
                for (let k = 0; k < outputSize; k += 1) {
                    model.w2[j][k] -= learningRate * hidden[j] * dOut[k];
                }
            }
            for (let k = 0; k < outputSize; k += 1) {
                model.b2[k] -= learningRate * dOut[k];
            }

            for (let i = 0; i < inputSize; i += 1) {
                for (let j = 0; j < hiddenSize; j += 1) {
                    model.w1[i][j] -= learningRate * x[i] * dHidden[j];
                }
            }
            for (let j = 0; j < hiddenSize; j += 1) {
                model.b1[j] -= learningRate * dHidden[j];
            }
        }
    }

    return model;
}

function sampleNumbersFromDistribution(probabilities) {
    const selected = [];
    const picked = new Set();

    while (selected.length < PICK_COUNT) {
        const weights = probabilities.map((p, i) => {
            if (picked.has(i + 1)) {
                return 0;
            }
            const noise = Math.random() * 0.02;
            return Math.max(1e-6, p + noise);
        });

        const total = weights.reduce((acc, v) => acc + v, 0);
        if (total <= 0) {
            break;
        }

        let r = Math.random() * total;
        let chosenIndex = 0;

        for (let i = 0; i < weights.length; i += 1) {
            r -= weights[i];
            if (r <= 0) {
                chosenIndex = i;
                break;
            }
        }

        picked.add(chosenIndex + 1);
        selected.push(chosenIndex + 1);
    }

    while (selected.length < PICK_COUNT) {
        const n = Math.floor(Math.random() * LOTTO_NUM_MAX) + 1;
        if (!picked.has(n)) {
            picked.add(n);
            selected.push(n);
        }
    }

    return selected.sort((a, b) => a - b);
}

function dedupeHistoryByRound(results) {
    const byRound = new Map();

    results.forEach((item) => {
        byRound.set(item.round, item);
    });

    return Array.from(byRound.values()).sort((a, b) => b.round - a.round);
}

function setModelHistory(results) {
    modelHistory = dedupeHistoryByRound(results);
    aiState.model = null;
    aiState.trainedRounds = 0;
}

async function ensureAiModelReady() {
    const MIN_ROUNDS = 30;
    const WINDOW_SIZE = 12;

    if (aiState.isTraining) {
        setStrategyStatus('AI 모델 학습 진행 중입니다...');
        return;
    }

    if (modelHistory.length < MIN_ROUNDS) {
        setStrategyStatus('학습 데이터가 부족해 랜덤 추천으로 동작합니다.');
        return;
    }

    if (aiState.model && aiState.trainedRounds === modelHistory.length) {
        setStrategyStatus(`AI 모델 준비 완료 (학습 ${aiState.trainedRounds}회차)`);
        return;
    }

    aiState.isTraining = true;
    setStrategyStatus('AI 모델 학습 중...');

    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
        const roundsAsc = [...modelHistory].sort((a, b) => a.round - b.round);
        const samples = buildTrainingSamples(roundsAsc, WINDOW_SIZE);

        if (samples.length < 10) {
            setStrategyStatus('학습 샘플이 부족해 랜덤 추천으로 동작합니다.');
            return;
        }

        aiState.model = trainSimpleNetwork(samples, {
            inputSize: LOTTO_NUM_MAX,
            hiddenSize: 24,
            outputSize: LOTTO_NUM_MAX,
            epochs: 160,
            learningRate: 0.04
        });
        aiState.trainedRounds = modelHistory.length;
        setStrategyStatus(`AI 모델 준비 완료 (학습 ${aiState.trainedRounds}회차)`);
    } catch (error) {
        console.error('AI training error:', error);
        setStrategyStatus('AI 학습에 실패해 랜덤 추천으로 동작합니다.');
    } finally {
        aiState.isTraining = false;
    }
}

function generateAiSet() {
    const WINDOW_SIZE = 12;

    if (!aiState.model || modelHistory.length < WINDOW_SIZE) {
        return generateSingleSet();
    }

    const roundsAsc = [...modelHistory].sort((a, b) => a.round - b.round);
    const x = buildFeatureVector(roundsAsc, roundsAsc.length, WINDOW_SIZE);

    const probs = predictProbabilities(aiState.model, x);
    return sampleNumbersFromDistribution(probs);
}

generateBtn.addEventListener('click', async () => {
    const numSets = parseInt(numSetsSelect.value, 10);
    const strategy = strategySelect.value;
    const sets = [];

    if (strategy === 'ai') {
        await ensureAiModelReady();
    }

    for (let i = 0; i < numSets; i += 1) {
        const set = strategy === 'ai' ? generateAiSet() : generateSingleSet();
        sets.push(set);
    }

    renderGeneratedSets(sets);
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
        .sort((a, b) => b.round - a.round);
}

async function fetchHistoryFromMirror() {
    const mirrorPayload = await fetchJsonWithTimeout(LOTTO_HISTORY_MIRROR_URL, 8000);
    const normalized = normalizeMirrorHistoryData(mirrorPayload);
    if (!normalized.length) {
        throw new Error('Mirror history is empty');
    }
    return normalized;
}

function renderHistory(results) {
    historyContainer.innerHTML = '';
    results.forEach((res) => {
        const item = document.createElement('div');
        item.classList.add('history-item');

        const round = document.createElement('div');
        round.classList.add('history-round');
        round.textContent = res.date ? `${res.round}회 (${res.date})` : `${res.round}회`;

        const numsDiv = document.createElement('div');
        numsDiv.classList.add('history-nums');

        const numbers = res.numbers || [res.drwtNo1, res.drwtNo2, res.drwtNo3, res.drwtNo4, res.drwtNo5, res.drwtNo6];

        numbers.forEach((n) => {
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

async function hydrateModelHistoryFromMirror() {
    try {
        const mirrorResults = await fetchHistoryFromMirror();
        if (mirrorResults.length > modelHistory.length) {
            setModelHistory(mirrorResults);
            if (strategySelect.value === 'ai') {
                await ensureAiModelReady();
            }
        }
    } catch (error) {
        console.warn('Mirror model history hydrate failed:', error);
    }
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

        renderHistory(recentResults.slice(0, HISTORY_WEEKS));
        setModelHistory(recentResults);
        void hydrateModelHistoryFromMirror();
    } catch (error) {
        console.warn('Official history fetch failed, switching to mirror:', error);
        try {
            const fallbackResults = await fetchHistoryFromMirror();
            renderHistory(fallbackResults.slice(0, HISTORY_WEEKS));
            setModelHistory(fallbackResults);
            if (strategySelect.value === 'ai') {
                await ensureAiModelReady();
            }
        } catch (fallbackError) {
            console.error('History Fetch Error:', fallbackError);
            historyContainer.innerHTML = '<p>당첨번호 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
        }
    }
}

setStrategyStatus('완전 랜덤 방식으로 추천합니다.');
void fetchLottoHistory();

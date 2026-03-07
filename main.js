const resultContainer = document.querySelector('#lotto-results-container');
const generateBtn = document.querySelector('#generate-btn');
const saveCurrentBtn = document.querySelector('#save-current-btn');
const savedList = document.querySelector('#saved-list');
const savedCount = document.querySelector('#saved-count');
const numSetsSelect = document.querySelector('#num-sets');
const strategySelect = document.querySelector('#strategy-select');
const strategyStatus = document.querySelector('#strategy-status');
const themeBtn = document.querySelector('#theme-btn');
const historyContainer = document.querySelector('#history-container');
const html = document.documentElement;

const LOTTO_NUM_MAX = 45;
const PICK_COUNT = 6;
const SAVE_LIMIT = 5;
const SAVED_STORAGE_KEY = 'lotto_saved_snapshots_v1';
const TRAIN_YEARS = 5;
const TRAIN_MIN_ROUNDS = 40;
const TRAIN_WINDOW = 12;

const LOTTO_BASE_URL = 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=';
const LOTTO_HISTORY_MIRROR_URL = 'https://gist.githubusercontent.com/anthonyminyungi/a7237c0717400512855c890d5b0e1ba3/raw/lotto-winning-history.json';
const HISTORY_WEEKS = 52;
const ROUND_1_DATE = new Date('2002-12-07T20:00:00+09:00');

const modelStore = {
    pattern: {
        model: null,
        trainedRounds: 0,
        isTraining: false
    },
    attention: {
        model: null,
        trainedRounds: 0,
        isTraining: false
    }
};

let fullHistory = [];
let trainHistory = [];
let lastGeneratedSets = [];
let lastGeneratedMode = 'random';
let savedSnapshots = [];

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

strategySelect.addEventListener('change', () => {
    updateStrategyStatusByMode();
});

saveCurrentBtn.addEventListener('click', () => {
    saveCurrentGeneratedSets();
});

savedList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }

    const loadId = target.getAttribute('data-load-id');
    if (loadId) {
        loadSavedSnapshot(loadId);
        return;
    }

    const deleteId = target.getAttribute('data-delete-id');
    if (deleteId) {
        removeSavedSnapshot(deleteId);
    }
});

generateBtn.addEventListener('click', async () => {
    const numSets = parseInt(numSetsSelect.value, 10);
    const mode = strategySelect.value;

    if (mode === 'ai_pattern') {
        await ensurePatternModelReady();
    }

    if (mode === 'ai_attention') {
        await ensureAttentionModelReady();
    }

    const sets = [];
    for (let i = 0; i < numSets; i += 1) {
        if (mode === 'ai_pattern') {
            sets.push(generatePatternAiSet());
        } else if (mode === 'ai_attention') {
            sets.push(generateAttentionAiSet());
        } else {
            sets.push(generateSingleSet());
        }
    }

    renderGeneratedSets(sets);
    lastGeneratedSets = cloneSets(sets);
    lastGeneratedMode = mode;
});

function updateThemeButtonText(theme) {
    themeBtn.textContent = theme === 'light' ? '다크 모드' : '라이트 모드';
}

function setStrategyStatus(message) {
    strategyStatus.textContent = message;
}

function cloneSets(sets) {
    return sets.map((set) => [...set]);
}

function getModeLabel(mode) {
    if (mode === 'ai_pattern') {
        return '패턴 AI';
    }
    if (mode === 'ai_attention') {
        return '어텐션 AI';
    }
    return '완전 랜덤';
}

function formatSavedTime(isoString) {
    const date = new Date(isoString);
    if (!Number.isFinite(date.getTime())) {
        return '-';
    }
    return date.toLocaleString('ko-KR', { hour12: false });
}

function normalizeSavedSnapshots(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .filter((item) =>
            item &&
            typeof item.id === 'string' &&
            typeof item.savedAt === 'string' &&
            typeof item.mode === 'string' &&
            Array.isArray(item.sets) &&
            item.sets.length > 0 &&
            item.sets.every((row) => Array.isArray(row) && row.length === PICK_COUNT && row.every(Number.isInteger))
        )
        .slice(0, SAVE_LIMIT);
}

function readSavedSnapshots() {
    try {
        const raw = localStorage.getItem(SAVED_STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        return normalizeSavedSnapshots(parsed);
    } catch {
        return [];
    }
}

function writeSavedSnapshots() {
    localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(savedSnapshots));
}

function updateSavedCount() {
    savedCount.textContent = `${savedSnapshots.length} / ${SAVE_LIMIT}`;
}

function renderSavedList() {
    updateSavedCount();

    if (!savedSnapshots.length) {
        savedList.innerHTML = '<p class="saved-empty">저장된 번호가 없습니다.</p>';
        return;
    }

    savedList.innerHTML = savedSnapshots.map((item) => {
        const preview = item.sets
            .slice(0, 2)
            .map((row, idx) => `<span class="saved-row">${idx + 1}게임: ${row.join(', ')}</span>`)
            .join('');

        return `
            <div class="saved-item">
                <div class="saved-meta">
                    <span>${formatSavedTime(item.savedAt)}</span>
                    <span>${getModeLabel(item.mode)} / ${item.sets.length}게임</span>
                </div>
                <div class="saved-preview">${preview}</div>
                <div class="saved-buttons">
                    <button class="tiny-btn" type="button" data-load-id="${item.id}">불러오기</button>
                    <button class="tiny-btn" type="button" data-delete-id="${item.id}">삭제</button>
                </div>
            </div>
        `;
    }).join('');
}

function saveCurrentGeneratedSets() {
    if (!lastGeneratedSets.length) {
        setStrategyStatus('저장할 번호가 없습니다. 먼저 번호를 생성해 주세요.');
        return;
    }

    if (savedSnapshots.length >= SAVE_LIMIT) {
        setStrategyStatus('저장 한도(5개)에 도달했습니다. 기존 저장본을 삭제 후 다시 저장해 주세요.');
        return;
    }

    const snapshot = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        savedAt: new Date().toISOString(),
        mode: lastGeneratedMode,
        sets: cloneSets(lastGeneratedSets)
    };

    savedSnapshots.unshift(snapshot);
    savedSnapshots = savedSnapshots.slice(0, SAVE_LIMIT);
    writeSavedSnapshots();
    renderSavedList();
    setStrategyStatus(`번호를 저장했습니다. (${savedSnapshots.length}/${SAVE_LIMIT})`);
}

function loadSavedSnapshot(id) {
    const snapshot = savedSnapshots.find((item) => item.id === id);
    if (!snapshot) {
        return;
    }
    lastGeneratedSets = cloneSets(snapshot.sets);
    renderGeneratedSets(lastGeneratedSets);
    setStrategyStatus(`저장된 번호를 불러왔습니다. (${getModeLabel(snapshot.mode)})`);
}

function removeSavedSnapshot(id) {
    const before = savedSnapshots.length;
    savedSnapshots = savedSnapshots.filter((item) => item.id !== id);
    if (savedSnapshots.length === before) {
        return;
    }
    writeSavedSnapshots();
    renderSavedList();
    setStrategyStatus('저장된 번호를 삭제했습니다.');
}

function updateStrategyStatusByMode() {
    const mode = strategySelect.value;
    if (mode === 'random') {
        setStrategyStatus('완전 랜덤 모드: 과거 데이터 영향 없이 번호를 생성합니다.');
    } else if (mode === 'ai_pattern') {
        const rounds = trainHistory.length;
        setStrategyStatus(`패턴 기반 AI 모드: 최근 ${TRAIN_YEARS}년(${rounds}회차) 학습 데이터를 사용합니다.`);
    } else {
        const rounds = trainHistory.length;
        setStrategyStatus(`어텐션 기반 AI 모드: 최근 ${TRAIN_YEARS}년(${rounds}회차) 시계열 가중치를 학습합니다.`);
    }
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
            ball.style.animationDelay = `${(setIndex * 0.12) + (index * 0.06)}s`;
            rowDiv.appendChild(ball);
        });

        resultContainer.appendChild(rowDiv);
    });
}

function dedupeHistoryByRound(results) {
    const byRound = new Map();
    results.forEach((item) => {
        byRound.set(item.round, item);
    });
    return Array.from(byRound.values()).sort((a, b) => b.round - a.round);
}

function isValidDateString(value) {
    if (!value || typeof value !== 'string') {
        return false;
    }
    const d = new Date(`${value}T00:00:00+09:00`);
    return Number.isFinite(d.getTime());
}

function filterHistoryByYears(results, years) {
    const now = new Date();
    const cutoff = new Date(now.getFullYear() - years, now.getMonth(), now.getDate());

    return results.filter((row) => {
        if (!isValidDateString(row.date)) {
            return false;
        }
        const d = new Date(`${row.date}T00:00:00+09:00`);
        return d >= cutoff;
    });
}

function resetAllModels() {
    modelStore.pattern.model = null;
    modelStore.pattern.trainedRounds = 0;

    modelStore.attention.model = null;
    modelStore.attention.trainedRounds = 0;
}

function setHistories(results) {
    fullHistory = dedupeHistoryByRound(results);
    trainHistory = filterHistoryByYears(fullHistory, TRAIN_YEARS)
        .sort((a, b) => a.round - b.round);

    resetAllModels();
    updateStrategyStatusByMode();
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

function createPatternModel(inputSize, hiddenSize, outputSize) {
    const w1 = Array.from({ length: inputSize }, () =>
        Array.from({ length: hiddenSize }, () => (Math.random() - 0.5) * 0.08)
    );
    const b1 = Array(hiddenSize).fill(0);

    const w2 = Array.from({ length: hiddenSize }, () =>
        Array.from({ length: outputSize }, () => (Math.random() - 0.5) * 0.08)
    );
    const b2 = Array(outputSize).fill(0);

    return { w1, b1, w2, b2 };
}

function sigmoid(z) {
    return 1 / (1 + Math.exp(-z));
}

function predictPatternProbabilities(model, x) {
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

function trainPatternNetwork(samples, options) {
    const { inputSize, hiddenSize, outputSize, epochs, learningRate } = options;
    const model = createPatternModel(inputSize, hiddenSize, outputSize);

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

function softmax(logits) {
    const maxLogit = Math.max(...logits);
    const expVals = logits.map((v) => Math.exp(v - maxLogit));
    const sum = expVals.reduce((a, b) => a + b, 0) || 1;
    return expVals.map((v) => v / sum);
}

function normalizeDrawAsVector(draw) {
    const v = Array(LOTTO_NUM_MAX).fill(0);
    draw.numbers.forEach((n) => {
        v[n - 1] = 1;
    });
    return v;
}

function createAttentionModel(featureSize) {
    return {
        query: Array.from({ length: featureSize }, () => (Math.random() - 0.5) * 0.08),
        key: Array.from({ length: featureSize }, () => (Math.random() - 0.5) * 0.08),
        value: Array.from({ length: featureSize }, () => (Math.random() - 0.5) * 0.08),
        outW: Array.from({ length: featureSize }, () =>
            Array.from({ length: LOTTO_NUM_MAX }, () => (Math.random() - 0.5) * 0.08)
        ),
        outB: Array(LOTTO_NUM_MAX).fill(0)
    };
}

function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i += 1) {
        s += a[i] * b[i];
    }
    return s;
}

function elementWiseMul(a, b) {
    const out = Array(a.length);
    for (let i = 0; i < a.length; i += 1) {
        out[i] = a[i] * b[i];
    }
    return out;
}

function weightedSum(vectors, weights) {
    const out = Array(vectors[0].length).fill(0);
    for (let i = 0; i < vectors.length; i += 1) {
        for (let j = 0; j < out.length; j += 1) {
            out[j] += vectors[i][j] * weights[i];
        }
    }
    return out;
}

function attentionForward(model, sequence) {
    const q = sequence[sequence.length - 1].map((v, i) => v * model.query[i]);
    const keys = sequence.map((vec) => elementWiseMul(vec, model.key));
    const values = sequence.map((vec) => elementWiseMul(vec, model.value));

    const scores = keys.map((k) => dot(q, k) / Math.sqrt(LOTTO_NUM_MAX));
    const attn = softmax(scores);
    const context = weightedSum(values, attn);

    const logits = Array(LOTTO_NUM_MAX).fill(0);
    for (let k = 0; k < LOTTO_NUM_MAX; k += 1) {
        let s = model.outB[k];
        for (let i = 0; i < LOTTO_NUM_MAX; i += 1) {
            s += context[i] * model.outW[i][k];
        }
        logits[k] = s;
    }

    const probs = logits.map((z) => sigmoid(z));
    return { probs, context, attn, values, q, keys };
}

function buildAttentionSamples(roundsAsc, seqLen) {
    const data = roundsAsc.map((d) => normalizeDrawAsVector(d));
    const samples = [];

    for (let i = seqLen; i < data.length; i += 1) {
        samples.push({
            seq: data.slice(i - seqLen, i),
            target: data[i]
        });
    }

    return samples;
}

function trainAttentionModel(samples, options) {
    const { epochs, learningRate, seqLen } = options;
    const model = createAttentionModel(LOTTO_NUM_MAX);

    for (let epoch = 0; epoch < epochs; epoch += 1) {
        for (const sample of samples) {
            const forward = attentionForward(model, sample.seq);
            const dLogits = forward.probs.map((p, i) => p - sample.target[i]);

            for (let i = 0; i < LOTTO_NUM_MAX; i += 1) {
                for (let k = 0; k < LOTTO_NUM_MAX; k += 1) {
                    model.outW[i][k] -= learningRate * forward.context[i] * dLogits[k];
                }
            }
            for (let k = 0; k < LOTTO_NUM_MAX; k += 1) {
                model.outB[k] -= learningRate * dLogits[k];
            }

            const dContext = Array(LOTTO_NUM_MAX).fill(0);
            for (let i = 0; i < LOTTO_NUM_MAX; i += 1) {
                let g = 0;
                for (let k = 0; k < LOTTO_NUM_MAX; k += 1) {
                    g += dLogits[k] * model.outW[i][k];
                }
                dContext[i] = g;
            }

            for (let i = 0; i < LOTTO_NUM_MAX; i += 1) {
                let gradValue = 0;
                for (let t = 0; t < seqLen; t += 1) {
                    gradValue += dContext[i] * sample.seq[t][i] * forward.attn[t];
                }
                model.value[i] -= learningRate * 0.05 * gradValue;
            }

            const lastVec = sample.seq[seqLen - 1];
            for (let i = 0; i < LOTTO_NUM_MAX; i += 1) {
                const base = dContext[i] * lastVec[i];
                model.query[i] -= learningRate * 0.02 * base;
                model.key[i] -= learningRate * 0.02 * base;
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
            const noise = Math.random() * 0.015;
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

async function ensurePatternModelReady() {
    if (modelStore.pattern.isTraining) {
        setStrategyStatus('패턴 기반 AI 모델 학습 중입니다...');
        return;
    }

    if (trainHistory.length < TRAIN_MIN_ROUNDS) {
        setStrategyStatus('최근 5년 학습 데이터가 부족해 랜덤으로 추천합니다.');
        return;
    }

    if (modelStore.pattern.model && modelStore.pattern.trainedRounds === trainHistory.length) {
        setStrategyStatus(`패턴 AI 준비 완료 (${TRAIN_YEARS}년 ${modelStore.pattern.trainedRounds}회차)`);
        return;
    }

    modelStore.pattern.isTraining = true;
    setStrategyStatus('패턴 기반 AI 학습 중...');

    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
        const samples = buildTrainingSamples(trainHistory, TRAIN_WINDOW);
        if (samples.length < 20) {
            setStrategyStatus('패턴 AI 학습 샘플이 부족해 랜덤 추천으로 전환합니다.');
            return;
        }

        modelStore.pattern.model = trainPatternNetwork(samples, {
            inputSize: LOTTO_NUM_MAX,
            hiddenSize: 24,
            outputSize: LOTTO_NUM_MAX,
            epochs: 170,
            learningRate: 0.035
        });
        modelStore.pattern.trainedRounds = trainHistory.length;
        setStrategyStatus(`패턴 AI 준비 완료 (${TRAIN_YEARS}년 ${modelStore.pattern.trainedRounds}회차)`);
    } catch (error) {
        console.error('Pattern model training error:', error);
        setStrategyStatus('패턴 AI 학습 실패, 랜덤 추천으로 전환합니다.');
    } finally {
        modelStore.pattern.isTraining = false;
    }
}

async function ensureAttentionModelReady() {
    if (modelStore.attention.isTraining) {
        setStrategyStatus('어텐션 기반 AI 모델 학습 중입니다...');
        return;
    }

    if (trainHistory.length < TRAIN_MIN_ROUNDS) {
        setStrategyStatus('최근 5년 학습 데이터가 부족해 랜덤으로 추천합니다.');
        return;
    }

    if (modelStore.attention.model && modelStore.attention.trainedRounds === trainHistory.length) {
        setStrategyStatus(`어텐션 AI 준비 완료 (${TRAIN_YEARS}년 ${modelStore.attention.trainedRounds}회차)`);
        return;
    }

    modelStore.attention.isTraining = true;
    setStrategyStatus('어텐션 기반 AI 학습 중...');

    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
        const seqLen = 10;
        const samples = buildAttentionSamples(trainHistory, seqLen);
        if (samples.length < 20) {
            setStrategyStatus('어텐션 AI 학습 샘플이 부족해 랜덤 추천으로 전환합니다.');
            return;
        }

        modelStore.attention.model = trainAttentionModel(samples, {
            epochs: 120,
            learningRate: 0.03,
            seqLen
        });
        modelStore.attention.trainedRounds = trainHistory.length;
        setStrategyStatus(`어텐션 AI 준비 완료 (${TRAIN_YEARS}년 ${modelStore.attention.trainedRounds}회차)`);
    } catch (error) {
        console.error('Attention model training error:', error);
        setStrategyStatus('어텐션 AI 학습 실패, 랜덤 추천으로 전환합니다.');
    } finally {
        modelStore.attention.isTraining = false;
    }
}

function generatePatternAiSet() {
    if (!modelStore.pattern.model || trainHistory.length < TRAIN_WINDOW) {
        return generateSingleSet();
    }

    const x = buildFeatureVector(trainHistory, trainHistory.length, TRAIN_WINDOW);
    const probs = predictPatternProbabilities(modelStore.pattern.model, x);
    return sampleNumbersFromDistribution(probs);
}

function generateAttentionAiSet() {
    if (!modelStore.attention.model || trainHistory.length < 10) {
        return generateSingleSet();
    }

    const seq = trainHistory.slice(-10).map((d) => normalizeDrawAsVector(d));
    const forward = attentionForward(modelStore.attention.model, seq);
    return sampleNumbersFromDistribution(forward.probs);
}

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
            // try next source
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
            // continue probing
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
            typeof entry.date === 'string' &&
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
        if (mirrorResults.length > fullHistory.length) {
            setHistories(mirrorResults);
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

        const merged = dedupeHistoryByRound([
            ...recentResults,
            ...(await fetchHistoryFromMirror())
        ]);
        setHistories(merged);
        void hydrateModelHistoryFromMirror();
    } catch (error) {
        console.warn('Official history fetch failed, switching to mirror:', error);
        try {
            const fallbackResults = await fetchHistoryFromMirror();
            renderHistory(fallbackResults.slice(0, HISTORY_WEEKS));
            setHistories(fallbackResults);
        } catch (fallbackError) {
            console.error('History fetch error:', fallbackError);
            historyContainer.innerHTML = '<p>당첨번호 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
        }
    }
}

updateStrategyStatusByMode();
savedSnapshots = readSavedSnapshots();
renderSavedList();
void fetchLottoHistory();

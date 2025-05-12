// ========== GLOBAL VARIABLES ==========
const connection = new Deriv.Connection({
    endpoint: 'frontend.binaryws.com', // Use 'blue.binaryws.com' for real account
    app_id: 1089, // Replace with your app ID if needed
    lang: 'EN'
});

// DOM Elements
const elements = {
    // Connection
    connectBtn: document.getElementById('connect-btn'),
    apiTokenInput: document.getElementById('api-token'),
    connectionStatus: document.getElementById('connection-status'),
    statusDot: document.querySelector('.status-dot'),
    
    // Trading
    tradeForm: document.getElementById('trade-form'),
    authSection: document.getElementById('auth-section'),
    symbolSelect: document.getElementById('symbol-select'),
    currentSymbol: document.getElementById('current-symbol'),
    currentPrice: document.getElementById('current-price'),
    contractTypeBtns: document.querySelectorAll('.contract-btn'),
    duration: document.getElementById('duration'),
    durationUnit: document.getElementById('duration-unit'),
    amount: document.getElementById('amount'),
    placeTradeBtn: document.getElementById('place-trade-btn'),
    tradeResult: document.getElementById('trade-result'),
    accountBalance: document.getElementById('account-balance'),
    
    // Chart
    priceChart: document.getElementById('price-chart'),
    chartCtx: document.getElementById('price-chart').getContext('2d'),
    chartAnnotations: document.getElementById('chart-annotations'),
    timeframeBtns: document.querySelectorAll('.timeframe-btn'),
    
    // Positions
    positionsList: document.getElementById('positions-list'),
    refreshPositions: document.getElementById('refresh-positions'),
    
    // AI
    modelSelect: document.getElementById('model-select'),
    trainBtn: document.getElementById('train-btn'),
    predictBtn: document.getElementById('predict-btn'),
    predictionArrow: document.getElementById('prediction-arrow'),
    predictionText: document.getElementById('prediction-text'),
    confidenceValue: document.getElementById('confidence-value'),
    meterBar: document.querySelector('.meter-bar'),
    backtestChart: document.getElementById('backtest-chart'),
    
    // Risk Management
    riskSlider: document.getElementById('risk-slider'),
    riskValue: document.getElementById('risk-value'),
    stopLoss: document.getElementById('stop-loss'),
    positionSize: document.getElementById('position-size'),
    
    // Pattern Detection
    toggleEngulfing: document.getElementById('toggle-engulfing'),
    toggleDoji: document.getElementById('toggle-doji'),
    toggleTriangle: document.getElementById('toggle-triangle'),
    toggleFlags: document.getElementById('toggle-flags'),
    toggleHeadShoulders: document.getElementById('toggle-headshoulders')
};

// Chart and Trading Variables
let chart;
let candleChart;
let chartData = [];
let currentContractType = 'CALL';
let currentTimeframe = 60;
let currentSymbol = 'R_100';
let currentPrice = 0;
let accountBalance = 0;
let positions = [];
let activeSubscription;
let priceUpdateInterval;
let predictionModel;
let isModelTrained = false;

// Synthetic Indices Symbols
const syntheticSymbols = {
    'R_100': 'Volatility 100 Index',
    'R_75': 'Volatility 75 Index',
    'R_50': 'Volatility 50 Index',
    '1HZ100V': 'Bull/Bear 100',
    '1HZ150V': 'Bull/Bear 150',
    '1HZ250V': 'Bull/Bear 250',
    '1HZ500V': 'Bull/Bear 500',
    'RDBULL': 'Step Index',
    'BOOM1000': 'Boom 1000',
    'CRASH1000': 'Crash 1000'
};

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    initializeChart();
    updateRiskValue();
});

function initializeEventListeners() {
    // Connection
    elements.connectBtn.addEventListener('click', handleConnect);
    
    // Trading
    elements.contractTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.contractTypeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentContractType = btn.dataset.type;
        });
    });
    
    elements.symbolSelect.addEventListener('change', () => {
        currentSymbol = elements.symbolSelect.value;
        elements.currentSymbol.textContent = currentSymbol;
        updateChart();
    });
    
    elements.placeTradeBtn.addEventListener('click', placeTrade);
    
    // Timeframe
    elements.timeframeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.timeframeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTimeframe = parseInt(btn.dataset.timeframe);
            updateChart();
        });
    });
    
    // Positions
    elements.refreshPositions.addEventListener('click', fetchPositions);
    
    // AI
    elements.trainBtn.addEventListener('click', trainModel);
    elements.predictBtn.addEventListener('click', getPrediction);
    
    // Risk Management
    elements.riskSlider.addEventListener('input', updateRiskValue);
    elements.stopLoss.addEventListener('input', calculatePositionSize);
    
    // Pattern Detection
    elements.toggleEngulfing.addEventListener('change', detectPatterns);
    elements.toggleDoji.addEventListener('change', detectPatterns);
    elements.toggleTriangle.addEventListener('change', detectPatterns);
    elements.toggleFlags.addEventListener('change', detectPatterns);
    elements.toggleHeadShoulders.addEventListener('change', detectPatterns);
}

// ========== CONNECTION HANDLING ==========
function handleConnect() {
    const apiToken = elements.apiTokenInput.value.trim();
    
    if (!apiToken) {
        showNotification('Please enter your API token', 'error');
        return;
    }
    
    elements.connectBtn.classList.add('loading');
    
    connection.authorize(apiToken).then(response => {
        if (response.error) {
            showNotification(response.error.message, 'error');
            elements.connectBtn.classList.remove('loading');
            return;
        }
        
        // Connection successful
        showNotification('Successfully connected to Deriv', 'success');
        elements.connectBtn.classList.remove('loading');
        elements.connectionStatus.querySelector('span').textContent = 'Connected';
        elements.statusDot.classList.add('connected');
        elements.authSection.classList.add('hidden');
        elements.tradeForm.classList.remove('hidden');
        
        // Get account balance
        getAccountBalance();
        
        // Initialize trading
        updateChart();
        fetchPositions();
        
        // Start price updates
        subscribeToPriceUpdates();
    }).catch(error => {
        showNotification('Connection failed: ' + error.message, 'error');
        elements.connectBtn.classList.remove('loading');
    });
}

function subscribeToPriceUpdates() {
    if (activeSubscription) {
        activeSubscription.unsubscribe();
    }
    
    activeSubscription = connection.subscribe({
        ticks: currentSymbol,
        subscribe: 1
    });
    
    activeSubscription.on('tick', response => {
        const tick = response.tick;
        currentPrice = parseFloat(tick.quote);
        elements.currentPrice.textContent = currentPrice.toFixed(2);
        
        // Update last candle if it's the current timeframe
        if (chartData.length > 0) {
            const lastCandle = chartData[chartData.length - 1];
            const now = new Date();
            const candleTime = new Date(lastCandle.timestamp * 1000);
            
            if (now.getTime() - candleTime.getTime() < currentTimeframe * 1000) {
                lastCandle.close = currentPrice;
                if (currentPrice > lastCandle.high) lastCandle.high = currentPrice;
                if (currentPrice < lastCandle.low) lastCandle.low = currentPrice;
                updateChart();
            }
        }
        
        calculatePositionSize();
    });
}

function getAccountBalance() {
    connection.send({ balance: 1, account: 'current' }).then(response => {
        if (response.error) {
            console.error('Error getting balance:', response.error);
            return;
        }
        
        accountBalance = parseFloat(response.balance.balance);
        elements.accountBalance.textContent = accountBalance.toFixed(2);
    });
}

// ========== CHART FUNCTIONS ==========
function initializeChart() {
    chart = new Chart(elements.chartCtx, {
        type: 'candlestick',
        data: {
            datasets: [{
                label: currentSymbol,
                data: [],
                color: {
                    up: '#10c987',
                    down: '#ff5e5e',
                    unchanged: '#6c757d',
                },
                borderColor: {
                    up: '#10c987',
                    down: '#ff5e5e',
                    unchanged: '#6c757d',
                },
                borderWidth: 1,
                fractionalDigitsCount: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'minute',
                        displayFormats: {
                            minute: 'HH:mm'
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#e9ecef'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#e9ecef'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            const data = context.raw;
                            return [
                                `Open: ${data.o.toFixed(2)}`,
                                `High: ${data.h.toFixed(2)}`,
                                `Low: ${data.l.toFixed(2)}`,
                                `Close: ${data.c.toFixed(2)}`
                            ];
                        }
                    }
                }
            }
        }
    });
}

async function updateChart() {
    elements.placeTradeBtn.disabled = true;
    elements.placeTradeBtn.textContent = 'Loading data...';
    
    try {
        const end = Math.floor(Date.now() / 1000);
        const start = end - (currentTimeframe * 300); // Get 300 periods
        
        const response = await connection.send({
            ticks_history: currentSymbol,
            adjust_start_time: 1,
            count: 300,
            end: end,
            start: start,
            style: 'candles',
            granularity: currentTimeframe
        });
        
        if (response.error) {
            showNotification(response.error.message, 'error');
            return;
        }
        
        chartData = response.candles.map(candle => ({
            timestamp: candle.epoch,
            open: parseFloat(candle.open),
            high: parseFloat(candle.high),
            low: parseFloat(candle.low),
            close: parseFloat(candle.close)
        }));
        
        // Update chart
        chart.data.datasets[0].data = chartData.map(candle => ({
            x: new Date(candle.timestamp * 1000),
            o: candle.open,
            h: candle.high,
            l: candle.low,
            c: candle.close
        }));
        
        chart.update();
        detectPatterns();
        
        // Update current price display
        if (chartData.length > 0) {
            currentPrice = chartData[chartData.length - 1].close;
            elements.currentPrice.textContent = currentPrice.toFixed(2);
        }
        
        // Resubscribe to ticks with new symbol
        subscribeToPriceUpdates();
    } catch (error) {
        showNotification('Error loading chart data: ' + error.message, 'error');
    } finally {
        elements.placeTradeBtn.disabled = false;
        elements.placeTradeBtn.textContent = 'Buy Contract';
    }
}

// ========== PATTERN DETECTION ==========
function detectPatterns() {
    // Clear previous annotations
    elements.chartAnnotations.innerHTML = '';
    
    if (chartData.length < 5) return;
    
    // Check which patterns are enabled
    const patternsEnabled = {
        engulfing: elements.toggleEngulfing.checked,
        doji: elements.toggleDoji.checked,
        triangle: elements.toggleTriangle.checked,
        flags: elements.toggleFlags.checked,
        headShoulders: elements.toggleHeadShoulders.checked
    };
    
    // Detect patterns for each candle
    for (let i = 4; i < chartData.length; i++) {
        const current = chartData[i];
        const prev1 = chartData[i - 1];
        const prev2 = chartData[i - 2];
        const prev3 = chartData[i - 3];
        const prev4 = chartData[i - 4];
        
        // Bullish Engulfing
        if (patternsEnabled.engulfing && isBullishEngulfing(prev1, current)) {
            addPatternMarker(i, 'Bullish Engulfing', 'bullish');
        }
        
        // Bearish Engulfing
        if (patternsEnabled.engulfing && isBearishEngulfing(prev1, current)) {
            addPatternMarker(i, 'Bearish Engulfing', 'bearish');
        }
        
        // Doji
        if (patternsEnabled.doji && isDoji(current)) {
            addPatternMarker(i, 'Doji', 'neutral');
        }
        
        // Triangles (needs more data points)
        if (patternsEnabled.triangle && i > 10) {
            const triangleType = detectTriangle(chartData.slice(i - 10, i + 1));
            if (triangleType) {
                addPatternMarker(i, triangleType, 'triangle');
            }
        }
        
        // Flags (needs more data points)
        if (patternsEnabled.flags && i > 15) {
            const flagType = detectFlag(chartData.slice(i - 15, i + 1));
            if (flagType) {
                addPatternMarker(i, flagType, flagType.includes('Bull') ? 'bullish' : 'bearish');
            }
        }
        
        // Head & Shoulders (needs more data points)
        if (patternsEnabled.headShoulders && i > 20) {
            const hsType = detectHeadShoulders(chartData.slice(i - 20, i + 1));
            if (hsType) {
                addPatternMarker(i, hsType, hsType.includes('Head') ? 'bearish' : 'bullish');
            }
        }
    }
}

function addPatternMarker(index, text, type) {
    const candle = chartData[index];
    const xPos = (index / chartData.length) * 100;
    const yPos = ((chart.scales.y.max - candle.high) / (chart.scales.y.max - chart.scales.y.min)) * 100;
    
    const marker = document.createElement('div');
    marker.className = `pattern-marker ${type}-marker`;
    marker.textContent = text;
    marker.style.left = `${xPos}%`;
    marker.style.top = `${yPos}%`;
    
    elements.chartAnnotations.appendChild(marker);
}

// Pattern Detection Helpers
function isBullishEngulfing(prev, current) {
    return prev.close < prev.open && 
           current.open < prev.close && 
           current.close > prev.open;
}

function isBearishEngulfing(prev, current) {
    return prev.close > prev.open && 
           current.open > prev.close && 
           current.close < prev.open;
}

function isDoji(candle) {
    const bodySize = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    return bodySize <= range * 0.1 && range > 0;
}

function detectTriangle(data) {
    // Simple triangle detection (ascending/descending/symmetrical)
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    
    // Check for ascending triangle (flat top, rising bottom)
    const topResistance = Math.max(...highs);
    const bottomSupport = Math.min(...lows);
    
    if (highs.filter(h => h >= topResistance * 0.99).length >= 3 && 
        lows.every((l, i) => i === 0 || l > lows[i - 1])) {
        return 'Ascending Triangle';
    }
    
    // Check for descending triangle (flat bottom, falling top)
    if (lows.filter(l => l <= bottomSupport * 1.01).length >= 3 && 
        highs.every((h, i) => i === 0 || h < highs[i - 1])) {
        return 'Descending Triangle';
    }
    
    // Check for symmetrical triangle (converging highs and lows)
    const highSlope = (highs[highs.length - 1] - highs[0]) / highs.length;
    const lowSlope = (lows[lows.length - 1] - lows[0]) / lows.length;
    
    if (highSlope < 0 && lowSlope > 0 && Math.abs(highSlope) > 0.001 && Math.abs(lowSlope) > 0.001) {
        return 'Symmetrical Triangle';
    }
    
    return null;
}

function detectFlag(data) {
    // Simple flag pattern detection
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const closes = data.map(d => d.close);
    
    // Check for bull flag (sharp rise followed by parallel channel)
    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));
    
    if (firstHalf.length >= 5 && secondHalf.length >= 5) {
        const firstHighs = firstHalf.map(d => d.high);
        const firstLows = firstHalf.map(d => d.low);
        const secondHighs = secondHalf.map(d => d.high);
        const secondLows = secondHalf.map(d => d.low);
        
        // Bull flag: strong upward move followed by downward parallel channel
        const firstTrend = firstHalf[firstHalf.length - 1].close - firstHalf[0].close;
        if (firstTrend > 0 && firstTrend > (firstHalf[0].close * 0.02)) {
            const highDiff = Math.max(...secondHighs) - Math.min(...secondHighs);
            const lowDiff = Math.max(...secondLows) - Math.min(...secondLows);
            
            if (highDiff < (Math.max(...secondHighs) * 0.01) && 
                lowDiff < (Math.max(...secondLows) * 0.01)) {
                return 'Bull Flag';
            }
        }
        
        // Bear flag: strong downward move followed by upward parallel channel
        if (firstTrend < 0 && Math.abs(firstTrend) > (firstHalf[0].close * 0.02)) {
            const highDiff = Math.max(...secondHighs) - Math.min(...secondHighs);
            const lowDiff = Math.max(...secondLows) - Math.min(...secondLows);
            
            if (highDiff < (Math.max(...secondHighs) * 0.01) && 
                lowDiff < (Math.max(...secondLows) * 0.01)) {
                return 'Bear Flag';
            }
        }
    }
    
    return null;
}

function detectHeadShoulders(data) {
    // Simple head and shoulders detection
    if (data.length < 20) return null;
    
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    
    // Find potential peaks
    const peaks = [];
    for (let i = 1; i < highs.length - 1; i++) {
        if (highs[i] > highs[i - 1] && highs[i] > highs[i + 1]) {
            peaks.push({ index: i, value: highs[i] });
        }
    }
    
    if (peaks.length < 3) return null;
    
    // Check for head and shoulders pattern (left shoulder, head, right shoulder)
    for (let i = 1; i < peaks.length - 1; i++) {
        const left = peaks[i - 1];
        const head = peaks[i];
        const right = peaks[i + 1];
        
        if (head.value > left.value && head.value > right.value && 
            Math.abs(right.value - left.value) < (head.value * 0.02) && 
            right.index - left.index >= 5) {
            return 'Head & Shoulders';
        }
    }
    
    // Check for inverse head and shoulders pattern
    const lows = data.map(d => d.low);
    const troughs = [];
    for (let i = 1; i < lows.length - 1; i++) {
        if (lows[i] < lows[i - 1] && lows[i] < lows[i + 1]) {
            troughs.push({ index: i, value: lows[i] });
        }
    }
    
    if (troughs.length < 3) return null;
    
    for (let i = 1; i < troughs.length - 1; i++) {
        const left = troughs[i - 1];
        const head = troughs[i];
        const right = troughs[i + 1];
        
        if (head.value < left.value && head.value < right.value && 
            Math.abs(right.value - left.value) < (head.value * 0.02) && 
            right.index - left.index >= 5) {
            return 'Inverse Head & Shoulders';
        }
    }
    
    return null;
}

// ========== TRADING FUNCTIONS ==========
function placeTrade() {
    const amount = parseFloat(elements.amount.value);
    const duration = parseInt(elements.duration.value);
    const durationUnit = elements.durationUnit.value;
    
    if (!amount || amount <= 0) {
        showNotification('Please enter a valid amount', 'error');
        return;
    }
    
    if (!duration || duration <= 0) {
        showNotification('Please enter a valid duration', 'error');
        return;
    }
    
    elements.placeTradeBtn.classList.add('loading');
    elements.placeTradeBtn.disabled = true;
    
    const request = {
        proposal: 1,
        amount: amount.toFixed(2),
        basis: 'stake',
        contract_type: currentContractType,
        currency: 'USD',
        duration: duration,
        duration_unit: durationUnit,
        symbol: currentSymbol
    };
    
    connection.send(request).then(response => {
        if (response.error) {
            showNotification(response.error.message, 'error');
            return;
        }
        
        const proposal = response.proposal;
        const contractId = proposal.longcode.match(/ID:\s(\w+)/)[1];
        
        // Buy the contract
        connection.send({
            buy: contractId,
            price: amount.toFixed(2)
        }).then(buyResponse => {
            if (buyResponse.error) {
                showNotification(buyResponse.error.message, 'error');
                return;
            }
            
            showNotification('Contract purchased successfully!', 'success');
            elements.tradeResult.textContent = `Contract ID: ${buyResponse.buy.contract_id}`;
            elements.tradeResult.className = 'success';
            elements.tradeResult.style.display = 'block';
            
            // Update balance and positions
            getAccountBalance();
            setTimeout(fetchPositions, 2000); // Wait a bit for the position to appear
        }).catch(error => {
            showNotification('Error buying contract: ' + error.message, 'error');
        }).finally(() => {
            elements.placeTradeBtn.classList.remove('loading');
            elements.placeTradeBtn.disabled = false;
        });
    }).catch(error => {
        showNotification('Error creating proposal: ' + error.message, 'error');
        elements.placeTradeBtn.classList.remove('loading');
        elements.placeTradeBtn.disabled = false;
    });
}

function fetchPositions() {
    connection.send({ portfolio: 1 }).then(response => {
        if (response.error) {
            console.error('Error fetching positions:', response.error);
            return;
        }
        
        positions = response.portfolio.contracts || [];
        renderPositions();
    }).catch(error => {
        console.error('Error fetching positions:', error);
    });
}

function renderPositions() {
    if (positions.length === 0) {
        elements.positionsList.innerHTML = '<div class="no-positions">No open positions</div>';
        return;
    }
    
    elements.positionsList.innerHTML = '';
    
    positions.forEach(position => {
        const positionEl = document.createElement('div');
        positionEl.className = 'position-item';
        
        const isBuy = position.longcode.toLowerCase().includes('higher');
        const profit = parseFloat(position.buy_price) - parseFloat(position.bid_price);
        const profitPercentage = (profit / parseFloat(position.buy_price)) * 100;
        
        positionEl.innerHTML = `
            <div class="position-header">
                <span>${position.symbol}</span>
                <span class="position-type ${isBuy ? 'buy' : 'sell'}">${isBuy ? 'BUY' : 'SELL'}</span>
            </div>
            <div class="position-details">
                <span>$${parseFloat(position.buy_price).toFixed(2)}</span>
                <span class="${profit >= 0 ? 'position-profit' : 'position-loss'}">
                    ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} (${profitPercentage.toFixed(2)}%)
                </span>
            </div>
            <div class="position-time">${new Date(position.date_start * 1000).toLocaleTimeString()}</div>
        `;
        
        elements.positionsList.appendChild(positionEl);
    });
}

// ========== RISK MANAGEMENT ==========
function updateRiskValue() {
    const riskPercentage = elements.riskSlider.value;
    elements.riskValue.textContent = `${riskPercentage}%`;
    calculatePositionSize();
}

function calculatePositionSize() {
    if (!accountBalance || !elements.stopLoss.value) return;
    
    const riskPercentage = parseFloat(elements.riskSlider.value) / 100;
    const stopLossPips = parseFloat(elements.stopLoss.value);
    const pipValue = 0.01; // Assuming 1 pip = 0.01 for synthetic indices
    
    if (stopLossPips <= 0) return;
    
    const riskAmount = accountBalance * riskPercentage;
    const positionSize = riskAmount / (stopLossPips * pipValue);
    
    elements.positionSize.textContent = `$${positionSize.toFixed(2)}`;
}

// ========== AI FUNCTIONS ==========
async function trainModel() {
    elements.trainBtn.classList.add('loading');
    elements.trainBtn.disabled = true;
    
    try {
        // In a real app, you would train the model with historical data
        // This is a simplified version that simulates training
        
        // Simulate training delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Create a simple model (in a real app, you would use TensorFlow.js)
        predictionModel = {
            predict: (data) => {
                // Simple prediction based on recent trend
                const last5 = data.slice(-5);
                const trend = last5[last5.length - 1].close - last5[0].close;
                
                if (Math.abs(trend) < (last5[0].close * 0.005)) {
                    return { direction: 'neutral', confidence: 0.5 };
                }
                
                return {
                    direction: trend > 0 ? 'up' : 'down',
                    confidence: Math.min(0.9, Math.abs(trend) / (last5[0].close * 0.02))
                };
            }
        };
        
        isModelTrained = true;
        showNotification('Model training completed', 'success');
    } catch (error) {
        showNotification('Error training model: ' + error.message, 'error');
    } finally {
        elements.trainBtn.classList.remove('loading');
        elements.trainBtn.disabled = false;
    }
}

function getPrediction() {
    if (!isModelTrained) {
        showNotification('Please train the model first', 'warning');
        return;
    }
    
    if (chartData.length < 10) {
        showNotification('Not enough data for prediction', 'warning');
        return;
    }
    
    elements.predictBtn.classList.add('loading');
    elements.predictBtn.disabled = true;
    
    try {
        // Get prediction from model
        const prediction = predictionModel.predict(chartData);
        
        // Update UI
        elements.predictionArrow.textContent = prediction.direction === 'up' ? '↑' : 
                                            prediction.direction === 'down' ? '↓' : '→';
        elements.predictionArrow.className = prediction.direction === 'up' ? 'buy-signal' : 
                                           prediction.direction === 'down' ? 'sell-signal' : 'neutral-signal';
        elements.predictionText.textContent = prediction.direction === 'up' ? 'Bullish' : 
                                            prediction.direction === 'down' ? 'Bearish' : 'Neutral';
        elements.predictionText.className = prediction.direction === 'up' ? 'buy-signal' : 
                                          prediction.direction === 'down' ? 'sell-signal' : 'neutral-signal';
        
        // Update confidence meter
        const confidencePercent = Math.round(prediction.confidence * 100);
        elements.meterBar.style.width = `${confidencePercent}%`;
        elements.confidenceValue.textContent = `${confidencePercent}% confidence`;
        
        showNotification(`Prediction: ${prediction.direction} (${confidencePercent}% confidence)`, 'success');
    } catch (error) {
        showNotification('Error getting prediction: ' + error.message, 'error');
    } finally {
        elements.predictBtn.classList.remove('loading');
        elements.predictBtn.disabled = false;
    }
}

// ========== UTILITY FUNCTIONS ==========
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 5000);
}

// ========== CLEANUP ON EXIT ==========
window.addEventListener('beforeunload', () => {
    if (activeSubscription) {
        activeSubscription.unsubscribe();
    }
    if (connection) {
        connection.disconnect();
    }
});
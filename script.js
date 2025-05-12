// ========== GLOBAL VARIABLES ==========
let ws = null; // WebSocket connection
let chart = null;
let currentContractType = 'CALL';
let currentTimeframe = 60;
let currentSymbol = 'R_100';
let currentPrice = 0;
let accountBalance = 0;
let positions = [];
let predictionModel = null;
let isModelTrained = false;
let isOnline = false;
let historicalData = [];

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    initializeChart();
    setupConnectionMonitoring();
});

function initializeEventListeners() {
    // Connection
    document.getElementById('connect_btn').addEventListener('click', handleConnect);
    
    // Trading
    document.querySelectorAll('.contract-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.contract-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentContractType = btn.dataset.type;
        });
    });
    
    document.getElementById('symbol-select').addEventListener('change', () => {
        currentSymbol = document.getElementById('symbol-select').value;
        document.getElementById('current-symbol').textContent = currentSymbol;
        updateChart();
    });
    
    document.getElementById('place-trade-btn').addEventListener('click', placeTrade);
    
    // Timeframe
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTimeframe = parseInt(btn.dataset.timeframe);
            updateChart();
        });
    });
    
    // Positions
    document.getElementById('refresh-positions').addEventListener('click', fetchPositions);
    
    // AI
    document.getElementById('train-btn').addEventListener('click', trainModel);
    document.getElementById('predict-btn').addEventListener('click', getPrediction);
    
    // Network detection
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
}

// ========== CONNECTION HANDLING ==========
async function handleConnect() {
    const appId = document.getElementById('app_id_input').value.trim();
    const apiToken = document.getElementById('api_token_input').value.trim();
    
    if (!appId || !apiToken) {
        showNotification('Please enter both App ID and API Token', 'error');
        return;
    }
    
    if (!navigator.onLine) {
        showNotification('No internet connection', 'error');
        return;
    }

    const connectBtn = document.getElementById('connect_btn');
    connectBtn.classList.add('loading');
    connectBtn.disabled = true;
    
    try {
        // Close existing connection if any
        if (ws) {
            ws.close();
        }
        
        // Initialize WebSocket connection
        ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
        
        // Set up WebSocket event handlers
        ws.onopen = () => {
            console.log("WebSocket connected");
            
            // Authorize connection
            ws.send(JSON.stringify({ authorize: apiToken }));
            
            // Subscribe to ticks for the current symbol
            ws.send(JSON.stringify({
                ticks: currentSymbol,
                subscribe: 1
            }));
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        };
        
        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            showNotification('WebSocket connection error', 'error');
            isOnline = false;
            updateConnectionStatus();
        };
        
        ws.onclose = () => {
            console.log("WebSocket disconnected");
            isOnline = false;
            updateConnectionStatus();
        };
        
    } catch (error) {
        isOnline = false;
        setConnectionState('offline', 'Disconnected');
        showNotification(`Connection failed: ${error.message}`, 'error');
        console.error('Connection error:', error);
    } finally {
        const connectBtn = document.getElementById('connect_btn');
        connectBtn.classList.remove('loading');
        connectBtn.disabled = false;
    }
}

function handleWebSocketMessage(data) {
    switch(data.msg_type) {
        case 'authorize':
            handleAuthorization(data);
            break;
        case 'tick':
            handleTickData(data);
            break;
        case 'proposal':
            handleProposal(data);
            break;
        case 'buy':
            handleBuyResponse(data);
            break;
        case 'portfolio':
            handlePortfolio(data);
            break;
        case 'balance':
            handleBalance(data);
            break;
        case 'history':
            handleHistory(data);
            break;
        default:
            console.log('Unhandled message type:', data.msg_type);
    }
}

function handleAuthorization(data) {
    if (data.error) {
        showNotification(`Authorization failed: ${data.error.message}`, 'error');
        return;
    }
    
    isOnline = true;
    setConnectionState('online', 'Connected');
    showNotification(`Connected as ${data.authorize.email}`, 'success');
    
    // Show trading interface
    document.getElementById('credentials').style.display = 'none';
    document.getElementById('trading-interface').classList.remove('hidden');
    
    // Initialize trading
    getAccountBalance();
    updateChart();
}

function handleTickData(data) {
    currentPrice = parseFloat(data.tick.quote);
    document.getElementById('current-price').textContent = currentPrice.toFixed(2);
    
    // Update last candle if it's the current timeframe
    if (chart.data.datasets[0].data.length > 0) {
        const lastCandle = chart.data.datasets[0].data[chart.data.datasets[0].data.length - 1];
        const now = new Date();
        const candleTime = new Date(lastCandle.x);
        
        if (now.getTime() - candleTime.getTime() < currentTimeframe * 60 * 1000) {
            lastCandle.c = currentPrice;
            if (currentPrice > lastCandle.h) lastCandle.h = currentPrice;
            if (currentPrice < lastCandle.l) lastCandle.l = currentPrice;
            chart.update();
        }
    }
}

function handleProposal(data) {
    // Handle proposal response
    if (data.error) {
        showNotification(`Proposal error: ${data.error.message}`, 'error');
        return;
    }
    // Process proposal data as needed
}

function handleBuyResponse(data) {
    // Handle buy response
    if (data.error) {
        showNotification(`Buy error: ${data.error.message}`, 'error');
        return;
    }
    showNotification('Contract purchased successfully!', 'success');
    const tradeResult = document.getElementById('trade-result');
    tradeResult.textContent = `Contract ID: ${data.buy.contract_id}`;
    tradeResult.className = 'success';
    tradeResult.style.display = 'block';
    
    // Update account
    getAccountBalance();
    setTimeout(fetchPositions, 2000);
}

function handlePortfolio(data) {
    // Handle portfolio response
    positions = data.portfolio?.contracts || [];
    renderPositions();
}

function handleBalance(data) {
    // Handle balance response
    if (data.balance) {
        accountBalance = parseFloat(data.balance.balance);
        document.getElementById('account-balance').textContent = accountBalance.toFixed(2);
    }
}

function handleHistory(data) {
    // Handle history response (for chart data)
    if (data.candles) {
        historicalData = data.candles.map(candle => ({
            x: new Date(candle.epoch * 1000),
            o: parseFloat(candle.open),
            h: parseFloat(candle.high),
            l: parseFloat(candle.low),
            c: parseFloat(candle.close),
            v: parseFloat(candle.volume) || 0
        }));
        
        chart.data.datasets[0].data = historicalData;
        chart.update();
        
        // Update current price
        if (historicalData.length > 0) {
            currentPrice = historicalData[historicalData.length - 1].c;
            document.getElementById('current-price').textContent = currentPrice.toFixed(2);
        }
        
        // Detect patterns
        detectPatterns();
        
        // If model is trained, update prediction
        if (isModelTrained) {
            getPrediction();
        }
    }
}

// ========== TRADING FUNCTIONS ==========
async function placeTrade() {
    if (!isOnline || !ws) {
        showNotification('Not connected to Deriv', 'error');
        return;
    }

    const amount = parseFloat(document.getElementById('amount').value);
    const duration = parseInt(document.getElementById('duration').value);
    const durationUnit = document.getElementById('duration-unit').value;
    
    if (!amount || amount <= 0) {
        showNotification('Please enter a valid amount', 'error');
        return;
    }
    
    const placeTradeBtn = document.getElementById('place-trade-btn');
    placeTradeBtn.classList.add('loading');
    placeTradeBtn.disabled = true;
    
    try {
        // Create proposal
        const proposalReq = {
            proposal: 1,
            amount: amount.toFixed(2),
            basis: 'stake',
            contract_type: currentContractType,
            currency: 'USD',
            duration,
            duration_unit: durationUnit,
            symbol: currentSymbol
        };
        
        ws.send(JSON.stringify(proposalReq));
        
    } catch (error) {
        showNotification(`Trade failed: ${error.message}`, 'error');
        const tradeResult = document.getElementById('trade-result');
        tradeResult.textContent = `Error: ${error.message}`;
        tradeResult.className = 'error';
        tradeResult.style.display = 'block';
    } finally {
        const placeTradeBtn = document.getElementById('place-trade-btn');
        placeTradeBtn.classList.remove('loading');
        placeTradeBtn.disabled = false;
    }
}

async function fetchPositions() {
    if (!isOnline || !ws) return;
    
    try {
        ws.send(JSON.stringify({ portfolio: 1 }));
    } catch (error) {
        console.error('Error fetching positions:', error);
        isOnline = false;
        updateConnectionStatus();
    }
}

function renderPositions() {
    const positionsList = document.getElementById('positions-list');
    if (positions.length === 0) {
        positionsList.innerHTML = '<div class="no-positions">No open positions</div>';
        return;
    }
    
    positionsList.innerHTML = '';
    
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
        
        positionsList.appendChild(positionEl);
    });
}

// ========== CHART FUNCTIONS ==========
function initializeChart() {
    const chartCtx = document.getElementById('price-chart').getContext('2d');
    chart = new Chart(chartCtx, {
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
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        callback: (value) => '$' + value.toFixed(2)
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
    updateChart();
}

async function updateChart() {
    if (!isOnline || !ws) return;
    
    const placeTradeBtn = document.getElementById('place-trade-btn');
    placeTradeBtn.disabled = true;
    placeTradeBtn.textContent = 'Loading data...';
    
    try {
        ws.send(JSON.stringify({
            ticks_history: currentSymbol,
            adjust_start_time: 1,
            count: 500,
            end: 'latest',
            style: 'candles',
            granularity: currentTimeframe
        }));
    } catch (error) {
        console.error('Chart update error:', error);
        isOnline = false;
        updateConnectionStatus();
    } finally {
        const placeTradeBtn = document.getElementById('place-trade-btn');
        placeTradeBtn.disabled = false;
        placeTradeBtn.textContent = 'Buy Contract';
    }
}

// ========== PATTERN DETECTION ==========
function detectPatterns() {
    if (!chart?.data?.datasets[0]?.data) return;
    
    // Clear previous annotations
    document.getElementById('chart-annotations').innerHTML = '';
    
    const candles = chart.data.datasets[0].data;
    if (candles.length < 5) return;
    
    // Check which patterns are enabled
    const checkEngulfing = document.getElementById('toggle-engulfing').checked;
    const checkDoji = document.getElementById('toggle-doji').checked;
    const checkHammer = document.getElementById('toggle-hammer').checked;
    
    // Detect patterns (simplified examples)
    for (let i = 4; i < candles.length; i++) {
        const current = candles[i];
        const prev = candles[i-1];
        const prev2 = candles[i-2];
        
        // Bullish Engulfing
        if (checkEngulfing && isBullishEngulfing(prev, current)) {
            addPatternMarker(i, 'Bullish Engulfing', 'bullish');
        }
        
        // Bearish Engulfing
        if (checkEngulfing && isBearishEngulfing(prev, current)) {
            addPatternMarker(i, 'Bearish Engulfing', 'bearish');
        }
        
        // Doji
        if (checkDoji && isDoji(current)) {
            addPatternMarker(i, 'Doji', 'neutral');
        }
        
        // Hammer
        if (checkHammer && isHammer(current)) {
            addPatternMarker(i, 'Hammer', 'bullish');
        }
    }
}

function isBullishEngulfing(prev, current) {
    return prev.o > prev.c && // Previous was bearish
           current.c > current.o && // Current is bullish
           current.o < prev.c && // Opens below previous close
           current.c > prev.o; // Closes above previous open
}

function isBearishEngulfing(prev, current) {
    return prev.o < prev.c && // Previous was bullish
           current.c < current.o && // Current is bearish
           current.o > prev.c && // Opens above previous close
           current.c < prev.o; // Closes below previous open
}

function isDoji(candle) {
    const bodySize = Math.abs(candle.c - candle.o);
    const range = candle.h - candle.l;
    return bodySize <= range * 0.1 && range > 0;
}

function isHammer(candle) {
    const bodySize = Math.abs(candle.c - candle.o);
    const lowerShadow = Math.min(candle.o, candle.c) - candle.l;
    const upperShadow = candle.h - Math.max(candle.o, candle.c);
    return lowerShadow >= 2 * bodySize && upperShadow <= bodySize * 0.5;
}

function addPatternMarker(index, text, type) {
    const candles = chart.data.datasets[0].data;
    const candle = candles[index];
    const xPos = (index / candles.length) * 100;
    const yPos = ((chart.scales.y.max - candle.h) / (chart.scales.y.max - chart.scales.y.min)) * 100;
    
    const marker = document.createElement('div');
    marker.className = `pattern-marker ${type}-marker`;
    marker.textContent = text;
    marker.style.left = `${xPos}%`;
    marker.style.top = `${yPos}%`;
    
    document.getElementById('chart-annotations').appendChild(marker);
}

// ========== AI PREDICTION ENGINE ==========
async function trainModel() {
    if (!isOnline) {
        showNotification('Not connected to Deriv', 'error');
        return;
    }

    if (historicalData.length < 100) {
        showNotification('Need at least 100 data points to train', 'warning');
        return;
    }

    const trainBtn = document.getElementById('train-btn');
    trainBtn.classList.add('loading');
    trainBtn.disabled = true;
    document.getElementById('model-status').textContent = 'Training model...';
    
    try {
        // Prepare training data
        const trainingData = prepareTrainingData(historicalData);
        
        // Create and train model
        predictionModel = await createAndTrainModel(trainingData);
        
        isModelTrained = true;
        document.getElementById('model-status').textContent = 'Model: Ready (LSTM)';
        showNotification('AI model trained successfully', 'success');
        
        // Get initial prediction
        getPrediction();
        
    } catch (error) {
        showNotification('Error training model: ' + error.message, 'error');
        console.error('Training error:', error);
        document.getElementById('model-status').textContent = 'Model: Training failed';
    } finally {
        const trainBtn = document.getElementById('train-btn');
        trainBtn.classList.remove('loading');
        trainBtn.disabled = false;
    }
}

function prepareTrainingData(data) {
    // Convert price data to percentage changes
    const priceChanges = [];
    for (let i = 1; i < data.length; i++) {
        const change = (data[i].c - data[i-1].c) / data[i-1].c;
        priceChanges.push(change);
    }
    
    // Create sequences for LSTM
    const sequenceLength = 20;
    const sequences = [];
    const labels = [];
    
    for (let i = sequenceLength; i < priceChanges.length; i++) {
        sequences.push(priceChanges.slice(i - sequenceLength, i));
        // Label is 1 if price increased, 0 if decreased
        labels.push(priceChanges[i] > 0 ? 1 : 0);
    }
    
    return {
        sequences,
        labels
    };
}

async function createAndTrainModel(trainingData) {
    const model = tf.sequential();
    
    // Add LSTM layer
    model.add(tf.layers.lstm({
        units: 32,
        inputShape: [trainingData.sequences[0].length, 1],
        returnSequences: false
    }));
    
    // Add dense output layer
    model.add(tf.layers.dense({
        units: 1,
        activation: 'sigmoid'
    }));
    
    // Compile the model
    model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
    });
    
    // Convert data to tensors
    const xs = tf.tensor3d(
        trainingData.sequences.map(seq => seq.map(val => [val])),
        [trainingData.sequences.length, trainingData.sequences[0].length, 1]
    );
    const ys = tf.tensor2d(
        trainingData.labels,
        [trainingData.labels.length, 1]
    );
    
    // Train the model
    await model.fit(xs, ys, {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        verbose: 0
    });
    
    return model;
}

async function getPrediction() {
    if (!isOnline) {
        showNotification('Not connected to Deriv', 'error');
        return;
    }

    if (!isModelTrained) {
        showNotification('Please train the model first', 'warning');
        return;
    }
    
    if (historicalData.length < 50) {
        showNotification('Not enough data for prediction', 'warning');
        return;
    }
    
    const predictBtn = document.getElementById('predict-btn');
    predictBtn.classList.add('loading');
    predictBtn.disabled = true;
    
    try {
        // Prepare recent data for prediction
        const priceChanges = [];
        for (let i = 1; i < historicalData.length; i++) {
            const change = (historicalData[i].c - historicalData[i-1].c) / historicalData[i-1].c;
            priceChanges.push(change);
        }
        
        // Get last sequence
        const sequenceLength = 20;
        const sequence = priceChanges.slice(-sequenceLength);
        
        // Create tensor and predict
        const inputTensor = tf.tensor3d(
            [sequence.map(val => [val])],
            [1, sequenceLength, 1]
        );
        const prediction = await predictionModel.predict(inputTensor).data();
        const confidence = prediction[0];
        
        // Determine direction
        let direction, arrow, directionText, directionClass;
        if (confidence > 0.6) {
            direction = 'up';
            arrow = '↑';
            directionText = 'Bullish';
            directionClass = 'buy-signal';
        } else if (confidence < 0.4) {
            direction = 'down';
            arrow = '↓';
            directionText = 'Bearish';
            directionClass = 'sell-signal';
        } else {
            direction = 'neutral';
            arrow = '→';
            directionText = 'Neutral';
            directionClass = 'neutral-signal';
        }
        
        // Update UI
        const predictionArrow = document.getElementById('prediction-arrow');
        predictionArrow.textContent = arrow;
        predictionArrow.className = directionClass;
        
        const predictionText = document.getElementById('prediction-text');
        predictionText.textContent = directionText;
        predictionText.className = directionClass;
        
        const confidencePercent = Math.round(confidence * 100);
        document.querySelector('.meter-bar').style.width = `${confidencePercent}%`;
        document.getElementById('confidence-value').textContent = `${confidencePercent}% confidence`;
        
        // Generate market analysis
        generateMarketAnalysis(direction, confidencePercent);
        
        showNotification(`AI Prediction: ${directionText} (${confidencePercent}% confidence)`, 'success');
        
    } catch (error) {
        showNotification('Error getting prediction: ' + error.message, 'error');
        console.error('Prediction error:', error);
    } finally {
        const predictBtn = document.getElementById('predict-btn');
        predictBtn.classList.remove('loading');
        predictBtn.disabled = false;
    }
}

function generateMarketAnalysis(direction, confidence) {
    const trends = [];
    const last5 = historicalData.slice(-5);
    const last20 = historicalData.slice(-20);
    
    // Calculate short-term trend
    const shortTermChange = (last5[last5.length-1].c - last5[0].c) / last5[0].c * 100;
    trends.push(`Short-term (5 periods): ${shortTermChange >= 0 ? '+' : ''}${shortTermChange.toFixed(2)}%`);
    
    // Calculate medium-term trend
    const mediumTermChange = (last20[last20.length-1].c - last20[0].c) / last20[0].c * 100;
    trends.push(`Medium-term (20 periods): ${mediumTermChange >= 0 ? '+' : ''}${mediumTermChange.toFixed(2)}%`);
    
    // Calculate volatility
    const highs = last20.map(d => d.h);
    const lows = last20.map(d => d.l);
    const volatility = (Math.max(...highs) - Math.min(...lows)) / Math.min(...lows) * 100;
    trends.push(`Volatility: ${volatility.toFixed(2)}%`);
    
    // Generate analysis text
    let analysis = `<p><strong>Market Trends:</strong></p><ul>`;
    trends.forEach(trend => {
        analysis += `<li>${trend}</li>`;
    });
    analysis += `</ul>`;
    
    analysis += `<p><strong>AI Recommendation:</strong> `;
    if (direction === 'up') {
        analysis += `The model suggests a <span class="buy-signal">bullish</span> outlook with ${confidence}% confidence.`;
    } else if (direction === 'down') {
        analysis += `The model suggests a <span class="sell-signal">bearish</span> outlook with ${confidence}% confidence.`;
    } else {
        analysis += `The model suggests a <span class="neutral-signal">neutral</span> outlook.`;
    }
    analysis += `</p>`;
    
    document.getElementById('market-analysis').innerHTML = analysis;
}

// ========== ACCOUNT FUNCTIONS ==========
async function getAccountBalance() {
    if (!isOnline || !ws) return;
    
    try {
        ws.send(JSON.stringify({ balance: 1, account: 'current' }));
    } catch (error) {
        console.error('Balance error:', error);
        isOnline = false;
        updateConnectionStatus();
    }
}

// ========== UTILITY FUNCTIONS ==========
function setupConnectionMonitoring() {
    // Check connection status every 30 seconds
    setInterval(() => {
        if (isOnline && ws) {
            ws.send(JSON.stringify({ ping: 1 }));
        }
    }, 30000);

    updateConnectionStatus();
}

function updateConnectionStatus() {
    const isBrowserOnline = navigator.onLine;
    if (!isBrowserOnline) {
        setConnectionState('offline', 'Offline (no internet)');
        return;
    }

    if (!isOnline) {
        setConnectionState('offline', 'Disconnected');
    } else {
        setConnectionState('online', 'Connected');
    }
}

function setConnectionState(state, text) {
    const statusDot = document.querySelector('.status-dot');
    statusDot.className = 'status-dot ' + state;
    document.getElementById('connection-text').textContent = text;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }, 10);
}

// Cleanup on exit
window.addEventListener('beforeunload', () => {
    if (ws) ws.close();
});
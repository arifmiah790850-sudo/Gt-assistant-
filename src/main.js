const status = document.getElementById('status');
const messages = document.getElementById('messages');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');

let ws = null;
let stream = null;
let audioContext = null;
let processor = null;
let micSource = null;
let muteGain = null;
let listening = false;
let nextPlayTime = 0;
let playingSources = [];

function addMessage(who, message) {
    const div = document.createElement('div');
    div.className = 'msg ' + who.toLowerCase();
    div.textContent = who + ': ' + message;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

function stopPlayback() {
    playingSources.forEach(source => {
        try { source.stop(); } catch {}
    });
    playingSources = [];
    if (audioContext) nextPlayTime = audioContext.currentTime;
}

function cleanup() {
    listening = false;

    if (processor) {
        processor.disconnect();
        processor.onaudioprocess = null;
        processor = null;
    }

    if (micSource) {
        micSource.disconnect();
        micSource = null;
    }

    if (muteGain) {
        muteGain.disconnect();
        muteGain = null;
    }

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    stopPlayback();

    if (audioContext) {
        const oldContext = audioContext;
        audioContext = null;
        oldContext.close().catch(() => {});
    }
}

function resample(input, inputRate, outputRate) {
    if (inputRate === outputRate) return input;

    const ratio = inputRate / outputRate;
    const length = Math.floor(input.length / ratio);
    const output = new Float32Array(length);

    for (let i = 0; i < length; i++) {
        const position = i * ratio;
        const index = Math.floor(position);
        const fraction = position - index;
        const a = input[index] || 0;
        const b = input[index + 1] || a;
        output[i] = a + (b - a) * fraction;
    }

    return output;
}

function floatToBase64(samples) {
    const pcm = new Int16Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
        const value = Math.max(-1, Math.min(1, samples[i]));
        pcm[i] = value < 0 ? value * 32768 : value * 32767;
    }

    const bytes = new Uint8Array(pcm.buffer);
    let binary = '';

    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
}

function playAudio(base64, mimeType) {
    if (!audioContext) return;

    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);

    for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
    }

    const pcm = new Int16Array(
        bytes.buffer,
        bytes.byteOffset,
        Math.floor(bytes.length / 2)
    );

    const match = (mimeType || '').match(/rate=(\d+)/);
    const sampleRate = match ? Number(match[1]) : 24000;

    const buffer = audioContext.createBuffer(
        1,
        pcm.length,
        sampleRate
    );

    const channel = buffer.getChannelData(0);

    for (let i = 0; i < pcm.length; i++) {
        channel[i] = pcm[i] / 32768;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    const startAt = Math.max(
        audioContext.currentTime,
        nextPlayTime
    );

    source.start(startAt);
    nextPlayTime = startAt + buffer.duration;

    playingSources.push(source);
    source.onended = () => {
        playingSources = playingSources.filter(item => item !== source);
    };
}

async function startGT() {
    if (listening) return;

    try {
        status.textContent = 'CONNECTING TO GT...';

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        status.textContent =
            'SECURE=' + window.isSecureContext +
            ' | ORIGIN=' + location.origin +
            ' | MEDIA=' + typeof navigator.mediaDevices +
            ' | MIC=' + typeof navigator.mediaDevices?.getUserMedia;

        stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        ws = new WebSocket('ws://127.0.0.1:3000');

        ws.onmessage = async event => {
            const msg = JSON.parse(event.data);

            if (msg.type === 'ready') {
                listening = true;
                status.textContent = 'GT LIVE - LISTENING';
                addMessage('GT', 'জি Boss, আমি শুনছি।');

                micSource = audioContext.createMediaStreamSource(stream);
                processor = audioContext.createScriptProcessor(4096, 1, 1);
                muteGain = audioContext.createGain();
                muteGain.gain.value = 0;

                processor.onaudioprocess = event => {
                    if (!listening || ws?.readyState !== WebSocket.OPEN) return;

                    const input = event.inputBuffer.getChannelData(0);
                    const samples = resample(
                        input,
                        audioContext.sampleRate,
                        16000
                    );

                    if (samples.length) {
                        ws.send(JSON.stringify({
                            type: 'audio',
                            data: floatToBase64(samples),
                            mimeType: 'audio/pcm;rate=16000'
                        }));
                    }
                };

                micSource.connect(processor);
                processor.connect(muteGain);
                muteGain.connect(audioContext.destination);
            }

            if (msg.type === 'input_text') {
                addMessage('YOU', msg.text);
            }

            if (msg.type === 'output_text') {
                addMessage('GT', msg.text);
            }

            if (msg.type === 'audio') {
                playAudio(msg.data, msg.mimeType);
            }

            if (msg.type === 'interrupted') {
                stopPlayback();
                status.textContent = 'GT LIVE - LISTENING';
            }

            if (msg.type === 'turn_complete') {
                status.textContent = 'GT LIVE - LISTENING';
            }

            if (msg.type === 'error') {
                status.textContent = 'GT ERROR: ' + msg.message;
            }
        };

        ws.onerror = () => {
            status.textContent = 'WEBSOCKET CONNECTION ERROR';
        };

        ws.onclose = () => {
            cleanup();
            status.textContent = 'GT DISCONNECTED';
        };

    } catch (error) {
        console.error('GT Live Error:', error);
        status.textContent =
            'ERROR: ' + error.name + ' - ' + error.message;
        cleanup();
        if (ws) {
            ws.close();
            ws = null;
        }
    }
}

function stopGT() {
    listening = false;

    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
        ws.close();
    }

    ws = null;
    cleanup();
    status.textContent = 'GT STOPPED';
}

startButton.addEventListener('click', startGT);
stopButton.addEventListener('click', stopGT);

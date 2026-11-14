import { SpeechRecognition } from '@capacitor-community/speech-recognition';

const status = document.getElementById('status');
const messages = document.getElementById('messages');

let listening = false;

function addMessage(who, message) {
    const div = document.createElement('div');
    div.className = 'msg ' + who.toLowerCase();
    div.textContent = who + ': ' + message;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

function speak(message, language) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = language;
    utterance.rate = 0.95;
    speechSynthesis.speak(utterance);
}

async function startGT() {
    if (listening) return;

    try {
        status.textContent = 'CHECKING PERMISSION...';

        const permission = await SpeechRecognition.requestPermissions();

        if (permission.speechRecognition !== 'granted') {
            status.textContent = 'MICROPHONE PERMISSION REQUIRED';
            return;
        }

        const available = await SpeechRecognition.available();

        if (!available.available) {
            status.textContent = 'VOICE ENGINE UNAVAILABLE';
            return;
        }

        listening = true;
        status.textContent = 'LISTENING...';

        const language = document.getElementById('language').value;

        const result = await SpeechRecognition.start({
            language,
            maxResults: 1,
            partialResults: false,
            popup: true
        });

        const recognized = result.matches?.[0];

        if (recognized) {
            addMessage('YOU', recognized);

            const bangla = language === 'bn-IN';

            const reply = bangla
                ? 'হ্যাঁ Boss, আমি শুনছি। আপনি বলেছেন ' + recognized
                : 'Yes Boss, I am listening. You said ' + recognized;

            addMessage('GT', reply);
            speak(reply, bangla ? 'bn-IN' : 'en-IN');
        } else {
            status.textContent = 'NO SPEECH DETECTED';
        }

    } catch (error) {
        console.error('GT Voice Error:', error);
        status.textContent = 'VOICE ERROR';
    } finally {
        listening = false;
        if (status.textContent === 'LISTENING...') {
            status.textContent = 'SYSTEM READY';
        }
    }
}

window.startGT = startGT;

import { SpeechRecognition as NativeSR } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

const status = document.getElementById('status');
const messages = document.getElementById('messages');

let listening = false;

function addMessage(who, message) {
    const div = document.createElement('div');
    div.className = 'msg ' + who.toLowerCase();
    div.textContent = who + ': ' + message;
    messages.appendChild(div);
}

async function speak(message, language) {
    try {
        await TextToSpeech.speak({
            text: message,
            lang: language,
            rate: 0.88,
            pitch: 1.15,
            volume: 1.0
        });
    } catch (error) {
        console.error('GT Voice Error:', error);
        status.textContent = 'VOICE ERROR: ' + error.message;
    }
}

async function startGT() {
    if (listening) return;
    listening = true;

    const language = document.getElementById('language').value;

    try {
        status.textContent = 'LISTENING...';
        let recognized = '';

        if (Capacitor.isNativePlatform()) {
            await NativeSR.requestPermissions();
            const available = await NativeSR.available();
            if (!available.available) throw Error('Voice unavailable');

            const result = await NativeSR.start({
                language,
                maxResults: 1,
                partialResults: false,
                popup: true
            });

            recognized = result.matches?.[0] || '';
        } else {
            const SR = window.SpeechRecognition ||
                       window.webkitSpeechRecognition;

            if (!SR) throw Error('Browser speech recognition unsupported');

            recognized = await new Promise((resolve, reject) => {
                const rec = new SR();
                rec.lang = language;
                rec.onresult = e => resolve(e.results[0][0].transcript);
                rec.onerror = e => reject(Error(e.error));
                rec.start();
            });
        }

        if (recognized) {
            addMessage('YOU', recognized);

            const reply = language === 'bn-IN'
                ? 'জি Boss, আপনার কথা শুনেছি। ' + recognized
                : 'Yes Boss, I heard you. ' + recognized;

            addMessage('GT', reply);
            speak(reply, language);
        } else {
            status.textContent = 'NO SPEECH DETECTED';
        }

    } catch (error) {
        console.error(error);
        status.textContent = 'ERROR: ' + error.message;
    } finally {
        listening = false;
    }
}

window.startGT = startGT;

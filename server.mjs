import 'dotenv/config';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import http from 'node:http';

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('GEMINI_API_KEY missing in .env');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const ai = new GoogleGenAI({ apiKey: API_KEY });

app.get('/health', (req, res) => {
  res.json({ status: 'GT backend running' });
});

wss.on('connection', async (client) => {
  console.log('GT client connected');

  let session;

  try {
    session = await ai.live.connect({
      model: 'gemini-live-2.5-flash-preview',
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction:
          'You are GT, a helpful personal AI assistant. Address the user as Boss. Speak naturally and respond in the language the user uses, including Bengali.',
      },
      callbacks: {
        onopen: () => {
          console.log('Gemini Live connected');
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'ready' }));
          }
        },

        onmessage: (message) => {
          const content = message.serverContent;

          if (content?.interrupted) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'interrupted' }));
            }
          }

          if (content?.inputTranscription?.text) {
            client.send(JSON.stringify({
              type: 'input_text',
              text: content.inputTranscription.text
            }));
          }

          if (content?.outputTranscription?.text) {
            client.send(JSON.stringify({
              type: 'output_text',
              text: content.outputTranscription.text
            }));
          }

          const parts = content?.modelTurn?.parts || [];

          for (const part of parts) {
            if (part.inlineData?.data) {
              client.send(JSON.stringify({
                type: 'audio',
                data: part.inlineData.data,
                mimeType: part.inlineData.mimeType
              }));
            }
          }

          if (content?.turnComplete) {
            client.send(JSON.stringify({ type: 'turn_complete' }));
          }
        },

        onerror: (error) => {
          console.error('Gemini Live error:', error.message || error);
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'error',
              message: 'Gemini Live connection error'
            }));
          }
        },

        onclose: () => {
          console.log('Gemini Live disconnected');
        }
      }
    });

    client.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'audio' && msg.data) {
          session.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: msg.mimeType || 'audio/pcm;rate=16000'
            }
          });
        }

        if (msg.type === 'text' && msg.text) {
          session.sendRealtimeInput({ text: msg.text });
        }

        if (msg.type === 'stop') {
          session.sendRealtimeInput({ audioStreamEnd: true });
        }
      } catch (error) {
        console.error('Client message error:', error.message);
      }
    });

    client.on('close', () => {
      console.log('GT client disconnected');
      session?.close();
    });

  } catch (error) {
    console.error('Live session setup failed:', error.message);
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'error',
        message: 'Live session could not start'
      }));
      client.close();
    }
  }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`GT backend running on port ${PORT}`);
});

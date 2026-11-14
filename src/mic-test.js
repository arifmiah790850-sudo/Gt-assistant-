const status = document.getElementById('status');

window.testMic = async function () {
  try {
    status.textContent = 'REQUESTING MICROPHONE...';

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    status.textContent = 'MICROPHONE WORKING';

    stream.getTracks().forEach(track => track.stop());

  } catch (error) {
    console.error('Microphone error:', error);
    status.textContent = 'MIC ERROR: ' + error.name;
  }
};

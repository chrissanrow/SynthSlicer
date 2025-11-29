import Meyda from 'meyda';

const SAMPLE_RATE = 8000; // downsampled rate for analysis
const FRAME_SIZE = 2048; // size of the analysis window (FFT size)

async function generateBeatmap(audioUrl) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: SAMPLE_RATE
    });
    
    // load / decode audio
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const monoData = audioBuffer.getChannelData(0);
    const spectralFlux = [];
    let previousSpectrum = null;

    // compute spectral flux
    for (let i = 0; i < monoData.length; i += FRAME_SIZE) {
        const frame = monoData.slice(i, i + FRAME_SIZE);

        if(frame.length < FRAME_SIZE) break; // Ignore incomplete frame at the end

        // get the frequency spectrum for the current frame
        const currentSpectrum = Meyda.extract('amplitudeSpectrum', frame, previousSpectrum ? null : FRAME_SIZE);

        if (previousSpectrum) {
            let flux = 0;
            // compute spectral flux
            for (let j = 0; j < currentSpectrum.length; j++) {
                const diff = currentSpectrum[j] - previousSpectrum[j];
                flux += Math.max(0, diff); // clamp to positive
            }
            spectralFlux.push(flux);
        }
        previousSpectrum = currentSpectrum;
    }
    
    // beatmap generation based on spectral flux peaks
    const beatmap = [];
    // TODO: tune this to work for many songs
    const fluxThreshold = 500;
    const framesPerSecond = SAMPLE_RATE / FRAME_SIZE;

    for (let i = 1; i < spectralFlux.length; i++) {
        // check if flux exceeds threshold AND is a local maximum
        if (spectralFlux[i] > fluxThreshold && spectralFlux[i] > spectralFlux[i - 1]) {
            const beatTime = i / framesPerSecond;
            const lane = Math.floor(Math.random() * 4);

            beatmap.push({ time: beatTime, lane: lane });
        }
    }

    return beatmap;
}

export { generateBeatmap };
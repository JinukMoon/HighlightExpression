/**
 * Speaking Practice Module
 * - Records user speech via MediaRecorder
 * - Transcribes via ElevenLabs STT API
 * - Gets grammar/usage feedback via Gemini API
 */
(function () {
  'use strict';

  const STORAGE_KEYS = {
    elevenLabsKey: 'practice_elevenlabs_key',
    geminiKey: 'practice_gemini_key',
    elevenVoiceId: 'practice_eleven_voice_id',
  };

  // Default ElevenLabs voice (Jessica — warm, conversational). Override in settings.
  const DEFAULT_VOICE_ID = 'cgSgspJ2msm6clMCkdW9';

  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let currentWord = '';
  let currentMeaning = '';

  // ─── API Key Management ───

  function getKey(name) {
    return localStorage.getItem(STORAGE_KEYS[name]) || '';
  }

  function setKey(name, value) {
    localStorage.setItem(STORAGE_KEYS[name], value.trim());
  }

  // ─── Settings Modal ───

  function createSettingsBtn() {
    if (document.getElementById('practice-settings-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'practice-settings-btn';
    btn.className = 'practice-settings-btn';
    btn.textContent = '⚙️';
    btn.title = 'Speaking Practice Settings';
    btn.addEventListener('click', openSettings);
    document.body.appendChild(btn);
  }

  function openSettings() {
    if (document.getElementById('practice-settings-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'practice-settings-modal';
    overlay.className = 'practice-overlay';
    overlay.innerHTML = `
      <div class="practice-modal">
        <h3>🎤 Speaking Practice Settings</h3>
        <label>ElevenLabs API Key</label>
        <input type="password" id="practice-el-key" placeholder="xi-..." value="${getKey('elevenLabsKey')}" />
        <label>Gemini API Key</label>
        <input type="password" id="practice-gemini-key" placeholder="AIza..." value="${getKey('geminiKey')}" />
        <label>ElevenLabs Voice ID (선택 — 비우면 기본 음성)</label>
        <input type="text" id="practice-voice-id" placeholder="${DEFAULT_VOICE_ID}" value="${getKey('elevenVoiceId')}" />
        <div class="practice-modal-buttons">
          <button id="practice-save-btn" class="btn primary">Save</button>
          <button id="practice-cancel-btn" class="btn secondary">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSettings();
    });
    document.getElementById('practice-save-btn').addEventListener('click', () => {
      setKey('elevenLabsKey', document.getElementById('practice-el-key').value);
      setKey('geminiKey', document.getElementById('practice-gemini-key').value);
      setKey('elevenVoiceId', document.getElementById('practice-voice-id').value);
      closeSettings();
    });
    document.getElementById('practice-cancel-btn').addEventListener('click', closeSettings);
  }

  function closeSettings() {
    const modal = document.getElementById('practice-settings-modal');
    if (modal) modal.remove();
  }

  // ─── Practice Button Injection ───

  function injectPracticeButton() {
    const questionArea = document.querySelector('.question-area');
    if (!questionArea) return;
    if (questionArea.querySelector('.practice-mic-btn')) return;

    // Only show in vocab mode (not preposition quiz)
    const modeBadge = document.querySelector('.mode-badge');
    if (!modeBadge) return;

    const btn = document.createElement('button');
    btn.className = 'practice-mic-btn speak-btn';
    btn.textContent = '🎤 Practice';
    btn.addEventListener('click', handlePracticeClick);
    questionArea.appendChild(btn);
  }

  function getCurrentWordInfo() {
    const questionEl = document.querySelector('.question');
    if (!questionEl) return null;

    const modeBadge = document.querySelector('.mode-badge');
    if (!modeBadge) return null;

    const isEnToKo = modeBadge.textContent.includes('English');
    const questionText = questionEl.textContent.trim();

    // Try to get both English and Korean from answer area if visible
    const engEl = document.querySelector('.answer-text.english');
    const korEl = document.querySelector('.answer-text.korean');

    let english = '';
    let korean = '';

    if (engEl && korEl) {
      english = engEl.textContent.replace(/\/[^/]*\//g, '').trim(); // strip phonetics
      korean = korEl.textContent.trim();
    } else if (isEnToKo) {
      english = questionText;
      korean = '';
    } else {
      korean = questionText;
      english = '';
    }

    return { english, korean };
  }

  // ─── Recording ───

  async function handlePracticeClick() {
    if (!getKey('elevenLabsKey') || !getKey('geminiKey')) {
      openSettings();
      return;
    }

    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  }

  async function startRecording() {
    const wordInfo = getCurrentWordInfo();
    if (wordInfo) {
      currentWord = wordInfo.english;
      currentMeaning = wordInfo.korean;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        processAudio(blob);
      };

      mediaRecorder.start();
      isRecording = true;
      updateMicButton(true);
    } catch (err) {
      showFeedback('마이크 접근 권한이 필요합니다.', 'error');
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    isRecording = false;
    updateMicButton(false);
  }

  function updateMicButton(recording) {
    const btn = document.querySelector('.practice-mic-btn');
    if (!btn) return;
    if (recording) {
      btn.textContent = '⏹ Stop';
      btn.classList.add('recording');
    } else {
      btn.textContent = '🎤 Practice';
      btn.classList.remove('recording');
    }
  }

  // ─── ElevenLabs STT ───

  async function transcribeAudio(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model_id', 'scribe_v2');

    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': getKey('elevenLabsKey') },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`STT failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data.text || '';
  }

  // ─── Gemini Feedback ───

  async function getFeedback(spokenText, word, meaning) {
    const prompt = `You are an English teacher coaching a Korean student. Answer in Korean (한국어로 답변).

The student was given the vocabulary word "${word}" (meaning: "${meaning}") and asked to make a sentence using it.

The student said: "${spokenText}"

IMPORTANT: This is spoken language transcribed by STT. The student may have self-corrected mid-sentence (e.g., "not to investment- not to invest"). This is normal in speech — do NOT penalize self-corrections or repetitions. Evaluate the FINAL intended sentence.

Your PRIMARY goal is to teach how NATIVE speakers actually use "${word}" in real life — not just whether the sentence is grammatically possible. Follow this structure:

1. **단어 진단**: Did the student use "${word}" the way a native speaker naturally would? Judge by authentic native usage, not by bare grammatical possibility.

2. If "${word}" is NOT the natural choice in the student's sentence (CASE A):
   - **이 문맥엔 이 단어**: Tell the student which word a native would actually use for the meaning they were going for, and briefly why "${word}" sounds off here.
   - **"${word}"의 진짜 용법**: Then teach the word itself. Give ONE typical, natural example sentence showing how natives REALLY use "${word}" — even if that means a different meaning than the student intended. Prioritize authentic native usage over preserving the student's original meaning. Briefly note the typical context/collocation.

3. If "${word}" IS used well (CASE B):
   - **잘했어요**: Briefly confirm it sounds natural.
   - **원어민 한 끗 더**: Show ONE extra native example — a common collocation or a more idiomatic phrasing natives frequently use with "${word}" — so the student keeps learning even when correct.

4. **문법**: Note grammar errors in the final intended sentence (skip if none).

Keep the response concise. Use bullet points. Quote example sentences in English; explanations in Korean.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${getKey('geminiKey')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No feedback received.';
  }

  // ─── Process Pipeline ───

  async function processAudio(audioBlob) {
    showFeedback('🔄 음성 인식 중...', 'loading');

    try {
      const spokenText = await transcribeAudio(audioBlob);
      if (!spokenText.trim()) {
        showFeedback('음성이 인식되지 않았습니다. 다시 시도해 주세요.', 'error');
        return;
      }

      showFeedback(`🔄 인식된 문장: "${spokenText}"\n\n피드백 생성 중...`, 'loading');

      const word = currentWord || '(unknown)';
      const meaning = currentMeaning || '';
      const feedback = await getFeedback(spokenText, word, meaning);

      showFeedback(feedback, 'success', spokenText);
    } catch (err) {
      showFeedback(`오류: ${err.message}`, 'error');
    }
  }

  // ─── Feedback Display ───

  function showFeedback(message, type, spokenText) {
    let overlay = document.getElementById('practice-feedback-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'practice-feedback-overlay';
      overlay.className = 'practice-overlay';
      document.body.appendChild(overlay);
    }

    const spokenHtml = spokenText
      ? `<div class="practice-spoken">"${spokenText}"</div>`
      : '';

    const typeClass =
      type === 'error'
        ? 'practice-error'
        : type === 'loading'
          ? 'practice-loading'
          : 'practice-success';

    overlay.innerHTML = `
      <div class="practice-modal practice-feedback ${typeClass}">
        <h3>${type === 'error' ? '⚠️' : type === 'loading' ? '⏳' : '✅'} Speaking Practice</h3>
        ${spokenHtml}
        <div class="practice-feedback-text">${formatFeedback(message)}</div>
        ${type !== 'loading' ? '<button class="btn primary practice-close-btn">Close</button>' : ''}
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('practice-close-btn')) {
        overlay.remove();
      }
    });

    const closeBtn = overlay.querySelector('.practice-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
  }

  function formatFeedback(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
      .replace(/^- /gm, '• ');
  }

  // ─── Small Talk Mode ───

  const ST_KEYS = { opensUser: 'practice_st_user_opens' };

  const ST_SCENARIOS = [
    'waiting in line at a coffee shop',
    'making coffee in the office kitchen',
    'waiting for the elevator with a colleague',
    'at a friend\'s backyard barbecue',
    'sitting next to a stranger on a flight',
    'taking a break at the gym',
    'waiting at the bus stop on a rainy morning',
    'chatting at a casual networking event',
    'walking your dog at the park',
    'standing in line at the grocery store',
  ];

  let stSession = null;
  let stRecorder = null;
  let stChunks = [];
  let stListening = false;
  let stPaused = false;
  let stStream = null;
  let stAudioCtx = null;
  let stAnalyser = null;
  let stVadRAF = null;
  let stCurrentAudio = null;
  let stDiscardNext = false;

  function pickScenario() {
    return ST_SCENARIOS[Math.floor(Math.random() * ST_SCENARIOS.length)];
  }

  // Shared Gemini call
  async function geminiRequest(body) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${getKey('geminiKey')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Gemini failed (${res.status}): ${t}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // ── Voice-only AI output (no caption) — listening practice ──

  // Realistic ElevenLabs TTS → returns object URL of mp3
  async function elevenLabsTTS(text) {
    const voiceId = getKey('elevenVoiceId') || DEFAULT_VOICE_ID;
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': getKey('elevenLabsKey'),
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.75,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`TTS failed (${res.status}): ${t}`);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  function playUrl(url) {
    return new Promise((resolve) => {
      const a = new Audio(url);
      stCurrentAudio = a;
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.onpause = () => resolve(); // explicit stopAudio() must not block the await
      a.play().catch(() => resolve());
    });
  }

  // Browser TTS fallback
  function webSpeak(text) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve();
        return;
      }
      const u = new SpeechSynthesisUtterance(text.replace(/\*\*(.*?)\*\*/g, '$1'));
      u.lang = 'en-US';
      u.rate = 0.97;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    });
  }

  // Speak an AI turn; cache the audio URL on the item for replay. Resolves when playback ends.
  async function speakAI(item) {
    try {
      const url = await elevenLabsTTS(item.text);
      item.audioUrl = url;
      await playUrl(url);
    } catch (e) {
      // ElevenLabs unavailable (quota / voice access) → browser voice
      item.audioUrl = null;
      await webSpeak(item.text);
    }
  }

  function replayAI(item) {
    stopAudio();
    if (item.audioUrl) {
      playUrl(item.audioUrl);
    } else {
      webSpeak(item.text);
    }
  }

  function stopAudio() {
    if (stCurrentAudio) {
      try {
        stCurrentAudio.pause();
      } catch (e) {
        /* noop */
      }
      stCurrentAudio = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  function buildContents(session) {
    const c = session.history.map((h) => ({
      role: h.role === 'ai' ? 'model' : 'user',
      parts: [{ text: h.text }],
    }));
    // Gemini expects the conversation to start with a user turn
    if (c.length && c[0].role === 'model') {
      c.unshift({ role: 'user', parts: [{ text: "(Let's start chatting.)" }] });
    }
    return c;
  }

  async function getSmallTalkReply(session) {
    const sys = `You are a friendly, casual native English speaker making small talk with someone you just met. Setting: ${session.scenario}. Speak naturally and briefly — 1 to 2 short sentences, like real spoken conversation. Be warm and sometimes ask a light follow-up question. NEVER correct the user's grammar and never break character. Respond ONLY in English, plain text, no markdown, no emoji.`;
    let contents = buildContents(session);
    if (contents.length === 0) {
      contents = [{ role: 'user', parts: [{ text: 'Start our small talk with a natural, friendly opening line.' }] }];
    }
    return geminiRequest({
      systemInstruction: { parts: [{ text: sys }] },
      contents,
    });
  }

  async function getSmallTalkFeedback(session) {
    const transcript = session.history
      .map((h) => `${h.role === 'ai' ? 'AI' : 'You'}: ${h.text}`)
      .join('\n');
    const prompt = `You are an English conversation coach. A Korean learner just finished a small talk role-play. Setting: ${session.scenario}.

Full conversation transcript:
${transcript}

Give concise feedback in Korean (한국어로) on the learner's English — evaluate ONLY the "You:" lines. Cover:
1. **문법**: grammar mistakes with corrections.
2. **어휘/표현**: word choices that could be more natural; suggest native phrasings.
3. **자연스러움**: did it sound like natural small talk? How to make openings/responses more native-like.
4. **잘한 점**: one thing the learner did well.
Be specific and quote the learner's lines. Use bullet points.`;
    return geminiRequest({ contents: [{ parts: [{ text: prompt }] }] });
  }

  // Inject a "Small Talk" tab next to the voca / prepo tabs
  function injectSmallTalkTab() {
    const tabs = document.querySelector('.quiz-tabs');
    if (!tabs) return;
    if (tabs.querySelector('.st-tab')) return;
    const tab = document.createElement('button');
    tab.className = 'tab st-tab';
    tab.textContent = '💬 Small Talk';
    tab.addEventListener('click', openSmallTalk);
    tabs.appendChild(tab);
  }

  function openSmallTalk() {
    if (!getKey('elevenLabsKey') || !getKey('geminiKey')) {
      openSettings();
      return;
    }
    if (document.getElementById('smalltalk-modal')) return;

    // Alternate who opens the conversation each session
    const userOpens = localStorage.getItem(ST_KEYS.opensUser) === 'true';
    localStorage.setItem(ST_KEYS.opensUser, (!userOpens).toString());

    stSession = { scenario: pickScenario(), history: [], userOpens, ended: false, busy: false };
    stPaused = false;

    const overlay = document.createElement('div');
    overlay.id = 'smalltalk-modal';
    overlay.className = 'practice-overlay';
    overlay.innerHTML = `
      <div class="practice-modal st-modal">
        <h3>💬 Small Talk Practice</h3>
        <div class="st-scenario">📍 ${stSession.scenario}<br>
          <span class="st-opener">${userOpens ? '🗣️ 당신이 먼저 말을 거세요 (opening 연습)' : '👂 AI가 먼저 말을 겁니다 — 들어보세요'}</span>
        </div>
        <div class="st-hint">버튼 없이 자동으로 진행돼요. 말하고 잠깐 멈추면 인식하고, AI가 음성으로 답합니다 (자막 없음).</div>
        <div class="st-log" id="st-log"></div>
        <div class="st-controls">
          <button class="btn secondary st-pause-btn" id="st-pause-btn">⏸ 일시정지</button>
          <button class="btn primary st-end-btn" id="st-end-btn">End & 피드백</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('st-pause-btn').addEventListener('click', toggleStPause);
    document.getElementById('st-end-btn').addEventListener('click', endSmallTalk);

    if (userOpens) {
      // User opens → start listening right away
      startListening();
    } else {
      // AI opens → speak, then auto-listen
      aiSmallTalkTurn();
    }
  }

  function closeSmallTalk() {
    stopAudio();
    stopListening(true);
    stPaused = false;
    const modal = document.getElementById('smalltalk-modal');
    if (modal) modal.remove();
    stSession = null;
  }

  function renderStLog() {
    const log = document.getElementById('st-log');
    if (!log || !stSession) return;
    log.innerHTML = stSession.history
      .map((h, i) => {
        if (h.role === 'ai') {
          return `<div class="st-row st-ai-row">
            <button class="st-replay" data-idx="${i}">🔊</button>
            <span class="st-ai-label">AI (들어보세요)</span>
          </div>`;
        }
        return `<div class="st-row st-user-row"><div class="st-user-bubble">${h.text}</div></div>`;
      })
      .join('');
    log.querySelectorAll('.st-replay').forEach((b) => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.dataset.idx, 10);
        if (stSession.history[idx]) replayAI(stSession.history[idx]);
      });
    });
    log.scrollTop = log.scrollHeight;
  }

  function setStStatus(msg) {
    const log = document.getElementById('st-log');
    if (!log) return;
    let s = document.getElementById('st-status');
    if (!s) {
      s = document.createElement('div');
      s.id = 'st-status';
      s.className = 'st-status';
      log.appendChild(s);
    }
    s.textContent = msg;
    log.scrollTop = log.scrollHeight;
  }

  function clearStStatus() {
    const s = document.getElementById('st-status');
    if (s) s.remove();
  }

  async function aiSmallTalkTurn() {
    if (!stSession || stSession.busy) return;
    stSession.busy = true;
    setStStatus('💬 생각 중...');
    try {
      const reply = await getSmallTalkReply(stSession);
      if (!reply.trim()) {
        setStStatus('(AI 응답 없음)');
        stSession.busy = false;
        return;
      }
      const item = { role: 'ai', text: reply.trim(), audioUrl: null };
      stSession.history.push(item);
      renderStLog();
      setStStatus('🔊 듣는 중... (AI가 말하고 있어요)');
      await speakAI(item);
      clearStStatus();
      stSession.busy = false;
      // Continue hands-free: listen for the user's reply
      startListening();
    } catch (err) {
      setStStatus(`오류: ${err.message}`);
      stSession.busy = false;
    }
  }

  // ── Hands-free listening with voice-activity (silence) detection ──

  const VAD_SPEECH_THRESHOLD = 0.022; // RMS above this = speech
  const VAD_SILENCE_MS = 1300; // stop after this much silence following speech
  const VAD_MIN_SPEECH_MS = 250; // ignore blips shorter than this

  async function startListening() {
    if (!stSession || stSession.ended || stPaused || stListening) return;
    try {
      stStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setStStatus('🎤 마이크 권한이 필요합니다. 설정을 확인해 주세요.');
      return;
    }
    stChunks = [];
    stDiscardNext = false;
    stRecorder = new MediaRecorder(stStream, { mimeType: 'audio/webm' });
    stRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) stChunks.push(e.data);
    };
    stRecorder.onstop = () => {
      const blob = new Blob(stChunks, { type: 'audio/webm' });
      const discard = stDiscardNext;
      stDiscardNext = false;
      cleanupListening();
      if (!discard) processStUserAudio(blob);
    };
    stRecorder.start();
    stListening = true;
    setStStatus('🎙️ 듣는 중... 편하게 말해보세요');
    runVAD(stStream);
  }

  function runVAD(stream) {
    stAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (stAudioCtx.state === 'suspended') stAudioCtx.resume();
    const source = stAudioCtx.createMediaStreamSource(stream);
    stAnalyser = stAudioCtx.createAnalyser();
    stAnalyser.fftSize = 512;
    source.connect(stAnalyser);
    const data = new Uint8Array(stAnalyser.fftSize);

    let speechStartedAt = null;
    let silenceStartedAt = null;

    function loop() {
      if (!stListening || !stAnalyser) return;
      stAnalyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const now = performance.now();

      if (rms > VAD_SPEECH_THRESHOLD) {
        if (speechStartedAt === null) speechStartedAt = now;
        silenceStartedAt = null;
      } else if (speechStartedAt !== null && now - speechStartedAt > VAD_MIN_SPEECH_MS) {
        if (silenceStartedAt === null) silenceStartedAt = now;
        else if (now - silenceStartedAt > VAD_SILENCE_MS) {
          stopListening();
          return;
        }
      }
      stVadRAF = requestAnimationFrame(loop);
    }
    loop();
  }

  function stopListening(discard) {
    stDiscardNext = !!discard;
    stListening = false;
    if (stVadRAF) {
      cancelAnimationFrame(stVadRAF);
      stVadRAF = null;
    }
    if (stRecorder && stRecorder.state === 'recording') {
      stRecorder.stop(); // → onstop → cleanupListening + (process unless discard)
    } else {
      cleanupListening();
    }
  }

  function cleanupListening() {
    stListening = false;
    if (stVadRAF) {
      cancelAnimationFrame(stVadRAF);
      stVadRAF = null;
    }
    if (stStream) {
      stStream.getTracks().forEach((t) => t.stop());
      stStream = null;
    }
    if (stAudioCtx) {
      try {
        stAudioCtx.close();
      } catch (e) {
        /* noop */
      }
      stAudioCtx = null;
    }
    stAnalyser = null;
  }

  function toggleStPause() {
    const btn = document.getElementById('st-pause-btn');
    if (!stPaused) {
      stPaused = true;
      stopAudio();
      stopListening(true);
      if (btn) btn.textContent = '▶ 재개';
      setStStatus('⏸ 일시정지됨');
    } else {
      stPaused = false;
      if (btn) btn.textContent = '⏸ 일시정지';
      clearStStatus();
      if (!stSession.busy) startListening();
    }
  }

  async function processStUserAudio(blob) {
    if (!stSession || stSession.ended) return;
    stSession.busy = true;
    setStStatus('🔄 인식 중...');
    try {
      const text = await transcribeAudio(blob);
      if (!text.trim()) {
        // Nothing recognized (silence/noise) — keep listening hands-free
        stSession.busy = false;
        if (!stPaused) startListening();
        return;
      }
      stSession.history.push({ role: 'user', text: text.trim() });
      renderStLog();
      stSession.busy = false;
      await aiSmallTalkTurn();
    } catch (err) {
      setStStatus(`오류: ${err.message}`);
      stSession.busy = false;
    }
  }

  async function endSmallTalk() {
    if (!stSession) {
      closeSmallTalk();
      return;
    }
    stSession.ended = true;
    stopAudio();
    stopListening(true);

    const userTurns = stSession.history.filter((h) => h.role === 'user').length;
    if (userTurns === 0) {
      closeSmallTalk();
      return;
    }

    const session = stSession;
    const transcriptHtml = session.history
      .map((h) => {
        const who = h.role === 'ai' ? 'AI' : 'You';
        const cls = h.role === 'ai' ? 'st-fb-ai' : 'st-fb-user';
        return `<div class="st-fb-line ${cls}"><strong>${who}:</strong> ${h.text}</div>`;
      })
      .join('');

    closeSmallTalk();
    showFeedback('🔄 대화 분석 중...', 'loading');
    try {
      const fb = await getSmallTalkFeedback(session);
      const overlay = document.getElementById('practice-feedback-overlay');
      if (!overlay) return;
      overlay.innerHTML = `
        <div class="practice-modal practice-feedback practice-success">
          <h3>✅ Small Talk 피드백</h3>
          <div class="practice-feedback-text">${formatFeedback(fb)}</div>
          <details class="st-transcript-wrap">
            <summary>📜 전체 대화 보기 (transcript)</summary>
            <div class="st-transcript">${transcriptHtml}</div>
          </details>
          <button class="btn primary practice-close-btn">Close</button>
        </div>
      `;
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('practice-close-btn')) {
          overlay.remove();
        }
      });
      const cb = overlay.querySelector('.practice-close-btn');
      if (cb) cb.addEventListener('click', () => overlay.remove());
    } catch (err) {
      showFeedback(`오류: ${err.message}`, 'error');
    }
  }

  // ─── DOM Observer ───

  function observe() {
    const observer = new MutationObserver(() => {
      injectPracticeButton();
      injectSmallTalkTab();
    });
    observer.observe(document.getElementById('root'), {
      childList: true,
      subtree: true,
    });
    injectPracticeButton();
    injectSmallTalkTab();
  }

  // ─── Init ───

  function init() {
    createSettingsBtn();
    if (document.getElementById('root')) {
      observe();
    } else {
      window.addEventListener('DOMContentLoaded', observe);
    }
  }

  init();
})();

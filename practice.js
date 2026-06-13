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
  };

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
  let stRecording = false;

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

  // Voice-only AI output (no caption) — listening practice
  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    const clean = text.replace(/\*\*(.*?)\*\*/g, '$1');
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
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

    const overlay = document.createElement('div');
    overlay.id = 'smalltalk-modal';
    overlay.className = 'practice-overlay';
    overlay.innerHTML = `
      <div class="practice-modal st-modal">
        <h3>💬 Small Talk Practice</h3>
        <div class="st-scenario">📍 ${stSession.scenario}<br>
          <span class="st-opener">${userOpens ? '🗣️ 당신이 먼저 말을 거세요 (opening 연습)' : '👂 AI가 먼저 말을 겁니다 — 들어보세요'}</span>
        </div>
        <div class="st-hint">AI는 음성으로만 답합니다 (자막 없음). 🔊 버튼으로 다시 들을 수 있어요.</div>
        <div class="st-log" id="st-log"></div>
        <div class="st-controls">
          <button class="btn primary st-mic-btn" id="st-mic-btn">🎤 말하기</button>
          <button class="btn secondary st-end-btn" id="st-end-btn">End & 피드백</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('st-mic-btn').addEventListener('click', handleStMic);
    document.getElementById('st-end-btn').addEventListener('click', endSmallTalk);

    if (!userOpens) {
      // AI opens the conversation
      aiSmallTalkTurn();
    }
  }

  function closeSmallTalk() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (stRecorder && stRecorder.state === 'recording') stRecorder.stop();
    stRecording = false;
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
        if (stSession.history[idx]) speak(stSession.history[idx].text);
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
    setStStatus('💬 ...');
    try {
      const reply = await getSmallTalkReply(stSession);
      clearStStatus();
      if (!reply.trim()) {
        setStStatus('(AI 응답 없음)');
        return;
      }
      stSession.history.push({ role: 'ai', text: reply.trim() });
      renderStLog();
      speak(reply.trim());
    } catch (err) {
      clearStStatus();
      setStStatus(`오류: ${err.message}`);
    } finally {
      stSession.busy = false;
    }
  }

  async function handleStMic() {
    if (!stSession || stSession.busy) return;
    if (stRecording) {
      stopStRecording();
    } else {
      await startStRecording();
    }
  }

  async function startStRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stChunks = [];
      stRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      stRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) stChunks.push(e.data);
      };
      stRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(stChunks, { type: 'audio/webm' });
        processStUserAudio(blob);
      };
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      stRecorder.start();
      stRecording = true;
      updateStMic(true);
    } catch (err) {
      setStStatus('마이크 접근 권한이 필요합니다.');
    }
  }

  function stopStRecording() {
    if (stRecorder && stRecorder.state === 'recording') stRecorder.stop();
    stRecording = false;
    updateStMic(false);
  }

  function updateStMic(recording) {
    const btn = document.getElementById('st-mic-btn');
    if (!btn) return;
    btn.textContent = recording ? '⏹ 멈추기' : '🎤 말하기';
    btn.classList.toggle('recording', recording);
  }

  async function processStUserAudio(blob) {
    if (!stSession) return;
    stSession.busy = true;
    setStStatus('🔄 음성 인식 중...');
    try {
      const text = await transcribeAudio(blob);
      clearStStatus();
      if (!text.trim()) {
        setStStatus('음성이 인식되지 않았습니다. 다시 시도해 주세요.');
        stSession.busy = false;
        return;
      }
      stSession.history.push({ role: 'user', text: text.trim() });
      renderStLog();
      stSession.busy = false;
      await aiSmallTalkTurn();
    } catch (err) {
      clearStStatus();
      setStStatus(`오류: ${err.message}`);
      stSession.busy = false;
    }
  }

  async function endSmallTalk() {
    if (!stSession) {
      closeSmallTalk();
      return;
    }
    if (stRecording) stopStRecording();
    if (window.speechSynthesis) window.speechSynthesis.cancel();

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

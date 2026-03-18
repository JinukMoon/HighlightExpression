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
    formData.append('model_id', 'scribe_v1');

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
    const prompt = `You are an English teacher evaluating a Korean student's spoken sentence.

The student was given the vocabulary word "${word}" (meaning: "${meaning}") and asked to make a sentence using it.

The student said: "${spokenText}"

Please evaluate in Korean (한국어로 답변):
1. **문법**: 문법적으로 올바른지 (오류가 있으면 구체적으로 지적하고 수정 예시 제공)
2. **단어 사용**: "${word}"의 사용이 적절하고 자연스러운지
3. **자연스러움**: 원어민이 들었을 때 자연스러운 문장인지
4. **수정 제안**: 더 자연스러운 문장으로 개선할 수 있다면 제안

Keep the response concise (3-5 sentences). Use bullet points.`;

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

  // ─── DOM Observer ───

  function observe() {
    const observer = new MutationObserver(() => {
      injectPracticeButton();
    });
    observer.observe(document.getElementById('root'), {
      childList: true,
      subtree: true,
    });
    injectPracticeButton();
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

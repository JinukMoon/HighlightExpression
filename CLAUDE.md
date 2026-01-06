# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Repository

- **Repository**: https://github.com/JinukMoon/HighlightExpression
- **Default Branch**: `main`
- Always push to `main` branch (not `master` or `gh-pages`)

## Project Structure

```
/
├── data/
│   ├── words.json       # 단어와 뜻
│   ├── examples.json    # 예문 (단어가 **볼드**로 표시됨)
│   ├── phonetics.json   # 발음 기호 (IPA)
│   └── prepositions.json
├── assets/              # 빌드된 JS/CSS
├── icons/               # PWA 아이콘 (192x192, 512x512)
├── index.html
├── manifest.json        # PWA manifest
└── sw.js                # Service Worker (오프라인 지원)
```

## PWA (Progressive Web App)

이 앱은 PWA로 구성되어 Android/iOS에서 앱처럼 설치 가능:

1. Chrome에서 https://jinukmoon.github.io/HighlightExpression/ 접속
2. 메뉴 → "홈 화면에 추가" 또는 "앱 설치"
3. 오프라인에서도 사용 가능

### PWA 파일 수정 시
- `manifest.json`: 앱 이름, 색상, 아이콘 설정
- `sw.js`: 캐시할 파일 목록 (새 asset 추가 시 업데이트 필요)
- `icons/`: 192x192, 512x512 PNG 아이콘

## Workflow - 단어 추가 시

### 사용자가 할 일
새 단어 목록만 제공하면 됨. 예: "다음 단어 추가해줘: nuance, leverage, mitigate"

### Claude가 할 일
1. **words.json**: 한국어 뜻 추가
   - 예: `"leverage": "영향력, 지렛대; 활용하다"`
2. **examples.json**: 자연스러운 예문 작성 (단어를 `**볼드**`로 표시)
   - 예: `"leverage": "We need to **leverage** our existing resources to maximize efficiency."`
3. **phonetics.json**: IPA 발음기호 추가
   - 예: `"leverage": "/ˈlevərɪdʒ/"`
   - 구/숙어는 빈 문자열 `""`
4. **Deploy**: 변경사항 커밋 후 main 브랜치에 push

### 명령어
```bash
cd /home/jumoon/99_usefull/11_English/vocab-quiz-web/frontend/dist
git add . && git commit -m "Add new words: word1, word2, ..." && git push origin main
```

### 파일 위치
- Master file: `/home/jumoon/99_usefull/11_English/words.json`
- Symlink: `data/words.json` → Master file
- Examples: `data/examples.json`
- Phonetics: `data/phonetics.json`

### 참고
- YouGlish 링크는 앱에서 자동 생성됨 (`https://youglish.com/pronounce/{word}/english`)
- 구/숙어(여러 단어)는 phonetics에 빈 문자열 사용
- TTS는 Web Speech API 사용 (브라우저 내장)

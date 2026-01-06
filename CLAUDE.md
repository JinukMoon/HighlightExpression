# CLAUDE.md

## Git Repository

- **Repository**: https://github.com/JinukMoon/HighlightExpression
- **Default Branch**: `main`
- Always push to `main` branch (not `master`)

## Project Structure

```
frontend/
├── data/
│   ├── words.json       # 단어와 뜻
│   ├── examples.json    # 예문 (단어가 **볼드**로 표시됨)
│   ├── phonetics.json   # 발음 기호 (IPA)
│   └── prepositions.json
├── assets/
├── index.html
└── vite.svg
```

## Workflow - 단어 추가 시

단어를 추가할 때 **4개 파일 모두** 업데이트 필요:

1. **words.json**: `"단어": "한국어 뜻"`
2. **examples.json**: `"단어": "예문에서 **단어**가 볼드 처리됨"`
3. **phonetics.json**: `"단어": "/IPA 발음기호/"` (구/숙어는 빈 문자열 `""`)
4. 변경 후 `main` 브랜치에 push

### 참고
- YouGlish 링크는 앱에서 자동 생성됨 (`https://youglish.com/pronounce/{word}/english`)
- 구/숙어(여러 단어)는 phonetics에 빈 문자열 사용

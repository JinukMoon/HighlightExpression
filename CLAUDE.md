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
│   ├── phonetics.json   # 발음 기호
│   └── prepositions.json
├── assets/
├── index.html
└── vite.svg
```

## Workflow

1. 단어 추가 시 `words.json`과 `examples.json` 모두 업데이트
2. 예문 형식: `"단어": "예문에서 **단어**가 볼드 처리됨"`
3. 변경 후 `main` 브랜치에 push

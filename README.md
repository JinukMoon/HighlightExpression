# HighlightExpression

English vocabulary and preposition quiz app for Korean learners.

## Features

### Vocabulary Quiz
- **English to Korean**: See English word, recall Korean meaning
- **Korean to English**: See Korean meaning, type English word
- IPA phonetic symbols
- Example sentences with highlighted target words
- TTS pronunciation (auto-plays on answer reveal)
- YouGlish integration for real pronunciation videos

### Preposition Quiz
- Fill-in-the-blank exercises
- 150+ preposition questions covering:
  - Time expressions (at, on, in, during, since, until, by, from)
  - Common verb + preposition combinations
  - Phrasal verbs

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Enter | Check answer |
| Space | Next question (after reveal) |

## Tech Stack

- React + Vite
- Web Speech API (TTS)
- GitHub Pages

## Live Demo

https://jinukmoon.github.io/HighlightExpression/

## Data Files

To add/edit vocabulary or prepositions, modify the JSON files in `src/data/`:
- `words.json` - English-Korean word pairs
- `examples.json` - Example sentences
- `phonetics.json` - IPA pronunciations
- `prepositions.json` - Preposition quiz questions

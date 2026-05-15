# WorkX — All your work. One place. Zero limits.

> A powerful offline-first productivity workspace for notes, tasks, journals, whiteboards, media, and local AI — built to help you organize everything in one place.



---

## 🚧 Current Status

**WorkX v1 — Under Development**

WorkX is currently in active development.  
Version 1 focuses on creating a complete local-first productivity platform with integrated local AI, advanced workspace organization, and offline media support.

---

## ✨ About WorkX

WorkX is a modern productivity application designed to combine everything you need for work and personal organization into one clean workspace.

It is inspired by apps like Notion but built with a stronger focus on:

- offline access  
- local AI  
- privacy  
- performance  
- personal data ownership  

WorkX allows users to create notes, manage tasks, maintain journals, use whiteboards, upload media, and interact with a local AI assistant — all without depending on cloud-only services.

---

## 🔥 Core Features

### Notes Workspace
- Rich text editor
- Headings
- Lists
- Code blocks
- Toggles
- Nested pages
- Slash commands
- Drag & drop blocks
- Fast search
- Infinite workspace hierarchy

### Task Manager
- To-do lists
- Task boards
- Priority tags
- Due dates
- Reminders
- Kanban boards
- AI-generated tasks
- Smart suggestions

### Journal
- Daily pages
- Timeline view
- Mood tracking
- Personal notes
- Writing history

### Whiteboard
- Drawing
- Shapes
- Arrows
- Text
- Zoom & pan
- Image embedding

### Media
- Image uploads
- Drag and resize
- Compression
- Local file storage
- Optimized media rendering

### Calendar
- Event planning
- Schedule organization
- Reminder support

### Voice
- Voice notes
- Speech-to-text
- Quick capture ideas

### AI Assistant
- Local AI assistant
- Workspace help
- Task generation
- Note summarization
- Custom prompts
- Context-aware assistance

### Workspace Memory
- Always-on memory button
- Remembers current workspace context
- Understands previous notes
- Continues conversations
- Smart local context system

---

## 🧠 Local AI System

WorkX runs AI locally on the user device using local models.

### AI Assistant Name

**WorkX AI**

Built-in assistant features:

- task generation  
- note assistance  
- summarization  
- productivity help  
- smart workspace guidance  

### Local AI Backend

Powered by:

[Ollama](https://ollama.com)

### Default Model

```bash
mistral:latest
```

### Local Endpoint

```text
http://localhost:11434
```

### Setup

Install Ollama:

[Download Ollama](https://ollama.com/download?utm_source)

Run local model:

```bash
ollama pull mistral:latest
ollama serve
```

---

## 🛠 Tech Stack

### Frontend

- React  
- TypeScript  
- Vite  
- Tailwind CSS  
- React Router  
- Zustand  
- Framer Motion  

### Data Storage

- IndexedDB  
- LocalStorage  
- Browser Cache  

### AI Integration

- Ollama  
- Local LLM  
- REST API  
- localhost:11434  

### Utilities

- Dexie.js  
- UUID  
- Date-fns  
- React DnD  
- TipTap editor  
- Slate editor (planned)  

---

## 📁 Project Structure

```text
workx/
├── public/
│   └── icons/
│
├── src/
│   ├── components/
│   │   ├── notes/
│   │   ├── tasks/
│   │   ├── journal/
│   │   ├── calendar/
│   │   ├── whiteboard/
│   │   ├── media/
│   │   ├── ai/
│   │   └── common/
│   │
│   ├── pages/
│   ├── hooks/
│   ├── services/
│   ├── database/
│   ├── store/
│   ├── utils/
│   ├── assets/
│   ├── styles/
│   └── App.tsx
│
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── index.html
└── README.md
```

---

## 📦 Main Modules

### 1. Notes Engine
Handles:
- page creation
- nested pages
- block rendering
- slash commands
- content persistence

### 2. Task Engine
Handles:
- to-do lists
- AI tasks
- kanban
- reminders

### 3. Journal Engine
Handles:
- daily notes
- entries
- timeline
- mood logs

### 4. Whiteboard Engine
Handles:
- drawing
- zooming
- media placement

### 5. Media Engine
Handles:
- uploads
- previews
- compression
- storage

### 6. AI Engine
Handles:
- prompt execution
- memory
- task generation
- assistant context

---

## 💾 Storage System

### IndexedDB

Used for:

- notes  
- tasks  
- journals  
- media files  
- whiteboards  
- AI cache  
- workspace data  

### LocalStorage

Used for:

- theme  
- UI settings  
- preferences  
- app config  
- quick cache  

---

## 🚀 Installation

Clone project :

```bash
git clone [https://github.com/Amangupta210/workx-main-byaman.git](https://github.com/Amangupta210/workx-main-byaman)
cd workx
```
---- 
Simple - download  Zip file 

Install packages:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build:

```bash
npm run build
```

---

## 📌 Planned Features

Upcoming updates:

- Notion-style block editor  
- advanced drag & drop  
- nested workspace tree  
- whiteboard collaboration  
- markdown export  
- PDF export  
- full search  
- AI memory across pages  
- voice assistant  
- document analysis  
- offline sync engine  
- mobile app  
- desktop app  

---

## 🤝 Contributing

You can join as a contributor.

We welcome:

- Developers  
- UI Designers  
- Testers  
- Open-source contributors  
- AI contributors  

Contribution steps:

1. Fork repository  
2. Create branch  
3. Make changes  
4. Commit  
5. Open pull request  

---

## 👨‍💻 Creator

Created by **Aman Gupta**

📧 Email: amangupta777aman@gmail.com  

📸 Instagram:  
[@gupta_aman_1516](https://www.instagram.com/gupta_aman_1516?)

---

## © Copyright

© 2026 Aman Gupta  
All rights reserved.

---

## 🌍 Vision

WorkX is being built as a personal operating system for productivity.

A single workspace where users can:

- write  
- plan  
- organize  
- think  
- create  
- store  
- use AI  

without needing constant internet access.

---

## ⭐ Philosophy

WorkX is based on one idea:

> Your work should belong to you — not only to the cloud.

Everything stays:

- local  
- fast  
- private  
- powerful  

---

# WorkX

### All your work. One place. Zero limits.     

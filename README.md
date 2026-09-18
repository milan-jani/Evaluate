# Evaluate

A modern, high-performance MCQ assessment and quiz hosting platform built with **React**, **Vite**, and **Supabase**.

**Live Demo**: [https://evaluate.pages.dev/](https://evaluate.pages.dev/)

Evaluate simplifies creating, hosting, taking, and reviewing assessments with real-time feedback, rich code formatting, and detailed analytics.

---

## Features

### Host & Test Management
- **Bulk CSV Upload**: Import hundreds of questions in seconds with full validation.
- **Rich Code & Markdown Formatting**: Native rendering for multi-line code blocks (` ```language ... ``` `), inline code badges (`` `code` ``), and line breaks.
- **Customizable Feedback Modes**:
  - **Instant Feedback Mode**: Reveals the correct answer immediately upon selection with option locking to prevent score manipulation.
  - **End-of-Test Review**: Traditional examination mode where results and explanations are displayed only after submission.
- **Flexible Timing & Schedules**:
  - Total test timer or per-question timer with auto-advancement.
  - Test schedule windows (Start time & End time) and configurable max attempt limits.
- **Shareable Join Codes & Direct Links**: Automatic test code generation with direct URL join support (`#join-CODE` / `?join=CODE`).
- **Live Host Dashboard**: View hosted tests, inspect question previews with formatted code blocks, and track candidate submissions.

### Candidate & Quiz-Taking Experience
- **Interactive Quiz Interface**: Clean, distraction-free environment with intuitive question navigation.
- **Question Palette & Status Indicators**: Dynamic grid showing **Answered**, **Unanswered**, and **Marked for Review** states.
- **Early Submission Modal**: Safe confirmation dialog summarizing answered/unanswered counts before final submission.
- **Comprehensive Results Breakdown**: Score percentage, time taken, question-by-question review, and explanations.
- **Attempt History & Re-attempting**: Tracks multiple attempts per test, showcases the candidate's highest score, and provides instant 1-click re-attempts.

### Design & Aesthetics
- **Dark & Light Theme**: Toggle seamlessly between dark and light modes with persistent user preference.
- **Responsive Glassmorphism UI**: Beautifully optimized for mobile, tablet, and desktop screens with Lucide icons.

---

## Tech Stack

- **Frontend**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Backend & Auth**: [Supabase](https://supabase.com/) (PostgreSQL & Row-Level Security)
- **Styling**: Vanilla CSS (Modern CSS variables, Glassmorphism, Responsive Grid)
- **Icons**: [Lucide React](https://lucide.dev/)

---

## Getting Started

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/milan-jani/Evaluate.git
cd Evaluate
npm install
```

### 2. Configure Supabase Environment

Create a `.env` file in the root directory (refer to `.env.example`):

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Setup Database Schema

Run the SQL migration script from `supabase-schema.sql` in your Supabase SQL Editor to create the necessary tables (`tests`, `questions`, `attempts`) and security policies.

### 4. Run Development Server

```bash
npm run dev
```

Open the local URL displayed in the terminal (usually `http://localhost:5173`).

---

## CSV Format & Guidelines

When importing questions via CSV, ensure the file includes the required headers:

```csv
question,option_a,option_b,option_c,option_d,correct_option,explanation
```

### Standard Question Example
```csv
"Which normal form removes partial dependency?","1NF","2NF","3NF","BCNF","B","Partial dependencies are removed in 2NF."
```

### Code Snippet Question Example
```csv
"What is the output?
```js
function outer() {
  let x = 7;
  return () => x;
}
const f = outer();
console.log(f());
```","7","ReferenceError","null","undefined","A","The inner arrow function retains access to variable x via lexical closure."
```

> **AI Prompt Tip for Generating Quizzes:**  
> When asking AI (ChatGPT, Claude, Gemini) to generate CSV quizzes with code:  
> *"Generate a CSV quiz with headers `question,option_a,option_b,option_c,option_d,correct_option,explanation`. For any code blocks, enclose code inside ` ```js ... ``` ` and format statements with explicit multi-line breaks using `\n` or double-quoted multiline strings."*

---

## Build for Production

```bash
npm run build
```

The production-ready bundle will be generated in the `dist/` directory.

---

## License

This project is open source and available under the [MIT License](LICENSE).

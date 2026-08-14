# MCQ Test Platform — Product Flow & Initial Specification

## 1. Goal

Build a platform where a teacher/host can create a multiple-choice test by uploading one structured file. The platform converts that file into a quiz, then gives the host a shareable link and a short test code. Students can use either to attempt the test and immediately see their marks. Accounts are recommended so students can revisit their previous attempts and results.

Example: a host uploads a **DBMS** question file, publishes the test, and shares `app.com/test/dbms-midterm-7KQ9` or code `7KQ9`. Friends open the platform, join the test, answer MCQs, submit, and receive a scored result.

## 2. User roles

| Role | What they can do |
| --- | --- |
| Signed-in user | Create, preview, schedule, publish, share, join, attempt, review results, and see personal history. |

There are no separate teacher and student roles. Every account can both host tests and join other people's tests.

## 3. End-to-end flow

### A. Host creates and publishes a test

1. Host signs in (or creates an account).
2. From **Create test**, host uploads a quiz file.
3. System validates the file and shows a preview:
   - title and subject;
   - question count;
   - each question, options, and correct answer;
   - errors with row/question numbers if the file is invalid.
4. Host configures test settings:
   - test title (e.g. `DBMS Unit 1 Test`);
   - description/instructions;
   - timer mode: no timer, total-test timer, or per-question timer;
   - total duration (only for a total-test timer);
   - time per question (only for a per-question timer);
   - schedule: start date/time and end date/time (or publish immediately with no end date);
   - attempts allowed per participant (host chooses the number, such as 1, 2, or 3);
   - result visibility: immediately after submit or only after host releases it;
5. Host clicks **Publish**.
6. System generates:
   - a permanent test URL; and
   - a short unique join code (for example `7KQ9`).
7. Host shares either one with students.

### B. Student joins and attempts

1. Student opens the shared link, or visits the home page and enters the join code.
2. Platform shows test title, instructions, duration, question count, and login requirement (if any).
3. Student signs in or creates an account using email and password.
4. System checks that the scheduled test is currently open and that the student still has an available attempt.
5. Student starts the test. An attempt record is created.
6. For each question, student selects one option. Answers are saved automatically, so a refresh does not lose progress for signed-in users.
7. Student submits manually. A total-test timer auto-submits all saved answers when it expires. A per-question timer locks that question and advances the student when it expires.
8. System evaluates the selected option against the stored correct option.
9. Student sees result according to the host setting:
   - score: `16 / 20`;
   - percentage;
   - each question marked as correct, incorrect, or unattempted, with its correct option and explanation.
10. Student can revisit this attempt from **My joined tests**.

### C. Host reviews results

1. Host opens **My tests** and chooses a test.
2. Dashboard displays total attempts, participants, average score, highest score, and individual results.
3. Host can search/filter attempts and export results as CSV.
4. Host can close the test to prevent new attempts, or publish/unpublish it.

## 4. Recommended first-version screens

1. Landing page: join by code, sign in/sign up, create a test.
2. Authentication: email/password sign-up and sign-in.
3. Personal dashboard: **My hosted tests** and **My joined tests**, with quick metrics.
4. Create test: upload + validation preview + settings.
5. Test share page: URL, join code, copy/share buttons.
6. Join test page: test overview and name/login entry.
7. Attempt page: question navigation, answer selection, timer, submit confirmation.
8. Result page: score and answer review.
9. My joined tests: past attempts, results, and remaining attempts (if any).
10. Host test analytics: attempts table and CSV export.

### Visual/UI direction

The interface should feel like a polished education product, not an AI tool: clean, professional, calm, and easy to scan. Use readable typography, consistent spacing, restrained colors, clear labels, and obvious primary actions. Avoid chatbot prompts, AI-themed imagery, excessive gradients, and unnecessary visual clutter.

- Account dashboard: simple tabs/sections for **My hosted tests** and **My joined tests**, so the same user can switch naturally between creating and attempting.
- Test creation: step-by-step creator, clear import errors, schedule/attempt controls, and prominent sharing controls.
- Student workflow: distraction-free test screen, visible progress (for example, `8 of 20`), clear answer states, and a timer only when enabled.
- Result screen: score summary first, then question review. Correct/incorrect status must use clear text/icons as well as accessible colors.

## 5. Quiz upload format (recommended: CSV)

CSV is the best initial format because teachers can create it in Excel/Google Sheets and the system can validate it reliably. One row represents one MCQ.

Required columns:

```csv
question,option_a,option_b,option_c,option_d,correct_option,explanation
"Which normal form removes partial dependency?","1NF","2NF","3NF","BCNF","B","A partial dependency is removed in 2NF."
"Which SQL command removes a table definition?","DELETE","DROP","TRUNCATE","REMOVE","B","DROP removes the table definition."
```

Rules:

- `question`, `option_a` through `option_d`, and `correct_option` are required.
- `correct_option` must be exactly `A`, `B`, `C`, or `D`.
- `explanation` is optional and is shown after submission when it is present.
- Text containing commas must be wrapped in double quotes, as in normal CSV.
- Initial version supports exactly four options per question. Later, the schema can support variable option counts.
- First row must be the exact column headings shown above.

Why CSV instead of TXT in v1: free-form text is easy for people to write but difficult to parse consistently; CSV gives clear validation errors and works with spreadsheets.

## 6. Accounts and dashboard behaviour

The first time someone uses the platform, they create one account with their email address, name, and password. The account keeps all their data. Later they sign in with the same email and password and can see their history and use both capabilities without selecting a role.

- **My hosted tests:** tests created by the user; status, schedule, join code, sharing link, attempts received, and analytics.
- **My joined tests:** tests the user has attempted or can currently attempt; score history, attempt count, and remaining attempts.
- A user may create a test today and join a friend's test tomorrow using the same account.
- Email verification and password reset should be included before public launch; they may be implemented after the core quiz flow during development.

Guest attempts are removed from the MVP: an account is required so results and allowed-attempt rules are reliable.

## 7. Scheduling and allowed attempts

While creating a test, the host chooses both availability and number of attempts:

| Setting | Host choice | System behaviour |
| --- | --- | --- |
| Start time | Publish now or select future date/time | Test is not joinable before its start time. |
| End time | No end time or select date/time | New attempts cannot start after the end time. |
| Attempts per participant | A whole number, for example 1, 2, or 3 | System blocks more attempts once the limit is reached. |

Recommended defaults: publish now, no end time, and one attempt per participant. A scheduled test can be edited while it has no attempts. Once attempts exist, question answers must remain locked to preserve fair evaluation.

## 8. Timer behaviour

Timer is optional. The test creator selects one of these modes:

| Setting | Student experience |
| --- | --- |
| No timer | Student may move between questions and submit whenever ready. |
| Total duration | One countdown for the full test, such as 30 minutes. Expiry auto-submits the attempt. |
| Per-question duration | Each question gets a countdown, such as 60 seconds. Expiry locks that question and advances to the next. |

Timer rules:

- Total duration uses whole minutes; per-question duration uses whole seconds.
- Total-test timing and per-question timing are mutually exclusive in MVP.
- The server stores the start time and calculates remaining time, so changing the browser clock cannot extend an attempt.
- On refresh, remaining time and saved answers are restored.

## 9. Evaluation logic and result review for MCQs

For each submitted question:

- selected option equals `correct_option` → award marks;
- otherwise → zero marks (unless negative marking is later enabled);
- unattempted question → zero marks.

Initial scoring: one mark per question, no negative marking. A later setting may add per-question marks and negative marks.

The server must calculate marks; the browser must never receive the answer key before submission.

After submission, students see the score, percentage, and a review of every question: correct, incorrect, or unattempted; their selected option; the correct option; and the optional explanation from the CSV. This learning-focused review is enabled by default; later, a host can choose to delay it for formal exams.

## 10. Core data to store

| Entity | Key data |
| --- | --- |
| User | name, email, password hash, verified status, profile, created date |
| Test | host, title, schedule, allowed attempts, timer mode/value, status, join code, share slug |
| Question | test, question text, options, correct answer, explanation, order |
| Attempt | test, participant/user, start time, submit time, score, status |
| Answer | attempt, question, selected option, correctness, awarded marks |

## 11. Important rules and edge cases

- A join code must be unique and easy to type (avoid ambiguous characters such as `O/0` and `I/1`).
- A draft test cannot be attempted.
- Tests outside their configured availability window cannot be started.
- On submit, lock the attempt and calculate the score once on the server.
- If a student refreshes mid-test, restore saved answers and remaining time.
- When a per-question timer expires, the student cannot return to that question.
- A test may have a fixed number of allowed attempts; the system must enforce it.
- Student answer review is shown immediately after submission in MVP.
- Host cannot change question answers after a published test has attempts; instead, duplicate/edit it as a new draft.
- File import must report clear errors: missing column, empty question, invalid correct answer, or too few options.

## 12. Scope: MVP vs later

### MVP (build first)

- Account sign-up/sign-in.
- CSV upload, validation, preview, and MCQ test creation.
- Publish, shareable URL, and join code.
- Email/password accounts; each account can host and join tests.
- Scheduled start/end availability and host-selected attempt limits.
- Four-option MCQs, automatic scoring, immediate score display.
- No timer, total-test timer, or per-question timer.
- Detailed result review with correct/incorrect status, correct options, and explanations.
- Student attempt history for accounts.
- Basic host results list and CSV export.

### Later enhancements

- Descriptive questions with host manual marking.
- AI-assisted grading for descriptive answers, with host review/override.
- Question banks, random question/order shuffling.
- Negative marking, per-question weighting, sections.
- Image/code attachments in questions.
- Email invites and notifications.
- Anti-cheating controls (fullscreen, tab-switch logging, proctoring) as a separate privacy-sensitive feature.
- Certificates, leaderboards, and richer analytics.

## 13. Confirmed MVP decisions

1. Questions are fixed-format, four-option MCQs: A, B, C, D; exactly one correct answer.
2. CSV is the only initial import format.
3. Host may select no timer, total-test timer, or per-question timer.
4. Students see correct/incorrect status, the correct option, and any explanation after submission.
5. UI will be clean, professional, and education-first, with no AI-themed appearance.
6. An account is required; email/password sign-up keeps all test and result history.
7. The same account can host tests and join tests; there are no teacher/student roles.
8. Host chooses allowed attempts and can schedule test start/end availability while creating a test.

## 14. Remaining choices before development

1. Should email verification be mandatory before a user can create or attempt a test, or only required later for password recovery? (Recommended: mandatory before public launch.)
2. Should an attempt that begins before the end time be allowed to finish after it, or should it auto-submit at the test end time? (Recommended: auto-submit at end time.)

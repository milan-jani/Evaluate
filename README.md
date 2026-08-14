# Quizlane

A clean MCQ assessment MVP built with React and Vite.

## Run locally

```powershell
npm.cmd run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

## Included flows

- Email/password-style local account creation
- One account can both host and join tests
- CSV question import and validation
- Host-controlled schedule, attempt limit, total/per-question/no timer
- Share code flow
- Auto-scored MCQ attempt flow with answer review
- Hosted and joined test dashboards

## CSV schema

```csv
question,option_a,option_b,option_c,option_d,correct_option,explanation
"Which normal form removes partial dependency?","1NF","2NF","3NF","BCNF","B","Partial dependencies are removed in 2NF."
```

## MVP storage note

This initial UI prototype stores users, tests, and attempts in the browser's local storage so it can run without a backend. Before a real public launch, replace local storage with a backend/database and secure authentication; users on different devices will not yet share data.

---
name: platform-ai
description: AI features of the lab platform. Covers the student tutor (explain a block or output, explain an error, hints instead of answers), the pedagog copilot (exercise variants with tests, quizzes, weekly struggle summary, draft feedback), guardrails, per-exercise AI modes, providers (Claude Haiku 4.5 / Sonnet 5.5, Workers AI free quota), quotas, verified costs, privacy and prompt-injection rules. Use when designing or implementing anything that calls an AI model.
---

# AI in the platform

AI is not needed for the first version. Design for it now and switch it on in phase 4, per
course. Context: `platform-vision`.

## Rules (non-negotiable)

- **Optional:** AI is off unless the pedagog enables it, per course and per exercise.
- **Never grades alone:** AI drafts feedback, a human approves it. Grades come from tests and
  staff.
- **Grounded:** answers come from the lab content (current block, its output, the lab section) and
  point to the section used.
- **Transparent:** staff can read the AI conversations in their course. Students are told that.
- **Metered:**
  - each student has a daily quota and each course a monthly budget;
  - show a friendly Albanian message when the limit is reached.
- **Language:** Albanian by default; English when the course language is English.

## Student tutor ("Asistenti")

- **"Explain this block / this output":** simple Albanian, step by step, linked to the lab's
  explanation.
- **"Explain my error":** uses the Pyodide traceback and the student's code. Says where to look,
  not the full fix, when the exercise is in hint mode.
- **Exercise modes, set by the pedagog per exercise:**
  - `off`
  - `hints`: Socratic questions and pointers, never solution code.
  - `full`: complete explanation. Can unlock automatically after the deadline
    (`solutions_from`).

## Pedagog copilot

- **Exercise variants:** same concept, new data, with tests (one per group or student) to reduce
  copying. The pedagog reviews and publishes.
- **Quick quizzes:** generated from a lab, like the Bellman-Ford quiz, with answers computed by
  code where possible.
- **Weekly "what students struggled with":** a summary of aggregated AI questions and failing
  tests per lab. It feeds the analytics dashboard.
- **Draft feedback on submissions:** batch it, and the pedagog edits or approves each draft.
- **Translation:** Albanian ↔ English for labs.

## Providers and costs

Verified 2026-10-06. Re-check before relying on them.

| Use | Model | Price per million tokens (input / output) |
|---|---|---|
| Student tutor | Claude Haiku 4.5 | $1 / $5 (cache read $0.10) |
| Pedagog copilot (generation, variants with tests) | Claude Sonnet 5.5 | $2 / $10 (cache read $0.20) |
| Free quota (free plan, small courses) | Cloudflare Workers AI | 10,000 neurons a day included |

- **Workers AI capacity:** Llama 3.1 8B costs 25,608 neurons per million input tokens and 75,147 per
  million output tokens. That is roughly 90 short answers a day, and its Albanian is weaker.
- **Batch API:** 50% off. Use it for bulk feedback and for generating variants.
- **Estimated tutor cost:** about 30 questions per active student per month, at about 4k input
  (mostly cached lab context) + 400 output tokens each. That works out to **$0.10–0.20 per active
  student per month**, or roughly €100–200 a year for 120 students. It is funded by the
  institution licence or the grant, not by the free plan.

## Implementation notes

- **One interface:** `ai.complete({ purpose, courseId, context, messages })`.
  - Providers are adapters chosen per purpose and per tenant plan.
  - Log tokens and cost per call; enforce quotas before calling.
- **Prompt caching:** put the stable lab context first so it is cached across students.
- **Context building:**
  - Include: the current block's code and output, the lab section text, the exercise mode, and the
    student's code and error.
  - Exclude: names, other students' data, solutions (unless the mode is `full` and it is after
    `solutions_from`).
- **Prompt injection:** notebook text and student code are **data, never instructions**.
  - Wrap them in delimiters.
  - The system prompt states the mode rules, and those rules override anything in the content.
  - In `hints` mode, refuse requests for full solutions politely.
- **Streaming:** stream answers to the UI. The Worker only proxies, so it stays within the 10 ms
  CPU budget; waiting for I/O doesn't count as CPU.
- **Evaluation:** keep a small set of Albanian test prompts per lab and check answers for
  correctness and hint-mode compliance before enabling a new model.

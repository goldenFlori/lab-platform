# Data Processing Agreement (template)

> **Template, version 1 (19 October 2026).** To be reviewed by a lawyer before anyone signs it.
> It is not legal advice. Text in [square brackets] is filled in for each institution. The
> Albanian version (`dpa-template.sq.md`) is the one signed; this English version follows it.
>
> Every technical statement below describes what the platform does today. When the platform
> changes, this template changes in the same pull request.

## Parties

- **Controller:** [institution's name], [address], [NIPT or registration number], represented by
  [name, position] (the "Institution").
- **Processor:** [operator's name], [address], [NIPT], operator of Lab Platform (the "Operator").

## 1. Purpose and law

1.1. The Institution uses Lab Platform to teach programming and algorithms courses. In doing so the
Operator processes personal data on the Institution's behalf. This agreement sets the terms of that
processing, as Article 26 of Law No. 124/2024 "On personal data protection" (the "Law") requires.

1.2. Terms such as personal data, processing, controller, processor, sub-processor and personal
data breach have the meaning given in Article 5 of the Law.

1.3. Annex 1 describes the processing: its subject matter, nature, purposes, the types of
personal data and the categories of data subjects. It lasts as long as the service agreement,
plus the return and deletion period in section 10.

## 2. The Institution's instructions

2.1. The Operator processes the personal data only on the Institution's documented instructions,
including with regard to transfers, unless the law to which the Operator is subject requires
otherwise. In that case the Operator tells the Institution before processing, unless that law
forbids it (Article 26(3)(a)).

2.2. The instructions are this agreement and the settings the Institution chooses in the platform:
which accounts exist, who holds which role in the Institution or in which course or group, which
labs are open, whether the Institution allows AI features, and whether they are on for each course.
Each such setting is an instruction.

2.3. The Operator tells the Institution immediately if, in its opinion, an instruction breaks the
Law (Article 26(3)(f)).

2.4. The Operator does not use the personal data for its own purposes. It does not sell it, share
it, profile users for advertising, or train AI models on it.

## 3. Confidentiality

3.1. Only people who need access to provide the service, support or backups have it. They are
bound to confidentiality under Article 30 of the Law or by contract (Article 26(3)(b)).

3.2. Today that is the Operator's owner alone. Anyone else given access is named to the
Institution beforehand.

## 4. Security

4.1. The Operator takes the technical and organisational measures in Annex 2, as Article 28 of the
Law requires (Article 26(3)(c)).

4.2. The Operator may improve these measures, but never lower the protection they give.

## 5. Sub-processors

5.1. The Institution gives a general written authorisation for the sub-processors in Annex 3
(Article 26(2)).

5.2. The Operator tells the Institution at least 30 days before adding or replacing a
sub-processor. The Institution may object in that time on reasonable grounds about data
protection. If the parties cannot resolve the objection, the Institution may end the service
agreement without penalty, and section 10 applies.

5.3. Each sub-processor is bound to the same data protection obligations by contract. The Operator
remains fully liable to the Institution for its sub-processors (Article 26(4)).

## 6. Where the data is and transfers

6.1. **Stored in the EU.** The database and the Live Lab sessions use Cloudflare's EU
jurisdiction, so they are stored and processed only in data centres in the European Union. The
Commissioner's Decision No. 1 of 30 April 2025 lists EU member states as ensuring an adequate
level of protection (Article 40).

6.2. **Requests.** Requests to the platform pass through the Cloudflare data centre nearest the
user while they are served. The data is stored only as set out in 6.1.

6.3. **AI.** When AI is on for a course, the text of an AI request (a student's code, the error and
the lab text, or a staff member's question) goes to Cloudflare Workers AI. Cloudflare does not
offer an EU restriction for Workers AI, so such a request may be processed outside the EU.
Cloudflare, Inc. is certified under the EU–US Data Privacy Framework. Decision No. 1 lists the
United States as adequate for companies under that framework. An AI request never contains a
name, a username or an email address. The AI is off unless staff switch it on for a course, and
the Institution's admin can forbid it for all its courses, which switches it off wherever it is on.

6.4. **Backups.** The weekly backup is encrypted with the Operator's key before it leaves
Cloudflare. It is kept at GitHub, Inc. (United States) for 90 days, and GitHub holds only the
encrypted file.

6.5. The Operator makes no other transfer outside Albania and the EU without the Institution's
written instruction and the safeguards of Articles 39 to 41 of the Law.

## 7. Data subjects' rights

7.1. The Operator helps the Institution answer requests from data subjects under Chapter II of the
Law (Article 26(3)(d)). The platform provides these tools:

- **Access and portability** (Articles 14 and 18): each user downloads all data kept about them as
  a JSON file, under "My data".
- **Rectification** (Article 15): staff correct names and roles; the Operator corrects anything
  else on the Institution's request.
- **Erasure** (Articles 15 and 16): a user sends a deletion request, which the Institution's
  administrators see. An administrator erases the person's data in the Institution, after
  downloading any released grades the Institution must keep. The person's data in other
  institutions is not touched. The account is deleted when it belongs to no other institution.
- **Information** (Article 13): the platform's public privacy page, which the Institution may
  point its students to.

7.2. A request that reaches the Operator directly is passed to the Institution within 5 working
days. The Operator does not answer it on its own.

## 8. Personal data breaches

8.1. The Operator tells the Institution of a personal data breach immediately after becoming aware
of it, and in any case within 24 hours (Article 29(2)). The Institution can then notify the
Commissioner within the 72 hours of Article 29(1).

8.2. The notice gives what Article 29(4) asks for, as far as it is known, and the rest as soon as
possible:
- the nature of the breach;
- the categories and approximate number of people and records concerned;
- a contact point;
- the likely consequences;
- the measures taken or proposed.

8.3. The Operator documents each breach and helps the Institution inform the data subjects when
Article 29(3) requires it.

## 9. Other assistance

The Operator helps the Institution with the obligations of Chapter III of the Law, given the
information it has (Article 26(3)(e)). This covers security, data protection impact assessments
(Article 31) and prior consultation (Article 32).

## 10. End of the service

10.1. When the service ends, the Institution's administrator downloads the Institution's data
from the platform (Annex 1, section 5). The Operator gives reasonable help with this.

10.2. Within 30 days after the end, the Operator deletes the Institution's data from the platform,
unless the law requires keeping it (Article 26(3)(ë)). Copies in backups disappear as they expire,
within 90 days. The Operator confirms the deletion in writing.

## 11. Retention

11.1. During the service the platform keeps data for the periods in Annex 4. A nightly job deletes
on its own what has passed its period.

11.2. The Institution decides how long courses and the students' work in them are kept, by
deleting courses.

## 12. Information and audits

12.1. The Operator gives the Institution the information needed to show compliance with this
agreement (Article 26(3)(f)). This includes this document, its annexes and answers to reasonable
written questions.

12.2. The Operator allows audits by the Institution or an auditor it mandates, with at least 30
days' notice, at most once a year unless a breach or the Commissioner calls for it. Each party
bears its own costs.

## 13. The Institution's obligations

The Institution:
- has a lawful basis for the processing (Articles 6 and 7 of the Law) and informs its students;
- creates accounts and gives roles only to those who need them;
- puts no special categories of data (Article 9) into notebooks, names or notes;
- tells the Operator who may give instructions on its behalf.

## 14. Liability, term and law

14.1. Liability follows Article 88 of the Law and the service agreement.

14.2. This agreement lasts as long as the service agreement and, after it, until section 10 is
fulfilled.

14.3. It is governed by the law of the Republic of Albania. The courts of Tirana settle disputes
[or as the service agreement provides].

[Place, date, signatures]

---

## Annex 1: The processing

**1. Data subjects**
- the Institution's students;
- teaching staff (pedagogs, assistants, coordinators);
- the Institution's administrators.

**2. Personal data**

| Category | What |
|---|---|
| Account | Full name, username, optional email, chosen interface language. The password is kept only as a hash. |
| Roles | The institutions, courses and groups a person belongs to, and their role. |
| Learning work | Code a student changes in notebooks (seen only by them until handed in), exercises solved, work handed in, grades and feedback. |
| Activity | At most one record per student, lab, kind and day: opened, downloaded, tried a visualisation, solved an exercise, ran code, took part in a Live Lab. |
| First-try results | A student's first answer to each decision of an embedded visualisation or row of a trace table: whether it was right, what they answered, the question and the day. Practice, never a grade; staff see it only as counts from five students up. |
| AI | "Explain my error" questions (code, error, answer); the number of AI requests per person and day. |
| Live Labs | While a class runs: who is connected, help requests, reactions, quiz answers and challenge results. |
| Surveys | End-of-semester answers, kept anonymous: ratings only as counts, comments with no author or time. |
| Data rights | Deletion requests and their notes; a record of each erasure without the person's identity. |
| Technical | A session per sign-in (a hash of its token, the browser's name, last use); failed sign-ins, counted by username and network address for a few minutes; error reports from browsers (the page as its route without ids, the error's message, the browser and the application's version; no user, code or answers). |

No special categories of data are intended.

**3. Purposes**
- teaching and learning in the Institution's courses: running labs and notebooks in the browser,
  submissions and grading, Live Labs, AI hints;
- counts-only reports for the Institution's staff;
- the security of the service;
- backups.

**4. Nature of the processing**
- storage, organisation, consultation and deletion, in a web service;
- students' code runs in their own browsers, not on the Operator's servers.

**5. The Institution's own export**

The administrator downloads the Institution's data at any time as one JSON file. It contains:
- people (without password hashes) and memberships;
- course structure;
- notebooks with their original files;
- exercises, submissions (with the start times of timed tests) and grades;
- activity, first-try results, AI records, Live Lab history, surveys, deletion requests and erasures.

Students' unsubmitted code stays private to them and is not in it.

## Annex 2: Technical and organisational measures

- **Location:** the database and Live Lab sessions use Cloudflare's EU jurisdiction (section 6).
- **Transport:** HTTPS only.
- **Passwords:** hashed with PBKDF2-SHA256 and a random salt. Imported students' passwords are made
  in the teacher's browser and never stored in plain text.
- **Sessions:**
  - only a SHA-256 hash of the session token is stored;
  - the cookie is `__Host-`, HttpOnly, Secure and SameSite=Lax;
  - sessions end after 30 days without use.
- **Guessing limits:** failed sign-ins are limited per username and per network address.
- **Access control:**
  - capabilities per role, checked by the server on every request, for the course or group
    concerned;
  - students see only their own work;
  - staff see their own groups only;
  - the Operator's console creates institutions and their first administrators and shows each
    institution's counts only (courses, staff, students, active students), never its people's data;
    the Operator's accounts are named in the hosting configuration, not in the database.
- **Separation of institutions:** every query is scoped to one institution, enforced by the
  database's keys and proven by automated tests.
- **Content safety:**
  - uploaded files are served with a sandboxing Content Security Policy;
  - notebook HTML is sanitised before it is shown;
  - students' code runs in their browser, isolated from the server;
  - a student's work not yet saved (when the connection or the free plan's daily limit fails) is kept
    in their own browser under their account until it is saved, and removed then or at sign-out.
- **Minimal data:**
  - no third-party trackers or advertising;
  - activity is recorded as counts;
  - AI requests carry no names.
- **Retention:** a nightly job deletes data past the periods in Annex 4.
- **Backups:**
  - point-in-time restore for 7 days (Cloudflare D1);
  - weekly exports encrypted with the Operator's key (age) before they leave Cloudflare, kept 90
    days.
- **Change control:**
  - every change goes through review and automated tests (permissions, privacy and separation of
    institutions) before it is deployed;
  - database changes only add.

## Annex 3: Sub-processors

| Sub-processor | Location | What it does | What it receives | Safeguard |
|---|---|---|---|---|
| Cloudflare, Inc. | United States; data centres worldwide | Hosting: Workers (the application), D1 (the database, EU jurisdiction), Durable Objects (Live Labs, EU jurisdiction), Workers AI (AI features), Workers Logs (error reports, 3 days) | All platform data, stored in the EU; AI request text without names | Cloudflare Customer DPA; EU–US Data Privacy Framework; Decision No. 1/2025 |
| GitHub, Inc. | United States | Source code, automated tests, weekly backups | Encrypted backups only, which it cannot read | Encryption with the Operator's key; Data Privacy Framework [confirm the current certification] |

## Annex 4: Retention

The same periods as `src/shared/retention.ts`, which the nightly job and the privacy page use:

| Data | Kept |
|---|---|
| Sign-in (session) | 30 days without use |
| "Explain my error" questions and answers | 180 days |
| Daily activity, first-try results, AI use counts, Live Lab records | 2 years |
| A handled deletion request | 1 year after it was handled |
| Failed sign-in counters | a few minutes |
| Error reports and the application's error logs (Cloudflare Workers Logs) | 3 days |
| Students' code, submissions, grades, surveys, the rest | as long as the course exists; the Institution deletes courses |
| Backups | 90 days |

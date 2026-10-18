---
name: platform-business
description: Startup and grant strategy for the lab platform. Covers the pitch and differentiation from Google Classroom, innovation and impact points, market and expansion, business model and pricing logic, cost structure, the verified facts of the Startup Albania grant program, application strategy, pilot metrics, and legal checks (university IP, data protection). Use when writing pitches, grant applications, pricing, budgets or business plans.
---

# Startup and grant

Product context: `platform-vision`. Costs and limits: `platform-architecture`, `platform-ai`.

## Pitch

- **One line:** "Classroom shares files. This platform teaches. Students run the code, watch the
  algorithm move, and get help in Albanian, while the teacher controls everything."
- **Innovation points:**
  1. **Live coding in the browser:** real Python with nothing to install. It runs on the
     student's own device, so it works on cheap laptops and scales at almost zero cost.
  2. **"Your code, visualized":** a student's own algorithm drives the same animations as the
     lesson.
  3. **Live Labs:** real-time class sessions with challenges and a live dashboard of who is stuck.
  4. **An AI tutor in Albanian with pedagogical guardrails:** hints, not answers; controlled by
     the teacher; grounded in the course.
  5. **Multi-tenant platform:** any university or school gets its own branded space; courses can
     be shared.
- **Impact:**
  - better STEM and computer-science teaching in Albanian;
  - equal access (no installs, any device);
  - teacher time saved;
  - learning analytics for faculties.

## Market

- **First:** Albanian universities with CS, IT, engineering or math programs (public and
  private); the pilot is this course at FSHN.
- **Next:**
  - high schools teaching informatics;
  - coding bootcamps;
  - Albanian-speaking markets (Kosovo, North Macedonia).
- **Later:** English, for the Balkans and the EU.

## Business model

- **Free:** one teacher, one course; small AI quota; core labs, live coding and visualizations.
  This drives adoption.
- **Institution licence (per student per year):** includes AI tutor and copilot, Google/Microsoft
  login, Moodle (LTI) and Classroom integration, analytics, branding, custom domain, support.
- **Cost base:**
  - Cloudflare: free, then $5/month;
  - AI: about $0.10–0.20 per active student per month;
  - email and domain: small.

  Price the licence so that AI plus infrastructure stays under about a third of it.
- **Content:** the software is the product. Course content belongs to its authors. The
  coordinator's lecture material and the labs are content and are not part of the product.

## Startup Albania grant

Facts verified 2026-10-06 (sources: albaniatech.org, inalbania.info). Re-verify dates and amounts
on startupalbania.gov.al before applying.

- **Program:** "Grant 2026" (Innovation4Albania). Total ALL 300 million for 2026; two calls a
  year. The 2026 call opened on 17 February 2026. Apply through e-Albania or
  startupalbania.gov.al/grant.
- **Who can apply:** early-stage startups, including private individuals (local or foreign), and
  support structures (universities, incubators, accelerators).
- **Priority:** technology (digital transformation) and the green economy.
- **Categories:**
  - Phase 1, early stage: up to ALL 1.5M (≈ €15k), 100% of eligible costs.
  - Phase 2, validation: up to ALL 4.5M (≈ €45k), 85%.
  - Phase 3, growth: up to ALL 9M (≈ €90k), 75%.
  - Support structures: up to ALL 13M, 75%.
- **Competition:** more than 1,000 applicants in 2026. The government reports €16.5M invested in
  startups over four years.

## Application strategy

1. **Apply after phase 2 or 3** of the roadmap, with a working product and one semester of pilot
   data.
2. **Pilot metrics** (collect from phase 1; privacy-friendly aggregates). The course's "Pilot
   report" (#101) prints all of them for any period, with the survey's results (#102):
   - weekly active students;
   - labs opened;
   - code runs;
   - live-session participation;
   - exercise completion;
   - AI questions (phase 4);
   - an end-of-semester satisfaction survey.
3. **Evidence:**
   - a support letter from the faculty or course coordinator;
   - a short demo video (live coding plus "your code, visualized");
   - screenshots of the analytics.
4. **Budget lines (eligible costs):**
   - development time;
   - hosting (paid plan);
   - AI credits for the pilot;
   - a domain;
   - outreach to two or three more faculties.
5. **Milestones:** reuse the roadmap phases, each with measurable outcomes.

## Legal checks before selling

- **University IP policy:** does the university claim rights to software built for teaching?
  Clarify this in writing early.
- **Data protection:** the Albanian personal data protection law (aligned with GDPR). Institutions
  will need a data processing agreement, a privacy policy, minimal data, and export and delete.
  The privacy page, the data download, deletion requests (#100) and erasure by the institution's
  admin (#115) exist; the data processing agreement does not yet (#118).
- **Repo and licence:**
  - Keep the platform code private and proprietary. In the course site, `package.json` says
    "ISC", which is only npm's default.
  - The course repo stays public for course content only.
- **Company:** register one when a grant or first contract requires it.

import type { HelpText } from './help.sq';

// The guides in English (#194), typed against the Albanian source. **Bold** names are the English
// interface's own words.

export const help: HelpText = {
  pageTitle: 'Help',
  title: 'Help',
  lead: 'Short guides to everything done on the platform, with pictures of the pages themselves.',
  students: 'For students',
  staff: 'For pedagogs and assistants',
  back: 'All the guides',
  steps: (n) => `${n} steps`,
  shotAlt: (step) => `Picture of step ${step}`,
  missing: 'This guide does not exist.',
  open: 'Help',
  openGuide: (title) => `Help: ${title}`,
  guides: [
    {
      id: 'first-lab',
      audience: 'student',
      title: 'Your first lab',
      summary: 'Signing in, your course and reading a lab.',
      steps: [
        {
          text: 'Sign in with the **username** and **password** on the slip your pedagog gave you. If you were given a join code or a QR code, open it and press **Join**.',
        },
        {
          text: 'In **My courses**, open the course. **Your path** shows the open labs, coloured by what you have done: not started, started, handed in, graded.',
          shot: 'course-student',
        },
        {
          text: 'Open a lab and read it from the top: the text, the code and its results, as in class. The visualizations are where your pedagog placed them.',
          shot: 'lab-student',
        },
        {
          text: 'Before the first class, at home, press **Get this device ready for Python** on the course, so Python downloads once (see the guide "Get your device ready").',
        },
      ],
    },
    {
      id: 'run-code',
      audience: 'student',
      title: 'Run and edit the code',
      summary: 'Python in the browser, your own code, errors and the exercises’ checks.',
      steps: [
        {
          text: 'Press **Run** on a code cell. The result shows below it. A notebook’s cells share their variables, as in Jupyter: run them in order.',
          shot: 'run-output',
        },
        {
          text: 'Press **Edit the code** and type. Your code is saved to your account by itself and follows you to any device; **Restore the original code** puts the cell back as it was.',
        },
        {
          text: 'When the code stops with an error, its line is marked in red. If your pedagog turned AI on, **Explain the error** gives a hint, not the solution.',
        },
        { text: 'In an exercise, the check shows as soon as the cell runs: ✓, or ✗ with the case that failed.' },
        { text: 'Code that does not finish stops with **Stop**.' },
      ],
    },
    {
      id: 'visualizations',
      audience: 'student',
      title: 'Visualizations and trace tables',
      summary: 'Stepping through, predicting, and filling in a table.',
      steps: [
        { text: 'Step with the ← and → arrows or the visualization’s buttons; space plays it.' },
        {
          text: 'Turn on **Predict**: the visualization stops at each of the algorithm’s decisions and asks you before showing it. It is practice, not a grade.',
        },
        {
          text: 'In a trace table, fill in each row as on paper (∞, A-C, yes, ∅) and check it. A wrong cell shows the rule it breaks, not the value.',
        },
        {
          text: 'A graded table is not checked while you work: its rows are saved and graded when you hand in the notebook.',
        },
      ],
    },
    {
      id: 'hand-in',
      audience: 'student',
      title: 'Handing in and the timed test',
      summary: 'Deadlines, handing in, the timed test (kolokium) and grades.',
      steps: [
        {
          text: 'When a notebook is open for handing in, its deadline shows above it. **Hand in my work** sends your code as it is saved, your exercises and tables; until the deadline you can hand in again.',
          shot: 'submission-bar',
        },
        {
          text: 'A timed test runs on your own clock: start it with **Start the test** whenever you like before the deadline, and from then on you have its minutes. Its notebook opens only once you start.',
        },
        {
          text: 'A timed test is handed in once. While it runs you see only its lab, and AI help is off.',
        },
        {
          text: 'If the internet drops, your work stays on the device and is saved by itself when it is back. Keep the page open: handing in is tried again by itself.',
        },
        {
          text: 'When your pedagog releases the grades, yours and its comment show above the notebook and in **My progress**.',
        },
      ],
    },
    {
      id: 'progress',
      audience: 'student',
      title: 'My progress and review',
      summary: 'What you have done, how well you understand it, and what to review.',
      steps: [
        {
          text: '**My progress** (on the course) shows the open labs, the exercises you solved, deadlines and grades. Only you see it.',
          shot: 'progress',
        },
        {
          text: '**My understanding** shows how often you got the algorithms’ steps right at the first try, by topic, and what is worth reviewing.',
        },
        {
          text: '**Review** gives up to eight short questions on the algorithms of the labs you opened, more often those you get wrong.',
        },
      ],
    },
    {
      id: 'get-ready',
      audience: 'student',
      title: 'Get your device ready',
      summary: 'Python and the libraries, downloaded once before the first class.',
      steps: [
        {
          text: 'Before the first class, at home or on fast Wi-Fi, open **Get this device ready for Python** on the course, or the link your pedagog gave you.',
        },
        {
          text: 'Press **Get this device ready**: Python and the course’s libraries download once (about 31 MB) and stay on the device.',
          shot: 'ready',
        },
        { text: 'Once **Ready!** shows, labs run at once, in class too, without downloading anything.' },
        {
          text: 'If it says this browser cannot, use the latest version of Chrome, Edge, Firefox or Safari.',
        },
      ],
    },
    {
      id: 'course',
      audience: 'staff',
      title: 'The course and its groups',
      summary: 'This year’s course, groups with their join codes, and the staff.',
      steps: [
        { text: 'In **My courses**, press **New course**. **Copy the labs from** brings last year’s labs.' },
        {
          text: 'Add the groups. Each has a **Join code**: **Show on screen** shows it with a QR code for the projector, **New code** replaces it.',
          shot: 'course-staff',
        },
        {
          text: 'A course has its own language for students who have not chosen one, and you decide whether AI is on.',
        },
        { text: 'In **Course staff**, add pedagogs and assistants, for the whole course or one group.' },
        {
          text: 'Before the first class, share the link in **Before the first class** with your students, so devices get ready at home.',
        },
      ],
    },
    {
      id: 'students',
      audience: 'staff',
      title: 'Students and sign-in slips',
      summary: 'A group’s accounts, slips to print, and forgotten passwords.',
      steps: [
        {
          text: 'Open the group and **Import students**: paste the list of names, or upload a CSV or Excel file.',
          shot: 'import',
        },
        { text: 'Check the names. Passwords are made in your browser; the server receives only their hashes.' },
        {
          text: '**Print the slips**: ten to an A4 page, with the username and password. The passwords are kept nowhere else, so print them before leaving the page.',
        },
        { text: 'For a forgotten password: **New password** on the student, and print their slip.' },
      ],
    },
    {
      id: 'labs',
      audience: 'staff',
      title: 'Labs and notebooks',
      summary: 'Opening labs, notebooks, visualizations and presenting.',
      steps: [
        {
          text: 'On the course, **Open** opens a lab to everyone. **Schedule** sets when it opens and closes and the solutions date, for the course or one group.',
        },
        {
          text: 'On the lab, the **More notebook actions** menu has **Upload a notebook**: main, extra material or a solution. Students see a solution only after the solutions date.',
          shot: 'lab-staff',
        },
        {
          text: 'In **Visualizations in this notebook**, choose where each shows. A trace table can have your own problem, a variant for each student, and points.',
        },
        {
          text: 'In **Exercises in this notebook**, see the exercises found by themselves and add others with a visible test.',
        },
        {
          text: '**Present** opens the notebook fullscreen, step by step, with the code you run before the class.',
        },
      ],
    },
    {
      id: 'live',
      audience: 'staff',
      title: 'Live Lab',
      summary: 'The live class: following, challenges, help requests and quick questions.',
      steps: [
        {
          text: 'On the lab, press **Start a Live Lab**. Students join from the banner or by scanning the **QR code**.',
        },
        {
          text: 'Students follow the step you present; **Work on my own** lets them work alone and **Follow the pedagog** brings them back.',
        },
        {
          text: '**Start the challenge** on an exercise: the board shows who solved it, who did not, and the most common error. Names show only with **Show names**.',
        },
        {
          text: "Whoever presses **I'm stuck** joins the queue: take it with **I'll take it** and close it with **Solved**. **A quick question for the class** shows the answers as they come.",
        },
        { text: '**End the session** when the class is over.' },
      ],
    },
    {
      id: 'grading',
      audience: 'staff',
      title: 'Handing in and grading',
      summary: 'Deadlines, submissions, grading on your computer, and grades.',
      steps: [
        { text: 'In **Submission of this notebook** (on the lab), open the notebook to each group with a deadline.' },
        {
          text: '**See the submissions** shows who handed in and each one’s code. Set the exercises’ points and, if you like, hidden tests.',
          shot: 'submissions',
        },
        {
          text: 'Press **Grade** for the group: each submission runs on your computer, and the server grades the trace tables.',
        },
        {
          text: 'Change a grade or add a comment, then **Release the grades**. **Download grades (CSV)** gives them for the records.',
        },
      ],
    },
    {
      id: 'kolokium',
      audience: 'staff',
      title: 'The timed test (kolokium)',
      summary: 'A timed, one-attempt assessment, each student on their own clock.',
      steps: [
        {
          text: 'In **Submission of this notebook**, turn on **Timed test (kolokium)** for the group: from when students may start, and how many minutes.',
        },
        {
          text: 'Each student starts it whenever they like until the deadline and has their own minutes, never past the deadline; they hand in once. While it runs, the group’s students see only this lab and AI is off.',
        },
        {
          text: 'In **See the submissions**, see who has not started, who is working and until when, and who handed in. The page refreshes by itself.',
        },
        {
          text: 'After grading, the **Assessment report** shows how many got each exercise and each table row right, and the most common mistake. Counts only.',
        },
      ],
    },
    {
      id: 'reports',
      audience: 'staff',
      title: 'Reports',
      summary: 'Activity, understanding, the pilot report and the course’s grades.',
      steps: [
        {
          text: '**Activity** (on the course): active students week by week, and for each lab the openings, downloads, runs and exercises. Counts only, never names.',
        },
        {
          text: 'Its understanding part shows how often students got the algorithms’ steps right at the first try, from five students up.',
        },
        {
          text: 'The **Pilot report** sums up a period on two printable pages, with the end-of-semester survey.',
        },
        {
          text: '**Grades (CSV)** on the course downloads the released grades of every notebook, for the institution’s records.',
        },
      ],
    },
  ],
};

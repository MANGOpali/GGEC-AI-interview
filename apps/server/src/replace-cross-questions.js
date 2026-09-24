// Replaces the cross-questions for seven majors, and all extra questions, with a new
// set supplied directly by staff. Majors not listed here (Why Not Other Countries, Why
// Not Nepal, Working Restriction) keep their existing cross-questions untouched.
//
// The AI evaluation algorithm itself is unchanged (see standards-evaluation.js /
// scoring.js): each cross/extra question still needs a `points` rubric so
// standard_coverage can be scored the same way as before. One focused point per
// question follows the existing convention for cross/extra questions in
// seed-standards-bank-followups.js.
import { configure } from './config.js';
import { createBankStore, saveBankQuestion, bankReadiness } from './standards-bank.js';

const crossByCategory = {
  Introduction: [
    {
      text: 'What are your hobbies?',
      points: [
        {
          id: 'hobbies_described',
          text: 'The student names at least one genuine hobby or interest and briefly explains it.',
          alternatives:
            'The student may describe a sport, creative activity, reading habit or other personal interest, with a brief reason it matters to them.',
        },
      ],
    },
    {
      text: 'Do you have any study gap?',
      points: [
        {
          id: 'study_gap_disclosed',
          text: 'The student honestly states whether they have a study gap and, if so, explains what they did during it.',
          alternatives:
            'The student may state there is no gap, or describe exam preparation, work, an internship or another concrete activity during a gap period.',
        },
      ],
    },
    {
      text: 'Do you have any work experience?',
      points: [
        {
          id: 'work_experience_described',
          text: 'The student states whether they have work experience and, if so, describes the role and its relevance.',
          alternatives:
            'The student may name an employer, job title, duration and key responsibilities, or clearly state they have no work experience.',
        },
      ],
    },
    {
      text: 'Have you ever had a visa refusal?',
      points: [
        {
          id: 'visa_refusal_disclosed',
          text: 'The student honestly discloses whether they have ever had a visa refusal and, if so, gives a brief, consistent explanation.',
          alternatives:
            'The student may state they have never been refused a visa, or disclose a prior refusal, the country involved and the stated reason.',
        },
      ],
    },
    {
      text: 'Do you have any relatives or friends in the UK?',
      points: [
        {
          id: 'uk_ties_disclosure',
          text: 'The student honestly discloses whether they have relatives or friends in the UK and clarifies this does not change their study intent.',
          alternatives:
            'The student may name a relative/friend and their general location, or state they have none, while reaffirming their independent plan to study and return home.',
        },
      ],
    },
  ],
  'Why This University': [
    {
      text: 'What is the course start date and end date?',
      points: [
        {
          id: 'course_dates_known',
          text: 'The student states the intended start date and end date (or duration) of the course.',
          alternatives:
            'The student may give specific months/years, or a duration such as "one year, starting September 2026 and finishing September 2027".',
        },
      ],
    },
    {
      text: 'Which modules will you study in the first semester, and can you explain one of them?',
      points: [
        {
          id: 'first_semester_modules_explained',
          text: 'The student names one or more first-semester modules and explains the content of at least one in their own words.',
          alternatives:
            'The student may name a specific module title and describe its topic, skills covered, or assessment style.',
        },
      ],
    },
    {
      text: 'Which module do you think will be the most difficult?',
      points: [
        {
          id: 'most_difficult_module_identified',
          text: 'The student identifies a specific module they expect to find most difficult and gives a reason.',
          alternatives:
            'The student may name a module involving unfamiliar mathematics, statistics, programming, or an area outside their prior background, and briefly explain why.',
        },
      ],
    },
    {
      text: 'How many teaching hours do you expect per week?',
      points: [
        {
          id: 'weekly_teaching_hours_known',
          text: 'The student gives a realistic estimate of weekly contact/teaching hours for their course.',
          alternatives:
            'The student may give an approximate number of hours (e.g., 12-15 hours) and may mention this is timetabled contact time versus independent study.',
        },
      ],
    },
    {
      text: 'How will you be assessed, and is it through exams, coursework, presentations, or projects?',
      points: [
        {
          id: 'assessment_methods_known',
          text: 'The student describes how the course is assessed, naming at least one relevant assessment method.',
          alternatives:
            'The student may mention exams, coursework, written assignments, presentations, group projects, a dissertation, or a mix of these.',
        },
      ],
    },
  ],
  'Why This Course': [
    {
      text: 'How does the course at this university differ from similar courses elsewhere?',
      points: [
        {
          id: 'course_point_of_difference',
          text: 'The student identifies a specific way this course differs from similar courses at other universities.',
          alternatives:
            'The student may point to distinct modules, specialization, teaching style, industry links, or course structure not found elsewhere.',
        },
      ],
    },
    {
      text: 'How did you research this university, and what information influenced your decision most?',
      points: [
        {
          id: 'research_process_and_influence',
          text: 'The student describes how they researched the university and names the specific information that most influenced their decision.',
          alternatives:
            'The student may mention the official website, prospectus, rankings, alumni, agents, or webinars, and identify what mattered most (e.g., modules, fees, reputation).',
        },
      ],
    },
    {
      text: 'If another university offered the same course at a lower tuition fee, would you still choose this university? Why?',
      points: [
        {
          id: 'commitment_beyond_price',
          text: 'The student gives a reasoned answer for whether they would still choose this university over a cheaper alternative, beyond price alone.',
          alternatives:
            'The student may cite reputation, specific modules, location, facilities, or career outcomes as reasons that outweigh a lower fee elsewhere.',
        },
      ],
    },
    {
      text: 'What specific facilities or learning resources at this university will support your studies?',
      points: [
        {
          id: 'facilities_supporting_study',
          text: 'The student names a specific facility or learning resource at the university that will support their studies.',
          alternatives:
            'The student may mention libraries, labs, software, studios, career services, or similar named resources relevant to their course.',
        },
      ],
    },
    {
      text: 'Which part of the course curriculum are you most looking forward to, and why?',
      points: [
        {
          id: 'curriculum_interest_and_reason',
          text: 'The student names a specific part of the curriculum they are most looking forward to and explains why.',
          alternatives:
            'The student may name a module, project, placement, or specialization option and connect it to their interests or goals.',
        },
      ],
    },
  ],
  'Financial Sponsorship': [
    {
      text: 'What is your total tuition fee?',
      points: [
        {
          id: 'total_tuition_fee_known',
          text: 'The student states an accurate or realistic total tuition fee figure for their course.',
          alternatives: 'The student may give the full-course or per-year fee figure in GBP.',
        },
      ],
    },
    {
      text: 'How much have you already paid?',
      points: [
        {
          id: 'amount_already_paid_known',
          text: 'The student states how much of the tuition fee has already been paid, such as a deposit or first instalment.',
          alternatives:
            'The student may state a deposit amount, a first-year payment, or clearly confirm nothing has been paid yet and why.',
        },
      ],
    },
    {
      text: 'What is your total expected living cost?',
      points: [
        {
          id: 'total_living_cost_known',
          text: 'The student gives a realistic estimate of their total expected living costs for the course duration.',
          alternatives:
            'The student may reference the UKVI monthly living cost figure (e.g., GBP 1,334/month for London or GBP 1,023/month outside London) multiplied by course length, or a total budget figure.',
        },
      ],
    },
    {
      text: 'Do you plan to work part-time?',
      points: [
        {
          id: 'part_time_work_plan_stated',
          text: 'The student states whether they plan to work part-time and, if so, keeps this consistent with visa work restrictions.',
          alternatives:
            'The student may say they plan limited part-time work within the legal hour limit for extra/discretionary spending, or that they do not plan to work at all.',
        },
      ],
    },
    {
      text: 'If you cannot find a part-time job in the UK, how will you support yourself?',
      points: [
        {
          id: 'contingency_without_part_time_income',
          text: 'The student confirms they can support themselves without relying on part-time income if none is found.',
          alternatives:
            'The student may explain that tuition and living costs are already fully funded by family/sponsor savings, so part-time work is not financially necessary.',
        },
      ],
    },
  ],
  Accommodation: [
    {
      text: 'Where exactly will you live?',
      points: [
        {
          id: 'accommodation_location_named',
          text: 'The student names the specific accommodation or area where they will live.',
          alternatives:
            'The student may name a hall of residence, private student accommodation provider, or a specific neighbourhood/area near the university.',
        },
      ],
    },
    {
      text: 'What website did you use to find your accommodation?',
      points: [
        {
          id: 'accommodation_search_source',
          text: 'The student names the website, platform, or source they used to search for or arrange accommodation.',
          alternatives:
            'The student may name the university accommodation portal, a student housing platform, a letting agency, or a specific website.',
        },
      ],
    },
    {
      text: 'How much is the rent?',
      points: [
        {
          id: 'rent_amount_known',
          text: 'The student states a specific weekly or monthly rent figure.',
          alternatives:
            'The student may give an approximate weekly or monthly figure in GBP and may state whether bills are included.',
        },
      ],
    },
    {
      text: 'How far is it from campus?',
      points: [
        {
          id: 'distance_from_campus_known',
          text: 'The student states the approximate distance or travel time between their accommodation and campus.',
          alternatives:
            'The student may give a walking or commute time (e.g., 15 minutes) or a distance in miles/kilometres.',
        },
      ],
    },
    {
      text: 'What public transport will you use?',
      points: [
        {
          id: 'public_transport_plan',
          text: 'The student names the public transport they expect to use to get to campus or around the city.',
          alternatives:
            'The student may mention buses, trains, the underground/metro, cycling, or walking as their main mode of transport.',
        },
      ],
    },
  ],
  'Why UK': [
    {
      text: 'What do you know about the city where you will study?',
      points: [
        {
          id: 'city_knowledge',
          text: 'The student demonstrates basic factual knowledge about the city where their university is located.',
          alternatives: "The student may mention the city's size, region, notable landmarks, or what it is known for.",
        },
      ],
    },
    {
      text: 'What place is the first you’ll visit in the UK?',
      points: [
        {
          id: 'first_place_to_visit',
          text: 'The student names a specific place they plan to visit first and gives a simple reason.',
          alternatives:
            'The student may name a landmark, city, or location near their university or elsewhere in the UK, with a brief reason for choosing it.',
        },
      ],
    },
    {
      text: 'What do you know about UK culture?',
      points: [
        {
          id: 'uk_culture_knowledge',
          text: 'The student demonstrates basic awareness of UK culture, customs, or social norms.',
          alternatives:
            'The student may mention politeness/queuing norms, punctuality, diversity, local customs, food, or other cultural observations.',
        },
      ],
    },
    {
      text: 'How will you adapt to living independently?',
      points: [
        {
          id: 'independent_living_plan',
          text: 'The student explains how they will adapt to living independently away from home.',
          alternatives:
            'The student may mention budgeting, cooking, managing time, building a support network, or prior experience living away from family.',
        },
      ],
    },
    {
      text: 'What is the living cost of the city where you will study?',
      points: [
        {
          id: 'city_living_cost_known',
          text: 'The student gives a realistic estimate of the monthly or annual living cost for their specific city.',
          alternatives:
            'The student may reference the UKVI monthly figure for London or outside-London, or a specific budget figure relevant to their city.',
        },
      ],
    },
  ],
  'Career Objectives': [
    {
      text: 'What will you do immediately after graduation?',
      points: [
        {
          id: 'immediate_post_graduation_plan',
          text: 'The student states a concrete, realistic plan for immediately after graduation.',
          alternatives:
            'The student may state they will return home and begin applying for jobs, join a specific employer, or pursue a defined next step.',
        },
      ],
    },
    {
      text: 'Which companies in your home country would you apply to?',
      points: [
        {
          id: 'target_employers_named',
          text: 'The student names at least one specific company or type of employer in their home country they would apply to.',
          alternatives:
            'The student may name specific companies, or a clearly defined sector/type of employer relevant to their field.',
        },
      ],
    },
    {
      text: 'What salary do you expect?',
      points: [
        {
          id: 'salary_expectation_realistic',
          text: 'The student states a realistic salary expectation appropriate to their target role and home job market.',
          alternatives:
            'The student may give a specific figure or range consistent with entry-level roles in their field and country.',
        },
      ],
    },
    {
      text: 'Why would an employer pay you that amount?',
      points: [
        {
          id: 'value_justification_for_salary',
          text: 'The student justifies their expected salary by connecting it to specific skills, qualifications, or value they would bring.',
          alternatives:
            'The student may reference their UK qualification, specific technical or analytical skills, or relevant experience as justification.',
        },
      ],
    },
    {
      text: 'How will your UK degree help you compete in your local job market?',
      points: [
        {
          id: 'uk_degree_competitive_advantage',
          text: 'The student explains how their UK degree gives them a competitive advantage in their local job market.',
          alternatives:
            'The student may mention international recognition, specialised skills not widely taught locally, or standing out among local graduates.',
        },
      ],
    },
  ],
};

const extras = [
  {
    category: 'Visa & Immigration',
    text: 'What if your visa is refused?',
    points: [
      {
        id: 'visa_refusal_contingency',
        text: 'The student gives a realistic response to a hypothetical visa refusal.',
        alternatives:
          'The student may mention reviewing the refusal reasons, seeking advice, reapplying after addressing issues, or accepting the outcome and reconsidering plans.',
      },
    ],
  },
  {
    category: 'Visa & Immigration',
    text: 'What if you get an opportunity to stay permanently in the UK?',
    points: [
      {
        id: 'permanent_stay_hypothetical',
        text: "The student gives a genuine, consistent answer about a hypothetical opportunity to stay in the UK permanently, without contradicting their stated return intention.",
        alternatives:
          'The student may state they would still prioritise their original career/return plans, or explain honestly how such an opportunity would be evaluated against their commitments at home.',
      },
    ],
  },
  {
    category: 'Personal',
    text: 'Talk about a movie or a book you like the most.',
    points: [
      {
        id: 'personal_interest_shared',
        text: 'The student names a specific movie or book they like and briefly explains why.',
        alternatives:
          'The student may name a title and give a short, genuine reason for liking it (theme, story, message, or personal connection).',
      },
    ],
  },
  {
    category: 'Personal Responsibility',
    text: 'What responsibilities come with being an international student in the UK?',
    points: [
      {
        id: 'international_student_responsibilities',
        text: 'The student identifies specific responsibilities that come with being an international student in the UK.',
        alternatives:
          'The student may mention visa compliance, attendance requirements, respecting work-hour limits, managing finances, or following local laws and university rules.',
      },
    ],
  },
  {
    category: 'Academic Planning',
    text: 'Which module do you think will be the most difficult for you, and why?',
    points: [
      {
        id: 'most_difficult_module_reasoned',
        text: 'The student identifies a specific module they expect to find most difficult and gives a clear, personal reason.',
        alternatives:
          'The student may connect the difficulty to an unfamiliar subject area, mathematics/statistics, or a skill they have not yet developed.',
      },
    ],
  },
  {
    category: 'Career Planning',
    text: 'What would you do if you were offered a full-time job while studying?',
    points: [
      {
        id: 'full_time_job_offer_response',
        text: 'The student gives a response consistent with UK student visa work restrictions if offered a full-time job while studying.',
        alternatives:
          'The student may state they would decline or defer it since full-time work during term-time is not permitted on a student visa, prioritising their studies.',
      },
    ],
  },
  {
    category: 'Academic Planning',
    text: 'If one module was removed from your course, which one would affect your career plan most?',
    points: [
      {
        id: 'career_critical_module_identified',
        text: 'The student identifies a specific module whose removal would most affect their career plan, with reasoning.',
        alternatives:
          'The student may name a module directly tied to their target job role or key technical skill and explain the link to their career goal.',
      },
    ],
  },
  {
    category: 'Academic Planning',
    text: 'Which module directly supports your short-term career goal?',
    points: [
      {
        id: 'module_supporting_short_term_goal',
        text: 'The student names a specific module that directly supports their stated short-term career goal.',
        alternatives:
          'The student may connect a named module\'s content or skills to a specific job role or task they expect to perform shortly after graduation.',
      },
    ],
  },
  {
    category: 'University Research',
    text: 'If I gave you 60 seconds, could you convince me that you genuinely researched this university?',
    points: [
      {
        id: 'genuine_research_convincing',
        text: 'The student gives a concise, specific, convincing summary of genuine research into the university within a short answer.',
        alternatives:
          'The student may rapidly cite specific facts: named modules, staff, facilities, rankings, or reasons that go beyond generic marketing language.',
      },
    ],
  },
  {
    category: 'Finance',
    text: 'Suppose you cannot find any job in the UK. Can you still afford your studies?',
    points: [
      {
        id: 'affordability_without_uk_income',
        text: 'The student confirms they can afford their studies even without any UK income, based on existing funding.',
        alternatives:
          'The student may explain that tuition and living costs are already fully covered by family/sponsor funds or savings, independent of finding work in the UK.',
      },
    ],
  },
];

const { repo } = await configure();
const store = createBankStore(repo);
let bank = await store.read();

const targetCategories = new Set(Object.keys(crossByCategory));
const majorByCategory = new Map(
  bank.questions.filter((q) => q.type === 'major').map((q) => [q.category, q]),
);
for (const category of targetCategories)
  if (!majorByCategory.has(category))
    throw new Error(`Major question with category "${category}" not found. Run seed-standards-bank.js first.`);

// The bank enforces readiness (7 complete majors, 3+ extras) on every update while
// enabled=true, which would reject the transient state between removing old questions
// and adding the new ones. Disable it for the edit, then restore enabled afterwards.
const wasEnabled = bank.enabled;
if (wasEnabled) {
  bank = await store.update(bank.revision, (b) => {
    b.enabled = false;
  });
  console.log('Temporarily disabled the bank for editing.');
}

// 1) Remove the old cross-questions for the targeted majors, and all old extras.
bank = await store.update(bank.revision, (b) => {
  b.questions = b.questions.filter(
    (q) => !((q.type === 'cross' && targetCategories.has(q.category)) || q.type === 'extra'),
  );
});
console.log('Removed old cross-questions for targeted majors and all old extras.');

// 2) Add the new cross-questions, linked to their major by category.
let addedCross = 0;
for (const [category, questions] of Object.entries(crossByCategory)) {
  const parent = majorByCategory.get(category);
  for (const q of questions) {
    bank = await store.update(bank.revision, (b) => {
      saveBankQuestion(b, {
        type: 'cross',
        parent_id: parent.id,
        text: q.text,
        category,
        points: q.points,
      });
    });
    addedCross++;
  }
}

// 3) Add the new extra questions.
let addedExtra = 0;
for (const q of extras) {
  bank = await store.update(bank.revision, (b) => {
    saveBankQuestion(b, { type: 'extra', text: q.text, category: q.category, points: q.points });
  });
  addedExtra++;
}

console.log(`Added ${addedCross} cross-questions across ${Object.keys(crossByCategory).length} majors.`);
console.log(`Added ${addedExtra} extra questions.`);

const readiness = bankReadiness(bank);
console.log('Bank readiness:', readiness);

if (wasEnabled) {
  if (!readiness.ready) {
    console.error('Bank is NOT ready after edits, leaving it disabled. Issues:', readiness.issues);
  } else {
    bank = await store.update(bank.revision, (b) => {
      b.enabled = true;
    });
    console.log('Re-enabled the bank.');
  }
}

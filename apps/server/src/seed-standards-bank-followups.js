// Adds cross-questions (5 per major) and extra questions to the v3 standards bank,
// drafted from algorithm/Extra Precas questions.docx plus AI-authored rubric points
// and AI-authored questions for majors the doc did not cover (Why Not Other Countries,
// Why Not Nepal, most of Working Restriction). Review/edit these in the admin UI --
// they have not been checked by a human against real interview standards.
//
// Idempotent: skips a cross/extra question if one with the same category+text already
// exists, so reruns after manual edits do not duplicate entries.
import { configure } from './config.js';
import { createBankStore, saveBankQuestion } from './standards-bank.js';

const crossByCategory = {
  Introduction: [
    {
      text: 'When exactly did you complete your most recent qualification, and what grade or result did you achieve?',
      points: [
        {
          id: 'qualification_date_and_result',
          text: 'The student states the specific completion date (month/year) and grade or result of their most recent qualification.',
          alternatives:
            'The student may give an exact month and year of graduation and a percentage, GPA, or classification (e.g., First Class, 3.6 GPA).',
        },
      ],
    },
    {
      text: 'Do you have any gap in your education or employment, and what did you do during that time?',
      points: [
        {
          id: 'gap_explanation',
          text: 'The student explains any gap in their education or employment history and what they did during it.',
          alternatives:
            'The student may describe exam preparation, an internship, family responsibilities, or skill development undertaken during the gap, or state clearly that there is no gap.',
        },
      ],
    },
    {
      text: 'Have you applied for a UK visa before, and if so, what was the outcome?',
      points: [
        {
          id: 'prior_visa_history',
          text: 'The student discloses whether they have applied for a UK visa before and states the outcome honestly.',
          alternatives:
            'The student may state this is their first application, or disclose a previous visa grant or refusal and give a brief, consistent explanation.',
        },
      ],
    },
    {
      text: 'Do you have any relatives or friends currently living in the UK?',
      points: [
        {
          id: 'uk_ties_disclosure',
          text: 'The student honestly discloses whether they have relatives or friends in the UK and, if so, clarifies this does not change their study intent.',
          alternatives:
            'The student may name a relative/friend and their location, or state they have none, while reaffirming their independent plan to study and return home.',
        },
      ],
    },
    {
      text: 'Have you travelled outside your home country before? If so, where?',
      points: [
        {
          id: 'travel_history',
          text: 'The student describes any prior international travel, including destination and purpose.',
          alternatives:
            'The student may name countries visited, purpose (tourism, family visit, study tour) and confirm compliance with those visa conditions, or state this is their first time travelling abroad.',
        },
      ],
    },
  ],
  'Why UK': [
    {
      text: 'What do you know about the city where you will be studying?',
      points: [
        {
          id: 'city_knowledge',
          text: 'The student demonstrates basic factual knowledge about the city where their university is located.',
          alternatives: "The student may mention the city's size, region, notable characteristics, or what it is known for.",
        },
      ],
    },
    {
      text: 'What is the nearest major city and international airport to your university?',
      points: [
        {
          id: 'city_airport_proximity',
          text: 'The student correctly identifies the nearest major city and/or international airport to their university.',
          alternatives:
            'The student may name a specific airport and approximate distance/travel time, or the nearest larger city if different from their study location.',
        },
      ],
    },
    {
      text: 'What do you know about UK culture, and how do you plan to adapt to it?',
      points: [
        {
          id: 'culture_awareness_and_adaptation',
          text: 'The student shows awareness of UK cultural norms and describes a concrete plan for adapting to them.',
          alternatives:
            'The student may mention punctuality, diversity, weather, food, or social customs, and describe practical adaptation steps such as research, orientation programs, or advice from others.',
        },
      ],
    },
    {
      text: 'What challenges do you expect to face while living in the UK, and how will you manage them?',
      points: [
        {
          id: 'challenge_awareness_and_coping',
          text: 'The student identifies a realistic challenge of living in the UK and describes a specific coping strategy.',
          alternatives:
            'The student may mention weather, homesickness, cost of living, or academic pressure, paired with a concrete coping plan such as budgeting, routine, or support networks.',
        },
      ],
    },
    {
      text: 'How will you manage your time between studying and daily life in the UK?',
      points: [
        {
          id: 'time_management_plan',
          text: 'The student describes a realistic plan for balancing academic work with daily responsibilities.',
          alternatives:
            'The student may mention a study schedule, prioritising coursework, limiting work/social hours, or using a planner or routine.',
        },
      ],
    },
  ],
  'Why Not Other Countries': [
    {
      text: 'Which specific universities or countries did you research before choosing the UK, and why did you rule them out?',
      points: [
        {
          id: 'alternatives_researched_and_ruled_out',
          text: 'The student names at least one specific university or country researched and gives a clear reason it was ruled out.',
          alternatives:
            'The student may name a specific institution or country and cite cost, entry requirements, course unavailability, or another concrete reason for rejecting it.',
        },
      ],
    },
    {
      text: 'How does the cost of living and tuition in the UK compare with the other countries you considered?',
      points: [
        {
          id: 'cost_comparison',
          text: 'The student gives a reasonably accurate comparison of costs between the UK and at least one alternative destination.',
          alternatives:
            'The student may compare approximate tuition or living cost figures, or explain that costs were comparable but another UK-specific factor decided it.',
        },
      ],
    },
    {
      text: 'How does the visa or post-study work process in the UK compare with the alternatives you considered?',
      points: [
        {
          id: 'visa_process_comparison',
          text: 'The student demonstrates awareness of how UK visa or post-study work routes compare with an alternative destination.',
          alternatives:
            "The student may reference the UK Graduate visa route, processing times, or work rights compared to another country's equivalent.",
        },
      ],
    },
    {
      text: 'Did anyone influence your decision to choose the UK over other countries?',
      points: [
        {
          id: 'decision_influence_disclosure',
          text: 'The student honestly discusses any influence on their decision (family, agent, friends) while affirming it remains their own informed choice.',
          alternatives:
            'The student may mention advice from family, a consultancy, or friends, while explaining they independently evaluated and agreed with the recommendation.',
        },
      ],
    },
    {
      text: 'If you were offered admission with a scholarship in another country today, would you still choose the UK? Why?',
      points: [
        {
          id: 'commitment_under_alternative_offer',
          text: 'The student gives a considered, consistent answer defending their UK choice even against a hypothetical competing offer.',
          alternatives:
            'The student may reaffirm specific UK-specific advantages (course fit, career outcomes, prior research) that would outweigh a hypothetical alternative scholarship.',
        },
      ],
    },
  ],
  'Why Not Nepal': [
    {
      text: "Why can't you pursue this exact specialization within Nepal?",
      points: [
        {
          id: 'specialization_unavailability_in_nepal',
          text: 'The student gives a specific, credible reason why their exact specialization is unavailable or inadequate in Nepal.',
          alternatives:
            'The student may state the specific program does not exist locally, or that local versions lack the depth, accreditation, or modules they need.',
        },
      ],
    },
    {
      text: 'Have you researched any Nepali universities offering a similar program? What did you find?',
      points: [
        {
          id: 'local_research_evidence',
          text: 'The student shows evidence of having actually researched local alternatives before ruling them out.',
          alternatives:
            'The student may name a specific Nepali institution or program researched and a specific limitation found (curriculum, recognition, faculty, resources).',
        },
      ],
    },
    {
      text: 'What specific skills or exposure do you expect from a UK degree that a Nepali degree would not give you?',
      points: [
        {
          id: 'skill_exposure_gap',
          text: 'The student identifies concrete skills, exposure, or resources they expect from the UK course that are not available locally.',
          alternatives:
            'The student may mention practical/industry exposure, specific software or labs, research opportunities, or international faculty/peer exposure.',
        },
      ],
    },
    {
      text: 'How will a UK qualification be viewed differently by employers in Nepal compared to a local degree?',
      points: [
        {
          id: 'employer_perception_difference',
          text: 'The student explains a credible difference in how a UK qualification would be perceived by employers compared to a local one.',
          alternatives:
            'The student may reference international recognition, competitive advantage, or specific employer preferences in their target industry.',
        },
      ],
    },
    {
      text: 'Did you consider working in Nepal first before pursuing further studies abroad?',
      points: [
        {
          id: 'alternative_path_consideration',
          text: 'The student explains whether they considered working in Nepal first and why they chose to study abroad instead or in addition.',
          alternatives:
            'The student may describe weighing immediate employment against the longer-term benefit of further study, or explain relevant work experience already gained before deciding to study abroad.',
        },
      ],
    },
  ],
  Accommodation: [
    {
      text: 'Where exactly will you live?',
      points: [
        {
          id: 'exact_address_or_area',
          text: 'The student states the specific area, building, or address type where they will live.',
          alternatives: 'The student may name the specific hall of residence, street, or neighbourhood.',
        },
      ],
    },
    {
      text: 'What website or platform did you use to search for accommodation?',
      points: [
        {
          id: 'search_platform_disclosure',
          text: 'The student names the platform or method used to search for accommodation.',
          alternatives:
            'The student may name a specific website, the university housing portal, an agent, or a referral from a friend/relative.',
        },
      ],
    },
    {
      text: 'How much is the rent?',
      points: [
        {
          id: 'rent_amount',
          text: 'The student states a specific, realistic rent figure for their accommodation.',
          alternatives: 'The student may state a weekly or monthly rent figure and specify the currency.',
        },
      ],
    },
    {
      text: 'How far is it from campus?',
      points: [
        {
          id: 'distance_from_campus',
          text: 'The student states a specific distance or commute time from their accommodation to campus.',
          alternatives: 'The student may state a distance in miles/km or a commute time in minutes.',
        },
      ],
    },
    {
      text: 'What public transport will you use to get to campus?',
      points: [
        {
          id: 'transport_method',
          text: 'The student identifies the specific mode of transport they will use to reach campus.',
          alternatives: 'The student may mention walking, bus, train, tram, or cycling, ideally with a route or line name.',
        },
      ],
    },
  ],
  'Why This University': [
    {
      text: 'How did you research this university, and what information influenced your decision most?',
      points: [
        {
          id: 'research_process_and_key_influence',
          text: 'The student describes a specific research process and identifies the single piece of information that most influenced their decision.',
          alternatives:
            'The student may mention university websites, rankings, open days, alumni contacts, or agent advice, paired with the specific factor that tipped their decision.',
        },
      ],
    },
    {
      text: 'How does the course at this university differ from similar courses elsewhere?',
      points: [
        {
          id: 'course_differentiation',
          text: "The student identifies a specific way this university's course differs from similar courses at other institutions.",
          alternatives: 'The student may cite unique modules, teaching approach, industry links, or specialisation not found elsewhere.',
        },
      ],
    },
    {
      text: 'If another university offered the same course at a lower tuition fee, would you still choose this university? Why?',
      points: [
        {
          id: 'commitment_beyond_cost',
          text: 'The student gives a considered answer defending their choice of university beyond price alone.',
          alternatives:
            'The student may cite reputation, course quality, location, or career outcomes that justify the choice regardless of a hypothetical cheaper alternative.',
        },
      ],
    },
    {
      text: 'What specific facilities or learning resources at this university will support your studies?',
      points: [
        {
          id: 'facilities_supporting_study',
          text: 'The student names specific facilities or resources at the university relevant to their course.',
          alternatives: 'The student may mention labs, libraries, software, studios, or study spaces specific to their subject.',
        },
      ],
    },
    {
      text: 'Have you been in contact with current students, alumni, or staff from this university? What did you learn?',
      points: [
        {
          id: 'direct_contact_evidence',
          text: 'The student describes any direct contact with the university community and what they learned from it, or honestly states they have not yet had such contact.',
          alternatives:
            'The student may describe a conversation with an alumnus, current student, or staff member and a specific insight gained, or explain other research methods used instead.',
        },
      ],
    },
  ],
  'Why This Course': [
    {
      text: 'What is the course start date and end date?',
      points: [
        {
          id: 'course_dates',
          text: 'The student states the correct or a specific, plausible start and end date for their course.',
          alternatives: 'The student may give the month/year of both start and completion.',
        },
      ],
    },
    {
      text: 'Which modules will you study in the first semester, and can you explain one of them?',
      points: [
        {
          id: 'first_semester_modules',
          text: 'The student names specific first-semester modules and explains the content of at least one in reasonable detail.',
          alternatives: 'The student may name 1-2 module titles and describe their core topic, learning outcome, or assessment.',
        },
      ],
    },
    {
      text: 'Which module do you think will be the most challenging for you, and why?',
      points: [
        {
          id: 'challenging_module_identified',
          text: 'The student identifies a specific module they expect to find challenging and explains why.',
          alternatives: "The student may cite unfamiliarity with the subject, a skills gap, or the module's complexity as the reason.",
        },
      ],
    },
    {
      text: 'How many teaching hours do you expect per week?',
      points: [
        {
          id: 'teaching_hours_awareness',
          text: 'The student states a specific, plausible number of weekly teaching hours for their course.',
          alternatives: 'The student may give a range or specific number of contact hours per week.',
        },
      ],
    },
    {
      text: 'How will you be assessed on this course?',
      points: [
        {
          id: 'assessment_method_awareness',
          text: 'The student correctly identifies the assessment methods used on their course.',
          alternatives: 'The student may mention exams, coursework, presentations, projects, or a combination thereof.',
        },
      ],
    },
  ],
  'Working Restriction': [
    {
      text: 'Do you plan to work part-time while studying?',
      points: [
        {
          id: 'part_time_work_intent',
          text: 'The student clearly states whether they intend to work part-time and, if so, in what kind of role.',
          alternatives:
            'The student may state they plan to seek part-time work (e.g., retail, hospitality, campus job) or that they do not plan to work at all.',
        },
      ],
    },
    {
      text: 'If you cannot find a part-time job in the UK, how will you support yourself?',
      points: [
        {
          id: 'contingency_without_part_time_income',
          text: 'The student explains how they would cover expenses if unable to secure part-time work.',
          alternatives: 'The student may state that their tuition and living costs are already fully funded independent of any part-time earnings.',
        },
      ],
    },
    {
      text: 'How will you make sure part-time work does not affect your attendance or academic performance?',
      points: [
        {
          id: 'work_study_balance_safeguard',
          text: 'The student describes a concrete plan to prevent part-time work from interfering with studies.',
          alternatives:
            'The student may mention limiting hours, scheduling work around classes, or prioritising attendance and deadlines over shifts.',
        },
      ],
    },
    {
      text: "Are you aware of the consequences of breaching your visa's work condition limits?",
      points: [
        {
          id: 'breach_consequence_awareness',
          text: 'The student demonstrates awareness that exceeding permitted work hours is a visa violation with serious consequences.',
          alternatives:
            'The student may mention visa curtailment, refusal of future applications, or other immigration consequences of working beyond the permitted hours.',
        },
      ],
    },
    {
      text: 'What would you do if you were offered a job requiring more than 20 hours per week during term-time?',
      points: [
        {
          id: 'over_limit_offer_response',
          text: 'The student states clearly that they would decline or renegotiate a role exceeding the legal weekly work limit during term-time.',
          alternatives:
            'The student may state they would decline the offer, negotiate reduced hours, or wait until a vacation period to accept full-time hours.',
        },
      ],
    },
  ],
  'Financial Sponsorship': [
    {
      text: 'Who is going to sponsor you, and how are they funding your studies?',
      points: [
        {
          id: 'sponsor_identity_and_funding_method',
          text: 'The student names their specific sponsor and explains the method by which funds are being provided.',
          alternatives: 'The student may name a parent, relative, or organisation and describe savings, loan, income, or scholarship as the funding method.',
        },
      ],
    },
    {
      text: 'What is your total tuition fee for the course?',
      points: [
        {
          id: 'total_tuition_fee_stated',
          text: 'The student states a specific, accurate or plausible total tuition fee figure for their course.',
          alternatives: 'The student may give a total annual or full-course tuition figure with currency.',
        },
      ],
    },
    {
      text: 'How much of the tuition fee have you already paid?',
      points: [
        {
          id: 'tuition_payment_status',
          text: 'The student states the amount or proportion of tuition already paid, such as a deposit or first instalment.',
          alternatives: 'The student may state a specific deposit amount, percentage paid, or that no payment has been made yet with a reason.',
        },
      ],
    },
    {
      text: 'What is your total expected living cost for the duration of your course?',
      points: [
        {
          id: 'total_living_cost_estimate',
          text: 'The student gives a specific, realistic estimate of their total living costs for the course duration.',
          alternatives: 'The student may state a monthly living allowance figure multiplied by course length, referencing UKVI guidance where relevant.',
        },
      ],
    },
    {
      text: 'What would happen to your studies if your sponsor faced a sudden financial setback?',
      points: [
        {
          id: 'sponsor_risk_contingency',
          text: "The student describes a credible contingency or safeguard in case their sponsor faces a financial setback.",
          alternatives:
            "The student may mention a secondary sponsor, savings buffer, insurance, or a support letter confirming the sponsor's ongoing capacity.",
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
          text: 'The student states a specific, realistic plan for the period immediately following graduation.',
          alternatives: 'The student may mention applying for jobs, returning home to start work, or a specific transition step such as further certification.',
        },
      ],
    },
    {
      text: 'Which companies in your home country would you consider applying to?',
      points: [
        {
          id: 'target_employers_named',
          text: 'The student names at least one specific, realistic employer or type of organisation in their home country relevant to their field.',
          alternatives:
            'The student may name a specific company or a credible category of employer (e.g., a named bank, consultancy, or manufacturing firm) in their target sector.',
        },
      ],
    },
    {
      text: 'What salary do you expect in your first job after graduating?',
      points: [
        {
          id: 'realistic_salary_expectation',
          text: 'The student states a salary expectation that is realistic for an entry-level role in their target industry and home market.',
          alternatives: 'The student may give a specific figure or range consistent with typical entry-level pay in their sector and country.',
        },
      ],
    },
    {
      text: 'Why would an employer pay you that amount?',
      points: [
        {
          id: 'salary_justification',
          text: 'The student justifies their expected salary by connecting it to the specific skills or qualification gained from the UK course.',
          alternatives: 'The student may reference the value of the UK degree, specific technical skills, or demonstrated experience as justification.',
        },
      ],
    },
    {
      text: 'How will your UK degree help you compete in your local job market?',
      points: [
        {
          id: 'competitive_advantage_in_home_market',
          text: 'The student explains a specific competitive advantage their UK degree provides in their home job market.',
          alternatives: 'The student may mention scarcity of similarly qualified local candidates, international recognition, or specific in-demand skills gained.',
        },
      ],
    },
  ],
};

const extras = [
  {
    category: 'Application Process',
    text: 'Did you use an education consultancy, and if so, what role did they play in your application?',
    points: [
      {
        id: 'consultancy_role_disclosed',
        text: 'The student honestly discloses whether a consultancy was used and describes its specific role.',
        alternatives:
          'The student may describe the consultancy helping with university shortlisting, document preparation, or interview scheduling, or state they applied independently.',
      },
      {
        id: 'independent_understanding_of_application',
        text: 'The student demonstrates personal understanding of their own application beyond what a consultancy might have handled.',
        alternatives:
          'The student may explain in their own words why they chose their course/university and describe personally reviewing or approving key documents.',
      },
    ],
  },
  {
    category: 'Application Process',
    text: 'Did you write your own Statement of Purpose (SOP), and can you explain its main points?',
    points: [
      {
        id: 'sop_ownership',
        text: 'The student confirms their level of involvement in writing the SOP.',
        alternatives: 'The student may state they wrote it themselves, drafted it with guidance, or had substantial input reviewed and edited by themselves.',
      },
      {
        id: 'sop_content_recall',
        text: 'The student can accurately summarise the main points made in their own SOP.',
        alternatives: 'The student may recall their stated motivation, career goals, or key achievements mentioned in the SOP.',
      },
    ],
  },
  {
    category: 'Application Process',
    text: 'Are you familiar with the documents submitted in your visa application, and what do they include?',
    points: [
      {
        id: 'documents_awareness',
        text: 'The student can name the key documents submitted as part of their visa application.',
        alternatives:
          'The student may mention the CAS, financial evidence, passport, academic transcripts, English test results, or TB test certificate as applicable.',
      },
      {
        id: 'document_accuracy_confirmation',
        text: 'The student confirms the documents submitted are accurate and consistent with their spoken answers.',
        alternatives:
          'The student may confirm figures or details in the documents (e.g., funds, course details) match what they have stated in the interview.',
      },
    ],
  },
  {
    category: 'Application Process',
    text: 'Have you read and understood your offer letter and CAS (Confirmation of Acceptance for Studies)?',
    points: [
      {
        id: 'offer_letter_understanding',
        text: 'The student demonstrates they have read and understood key details in their offer letter.',
        alternatives: 'The student may state the course name, start date, or conditions of offer as stated in the letter.',
      },
      {
        id: 'cas_understanding',
        text: 'The student demonstrates understanding of what the CAS is and the key details it contains.',
        alternatives: 'The student may mention the CAS number, course details, or tuition fee information shown on the CAS.',
      },
    ],
  },
  {
    category: 'Credibility & Compliance',
    text: 'What would you do if your student visa application was refused?',
    points: [
      {
        id: 'refusal_response_plan',
        text: 'The student gives a realistic, non-desperate response to a hypothetical visa refusal.',
        alternatives:
          'The student may mention reviewing the refusal reason, reapplying with corrected information, seeking advice, or reconsidering their plan for that intake.',
      },
      {
        id: 'genuine_intent_reaffirmed',
        text: "The student's answer reaffirms genuine study intent rather than suggesting they would attempt to enter or remain unlawfully.",
        alternatives: 'The student may explicitly state they would follow proper legal channels and not attempt to circumvent a refusal.',
      },
    ],
  },
  {
    category: 'Credibility & Compliance',
    text: 'What is your plan if you fail a module or need to resit an exam?',
    points: [
      {
        id: 'academic_failure_contingency',
        text: 'The student describes a realistic plan for dealing with academic failure or a resit.',
        alternatives:
          'The student may mention seeking academic support, resit procedures, or extra study time, and completing the resit within permitted timeframes.',
      },
      {
        id: 'commitment_to_completion',
        text: 'The student affirms commitment to completing the course despite a setback.',
        alternatives: 'The student may state they would not give up or leave the course, and would use available university support services.',
      },
    ],
  },
  {
    category: 'Credibility & Compliance',
    text: 'What would you do if your sponsor was suddenly unable to send funds?',
    points: [
      {
        id: 'funding_disruption_contingency',
        text: 'The student describes a credible contingency plan if their sponsor could not provide funds as expected.',
        alternatives:
          'The student may mention a backup sponsor, savings, part-time work within legal limits, or contacting the university for a payment plan.',
      },
      {
        id: 'no_unlawful_intent_implied',
        text: "The student's answer does not suggest resorting to unauthorised work or unlawful means to cover the shortfall.",
        alternatives: 'The student may explicitly state they would seek legitimate support (family, university, authorised work) rather than breach visa conditions.',
      },
    ],
  },
  {
    category: 'Credibility & Compliance',
    text: 'If you were offered an opportunity to stay in the UK permanently after your studies, would you take it? Why or why not?',
    points: [
      {
        id: 'honest_and_consistent_answer',
        text: "The student gives an honest, consistent answer that does not contradict their stated intention to return home.",
        alternatives:
          'The student may explain they intend to return home per their stated plan, or give a measured answer about the Graduate visa route without implying an intent to settle permanently against visa conditions.',
      },
      {
        id: 'ties_to_home_country_reaffirmed',
        text: 'The student reaffirms specific ties or reasons pulling them back to their home country.',
        alternatives: 'The student may mention family, career opportunities, property, or social ties in their home country.',
      },
    ],
  },
  {
    category: 'Credibility & Compliance',
    text: 'Why should we believe you are a genuine student, and what proves your main purpose is education?',
    points: [
      {
        id: 'genuine_student_evidence',
        text: 'The student provides specific, concrete evidence supporting genuine study intent.',
        alternatives:
          'The student may reference consistent course/career alignment, prior academic performance, financial preparation, or a clear post-study plan.',
      },
      {
        id: 'confident_non_evasive_response',
        text: 'The student answers directly and confidently without evasive or contradictory statements.',
        alternatives:
          'The student may answer without excessive hesitation, contradiction, or deflection, directly addressing the credibility concern raised.',
      },
    ],
  },
  {
    category: 'Credibility & Compliance',
    text: 'What would you do if your university increased tuition fees during your course?',
    points: [
      {
        id: 'fee_increase_contingency',
        text: 'The student describes a realistic plan for coping with a tuition fee increase during their studies.',
        alternatives:
          'The student may mention contacting the sponsor for additional funds, checking fixed-fee guarantees in their offer, or drawing on a financial buffer.',
      },
      {
        id: 'awareness_of_fee_terms',
        text: 'The student shows awareness of whether their fees are fixed for the duration of the course or subject to annual increases.',
        alternatives: "The student may reference their offer letter or university policy on fee guarantees for continuing students.",
      },
    ],
  },
];

const { repo } = await configure();
const store = createBankStore(repo);
let bank = await store.read();
let crossAdded = 0,
  extrasAdded = 0;

for (const [category, questions] of Object.entries(crossByCategory)) {
  const parent = bank.questions.find((q) => q.type === 'major' && q.category === category);
  if (!parent) {
    console.log(`Skipping "${category}": no matching major question found.`);
    continue;
  }
  for (const q of questions) {
    const exists = bank.questions.some(
      (x) => x.type === 'cross' && x.parent_id === parent.id && x.text === q.text,
    );
    if (exists) continue;
    bank = await store.update(bank.revision, (b) => {
      saveBankQuestion(b, {
        type: 'cross',
        parent_id: parent.id,
        text: q.text,
        category,
        points: q.points,
      });
    });
    crossAdded++;
  }
}

for (const q of extras) {
  const exists = bank.questions.some((x) => x.type === 'extra' && x.text === q.text);
  if (exists) continue;
  bank = await store.update(bank.revision, (b) => {
    saveBankQuestion(b, {
      type: 'extra',
      text: q.text,
      category: q.category,
      points: q.points,
    });
  });
  extrasAdded++;
}

console.log(`Cross-questions added: ${crossAdded}. Extra questions added: ${extrasAdded}.`);

// Seeds the 10 "major" questions and point rubrics from algorithm/StandardsBank.pdf
// into the v3 standards question bank. Existing questions (matched by category) are
// left untouched so staff edits are preserved on rerun, matching seed.js's behavior.
//
// Each question is inserted as type: 'major' only. The bank also requires, per major,
// exactly 5 active 'cross' follow-up questions and at least 3 'extra' questions before
// it can be marked ready/enabled (see bankReadiness in standards-bank.js) -- none of
// that is in the source PDF, so this script does not create cross/extra questions or
// enable the bank. Complete those through the admin UI, then enable when ready.
import { configure } from './config.js';
import { createBankStore, saveBankQuestion } from './standards-bank.js';

const majors = [
  {
    category: 'Introduction',
    introduction: true,
    text: 'Please introduce yourself, detailing your academic background, current activity, and intended program of study in the UK.',
    points: [
      {
        id: 'personal_and_academic_background',
        text: 'The student introduces themselves and provides clear details regarding their most recent completed academic qualification.',
        alternatives:
          'The student may state their name, home city or country, highest degree or high school qualification earned, major/field of study, graduating institution, and year of completion or GPA.',
      },
      {
        id: 'intended_uk_program_and_institution',
        text: 'The student explicitly identifies the course of study they intend to pursue and the UK university they plan to attend.',
        alternatives:
          'The student may state the exact title of their degree program (e.g., MSc in Data Science) and name the specific UK university where they have been accepted or enrolled.',
      },
      {
        id: 'current_status_or_work_experience',
        text: 'The student outlines their current employment, professional background, or post-study activities following their last qualification.',
        alternatives:
          'The student may describe their current job role, employer, key responsibilities, or explain their recent activities if there is an academic gap (e.g., preparing for tests, internship, skill development).',
      },
      {
        id: 'motivation_and_transition_logic',
        text: 'The student provides a concise reason for why they are making this transition to higher studies in the UK at this point in time.',
        alternatives:
          'The student may connect their past background to their UK study plan, explaining why advancing their education now is the logical next step for their personal or professional growth.',
      },
      {
        id: 'key_achievements_or_strengths',
        text: 'The student mentions notable academic performance, certifications, or professional milestones that demonstrate their readiness for the program.',
        alternatives:
          'The student may highlight strong academic grades, relevant awards, specialized certifications, key projects, or professional milestones that support their candidacy.',
      },
    ],
  },
  {
    category: 'Why UK',
    text: 'Why do you want to study in the UK?',
    points: [
      {
        id: 'why_uk_reason',
        text: "The student gives at least one substantive reason for choosing the UK as a study destination.",
        alternatives:
          "The reason may relate to the UK's education system, practical learning, course structure, qualification recognition, academic environment, industry exposure, career opportunities, or another legitimate UK-specific factor.",
      },
      {
        id: 'why_uk_personal_fit',
        text: 'The student explains how choosing the UK is relevant to their own academic needs, career objectives, or future plans.',
        alternatives:
          'The student may connect the UK to their desired career, required skills, academic development, previous education, professional experience, or another clearly explained personal objective.',
      },
      {
        id: 'uk_industry_practical',
        text: 'The student identifies practical, industry-focused, career-oriented, or employment-related learning as a benefit of studying in the UK.',
        alternatives:
          'Practical education, industry exposure, real-world projects, employability-focused learning, professional skills, or similar concepts.',
      },
      {
        id: 'uk_qualification',
        text: 'The student identifies the recognition, reputation, or international value of a UK qualification as a reason for choosing the UK.',
        alternatives:
          'Globally recognised qualification, international recognition, respected degree, qualification value, or equivalent reasoning.',
      },
      {
        id: 'uk_course_structure',
        text: 'The student identifies a relevant advantage of the UK course structure, duration, modules, teaching approach, or academic delivery.',
        alternatives:
          'Shorter course duration, relevant modules, specialised curriculum, teaching methods, course structure, academic delivery, or another clearly explained course-related advantage.',
      },
      {
        id: 'uk_environment',
        text: "The student identifies a relevant benefit of the UK's academic, international, or multicultural study environment.",
        alternatives:
          'International student environment, multicultural exposure, interaction with students from different backgrounds, academic environment, cultural exposure, or equivalent reasoning.',
      },
    ],
  },
  {
    category: 'Why Not Other Countries',
    text: 'Why did you choose the UK instead of other countries?',
    points: [
      {
        id: 'other_countries_considered',
        text: 'The student demonstrates that they considered at least one alternative study destination before choosing the UK.',
        alternatives:
          'The student may name a specific country they considered, compare multiple destinations, or clearly describe an alternative destination considered during their decision-making process.',
      },
      {
        id: 'uk_comparison_fit',
        text: 'The student explains why the UK is a better fit for their academic, career, personal, or practical requirements than the alternative destination or destinations considered.',
        alternatives:
          'The comparison may involve course structure, academic quality, practical learning, career opportunities, qualification recognition, duration, cost, location, entry requirements, or another relevant factor connected to the student\'s circumstances.',
      },
      {
        id: 'alternative_specific_difference',
        text: 'The student identifies a specific difference between the UK and at least one alternative destination that influenced their decision.',
        alternatives:
          'The difference may relate to course content, teaching approach, duration, tuition or living costs, career opportunities, industry exposure, academic environment, qualification recognition, or another relevant comparison.',
      },
      {
        id: 'multiple_destination_comparison',
        text: 'The student provides meaningful comparison with more than one alternative destination.',
        alternatives:
          'The student may compare the UK with two or more countries such as Australia, Canada, the USA, or another destination they genuinely considered. Multiple comparisons are not required for full overall answer quality.',
      },
      {
        id: 'uk_specific_advantage',
        text: 'The student identifies a specific advantage of the UK that addresses a limitation or disadvantage they identified in an alternative destination.',
        alternatives:
          'The advantage may concern the student\'s course, career plans, academic preferences, practical learning needs, duration, costs, location, industry opportunities, or another clearly established decision factor.',
      },
    ],
  },
  {
    category: 'Why Not Nepal',
    text: 'Why did you choose to study in the UK instead of Nepal?',
    points: [
      {
        id: 'course_availability_and_curriculum',
        text: 'The student explains specific limitations regarding course availability, specialization options, or curriculum structure in Nepal compared to the UK.',
        alternatives:
          'The student may state that their specific degree or specialization is not offered in Nepal, or that local programs are overly theoretical, outdated, or lack relevant modules.',
      },
      {
        id: 'learning_methodology_contrast',
        text: 'The student contrasts the educational methodology in Nepal with the UK, highlighting practical, research-based, or skill-focused learning over traditional theoretical approaches.',
        alternatives:
          'The student may explain that education in Nepal relies heavily on rote memorization and exam-based evaluation, whereas UK institutions emphasize hands-on projects, research methodology, critical thinking, and industry engagement.',
      },
      {
        id: 'infrastructure_and_resources',
        text: 'The student identifies specific differences in educational infrastructure, technology, or learning resources between Nepali institutions and UK universities.',
        alternatives:
          'The student may reference differences in advanced laboratory facilities, digital library access, specialized software, or modern research infrastructure available at UK universities.',
      },
      {
        id: 'global_exposure_and_recognition',
        text: 'The student explains how studying in the UK provides global degree recognition, multicultural exposure, or international perspectives that local education cannot offer.',
        alternatives:
          'The student may discuss the value of an internationally accredited degree, learning alongside a diverse global student body, or gaining a broader perspective impossible to achieve domestically.',
      },
      {
        id: 'career_impact_in_home_market',
        text: 'The student connects their decision not to study in Nepal to long-term career advancement and gaining a competitive edge in the local or global job market.',
        alternatives:
          'The student may describe how a UK qualification sets them apart from local graduates in Nepal, enabling access to higher-level professional roles or faster career growth upon return.',
      },
    ],
  },
  {
    category: 'Accommodation',
    text: 'Where will you stay during your studies in the UK, and how have you arranged your accommodation?',
    points: [
      {
        id: 'accommodation_type_and_location',
        text: 'The student explicitly identifies their intended accommodation type and general location in the UK.',
        alternatives:
          'The student may mention university-managed halls of residence, private student accommodation, private rented housing, or staying with family/relatives, clearly naming the city or neighborhood.',
      },
      {
        id: 'campus_proximity_and_commute',
        text: 'The student demonstrates clear awareness of how far their accommodation is from the university campus and how they will commute.',
        alternatives:
          'The student may state the distance or commute time (e.g., a 15-minute walk or 20 minutes by bus) and describe their mode of transport to classes.',
      },
      {
        id: 'cost_and_budgetary_awareness',
        text: 'The student provides specific financial details regarding their accommodation costs and what is included.',
        alternatives:
          'The student may state weekly or monthly rent figures, specify whether bills/utilities are included, or explain how this fits into their living cost budget.',
      },
      {
        id: 'booking_status_or_process',
        text: 'The student explains their current booking status or the concrete steps taken to secure their accommodation.',
        alternatives:
          'The student may state that they have signed a tenancy agreement, paid a deposit, received a booking confirmation, or shortlisted specific properties while waiting for their visa.',
      },
      {
        id: 'decision_rationale_and_suitability',
        text: 'The student gives clear reasons for choosing this accommodation type over other options.',
        alternatives:
          'The student may cite factors such as 24/7 security, included utilities, quiet study environments, proximity to supermarkets, or ease of settling in as a new international student.',
      },
    ],
  },
  {
    category: 'Why This University',
    text: 'Why did you choose this specific university in the UK?',
    points: [
      {
        id: 'university_academic_fit',
        text: 'The student explains specific academic or course-related factors that led them to choose this particular university.',
        alternatives:
          'The student may mention specific modules, research strengths, teaching approaches, course structure, or unique practical projects offered by this university.',
      },
      {
        id: 'university_comparison_and_selection',
        text: 'The student demonstrates active decision-making by explaining why they chose this university over other UK institutions they considered.',
        alternatives:
          'The student may name other UK universities they researched (e.g., comparing tuition fees, entry criteria, location, or module relevance) to justify why this institution was the best fit.',
      },
      {
        id: 'reputation_and_rankings',
        text: "The student references the university's reputation, subject-specific rankings, TEF rating, or relevant professional accreditations.",
        alternatives:
          'The student may cite specific ranking tables, industry accreditations (e.g., AACSB, CMI, BCS), or overall institutional reputation in their field of study.',
      },
      {
        id: 'facilities_and_learning_resources',
        text: 'The student identifies specific campus facilities, laboratories, libraries, or learning technologies that support their study plan.',
        alternatives:
          'The student may highlight specialized labs, 24/7 library access, simulation suites, industry-standard software, or modern study spaces.',
      },
      {
        id: 'industry_links_and_employability_support',
        text: "The student highlights the university's industry connections, career services, or employability initiatives.",
        alternatives:
          'The student may mention corporate partnerships, guest speakers, placement support, career workshops, or graduate outcome statistics.',
      },
    ],
  },
  {
    category: 'Why This Course',
    text: 'Why did you choose this specific course of study?',
    points: [
      {
        id: 'academic_or_professional_progression',
        text: 'The student explains how this course logically builds upon their previous academic qualification or professional work experience.',
        alternatives:
          'The student may describe how their high school or undergraduate studies laid the foundation for this course, or how their work experience revealed knowledge gaps that this degree addresses.',
      },
      {
        id: 'career_goal_alignment',
        text: 'The student clearly connects the course to their future career aspirations and target job roles upon graduation.',
        alternatives:
          'The student may mention specific target designations (e.g., Data Analyst, Project Manager), industry sectors, or career paths where this qualification is required or highly advantageous.',
      },
      {
        id: 'specific_modules_and_curriculum',
        text: 'The student identifies specific modules, subjects, or core topics within the course curriculum that align with their interests.',
        alternatives:
          'The student may name 2-3 key modules (e.g., Applied Machine Learning, Corporate Finance), specializations, or project components that sparked their interest.',
      },
      {
        id: 'skills_and_learning_outcomes',
        text: 'The student highlights concrete practical skills, analytical capabilities, or technical knowledge they expect to gain from the course.',
        alternatives:
          'The student may mention acquiring expertise in specific software tools, methodologies, strategic decision-making framework, research methods, or leadership competencies.',
      },
      {
        id: 'course_specialization_uniqueness',
        text: 'The student explains why they chose this specific degree title or specialization over related general fields.',
        alternatives:
          'The student may contrast this specialized master\'s or bachelor\'s degree against broader degrees (e.g., choosing Business Analytics instead of a general MBA) to show deliberate decision-making.',
      },
    ],
  },
  {
    category: 'Working Restriction',
    text: 'Are you aware of the work restrictions on a UK student visa, and what are your plans regarding part-time work?',
    points: [
      {
        id: 'term_time_hour_limit',
        text: 'The student explicitly states the maximum weekly hour limit permitted for work during term-time under UK student visa rules.',
        alternatives:
          'The student may state they are allowed to work a maximum of 20 hours per week during term-time (or 10 hours if studying below degree level).',
      },
      {
        id: 'primary_focus_on_studies',
        text: 'The student confirms that academic study is their primary priority in the UK and that any part-time work will remain strictly secondary.',
        alternatives:
          'The student may explain that studies come first, part-time work will not interfere with class attendance or assignments, or that work is purely optional.',
      },
      {
        id: 'vacation_time_allowance',
        text: 'The student demonstrates awareness that full-time work is permitted only during official university vacation periods.',
        alternatives:
          'The student may state that they can work full-time (40 hours per week) during official term breaks, winter/summer holidays, or after the course end date.',
      },
      {
        id: 'prohibited_work_activities',
        text: 'The student identifies specific employment types or activities that are strictly prohibited under a UK student visa.',
        alternatives:
          'The student may mention that they cannot be self-employed, start a business, work as a professional sportsperson or coach, act as an entertainer, or fill a permanent full-time job.',
      },
      {
        id: 'financial_non_dependence',
        text: 'The student clarifies that they do not rely on part-time earnings to cover their tuition fees or basic living expenses.',
        alternatives:
          'The student may state that their tuition and living expenses are already fully funded by personal/family savings or sponsors, and part-time earnings are only for discretionary pocket money or local experience.',
      },
    ],
  },
  {
    category: 'Financial Sponsorship',
    text: 'How will you fund your tuition fees and living expenses during your studies in the UK?',
    points: [
      {
        id: 'funding_sources_identification',
        text: 'The student clearly identifies their primary source(s) of funding for both tuition fees and living expenses.',
        alternatives:
          'The student may state that they are funded by parents, personal savings, an education loan from a recognized bank, a university scholarship, or an official corporate/government sponsorship.',
      },
      {
        id: 'cost_awareness_and_breakdown',
        text: 'The student demonstrates accurate knowledge of the total financial commitment, including specific or realistic estimates for tuition fees and living costs.',
        alternatives:
          'The student may state the exact annual tuition fee and the UKVI required living allowance (e.g., GBP 1,334/month for London or GBP 1,023/month outside London), or give a total combined budget figure.',
      },
      {
        id: 'sponsor_occupation_and_capacity',
        text: 'The student explains the financial background, occupation, or business of their sponsor to demonstrate how the funds were generated.',
        alternatives:
          "The student may describe their sponsor's profession, annual income, business operations, property/rental income, or accumulated savings that support the financial commitment.",
      },
      {
        id: 'proof_of_funds_and_documentation',
        text: 'The student references appropriate financial documentation and compliance with visa maintenance requirements.',
        alternatives:
          'The student may mention holding funds in a liquid bank account for at least 28 consecutive days, official loan sanction letters, sponsorship letters, or official bank statements.',
      },
      {
        id: 'sponsor_relationship_and_commitment',
        text: "The student explains their relationship to the sponsor and confirms the sponsor's commitment to covering all educational and living expenses.",
        alternatives:
          'The student may state that their parents or legal guardians are supporting them out of family investment in their future, or reference an official affidavit of support.',
      },
    ],
  },
  {
    category: 'Career Objectives',
    text: 'What are your short-term and long-term career plans after graduating, and how will this course help you achieve them?',
    points: [
      {
        id: 'short_term_career_goals',
        text: 'The student clearly articulates specific short-term career goals immediately following graduation.',
        alternatives:
          'The student may state target job designations (e.g., Junior Data Analyst, Assistant Project Manager), specific target sectors, or prospective employers in their home country, all of which should be relevant to their chosen course.',
      },
      {
        id: 'long_term_career_vision',
        text: 'The student outlines a realistic long-term career trajectory or vision for their professional advancement over the next 5 to 10 years.',
        alternatives:
          'The student may describe progressing into senior management, specialized consultancy roles, executive leadership, or establishing their own business venture.',
      },
      {
        id: 'course_relevance_to_career',
        text: 'The student explicitly connects how the specific skills, qualifications, or knowledge gained from this UK course directly enable them to perform their target job role.',
        alternatives:
          'The student may explain how particular modules, analytical tools, or practical frameworks taught in the course fulfill precise requirements in their target industry.',
      },
      {
        id: 'return_intention_and_home_market_fit',
        text: 'The student demonstrates a clear intention to return to their home country to pursue these career opportunities.',
        alternatives:
          'The student may discuss growing industry trends, skilled manpower demand, or economic development in their home market that make returning advantageous.',
      },
      {
        id: 'industry_awareness_and_earning_potential',
        text: 'The student exhibits realistic expectations regarding target industry standards, job market demand, or career progression in their home country.',
        alternatives:
          'The student may mention realistic starting salary expectations, high-growth sectors, or specific companies actively recruiting for their profile.',
      },
    ],
  },
];

const { repo } = await configure();
const store = createBankStore(repo);
let bank = await store.read();
let added = 0;
for (const m of majors) {
  if (bank.questions.some((q) => q.type === 'major' && q.category === m.category)) continue;
  bank = await store.update(bank.revision, (b) => {
    saveBankQuestion(b, {
      type: 'major',
      introduction: !!m.introduction,
      text: m.text,
      category: m.category,
      points: m.points,
    });
  });
  added++;
}
console.log(
  `Standards bank seeded: ${added} major question(s) added, ${majors.length - added} already present.`,
);
console.log(
  'Each major still needs 5 active cross-questions and the bank needs 3+ extra questions before it can be enabled (complete these in the admin UI).',
);

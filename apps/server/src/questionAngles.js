import { randomInt } from 'node:crypto';
import { seedQuestions } from './questionBank.js';
// Curated prompts, not model-generated facts. Each angle carries its own scoring focus.
const groups = [
  [
    [
      'What made the UK the right study destination for you?|Personal academic reasons; connection to the chosen course',
      'Which features of UK education matter most to your study goals?|Specific educational features; personal relevance',
      'How does studying in the UK support your career plans?|Skills from study; realistic career connection',
      'What benefits and drawbacks did you weigh before choosing the UK?|Balanced tradeoffs; reasoned personal decision',
    ],
    [
      'What research influenced your decision?',
      'Which course feature supports the benefits you described?',
      'How would you explain the value of studying in the UK to your sponsor?',
    ],
  ],
  [
    [
      'Why not study a similar course in your home country?|Relevant local alternatives; personal academic comparison',
      'What local study options did you consider before applying abroad?|Actual alternatives researched; reasons for the decision',
      'What would your chosen course offer beyond suitable options at home?|Specific course differences; evidence rather than blanket criticism',
      'If a similar course were available at home, why would you choose your UK option?|Balanced comparison; personal priorities',
    ],
    [
      'Which local programme did you research?',
      'What specific learning opportunity influenced your comparison?',
      'Could you achieve your career goal through study at home? Explain your choice.',
    ],
  ],
  [
    [
      'Which other countries did you consider, and why did the UK suit you best?|Actual alternatives; relevant comparison criteria',
      'How did you compare the total study costs across countries?|Personal budget comparison; course duration; living costs',
      'How did course structure influence your choice between countries?|Specific course comparisons; relevant learning needs',
      'What was the deciding factor when comparing the UK with other destinations?|Clear priority; evidence from researched alternatives',
    ],
    [
      'Which alternative destination was your strongest option?',
      'How did you check the information used in your comparison?',
      'What disadvantage of the UK did you consider?',
    ],
  ],
  [
    [
      'What made your chosen university a good fit for you?|Specific course and university features; personal fit',
      'Which features of your university directly support your study goals?|Relevant modules facilities or academic support; personal connection',
      'What research convinced you to apply to this university?|Research process; specific findings; official sources',
      'How does the university location suit your academic and practical needs?|Location; practical needs; connection to study',
    ],
    [
      'Which official page did you use for your research?',
      'Which facility or service would you use, and why?',
      'What did you learn about the department offering your course?',
    ],
  ],
  [
    [
      'Which other universities did you consider, and why did you choose this one?|Named alternatives actually researched; specific comparison',
      'How did you compare course content at different universities?|Relevant modules; differences; personal priorities',
      'How did fees and location affect your university shortlist?|Costs and location; realistic tradeoffs',
      'What was the deciding difference between this university and your next choice?|Specific difference; evidence; personal fit',
    ],
    [
      'What did your second-choice university offer?',
      'Which comparison mattered most to you?',
      'Where did you verify the course details you compared?',
    ],
  ],
  [
    [
      'How does your chosen course build on your education or experience?|Academic progression or reasoned change; course fit',
      'Which skills do you want to develop through this course?|Specific skills; relevant course content; goals',
      'Which course modules interest you most, and why?|Accurate researched modules; personal interest',
      'Why is this course the right next step towards your career?|Course level and content; realistic career connection',
    ],
    [
      'How would you use one of these skills in a future role?',
      'What have you researched about assessment on this course?',
      'What makes this course different from your previous studies?',
    ],
  ],
  [
    [
      'What are your short-term and long-term career plans?|Specific role or direction; realistic sequence',
      'How will your studies help you pursue your intended career?|Relevant skills; credible course-to-career link',
      'What role would you aim for after graduation, and why?|Target role; personal suitability; research',
      'What steps will you take to reach your career goal?|Realistic actions and timeline; skill development',
    ],
    [
      'Which skills would an employer expect for that role?',
      'What alternative plan would you consider if your first option did not work out?',
      'What research have you done about opportunities in that field?',
    ],
  ],
  [
    [
      'Where do you plan to live during your studies?|Housing type and area; status of arrangements',
      'How did you compare accommodation options near your university?|Options; cost; travel; suitability',
      'How does your accommodation fit your budget and travel needs?|Realistic costs; commute; available funds',
      'What arrangements have you made for accommodation so far?|Honest confirmation status; next steps; practical plan',
    ],
    [
      'What is the expected journey time to campus?',
      'What costs are included in the rent?',
      'What is your backup plan if your preferred accommodation is unavailable?',
    ],
  ],
  [
    [
      'How will you fund your tuition and living costs?|Funding sources; accessible funds; complete budget',
      'Who is supporting your studies, and how can they afford it?|Sponsor relationship or self-funding; income and savings',
      'Can you explain your study budget and how you will cover it?|Tuition; scholarship if applicable; living costs; funding',
      'What evidence supports your funding plan?|Relevant funding evidence; consistency with budget and profile',
    ],
    [
      'How much tuition remains after any confirmed scholarship?',
      'How will you cover unexpected expenses?',
      'Which funds are currently available and how will you access them?',
    ],
  ],
  [
    [
      'Please introduce yourself and your academic background.|Concise personal introduction; education; current plans',
      'Tell me about your education and what you are doing now.|Education; current study or work; coherent timeline',
      'What experiences led you to your chosen field of study?|Relevant experiences; interest; course connection',
      'How would you describe your study journey so far?|Clear timeline; relevant background; next step',
    ],
    [
      'Which experience most influenced your study plans?',
      'What have you been doing since your last qualification?',
      'What would you like to develop during your next course?',
    ],
  ],
];
export const angleBank = groups.map(([angles, subs], i) => ({
  topic_id: seedQuestions[i].id,
  title: i === 1 ? 'Why not your home country?' : seedQuestions[i].text,
  original_text: seedQuestions[i].text,
  category: seedQuestions[i].category,
  angles: angles.map((row, j) => {
    const [text, expected_concepts] = row.split('|');
    return { id: `topic-${i + 1}-angle-${j + 1}`, text, expected_concepts };
  }),
  sub_questions: subs.map((text, j) => ({ id: `topic-${i + 1}-practice-${j + 1}`, text })),
}));
export function selectAngle(question, pick = randomInt) {
  // Staff edits win: only vary unchanged built-in main questions.
  const topic = angleBank.find(
    (t) =>
      t.topic_id === question.id &&
      t.original_text === question.text &&
      t.category === question.category,
  );
  if (!topic || !question.is_main_question) return question;
  const angle = topic.angles[pick(topic.angles.length)];
  return {
    ...question,
    text: angle.text,
    expected_concepts: angle.expected_concepts,
    angle_id: angle.id,
    topic_title: topic.title,
  };
}

export function orderInterviewQuestions(questions, pick = randomInt) {
  const introductions = questions.filter(q => q.category.trim().toLowerCase() === 'introduction');
  const remaining = questions.filter(q => !introductions.includes(q));
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  return [...introductions, ...remaining];
}

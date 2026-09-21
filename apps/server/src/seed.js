import { configure } from './config.js';
import { seedQuestions } from './domain.js';
const { repo } = await configure();
for (const q of seedQuestions)
  if (!(await repo.get('questions', q.id))) await repo.put('questions', q);
console.log('Question bank seeded; existing edits preserved.');

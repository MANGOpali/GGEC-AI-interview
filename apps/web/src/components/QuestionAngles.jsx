import { useEffect, useState } from 'react';
import { api } from '../services/api';
export default function QuestionAngles() {
  const [topics, setTopics] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState({});
  useEffect(() => {
    let live = true;
    api('/question-angles')
      .then((data) => {
        if (live) setTopics(data);
      })
      .catch(() => {
        if (live) setError('Question variations could not be loaded. Refresh to try again.');
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <details className="card">
      <summary>Question angles and sub-question practice bank</summary>
      <p>
        Interviews select one random angle per main topic. Sub-questions below are optional
        self-practice, with no extra AI calls or automatic scoring.
      </p>
      <p>
        {topics.length} main topics · {topics.reduce((n, t) => n + t.angles.length, 0)} interview
        angles · {topics.reduce((n, t) => n + t.sub_questions.length, 0)} practice sub-questions
      </p>
      {error && <p role="alert">{error}</p>}
      {topics.map((topic) => (
        <details key={topic.topic_id}>
          <summary>{topic.title}</summary>
          <h3>Different ways to ask this question</h3>
          <ul>
            {topic.angles.map((q) => (
              <li key={q.id}>{q.text}</li>
            ))}
          </ul>
          <h3>Related sub-questions</h3>
          <ul>
            {topic.sub_questions.map((q) => (
              <li key={q.id}>{q.text}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              const options = [...topic.angles, ...topic.sub_questions].filter(
                (q) => q.id !== selected[topic.topic_id]?.id,
              );
              setSelected((previous) => ({
                ...previous,
                [topic.topic_id]: options[Math.floor(Math.random() * options.length)],
              }));
            }}
          >
            Give me a practice question
          </button>
          {selected[topic.topic_id] && <p role="status">{selected[topic.topic_id].text}</p>}
        </details>
      ))}
      {!error && topics.length === 0 && (
        <p>No built-in variation topics are currently available.</p>
      )}
    </details>
  );
}

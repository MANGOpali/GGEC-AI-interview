import { date } from './common';
export default function PracticeProgress({ sessions }) {
  const completed = sessions
    .filter((s) => s.state === 'REPORT')
    .slice()
    .reverse();
  return (
    <section className="card">
      <h2>Your practice history</h2>
      <p>
        Compare like-for-like attempts. Category practice and different scoring versions are
        separate comparisons.
      </p>
      {!completed.length ? (
        <p>Complete an interview to start tracking progress.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Practice</th>
              <th>Score</th>
              <th>Scoring version</th>
            </tr>
          </thead>
          <tbody>
            {completed.map((s) => (
              <tr key={s.id}>
                <td>{date(s.started_at)}</td>
                <td>{s.practice_category || 'Full interview'}</td>
                <td>
                  {s.report?.overall_score == null
                    ? 'Not evaluated'
                    : `${s.report.overall_score}/100`}
                </td>
                <td>{s.report?.scoring_version || 'Legacy / unknown'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

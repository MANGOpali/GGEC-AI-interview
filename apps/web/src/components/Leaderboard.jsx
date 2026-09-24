import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { api } from '../services/api';
import { Button, Title } from './common';

export default function Leaderboard({ run, onProfile, student }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    run(() => api('/leaderboard').then(setRows));
  }, []);
  return (
    <>
      <Title
        eyebrow="SHARED PROGRESS"
        title="Celebrate the practice."
        description="An optional member leaderboard, ranked by each participating student’s best fully evaluated score."
      />
      <div className="card">
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Public alias</th>
                <th>Best score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    {i < 3 ? (
                      <span className={`rank-medal ${['gold', 'silver', 'bronze'][i]}`}>{i + 1}</span>
                    ) : (
                      i + 1
                    )}
                  </td>
                  <td>{r.alias}</td>
                  <td>{r.score}/100</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            <Trophy size={34} />
            <h2>A fresh start.</h2>
            <p>No opted-in, fully evaluated interviews yet.</p>
          </div>
        )}
        {student && (
          <Button secondary onClick={onProfile}>
            Manage my leaderboard preference
          </Button>
        )}
      </div>
    </>
  );
}
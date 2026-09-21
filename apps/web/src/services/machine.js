export const transitions = {
  MAIN_QUESTION: { RECORD: 'RECORDING', TYPE: 'TRANSCRIPTION', SUBMIT: 'EVALUATION' },
  FOLLOW_UP: { RECORD: 'RECORDING', TYPE: 'TRANSCRIPTION', SUBMIT: 'EVALUATION' },
  RECORDING: { STOP: 'TRANSCRIPTION' },
  TRANSCRIPTION: { RECORD: 'RECORDING', SUBMIT: 'EVALUATION' },
  EVALUATION: { FAIL: 'TRANSCRIPTION' },
};
export function transition(state, event) {
  const next = transitions[state]?.[event];
  if (!next) throw new Error(`Invalid interview transition: ${state} / ${event}`);
  return next;
}

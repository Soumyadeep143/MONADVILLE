import { useEffect, useState } from "react";
import { api } from "./api.js";

interface Question {
  id: string;
  text: string;
  options: { id: string; label: string }[];
}

export default function Questionnaire() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [personality, setPersonality] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getQuestionnaire().then((res) => setQuestions(res.questions));
  }, []);

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id]);

  async function submit() {
    setBusy(true);
    try {
      const res = await api.submitQuestionnaire(Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId })));
      setPersonality(res.personality);
    } finally {
      setBusy(false);
    }
  }

  if (personality) {
    return (
      <div className="card">
        <h3>Your behavioral profile</h3>
        <div className="grid">
          {Object.entries(personality).map(([trait, value]) => (
            <div className="stat" key={trait}>
              <div className="label">{trait}</div>
              <div className="value">{value}</div>
            </div>
          ))}
        </div>
        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 12 }}>
          These are behavioral tendencies derived from your answers, not a validated psychological assessment. This profile is attached the next
          time you join a simulation.
        </p>
        <button onClick={() => setPersonality(null)}>Retake</button>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Behavioral questionnaire</h3>
      {questions.map((q) => (
        <div className="question" key={q.id}>
          <p>{q.text}</p>
          {q.options.map((o) => (
            <label key={o.id}>
              <input
                type="radio"
                name={q.id}
                checked={answers[q.id] === o.id}
                onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: o.id }))}
                style={{ marginRight: 8 }}
              />
              {o.label}
            </label>
          ))}
        </div>
      ))}
      <button onClick={submit} disabled={!allAnswered || busy}>
        {busy ? "Submitting..." : "Submit"}
      </button>
    </div>
  );
}

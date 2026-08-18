import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Clock3, Copy, FileUp, LayoutDashboard, Plus, Search, Share2, Timer, Users, XCircle } from 'lucide-react';
import { supabase } from './supabaseClient';
import './styles.css';

const SAMPLE_CSV = `question,option_a,option_b,option_c,option_d,correct_option,explanation
"Which normal form removes partial dependency?","1NF","2NF","3NF","BCNF","B","Partial dependencies are removed in 2NF."
"Which SQL command removes a table definition?","DELETE","DROP","TRUNCATE","REMOVE","B","DROP removes a table definition."`;

const uid = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function parseCsv(text) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value.trim()); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i++; row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = ''; }
    else value += char;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error('Add a header and at least one question.');
  const headers = rows[0].map(h => h.toLowerCase().replace(/^\uFEFF/, ''));
  const required = ['question','option_a','option_b','option_c','option_d','correct_option'];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);
  return rows.slice(1).map((r, index) => {
    const obj = Object.fromEntries(headers.map((h, i) => [h, r[i] || '']));
    const correct = obj.correct_option.toUpperCase();
    if (required.some(h => !obj[h]) || !['A','B','C','D'].includes(correct)) throw new Error(`Question ${index + 1} is incomplete or has an invalid correct_option.`);
    return { id: uid(), question: obj.question, options: [obj.option_a, obj.option_b, obj.option_c, obj.option_d], correct, explanation: obj.explanation || '' };
  });
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [page, setPage] = useState('home');
  const [activeTest, setActiveTest] = useState(null);
  const [toast, setToast] = useState('');

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2600); };
  const go = (target, test = null) => { setActiveTest(test); setPage(target); window.scrollTo(0,0); };

  // Fetch Session & Data
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchData = async () => {
    if (!user) return;
    try {
      // Fetch Hosted Tests
      const { data: hostedTests } = await supabase.from('tests').select('*, questions(*)').eq('host_id', user.id);
      if (hostedTests) {
        const formattedTests = hostedTests.map(t => ({
          ...t,
          timerMode: t.timer_mode,
          timerValue: t.timer_value,
          startAt: t.start_at,
          endAt: t.end_at,
          attemptLimit: t.attempt_limit,
          createdAt: t.created_at,
          hostId: t.host_id,
          questions: (t.questions || []).map(q => ({
            id: q.id,
            question: q.question,
            options: [q.option_a, q.option_b, q.option_c, q.option_d],
            correct: q.correct_option,
            explanation: q.explanation
          }))
        }));
        setTests(formattedTests);
      }

      // Fetch Joined Attempts
      const { data: userAttempts } = await supabase.from('attempts').select('*, tests(*, questions(*))').eq('user_id', user.id);
      if (userAttempts) {
        const formattedAttempts = userAttempts.map(a => ({
          ...a,
          testId: a.test_id,
          userId: a.user_id,
          submittedAt: a.submitted_at,
          test: a.tests ? {
            ...a.tests,
            timerMode: a.tests.timer_mode,
            timerValue: a.tests.timer_value,
            questions: (a.tests.questions || []).map(q => ({
              id: q.id,
              question: q.question,
              options: [q.option_a, q.option_b, q.option_c, q.option_d],
              correct: q.correct_option,
              explanation: q.explanation
            }))
          } : null
        }));
        setAttempts(formattedAttempts);
      }
    } catch (err) {
      console.error('Data fetch error:', err);
    }
  };

  useEffect(() => {
    if (user) fetchData();
    else { setTests([]); setAttempts([]); }
  }, [user]);

  const addTest = async (test) => {
    try {
      const { error: testErr } = await supabase.from('tests').insert({
        id: test.id,
        code: test.code,
        host_id: user.id,
        title: test.title,
        subject: test.subject,
        description: test.description,
        timer_mode: test.timerMode,
        timer_value: test.timerValue ? parseInt(test.timerValue) : null,
        start_at: test.startAt || null,
        end_at: test.endAt || null,
        attempt_limit: parseInt(test.attemptLimit) || 1
      });
      if (testErr) throw testErr;

      const questionInserts = test.questions.map(q => ({
        id: q.id,
        test_id: test.id,
        question: q.question,
        option_a: q.options[0],
        option_b: q.options[1],
        option_c: q.options[2],
        option_d: q.options[3],
        correct_option: q.correct,
        explanation: q.explanation
      }));

      const { error: qErr } = await supabase.from('questions').insert(questionInserts);
      if (qErr) throw qErr;

      fetchData();
      go('share', test);
      notify('Test published successfully!');
    } catch (err) {
      notify('Error publishing test: ' + err.message);
    }
  };

  const saveAttempt = async (attempt) => {
    try {
      const { error } = await supabase.from('attempts').insert({
        id: attempt.id,
        test_id: attempt.testId,
        user_id: user.id,
        score: attempt.score,
        total: attempt.total,
        answers: attempt.answers,
        submitted_at: attempt.submittedAt
      });
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Error saving attempt:', err);
    }
  };

  const context = { user, setUser, tests, attempts, go, addTest, saveAttempt, activeTest, notify, fetchData };

  if (loading) return <div style={{ display: 'grid', placeItems: 'center', height: '100vh', fontFamily: 'DM Sans, sans-serif' }}>Loading Evalo...</div>;

  return (
    <>
      {page !== 'attempt' && <Header {...context} />}
      <main>
        {page === 'home' && <Home {...context} />}
        {page === 'auth' && <Auth {...context} />}
        {page === 'dashboard' && <Dashboard {...context} />}
        {page === 'create' && <CreateTest {...context} />}
        {page === 'share' && <SharePage {...context} />}
        {page === 'join' && <Join {...context} />}
        {page === 'attempt' && <Attempt {...context} />}
        {page === 'result' && <Result {...context} />}
      </main>
      {toast && <div className="toast"><CheckCircle2 size={18}/>{toast}</div>}
    </>
  );
}

function Header({ user, go, notify }) {
  const userName = user?.user_metadata?.name || user?.email || 'U';
  const signOut = async () => {
    await supabase.auth.signOut();
    notify('Signed out');
    go('home');
  };

  return (
    <header>
      <button className="brand" onClick={() => go('home')}><span>E</span>evalo</button>
      <nav>
        {user ? (
          <>
            <button onClick={() => go('dashboard')}><LayoutDashboard size={17}/>Dashboard</button>
            <button className="new-test" onClick={() => go('create')}><Plus size={17}/>Create test</button>
            <button className="avatar" onClick={signOut} title="Sign out">{userName[0].toUpperCase()}</button>
          </>
        ) : (
          <>
            <button onClick={() => go('join')}><Search size={17}/>Join a test</button>
            <button onClick={() => go('auth')}>Sign in</button>
            <button className="new-test" onClick={() => go('auth')}>Get started</button>
          </>
        )}
      </nav>
    </header>
  );
}

function Home({ user, go }) {
  const [code, setCode] = useState('');
  return (
    <section className="hero">
      <div className="eyebrow">ASSESSMENTS, SIMPLIFIED</div>
      <h1>Tests that feel<br/><i>easy to run.</i></h1>
      <p>Create polished MCQ assessments from a CSV file, share a simple code, and see every result in one place.</p>
      <div className="hero-actions">
        <button className="primary" onClick={() => go(user ? 'create' : 'auth')}>Create a test <ArrowRight size={18}/></button>
        <button className="secondary" onClick={() => go('join')}>Join with a code</button>
      </div>
      <div className="join-strip">
        <span>Have a test code?</span>
        <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="e.g. 7KQ9" maxLength="6"/>
        <button onClick={() => go('join')}>Continue <ChevronRight size={16}/></button>
      </div>
      <div className="hero-stats">
        <div><strong>CSV import</strong><span>Upload questions in seconds</span></div>
        <div><strong>Flexible timing</strong><span>Your test, your rules</span></div>
        <div><strong>Clear results</strong><span>Learn from every answer</span></div>
      </div>
    </section>
  );
}

function Auth({ go, notify }) {
  const [isSignUp, setIsSignUp] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } }
        });
        if (error) throw error;
        notify('Account created successfully!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        notify('Signed in successfully!');
      }
      go('dashboard');
    } catch (error) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-wrap">
      <div className="auth-card">
        <div className="eyebrow">YOUR EVALO ACCOUNT</div>
        <h2>{isSignUp ? 'Start in one place.' : 'Welcome back.'}</h2>
        <p>Create tests, join tests, and keep all your results together.</p>
        <form onSubmit={submit}>
          {isSignUp && (
            <label>Full name
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" required/>
            </label>
          )}
          <label>Email address
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/>
          </label>
          <label>Password
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password" minLength="6" required/>
          </label>
          {err && <div className="error"><XCircle size={17}/>{err}</div>}
          <button className="primary full" disabled={loading}>
            {loading ? 'Please wait...' : (isSignUp ? 'Create account' : 'Sign in')} <ArrowRight size={18}/>
          </button>
        </form>
        <small style={{ cursor: 'pointer', textAlign: 'center', display: 'block', marginTop: '10px' }} onClick={() => { setIsSignUp(!isSignUp); setErr(''); }}>
          {isSignUp ? 'Already have an account? Sign in here.' : "Don't have an account? Sign up here."}
        </small>
      </div>
    </section>
  );
}

function Dashboard({ user, tests, attempts, go }) {
  const [tab, setTab] = useState('hosted');
  const userName = user?.user_metadata?.name || user?.email || 'User';
  const cards = tab === 'hosted' ? tests : attempts;

  return (
    <section className="app-shell">
      <div className="page-title">
        <div>
          <div className="eyebrow">WELCOME BACK, {userName.toUpperCase()}</div>
          <h2>Your learning space</h2>
        </div>
        <button className="primary" onClick={()=>go('create')}><Plus size={18}/>Create a test</button>
      </div>
      <div className="tabs">
        <button className={tab==='hosted'?'active':''} onClick={()=>setTab('hosted')}>My hosted tests <b>{tests.length}</b></button>
        <button className={tab==='joined'?'active':''} onClick={()=>setTab('joined')}>My joined tests <b>{attempts.length}</b></button>
      </div>
      {cards.length === 0 ? (
        <div className="empty">
          <FileUp size={34}/>
          <h3>{tab === 'hosted' ? 'Create your first test' : 'No joined tests yet'}</h3>
          <p>{tab === 'hosted' ? 'Upload a CSV and share your test in minutes.' : 'Use a test code shared by your teacher or friend.'}</p>
          <button className="secondary" onClick={()=>go(tab==='hosted'?'create':'join')}>{tab==='hosted'?'Create test':'Join a test'}</button>
        </div>
      ) : (
        <div className="test-grid">
          {tab === 'hosted' ? tests.map(t => (
            <TestCard key={t.id} test={t} attempts={attempts.filter(a=>a.testId===t.id)} onClick={()=>go('share',t)}/>
          )) : attempts.map(a => {
            const t = a.test;
            return (
              <div className="test-card" key={a.id}>
                <div className="test-card-top">
                  <span className="tag">COMPLETED</span>
                  <span className="score">{a.score}/{a.total}</span>
                </div>
                <h3>{t?.title || 'Test'}</h3>
                <p>{t?.subject || 'Assessment'}</p>
                <div className="card-foot">
                  <span>{new Date(a.submittedAt).toLocaleDateString()}</span>
                  <button onClick={()=>go('result',{...a, test: t})}>Review <ArrowRight size={15}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TestCard({ test, attempts, onClick }) {
  const now = Date.now();
  const status = test.startAt && now < new Date(test.startAt) ? 'SCHEDULED' : test.endAt && now > new Date(test.endAt) ? 'CLOSED' : 'LIVE';
  return (
    <div className="test-card" onClick={onClick}>
      <div className="test-card-top">
        <span className={'tag ' + status.toLowerCase()}>{status}</span>
        <span className="muted">{attempts.length} attempts</span>
      </div>
      <h3>{test.title}</h3>
      <p>{test.subject || 'General assessment'} · {test.questions.length} questions</p>
      <div className="card-foot">
        <span>{test.timerMode === 'none' ? 'No timer' : test.timerMode === 'total' ? `${test.timerValue} min total` : `${test.timerValue}s / question`}</span>
        <button>Manage <ArrowRight size={15}/></button>
      </div>
    </div>
  );
}

function CreateTest({ addTest, go }) {
  const [step, setStep] = useState(1);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState({ title:'', subject:'', description:'', timerMode:'none', timerValue:'', startAt:'', endAt:'', attemptLimit:'1' });

  const upload = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setQuestions(parseCsv(await file.text())); setError(''); }
    catch (err) { setError(err.message); }
  };
  const change = (k, v) => setMeta(m => ({...m, [k]: v}));
  const publish = () => {
    if (!meta.title || !questions.length) return;
    const test = { ...meta, id: uid(), code: uid().slice(0,4), questions };
    addTest(test);
  };

  return (
    <section className="app-shell">
      <button className="back" onClick={()=>go('dashboard')}><ArrowLeft size={17}/>Dashboard</button>
      <div className="page-title">
        <div><div className="eyebrow">CREATE A NEW ASSESSMENT</div><h2>Build your test</h2></div>
        <span className="step-label">Step {step} of 3</span>
      </div>
      <div className="steps">
        <span className={step>=1?'on':''}>1. Import questions</span>
        <span className={step>=2?'on':''}>2. Details & rules</span>
        <span className={step>=3?'on':''}>3. Review</span>
      </div>
      {step===1 && (
        <div className="panel upload-panel">
          <FileUp size={34}/>
          <h3>Upload your CSV file</h3>
          <p>Use the fixed format: question, options A–D, correct option, and optional explanation.</p>
          <label className="upload-btn">Choose CSV file<input type="file" accept=".csv,text/csv" onChange={upload}/></label>
          <button className="text-btn" onClick={()=>{ try{setQuestions(parseCsv(SAMPLE_CSV));setError('');}catch{} }}>Load DBMS sample instead</button>
          {error && <div className="error"><XCircle size={17}/>{error}</div>}
          {questions.length > 0 && (
            <div className="import-ok">
              <CheckCircle2 size={20}/>
              <strong>{questions.length} questions imported successfully</strong>
              <button className="primary" onClick={()=>setStep(2)}>Continue <ArrowRight size={17}/></button>
            </div>
          )}
        </div>
      )}
      {step===2 && (
        <div className="form-panel">
          <div className="field-grid">
            <label>Test title<input value={meta.title} onChange={e=>change('title',e.target.value)} placeholder="e.g. DBMS Unit 1 Test"/></label>
            <label>Subject<input value={meta.subject} onChange={e=>change('subject',e.target.value)} placeholder="e.g. Database Management Systems"/></label>
          </div>
          <label>Description <textarea value={meta.description} onChange={e=>change('description',e.target.value)} placeholder="Brief instructions for students (optional)"/></label>
          <div className="rule-block">
            <div><h3><Timer size={18}/>Timing</h3><p>Choose how students should be timed.</p></div>
            <div className="choice-row">
              {[['none','No timer'],['total','Full test timer'],['question','Per-question timer']].map(([v,l])=>(
                <button className={meta.timerMode===v?'selected':''} onClick={()=>change('timerMode',v)} key={v}>{l}</button>
              ))}
            </div>
            {meta.timerMode!=='none' && (
              <label className="inline-field">{meta.timerMode==='total'?'Total duration (minutes)':'Time per question (seconds)'}
                <input type="number" min="1" value={meta.timerValue} onChange={e=>change('timerValue',e.target.value)}/>
              </label>
            )}
          </div>
          <div className="rule-block">
            <div><h3><Clock3 size={18}/>Schedule</h3><p>Make it available now or at a chosen time.</p></div>
            <div className="field-grid">
              <label>Start date & time <input type="datetime-local" value={meta.startAt} onChange={e=>change('startAt',e.target.value)}/></label>
              <label>End date & time <input type="datetime-local" value={meta.endAt} min={meta.startAt} onChange={e=>change('endAt',e.target.value)}/></label>
            </div>
          </div>
          <div className="rule-block attempt-rule">
            <div><h3><Users size={18}/>Allowed attempts</h3><p>Number of times each person can take this test.</p></div>
            <label className="inline-field">Attempts per participant
              <input type="number" min="1" max="20" value={meta.attemptLimit} onChange={e=>change('attemptLimit',e.target.value)}/>
            </label>
          </div>
          <div className="form-actions">
            <button className="secondary" onClick={()=>setStep(1)}>Back</button>
            <button className="primary" disabled={!meta.title || (meta.timerMode!=='none'&&!meta.timerValue)} onClick={()=>setStep(3)}>Review test <ArrowRight size={17}/></button>
          </div>
        </div>
      )}
      {step===3 && (
        <div className="review-panel">
          <div className="review-summary">
            <div>
              <span className="eyebrow">READY TO PUBLISH</span>
              <h2>{meta.title}</h2>
              <p>{meta.subject||'General assessment'} · {questions.length} questions · {meta.timerMode==='none'?'No timer':meta.timerMode==='total'?`${meta.timerValue} min total`:`${meta.timerValue}s per question`}</p>
            </div>
            <CheckCircle2 size={42}/>
          </div>
          <div className="question-preview">
            {questions.slice(0,3).map((q,i)=>(
              <div key={q.id}><span>QUESTION {i+1}</span><p>{q.question}</p><small>Correct answer: {q.correct}</small></div>
            ))}
            {questions.length>3 && <p className="muted">+ {questions.length-3} more questions</p>}
          </div>
          <div className="form-actions">
            <button className="secondary" onClick={()=>setStep(2)}>Back</button>
            <button className="primary" onClick={publish}>Publish & get share link <Share2 size={17}/></button>
          </div>
        </div>
      )}
    </section>
  );
}

function SharePage({ activeTest, go, notify, attempts }) {
  if (!activeTest) return null;
  const link = `evalo.app/join/${activeTest.code}`;
  const attemptCount = attempts.filter(a => a.testId === activeTest.id).length;

  return (
    <section className="app-shell narrow">
      <div className="success-icon"><Check size={34}/></div>
      <div className="center">
        <div className="eyebrow">TEST PUBLISHED</div>
        <h2>{activeTest.title} is ready to share.</h2>
        <p>Students need an account, then can join using your link or code.</p>
      </div>
      <div className="share-card">
        <label>Shareable link
          <div className="copy-line">
            <code>{link}</code>
            <button onClick={()=>{navigator.clipboard?.writeText(link);notify('Link copied');}}><Copy size={17}/></button>
          </div>
        </label>
        <div className="or">OR</div>
        <label>Join code
          <div className="code-box">
            {activeTest.code}
            <button onClick={()=>{navigator.clipboard?.writeText(activeTest.code);notify('Code copied');}}><Copy size={17}/></button>
          </div>
        </label>
      </div>
      <div className="share-actions">
        <button className="secondary" onClick={()=>go('dashboard')}>View dashboard</button>
        <button className="primary" onClick={()=>go('join')}>Preview join flow <ArrowRight size={17}/></button>
      </div>
      {attemptCount > 0 && <div className="muted center">{attemptCount} submitted attempts</div>}
    </section>
  );
}

function Join({ user, attempts, go }) {
  const [code, setCode] = useState('');
  const [found, setFound] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async e => {
    e?.preventDefault();
    if (!code.trim()) return;
    setErr('');
    setLoading(true);
    try {
      const { data, error } = await supabase.from('tests').select('*, questions(*)').eq('code', code.trim().toUpperCase()).single();
      if (error || !data) {
        setErr('We could not find a test with that code.');
        setFound(null);
      } else {
        const formattedTest = {
          ...data,
          timerMode: data.timer_mode,
          timerValue: data.timer_value,
          startAt: data.start_at,
          endAt: data.end_at,
          attemptLimit: data.attempt_limit,
          questions: (data.questions || []).map(q => ({
            id: q.id,
            question: q.question,
            options: [q.option_a, q.option_b, q.option_c, q.option_d],
            correct: q.correct_option,
            explanation: q.explanation
          }))
        };
        setFound(formattedTest);
      }
    } catch (error) {
      setErr('Error searching for test.');
    } finally {
      setLoading(false);
    }
  };

  const join = async () => {
    if (!user) { go('auth'); return; }
    
    // Check previous attempts from DB
    const { data: userAttempts } = await supabase.from('attempts').select('id').eq('test_id', found.id).eq('user_id', user.id);
    const count = userAttempts ? userAttempts.length : 0;
    if (count >= Number(found.attemptLimit)) {
      setErr('You have used all allowed attempts for this test.');
      return;
    }

    const now = Date.now();
    if (found.startAt && now < new Date(found.startAt)) {
      setErr(`This test opens on ${new Date(found.startAt).toLocaleString()}.`);
      return;
    }
    if (found.endAt && now > new Date(found.endAt)) {
      setErr('This test is closed.');
      return;
    }
    go('attempt', found);
  };

  return (
    <section className="join-page">
      <div className="join-card">
        <div className="eyebrow">JOIN A TEST</div>
        <h2>Enter your code</h2>
        <p>Your host may have shared a four-character join code with you.</p>
        <form onSubmit={lookup}>
          <input className="code-input" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="7KQ9" maxLength="6" autoFocus/>
          <button className="primary full" disabled={loading}>{loading ? 'Searching...' : 'Find test'} <ArrowRight size={17}/></button>
        </form>
        {err && <div className="error"><XCircle size={17}/>{err}</div>}
        {found && (
          <div className="found">
            <span className="tag live">OPEN</span>
            <h3>{found.title}</h3>
            <p>{found.subject || 'Assessment'} · {found.questions.length} questions</p>
            <div className="facts">
              <span><Clock3 size={15}/>{found.timerMode === 'none' ? 'No time limit' : found.timerMode === 'total' ? `${found.timerValue} minutes` : `${found.timerValue}s each`}</span>
              <span><Users size={15}/>{found.attemptLimit} attempt{Number(found.attemptLimit) > 1 ? 's' : ''}</span>
            </div>
            <button className="primary full" onClick={join}>Start test <ArrowRight size={17}/></button>
          </div>
        )}
      </div>
    </section>
  );
}

function Attempt({ activeTest, user, saveAttempt, go }) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [seconds, setSeconds] = useState(() => activeTest?.timerMode === 'total' ? Number(activeTest.timerValue) * 60 : activeTest?.timerMode === 'question' ? Number(activeTest.timerValue) : 0);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!activeTest || activeTest.timerMode === 'none' || submitted) return;
    const id = setInterval(() => setSeconds(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(id);
  }, [activeTest, submitted]);

  useEffect(() => {
    if (seconds === 0 && activeTest?.timerMode !== 'none') {
      if (activeTest.timerMode === 'total') submit();
      else if (idx < activeTest.questions.length - 1) {
        setIdx(x => x + 1);
        setSeconds(Number(activeTest.timerValue));
      } else submit();
    }
  }, [seconds]);

  if (!activeTest) return null;
  const q = activeTest.questions[idx];
  const select = (opt) => setAnswers(a => ({...a, [q.id]: opt}));

  const submit = () => {
    if (submitted) return;
    setSubmitted(true);
    const score = activeTest.questions.reduce((n, x) => n + (answers[x.id] === x.correct ? 1 : 0), 0);
    const a = {
      id: uid(),
      testId: activeTest.id,
      userId: user.id,
      answers,
      score,
      total: activeTest.questions.length,
      submittedAt: new Date().toISOString()
    };
    saveAttempt(a);
    go('result', { ...a, test: activeTest });
  };

  const min = Math.floor(seconds / 60), sec = String(seconds % 60).padStart(2, '0');
  const isPerQuestion = activeTest.timerMode === 'question';

  return (
    <section className="attempt-shell">
      <div className="attempt-top">
        <button className="brand mini"><span>E</span>evalo</button>
        <div className="progress">
          <span>Question {idx+1} of {activeTest.questions.length}</span>
          <div><i style={{ width: `${((idx+1)/activeTest.questions.length)*100}%` }}/></div>
        </div>
        {activeTest.timerMode !== 'none' && <div className="timer"><Timer size={17}/>{min}:{sec}</div>}
      </div>
      <div className="attempt-body">
        <aside>
          {activeTest.questions.map((x, i) => (
            <button key={x.id} className={(i===idx?'current ':'')+(answers[x.id]?'answered':'')} disabled={isPerQuestion && i < idx} onClick={() => { if (!isPerQuestion || i >= idx) setIdx(i); }}>{i+1}</button>
          ))}
        </aside>
        <article className="question-card">
          <span className="eyebrow">QUESTION {idx+1}</span>
          <h2>{q.question}</h2>
          <div className="options">
            {q.options.map((o, i) => {
              const letter = 'ABCD'[i];
              return (
                <button key={letter} className={answers[q.id] === letter ? 'chosen' : ''} onClick={() => select(letter)}>
                  <b>{letter}</b>{o}
                </button>
              );
            })}
          </div>
          <div className="question-actions">
            {!isPerQuestion && <button className="secondary" disabled={idx === 0} onClick={() => setIdx(i => i - 1)}><ArrowLeft size={17}/>Previous</button>}
            <span/>
            {idx === activeTest.questions.length - 1 ? (
              <button className="primary" onClick={submit}>Submit test <Check size={17}/></button>
            ) : (
              <button className="primary" onClick={() => { setIdx(i => i + 1); if (isPerQuestion) setSeconds(Number(activeTest.timerValue)); }}>Next <ArrowRight size={17}/></button>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

function Result({ activeTest, go }) {
  const attempt = activeTest, test = attempt?.test;
  if (!test) return null;
  return (
    <section className="app-shell narrow">
      <div className="result-hero">
        <div className="eyebrow">TEST COMPLETED</div>
        <h2>{test.title}</h2>
        <div className="big-score">{attempt.score}<span>/{attempt.total}</span></div>
        <p>{Math.round(attempt.score / attempt.total * 100)}% score · Review every answer below</p>
      </div>
      <div className="review-list">
        {test.questions.map((q, i) => {
          const answer = attempt.answers[q.id], correct = answer === q.correct;
          return (
            <div className={'review-item ' + (correct ? 'correct' : 'wrong')} key={q.id}>
              <div className="review-head">
                {correct ? <CheckCircle2/> : <XCircle/>}
                <span>QUESTION {i+1}</span>
                <b>{correct ? 'Correct' : 'Incorrect'}</b>
              </div>
              <h3>{q.question}</h3>
              <div className="review-options">
                {q.options.map((option, optionIndex) => {
                  const letter = 'ABCD'[optionIndex], selected = answer === letter, isCorrect = letter === q.correct;
                  const state = correct && selected ? 'right' : !correct && selected ? 'wrong-answer' : !correct && isCorrect ? 'right' : '';
                  return (
                    <div className={state} key={letter}>
                      <b>{letter}</b><span>{option}</span>
                      {selected && <em>Your answer</em>}
                      {!correct && isCorrect && <em>Correct answer</em>}
                      {correct && selected && <Check size={17}/>}
                    </div>
                  );
                })}
              </div>
              {q.explanation && <div className="explanation"><b>Explanation</b>{q.explanation}</div>}
            </div>
          );
        })}
      </div>
      <button className="primary center-btn" onClick={() => go('dashboard')}>Back to dashboard <ArrowRight size={17}/></button>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);

import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  CheckCircle2, 
  ChevronRight, 
  Clock3, 
  Copy, 
  FileUp, 
  LayoutDashboard, 
  Plus, 
  Search, 
  Share2, 
  Timer, 
  Users, 
  XCircle, 
  Sun, 
  Moon, 
  User, 
  LogOut, 
  Edit3, 
  ChevronDown,
  ExternalLink
} from 'lucide-react';
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
    else if ((char === '\n' || char === '\r') && !quoted) { 
      if (char === '\r' && next === '\n') i++; 
      row.push(value.trim()); 
      if (row.some(Boolean)) rows.push(row); 
      row = []; 
      value = ''; 
    }
    else value += char;
  }
  row.push(value.trim()); 
  if (row.some(Boolean)) rows.push(row);
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

function extractJoinCode() {
  const hash = window.location.hash || '';
  if (hash.startsWith('#join-')) return hash.replace('#join-', '').trim().toUpperCase();
  if (hash.startsWith('#join/')) return hash.replace('#join/', '').trim().toUpperCase();
  if (hash.startsWith('#/join/')) return hash.replace('#/join/', '').trim().toUpperCase();
  
  const search = new URLSearchParams(window.location.search);
  const joinParam = search.get('join') || search.get('code');
  if (joinParam) return joinParam.trim().toUpperCase();

  return null;
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [page, setPage] = useState('home');
  const [activeTest, setActiveTest] = useState(null);
  const [initialJoinCode, setInitialJoinCode] = useState('');
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('evaluate_theme') || 'light');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Apply theme
  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
    localStorage.setItem('evaluate_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => (t === 'light' ? 'dark' : 'light'));
  };

  const notify = (msg) => { 
    setToast(msg); 
    setTimeout(() => setToast(''), 2800); 
  };

  const go = (target, test = null, addToHistory = true) => { 
    setActiveTest(test); 
    setPage(target); 
    window.scrollTo(0,0); 
    if (addToHistory) {
      const path = target === 'home' ? '/' : `#${target}${test?.code ? '-' + test.code : ''}`;
      window.history.pushState({ page: target, test }, '', path);
    }
  };

  // Listen to popstate (browser back/forward buttons)
  useEffect(() => {
    const handlePopState = (e) => {
      if (e.state?.page) {
        setPage(e.state.page);
        setActiveTest(e.state.test || null);
      } else {
        const joinCode = extractJoinCode();
        if (joinCode) {
          setInitialJoinCode(joinCode);
          setPage('join');
        } else {
          setPage('home');
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Check URL on startup for direct join links (#join-CODE or ?join=CODE)
  useEffect(() => {
    const code = extractJoinCode();
    if (code) {
      setInitialJoinCode(code);
      setPage('join');
    }
  }, []);

  // Fetch Session
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
      if (!user) throw new Error("Please log in to publish a test.");
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
        user_id: user?.id,
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

  const handleUpdateName = async (newName) => {
    try {
      const { error } = await supabase.auth.updateUser({
        data: { name: newName }
      });
      if (error) throw error;
      setUser(u => ({ ...u, user_metadata: { ...u.user_metadata, name: newName } }));
      notify('Profile updated!');
      setIsEditModalOpen(false);
    } catch (err) {
      notify('Error updating profile: ' + err.message);
    }
  };

  const context = { 
    user, 
    setUser, 
    tests, 
    attempts, 
    go, 
    addTest, 
    saveAttempt, 
    activeTest, 
    notify, 
    fetchData,
    initialJoinCode,
    theme,
    toggleTheme,
    openEditModal: () => setIsEditModalOpen(true)
  };

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
        <h2>Loading Evaluate...</h2>
      </div>
    );
  }

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
      
      {isEditModalOpen && (
        <EditProfileModal 
          user={user} 
          onSave={handleUpdateName} 
          onClose={() => setIsEditModalOpen(false)} 
        />
      )}

      {toast && <div className="toast"><CheckCircle2 size={18}/>{toast}</div>}
    </>
  );
}

function Header({ user, go, notify, theme, toggleTheme, openEditModal }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef(null);
  
  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
  const userEmail = user?.email || '';

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const signOut = async () => {
    setDropdownOpen(false);
    await supabase.auth.signOut();
    notify('Signed out successfully');
    go('home');
  };

  return (
    <header>
      <button className="brand" onClick={() => go('home')}>
        <span>E</span>Evaluate
      </button>
      <nav>
        <button onClick={() => go(user ? 'dashboard' : 'auth')}>
          <LayoutDashboard size={17}/>Dashboard
        </button>

        {user ? (
          <>
            <button onClick={() => go('join')} style={{ marginRight: '8px' }}>
              <Search size={17}/>Join test
            </button>
            <button className="new-test" onClick={() => go('create')}>
              <Plus size={17}/>Create test
            </button>
            <div className="profile-menu-container" ref={menuRef}>
              <button 
                className="avatar-btn" 
                onClick={() => setDropdownOpen(!dropdownOpen)} 
                title="Account menu"
              >
                {userName[0].toUpperCase()}
              </button>

              {dropdownOpen && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    <strong>{userName}</strong>
                    <span>{userEmail}</span>
                  </div>
                  <button className="dropdown-item" onClick={() => { setDropdownOpen(false); go('dashboard'); }}>
                    <LayoutDashboard size={15}/> My Dashboard
                  </button>
                  <button className="dropdown-item" onClick={() => { setDropdownOpen(false); go('create'); }}>
                    <Plus size={15}/> Create New Test
                  </button>
                  <button className="dropdown-item" onClick={() => { setDropdownOpen(false); openEditModal(); }}>
                    <Edit3 size={15}/> Edit Display Name
                  </button>
                  <button className="dropdown-item" onClick={toggleTheme}>
                    {theme === 'dark' ? <Sun size={15}/> : <Moon size={15}/>} 
                    {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
                  </button>
                  <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />
                  <button className="dropdown-item danger" onClick={signOut}>
                    <LogOut size={15}/> Sign Out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => go('join')}><Search size={17}/>Join test</button>
            <button onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}
            </button>
            <button onClick={() => go('auth')}>Sign in</button>
            <button className="new-test" onClick={() => go('auth')}>Get started</button>
          </>
        )}
      </nav>
    </header>
  );
}

function EditProfileModal({ user, onSave, onClose }) {
  const [name, setName] = useState(user?.user_metadata?.name || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    onSave(name.trim());
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3>Edit Profile Name</h3>
        <p>Update how your name appears to students and test creators.</p>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'grid', gap: 7, fontSize: 13, fontWeight: 600 }}>
            Full Name
            <input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Your Name" 
              required 
              autoFocus
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Home({ user, go }) {
  const [code, setCode] = useState('');
  
  const handleJoinSubmit = (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    window.location.hash = `#join-${code.trim().toUpperCase()}`;
    go('join');
  };

  return (
    <section className="hero">
      <div className="eyebrow">ASSESSMENTS, SIMPLIFIED</div>
      <h1>Tests that feel<br/><i>effortless to run.</i></h1>
      <p>Evaluate lets you create polished MCQ assessments from a CSV, share an instant link, and track live results in one clean dashboard.</p>
      <div className="hero-actions">
        <button className="primary" onClick={() => go(user ? 'create' : 'auth')}>
          Create a test <ArrowRight size={18}/>
        </button>
        <button className="secondary" onClick={() => go('join')}>
          Join with a code
        </button>
      </div>
      <form className="join-strip" onSubmit={handleJoinSubmit}>
        <span>Have a test code?</span>
        <input 
          value={code} 
          onChange={e=>setCode(e.target.value.toUpperCase())} 
          placeholder="7KQ9" 
          maxLength="6"
        />
        <button type="submit">Continue <ChevronRight size={16}/></button>
      </form>
      <div className="hero-stats">
        <div><strong>CSV import</strong><span>Upload questions in seconds</span></div>
        <div><strong>Direct links</strong><span>One-click join for any student</span></div>
        <div><strong>Clear results</strong><span>Instant scoring & review</span></div>
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
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } }
        });
        if (error) throw error;
        if (!data.session) {
          throw new Error('Account created! Please check your email or verify login.');
        }
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
        <button className="back-btn" onClick={() => go('home')}>
          <ArrowLeft size={16}/> Back to Home
        </button>
        <div className="eyebrow">YOUR EVALUATE ACCOUNT</div>
        <h2>{isSignUp ? 'Start in one place.' : 'Welcome back.'}</h2>
        <p>Create tests, join tests, and keep all your scores together.</p>
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
  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
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
                <h3>{t?.title || 'Assessment'}</h3>
                <p>{t?.subject || 'General'} · {new Date(a.submittedAt).toLocaleDateString()}</p>
                <div className="card-foot">
                  <span>Score: {Math.round(a.score / a.total * 100)}%</span>
                  <button onClick={()=>go('result', a)}>Review answers <ArrowRight size={14}/></button>
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
  let status = 'LIVE';
  if (test.startAt && now < new Date(test.startAt)) status = 'SCHEDULED';
  if (test.endAt && now > new Date(test.endAt)) status = 'CLOSED';

  return (
    <div className="test-card" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="test-card-top">
        <span className={'tag ' + status.toLowerCase()}>{status}</span>
        <span className="code-badge" style={{ fontFamily: 'DM Mono', fontWeight: 600 }}>{test.code}</span>
      </div>
      <h3>{test.title}</h3>
      <p>{test.subject || 'Assessment'} · {test.questions.length} questions</p>
      <div className="card-foot">
        <span>{attempts.length} attempts</span>
        <button>Manage & Share <ArrowRight size={14}/></button>
      </div>
    </div>
  );
}

function CreateTest({ addTest, go }) {
  const [step, setStep] = useState(1);
  const [questions, setQuestions] = useState([]);
  const [meta, setMeta] = useState({
    title: '',
    subject: '',
    description: '',
    timerMode: 'none',
    timerValue: 30,
    attemptLimit: 1,
    startAt: '',
    endAt: ''
  });
  const [err, setErr] = useState('');

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = parseCsv(evt.target.result);
        setQuestions(parsed);
        setErr('');
        setStep(2);
      } catch (error) {
        setErr(error.message);
      }
    };
    reader.readAsText(file);
  };

  const loadSample = () => {
    const parsed = parseCsv(SAMPLE_CSV);
    setQuestions(parsed);
    setMeta(m => ({ ...m, title: 'Database Fundamentals Quiz', subject: 'Computer Science' }));
    setErr('');
    setStep(2);
  };

  const publish = () => {
    if (!meta.title || !questions.length) return;
    const test = { ...meta, id: uid(), code: uid().slice(0,4), questions };
    addTest(test);
  };

  return (
    <section className="app-shell narrow">
      <button className="back-btn" onClick={() => step > 1 ? setStep(s => s - 1) : go('dashboard')}>
        <ArrowLeft size={16}/> {step > 1 ? 'Back to previous step' : 'Back to Dashboard'}
      </button>

      <div className="steps">
        <span className={step===1?'on':''}>1. Upload questions</span>
        <span className={step===2?'on':''}>2. Test settings</span>
        <span className={step===3?'on':''}>3. Review & publish</span>
      </div>

      {step === 1 && (
        <div className="upload-panel panel">
          <FileUp size={44}/>
          <h3>Upload questions CSV</h3>
          <p>Download our format or drag-and-drop your prepared question bank.</p>
          <label className="upload-btn">
            Choose CSV file
            <input type="file" accept=".csv" onChange={onFile}/>
          </label>
          <button className="text-btn" onClick={loadSample}>Or try sample questions</button>
          {err && <div className="error"><XCircle size={17}/>{err}</div>}
        </div>
      )}

      {step === 2 && (
        <div className="form-panel">
          <h3>Test details & rules</h3>
          <label>Title
            <input value={meta.title} onChange={e=>setMeta({...meta, title:e.target.value})} placeholder="e.g. Midterm Assessment" required/>
          </label>
          <label>Subject (optional)
            <input value={meta.subject} onChange={e=>setMeta({...meta, subject:e.target.value})} placeholder="e.g. Physics / Chapter 4"/>
          </label>
          <label>Instructions (optional)
            <textarea value={meta.description} onChange={e=>setMeta({...meta, description:e.target.value})} placeholder="Guidelines for students..."/>
          </label>

          <div className="rule-block">
            <h3><Timer size={18}/> Timer mode</h3>
            <p>Choose whether students have a total time limit or time per question.</p>
            <div className="choice-row">
              <button type="button" className={meta.timerMode==='none'?'selected':''} onClick={()=>setMeta({...meta, timerMode:'none'})}>No limit</button>
              <button type="button" className={meta.timerMode==='total'?'selected':''} onClick={()=>setMeta({...meta, timerMode:'total', timerValue: 30})}>Total timer</button>
              <button type="button" className={meta.timerMode==='question'?'selected':''} onClick={()=>setMeta({...meta, timerMode:'question', timerValue: 45})}>Per question</button>
            </div>
            {meta.timerMode !== 'none' && (
              <label className="inline-field">
                {meta.timerMode==='total' ? 'Duration (minutes)' : 'Seconds per question'}
                <input type="number" min="1" value={meta.timerValue} onChange={e=>setMeta({...meta, timerValue:e.target.value})}/>
              </label>
            )}
          </div>

          <div className="rule-block">
            <h3><Users size={18}/> Attempt limits</h3>
            <label className="inline-field">
              Allowed attempts per student
              <input type="number" min="1" max="10" value={meta.attemptLimit} onChange={e=>setMeta({...meta, attemptLimit:e.target.value})}/>
            </label>
          </div>

          <div className="form-actions">
            <button className="secondary" onClick={()=>setStep(1)}>Back</button>
            <button className="primary" disabled={!meta.title.trim()} onClick={()=>setStep(3)}>Continue to review <ArrowRight size={17}/></button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="review-panel">
          <div className="review-summary">
            <div>
              <div className="eyebrow">READY TO PUBLISH</div>
              <h2>{meta.title}</h2>
              <p>{questions.length} questions · {meta.timerMode==='none'?'No timer':meta.timerMode==='total'?`${meta.timerValue} min total`:`${meta.timerValue}s per question`} · {meta.attemptLimit} attempt limit</p>
            </div>
            <CheckCircle2 size={34}/>
          </div>
          <div className="question-preview">
            {questions.map((q, i) => (
              <div key={q.id}>
                <span>QUESTION {i+1}</span>
                <p><strong>{q.question}</strong></p>
                <small>Answer: Option {q.correct}</small>
              </div>
            ))}
          </div>
          <div className="form-actions" style={{ padding: 20 }}>
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
  const link = `${window.location.origin}/#join-${activeTest.code}`;
  const attemptCount = attempts.filter(a => a.testId === activeTest.id).length;

  return (
    <section className="app-shell narrow">
      <button className="back-btn" onClick={() => go('dashboard')}>
        <ArrowLeft size={16}/> Back to Dashboard
      </button>

      <div className="success-icon"><Check size={34}/></div>
      <div className="center">
        <div className="eyebrow">TEST PUBLISHED</div>
        <h2>{activeTest.title} is ready to share.</h2>
        <p>Students can join instantly using your link or 4-digit code.</p>
      </div>
      <div className="share-card">
        <label>Direct shareable link
          <div className="copy-line">
            <code>{link}</code>
            <button onClick={()=>{navigator.clipboard?.writeText(link);notify('Direct link copied!');}}><Copy size={17}/></button>
          </div>
        </label>
        <div className="or">OR</div>
        <label>Join code
          <div className="code-box">
            {activeTest.code}
            <button onClick={()=>{navigator.clipboard?.writeText(activeTest.code);notify('Code copied!');}}><Copy size={17}/></button>
          </div>
        </label>
      </div>
      <div className="share-actions">
        <button className="secondary" onClick={()=>go('dashboard')}>View dashboard</button>
        <button className="primary" onClick={()=>{ window.location.hash = `#join-${activeTest.code}`; go('join'); }}>
          Preview join flow <ArrowRight size={17}/>
        </button>
      </div>
      {attemptCount > 0 && <div className="muted center" style={{ marginTop: 15 }}>{attemptCount} submitted attempt(s)</div>}
    </section>
  );
}

function Join({ user, attempts, go, initialJoinCode }) {
  const [code, setCode] = useState(() => initialJoinCode || extractJoinCode() || '');
  const [found, setFound] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchTest = async (testCode) => {
    if (!testCode.trim()) return;
    setErr('');
    setLoading(true);
    try {
      const { data, error } = await supabase.from('tests').select('*, questions(id, question, option_a, option_b, option_c, option_d)').eq('code', testCode.trim().toUpperCase()).single();
      if (error || !data) {
        setErr('We could not find an active test with that code.');
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

  // Automatically lookup if code is provided via URL
  useEffect(() => {
    const activeCode = initialJoinCode || extractJoinCode();
    if (activeCode) {
      setCode(activeCode);
      fetchTest(activeCode);
    }
  }, [initialJoinCode]);

  const lookup = async e => {
    e?.preventDefault();
    fetchTest(code);
  };

  const join = async () => {
    if (!user) { go('auth'); return; }
    
    // Check previous attempts from DB
    const { data: userAttempts } = await supabase.from('attempts').select('id').eq('test_id', found.id).eq('user_id', user.id);
    const count = userAttempts ? userAttempts.length : 0;
    if (count >= Number(found.attemptLimit)) {
      setErr(`You have used all allowed attempts (${found.attemptLimit}) for this test.`);
      return;
    }

    const now = Date.now();
    if (found.startAt && now < new Date(found.startAt)) {
      setErr(`This test opens on ${new Date(found.startAt).toLocaleString()}.`);
      return;
    }
    if (found.endAt && now > new Date(found.endAt)) {
      setErr('This test has concluded.');
      return;
    }
    go('attempt', found);
  };

  return (
    <section className="join-page">
      <div className="join-card">
        <button className="back-btn" onClick={() => go('home')}>
          <ArrowLeft size={16}/> Back to Home
        </button>
        <div className="eyebrow">JOIN A TEST</div>
        <h2>Enter your code</h2>
        <p>Enter the 4-character test code or use your direct invite link.</p>
        <form onSubmit={lookup}>
          <input 
            className="code-input" 
            value={code} 
            onChange={e=>setCode(e.target.value.toUpperCase())} 
            placeholder="7KQ9" 
            maxLength="6" 
            autoFocus
          />
          <button className="primary full" disabled={loading}>
            {loading ? 'Searching...' : 'Find test'} <ArrowRight size={17}/>
          </button>
        </form>
        {err && <div className="error"><XCircle size={17}/>{err}</div>}
        {found && (
          <div className="found">
            <span className="tag live">READY</span>
            <h3>{found.title}</h3>
            <p>{found.subject || 'Assessment'} · {found.questions.length} questions</p>
            <div className="facts">
              <span><Clock3 size={15}/>{found.timerMode === 'none' ? 'No time limit' : found.timerMode === 'total' ? `${found.timerValue} min total` : `${found.timerValue}s / question`}</span>
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
  const [marked, setMarked] = useState({});
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
  const toggleMark = () => setMarked(m => ({ ...m, [q.id]: !m[q.id] }));
  const clearSelection = () => setAnswers(a => { const newA = { ...a }; delete newA[q.id]; return newA; });

  const submit = async () => {
    if (submitted) return;
    setSubmitted(true);
    
    // Securely fetch correct answers at the time of submission
    const { data: answersData } = await supabase
      .from('questions')
      .select('id, correct_option, explanation')
      .eq('test_id', activeTest.id);
      
    const fullQuestions = activeTest.questions.map(q => {
      const match = answersData?.find(ans => ans.id === q.id);
      return { ...q, correct: match?.correct_option, explanation: match?.explanation };
    });

    const score = fullQuestions.reduce((n, x) => n + (answers[x.id] === x.correct ? 1 : 0), 0);
    const a = {
      id: uid(),
      testId: activeTest.id,
      userId: user?.id,
      answers,
      score,
      total: activeTest.questions.length,
      submittedAt: new Date().toISOString()
    };
    saveAttempt(a);
    go('result', { ...a, test: { ...activeTest, questions: fullQuestions } });
  };

  const min = Math.floor(seconds / 60), sec = String(seconds % 60).padStart(2, '0');
  const isPerQuestion = activeTest.timerMode === 'question';

  return (
    <section className="attempt-shell">
      <div className="attempt-top">
        <button className="brand mini"><span>E</span>Evaluate</button>
        <div className="progress">
          <span>Question {idx+1} of {activeTest.questions.length}</span>
          <div><i style={{ width: `${((idx+1)/activeTest.questions.length)*100}%` }}/></div>
        </div>
        {activeTest.timerMode !== 'none' && <div className="timer"><Timer size={17}/>{min}:{sec}</div>}
      </div>
      <div className="attempt-body">
        <aside>
          {activeTest.questions.map((x, i) => (
            <button 
              key={x.id} 
              className={(i===idx?'current ':'')+(answers[x.id]?'answered ':'')+(marked[x.id]?'marked':'')} 
              disabled={isPerQuestion && i < idx} 
              onClick={() => { if (!isPerQuestion || i >= idx) setIdx(i); }}
            >
              {i+1}
            </button>
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
            {!isPerQuestion && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="secondary" disabled={idx === 0} onClick={() => setIdx(i => i - 1)}><ArrowLeft size={17}/>Previous</button>
                <button className={`secondary ${marked[q.id] ? 'marked-btn' : ''}`} onClick={toggleMark}>
                  {marked[q.id] ? 'Unmark' : 'Mark for Review'}
                </button>
                {answers[q.id] && <button className="secondary" onClick={clearSelection}>Clear</button>}
              </div>
            )}
            {isPerQuestion && <span/>}
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
      <button className="back-btn" onClick={() => go('dashboard')}>
        <ArrowLeft size={16}/> Back to Dashboard
      </button>
      <div className="result-hero">
        <div className="eyebrow">TEST COMPLETED</div>
        <h2>{test.title}</h2>
        <div className="big-score">{attempt.score}<span>/{attempt.total}</span></div>
        <p>{Math.round(attempt.score / attempt.total * 100)}% score · Review answers below</p>
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
                    <div className={`review-option ${state}`} key={letter}>
                      <b>{letter}</b><span>{option}</span>
                      {selected && correct && <Check size={18} className="status-icon correct-icon" />}
                      {selected && !correct && <XCircle size={18} className="status-icon wrong-icon" />}
                      {!selected && isCorrect && <Check size={18} className="status-icon correct-icon" />}
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

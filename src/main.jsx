import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  CheckCircle2, 
  CircleDashed,
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
  ChevronUp,
  RotateCcw,
  ExternalLink,
  Ban
} from 'lucide-react';
import { supabase } from './supabaseClient';
import './styles.css';

const SAMPLE_CSV = `question,option_a,option_b,option_c,option_d,correct_option,explanation
"Which normal form removes partial dependency?","1NF","2NF","3NF","BCNF","B","Partial dependencies are removed in 2NF."
"Which SQL command removes a table definition?","DELETE","DROP","TRUNCATE","REMOVE","B","DROP removes a table definition."`;

const uid = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const toDatetimeLocal = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const ten = (i) => (i < 10 ? '0' : '') + i;
  const YYYY = date.getFullYear();
  const MM = ten(date.getMonth() + 1);
  const DD = ten(date.getDate());
  const HH = ten(date.getHours());
  const MIN = ten(date.getMinutes());
  return `${YYYY}-${MM}-${DD}T${HH}:${MIN}`;
};

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
  const [hostedAttempts, setHostedAttempts] = useState([]);
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
    } else {
      const hash = window.location.hash.replace('#', '');
      if (hash && ['dashboard', 'create', 'auth'].includes(hash)) {
        setPage(hash);
      }
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
          feedbackMode: t.feedback_mode || 'end',
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
        // Sort newest tests first (descending by created_at)
        formattedTests.sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0));
        setTests(formattedTests);

        // Fetch Attempts for Hosted Tests
        const hostedTestIds = formattedTests.map(t => t.id);
        if (hostedTestIds.length > 0) {
          const { data: hAttempts } = await supabase.from('attempts').select('*').in('test_id', hostedTestIds);
          if (hAttempts) {
            hAttempts.sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
            setHostedAttempts(hAttempts);
          }
        } else {
          setHostedAttempts([]);
        }
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
            feedbackMode: a.tests.feedback_mode || 'end',
            startAt: a.tests.start_at,
            endAt: a.tests.end_at,
            attemptLimit: a.tests.attempt_limit,
            questions: (a.tests.questions || []).map(q => ({
              id: q.id,
              question: q.question,
              options: [q.option_a, q.option_b, q.option_c, q.option_d],
              correct: q.correct_option,
              explanation: q.explanation
            }))
          } : null
        }));
        // Sort attempts newest first
        formattedAttempts.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
        setAttempts(formattedAttempts);
      }
    } catch (err) {
      console.error('Data fetch error:', err);
    }
  };

  useEffect(() => {
    if (user) fetchData();
    else { setTests([]); setAttempts([]); setHostedAttempts([]); }
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
        feedback_mode: test.feedbackMode || 'end',
        start_at: test.startAt || null,
        end_at: test.endAt || null,
        attempt_limit: parseInt(test.attemptLimit) || 1,
        host_name: user?.user_metadata?.name || user?.email?.split('@')[0] || 'Host'
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

  const updateTest = async (testId, updates) => {
    try {
      const { error } = await supabase.from('tests').update(updates).eq('id', testId);
      if (error) throw error;
      notify('Test updated successfully!');
      await fetchData();
      if (activeTest && activeTest.id === testId) {
        setActiveTest(prev => ({
          ...prev,
          ...updates,
          timerMode: updates.timer_mode !== undefined ? updates.timer_mode : prev.timerMode,
          timerValue: updates.timer_value !== undefined ? updates.timer_value : prev.timerValue,
          feedbackMode: updates.feedback_mode !== undefined ? updates.feedback_mode : prev.feedbackMode,
          startAt: updates.start_at !== undefined ? updates.start_at : prev.startAt,
          endAt: updates.end_at !== undefined ? updates.end_at : prev.endAt,
          attemptLimit: updates.attempt_limit !== undefined ? updates.attempt_limit : prev.attemptLimit,
          code: updates.code !== undefined ? updates.code : prev.code,
          title: updates.title !== undefined ? updates.title : prev.title,
          subject: updates.subject !== undefined ? updates.subject : prev.subject,
          description: updates.description !== undefined ? updates.description : prev.description
        }));
      }
    } catch (err) {
      notify('Error updating test: ' + err.message);
    }
  };

  const saveAttempt = async (attempt) => {
    try {
      const { error } = await supabase.from('attempts').insert({
        id: attempt.id,
        test_id: attempt.testId,
        user_id: user?.id,
        user_name: user?.user_metadata?.name || user?.email?.split('@')[0] || 'Unknown',
        user_email: user?.email || '',
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
    hostedAttempts,
    go, 
    addTest, 
    updateTest,
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

function Dashboard({ user, tests, attempts, hostedAttempts, go }) {
  const [tab, setTab] = useState('hosted');
  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';

  // Group user attempts by testId for Joined Tests tab
  const joinedTestGroups = useMemo(() => {
    const groups = {};
    attempts.forEach(a => {
      if (!a.testId) return;
      if (!groups[a.testId]) {
        groups[a.testId] = {
          testId: a.testId,
          test: a.test,
          attempts: []
        };
      }
      groups[a.testId].attempts.push(a);
    });
    return Object.values(groups).sort((a, b) => {
      const highestScoreA = Math.max(...a.attempts.map(att => att.score || 0));
      const highestScoreB = Math.max(...b.attempts.map(att => att.score || 0));
      
      if (highestScoreB !== highestScoreA) {
        return highestScoreB - highestScoreA;
      }

      const dateA = new Date(a.attempts[0]?.submittedAt || 0);
      const dateB = new Date(b.attempts[0]?.submittedAt || 0);
      return dateB - dateA;
    });
  }, [attempts]);

  const cardsCount = tab === 'hosted' ? tests.length : joinedTestGroups.length;

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
        <button className={tab==='joined'?'active':''} onClick={()=>setTab('joined')}>My joined tests <b>{joinedTestGroups.length}</b></button>
      </div>
      {cardsCount === 0 ? (
        <div className="empty">
          <FileUp size={34}/>
          <h3>{tab === 'hosted' ? 'Create your first test' : 'No joined tests yet'}</h3>
          <p>{tab === 'hosted' ? 'Upload a CSV and share your test in minutes.' : 'Use a test code shared by your teacher or friend.'}</p>
          <button className="secondary" onClick={()=>go(tab==='hosted'?'create':'join')}>{tab==='hosted'?'Create test':'Join a test'}</button>
        </div>
      ) : (
        <div className="test-grid">
          {tab === 'hosted' ? tests.map(t => (
            <TestCard key={t.id} test={t} attempts={hostedAttempts.filter(a=>a.test_id===t.id)} onClick={()=>go('share',t)}/>
          )) : joinedTestGroups.map(group => (
            <JoinedTestCard key={group.testId} group={group} go={go} />
          ))}
        </div>
      )}
    </section>
  );
}

function JoinedTestCard({ group, go }) {
  const [showHistory, setShowHistory] = useState(false);
  const test = group.test;
  const attemptsList = group.attempts; // sorted newest first
  const bestScoreAttempt = attemptsList.reduce((max, curr) => (curr.score > (max?.score || 0) ? curr : max), attemptsList[0]);
  const highestScore = bestScoreAttempt ? bestScoreAttempt.score : 0;
  const totalQuestions = bestScoreAttempt ? bestScoreAttempt.total : 0;
  const attemptLimit = Number(test?.attemptLimit) || 1;
  const now = Date.now();
  const isClosed = test?.endAt && now > new Date(test.endAt);
  const canReattempt = !isClosed && attemptsList.length < attemptLimit;

  return (
    <div className="test-card">
      <div className="test-card-top">
        <span className="tag">JOINED</span>
        <span className="score" style={{ color: 'var(--brand-primary)', fontSize: '15px' }}>
          Best: {highestScore}/{totalQuestions}
        </span>
      </div>
      <h3>{test?.title || 'Assessment'}</h3>
      <p>by {test?.host_name || 'Host'} · {test?.subject || 'General'} · {new Date(attemptsList[0]?.submittedAt).toLocaleDateString()}</p>
      
      <div style={{ margin: '12px 0 6px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
        <span>{attemptsList.length} of {attemptLimit} attempt(s) used</span>
      </div>

      <div className="card-foot" style={{ marginTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
        {canReattempt ? (
          <button className="primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => go('attempt', test)}>
            <RotateCcw size={14} /> Re-attempt Test
          </button>
        ) : (
          <button className="secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => go('result', attemptsList[0])}>
            Review latest <ArrowRight size={14}/>
          </button>
        )}

        {attemptsList.length > 1 && (
          <button className="history-toggle-btn" onClick={() => setShowHistory(!showHistory)}>
            History ({attemptsList.length}) {showHistory ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          </button>
        )}
      </div>

      {showHistory && (
        <div className="history-list">
          {attemptsList.map((att, idx) => (
            <div key={att.id} className="history-item">
              <div>
                <strong>Attempt #{attemptsList.length - idx}</strong>: {att.score}/{att.total}
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {new Date(att.submittedAt).toLocaleString()}
                </span>
              </div>
              <button className="secondary" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => go('result', att)}>
                Review
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
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
    feedbackMode: 'end',
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
            <h3><CheckCircle2 size={18}/> Answer Feedback</h3>
            <p>Choose when students get to see the correct answer and explanations.</p>
            <div className="choice-row">
              <button type="button" className={meta.feedbackMode==='end'?'selected':''} onClick={()=>setMeta({...meta, feedbackMode:'end'})}>Show at end</button>
              <button type="button" className={meta.feedbackMode==='instant'?'selected':''} onClick={()=>setMeta({...meta, feedbackMode:'instant'})}>Instant feedback</button>
            </div>
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

function SharePage({ activeTest, go, notify, hostedAttempts, updateTest }) {
  const [showEditModal, setShowEditModal] = useState(false);
  if (!activeTest) return null;

  const now = Date.now();
  let status = 'LIVE';
  if (activeTest.startAt && now < new Date(activeTest.startAt)) status = 'SCHEDULED';
  if (activeTest.endAt && now > new Date(activeTest.endAt)) status = 'CLOSED';

  const link = `${window.location.origin}/#join-${activeTest.code}`;
  const testAttempts = (hostedAttempts || []).filter(a => a.test_id === activeTest.id);

  const handleTerminate = async () => {
    if (window.confirm("Are you sure you want to terminate this quiz immediately? This will close access and free up the join code for reuse.")) {
      const originalCode = activeTest.code;
      const uniqueSuffix = `_ended_${Math.random().toString(36).slice(2, 6)}`;
      await updateTest(activeTest.id, {
        end_at: new Date().toISOString(),
        code: `${originalCode}${uniqueSuffix}`
      });
      notify("Quiz terminated successfully!");
    }
  };

  return (
    <section className="app-shell narrow">
      <button className="back-btn" onClick={() => go('dashboard')}>
        <ArrowLeft size={16}/> Back to Dashboard
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
        <span className={`tag ${status.toLowerCase()}`}>{status}</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="secondary mini-btn" onClick={() => setShowEditModal(true)}>
            Edit Parameters
          </button>
          {status !== 'CLOSED' && (
            <button className="secondary danger mini-btn" onClick={handleTerminate}>
              <Ban size={14} style={{ marginRight: '4px' }}/> Terminate Quiz
            </button>
          )}
        </div>
      </div>

      <div className="center" style={{ marginTop: '20px' }}>
        <div className="eyebrow">TEST MANAGEMENT</div>
        <h2>{activeTest.title}</h2>
        <p>{activeTest.subject || 'General Assessment'} · {activeTest.questions?.length || 0} questions</p>
      </div>

      {status !== 'CLOSED' ? (
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
      ) : (
        <div className="share-card" style={{ background: 'var(--surface)', borderStyle: 'dashed', textAlign: 'center', padding: '30px' }}>
          <Ban size={30} style={{ color: 'var(--text-muted)', marginBottom: '8px' }}/>
          <h4 style={{ margin: '0 0 4px 0' }}>Quiz has concluded</h4>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>This test code and join link are no longer active.</p>
        </div>
      )}

      {/* Student Results List */}
      <div style={{ marginTop: '40px' }}>
        <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>
          Student Attempts ({testAttempts.length})
        </h3>
        {testAttempts.length === 0 ? (
          <div className="empty" style={{ padding: '30px 15px', minHeight: 'auto' }}>
            <p>No student attempts recorded yet.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {testAttempts.map(a => (
              <div key={a.id} style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: 'var(--shadow)'
              }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '15px' }}>{a.user_name}</strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {a.user_email} · {new Date(a.submitted_at).toLocaleString()}
                  </span>
                </div>
                <div style={{
                  fontSize: '18px',
                  fontWeight: '700',
                  color: 'var(--brand-primary)',
                  background: 'var(--brand-light)',
                  padding: '4px 12px',
                  borderRadius: '6px'
                }}>
                  {a.score}/{a.total}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEditModal && (
        <EditTestModal 
          test={activeTest} 
          onSave={async (updates) => {
            await updateTest(activeTest.id, updates);
            setShowEditModal(false);
          }}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </section>
  );
}

function EditTestModal({ test, onSave, onClose }) {
  const [title, setTitle] = useState(test.title || '');
  const [subject, setSubject] = useState(test.subject || '');
  const [description, setDescription] = useState(test.description || '');
  const [timerMode, setTimerMode] = useState(test.timerMode || 'none');
  const [timerValue, setTimerValue] = useState(test.timerValue || 30);
  const [feedbackMode, setFeedbackMode] = useState(test.feedbackMode || 'end');
  const [attemptLimit, setAttemptLimit] = useState(test.attemptLimit || 1);
  const [startAt, setStartAt] = useState(() => toDatetimeLocal(test.startAt));
  const [endAt, setEndAt] = useState(() => toDatetimeLocal(test.endAt));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await onSave({
      title: title.trim(),
      subject: subject.trim(),
      description: description.trim(),
      timer_mode: timerMode,
      timer_value: timerMode !== 'none' ? parseInt(timerValue) : null,
      feedback_mode: feedbackMode,
      attempt_limit: parseInt(attemptLimit) || 1,
      start_at: startAt ? new Date(startAt).toISOString() : null,
      end_at: endAt ? new Date(endAt).toISOString() : null
    });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', width: '90%' }}>
        <h3>Edit Quiz Parameters</h3>
        <p>Updates will be applied instantly to active attempts.</p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '15px' }}>
          <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Title
            <input value={title} onChange={e => setTitle(e.target.value)} required />
          </label>
          <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Subject (optional)
            <input value={subject} onChange={e => setSubject(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Instructions (optional)
            <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ height: '60px' }} />
          </label>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
              Timer Mode
              <select value={timerMode} onChange={e => setTimerMode(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--input-bg)', color: 'var(--text-main)' }}>
                <option value="none">No limit</option>
                <option value="total">Total timer</option>
                <option value="question">Per question</option>
              </select>
            </label>
            {timerMode !== 'none' && (
              <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
                {timerMode === 'total' ? 'Duration (mins)' : 'Seconds / Question'}
                <input type="number" min="1" value={timerValue} onChange={e => setTimerValue(e.target.value)} required />
              </label>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
              Attempt Limit
              <input type="number" min="1" max="10" value={attemptLimit} onChange={e => setAttemptLimit(e.target.value)} required />
            </label>
            <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
              Answer Feedback
              <select value={feedbackMode} onChange={e => setFeedbackMode(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--input-bg)', color: 'var(--text-main)' }}>
                <option value="end">Show at end</option>
                <option value="instant">Instant feedback</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
              Start Time (optional)
              <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
              End Time (optional)
              <input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} />
            </label>
          </div>

          <div className="modal-actions" style={{ marginTop: '10px' }}>
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
            <p>by {found.host_name || 'Unknown'} · {found.subject || 'Assessment'} · {found.questions.length} questions</p>
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
  const [localTimerValue, setLocalTimerValue] = useState(activeTest?.timerValue);
  const [submitted, setSubmitted] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [questionsWithAnswers, setQuestionsWithAnswers] = useState(activeTest?.questions || []);

  const isInstant = activeTest?.feedbackMode === 'instant' || activeTest?.feedback_mode === 'instant';

  // Fetch correct answers upfront if instant feedback is enabled
  useEffect(() => {
    if (activeTest && isInstant) {
      const hasAnswers = activeTest.questions?.some(q => q.correct);
      if (!hasAnswers) {
        supabase.from('questions').select('id, correct_option, explanation').eq('test_id', activeTest.id).then(({ data }) => {
          if (data) {
            setQuestionsWithAnswers(activeTest.questions.map(q => {
              const match = data.find(ans => ans.id === q.id);
              return { ...q, correct: match?.correct_option, explanation: match?.explanation };
            }));
          }
        });
      } else {
        setQuestionsWithAnswers(activeTest.questions);
      }
    } else if (activeTest) {
      setQuestionsWithAnswers(activeTest.questions);
    }
  }, [activeTest, isInstant]);

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    if (!activeTest || activeTest.timerMode === 'none' || submitted) return;
    const id = setInterval(() => setSeconds(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(id);
  }, [activeTest, submitted]);

  useEffect(() => {
    if (seconds === 0 && activeTest?.timerMode !== 'none') {
      if (activeTest.timerMode === 'total') submit(true);
      else if (idx < questionsWithAnswers.length - 1) {
        setIdx(x => x + 1);
        setSeconds(Number(activeTest.timerValue));
      } else submit(true);
    }
  }, [seconds]);

  // Poll for live parameter updates (Termination & Timer Extension)
  useEffect(() => {
    if (!activeTest || submitted) return;
    const pollId = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('tests')
          .select('end_at, timer_value, timer_mode')
          .eq('id', activeTest.id)
          .single();
        if (error || !data) return;

        // 1. Force termination if end_at is reached or set to past
        const now = new Date();
        if (data.end_at && now > new Date(data.end_at)) {
          clearInterval(pollId);
          alert('This test has been terminated by the host.');
          submit(true);
          return;
        }

        // 2. Timer extension update (for total timer)
        if (data.timer_mode === 'total' && data.timer_value !== localTimerValue) {
          const diffInSeconds = (Number(data.timer_value) - Number(localTimerValue)) * 60;
          setSeconds(s => Math.max(0, s + diffInSeconds));
          setLocalTimerValue(data.timer_value);
        }
      } catch (err) {
        console.error('Error fetching live updates:', err);
      }
    }, 5000);
    return () => clearInterval(pollId);
  }, [activeTest, submitted, localTimerValue]);

  if (!activeTest || questionsWithAnswers.length === 0) return null;
  const q = questionsWithAnswers[idx] || questionsWithAnswers[0];
  const select = (opt) => {
    if (isInstant && answers[q.id]) return;
    setAnswers(a => ({...a, [q.id]: opt}));
  };
  const toggleMark = () => setMarked(m => ({ ...m, [q.id]: !m[q.id] }));
  const clearSelection = () => setAnswers(a => { const newA = { ...a }; delete newA[q.id]; return newA; });

  const submit = async (force = false) => {
    if (submitted) return;
    
    if (!force) {
      setShowSubmitConfirm(true);
      return;
    }

    setSubmitted(true);
    
    // Fetch correct answers at submission time if not already available
    let fullQuestions = questionsWithAnswers;
    if (!fullQuestions.some(x => x.correct)) {
      const { data: answersData } = await supabase
        .from('questions')
        .select('id, correct_option, explanation')
        .eq('test_id', activeTest.id);
        
      fullQuestions = activeTest.questions.map(q => {
        const match = answersData?.find(ans => ans.id === q.id);
        return { ...q, correct: match?.correct_option, explanation: match?.explanation };
      });
    }

    const score = fullQuestions.reduce((n, x) => n + (answersRef.current[x.id] === x.correct ? 1 : 0), 0);
    const a = {
      id: uid(),
      testId: activeTest.id,
      userId: user?.id,
      answers: answersRef.current,
      score,
      total: fullQuestions.length,
      submittedAt: new Date().toISOString()
    };
    saveAttempt(a);
    go('result', { ...a, test: { ...activeTest, questions: fullQuestions } });
  };

  const min = Math.floor(seconds / 60), sec = String(seconds % 60).padStart(2, '0');
  const isPerQuestion = activeTest.timerMode === 'question';
  const selectedAnswer = answers[q.id];

  return (
    <section className="attempt-shell">
      {showSubmitConfirm && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h3 style={{ marginTop: 0 }}>Confirm Submission</h3>
            <p style={{ margin: '15px 0' }}>Are you sure you want to submit your test?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', textAlign: 'left', background: 'var(--card-bg)', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--border-subtle)' }}>
              <div><b style={{color: 'var(--text-main)'}}>Answered:</b> {Object.keys(answersRef.current).length}</div>
              <div><b style={{color: 'var(--text-main)'}}>Unanswered:</b> {questionsWithAnswers.length - Object.keys(answersRef.current).length}</div>
              <div style={{ gridColumn: '1 / -1' }}><b style={{color: 'var(--text-main)'}}>Marked for Review:</b> {Object.values(marked).filter(Boolean).length}</div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button className="secondary" onClick={() => setShowSubmitConfirm(false)}>Cancel</button>
              <button className="primary" onClick={() => { setShowSubmitConfirm(false); submit(true); }}>Yes, Submit</button>
            </div>
          </div>
        </div>
      )}
      <div className="attempt-top">
        <button className="brand mini"><span>E</span>Evaluate</button>
        <div className="progress">
          <span>Question {idx+1} of {questionsWithAnswers.length}</span>
          <div><i style={{ width: `${((idx+1)/questionsWithAnswers.length)*100}%` }}/></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {activeTest.timerMode !== 'none' && <div className="timer"><Timer size={17}/>{min}:{sec}</div>}
          <button className="secondary danger mini-btn" onClick={() => submit(false)} style={{ padding: '6px 12px', fontSize: '13px' }}>Submit Early</button>
        </div>
      </div>
      <div className="attempt-body">
        <aside style={{ display: 'grid', gridTemplateColumns: questionsWithAnswers.length < 50 ? 'repeat(5, 1fr)' : 'repeat(10, 1fr)', gap: '6px', alignContent: 'start' }}>
          {questionsWithAnswers.map((x, i) => (
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
              const isSelected = selectedAnswer === letter;
              const hasAnsweredInstant = isInstant && selectedAnswer;
              const isCorrectOption = letter === q.correct;
              
              let optClass = isSelected ? 'chosen' : '';
              if (hasAnsweredInstant) {
                if (isSelected && isCorrectOption) optClass = 'chosen instant-correct';
                else if (isSelected && !isCorrectOption) optClass = 'chosen instant-wrong';
                else if (!isSelected && isCorrectOption) optClass = 'instant-correct';
              }

              return (
                <button key={letter} className={optClass} onClick={() => select(letter)}>
                  <b>{letter}</b>
                  <span style={{ flex: 1 }}>{o}</span>
                  {hasAnsweredInstant && isCorrectOption && <CheckCircle2 size={18} className="status-icon correct-icon"/>}
                  {hasAnsweredInstant && isSelected && !isCorrectOption && <XCircle size={18} className="status-icon wrong-icon"/>}
                </button>
              );
            })}
          </div>

          {isInstant && selectedAnswer && q.explanation && (
            <div className="explanation" style={{ marginTop: '16px' }}>
              <b>Explanation</b>
              {q.explanation}
            </div>
          )}

          <div className="question-actions">
            {!isPerQuestion && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button className="secondary" disabled={idx === 0} onClick={() => setIdx(i => i - 1)}><ArrowLeft size={17}/>Previous</button>
                <button className={`secondary ${marked[q.id] ? 'marked-btn' : ''}`} onClick={toggleMark}>
                  {marked[q.id] ? 'Unmark' : 'Mark for Review'}
                </button>
                {answers[q.id] && !isInstant && <button className="secondary" onClick={clearSelection}>Clear</button>}
              </div>
            )}
            {isPerQuestion && <span/>}
            {idx === questionsWithAnswers.length - 1 ? (
              <button className="primary" onClick={() => submit(false)}>Submit test <Check size={17}/></button>
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
          const statusText = correct ? 'Correct' : (!answer ? 'Unanswered' : 'Incorrect');
          const statusClass = correct ? 'correct' : (!answer ? 'unanswered' : 'wrong');
          return (
            <div className={`review-item ${statusClass}`} key={q.id}>
              <div className="review-head">
                {correct ? <CheckCircle2/> : (!answer ? <CircleDashed/> : <XCircle/>)}
                <span>QUESTION {i+1}</span>
                <b>{statusText}</b>
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

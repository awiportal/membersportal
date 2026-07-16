'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState<{ t: string; kind: 'bad' | 'good' } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ t: error.message, kind: 'bad' });
      else {
        router.push('/dashboard');
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, phone } },
      });
      if (error) setMsg({ t: error.message, kind: 'bad' });
      else if (data.session) {
        router.push('/dashboard');
        router.refresh();
      } else {
        setMsg({ t: 'Account created. Check your email to confirm, then sign in.', kind: 'good' });
        setMode('login');
      }
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr' }} className="lg:grid-cols-2">
      <div className="grad-hero" style={{ position: 'relative', padding: 48, display: 'none', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="grad-lime" style={{ width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center', color: '#20260a', fontWeight: 900, fontSize: 19 }}>A</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>AWIVEST</div>
            <div className="muted" style={{ fontSize: 12 }}>African Women Investors</div>
          </div>
        </div>
        <div>
          <h1 style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.08, letterSpacing: '-1px' }}>
            Wealth, built<br />
            <span className="grad-text">together.</span>
          </h1>
          <p className="muted" style={{ maxWidth: 420, marginTop: 18, fontSize: 15, lineHeight: 1.6 }}>
            Track your portfolio, build your financial profile, set goals and grow your wealth across East Africa&apos;s markets.
          </p>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>Karen Plains Arcade, Nairobi</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="card card-pad" style={{ width: '100%', maxWidth: 420, padding: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
            <div className="grad-lime" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', color: '#20260a', fontWeight: 900 }}>A</div>
            <div style={{ fontWeight: 800 }}>AWIVEST Investor Portal</div>
          </div>

          <div className="tabs" style={{ marginBottom: 22 }}>
            <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')} type="button">Login</button>
            <button className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')} type="button">Register</button>
          </div>

          <form onSubmit={submit}>
            {mode === 'register' && (
              <>
                <div className="field"><label>Full name</label>
                  <div className="input-group"><i className="fa-solid fa-id-card" /><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Wanjiru" required /></div>
                </div>
                <div className="field"><label>Phone</label>
                  <div className="input-group"><i className="fa-solid fa-phone" /><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 7XX XXX XXX" /></div>
                </div>
              </>
            )}
            <div className="field"><label>Email</label>
              <div className="input-group"><i className="fa-solid fa-envelope" /><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required autoComplete="email" /></div>
            </div>
            <div className="field"><label>Password</label>
              <div className="input-group"><i className="fa-solid fa-lock" /><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters" required minLength={8} /></div>
            </div>

            {msg && (
              <div className={`badge badge-${msg.kind}`} style={{ marginBottom: 14, width: '100%', justifyContent: 'flex-start' }}>
                <i className={`fa-solid ${msg.kind === 'bad' ? 'fa-circle-exclamation' : 'fa-circle-check'}`} /> {msg.t}
              </div>
            )}

            <button className={`btn ${mode === 'login' ? 'btn-primary' : 'btn-lime'} btn-block`} type="submit" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in to portal' : 'Create account'}
            </button>
          </form>

          <p className="muted" style={{ textAlign: 'center', marginTop: 16, fontSize: 12.5 }}>
            Protected by encryption. New members receive an Investor ID on sign-up.
          </p>
        </div>
      </div>
    </div>
  );
}

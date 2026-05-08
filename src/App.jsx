import React, { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  Filter,
  GraduationCap,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageSquareText,
  Printer,
  Search,
  ShieldCheck,
  Upload,
  UserCog,
  Users,
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from './lib/supabaseClient'

const roleButtons = [
  { id: 'student', label: 'Student', icon: GraduationCap },
  { id: 'supervisor', label: 'Supervisor', icon: ClipboardCheck },
  { id: 'committee', label: 'Research Committee', icon: ShieldCheck },
  { id: 'admin', label: 'Admin', icon: UserCog },
]

const emptyData = {
  profiles: [],
  projects: [],
  reports: [],
  deadlines: [
    { id: 'd1', title: 'Weekly Research Report', deadline_type: 'Weekly Report', due_date: '2026-05-11', status: 'Active' },
    { id: 'd2', title: 'Proposal Final Version', deadline_type: 'Proposal', due_date: '2026-05-18', status: 'Active' },
    { id: 'd3', title: 'Final Thesis Submission', deadline_type: 'Final Thesis', due_date: '2026-06-20', status: 'Active' },
    { id: 'd4', title: 'Poster and Presentation', deadline_type: 'Presentation', due_date: '2026-06-27', status: 'Active' },
  ],
  notifications: [],
  evaluations: [],
  auditLogs: [],
}

const sampleNames = ['Aveen Mohammed', 'Hemn Karim', 'Dr. Lara Ahmed', 'Dr. Rebaz Hassan', 'College Admin']
const sampleEmails = ['aveen@hmu.edu.krd', 'hemn@hmu.edu.krd', 'lara.ahmed@hmu.edu.krd', 'rebaz.hassan@hmu.edu.krd', 'admin.pharmacy@hmu.edu.krd']

function cleanData(data) {
  const cleaned = { ...emptyData, ...data }
  cleaned.profiles = (cleaned.profiles || []).filter(
    (u) => !sampleNames.includes(u.full_name) && !sampleEmails.includes(u.email)
  )
  cleaned.projects = cleaned.projects || []
  cleaned.reports = cleaned.reports || []
  cleaned.deadlines = cleaned.deadlines?.length ? cleaned.deadlines : emptyData.deadlines
  cleaned.notifications = cleaned.notifications || []
  cleaned.evaluations = cleaned.evaluations || []
  cleaned.auditLogs = cleaned.auditLogs || []
  return cleaned
}

function loadLocalData() {
  try {
    const saved = localStorage.getItem('pharmatrack-data-v3')
    return saved ? cleanData(JSON.parse(saved)) : emptyData
  } catch {
    return emptyData
  }
}

function saveLocalData(data) {
  localStorage.setItem('pharmatrack-data-v3', JSON.stringify(data))
}

function loadCurrentUser() {
  try {
    const saved = localStorage.getItem('pharmatrack-current-user')
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

function saveCurrentUser(user) {
  if (!user) localStorage.removeItem('pharmatrack-current-user')
  else localStorage.setItem('pharmatrack-current-user', JSON.stringify(user))
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function getProjectStudents(project) {
  if (Array.isArray(project?.students)) return project.students
  if (typeof project?.students === 'string') return project.students.split(',').map((name) => name.trim()).filter(Boolean)
  return []
}

function isOwnStudentProject(project, user) {
  if (!project || !user) return false
  const userName = normalizeText(user.full_name)
  const userEmail = normalizeText(user.email)
  const groupName = normalizeText(project.group_name)
  const createdBy = normalizeText(project.created_by || project.student_name || project.submitted_by)
  const studentId = normalizeText(project.student_id || project.user_id || project.owner_id)
  const students = getProjectStudents(project).map(normalizeText)

  return (
    (!!userName && (groupName.includes(userName) || createdBy === userName || students.some((student) => student.includes(userName) || userName.includes(student)))) ||
    (!!userEmail && (createdBy === userEmail || students.includes(userEmail))) ||
    (!!user.id && studentId === normalizeText(user.id))
  )
}

function isAssignedSupervisorProject(project, user) {
  if (!project || !user) return false
  const supervisorName = normalizeText(project.supervisor_name || project.supervisor || project.assigned_supervisor)
  const supervisorEmail = normalizeText(project.supervisor_email)
  return (
    (!!user.full_name && supervisorName === normalizeText(user.full_name)) ||
    (!!user.email && supervisorEmail === normalizeText(user.email))
  )
}

function getVisibleProjects(projects, role, user) {
  if (role === 'admin' || role === 'committee') return projects
  if (role === 'supervisor') return projects.filter((project) => isAssignedSupervisorProject(project, user))
  return projects.filter((project) => isOwnStudentProject(project, user))
}

function getVisibleReports(reports, visibleProjects, role) {
  const projectIds = new Set(visibleProjects.map((project) => project.id))
  if (role === 'admin' || role === 'committee' || role === 'supervisor' || role === 'student') {
    return reports.filter((report) => projectIds.has(report.project_id))
  }
  return []
}

function Pill({ children, tone = 'slate' }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

function ProgressBar({ value }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  )
}

function StatCard({ icon: Icon, title, value, detail }) {
  return (
    <div className="card stat-card">
      <div>
        <p className="muted small">{title}</p>
        <h2>{value}</h2>
        <p className="muted small">{detail}</p>
      </div>
      <div className="icon-box"><Icon size={24} /></div>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="section-header">
      <div className="icon-box dark"><Icon size={20} /></div>
      <div>
        <h3>{title}</h3>
        <p className="muted small">{subtitle}</p>
      </div>
    </div>
  )
}

function TextArea({ label, value, onChange, placeholder }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  )
}

function EmptyState({ title, text, icon: Icon = FileText }) {
  return (
    <div className="empty-state">
      <Icon size={34} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}

function LoginPage({ onLogin, onForgotPassword, message, loading }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    role: 'student',
  })

  const isRegister = mode === 'register'
  const isForgotPassword = mode === 'forgot'

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div>
            <p className="eyebrow"><ShieldCheck size={16} /> Secure access</p>
            <h1>PharmaTrack Research Platform</h1>
            <p className="hero-text">Login securely with email and password to manage final-year pharmacy research projects, weekly reports, evaluations, files, and reminders.</p>
          </div>
        </div>

        <div className="auth-switch three">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Create account</button>
          <button type="button" className={mode === 'forgot' ? 'active' : ''} onClick={() => setMode('forgot')}>Forgot password?</button>
        </div>

        <div className="login-form">
          {isRegister && (
            <label className="field">
              <span>Full name</span>
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Write your full name" />
            </label>
          )}
          <label className={isForgotPassword ? "field wide" : "field"}>
            <span>University email</span>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@hmu.edu.krd" />
          </label>
          {!isForgotPassword && (
            <label className="field">
              <span>Password</span>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Enter your password" />
            </label>
          )}
          {isRegister && (
            <>
              <label className="field">
                <span>Confirm password</span>
                <input type="password" value={form.confirm_password} onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} placeholder="Re-enter your password" />
              </label>
              <label className="field">
                <span>User role</span>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {roleButtons.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
                </select>
              </label>
            </>
          )}
          {message && <div className="message login-message">{message}</div>}
          {isForgotPassword ? (
            <button className="primary wide" disabled={loading} onClick={() => onForgotPassword(form.email)}>
              <Lock size={16} /> {loading ? 'Sending reset link...' : 'Send Password Reset Link'}
            </button>
          ) : (
            <button className="primary wide" disabled={loading} onClick={() => onLogin({ ...form, mode })}>
              <Lock size={16} /> {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Login'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ResetPasswordPage({ onUpdatePassword, onBackToLogin, message, loading }) {
  const [form, setForm] = useState({ password: '', confirm_password: '' })
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div>
            <p className="eyebrow"><ShieldCheck size={16} /> Password recovery</p>
            <h1>Set a New Password</h1>
            <p className="hero-text">Enter a new password for your PharmaTrack account. After updating, return to the login page and sign in again.</p>
          </div>
        </div>
        <div className="login-form">
          <label className="field">
            <span>New password</span>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Enter new password" />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input type="password" value={form.confirm_password} onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} placeholder="Re-enter new password" />
          </label>
          {message && <div className="message login-message">{message}</div>}
          <button className="primary wide" disabled={loading} onClick={() => onUpdatePassword(form.password, form.confirm_password)}>
            <Lock size={16} /> {loading ? 'Updating password...' : 'Update Password'}
          </button>
          <button className="secondary wide" type="button" onClick={onBackToLogin}>Back to Login</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [role, setRole] = useState('student')
  const [tab, setTab] = useState('dashboard')
  const [data, setData] = useState(loadLocalData)
  const [currentUser, setCurrentUser] = useState(loadCurrentUser)
  const [message, setMessage] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false)
  const [passwordResetLoading, setPasswordResetLoading] = useState(false)
  const [filters, setFilters] = useState({ search: '', area: 'All', status: 'All' })

  const databaseMode = isSupabaseConfigured ? 'Supabase connected' : 'Local database mode'
  const allowedRole = currentUser?.role || 'student'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    localStorage.removeItem('pharmatrack-theme')
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('reset-password') === 'true' || window.location.hash.includes('type=recovery')) {
      setPasswordRecoveryMode(true)
      saveCurrentUser(null)
      setCurrentUser(null)
      setMessage('Enter your new password below.')
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryMode(true)
        saveCurrentUser(null)
        setCurrentUser(null)
        setMessage('Enter your new password below.')
      }
    })
    return () => listener?.subscription?.unsubscribe?.()
  }, [])

  useEffect(() => {
    if (currentUser) {
      setRole(currentUser.role)
      loadFromSupabase()
    }
  }, [])

  useEffect(() => {
    if (currentUser && role !== currentUser.role) {
      setRole(currentUser.role)
      setTab('dashboard')
      setMessage(`Welcome, ${currentUser.full_name}.`)
    }
  }, [role, currentUser])

  useEffect(() => {
    if (allowedRole !== 'admin' && ['database', 'audit'].includes(tab)) {
      setTab('dashboard')
    }
  }, [allowedRole, tab])

  async function loadFromSupabase() {
    if (!isSupabaseConfigured) return
    try {
      const [profiles, projects, reports, deadlines, notifications, evaluations, auditLogs] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: true }),
        supabase.from('research_projects').select('*').order('created_at', { ascending: false }),
        supabase.from('weekly_reports').select('*').order('submitted_at', { ascending: false }),
        supabase.from('deadlines').select('*').order('due_date', { ascending: true }),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }),
        supabase.from('evaluations').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }),
      ])
      const error = [profiles, projects, reports, deadlines, notifications, evaluations, auditLogs].find((x) => x.error)?.error
      if (error) throw error
      setData(cleanData({
        profiles: profiles.data || [],
        projects: projects.data || [],
        reports: reports.data || [],
        deadlines: deadlines.data?.length ? deadlines.data : emptyData.deadlines,
        notifications: notifications.data || [],
        evaluations: evaluations.data || [],
        auditLogs: auditLogs.data || [],
      }))
    } catch (error) {
      setMessage(`Database error: ${error.message}`)
    }
  }

  function setLocal(updater) {
    setData((current) => {
      const next = cleanData(typeof updater === 'function' ? updater(current) : updater)
      saveLocalData(next)
      return next
    })
  }

  function makeAudit(actor, action, entity) {
    return { id: crypto.randomUUID(), actor, action, entity, created_at: new Date().toISOString() }
  }

  async function addAudit(actor, action, entity) {
    const log = makeAudit(actor, action, entity)
    if (isSupabaseConfigured) {
      await supabase.from('audit_logs').insert({ actor, action, entity })
      await loadFromSupabase()
    } else {
      setLocal((current) => ({ ...current, auditLogs: [log, ...current.auditLogs] }))
    }
  }

  function localPasswordKey(password) {
    return `local-${btoa(unescape(encodeURIComponent(password)))}`
  }

  function explainRecoveryEmailError(error) {
    const rawMessage = error?.message || ''
    const message = rawMessage.toLowerCase()
    if (error?.status === 429 || message.includes('rate limit') || message.includes('email rate')) {
      return 'Supabase email rate limit reached. Wait until the limit resets, or finish custom SMTP setup in Supabase Authentication → Emails → SMTP Settings.'
    }
    if (message.includes('smtp') || message.includes('provider') || message.includes('sending') || message.includes('recovery email')) {
      return 'Supabase could not send the recovery email. Check Authentication → Logs for the exact error, then verify your SMTP sender email, host, port, username, and password.'
    }
    if (message.includes('redirect') || message.includes('url')) {
      return 'Password reset redirect URL is not allowed. Add http://localhost:5173/** and https://www.pharmacy-hmu.com/** in Supabase Authentication → URL Configuration → Redirect URLs.'
    }
    return rawMessage || 'Could not send password reset email. Check Supabase SMTP settings, email rate limits, and redirect URLs.'
  }

  async function handleForgotPassword(emailValue) {
    setMessage('')
    const email = String(emailValue || '').trim().toLowerCase()
    if (!email || !email.includes('@') || !email.includes('.')) {
      setMessage('Please write your registered email address first.')
      return
    }
    if (!isSupabaseConfigured) {
      setMessage('Password reset requires Supabase connection. Add Supabase keys and SMTP/email settings first.')
      return
    }
    setLoginLoading(true)
    try {
      const redirectTo = `${window.location.origin}/?reset-password=true`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw error
      setMessage('Password reset link sent. Please check your email inbox. If you do not see it, check spam/junk or your Supabase Auth logs.')
    } catch (error) {
      setMessage(explainRecoveryEmailError(error))
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleUpdatePassword(newPassword, confirmPassword) {
    setMessage('')
    if (!isSupabaseConfigured) {
      setMessage('Password update requires Supabase connection.')
      return
    }
    if (!newPassword || newPassword.length < 6) {
      setMessage('New password must contain at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage('New password and confirm password do not match.')
      return
    }
    setPasswordResetLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      await supabase.auth.signOut()
      window.history.replaceState({}, document.title, window.location.pathname)
      setPasswordRecoveryMode(false)
      saveCurrentUser(null)
      setCurrentUser(null)
      setMessage('Password updated successfully. Please login with your new password.')
    } catch (error) {
      setMessage(error.message || 'Could not update password. Open the latest reset link from your email and try again.')
    } finally {
      setPasswordResetLoading(false)
    }
  }

  async function handleLogin(form) {
    setMessage('')
    const mode = form.mode || 'login'
    const isRegister = mode === 'register'
    const fullName = form.full_name.trim()
    const email = form.email.trim().toLowerCase()
    const password = form.password || ''
    const confirmPassword = form.confirm_password || ''

    if (!email || !password) {
      setMessage('Please write your university email and password.')
      return
    }
    if (isRegister && !fullName) {
      setMessage('Please write your full name to create a new account.')
      return
    }
    if (!email.includes('@') || !email.includes('.')) {
      setMessage('Please write a valid email address.')
      return
    }
    if (password.length < 6) {
      setMessage('Password must contain at least 6 characters.')
      return
    }
    if (isRegister && password !== confirmPassword) {
      setMessage('Password and confirm password do not match.')
      return
    }

    setLoginLoading(true)
    try {
      let loginUser = null

      if (isSupabaseConfigured) {
        if (isRegister) {
          const countResult = await supabase.from('profiles').select('id', { count: 'exact', head: true })
          if (countResult.error) throw new Error(`Could not check profile count: ${countResult.error.message}`)
          const isFirstProfile = Number(countResult.count || 0) === 0
          const registrationStatus = isFirstProfile && form.role === 'admin' ? 'Active' : 'Pending'

          const signUpResult = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                role: form.role,
                status: registrationStatus,
              },
            },
          })

          if (signUpResult.error) {
            const msg = signUpResult.error.message || ''
            if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already been registered')) {
              throw new Error('This email already has an account. Please use Login with your password.')
            }
            throw new Error(msg)
          }

          const existingResult = await supabase.from('profiles').select('*').eq('email', email).maybeSingle()
          if (existingResult.error) throw new Error(`Could not check existing user: ${existingResult.error.message}`)

          if (existingResult.data) {
            loginUser = existingResult.data
          } else {
            const insertResult = await supabase
              .from('profiles')
              .insert({ full_name: fullName, email, role: form.role, status: registrationStatus })
              .select()
              .single()

            if (insertResult.error) {
              const msg = insertResult.error.message || ''
              if (msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('permission denied') || msg.toLowerCase().includes('policy')) {
                throw new Error('Registration is blocked by Supabase Row Level Security. Run supabase/registration_fix.sql in Supabase SQL Editor, then try again.')
              }
              if (msg.toLowerCase().includes('relation') && msg.toLowerCase().includes('profiles')) {
                throw new Error('The profiles table was not found. Run supabase/schema.sql in Supabase SQL Editor first.')
              }
              throw new Error(msg)
            }
            loginUser = insertResult.data
          }

          if (loginUser.status !== 'Active') {
            await supabase.auth.signOut()
            await loadFromSupabase()
            setMessage('Registration submitted successfully. Please check your email for confirmation and wait for an admin to approve your account.')
            return
          }
        } else {
          const signInResult = await supabase.auth.signInWithPassword({ email, password })
          if (signInResult.error) {
            throw new Error('Login failed. Please check your email and password, or create a new account first.')
          }

          const existingResult = await supabase.from('profiles').select('*').eq('email', email).maybeSingle()
          if (existingResult.error) throw new Error(`Could not load user profile: ${existingResult.error.message}`)
          if (!existingResult.data) {
            throw new Error('Login succeeded, but no profile was found. Please ask the Admin to create your profile or register again.')
          }
          loginUser = existingResult.data
          if (loginUser.status !== 'Active') {
            await supabase.auth.signOut()
            if (loginUser.status === 'Rejected') {
              throw new Error('Your account request was rejected. Please contact the College Admin for clarification.')
            }
            throw new Error('Your account is pending Admin approval. You cannot access the dashboard yet.')
          }
        }

        await loadFromSupabase()
      } else {
        const existingLocal = data.profiles.find((p) => p.email === email)
        if (isRegister) {
          if (existingLocal) throw new Error('This email already has an account. Please use Login with your password.')
          const isFirstLocalProfile = data.profiles.length === 0
          const registrationStatus = isFirstLocalProfile && form.role === 'admin' ? 'Active' : 'Pending'
          loginUser = {
            id: crypto.randomUUID(),
            full_name: fullName,
            email,
            role: form.role,
            status: registrationStatus,
            password_hash: localPasswordKey(password),
            created_at: new Date().toISOString(),
          }
          setLocal((current) => ({ ...current, profiles: [loginUser, ...current.profiles] }))
          if (loginUser.status !== 'Active') {
            setMessage('Registration submitted successfully. Please check your email for confirmation and wait for an admin to approve your account.')
            return
          }
        } else {
          if (!existingLocal) throw new Error('No local account was found for this email. Please create an account first.')
          if (existingLocal.password_hash !== localPasswordKey(password)) {
            throw new Error('Login failed. Please check your password.')
          }
          loginUser = existingLocal
          if (loginUser.status !== 'Active') {
            if (loginUser.status === 'Rejected') {
              throw new Error('Your account request was rejected. Please contact the College Admin for clarification.')
            }
            throw new Error('Your account is pending Admin approval. You cannot access the dashboard yet.')
          }
        }
      }

      saveCurrentUser(loginUser)
      setCurrentUser(loginUser)
      setRole(loginUser.role)
      setMessage(`Welcome, ${loginUser.full_name}.`)
    } catch (error) {
      setMessage(error.message || 'Authentication failed. Please check your Supabase URL, key, database policies, email, and password.')
    } finally {
      setLoginLoading(false)
    }
  }

  async function logout() {
    if (isSupabaseConfigured) await supabase.auth.signOut()
    saveCurrentUser(null)
    setCurrentUser(null)
    setTab('dashboard')
    setMessage('You have logged out.')
  }

  async function createProject(form) {
    if (!form.title?.trim()) return setMessage('Please write a research title first.')
    const project = {
      id: crypto.randomUUID(),
      group_name: form.group_name || `${currentUser?.full_name || 'Student'} Project`,
      title: form.title,
      area: form.area,
      supervisor_name: 'Pending Assignment',
      approval: 'Pending Committee Review',
      status: 'Pending',
      progress: 0,
      final_due: form.final_due || '2026-06-20',
      students: [currentUser?.full_name || 'Student'],
      created_at: new Date().toISOString(),
    }

    if (isSupabaseConfigured) {
      const { id, ...projectForDb } = project
      const { error } = await supabase.from('research_projects').insert(projectForDb)
      if (error) return setMessage(error.message)
      await addAudit(currentUser.full_name, 'submitted', 'new research title')
      await loadFromSupabase()
    } else {
      const log = makeAudit(currentUser.full_name, 'submitted', 'new research title')
      setLocal((current) => ({ ...current, projects: [project, ...current.projects], auditLogs: [log, ...current.auditLogs] }))
    }
    setMessage('Research title submitted for committee review.')
  }

  async function createWeeklyReport(form, file) {
    if (!form.project_id) return setMessage('Create or select a research project first.')
    if (!form.completed_work?.trim()) return setMessage('Please write the work completed this week before submitting.')
    const nextWeek = Math.max(0, ...data.reports.filter((r) => r.project_id === form.project_id).map((r) => Number(r.week_number || 0))) + 1
    const report = {
      id: crypto.randomUUID(),
      project_id: form.project_id,
      week_number: nextWeek,
      submitted_by: form.submitted_by,
      submitted_at: new Date().toISOString(),
      completed_work: form.completed_work,
      challenges: form.challenges,
      next_week_plan: form.next_week_plan,
      attendance: form.attendance,
      status: 'Submitted',
      supervisor_feedback: 'Waiting for supervisor review.',
      score: null,
    }

    if (isSupabaseConfigured) {
      const { id, ...reportForDb } = report
      const { data: inserted, error } = await supabase.from('weekly_reports').insert(reportForDb).select().single()
      if (error) return setMessage(error.message)
      if (file) await uploadProjectFile(file, form.project_id, inserted.id, 'Weekly Report Evidence')
      await addAudit(form.submitted_by, 'submitted', `weekly report ${nextWeek}`)
      await loadFromSupabase()
    } else {
      const log = makeAudit(form.submitted_by, 'submitted', `weekly report ${nextWeek}`)
      setLocal((current) => ({ ...current, reports: [report, ...current.reports], auditLogs: [log, ...current.auditLogs] }))
    }
    setMessage('Weekly report submitted successfully.')
  }

  async function uploadProjectFile(file, projectId, reportId, fileType) {
    if (!isSupabaseConfigured) return
    const filePath = `${projectId}/${Date.now()}-${file.name}`
    const upload = await supabase.storage.from('project-files').upload(filePath, file, { upsert: false })
    if (upload.error) return setMessage(upload.error.message)
    await supabase.from('uploaded_files').insert({ project_id: projectId, report_id: reportId, file_type: fileType, file_name: file.name, file_path: filePath })
  }

  async function reviewReport(reportId, status, feedback) {
    const score = status === 'Accepted' ? 18 : 12
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('weekly_reports').update({ status, supervisor_feedback: feedback, score }).eq('id', reportId)
      if (error) return setMessage(error.message)
      await addAudit(currentUser.full_name, status === 'Accepted' ? 'approved' : 'requested revision for', `weekly report ${reportId}`)
      await loadFromSupabase()
    } else {
      const log = makeAudit(currentUser.full_name, status === 'Accepted' ? 'approved' : 'requested revision for', `weekly report ${reportId}`)
      setLocal((current) => ({
        ...current,
        reports: current.reports.map((r) => r.id === reportId ? { ...r, status, supervisor_feedback: feedback, score } : r),
        auditLogs: [log, ...current.auditLogs],
      }))
    }
    setMessage('Supervisor review saved.')
  }

  async function updateProject(projectId, fields) {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('research_projects').update(fields).eq('id', projectId)
      if (error) return setMessage(error.message)
      await addAudit(currentUser.full_name, 'updated', `project ${projectId}`)
      await loadFromSupabase()
    } else {
      const log = makeAudit(currentUser.full_name, 'updated', `project ${projectId}`)
      setLocal((current) => ({
        ...current,
        projects: current.projects.map((p) => p.id === projectId ? { ...p, ...fields } : p),
        auditLogs: [log, ...current.auditLogs],
      }))
    }
    setMessage('Project updated.')
  }

  async function updateUserRole(userId, newRole) {
    const targetUser = data.profiles.find((u) => u.id === userId)
    if (!targetUser) return setMessage('User not found.')
    if (targetUser.id === currentUser.id) return setMessage('For safety, the active admin cannot change their own role while logged in.')

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
      if (error) return setMessage(error.message)
      await addAudit(currentUser.full_name, 'changed user role for', `${targetUser.full_name} to ${newRole}`)
      await loadFromSupabase()
    } else {
      const log = makeAudit(currentUser.full_name, 'changed user role for', `${targetUser.full_name} to ${newRole}`)
      setLocal((current) => ({
        ...current,
        profiles: current.profiles.map((u) => u.id === userId ? { ...u, role: newRole } : u),
        auditLogs: [log, ...current.auditLogs],
      }))
    }
    setMessage(`${targetUser.full_name}'s role was changed to ${roleButtons.find((r) => r.id === newRole)?.label || newRole}.`)
  }

  async function updateUserStatus(userId, newStatus) {
    const targetUser = data.profiles.find((u) => u.id === userId)
    if (!targetUser) return setMessage('User not found.')
    if (targetUser.id === currentUser.id) return setMessage('For safety, the active admin cannot change their own approval status while logged in.')

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', userId)
      if (error) return setMessage(error.message)
      await addAudit(currentUser.full_name, 'changed user approval status for', `${targetUser.full_name} to ${newStatus}`)
      await loadFromSupabase()
    } else {
      const log = makeAudit(currentUser.full_name, 'changed user approval status for', `${targetUser.full_name} to ${newStatus}`)
      setLocal((current) => ({
        ...current,
        profiles: current.profiles.map((u) => u.id === userId ? { ...u, status: newStatus } : u),
        auditLogs: [log, ...current.auditLogs],
      }))
    }
    setMessage(`${targetUser.full_name}'s account status was changed to ${newStatus}.`)
  }

  async function saveEvaluation(form) {
    const project = data.projects[0]
    if (!project) return setMessage('Create a project first before saving an evaluation.')
    const record = {
      id: crypto.randomUUID(),
      project_id: project.id,
      evaluator_name: currentUser.full_name,
      evaluation_type: 'Final Presentation and Poster',
      attendance_score: Number(form.attendance || 0),
      progress_score: Number(form.progress || 0),
      research_quality_score: Number(form.quality || 0),
      writing_score: Number(form.writing || 0),
      presentation_score: Number(form.presentation || 0),
      teamwork_score: Number(form.teamwork || 0),
      comments: form.comments,
      created_at: new Date().toISOString(),
    }

    if (isSupabaseConfigured) {
      const { id, ...recordForDb } = record
      const { error } = await supabase.from('evaluations').insert(recordForDb)
      if (error) return setMessage(error.message)
      await addAudit(currentUser.full_name, 'saved', 'final evaluation')
      await loadFromSupabase()
    } else {
      const log = makeAudit(currentUser.full_name, 'saved', 'final evaluation')
      setLocal((current) => ({ ...current, evaluations: [record, ...current.evaluations], auditLogs: [log, ...current.auditLogs] }))
    }
    setMessage('Evaluation saved.')
  }

  async function createNotification(form) {
    if (!form.title.trim() || !form.message.trim()) return setMessage('Please write notification title and message.')
    const note = { id: crypto.randomUUID(), title: form.title, message: form.message, type: form.type, target_role: form.target_role, is_read: false, created_at: new Date().toISOString() }
    if (isSupabaseConfigured) {
      const { id, ...noteForDb } = note
      const { error } = await supabase.from('notifications').insert(noteForDb)
      if (error) return setMessage(error.message)
      await addAudit(currentUser.full_name, 'created', 'notification/reminder')
      await loadFromSupabase()
    } else {
      const log = makeAudit(currentUser.full_name, 'created', 'notification/reminder')
      setLocal((current) => ({ ...current, notifications: [note, ...current.notifications], auditLogs: [log, ...current.auditLogs] }))
    }
    setMessage('Notification created.')
  }

  function markNotificationRead(id) {
    setLocal((current) => ({
      ...current,
      notifications: current.notifications.map((n) => n.id === id ? { ...n, is_read: true } : n),
    }))
  }

  function exportCsv() {
    const header = 'Group,Title,Area,Supervisor,Approval,Status,Progress,Final Due\n'
    const rows = filteredProjects.map((p) => `"${p.group_name}","${p.title}","${p.area}","${p.supervisor_name}","${p.approval}","${p.status}","${p.progress}%","${p.final_due}"`).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pharmatrack_project_summary.csv'
    a.click()
    URL.revokeObjectURL(url)
    addAudit(currentUser.full_name, 'exported', 'project summary CSV')
  }

  function printPdfReport() {
    window.print()
    addAudit(currentUser.full_name, 'printed', 'PDF report')
  }

  const visibleProjects = useMemo(() => getVisibleProjects(data.projects, allowedRole, currentUser), [data.projects, allowedRole, currentUser])

  const filteredProjects = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return visibleProjects.filter((p) => {
      const matchesSearch = !q || [p.title, p.group_name, p.area, p.supervisor_name, p.approval, p.status].some((value) => String(value || '').toLowerCase().includes(q))
      const matchesArea = filters.area === 'All' || p.area === filters.area
      const matchesStatus = filters.status === 'All' || p.status === filters.status || p.approval === filters.status
      return matchesSearch && matchesArea && matchesStatus
    })
  }, [visibleProjects, filters])

  const visibleReports = useMemo(() => getVisibleReports(data.reports, visibleProjects, allowedRole), [data.reports, visibleProjects, allowedRole])

  const visibleData = useMemo(() => ({
    ...data,
    profiles: allowedRole === 'admin' ? data.profiles : [],
    projects: visibleProjects,
    reports: visibleReports,
    evaluations: allowedRole === 'student' ? [] : data.evaluations,
    auditLogs: allowedRole === 'admin' ? data.auditLogs : [],
  }), [data, allowedRole, visibleProjects, visibleReports])

  const stats = useMemo(() => {
    const approved = visibleProjects.filter((p) => p.approval === 'Approved').length
    const pendingReports = visibleReports.filter((r) => ['Submitted', 'Revision Required'].includes(r.status)).length
    const averageProgress = visibleProjects.length ? Math.round(visibleProjects.reduce((sum, p) => sum + Number(p.progress || 0), 0) / visibleProjects.length) : 0
    const unread = data.notifications.filter((n) => !n.is_read && (n.target_role === 'all' || n.target_role === allowedRole)).length
    const activeUsers = allowedRole === 'admin' ? data.profiles.filter((u) => u.status === 'Active').length : 0
    const pendingUsers = allowedRole === 'admin' ? data.profiles.filter((u) => u.status === 'Pending').length : 0
    const rejectedUsers = allowedRole === 'admin' ? data.profiles.filter((u) => u.status === 'Rejected').length : 0
    return { approved, pendingReports, averageProgress, unread, activeUsers, pendingUsers, rejectedUsers }
  }, [data.notifications, data.profiles, allowedRole, visibleProjects, visibleReports])

  const statCards = useMemo(() => {
    if (allowedRole === 'admin') {
      return [
        { icon: Users, title: 'Registered users', value: data.profiles.length, detail: `${stats.activeUsers} active, ${stats.pendingUsers} pending` },
        { icon: BookOpen, title: 'Research projects', value: data.projects.length, detail: `${data.projects.filter((p) => p.approval === 'Approved').length} approved topics` },
        { icon: MessageSquareText, title: 'Reports needing review', value: data.reports.filter((r) => ['Submitted', 'Revision Required'].includes(r.status)).length, detail: 'Submitted or revision-required' },
        { icon: CheckCircle2, title: 'Average progress', value: `${data.projects.length ? Math.round(data.projects.reduce((sum, p) => sum + Number(p.progress || 0), 0) / data.projects.length) : 0}%`, detail: 'Across active projects' },
      ]
    }

    if (allowedRole === 'supervisor') {
      return [
        { icon: BookOpen, title: 'My assigned projects', value: visibleProjects.length, detail: 'Only projects assigned to you' },
        { icon: MessageSquareText, title: 'My reports to review', value: stats.pendingReports, detail: 'Submitted or revision-required' },
        { icon: Users, title: 'My student groups', value: visibleProjects.length, detail: 'Visible through assigned projects' },
        { icon: CheckCircle2, title: 'Average progress', value: `${stats.averageProgress}%`, detail: 'Across your assigned projects' },
      ]
    }

    if (allowedRole === 'committee') {
      return [
        { icon: BookOpen, title: 'Projects for review', value: visibleProjects.length, detail: `${visibleProjects.filter((p) => p.approval === 'Pending Committee Review' || p.approval === 'Revision Required').length} awaiting decision` },
        { icon: CheckCircle2, title: 'Approved topics', value: stats.approved, detail: 'Committee-approved research topics' },
        { icon: MessageSquareText, title: 'Weekly reports', value: visibleReports.length, detail: 'Visible project reports' },
        { icon: CalendarDays, title: 'Active deadlines', value: data.deadlines.length, detail: 'Academic milestones' },
      ]
    }

    return [
      { icon: BookOpen, title: 'My research projects', value: visibleProjects.length, detail: 'Only your submitted project records' },
      { icon: MessageSquareText, title: 'My weekly reports', value: visibleReports.length, detail: 'Only reports from your project' },
      { icon: CheckCircle2, title: 'My progress', value: `${stats.averageProgress}%`, detail: 'Based on your project progress' },
      { icon: CalendarDays, title: 'Deadlines', value: data.deadlines.length, detail: 'Upcoming course milestones' },
    ]
  }, [allowedRole, data, stats, visibleProjects, visibleReports])

  if (passwordRecoveryMode) {
    return <ResetPasswordPage onUpdatePassword={handleUpdatePassword} onBackToLogin={() => { setPasswordRecoveryMode(false); window.history.replaceState({}, document.title, window.location.pathname); setMessage('') }} message={message} loading={passwordResetLoading} />
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} onForgotPassword={handleForgotPassword} message={message} loading={loginLoading} />
  }

  return (
    <div className="app">
      <header className="hero no-print">
        <div>
          <p className="eyebrow"><ShieldCheck size={16} /> Secure role-based research platform</p>
          <h1>PharmaTrack Research Platform</h1>
          <p className="hero-text">A web-based Pharmacy Research Project Management System for 5th-year students at Hawler Medical University, College of Pharmacy.</p>
        </div>
        <div className="status-box">
          <p className="muted small">Logged in as</p>
          <h3>{currentUser.full_name}</h3>
          <p className="small">Role: {roleButtons.find((r) => r.id === allowedRole)?.label}</p>
          <p className="small">Database: {databaseMode}</p>
          <div className="status-actions">
            <button className="ghost-dark" onClick={logout}><LogOut size={16} /> Logout</button>
          </div>
        </div>
      </header>

      <main>

        <div className="tabs no-print">
          <button onClick={() => setTab('dashboard')} className={tab === 'dashboard' ? 'active' : ''}><LayoutDashboard size={16} /> Dashboard</button>
          <button onClick={() => setTab('notifications')} className={tab === 'notifications' ? 'active' : ''}><Bell size={16} /> Notifications {stats.unread > 0 && <span className="tab-badge">{stats.unread}</span>}</button>
          <button onClick={() => setTab('reports')} className={tab === 'reports' ? 'active' : ''}><Printer size={16} /> Print/PDF Reports</button>
          {allowedRole === 'admin' && <button onClick={() => setTab('database')} className={tab === 'database' ? 'active' : ''}><Database size={16} /> Database</button>}
          {allowedRole === 'admin' && <button onClick={() => setTab('audit')} className={tab === 'audit' ? 'active' : ''}><ShieldCheck size={16} /> Audit Log</button>}
        </div>

        {message && <div className="message no-print">{message}</div>}

        {tab === 'dashboard' && (
          <>
            <section className="stats no-print">
              {statCards.map((card) => <StatCard key={card.title} {...card} />)}
            </section>

            <FilterBar filters={filters} setFilters={setFilters} projects={visibleProjects} />

            {allowedRole === 'student' && <StudentDashboard data={visibleData} projects={filteredProjects} currentUser={currentUser} createProject={createProject} createWeeklyReport={createWeeklyReport} />}
            {allowedRole === 'supervisor' && <SupervisorDashboard data={visibleData} projects={filteredProjects} currentUser={currentUser} reviewReport={reviewReport} />}
            {allowedRole === 'committee' && <CommitteeDashboard data={visibleData} projects={filteredProjects} updateProject={updateProject} saveEvaluation={saveEvaluation} />}
            {allowedRole === 'admin' && <AdminDashboard data={visibleData} projects={filteredProjects} currentUser={currentUser} updateProject={updateProject} updateUserRole={updateUserRole} updateUserStatus={updateUserStatus} exportCsv={exportCsv} />}
          </>
        )}

        {tab === 'notifications' && <NotificationsTab data={data} role={allowedRole} createNotification={createNotification} markNotificationRead={markNotificationRead} />}
        {tab === 'reports' && <ReportsTab data={visibleData} projects={filteredProjects} currentUser={currentUser} role={allowedRole} printPdfReport={printPdfReport} exportCsv={exportCsv} />}
        {tab === 'database' && allowedRole === 'admin' && <DatabaseTab databaseMode={databaseMode} />}
        {tab === 'database' && allowedRole !== 'admin' && <div className="card"><SectionHeader icon={Lock} title="Database Access Locked" subtitle="Only Admin accounts can view database status" /><p className="muted">Please use your role dashboard, notifications, or reports page.</p></div>}
        {tab === 'audit' && allowedRole === 'admin' && <AuditTab logs={visibleData.auditLogs} />}
      </main>
    </div>
  )
}

function FilterBar({ filters, setFilters, projects }) {
  const areas = ['All', ...Array.from(new Set(projects.map((p) => p.area).filter(Boolean)))]
  const statuses = ['All', ...Array.from(new Set(projects.flatMap((p) => [p.status, p.approval]).filter(Boolean)))]
  return (
    <div className="card filter-card no-print">
      <SectionHeader icon={Filter} title="Search and Filter" subtitle="Find projects by title, group, area, supervisor, approval, or status" />
      <div className="filter-grid">
        <label className="field">
          <span>Search</span>
          <div className="input-icon"><Search size={16} /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search projects..." /></div>
        </label>
        <label className="field">
          <span>Research area</span>
          <select value={filters.area} onChange={(e) => setFilters({ ...filters, area: e.target.value })}>{areas.map((a) => <option key={a}>{a}</option>)}</select>
        </label>
        <label className="field">
          <span>Status / approval</span>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <button className="secondary" onClick={() => setFilters({ search: '', area: 'All', status: 'All' })}>Reset Filters</button>
      </div>
    </div>
  )
}

function StudentDashboard({ data, projects, currentUser, createProject, createWeeklyReport }) {
  const ownProjects = projects.filter((p) => isOwnStudentProject(p, currentUser))
  const selectedProject = ownProjects[0] || data.projects.find((p) => isOwnStudentProject(p, currentUser))
  const reports = data.reports.filter((r) => r.project_id === selectedProject?.id)
  const [titleForm, setTitleForm] = useState({ title: '', area: 'Clinical Pharmacy', group_name: `${currentUser.full_name} Research Group`, final_due: '2026-06-20' })
  const [reportForm, setReportForm] = useState({ completed_work: '', challenges: '', next_week_plan: '', attendance: 'Attended' })
  const [file, setFile] = useState(null)

  return (
    <div className="grid two-one">
      <div className="stack">
        <div className="card">
          <SectionHeader icon={BookOpen} title="My Research Project" subtitle="Your submitted project and progress" />
          {selectedProject ? (
            <div className="soft-box">
              <div className="split">
                <div>
                  <p className="muted small bold">{selectedProject.group_name}</p>
                  <h3>{selectedProject.title}</h3>
                  <p className="muted">Supervisor: {selectedProject.supervisor_name}</p>
                </div>
                <Pill tone={selectedProject.approval === 'Approved' ? 'green' : 'amber'}>{selectedProject.approval}</Pill>
              </div>
              <div className="progress-row"><span>Progress</span><span>{selectedProject.progress}%</span></div>
              <ProgressBar value={selectedProject.progress} />
            </div>
          ) : <EmptyState title="No project yet" text="Submit a research title below to create your first project." />}
        </div>

        <div className="card">
          <SectionHeader icon={MessageSquareText} title="Submit Weekly Report" subtitle="Submit progress and upload evidence file" />
          {selectedProject ? (
            <>
              <div className="form-grid">
                <TextArea label="Work completed this week" value={reportForm.completed_work} onChange={(v) => setReportForm({ ...reportForm, completed_work: v })} />
                <TextArea label="Problems or challenges" value={reportForm.challenges} onChange={(v) => setReportForm({ ...reportForm, challenges: v })} />
                <TextArea label="Next week plan" value={reportForm.next_week_plan} onChange={(v) => setReportForm({ ...reportForm, next_week_plan: v })} />
                <label className="field">
                  <span>Upload file</span>
                  <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <select value={reportForm.attendance} onChange={(e) => setReportForm({ ...reportForm, attendance: e.target.value })}>
                    <option>Attended</option><option>Online</option><option>Absent</option><option>Not scheduled</option>
                  </select>
                </label>
              </div>
              <button className="primary" onClick={() => createWeeklyReport({ ...reportForm, project_id: selectedProject.id, submitted_by: selectedProject.group_name }, file)}><Upload size={16} /> Submit Weekly Report</button>
            </>
          ) : <EmptyState title="Weekly reports locked" text="Create a research project first, then weekly report submission will be available." icon={Lock} />}
        </div>

        <div className="card">
          <SectionHeader icon={FileText} title="Submit New Research Title" subtitle="Create a new project for committee review" />
          <div className="form-grid compact">
            <input value={titleForm.title} onChange={(e) => setTitleForm({ ...titleForm, title: e.target.value })} placeholder="Research title" />
            <select value={titleForm.area} onChange={(e) => setTitleForm({ ...titleForm, area: e.target.value })}>
              <option>Clinical Pharmacy</option><option>Pharmacology</option><option>Pharmaceutics</option><option>Pharmacognosy</option><option>Microbiology</option><option>Public Health</option>
            </select>
            <input value={titleForm.group_name} onChange={(e) => setTitleForm({ ...titleForm, group_name: e.target.value })} placeholder="Group name" />
            <input type="date" value={titleForm.final_due} onChange={(e) => setTitleForm({ ...titleForm, final_due: e.target.value })} />
          </div>
          <button className="primary" onClick={() => createProject(titleForm)}>Submit Title</button>
        </div>
      </div>

      <aside className="stack">
        <DeadlinesCard deadlines={data.deadlines} />
        <div className="card">
          <SectionHeader icon={MessageSquareText} title="Supervisor Feedback" subtitle="Latest comments" />
          {reports.length ? reports.map((r) => <div className="mini-card" key={r.id}><div className="split"><b>Week {r.week_number}</b><Pill tone={r.status === 'Accepted' ? 'green' : r.status === 'Revision Required' ? 'red' : 'amber'}>{r.status}</Pill></div><p>{r.supervisor_feedback}</p><p className="muted small">Score: {r.score ?? 'Pending'}/20</p></div>) : <EmptyState title="No feedback yet" text="Feedback will appear after your supervisor reviews a weekly report." icon={MessageSquareText} />}
        </div>
      </aside>
    </div>
  )
}

function SupervisorDashboard({ data, projects, currentUser, reviewReport }) {
  const [feedback, setFeedback] = useState({})
  const assignedProjects = projects.filter((p) => isAssignedSupervisorProject(p, currentUser))
  const reports = data.reports.filter((r) => assignedProjects.some((p) => p.id === r.project_id))

  return (
    <div className="stack">
      {assignedProjects.length ? <div className="project-grid">{assignedProjects.map((p) => <ProjectCard key={p.id} project={p} />)}</div> : <div className="card"><EmptyState title="No assigned projects" text="Ask the admin to assign projects to your exact login name, or assign yourself from the Admin view for testing." icon={Users} /></div>}
      <div className="card">
        <SectionHeader icon={ClipboardCheck} title="Review Weekly Reports" subtitle="Approve or request revision" />
        {reports.length ? reports.map((r) => {
          const project = data.projects.find((p) => p.id === r.project_id)
          return (
            <div className="review-card" key={r.id}>
              <div className="split"><div><p className="muted small bold">Week {r.week_number} • {project?.group_name}</p><h3>{project?.title}</h3></div><Pill tone={r.status === 'Accepted' ? 'green' : r.status === 'Revision Required' ? 'red' : 'amber'}>{r.status}</Pill></div>
              <div className="three-cols"><div><b>Completed</b><p>{r.completed_work}</p></div><div><b>Challenges</b><p>{r.challenges}</p></div><div><b>Next plan</b><p>{r.next_week_plan}</p></div></div>
              <div className="action-row"><input value={feedback[r.id] ?? r.supervisor_feedback ?? ''} onChange={(e) => setFeedback({ ...feedback, [r.id]: e.target.value })} placeholder="Supervisor feedback" /><button onClick={() => reviewReport(r.id, 'Accepted', feedback[r.id] || 'Accepted. Continue with the next milestone.')} className="success">Approve</button><button onClick={() => reviewReport(r.id, 'Revision Required', feedback[r.id] || 'Revision required. Please add more detail.')} className="warning">Request Revision</button></div>
            </div>
          )
        }) : <EmptyState title="No reports to review" text="Weekly reports from assigned projects will appear here." icon={ClipboardCheck} />}
      </div>
    </div>
  )
}

function CommitteeDashboard({ projects, updateProject, saveEvaluation }) {
  const [evalForm, setEvalForm] = useState({ attendance: 10, progress: 18, quality: 18, writing: 17, presentation: 18, teamwork: 5, comments: '' })
  const total = ['attendance', 'progress', 'quality', 'writing', 'presentation', 'teamwork'].reduce((sum, key) => sum + Number(evalForm[key] || 0), 0)

  return (
    <div className="stack">
      <div className="card">
        <SectionHeader icon={Search} title="Research Committee Review" subtitle="Approve, reject, or request revision for project titles" />
        {projects.length ? <ProjectDecisionTable projects={projects} updateProject={updateProject} /> : <EmptyState title="No matching projects" text="Projects will appear here after students submit research titles." icon={Search} />}
      </div>
      <div className="card">
        <SectionHeader icon={CheckCircle2} title="Final Evaluation Rubric" subtitle="100-mark assessment model" />
        <div className="rubric-grid">{[
          ['Attendance', 'attendance'], ['Weekly progress', 'progress'], ['Research quality', 'quality'], ['Writing', 'writing'], ['Presentation', 'presentation'], ['Teamwork', 'teamwork']
        ].map(([label, key]) => <label className="field" key={key}><span>{label}</span><input type="number" value={evalForm[key]} onChange={(e) => setEvalForm({ ...evalForm, [key]: e.target.value })} /></label>)}<div className="total-box"><p>Total</p><h2>{total}/100</h2></div></div>
        <input value={evalForm.comments} onChange={(e) => setEvalForm({ ...evalForm, comments: e.target.value })} placeholder="Committee comments" />
        <button className="primary" onClick={() => saveEvaluation(evalForm)}>Save Evaluation</button>
      </div>
    </div>
  )
}

function AdminDashboard({ data, projects, currentUser, updateProject, updateUserRole, updateUserStatus, exportCsv }) {
  const supervisors = data.profiles.filter((u) => u.role === 'supervisor')
  const [supervisorName, setSupervisorName] = useState(supervisors[0]?.full_name || '')
  const [userTab, setUserTab] = useState('pending')

  const pendingUsers = data.profiles.filter((u) => (u.status || 'Pending') === 'Pending')
  const activeUsers = data.profiles.filter((u) => (u.status || 'Pending') === 'Active')
  const rejectedUsers = data.profiles.filter((u) => (u.status || 'Pending') === 'Rejected')

  const usersToShow = userTab === 'pending'
    ? pendingUsers
    : userTab === 'roles'
      ? activeUsers
      : rejectedUsers

  const tabTitle = userTab === 'pending'
    ? 'Pending User Approval'
    : userTab === 'roles'
      ? 'Role Management'
      : 'Rejected Users'

  const tabSubtitle = userTab === 'pending'
    ? 'Approve or reject newly registered users before they can access the platform.'
    : userTab === 'roles'
      ? 'Change roles for approved users and manage their account status.'
      : 'Review rejected accounts and restore them if needed.'

  return (
    <div className="grid half">
      <div className="card">
        <SectionHeader icon={Users} title="User Approval and Role Management" subtitle="Separate tabs for account approval and role control" />

        <div className="admin-user-tabs">
          <button className={userTab === 'pending' ? 'active' : ''} onClick={() => setUserTab('pending')}>
            Pending Approval <span>{pendingUsers.length}</span>
          </button>
          <button className={userTab === 'roles' ? 'active' : ''} onClick={() => setUserTab('roles')}>
            Role Management <span>{activeUsers.length}</span>
          </button>
          <button className={userTab === 'rejected' ? 'active' : ''} onClick={() => setUserTab('rejected')}>
            Rejected <span>{rejectedUsers.length}</span>
          </button>
        </div>

        <div className="soft-box admin-tab-note">
          <b>{tabTitle}</b>
          <p>{tabSubtitle}</p>
        </div>

        {usersToShow.length ? usersToShow.map((u) => {
          const isCurrentAdmin = u.id === currentUser.id
          const statusTone = u.status === 'Active' ? 'green' : u.status === 'Rejected' ? 'red' : 'amber'
          return (
            <div className="mini-card user-role-row" key={u.id}>
              <div>
                <b>{u.full_name}</b>
                <p>{u.email}</p>
                <p className="small muted">Account status: <b>{u.status || 'Pending'}</b></p>
                {isCurrentAdmin && <p className="small muted">Current admin account</p>}
              </div>
              <div className="role-management">
                <Pill tone={u.role === 'admin' ? 'blue' : u.role === 'supervisor' ? 'green' : u.role === 'committee' ? 'amber' : 'slate'}>{u.role}</Pill>
                <Pill tone={statusTone}>{u.status || 'Pending'}</Pill>

                {(userTab === 'roles' || userTab === 'pending') && (
                  <select value={u.role} disabled={isCurrentAdmin} onChange={(e) => updateUserRole(u.id, e.target.value)}>
                    {roleButtons.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
                  </select>
                )}

                {userTab === 'roles' && (
                  <select value={u.status || 'Pending'} disabled={isCurrentAdmin} onChange={(e) => updateUserStatus(u.id, e.target.value)}>
                    <option value="Pending">Pending</option>
                    <option value="Active">Active / Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                )}

                {userTab === 'pending' && !isCurrentAdmin && <button className="success compact-button" onClick={() => updateUserStatus(u.id, 'Active')}>Approve</button>}
                {userTab === 'pending' && !isCurrentAdmin && <button className="danger compact-button" onClick={() => updateUserStatus(u.id, 'Rejected')}>Reject</button>}
                {userTab === 'rejected' && !isCurrentAdmin && <button className="warning compact-button" onClick={() => updateUserStatus(u.id, 'Pending')}>Move to Pending</button>}
                {userTab === 'rejected' && !isCurrentAdmin && <button className="success compact-button" onClick={() => updateUserStatus(u.id, 'Active')}>Approve</button>}
              </div>
            </div>
          )
        }) : <EmptyState title={`No ${tabTitle.toLowerCase()}`} text="Users will appear here after registration or after profiles are loaded from Supabase." icon={Users} />}
      </div>

      <div className="card">
        <SectionHeader icon={UserCog} title="Supervisor Assignment" subtitle="Assign projects to supervisors" />
        <label className="field"><span>Supervisor name</span><input value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="Write supervisor full name exactly" /></label>
        {projects.length ? projects.map((p) => <div className="mini-card" key={p.id}><div className="split"><div><b>{p.group_name}</b><p>{p.title}</p><p className="small muted">Supervisor: {p.supervisor_name}</p></div><button onClick={() => updateProject(p.id, { supervisor_name: supervisorName || 'Pending Assignment' })}>Assign</button></div></div>) : <EmptyState title="No projects to assign" text="Project assignments appear after students submit titles." icon={BookOpen} />}
        <button className="primary" onClick={exportCsv}><Download size={16} /> Export CSV Report</button>
      </div>
    </div>
  )
}

function ProjectDecisionTable({ projects, updateProject }) {
  return (
    <div className="table-wrap"><table><thead><tr><th>Project</th><th>Area</th><th>Progress</th><th>Decision</th></tr></thead><tbody>{projects.map((p) => <tr key={p.id}><td><b>{p.group_name}</b><p>{p.title}</p></td><td>{p.area}</td><td><ProgressBar value={p.progress} /><p className="small muted">{p.progress}%</p></td><td><button className="success" onClick={() => updateProject(p.id, { approval: 'Approved', status: 'Ongoing' })}>Approve</button><button className="warning" onClick={() => updateProject(p.id, { approval: 'Revision Required', status: 'Needs Attention' })}>Revise</button><button className="danger" onClick={() => updateProject(p.id, { approval: 'Rejected', status: 'Rejected' })}>Reject</button><br /><Pill tone={p.approval === 'Approved' ? 'green' : p.approval === 'Rejected' ? 'red' : 'amber'}>{p.approval}</Pill></td></tr>)}</tbody></table></div>
  )
}

function NotificationsTab({ data, role, createNotification, markNotificationRead }) {
  const [form, setForm] = useState({ title: '', message: '', type: 'Reminder', target_role: 'all' })
  const visibleNotifications = data.notifications.filter((n) => n.target_role === 'all' || n.target_role === role)
  return (
    <div className="grid two-one">
      <div className="card">
        <SectionHeader icon={Bell} title="Notifications and Reminders" subtitle="Deadline reminders and admin messages" />
        <div className="notification-list">
          {data.deadlines.map((d) => <div className="mini-card reminder" key={d.id}><div className="split"><div><b>{d.title}</b><p>{d.deadline_type} deadline on {d.due_date}</p></div><Pill tone="blue">Deadline</Pill></div></div>)}
          {visibleNotifications.length ? visibleNotifications.map((n) => <div className={`mini-card ${n.is_read ? '' : 'unread'}`} key={n.id}><div className="split"><div><b>{n.title}</b><p>{n.message}</p><p className="small muted">{n.type} • {String(n.created_at).slice(0, 16).replace('T', ' ')}</p></div><button onClick={() => markNotificationRead(n.id)}>{n.is_read ? 'Read' : 'Mark read'}</button></div></div>) : <EmptyState title="No custom notifications" text="Admin-created notifications will appear here." icon={Bell} />}
        </div>
      </div>
      {['admin', 'committee'].includes(role) ? (
        <div className="card no-print">
          <SectionHeader icon={Bell} title="Create Notification" subtitle="For admin or committee reminders" />
          <label className="field"><span>Title</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Example: Submit weekly report" /></label>
          <label className="field"><span>Message</span><textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Write reminder message" /></label>
          <label className="field"><span>Type</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Reminder</option><option>Feedback</option><option>Warning</option><option>Announcement</option></select></label>
          <label className="field"><span>Target role</span><select value={form.target_role} onChange={(e) => setForm({ ...form, target_role: e.target.value })}><option value="all">All users</option><option value="student">Students</option><option value="supervisor">Supervisors</option><option value="committee">Research Committee</option><option value="admin">Admins</option></select></label>
          <button className="primary" onClick={() => { createNotification(form); setForm({ title: '', message: '', type: 'Reminder', target_role: 'all' }) }}>Create Notification</button>
        </div>
      ) : (
        <div className="card no-print">
          <SectionHeader icon={Lock} title="Notification Creation Locked" subtitle="Only Admin and Research Committee accounts can create reminders" />
          <p className="muted">Your account can read reminders sent to your role, but it cannot create new system-wide notifications.</p>
        </div>
      )}
    </div>
  )
}

function ReportsTab({ data, projects, currentUser, role, printPdfReport, exportCsv }) {
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="stack">
      <div className="card no-print">
        <SectionHeader icon={Printer} title="Print / Export PDF Reports" subtitle="Use the browser print dialog and choose Save as PDF" />
        <div className="action-row report-actions"><button className="primary" onClick={printPdfReport}><Printer size={16} /> Print / Save as PDF</button><button className="secondary" onClick={exportCsv}><Download size={16} /> Export CSV</button></div>
      </div>
      <div className="card print-report">
        <div className="report-header">
          <h2>Hawler Medical University – College of Pharmacy</h2>
          <h1>Pharmacy Research Project Management Report</h1>
          <p>Generated by: {currentUser.full_name} • Date: {today}</p>
        </div>
        <section className="report-section"><h3>Summary</h3><div className="report-grid">{role === 'admin' && <p><b>Total users:</b> {data.profiles.length}</p>}<p><b>Visible projects:</b> {data.projects.length}</p><p><b>Filtered projects:</b> {projects.length}</p><p><b>Weekly reports:</b> {data.reports.length}</p></div></section>
        <section className="report-section"><h3>Project List</h3>{projects.length ? <div className="table-wrap"><table><thead><tr><th>Group</th><th>Title</th><th>Area</th><th>Supervisor</th><th>Status</th><th>Progress</th></tr></thead><tbody>{projects.map((p) => <tr key={p.id}><td>{p.group_name}</td><td>{p.title}</td><td>{p.area}</td><td>{p.supervisor_name}</td><td>{p.approval}</td><td>{p.progress}%</td></tr>)}</tbody></table></div> : <p>No projects match the current filter.</p>}</section>
        <section className="report-section"><h3>Deadlines</h3>{data.deadlines.map((d) => <p key={d.id}><b>{d.title}</b> — {d.deadline_type}, due {d.due_date}</p>)}</section>
      </div>
    </div>
  )
}

function DeadlinesCard({ deadlines }) {
  return <div className="card"><SectionHeader icon={CalendarDays} title="Deadlines" subtitle="Upcoming milestones" />{deadlines.map((d) => <div className="mini-card" key={d.id}><b>{d.title}</b><p>{d.deadline_type} • {d.due_date}</p></div>)}</div>
}

function ProjectCard({ project }) {
  return (
    <div className="card project-card">
      <div className="split"><p className="muted small bold">{project.group_name}</p><Pill tone={project.status === 'Needs Attention' ? 'amber' : project.status === 'Rejected' ? 'red' : 'green'}>{project.status}</Pill></div>
      <h3>{project.area}</h3>
      <p>{project.title}</p>
      <div className="progress-row"><span>Progress</span><span>{project.progress}%</span></div>
      <ProgressBar value={project.progress} />
    </div>
  )
}

function DatabaseTab({ databaseMode }) {
  const tables = ['profiles', 'research_projects', 'weekly_reports', 'uploaded_files', 'evaluations', 'deadlines', 'notifications', 'audit_logs']
  const connected = String(databaseMode || '').toLowerCase().includes('supabase')
  return (
    <div className="stack">
      <div className="card">
        <SectionHeader icon={Database} title="Database Status" subtitle="Admin-only overview of connected system data" />
        <div className="soft-box">
          <p><CheckCircle2 size={16} /> Current database mode: <b>{databaseMode}</b></p>
          <p className="muted">{connected ? 'Supabase is connected. The platform can store and manage real user, project, report, evaluation, notification, and audit data.' : 'The app is currently using local demo storage. Add Supabase keys in .env.local to connect the real database.'}</p>
        </div>
      </div>
      <div className="card">
        <SectionHeader icon={Database} title="Core Database Tables" subtitle="Tables used by the Pharmacy Research Project Management System" />
        <div className="table-wrap"><table><thead><tr><th>Core Table</th><th>Purpose</th></tr></thead><tbody>{tables.map((t) => <tr key={t}><td><code>{t}</code></td><td>Stores and manages {t.replaceAll('_', ' ')} data.</td></tr>)}</tbody></table></div>
        <div className="soft-box"><p><Lock size={16} /> Database information is visible only to Admin accounts.</p></div>
      </div>
    </div>
  )
}

function AuditTab({ logs }) {
  return <div className="card"><SectionHeader icon={ShieldCheck} title="Audit Log" subtitle="Records important actions" />{logs.length ? logs.map((log) => <div className="mini-card" key={log.id}><b>{log.actor}</b> {log.action} <b>{log.entity}</b><p className="small muted">{String(log.created_at).slice(0, 16).replace('T', ' ')}</p></div>) : <EmptyState title="No audit records" text="Important actions will appear here after users start using the platform." icon={ShieldCheck} />}</div>
}

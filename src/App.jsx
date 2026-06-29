import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  Image as ImageIcon,
  GraduationCap,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageSquareText,
  Printer,
  Search,
  Save,
  Settings,
  ShieldCheck,
  Upload,
  UserPlus,
  SlidersHorizontal,
  Mail,
  Send,
  Eye,
  RefreshCw,
  XCircle,
  Copy,
  Clock,
  UserCog,
  Users,
  Trash2,
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from './lib/supabaseClient'

const roleButtons = [
  { id: 'student', label: 'Student', icon: GraduationCap },
  { id: 'supervisor', label: 'Supervisor', icon: ClipboardCheck },
  { id: 'committee', label: 'Research Committee', icon: ShieldCheck },
  { id: 'admin', label: 'Admin', icon: UserCog },
]

const invitationRoles = [
  { id: 'student', label: 'Student' },
  { id: 'supervisor', label: 'Supervisor' },
  { id: 'committee', label: 'Research Committee Member' },
  { id: 'admin', label: 'Admin / Editor' },
]


const DEPARTMENT_OPTIONS = [
  'Clinical Analysis',
  'Clinical Pharmacy',
  'Pharmaceutical Chemistry and Pharmacognosy',
  'Pharmaceutics',
  'Pharmacology',
]

const DEFAULT_DEPARTMENT = DEPARTMENT_OPTIONS[0]

function normalizeDepartment(value, fallback = DEFAULT_DEPARTMENT) {
  return DEPARTMENT_OPTIONS.includes(value) ? value : fallback
}

const loginFontOptions = [
  { value: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", label: 'Default / Inter' },
  { value: "Arial, Helvetica, sans-serif", label: 'Arial' },
  { value: "Georgia, 'Times New Roman', serif", label: 'Georgia' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { value: "Verdana, Geneva, sans-serif", label: 'Verdana' },
  { value: "Tahoma, Geneva, sans-serif", label: 'Tahoma' },
  { value: "'Courier New', Courier, monospace", label: 'Courier New' },
]

const invitationTemplates = {
  student: {
    subject: 'Invitation to join Pharmacy Research Platform as a Student',
    body: 'Dear [Name], you are invited to join our platform as a Student. Please click the link below to create your account and access your dashboard.',
  },
  supervisor: {
    subject: 'Invitation to join Pharmacy Research Platform as a Supervisor',
    body: 'Dear [Name], you are invited to join our platform as a Supervisor. Please click the link below to create your account and manage assigned students or projects.',
  },
  committee: {
    subject: 'Invitation to join Pharmacy Research Platform as a Research Committee Member',
    body: 'Dear [Name], you are invited to join our platform as a Research Committee Member. Please click the link below to create your account and review submitted research projects.',
  },
  admin: {
    subject: 'Invitation to join Pharmacy Research Platform as an Admin / Editor',
    body: 'Dear [Name], you are invited to join our platform as an Admin/Editor. Please click the link below to create your account and manage website settings, users, and system content.',
  },
}

function getRoleLabel(role) {
  return invitationRoles.find((item) => item.id === role)?.label || roleButtons.find((item) => item.id === role)?.label || role || 'User'
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function makeInvitationToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const REPORT_PROGRESS_INCREMENT = 6.25

function clampProgress(value) {
  const numeric = Number(value || 0)
  return Math.max(0, Math.min(100, Number(numeric.toFixed(2))))
}

function calculateProjectProgressFromReports(reports, projectId) {
  const acceptedCount = (reports || []).filter(
    (report) => String(report.project_id) === String(projectId) && report.status === 'Accepted'
  ).length
  return clampProgress(acceptedCount * REPORT_PROGRESS_INCREMENT)
}

function formatProgress(value) {
  const numeric = clampProgress(value)
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2)
}

function getProjectProgress(project, reports = []) {
  if (!project) return 0
  return calculateProjectProgressFromReports(reports, project.id)
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.readAsDataURL(file)
  })
}

function sanitizeFileName(name) {
  return String(name || 'attachment')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 140)
}

async function makeLocalReportAttachment(file, projectId, reportId, user = null) {
  if (!file) return null
  const dataUrl = await readFileAsDataUrl(file)
  return {
    id: crypto.randomUUID(),
    project_id: projectId,
    report_id: reportId,
    file_type: 'Weekly Report Evidence',
    file_name: file.name,
    file_path: '',
    file_url: dataUrl,
    file_mime_type: file.type || 'application/octet-stream',
    uploaded_by: user?.id || null,
    uploaded_by_email: user?.email || '',
    created_by: user?.id || null,
    created_at: new Date().toISOString(),
  }
}

function getReportAttachment(report, uploadedFiles = []) {
  if (!report) return null
  const linkedFile = (uploadedFiles || []).find((file) => String(file.report_id) === String(report.id))
  return linkedFile || report.attachment || null
}

function getAttachmentUrl(attachment) {
  if (!attachment) return ''
  if (attachment.file_url) return attachment.file_url
  if (attachment.file_data_url) return attachment.file_data_url
  if (attachment.dataUrl) return attachment.dataUrl
  if (attachment.file_path && isSupabaseConfigured) {
    const { data } = supabase.storage.from('project-files').getPublicUrl(attachment.file_path)
    return data?.publicUrl || ''
  }
  return ''
}

function DeleteItemButton({ onDelete, label = 'Delete' }) {
  return (
    <button className="danger compact-button delete-item-button" type="button" onClick={onDelete}>
      <Trash2 size={14} /> {label}
    </button>
  )
}

function EmailReportButton({ onSend, loading = false }) {
  return (
    <button className="secondary compact-button email-report-button" type="button" onClick={onSend} disabled={loading}>
      <Mail size={14} /> {loading ? 'Sending...' : 'Send to My Email'}
    </button>
  )
}

function ReportAttachmentBox({ attachment, canDelete = false, onDelete }) {
  const url = getAttachmentUrl(attachment)
  if (!attachment) return <div className="report-attachment empty">No attachment uploaded.</div>
  return (
    <div className="report-attachment">
      <div>
        <b>{attachment.file_name || 'Attached file'}</b>
        <p className="muted small">Weekly report attachment</p>
      </div>
      <div className="attachment-actions">
        {url ? (
          <>
            <a className="secondary compact-link" href={url} target="_blank" rel="noreferrer">View</a>
            <a className="primary compact-link" href={url} download={attachment.file_name || true}>Download</a>
          </>
        ) : <span className="muted small">File link unavailable</span>}
        {canDelete && onDelete && <DeleteItemButton label="Delete File" onDelete={onDelete} />}
      </div>
    </div>
  )
}

function getInvitationDisplayStatus(invitation) {
  if (!invitation) return 'Pending'
  if (invitation.status === 'Pending' && invitation.expires_at && new Date(invitation.expires_at) < new Date()) return 'Expired'
  return invitation.status || 'Pending'
}

function makeInvitationLink(token) {
  if (typeof window === 'undefined') return `/?invite=${token}`
  return `${window.location.origin}/?invite=${encodeURIComponent(token)}`
}

function buildInvitationEmail(invitation, settings = defaultWebsiteSettings) {
  const link = invitation.invitation_link || makeInvitationLink(invitation.token)
  const expiry = invitation.expires_at ? new Date(invitation.expires_at).toLocaleDateString() : '7 days from today'
  const bodyText = String(invitation.body || '')
    .replaceAll('[Name]', invitation.full_name || 'Colleague')
    .replaceAll('[Role]', getRoleLabel(invitation.role))
    .replaceAll('[Link]', link)
    .replaceAll('[Expiration Date]', expiry)
    .replaceAll('[Website Name]', settings.siteName || 'Pharmacy Research Platform')
  return `${bodyText}\n\nAssigned role: ${getRoleLabel(invitation.role)}\nSecure invitation link: ${link}\nExpiration date: ${expiry}\n\n${settings.siteName || 'Pharmacy Research Platform'}\nContact: College of Pharmacy, Hawler Medical University`
}

const defaultWebsiteSettings = {
  siteName: 'Pharmacy Research Platform',
  adminPanelName: 'Pharmacy Research Platform Control Center',
  homepageHeadline: 'A web-based Pharmacy Research Project Management System',
  homepageSubtitle: 'For 5th-year students at Hawler Medical University, College of Pharmacy.',
  heroImage: '/hero-page.png',
  loginHeroImage: '/hero-page.png',
  loginBackgroundImage: '/hero-page.png',
  loginLogoImage: '',
  loginWelcomeTitle: 'Welcome to Research Platform',
  loginWelcomeSubtitle: 'Publish your groundbreaking research and connect with scholars worldwide.',
  loginFeatureOne: 'Open Access Publishing',
  loginFeatureTwo: 'Peer Review Excellence',
  loginFeatureThree: 'Global Research Community',
  loginWelcomeTitleFontSize: 70,
  loginWelcomeTitleColor: '#ffffff',
  loginWelcomeTitleFontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  loginWelcomeTitleBold: true,
  loginWelcomeTitleItalic: false,
  loginDescriptionFontSize: 19,
  loginDescriptionColor: '#ffffff',
  loginDescriptionFontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  loginDescriptionBold: false,
  loginDescriptionItalic: false,
  loginFeatureFontSize: 18,
  loginFeatureColor: '#ffffff',
  loginFeatureFontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  loginFeatureBold: true,
  loginFeatureItalic: false,
  loginGradientStart: '#0d9488',
  loginGradientEnd: '#2563eb',
  loginCircleColor: '#ffffff',
  loginShowGradientOverlay: true,
  loginShowCircles: true,
  adminWelcome: 'Manage website content, user access, deadlines, projects, database status, and audit activity from one admin control panel.',
  maintenanceNotice: '',
}

const PDF_REPORT_SETTINGS_KEY = 'pdf_report'

const defaultPdfReportSections = {
  userInformation: true,
  studentInformation: true,
  supervisorInformation: true,
  researchGroup: true,
  researchTitle: true,
  weeklyReports: true,
  feedback: true,
  projectProgress: true,
  deadlines: true,
  finalEvaluationRubric: true,
  signatures: true,
  generatedDateTime: true,
}

const defaultPdfReportSettings = {
  logoUrl: '',
  logoPath: '',
  reportTitle: 'Pharmacy Research Project Management Report',
  headerText: 'Hawler Medical University – College of Pharmacy',
  universityName: 'Hawler Medical University',
  collegeName: 'College of Pharmacy',
  departmentName: 'Department of Pharmacy',
  footerText: '',
  showPageNumbers: true,
  showGeneratedDateTime: true,
  sections: defaultPdfReportSections,
}

const pdfReportSectionLabels = [
  ['userInformation', 'User information'],
  ['studentInformation', 'Student information'],
  ['supervisorInformation', 'Supervisor information'],
  ['researchGroup', 'Research group'],
  ['researchTitle', 'Research title'],
  ['weeklyReports', 'Weekly reports'],
  ['feedback', 'Feedback'],
  ['projectProgress', 'Project progress'],
  ['deadlines', 'Deadlines'],
  ['finalEvaluationRubric', 'Final evaluation rubric'],
  ['signatures', 'Signatures'],
  ['generatedDateTime', 'Generated date/time'],
]

function normalizePdfReportSettings(settings) {
  const next = { ...defaultPdfReportSettings, ...(settings || {}) }
  next.sections = { ...defaultPdfReportSections, ...((settings && settings.sections) || {}) }
  return next
}

function loadPdfReportSettings() {
  try {
    const saved = localStorage.getItem('pharmatrack-pdf-report-settings')
    return saved ? normalizePdfReportSettings(JSON.parse(saved)) : defaultPdfReportSettings
  } catch {
    return defaultPdfReportSettings
  }
}

function savePdfReportSettingsLocal(settings) {
  localStorage.setItem('pharmatrack-pdf-report-settings', JSON.stringify(normalizePdfReportSettings(settings)))
}

function normalizeSettings(settings) {
  return { ...defaultWebsiteSettings, ...(settings || {}) }
}

function loadWebsiteSettings() {
  try {
    const saved = localStorage.getItem('pharmatrack-website-settings')
    return saved ? normalizeSettings(JSON.parse(saved)) : defaultWebsiteSettings
  } catch {
    return defaultWebsiteSettings
  }
}

function saveWebsiteSettingsLocal(settings) {
  localStorage.setItem('pharmatrack-website-settings', JSON.stringify(normalizeSettings(settings)))
}


function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read the selected image.'))
    reader.readAsDataURL(file)
  })
}

function optimizeImageFile(file, options = {}) {
  const maxWidth = options.maxWidth || 1800
  const maxHeight = options.maxHeight || 1200
  const quality = options.quality || 0.82
  const outputType = options.outputType || 'image/jpeg'

  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('Please choose a valid image file.'))
      return
    }

    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      try {
        let { width, height } = img
        const scale = Math.min(1, maxWidth / width, maxHeight / height)
        width = Math.max(1, Math.round(width * scale))
        height = Math.max(1, Math.round(height * scale))

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Could not prepare the image preview.')
        ctx.drawImage(img, 0, 0, width, height)
        URL.revokeObjectURL(objectUrl)

        const optimized = canvas.toDataURL(outputType, quality)
        resolve(optimized)
      } catch (error) {
        URL.revokeObjectURL(objectUrl)
        reject(error)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not load the selected image. Try another JPG or PNG file.'))
    }
    img.src = objectUrl
  })
}

const adminPanelTabs = ['overview', 'branding', 'login-settings', 'users', 'invitations', 'deadlines', 'notifications', 'reports', 'pdf-report', 'database', 'audit']

const adminPanelPathAliases = {
  '': 'overview',
  admin: 'overview',
  overview: 'overview',
  dashboard: 'overview',
  branding: 'branding',
  settings: 'branding',
  website: 'branding',
  'website-settings': 'branding',
  login: 'login-settings',
  'login-settings': 'login-settings',
  users: 'users',
  roles: 'users',
  'users-roles': 'users',
  'users-and-roles': 'users',
  invitations: 'invitations',
  invite: 'invitations',
  deadlines: 'deadlines',
  notifications: 'notifications',
  reports: 'reports',
  'pdf-report': 'pdf-report',
  pdf: 'pdf-report',
  'pdf-customization': 'pdf-report',
  'pdf-report-customization': 'pdf-report',
  print: 'pdf-report',
  'print-pdf': 'pdf-report',
  database: 'database',
  audit: 'audit',
  'audit-log': 'audit',
}

function isAdminPanelTab(value) {
  return adminPanelTabs.includes(value)
}

function getInitialAdminPanelTab() {
  if (typeof window === 'undefined') return 'overview'
  const params = new URLSearchParams(window.location.search)
  const queryTab = params.get('panel') || params.get('tab')
  if (isAdminPanelTab(queryTab)) return queryTab

  const hashTab = String(window.location.hash || '').replace('#', '').trim().toLowerCase()
  if (isAdminPanelTab(hashTab)) return hashTab
  if (adminPanelPathAliases[hashTab]) return adminPanelPathAliases[hashTab]

  const parts = window.location.pathname.split('/').map((part) => part.trim().toLowerCase()).filter(Boolean)
  const lastPart = parts[parts.length - 1] || ''
  return adminPanelPathAliases[lastPart] || 'overview'
}

function isAdminPortalRequest() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.toLowerCase()
  const params = new URLSearchParams(window.location.search)
  const parts = window.location.pathname.split('/').map((part) => part.trim().toLowerCase()).filter(Boolean)
  const firstPart = parts[0] || ''
  const lastPart = parts[parts.length - 1] || ''
  return (
    host.startsWith('admin.') ||
    firstPart === 'admin' ||
    params.get('admin') === 'true' ||
    params.get('panel') === 'users' ||
    params.get('tab') === 'users' ||
    ['users', 'roles', 'users-roles', 'users-and-roles'].includes(lastPart)
  )
}

const emptyData = {
  profiles: [],
  projects: [],
  reports: [],
  uploadedFiles: [],
  deadlines: [
    { id: 'd1', title: 'Weekly Research Report', deadline_type: 'Weekly Report', due_date: '2026-05-11', status: 'Active' },
    { id: 'd2', title: 'Proposal Final Version', deadline_type: 'Proposal', due_date: '2026-05-18', status: 'Active' },
    { id: 'd3', title: 'Final Thesis Submission', deadline_type: 'Final Thesis', due_date: '2026-06-20', status: 'Active' },
    { id: 'd4', title: 'Poster and Presentation', deadline_type: 'Presentation', due_date: '2026-06-27', status: 'Active' },
  ],
  notifications: [],
  evaluations: [],
  auditLogs: [],
  invitations: [],
}

const sampleNames = ['Aveen Mohammed', 'Hemn Karim', 'Dr. Lara Ahmed', 'Dr. Rebaz Hassan', 'College Admin']
const sampleEmails = ['aveen@hmu.edu.krd', 'hemn@hmu.edu.krd', 'lara.ahmed@hmu.edu.krd', 'rebaz.hassan@hmu.edu.krd', 'admin.pharmacy@hmu.edu.krd']

function cleanData(data) {
  const cleaned = { ...emptyData, ...data }
  cleaned.profiles = (cleaned.profiles || []).filter(
    (u) => !sampleNames.includes(u.full_name) && !sampleEmails.includes(u.email)
  )
  cleaned.reports = cleaned.reports || []
  cleaned.projects = (cleaned.projects || []).map((project) => ({
    ...project,
    progress: getProjectProgress(project, cleaned.reports),
  }))
  cleaned.uploadedFiles = cleaned.uploadedFiles || []
  cleaned.deadlines = cleaned.deadlines?.length ? cleaned.deadlines : emptyData.deadlines
  cleaned.notifications = cleaned.notifications || []
  cleaned.evaluations = cleaned.evaluations || []
  cleaned.auditLogs = cleaned.auditLogs || []
  cleaned.invitations = cleaned.invitations || []
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
    const sessionSaved = sessionStorage.getItem('pharmatrack-current-user-session')
    if (sessionSaved) return JSON.parse(sessionSaved)

    const saved = localStorage.getItem('pharmatrack-current-user')
    if (!saved) return null
    const parsed = JSON.parse(saved)
    if (parsed?.expires_at && new Date(parsed.expires_at) < new Date()) {
      localStorage.removeItem('pharmatrack-current-user')
      return null
    }
    return parsed?.user || parsed || null
  } catch {
    return null
  }
}

function saveCurrentUser(user, rememberFor30Days = false) {
  localStorage.removeItem('pharmatrack-current-user')
  sessionStorage.removeItem('pharmatrack-current-user-session')
  if (!user) return
  if (rememberFor30Days) {
    const expiresAt = addDays(new Date(), 30).toISOString()
    localStorage.setItem('pharmatrack-current-user', JSON.stringify({ user, expires_at: expiresAt }))
  } else {
    sessionStorage.setItem('pharmatrack-current-user-session', JSON.stringify(user))
  }
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
  const userId = normalizeText(user.id)
  const userName = normalizeText(user.full_name)
  const userEmail = normalizeText(user.email)
  const studentIds = [project.student_id, project.user_id, project.owner_id, project.created_by]
    .map(normalizeText)
    .filter(Boolean)
  const studentEmails = [project.student_email, project.owner_email, project.created_by_email, project.submitted_by_email]
    .map(normalizeText)
    .filter(Boolean)
  const students = getProjectStudents(project).map(normalizeText)
  const legacyHasNoOwner = !studentIds.length && !studentEmails.length

  if (userId && studentIds.includes(userId)) return true
  if (userEmail && studentEmails.includes(userEmail)) return true

  // Legacy support for older projects created before user IDs were saved.
  // This fallback is intentionally exact to avoid one student matching another student's data.
  if (legacyHasNoOwner) {
    const createdBy = normalizeText(project.student_name || project.submitted_by || project.created_by_name)
    const groupName = normalizeText(project.group_name)
    return (
      (!!userName && (createdBy === userName || groupName === userName || students.includes(userName))) ||
      (!!userEmail && (createdBy === userEmail || students.includes(userEmail)))
    )
  }

  return false
}

function isAssignedSupervisorProject(project, user) {
  if (!project || !user) return false
  const supervisorId = normalizeText(project.supervisor_id || project.supervisor_user_id)
  const supervisorName = normalizeText(project.supervisor_name || project.supervisor || project.assigned_supervisor)
  const supervisorEmail = normalizeText(project.supervisor_email)
  return (
    (!!user.id && supervisorId === normalizeText(user.id)) ||
    (!!user.email && supervisorEmail === normalizeText(user.email)) ||
    (!!user.full_name && supervisorName === normalizeText(user.full_name))
  )
}

function getVisibleProjects(projects, role, user) {
  if (role === 'admin' || role === 'committee') return projects
  if (role === 'supervisor') return projects.filter((project) => isAssignedSupervisorProject(project, user))
  if (role === 'student') return projects.filter((project) => isOwnStudentProject(project, user))
  return []
}

function getVisibleReports(reports, visibleProjects, role, user) {
  const projectIds = new Set(visibleProjects.map((project) => String(project.id)))
  if (role === 'admin' || role === 'committee') return reports
  if (role === 'student') {
    return reports.filter((report) => projectIds.has(String(report.project_id)) && reportOwnedByUser(report, user))
  }
  if (role === 'supervisor') {
    return reports.filter((report) => projectIds.has(String(report.project_id)))
  }
  return []
}

function isAdminUser(user) {
  return user?.role === 'admin'
}

function userTextMatches(value, user) {
  const target = normalizeText(value)
  if (!target || !user) return false
  const fullName = normalizeText(user.full_name)
  const email = normalizeText(user.email)
  return (!!fullName && target === fullName) || (!!email && target === email)
}

function userIdMatches(value, user) {
  return !!value && !!user?.id && String(value) === String(user.id)
}

function reportOwnedByUser(report, user) {
  if (!report || !user) return false
  const userId = normalizeText(user.id)
  const userEmail = normalizeText(user.email)
  const ownerIds = [report.submitted_by_id, report.student_id, report.user_id, report.created_by, report.uploaded_by]
    .map(normalizeText)
    .filter(Boolean)
  const ownerEmails = [report.submitted_by_email, report.student_email, report.created_by_email, report.uploaded_by_email]
    .map(normalizeText)
    .filter(Boolean)
  const legacyHasNoOwner = !ownerIds.length && !ownerEmails.length

  if (userId && ownerIds.includes(userId)) return true
  if (userEmail && ownerEmails.includes(userEmail)) return true

  // Legacy support for older local records only when no owner ID/email exists.
  return legacyHasNoOwner && userTextMatches(report.submitted_by, user)
}

function canDeleteReport(report, user) {
  return isAdminUser(user)
}

function uploadedFileOwnedByUser(file, user, reports = []) {
  if (!file || !user) return false
  const linkedReport = reports.find((report) => String(report.id) === String(file.report_id))
  return (
    userIdMatches(file.uploaded_by, user) ||
    userIdMatches(file.created_by, user) ||
    userIdMatches(file.user_id, user) ||
    userTextMatches(file.uploaded_by_email, user) ||
    userTextMatches(file.created_by_email, user) ||
    reportOwnedByUser(linkedReport, user)
  )
}

function canDeleteUploadedFile(file, user, reports = []) {
  return isAdminUser(user)
}

function canDeleteUserAccount(targetUser, currentUser) {
  if (!isAdminUser(currentUser) || !targetUser) return false
  if (String(targetUser.id) === String(currentUser.id)) return false
  if (targetUser.role === 'admin') return false
  return true
}

function canDeleteResearchProject(project, currentUser) {
  return isAdminUser(currentUser) && Boolean(project?.id)
}

function canDeleteResearchGroup(groupName, currentUser) {
  return isAdminUser(currentUser) && Boolean(String(groupName || '').trim())
}

function getProjectGroupSummaries(projects = []) {
  const grouped = new Map()
  ;(projects || []).forEach((project) => {
    const groupName = project.group_name || 'Unnamed Research Group'
    const existing = grouped.get(groupName) || { group_name: groupName, count: 0, projects: [] }
    existing.count += 1
    existing.projects.push(project)
    grouped.set(groupName, existing)
  })
  return Array.from(grouped.values()).sort((a, b) => a.group_name.localeCompare(b.group_name))
}


function listValue(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && String(item).trim() !== '')
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed.slice(1, -1).split(',').map((item) => item.replace(/^"|"$/g, '').trim()).filter(Boolean)
    }
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function makeStudentOptionKey(student = {}) {
  if (student.id) return `id:${student.id}`
  if (student.email) return `email:${normalizeText(student.email)}`
  return `name:${normalizeText(student.name || student.full_name || 'unknown-student')}`
}

function upsertStudentOption(map, student = {}, fallback = {}) {
  const name = student.name || student.full_name || fallback.name || fallback.group || 'Unknown student'
  const email = student.email || fallback.email || ''
  const id = student.id || fallback.id || null
  const group = fallback.group || student.group || 'No research group'
  const key = makeStudentOptionKey({ id, email, name })
  if (!map.has(key)) {
    map.set(key, { key, id, email, name, group })
    return
  }
  const existing = map.get(key)
  map.set(key, {
    ...existing,
    id: existing.id || id,
    email: existing.email || email,
    name: existing.name || name,
    group: existing.group || group,
  })
}

function getAssignedSupervisorStudents(data, assignedProjects = [], reports = []) {
  const students = new Map()
  const assignedProjectList = assignedProjects || []
  const projectIds = new Set(assignedProjectList.map((project) => String(project.id)))
  const studentProfiles = (data.profiles || []).filter((profile) => profile.role === 'student')

  assignedProjectList.forEach((project) => {
    const explicitStudent = findProfileByIdentity(data, {
      id: project.student_id || project.created_by,
      email: project.student_email || project.created_by_email,
      submitted_by: project.student_name,
    })
    if (explicitStudent?.role === 'student' || explicitStudent?.id || explicitStudent?.email) {
      upsertStudentOption(students, explicitStudent || {}, {
        id: project.student_id || project.created_by || null,
        email: project.student_email || project.created_by_email || '',
        name: explicitStudent?.full_name || project.student_name || project.group_name || 'Student',
        group: project.group_name,
      })
    }

    const projectStudentNames = getProjectStudents(project)
    projectStudentNames.forEach((studentName) => {
      const matchedProfile = studentProfiles.find((profile) => normalizeText(profile.full_name) === normalizeText(studentName) || normalizeText(profile.email) === normalizeText(studentName))
      upsertStudentOption(students, matchedProfile || {}, {
        id: matchedProfile?.id || null,
        email: matchedProfile?.email || '',
        name: matchedProfile?.full_name || studentName,
        group: project.group_name,
      })
    })

    if (!project.student_id && !project.created_by && !project.student_email && !project.created_by_email && !projectStudentNames.length && project.group_name) {
      const matchedProfile = studentProfiles.find((profile) => normalizeText(profile.full_name) === normalizeText(project.group_name))
      if (matchedProfile) {
        upsertStudentOption(students, matchedProfile, { group: project.group_name })
      }
    }
  })

  ;(reports || []).filter((report) => projectIds.has(String(report.project_id))).forEach((report) => {
    const project = assignedProjectList.find((item) => String(item.id) === String(report.project_id))
    const student = findStudentProfileForReport(data, report)
    upsertStudentOption(students, student || {}, {
      id: report.student_id || report.submitted_by_id || report.user_id || report.created_by || null,
      email: report.student_email || report.submitted_by_email || report.created_by_email || '',
      name: report.submitted_by || student?.full_name || 'Unknown student',
      group: project?.group_name || 'No research group',
    })
  })

  return Array.from(students.values())
    .filter((student) => student.id || student.email || student.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function itemMatchesStudentOption(item = {}, student = {}) {
  if (!item || !student) return false
  const ids = [item.student_id, item.submitted_by_id, item.user_id, item.created_by, item.owner_id, item.uploaded_by]
    .map(normalizeText)
    .filter(Boolean)
  const emails = [item.student_email, item.submitted_by_email, item.created_by_email, item.owner_email, item.uploaded_by_email]
    .map(normalizeText)
    .filter(Boolean)
  const names = [item.submitted_by, item.student_name, item.group_name, item.created_by_name]
    .map(normalizeText)
    .filter(Boolean)
  return (
    (!!student.id && ids.includes(normalizeText(student.id))) ||
    (!!student.email && emails.includes(normalizeText(student.email))) ||
    (!!student.name && names.includes(normalizeText(student.name)))
  )
}

function projectMatchesStudentOption(project = {}, student = {}, reports = []) {
  if (itemMatchesStudentOption(project, student)) return true
  const projectReports = (reports || []).filter((report) => String(report.project_id) === String(project.id))
  return projectReports.some((report) => itemMatchesStudentOption(report, student))
}

function deadlineTargetsStudent(deadline = {}, user = {}) {
  const targetIds = listValue(deadline.target_student_ids).map(normalizeText)
  const targetEmails = listValue(deadline.target_student_emails).map(normalizeText)
  const targetKeys = listValue(deadline.target_student_keys).map(normalizeText)
  const targetNames = listValue(deadline.target_student_names).map(normalizeText)
  const userId = normalizeText(user?.id)
  const userEmail = normalizeText(user?.email)
  const userName = normalizeText(user?.full_name)
  return (
    (!!userId && (targetIds.includes(userId) || targetKeys.includes(`id:${userId}`))) ||
    (!!userEmail && (targetEmails.includes(userEmail) || targetKeys.includes(`email:${userEmail}`))) ||
    (!!userName && (targetNames.includes(userName) || targetKeys.includes(`name:${userName}`)))
  )
}

function hasDeadlineTargets(deadline = {}) {
  return [deadline.target_student_ids, deadline.target_student_emails, deadline.target_student_keys, deadline.target_student_names].some((value) => listValue(value).length)
}

function deadlineVisibleToUser(deadline, role, user) {
  if (!deadline || !user) return false
  if (role === 'admin' || role === 'committee') return true
  if (role === 'student') {
    if (hasDeadlineTargets(deadline)) return deadlineTargetsStudent(deadline, user)
    return true
  }
  if (role === 'supervisor') {
    const userId = normalizeText(user.id)
    const userEmail = normalizeText(user.email)
    return (
      (!!userId && normalizeText(deadline.created_by) === userId) ||
      (!!userId && normalizeText(deadline.supervisor_id) === userId) ||
      (!!userEmail && normalizeText(deadline.created_by_email) === userEmail) ||
      (!!userEmail && normalizeText(deadline.supervisor_email) === userEmail) ||
      !hasDeadlineTargets(deadline)
    )
  }
  return false
}

function getVisibleDeadlines(deadlines = [], role, user) {
  return (deadlines || []).filter((deadline) => deadlineVisibleToUser(deadline, role, user))
}

function findProfileForUser(data, user) {
  if (!user) return null
  return (data.profiles || []).find((profile) =>
    userIdMatches(profile.id, user) ||
    userTextMatches(profile.email, user) ||
    userTextMatches(profile.full_name, user)
  ) || null
}

function findProfileByIdentity(data, identity = {}) {
  const id = identity.id || identity.user_id || identity.profile_id
  const email = normalizeText(identity.email || identity.submitted_by_email || identity.recipient_email)
  const name = normalizeText(identity.full_name || identity.name || identity.submitted_by)
  return (data.profiles || []).find((profile) =>
    (!!id && String(profile.id) === String(id)) ||
    (!!email && normalizeText(profile.email) === email) ||
    (!!name && normalizeText(profile.full_name) === name)
  ) || null
}

function findStudentProfileForReport(data, report) {
  const found = findProfileByIdentity(data, {
    id: report?.submitted_by_id || report?.student_id || report?.user_id,
    email: report?.submitted_by_email || report?.student_email,
    submitted_by: report?.submitted_by,
  })
  if (found) return found
  if (report?.submitted_by_id || report?.student_id || report?.user_id || report?.submitted_by_email || report?.student_email) {
    return {
      id: report?.submitted_by_id || report?.student_id || report?.user_id || null,
      full_name: report?.submitted_by || 'Student',
      email: report?.submitted_by_email || report?.student_email || '',
      role: 'student',
    }
  }
  return null
}


function getAssignedStudentsForProject(data, project) {
  if (!project) return []
  return getAssignedSupervisorStudents(data, [project], [])
}

function reportMatchesAssignedStudent(report = {}, assignedStudents = []) {
  if (!report || !assignedStudents.length) return false
  return assignedStudents.some((student) => itemMatchesStudentOption(report, student))
}

function supervisorCanAccessReport(data, report, supervisorUser) {
  if (!report || !supervisorUser || supervisorUser.role !== 'supervisor') return false
  const project = (data.projects || []).find((item) => String(item.id) === String(report.project_id))
  if (!project || !isAssignedSupervisorProject(project, supervisorUser)) return false
  const assignedStudents = getAssignedStudentsForProject(data, project)
  return reportMatchesAssignedStudent(report, assignedStudents)
}

function getSupervisorAllowedReports(data, assignedProjects = [], supervisorUser) {
  const assignedProjectMap = new Map((assignedProjects || []).map((project) => [String(project.id), project]))
  return (data.reports || []).filter((report) => {
    const project = assignedProjectMap.get(String(report.project_id))
    if (!project || !isAssignedSupervisorProject(project, supervisorUser)) return false
    const assignedStudents = getAssignedStudentsForProject(data, project)
    return reportMatchesAssignedStudent(report, assignedStudents)
  })
}

function getSupervisorProgressProjects(data, assignedProjects = []) {
  return (assignedProjects || []).filter((project) => getAssignedStudentsForProject(data, project).length > 0)
}

function findSupervisorProfileForProject(data, project) {
  if (!project) return null
  const supervisorId = project.supervisor_id || project.supervisor_user_id
  const supervisorEmail = normalizeText(project.supervisor_email)
  const supervisorName = normalizeText(project.supervisor_name || project.supervisor || project.assigned_supervisor)
  const found = (data.profiles || []).find((profile) =>
    (!!supervisorId && String(profile.id) === String(supervisorId)) ||
    (!!supervisorEmail && normalizeText(profile.email) === supervisorEmail) ||
    (!!supervisorName && normalizeText(profile.full_name) === supervisorName)
  )
  if (found) return found
  if (supervisorId || supervisorEmail || supervisorName) {
    return {
      id: supervisorId || null,
      full_name: project.supervisor_name || project.supervisor || project.assigned_supervisor || 'Supervisor',
      email: project.supervisor_email || '',
      role: 'supervisor',
    }
  }
  return null
}

function canSendReportToSelf(report, project, user, data = null) {
  if (!report || !user) return false
  if (isAdminUser(user)) return true
  if (user.role === 'student') return reportOwnedByUser(report, user)
  if (user.role === 'supervisor') return data ? supervisorCanAccessReport(data, report, user) : false
  return false
}

function makeUserScopedKey(baseKey, user) {
  const identity = user?.id || user?.email || 'guest'
  return `${baseKey}-${identity}`
}

function getReviewStatusLabel(status) {
  if (status === 'Revision Required') return 'Needs Revision'
  return status || 'Updated'
}

function makeNotificationFingerprint(...parts) {
  const text = parts.map((part) => String(part ?? '')).join('|')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

function notificationForUser(notification, user, role) {
  if (!notification || !user) return false
  const recipientId = notification.recipient_user_id || notification.profile_id
  const recipientEmail = normalizeText(notification.recipient_email)
  if (recipientId && user.id && String(recipientId) === String(user.id)) return true
  if (recipientEmail && normalizeText(user.email) === recipientEmail) return true
  if (!recipientId && !recipientEmail && (notification.target_role === 'all' || notification.target_role === role)) return true
  return false
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

function LoginPage({ onLogin, onForgotPassword, message, loading, adminOnly = false, settings = defaultWebsiteSettings, invitation = null }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    role: 'student',
    remember_me: false,
  })

  useEffect(() => {
    if (!invitation) return
    setMode('register')
    setForm((current) => ({
      ...current,
      full_name: invitation.full_name || current.full_name,
      email: invitation.email || current.email,
      role: invitation.role || current.role,
    }))
  }, [invitation])

  const isRegister = mode === 'register'
  const isForgotPassword = mode === 'forgot'
  const heroSrc = settings.loginBackgroundImage || settings.loginHeroImage || settings.heroImage || '/hero-page.png'
  const logoSrc = settings.loginLogoImage || ''
  const welcomeTitle = settings.loginWelcomeTitle || 'Welcome to Research Platform'
  const welcomeSubtitle = settings.loginWelcomeSubtitle || 'Publish your groundbreaking research and connect with scholars worldwide.'
  const featureItems = [
    settings.loginFeatureOne || 'Open Access Publishing',
    settings.loginFeatureTwo || 'Peer Review Excellence',
    settings.loginFeatureThree || 'Global Research Community',
  ].filter(Boolean)

  const panelTitle = isForgotPassword
    ? 'Forgot your password?'
    : isRegister
      ? invitation ? 'Complete your invitation' : 'Create your account'
      : 'Sign in to your account'

  const panelSubtitle = isForgotPassword
    ? 'Enter your email address and we will send you a password reset link.'
    : isRegister
      ? invitation ? 'Your invitation details are pre-filled below. Complete registration to continue.' : 'Fill in your details to create your account and access the platform.'
      : 'Welcome back! Please enter your details.'

  return (
    <div className="login-page modern-login-page">
      <div className="auth-shell">
        <section className={`auth-brand-panel ${settings.loginShowCircles === false ? 'circles-hidden' : 'circles-live'}`} style={{
          '--auth-bg-image': `url(${heroSrc})`,
          '--login-bg-start': settings.loginGradientStart || defaultWebsiteSettings.loginGradientStart,
          '--login-bg-end': settings.loginGradientEnd || defaultWebsiteSettings.loginGradientEnd,
          '--login-circle-color': settings.loginCircleColor || defaultWebsiteSettings.loginCircleColor,
          '--login-overlay-opacity': settings.loginShowGradientOverlay === false ? '0' : '.86',
          '--login-circle-opacity': settings.loginShowCircles === false ? '0' : '.16',
          '--login-title-font-size': `${settings.loginWelcomeTitleFontSize || defaultWebsiteSettings.loginWelcomeTitleFontSize}px`,
          '--login-title-color': settings.loginWelcomeTitleColor || defaultWebsiteSettings.loginWelcomeTitleColor,
          '--login-title-font-family': settings.loginWelcomeTitleFontFamily || defaultWebsiteSettings.loginWelcomeTitleFontFamily,
          '--login-title-font-weight': settings.loginWelcomeTitleBold === false ? '500' : '800',
          '--login-title-font-style': settings.loginWelcomeTitleItalic ? 'italic' : 'normal',
          '--login-description-font-size': `${settings.loginDescriptionFontSize || defaultWebsiteSettings.loginDescriptionFontSize}px`,
          '--login-description-color': settings.loginDescriptionColor || defaultWebsiteSettings.loginDescriptionColor,
          '--login-description-font-family': settings.loginDescriptionFontFamily || defaultWebsiteSettings.loginDescriptionFontFamily,
          '--login-description-font-weight': settings.loginDescriptionBold ? '800' : '500',
          '--login-description-font-style': settings.loginDescriptionItalic ? 'italic' : 'normal',
          '--login-feature-font-size': `${settings.loginFeatureFontSize || defaultWebsiteSettings.loginFeatureFontSize}px`,
          '--login-feature-color': settings.loginFeatureColor || defaultWebsiteSettings.loginFeatureColor,
          '--login-feature-font-family': settings.loginFeatureFontFamily || defaultWebsiteSettings.loginFeatureFontFamily,
          '--login-feature-font-weight': settings.loginFeatureBold === false ? '500' : '800',
          '--login-feature-font-style': settings.loginFeatureItalic ? 'italic' : 'normal',
        }}>
          <div className="auth-brand-overlay" />
          <div className="auth-circle auth-circle-one" />
          <div className="auth-circle auth-circle-two" />
          <div className="auth-circle auth-circle-three" />
          <div className="auth-brand-content">
            <div className="auth-brand-logo">
              {logoSrc ? <img src={logoSrc} alt="Login page logo" /> : <BookOpen size={28} />}
            </div>
            <div className="auth-brand-copy">
              <h1>{welcomeTitle}</h1>
              <p>{welcomeSubtitle}</p>
            </div>
            <ul className="auth-feature-list">
              {featureItems.map((item, index) => (
                <li key={`${item}-${index}`}>
                  <span className="auth-feature-icon"><CheckCircle2 size={18} /></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="auth-form-panel">
          <div className="auth-form-inner">
            {adminOnly && <div className="admin-auth-badge"><UserCog size={16} /> Admin portal access</div>}
            <div className="auth-heading-block">
              <h2>{panelTitle}</h2>
              <p>{panelSubtitle}</p>
            </div>

            <div className="auth-form-stack">
              {isRegister && (
                <label className="field wide-field">
                  <span>Full name</span>
                  <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Enter your full name" />
                </label>
              )}

              <label className="field wide-field">
                <span>Email</span>
                <input value={form.email} disabled={Boolean(invitation)} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Enter your email" />
              </label>

              {!isForgotPassword && (
                <label className="field wide-field">
                  <span>Password</span>
                  <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Enter your password" />
                </label>
              )}

              {isRegister && (
                <>
                  <label className="field wide-field">
                    <span>Confirm password</span>
                    <input type="password" value={form.confirm_password} onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} placeholder="Confirm your password" />
                  </label>
                  <label className="field wide-field">
                    <span>Role</span>
                    <select value={form.role} disabled={Boolean(invitation)} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                      {roleButtons.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
                    </select>
                  </label>
                </>
              )}

              {!isRegister && !isForgotPassword && (
                <div className="auth-meta-row">
                  <label className="auth-checkbox">
                    <input type="checkbox" checked={form.remember_me} onChange={(e) => setForm({ ...form, remember_me: e.target.checked })} />
                    <span>Remember for 30 days</span>
                  </label>
                  <button type="button" className="auth-text-link" onClick={() => setMode('forgot')}>Forgot password?</button>
                </div>
              )}

              {invitation && (
                <div className="invitation-lock-note auth-note-box">
                  <b>Invitation registration</b>
                  <p>Your email and assigned role are locked for security. Role: {getRoleLabel(invitation.role)}. Expires: {new Date(invitation.expires_at).toLocaleDateString()}.</p>
                </div>
              )}

              {message && <div className="message login-message">{message}</div>}

              {isForgotPassword ? (
                <button className="primary wide auth-submit-button" disabled={loading} onClick={() => onForgotPassword(form.email)}>
                  <Mail size={18} /> {loading ? 'Sending reset link...' : 'Send password reset email'}
                </button>
              ) : (
                <button className="primary wide auth-submit-button" disabled={loading} onClick={() => onLogin({ ...form, mode, adminPortal: adminOnly })}>
                  <Lock size={18} /> {loading ? 'Please wait...' : isRegister ? 'Create account' : 'Sign in'}
                </button>
              )}

              {!adminOnly && (
                <div className="auth-bottom-row">
                  {isRegister ? (
                    <p>Already have an account? <button type="button" className="auth-text-link inline" onClick={() => setMode('login')}>Sign in</button></p>
                  ) : (
                    <p>Don’t have an account? <button type="button" className="auth-text-link inline" onClick={() => setMode('register')}>Sign up for free</button></p>
                  )}
                </div>
              )}

              {isForgotPassword && (
                <div className="auth-bottom-row">
                  <p>Remembered your password? <button type="button" className="auth-text-link inline" onClick={() => setMode('login')}>Back to sign in</button></p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function ResetPasswordPage({ onUpdatePassword, onBackToLogin, message, loading, settings = defaultWebsiteSettings }) {
  const [form, setForm] = useState({ password: '', confirm_password: '' })
  const heroSrc = settings.loginBackgroundImage || settings.loginHeroImage || settings.heroImage || '/hero-page.png'
  const logoSrc = settings.loginLogoImage || ''
  const welcomeTitle = settings.loginWelcomeTitle || 'Welcome to Research Platform'
  const welcomeSubtitle = settings.loginWelcomeSubtitle || 'Publish your groundbreaking research and connect with scholars worldwide.'
  const featureItems = [
    settings.loginFeatureOne || 'Open Access Publishing',
    settings.loginFeatureTwo || 'Peer Review Excellence',
    settings.loginFeatureThree || 'Global Research Community',
  ].filter(Boolean)

  return (
    <div className="login-page modern-login-page">
      <div className="auth-shell">
        <section className={`auth-brand-panel ${settings.loginShowCircles === false ? 'circles-hidden' : 'circles-live'}`} style={{
          '--auth-bg-image': `url(${heroSrc})`,
          '--login-bg-start': settings.loginGradientStart || defaultWebsiteSettings.loginGradientStart,
          '--login-bg-end': settings.loginGradientEnd || defaultWebsiteSettings.loginGradientEnd,
          '--login-circle-color': settings.loginCircleColor || defaultWebsiteSettings.loginCircleColor,
          '--login-overlay-opacity': settings.loginShowGradientOverlay === false ? '0' : '.86',
          '--login-circle-opacity': settings.loginShowCircles === false ? '0' : '.16',
          '--login-title-font-size': `${settings.loginWelcomeTitleFontSize || defaultWebsiteSettings.loginWelcomeTitleFontSize}px`,
          '--login-title-color': settings.loginWelcomeTitleColor || defaultWebsiteSettings.loginWelcomeTitleColor,
          '--login-title-font-family': settings.loginWelcomeTitleFontFamily || defaultWebsiteSettings.loginWelcomeTitleFontFamily,
          '--login-title-font-weight': settings.loginWelcomeTitleBold === false ? '500' : '800',
          '--login-title-font-style': settings.loginWelcomeTitleItalic ? 'italic' : 'normal',
          '--login-description-font-size': `${settings.loginDescriptionFontSize || defaultWebsiteSettings.loginDescriptionFontSize}px`,
          '--login-description-color': settings.loginDescriptionColor || defaultWebsiteSettings.loginDescriptionColor,
          '--login-description-font-family': settings.loginDescriptionFontFamily || defaultWebsiteSettings.loginDescriptionFontFamily,
          '--login-description-font-weight': settings.loginDescriptionBold ? '800' : '500',
          '--login-description-font-style': settings.loginDescriptionItalic ? 'italic' : 'normal',
          '--login-feature-font-size': `${settings.loginFeatureFontSize || defaultWebsiteSettings.loginFeatureFontSize}px`,
          '--login-feature-color': settings.loginFeatureColor || defaultWebsiteSettings.loginFeatureColor,
          '--login-feature-font-family': settings.loginFeatureFontFamily || defaultWebsiteSettings.loginFeatureFontFamily,
          '--login-feature-font-weight': settings.loginFeatureBold === false ? '500' : '800',
          '--login-feature-font-style': settings.loginFeatureItalic ? 'italic' : 'normal',
        }}>
          <div className="auth-brand-overlay" />
          <div className="auth-circle auth-circle-one" />
          <div className="auth-circle auth-circle-two" />
          <div className="auth-circle auth-circle-three" />
          <div className="auth-brand-content">
            <div className="auth-brand-logo">
              {logoSrc ? <img src={logoSrc} alt="Login page logo" /> : <BookOpen size={28} />}
            </div>
            <div className="auth-brand-copy">
              <h1>{welcomeTitle}</h1>
              <p>{welcomeSubtitle}</p>
            </div>
            <ul className="auth-feature-list">
              {featureItems.map((item, index) => (
                <li key={`${item}-${index}`}>
                  <span className="auth-feature-icon"><CheckCircle2 size={18} /></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="auth-form-panel">
          <div className="auth-form-inner">
            <div className="auth-heading-block">
              <h2>Set a new password</h2>
              <p>Create a secure new password for your account, then return to the sign-in page.</p>
            </div>
            <div className="auth-form-stack">
              <label className="field wide-field">
                <span>New password</span>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Enter new password" />
              </label>
              <label className="field wide-field">
                <span>Confirm new password</span>
                <input type="password" value={form.confirm_password} onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} placeholder="Confirm your new password" />
              </label>
              {message && <div className="message login-message">{message}</div>}
              <button className="primary wide auth-submit-button" disabled={loading} onClick={() => onUpdatePassword(form.password, form.confirm_password)}>
                <Lock size={18} /> {loading ? 'Updating password...' : 'Update password'}
              </button>
              <div className="auth-bottom-row">
                <p>Return to the login page? <button className="auth-text-link inline" type="button" onClick={onBackToLogin}>Back to sign in</button></p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default function App() {
  const [role, setRole] = useState('student')
  const [tab, setTab] = useState('dashboard')
  const [data, setData] = useState(loadLocalData)
  const [dataLoadError, setDataLoadError] = useState('')
  const [websiteSettings, setWebsiteSettings] = useState(loadWebsiteSettings)
  const [pdfReportSettings, setPdfReportSettings] = useState(loadPdfReportSettings)
  const [adminPanelTab, setAdminPanelTab] = useState(getInitialAdminPanelTab)
  const [currentUser, setCurrentUser] = useState(loadCurrentUser)
  const [message, setMessage] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false)
  const [passwordResetLoading, setPasswordResetLoading] = useState(false)
  const [acceptedInvitation, setAcceptedInvitation] = useState(null)
  const [filters, setFilters] = useState({ search: '', area: 'All', status: 'All' })
  const [emailSendingReports, setEmailSendingReports] = useState({})
  const isAdminPortal = useMemo(() => isAdminPortalRequest(), [])

  const databaseMode = isSupabaseConfigured ? 'Supabase connected' : 'Local database mode'
  const allowedRole = currentUser?.role || 'student'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    localStorage.removeItem('pharmatrack-theme')
  }, [])

  useEffect(() => {
    loadWebsiteSettingsFromSupabase()
    loadPdfReportSettingsFromSupabase()
  }, [])

  useEffect(() => {
    loadInvitationFromUrl()
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
      setTab('dashboard')
      setEmailSendingReports({})
      loadFromSupabase(currentUser)
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

  async function loadFromSupabase(userOverride = currentUser) {
    if (!isSupabaseConfigured) return
    try {
      const [profiles, projects, reports, uploadedFiles, deadlines, notifications, evaluations, auditLogs] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: true }),
        supabase.from('research_projects').select('*').order('created_at', { ascending: false }),
        supabase.from('weekly_reports').select('*').order('submitted_at', { ascending: false }),
        supabase.from('uploaded_files').select('*').order('created_at', { ascending: false }),
        supabase.from('deadlines').select('*').order('due_date', { ascending: true }),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }),
        supabase.from('evaluations').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }),
      ])
      const error = [profiles, projects, reports, uploadedFiles, deadlines, notifications, evaluations, auditLogs].find((x) => x.error)?.error
      if (error) throw error

      let invitationsData = []
      try {
        const invitations = await supabase.from('invitations').select('*').order('created_at', { ascending: false })
        if (!invitations.error) invitationsData = invitations.data || []
      } catch {
        invitationsData = []
      }

      const reportsData = reports.data || []
      const projectsData = (projects.data || []).map((project) => ({
        ...project,
        progress: getProjectProgress(project, reportsData),
      }))

      setDataLoadError('')
      setData(cleanData({
        profiles: profiles.data || [],
        projects: projectsData,
        reports: reportsData,
        uploadedFiles: uploadedFiles.data || [],
        deadlines: deadlines.data?.length ? deadlines.data : emptyData.deadlines,
        notifications: notifications.data || [],
        evaluations: evaluations.data || [],
        auditLogs: auditLogs.data || [],
        invitations: invitationsData,
      }))
    } catch (error) {
      setDataLoadError(error.message || 'Unknown database error')
      setMessage(`Database error: ${error.message}`)
    }
  }

  async function loadInvitationFromUrl() {
    if (typeof window === 'undefined') return
    const token = new URLSearchParams(window.location.search).get('invite')
    if (!token) return
    try {
      let invitation = null
      if (isSupabaseConfigured) {
        const { data: found, error } = await supabase.from('invitations').select('*').eq('token', token).maybeSingle()
        if (error) throw error
        invitation = found
      } else {
        const localData = loadLocalData()
        invitation = localData.invitations.find((item) => item.token === token)
      }

      if (!invitation) {
        setMessage('Invitation link not found. Please ask the admin to resend the invitation.')
        return
      }

      const displayStatus = getInvitationDisplayStatus(invitation)
      if (displayStatus !== 'Pending') {
        setMessage(`This invitation is ${displayStatus.toLowerCase()} and cannot be used for registration.`)
        return
      }

      setAcceptedInvitation(invitation)
      setMessage(`Invitation loaded for ${invitation.email}. Please create your account.`)
    } catch (error) {
      setMessage(`Could not load invitation: ${error.message}`)
    }
  }

  function setLocal(updater) {
    setData((current) => {
      const next = cleanData(typeof updater === 'function' ? updater(current) : updater)
      saveLocalData(next)
      return next
    })
  }

  async function loadWebsiteSettingsFromSupabase() {
    if (!isSupabaseConfigured) return
    try {
      const { data: row, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'website')
        .maybeSingle()
      if (error) return
      if (row?.value) {
        const settings = normalizeSettings(row.value)
        setWebsiteSettings(settings)
        saveWebsiteSettingsLocal(settings)
      }
    } catch {
      // The website can still run without the optional app_settings table.
    }
  }

  async function loadPdfReportSettingsFromSupabase() {
    if (!isSupabaseConfigured) return
    try {
      const { data: row, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', PDF_REPORT_SETTINGS_KEY)
        .maybeSingle()
      if (error) return
      if (row?.value) {
        const settings = normalizePdfReportSettings(row.value)
        setPdfReportSettings(settings)
        savePdfReportSettingsLocal(settings)
      }
    } catch {
      // The default PDF design still works if the optional settings row is not created yet.
    }
  }

  async function updatePdfReportSettings(nextValues, options = {}) {
    if (currentUser?.role !== 'admin') {
      setMessage('Only Admin accounts can edit PDF report customization settings.')
      return { ok: false }
    }

    const nextSettings = normalizePdfReportSettings({ ...pdfReportSettings, ...nextValues })
    setPdfReportSettings(nextSettings)
    savePdfReportSettingsLocal(nextSettings)

    if (isSupabaseConfigured) {
      try {
        const { data: savedValue, error } = await supabase.rpc('save_pdf_report_settings', {
          next_value: nextSettings,
          updated_by_value: currentUser?.email || currentUser?.full_name || 'admin',
        })

        if (error) {
          const missingRpc = String(error.message || '').toLowerCase().includes('function') || String(error.message || '').toLowerCase().includes('schema cache')
          throw new Error(
            missingRpc
              ? `${error.message}. The database function is not installed yet. Run supabase/pdf_report_customization_update.sql in Supabase SQL Editor, refresh the website, then save again.`
              : error.message
          )
        }

        const savedSettings = normalizePdfReportSettings(savedValue || nextSettings)
        setPdfReportSettings(savedSettings)
        savePdfReportSettingsLocal(savedSettings)

        if (!options.silent) {
          await addAudit(currentUser.full_name, 'updated', 'PDF report customization settings')
          setMessage('PDF report settings saved successfully.')
        }
        return { ok: true, settings: savedSettings }
      } catch (error) {
        setMessage(`PDF settings were kept locally for preview, but global database save failed: ${error.message}. Run the latest supabase/pdf_report_customization_update.sql in Supabase SQL Editor, refresh, then log out and log in again with the approved Admin email before saving.`)
        return { ok: false, error }
      }
    }

    if (!options.silent) {
      setMessage('PDF report customization saved locally for preview. Connect Supabase and run supabase/pdf_report_customization_update.sql to save globally.')
    }
    return { ok: true, settings: nextSettings }
  }

  async function uploadPdfReportLogo(file) {
    if (currentUser?.role !== 'admin') {
      setMessage('Only Admin accounts can upload PDF report logos.')
      return { ok: false }
    }
    if (!file) return { ok: false }
    if (!file.type?.startsWith('image/')) {
      setMessage('Please choose a valid logo image file.')
      return { ok: false }
    }

    try {
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const dataUrl = await optimizeImageFile(file, { maxWidth: 900, maxHeight: 450, quality: 0.92, outputType })
      let logoUrl = dataUrl
      let logoPath = ''

      if (isSupabaseConfigured) {
        const blob = await fetch(dataUrl).then((response) => response.blob())
        const extension = outputType === 'image/png' ? 'png' : 'jpg'
        const safeName = sanitizeFileName(file.name || 'pdf-report-logo').toLowerCase()
        logoPath = `pdf-reports/logo-${Date.now()}-${safeName}.${extension}`
        const upload = await supabase.storage
          .from('app-assets')
          .upload(logoPath, blob, {
            contentType: outputType,
            cacheControl: '3600',
            upsert: true,
          })
        if (upload.error) throw upload.error
        const { data: publicData } = supabase.storage.from('app-assets').getPublicUrl(logoPath)
        logoUrl = publicData?.publicUrl || dataUrl
      }

      await updatePdfReportSettings({ logoUrl, logoPath }, { silent: true })
      setMessage(isSupabaseConfigured ? 'PDF report logo uploaded. Click Save PDF Report Settings to confirm other changes.' : 'PDF report logo loaded locally for preview.')
      return { ok: true, logoUrl, logoPath }
    } catch (error) {
      try {
        const fallback = await fileToDataUrl(file)
        await updatePdfReportSettings({ logoUrl: fallback, logoPath: '' }, { silent: true })
        setMessage(`Logo preview loaded locally, but Supabase upload failed: ${error.message}. Run the updated supabase/pdf_report_customization_update.sql, then upload again.`)
        return { ok: true, logoUrl: fallback }
      } catch {
        setMessage(error.message || 'Could not upload the selected logo. Try a smaller JPG or PNG file.')
        return { ok: false }
      }
    }
  }

  async function removePdfReportLogo() {
    if (currentUser?.role !== 'admin') {
      setMessage('Only Admin accounts can remove PDF report logos.')
      return { ok: false }
    }

    const oldPath = pdfReportSettings.logoPath
    await updatePdfReportSettings({ logoUrl: '', logoPath: '' }, { silent: true })
    if (isSupabaseConfigured && oldPath) {
      try {
        await supabase.storage.from('app-assets').remove([oldPath])
      } catch {
        // Removing the setting is enough to hide the logo even if storage cleanup fails.
      }
    }
    setMessage('PDF report logo removed. Existing Print/PDF reports will use the no-logo template.')
    return { ok: true }
  }

  async function resetPdfReportSettings() {
    return updatePdfReportSettings(defaultPdfReportSettings)
  }

  async function updateWebsiteSettings(nextValues, options = {}) {
    const nextSettings = normalizeSettings({ ...websiteSettings, ...nextValues })
    setWebsiteSettings(nextSettings)
    saveWebsiteSettingsLocal(nextSettings)

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('app_settings')
          .upsert({
            key: 'website',
            value: nextSettings,
            updated_by: currentUser?.email || currentUser?.full_name || 'admin',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' })
        if (error) throw error
        if (!options.silent) {
          await addAudit(currentUser.full_name, 'updated', 'website settings')
          setMessage('Website settings saved. The public website will use the new settings after refresh.')
        }
      } catch (error) {
        setMessage(`Settings saved locally. To save globally for all users, run supabase/website_settings.sql in Supabase SQL Editor. Details: ${error.message}`)
      }
    } else if (!options.silent) {
      setMessage('Website settings saved locally for preview. Connect Supabase and run supabase/website_settings.sql to make settings global.')
    }
  }

  async function resetWebsiteSettings() {
    await updateWebsiteSettings(defaultWebsiteSettings)
    setMessage('Website settings reset to default values.')
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
    const adminPortal = Boolean(form.adminPortal)
    const fullName = form.full_name.trim()
    const email = form.email.trim().toLowerCase()
    const password = form.password || ''
    const confirmPassword = form.confirm_password || ''
    const invitationRole = acceptedInvitation?.role || form.role

    if (acceptedInvitation && isRegister) {
      if (email !== String(acceptedInvitation.email || '').toLowerCase()) {
        setMessage('This invitation is locked to a different email address.')
        return
      }
      if (getInvitationDisplayStatus(acceptedInvitation) !== 'Pending') {
        setMessage('This invitation is no longer active. Please ask the admin to resend it.')
        return
      }
    }

    if (adminPortal && isRegister) {
      setMessage('Admin accounts cannot be created from the admin portal. Please login with an approved Admin account.')
      return
    }
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
          const registrationStatus = acceptedInvitation ? 'Active' : isFirstProfile && invitationRole === 'admin' ? 'Active' : 'Pending'

          const signUpResult = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                role: invitationRole,
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
              .insert({ full_name: fullName, email, role: invitationRole, status: registrationStatus })
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

          if (acceptedInvitation) {
            await markInvitationAccepted(acceptedInvitation.id)
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

        await loadFromSupabase(loginUser)
      } else {
        const existingLocal = data.profiles.find((p) => p.email === email)
        if (isRegister) {
          if (existingLocal) throw new Error('This email already has an account. Please use Login with your password.')
          const isFirstLocalProfile = data.profiles.length === 0
          const registrationStatus = acceptedInvitation ? 'Active' : isFirstLocalProfile && invitationRole === 'admin' ? 'Active' : 'Pending'
          loginUser = {
            id: crypto.randomUUID(),
            full_name: fullName,
            email,
            role: invitationRole,
            status: registrationStatus,
            password_hash: localPasswordKey(password),
            created_at: new Date().toISOString(),
          }
          setLocal((current) => ({ ...current, profiles: [loginUser, ...current.profiles] }))
          if (loginUser.status !== 'Active') {
            setMessage('Registration submitted successfully. Please check your email for confirmation and wait for an admin to approve your account.')
            return
          }

          if (acceptedInvitation) {
            await markInvitationAccepted(acceptedInvitation.id)
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

      if (adminPortal && loginUser.role !== 'admin') {
        if (isSupabaseConfigured) await supabase.auth.signOut()
        throw new Error('Access denied. This admin portal is available only for approved Admin accounts.')
      }

      saveCurrentUser(loginUser, Boolean(form.remember_me))
      setEmailSendingReports({})
      setTab('dashboard')
      setCurrentUser(loginUser)
      setRole(loginUser.role)
      await loadFromSupabase(loginUser)
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
    setEmailSendingReports({})
    setTab('dashboard')
    setMessage('You have logged out.')
  }

  async function createProject(form) {
    if (!form.title?.trim()) return setMessage('Please write a research title first.')
    if (!DEPARTMENT_OPTIONS.includes(form.area)) return setMessage('Please select a valid department.')
    const studentAlreadySubmittedTitle = currentUser?.role === 'student' && data.projects.some((project) => isOwnStudentProject(project, currentUser))
    if (studentAlreadySubmittedTitle) {
      return setMessage('You already submitted a research title. New research title submission is closed for your account.')
    }
    const project = {
      id: crypto.randomUUID(),
      group_name: form.group_name || `${currentUser?.full_name || 'Student'} Project`,
      title: form.title,
      area: normalizeDepartment(form.area),
      supervisor_name: 'Pending Assignment',
      supervisor_id: null,
      supervisor_email: '',
      student_id: currentUser?.id || null,
      student_email: currentUser?.email || '',
      created_by: currentUser?.id || null,
      created_by_email: currentUser?.email || '',
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
    const nextWeek = Math.max(
      0,
      ...data.reports
        .filter((r) => String(r.project_id) === String(form.project_id) && reportOwnedByUser(r, currentUser))
        .map((r) => Number(r.week_number || 0))
    ) + 1
    const report = {
      id: crypto.randomUUID(),
      project_id: form.project_id,
      week_number: nextWeek,
      submitted_by: currentUser?.full_name || form.submitted_by,
      submitted_by_id: currentUser?.id || null,
      submitted_by_email: currentUser?.email || '',
      student_id: currentUser?.id || null,
      student_email: currentUser?.email || '',
      user_id: currentUser?.id || null,
      created_by: currentUser?.id || null,
      created_by_email: currentUser?.email || '',
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
      try {
        if (file) await uploadProjectFile(file, form.project_id, inserted.id, 'Weekly Report Evidence')
      } catch (uploadError) {
        await loadFromSupabase()
        return setMessage(`Weekly report saved, but the attachment was not uploaded: ${uploadError.message}`)
      }
      try {
        await notifySupervisorAboutSubmittedReport({ ...inserted, id: inserted.id })
      } catch (notificationError) {
        console.warn('Weekly report notification could not be created:', notificationError)
      }
      await addAudit(form.submitted_by, 'submitted', `weekly report ${nextWeek}`)
      await loadFromSupabase()
    } else {
      const attachment = file ? await makeLocalReportAttachment(file, form.project_id, report.id, currentUser) : null
      const reportWithAttachment = attachment ? { ...report, attachment } : report
      const log = makeAudit(form.submitted_by, 'submitted', `weekly report ${nextWeek}`)
      const project = data.projects.find((item) => String(item.id) === String(form.project_id))
      const supervisor = findSupervisorProfileForProject(data, project)
      const notification = supervisor ? {
        id: crypto.randomUUID(),
        profile_id: supervisor.id || null,
        recipient_user_id: supervisor.id || null,
        recipient_email: supervisor.email || '',
        sender_user_id: currentUser?.id || null,
        weekly_report_id: report.id,
        project_id: form.project_id,
        notification_type: 'weekly_report_submitted',
        title: 'New Weekly Report Submitted',
        message: `A new weekly report has been submitted by ${currentUser?.full_name || report.submitted_by || 'Student'} for Week ${nextWeek}.`,
        type: 'Weekly Report',
        target_role: 'supervisor',
        is_read: false,
        created_at: new Date().toISOString(),
      } : null
      setLocal((current) => ({
        ...current,
        reports: [reportWithAttachment, ...current.reports],
        uploadedFiles: attachment ? [attachment, ...(current.uploadedFiles || [])] : (current.uploadedFiles || []),
        notifications: notification ? [notification, ...(current.notifications || [])] : (current.notifications || []),
        auditLogs: [log, ...current.auditLogs],
      }))
    }
    setMessage(file ? 'Weekly report and attachment submitted successfully.' : 'Weekly report submitted successfully.')
  }

  async function uploadProjectFile(file, projectId, reportId, fileType) {
    if (!isSupabaseConfigured || !file) return null
    const safeName = sanitizeFileName(file.name)
    const filePath = `${projectId}/${reportId}/${Date.now()}-${safeName}`
    const upload = await supabase.storage.from('project-files').upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    })
    if (upload.error) throw upload.error
    const insert = await supabase.from('uploaded_files').insert({
      project_id: projectId,
      report_id: reportId,
      file_type: fileType,
      file_name: file.name,
      file_path: filePath,
      uploaded_by: currentUser?.id || null,
      uploaded_by_email: currentUser?.email || '',
      user_id: currentUser?.id || null,
      created_by: currentUser?.id || null,
      created_by_email: currentUser?.email || '',
      file_mime_type: file.type || 'application/octet-stream',
    }).select().single()
    if (insert.error) throw insert.error
    return insert.data
  }

  async function createReportNotification({ recipient, report, project, notificationType, title, message, includeEmail = false }) {
    if (!recipient || !report || !notificationType) return
    const recipientId = recipient.id || null
    const reportId = report.id
    const alreadyExists = (data.notifications || []).some((note) =>
      String(note.weekly_report_id || '') === String(reportId) &&
      String(note.notification_type || note.type || '') === String(notificationType) &&
      (
        (recipientId && String(note.recipient_user_id || note.profile_id || '') === String(recipientId)) ||
        (!recipientId && normalizeText(note.recipient_email) === normalizeText(recipient.email))
      )
    )
    if (alreadyExists) return

    const notification = {
      id: crypto.randomUUID(),
      profile_id: recipientId,
      recipient_user_id: recipientId,
      recipient_email: recipient.email || '',
      sender_user_id: currentUser?.id || null,
      weekly_report_id: reportId,
      project_id: project?.id || report.project_id || null,
      notification_type: notificationType,
      title,
      message,
      type: 'Weekly Report',
      target_role: recipient.role || 'all',
      is_read: false,
      created_at: new Date().toISOString(),
    }

    if (isSupabaseConfigured) {
      const { id, ...notificationForDb } = notification
      const duplicateQuery = await supabase
        .from('notifications')
        .select('id')
        .eq('weekly_report_id', reportId)
        .eq('notification_type', notificationType)
        .or(recipientId ? `recipient_user_id.eq.${recipientId},profile_id.eq.${recipientId}` : `recipient_email.eq.${recipient.email || ''}`)
        .limit(1)
      if (!duplicateQuery.error && duplicateQuery.data?.length) return

      const { error } = await supabase.from('notifications').insert(notificationForDb)
      if (error) throw error

      if (includeEmail && supabase?.functions?.invoke) {
        await supabase.functions.invoke('email-weekly-report-to-me', {
          body: { reportId, mode: 'notification', recipientUserId: recipientId, notificationType },
        }).catch((emailError) => {
          console.warn('Weekly report email notification could not be sent:', emailError)
        })
      }
    } else {
      setLocal((current) => ({ ...current, notifications: [notification, ...(current.notifications || [])] }))
    }
  }

  async function notifySupervisorAboutSubmittedReport(report) {
    const project = data.projects.find((item) => String(item.id) === String(report.project_id))
    const supervisor = findSupervisorProfileForProject(data, project)
    if (!supervisor) return
    await createReportNotification({
      recipient: supervisor,
      report,
      project,
      notificationType: 'weekly_report_submitted',
      title: 'New Weekly Report Submitted',
      message: `A new weekly report has been submitted by ${currentUser?.full_name || report.submitted_by || 'Student'} for Week ${report.week_number}.`,
      includeEmail: true,
    })
  }

  async function notifyStudentAboutReviewedReport(report, status, feedback, score) {
    const project = data.projects.find((item) => String(item.id) === String(report.project_id))
    const student = findStudentProfileForReport(data, report)
    if (!student) return
    const statusLabel = getReviewStatusLabel(status)
    const details = [
      feedback ? `Feedback: ${feedback}` : '',
      score !== null && score !== undefined ? `Score: ${score}/20` : '',
    ].filter(Boolean).join(' ')
    await createReportNotification({
      recipient: student,
      report,
      project,
      notificationType: `weekly_report_review_${String(statusLabel).toLowerCase().replaceAll(' ', '_')}_${makeNotificationFingerprint(statusLabel, feedback, score)}`,
      title: `Week ${report.week_number} Report ${statusLabel}`,
      message: `Your Week ${report.week_number} report has been ${statusLabel} by your supervisor.${details ? ` ${details}` : ''}`,
      includeEmail: true,
    })
  }

  async function sendWeeklyReportToMyEmail(reportId) {
    const targetReport = data.reports.find((report) => String(report.id) === String(reportId))
    if (!targetReport) return setMessage('Report not found. Please refresh and try again.')
    const project = data.projects.find((item) => String(item.id) === String(targetReport.project_id))
    if (!canSendReportToSelf(targetReport, project, currentUser, data)) {
      return setMessage('You do not have permission to email this report.')
    }
    if (!currentUser?.email) return setMessage('Your account does not have a registered email address.')

    setEmailSendingReports((current) => ({ ...current, [reportId]: true }))
    try {
      if (!isSupabaseConfigured || !supabase?.functions?.invoke) {
        throw new Error('Email sending requires Supabase Edge Functions. Deploy email-weekly-report-to-me and configure RESEND_API_KEY plus INVITE_FROM_EMAIL.')
      }
      const { data: result, error } = await supabase.functions.invoke('email-weekly-report-to-me', {
        body: { reportId, mode: 'copy' },
      })
      if (error) throw new Error(error.message || 'Weekly report email could not be sent.')
      if (result?.error) throw new Error(result.error)
      setMessage('Weekly report sent to your email successfully.')
    } catch (error) {
      setMessage(error.message || 'Weekly report email could not be sent.')
    } finally {
      setEmailSendingReports((current) => ({ ...current, [reportId]: false }))
    }
  }

  async function reviewReport(reportId, status, feedback) {
    const targetReport = data.reports.find((report) => String(report.id) === String(reportId))
    if (!targetReport) return setMessage('Report not found. Please refresh and try again.')
    if (currentUser?.role === 'supervisor' && !supervisorCanAccessReport(data, targetReport, currentUser)) {
      return setMessage('You do not have permission to view this report.')
    }

    const score = status === 'Accepted' ? 18 : status === 'Rejected' ? 0 : 12
    const updatedReports = data.reports.map((report) =>
      String(report.id) === String(reportId)
        ? { ...report, status, supervisor_feedback: feedback, score }
        : report
    )
    const nextProgress = calculateProjectProgressFromReports(updatedReports, targetReport.project_id)

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('weekly_reports').update({ status, supervisor_feedback: feedback, score }).eq('id', reportId)
      if (error) return setMessage(error.message)

      const progressUpdate = await supabase.from('research_projects').update({ progress: nextProgress }).eq('id', targetReport.project_id)
      if (progressUpdate.error) return setMessage(progressUpdate.error.message)

      try {
        await notifyStudentAboutReviewedReport(targetReport, status, feedback, score)
      } catch (notificationError) {
        console.warn('Weekly report review notification could not be created:', notificationError)
      }

      await addAudit(
        currentUser.full_name,
        status === 'Accepted' ? 'approved' : 'requested revision for',
        `weekly report ${targetReport.week_number || reportId}; project progress is now ${formatProgress(nextProgress)}%`
      )
      await loadFromSupabase()
    } else {
      const log = makeAudit(
        currentUser.full_name,
        status === 'Accepted' ? 'approved' : 'requested revision for',
        `weekly report ${targetReport.week_number || reportId}; project progress is now ${formatProgress(nextProgress)}%`
      )
      const project = data.projects.find((item) => String(item.id) === String(targetReport.project_id))
      const student = findStudentProfileForReport(data, targetReport)
      const statusLabel = getReviewStatusLabel(status)
      const notification = student ? {
        id: crypto.randomUUID(),
        profile_id: student.id || null,
        recipient_user_id: student.id || null,
        recipient_email: student.email || '',
        sender_user_id: currentUser?.id || null,
        weekly_report_id: targetReport.id,
        project_id: project?.id || targetReport.project_id,
        notification_type: `weekly_report_review_${String(statusLabel).toLowerCase().replaceAll(' ', '_')}_${makeNotificationFingerprint(statusLabel, feedback, score)}`,
        title: `Week ${targetReport.week_number} Report ${statusLabel}`,
        message: `Your Week ${targetReport.week_number} report has been ${statusLabel} by your supervisor.${feedback ? ` Feedback: ${feedback}` : ''} Score: ${score}/20`,
        type: 'Weekly Report',
        target_role: 'student',
        is_read: false,
        created_at: new Date().toISOString(),
      } : null
      setLocal((current) => ({
        ...current,
        reports: current.reports.map((r) => r.id === reportId ? { ...r, status, supervisor_feedback: feedback, score } : r),
        projects: current.projects.map((p) => String(p.id) === String(targetReport.project_id) ? { ...p, progress: nextProgress } : p),
        notifications: notification ? [notification, ...(current.notifications || [])] : (current.notifications || []),
        auditLogs: [log, ...current.auditLogs],
      }))
    }
    setMessage(`Supervisor review saved. Project progress is now ${formatProgress(nextProgress)}%.`)
  }

  async function removeStorageFiles(files = []) {
    if (!isSupabaseConfigured) return
    const paths = files.map((file) => file?.file_path).filter(Boolean)
    if (!paths.length) return
    const { error } = await supabase.storage.from('project-files').remove(paths)
    if (error && !String(error.message || '').toLowerCase().includes('not found')) throw error
  }

  async function deleteUploadedFile(fileId) {
    const targetFile = data.uploadedFiles.find((file) => String(file.id) === String(fileId))
    if (!targetFile) return setMessage('Document not found. Please refresh and try again.')
    if (!canDeleteUploadedFile(targetFile, currentUser, data.reports)) {
      return setMessage('You do not have permission to delete this item.')
    }
    if (!window.confirm('Are you sure you want to delete this item?')) return

    try {
      if (isSupabaseConfigured) {
        await removeStorageFiles([targetFile])
        const { error } = await supabase.from('uploaded_files').delete().eq('id', fileId)
        if (error) throw error
        await addAudit(currentUser.full_name, 'deleted', `uploaded document: ${targetFile.file_name || fileId}`)
        await loadFromSupabase(currentUser)
      } else {
        const log = makeAudit(currentUser.full_name, 'deleted', `uploaded document: ${targetFile.file_name || fileId}`)
        setLocal((current) => ({
          ...current,
          uploadedFiles: current.uploadedFiles.filter((file) => String(file.id) !== String(fileId)),
          reports: current.reports.map((report) => String(report.attachment?.id) === String(fileId) ? { ...report, attachment: null } : report),
          auditLogs: [log, ...current.auditLogs],
        }))
      }
      setMessage('Item deleted successfully.')
    } catch (error) {
      setMessage(error.message?.toLowerCase?.().includes('permission') ? 'You do not have permission to delete this item.' : (error.message || 'Could not delete this item.'))
    }
  }

  async function deleteWeeklyReport(reportId) {
    const targetReport = data.reports.find((report) => String(report.id) === String(reportId))
    if (!targetReport) return setMessage('Report not found. Please refresh and try again.')
    if (!canDeleteReport(targetReport, currentUser)) {
      return setMessage('You do not have permission to delete weekly reports.')
    }
    if (!window.confirm('Are you sure you want to delete this item?')) return

    const linkedFiles = data.uploadedFiles.filter((file) => String(file.report_id) === String(reportId))
    const updatedReports = data.reports.filter((report) => String(report.id) !== String(reportId))
    const nextProgress = calculateProjectProgressFromReports(updatedReports, targetReport.project_id)

    try {
      if (isSupabaseConfigured) {
        await removeStorageFiles(linkedFiles)
        if (linkedFiles.length) {
          const { error: filesError } = await supabase.from('uploaded_files').delete().eq('report_id', reportId)
          if (filesError) throw filesError
        }
        const { error } = await supabase.from('weekly_reports').delete().eq('id', reportId)
        if (error) throw error
        const progressUpdate = await supabase.from('research_projects').update({ progress: nextProgress }).eq('id', targetReport.project_id)
        if (progressUpdate.error) throw progressUpdate.error
        await addAudit(currentUser.full_name, 'deleted', `weekly report ${targetReport.week_number || reportId}`)
        await loadFromSupabase(currentUser)
      } else {
        const log = makeAudit(currentUser.full_name, 'deleted', `weekly report ${targetReport.week_number || reportId}`)
        setLocal((current) => ({
          ...current,
          reports: current.reports.filter((report) => String(report.id) !== String(reportId)),
          uploadedFiles: current.uploadedFiles.filter((file) => String(file.report_id) !== String(reportId)),
          projects: current.projects.map((project) => String(project.id) === String(targetReport.project_id) ? { ...project, progress: nextProgress } : project),
          auditLogs: [log, ...current.auditLogs],
        }))
      }
      setMessage(`Report deleted successfully. Project progress is now ${formatProgress(nextProgress)}%.`)
    } catch (error) {
      setMessage(error.message?.toLowerCase?.().includes('permission') || error.message?.toLowerCase?.().includes('row-level security') ? 'You do not have permission to delete weekly reports.' : (error.message || 'Could not delete this item.'))
    }
  }

  async function deleteUserAccount(userId) {
    const targetUser = data.profiles.find((user) => String(user.id) === String(userId))
    if (!targetUser) return setMessage('User not found. Please refresh and try again.')
    if (!canDeleteUserAccount(targetUser, currentUser)) {
      return setMessage('You do not have permission to perform this action.')
    }
    if (!window.confirm('Are you sure you want to delete this account? This action cannot be undone.')) return

    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.rpc('admin_delete_profile', { target_profile_id: userId })
        if (error) throw error
        await addAudit(currentUser.full_name, 'deleted account', `${targetUser.full_name || targetUser.email}`)
        await loadFromSupabase(currentUser)
      } else {
        const log = makeAudit(currentUser.full_name, 'deleted account', `${targetUser.full_name || targetUser.email}`)
        const targetEmail = String(targetUser.email || '').toLowerCase()
        setLocal((current) => ({
          ...current,
          profiles: current.profiles.filter((user) => String(user.id) !== String(userId)),
          projects: current.projects.map((project) => {
            const nextProject = { ...project }
            if (String(nextProject.student_id || '') === String(userId) || String(nextProject.student_email || '').toLowerCase() === targetEmail) {
              nextProject.student_id = null
              nextProject.student_email = ''
              nextProject.students = (nextProject.students || []).filter((name) => name !== targetUser.full_name)
            }
            if (String(nextProject.supervisor_id || '') === String(userId) || String(nextProject.supervisor_email || '').toLowerCase() === targetEmail) {
              nextProject.supervisor_id = null
              nextProject.supervisor_email = ''
              nextProject.supervisor_name = 'Pending Assignment'
            }
            return nextProject
          }),
          auditLogs: [log, ...current.auditLogs],
        }))
      }
      setMessage('Account deleted successfully.')
    } catch (error) {
      setMessage(error.message?.toLowerCase?.().includes('permission') || error.message?.toLowerCase?.().includes('row-level security') ? 'You do not have permission to perform this action.' : (error.message || 'Could not delete this account.'))
    }
  }

  async function deleteResearchProject(projectId) {
    const targetProject = data.projects.find((project) => String(project.id) === String(projectId))
    if (!targetProject) return setMessage('Research title not found. Please refresh and try again.')
    if (!canDeleteResearchProject(targetProject, currentUser)) {
      return setMessage('You do not have permission to perform this action.')
    }
    if (!window.confirm('Are you sure you want to delete this research title?')) return

    const linkedReports = data.reports.filter((report) => String(report.project_id) === String(projectId))
    const linkedReportIds = linkedReports.map((report) => String(report.id))
    const linkedFiles = data.uploadedFiles.filter((file) => String(file.project_id) === String(projectId) || linkedReportIds.includes(String(file.report_id)))

    try {
      if (isSupabaseConfigured) {
        await removeStorageFiles(linkedFiles)
        const { error } = await supabase.rpc('admin_delete_research_project', { target_project_id: projectId })
        if (error) throw error
        await addAudit(currentUser.full_name, 'deleted research title', `${targetProject.title || projectId}`)
        await loadFromSupabase(currentUser)
      } else {
        const log = makeAudit(currentUser.full_name, 'deleted research title', `${targetProject.title || projectId}`)
        setLocal((current) => ({
          ...current,
          projects: current.projects.filter((project) => String(project.id) !== String(projectId)),
          reports: current.reports.filter((report) => String(report.project_id) !== String(projectId)),
          uploadedFiles: current.uploadedFiles.filter((file) => String(file.project_id) !== String(projectId) && !linkedReportIds.includes(String(file.report_id))),
          notifications: current.notifications.filter((notification) => String(notification.project_id) !== String(projectId) && !linkedReportIds.includes(String(notification.weekly_report_id))),
          evaluations: current.evaluations.filter((evaluation) => String(evaluation.project_id) !== String(projectId)),
          auditLogs: [log, ...current.auditLogs],
        }))
      }
      setMessage('Research title deleted successfully.')
    } catch (error) {
      setMessage(error.message?.toLowerCase?.().includes('permission') || error.message?.toLowerCase?.().includes('row-level security') ? 'You do not have permission to perform this action.' : (error.message || 'Could not delete this research title.'))
    }
  }

  async function deleteResearchGroup(groupName) {
    const normalizedGroup = String(groupName || '').trim()
    if (!normalizedGroup) return setMessage('Research group not found. Please refresh and try again.')
    if (!canDeleteResearchGroup(normalizedGroup, currentUser)) {
      return setMessage('You do not have permission to perform this action.')
    }
    if (!window.confirm('Are you sure you want to delete this research group?')) return

    const groupProjects = data.projects.filter((project) => String(project.group_name || '') === normalizedGroup)
    const groupProjectIds = groupProjects.map((project) => String(project.id))
    const linkedReports = data.reports.filter((report) => groupProjectIds.includes(String(report.project_id)))
    const linkedReportIds = linkedReports.map((report) => String(report.id))
    const linkedFiles = data.uploadedFiles.filter((file) => groupProjectIds.includes(String(file.project_id)) || linkedReportIds.includes(String(file.report_id)))

    try {
      if (isSupabaseConfigured) {
        await removeStorageFiles(linkedFiles)
        const { error } = await supabase.rpc('admin_delete_research_group', { target_group_name: normalizedGroup })
        if (error) throw error
        await addAudit(currentUser.full_name, 'deleted research group', normalizedGroup)
        await loadFromSupabase(currentUser)
      } else {
        const log = makeAudit(currentUser.full_name, 'deleted research group', normalizedGroup)
        setLocal((current) => ({
          ...current,
          projects: current.projects.filter((project) => String(project.group_name || '') !== normalizedGroup),
          reports: current.reports.filter((report) => !groupProjectIds.includes(String(report.project_id))),
          uploadedFiles: current.uploadedFiles.filter((file) => !groupProjectIds.includes(String(file.project_id)) && !linkedReportIds.includes(String(file.report_id))),
          notifications: current.notifications.filter((notification) => !groupProjectIds.includes(String(notification.project_id)) && !linkedReportIds.includes(String(notification.weekly_report_id))),
          evaluations: current.evaluations.filter((evaluation) => !groupProjectIds.includes(String(evaluation.project_id))),
          auditLogs: [log, ...current.auditLogs],
        }))
      }
      setMessage('Research group deleted successfully.')
    } catch (error) {
      setMessage(error.message?.toLowerCase?.().includes('permission') || error.message?.toLowerCase?.().includes('row-level security') ? 'You do not have permission to perform this action.' : (error.message || 'Could not delete this research group.'))
    }
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

  function isMissingRpcFunction(error) {
    const message = String(error?.message || '').toLowerCase()
    return error?.code === 'PGRST202' || message.includes('could not find the function') || message.includes('schema cache')
  }

  async function adminUpdateProfile(userId, updates) {
    if (!isSupabaseConfigured) return
    const { error: rpcError } = await supabase.rpc('admin_update_profile', {
      target_profile_id: userId,
      profile_updates: updates,
    })

    if (!rpcError) return
    if (!isMissingRpcFunction(rpcError)) throw rpcError

    // Backward compatibility for databases that have not run the latest optional RPC yet.
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId)
    if (error) throw error
  }

  async function updateUserRole(userId, newRole) {
    const targetUser = data.profiles.find((u) => String(u.id) === String(userId))
    if (!targetUser) return setMessage('User not found.')
    if (String(targetUser.id) === String(currentUser.id)) return setMessage('For safety, the active admin cannot change their own role while logged in.')
    if (!roleButtons.some((role) => role.id === newRole)) return setMessage('Please choose a valid role.')

    try {
      if (isSupabaseConfigured) {
        await adminUpdateProfile(userId, { role: newRole })
        await addAudit(currentUser.full_name, 'changed user role for', `${targetUser.full_name} to ${newRole}`)
        await loadFromSupabase(currentUser)
      } else {
        const log = makeAudit(currentUser.full_name, 'changed user role for', `${targetUser.full_name} to ${newRole}`)
        setLocal((current) => ({
          ...current,
          profiles: current.profiles.map((u) => String(u.id) === String(userId) ? { ...u, role: newRole } : u),
          auditLogs: [log, ...current.auditLogs],
        }))
      }
      setMessage(`${targetUser.full_name}'s role was changed to ${roleButtons.find((r) => r.id === newRole)?.label || newRole}.`)
    } catch (error) {
      const message = String(error?.message || '')
      setMessage(message.toLowerCase().includes('permission') || message.toLowerCase().includes('row-level security') ? 'You do not have permission to change user roles. Run supabase/admin_users_roles_page_fix.sql in Supabase SQL Editor, then try again.' : (message || 'Could not change this user role.'))
    }
  }

  async function updateUserStatus(userId, newStatus) {
    const targetUser = data.profiles.find((u) => String(u.id) === String(userId))
    if (!targetUser) return setMessage('User not found.')
    if (String(targetUser.id) === String(currentUser.id)) return setMessage('For safety, the active admin cannot change their own approval status while logged in.')
    if (!['Pending', 'Active', 'Rejected'].includes(newStatus)) return setMessage('Please choose a valid account status.')

    try {
      if (isSupabaseConfigured) {
        await adminUpdateProfile(userId, { status: newStatus })
        await addAudit(currentUser.full_name, 'changed user approval status for', `${targetUser.full_name} to ${newStatus}`)
        await loadFromSupabase(currentUser)
      } else {
        const log = makeAudit(currentUser.full_name, 'changed user approval status for', `${targetUser.full_name} to ${newStatus}`)
        setLocal((current) => ({
          ...current,
          profiles: current.profiles.map((u) => String(u.id) === String(userId) ? { ...u, status: newStatus } : u),
          auditLogs: [log, ...current.auditLogs],
        }))
      }
      setMessage(`${targetUser.full_name}'s account status was changed to ${newStatus}.`)
    } catch (error) {
      const message = String(error?.message || '')
      setMessage(message.toLowerCase().includes('permission') || message.toLowerCase().includes('row-level security') ? 'You do not have permission to change account approval. Run supabase/admin_users_roles_page_fix.sql in Supabase SQL Editor, then try again.' : (message || 'Could not change this account status.'))
    }
  }


  async function assignStudentToSupervisor(studentId, supervisorId) {
    if (!isAdminUser(currentUser)) return setMessage('You do not have permission to access this admin feature.')
    const student = data.profiles.find((user) => String(user.id) === String(studentId))
    if (!student || student.role !== 'student') return setMessage('Student account not found.')
    const supervisor = supervisorId ? data.profiles.find((user) => String(user.id) === String(supervisorId) && user.role === 'supervisor') : null
    if (supervisorId && !supervisor) return setMessage('Supervisor account not found.')

    const studentName = normalizeText(student.full_name)
    const studentEmail = normalizeText(student.email)
    const linkedProjects = data.projects.filter((project) => {
      const projectStudents = getProjectStudents(project).map(normalizeText)
      return (
        String(project.student_id || '') === String(student.id) ||
        String(project.created_by || '') === String(student.id) ||
        normalizeText(project.student_email) === studentEmail ||
        normalizeText(project.created_by_email) === studentEmail ||
        normalizeText(project.group_name) === studentName ||
        projectStudents.includes(studentName) ||
        projectStudents.includes(studentEmail)
      )
    })

    const profileUpdate = {
      assigned_supervisor_id: supervisor?.id || null,
      assigned_supervisor_email: supervisor?.email || '',
      assigned_supervisor_name: supervisor?.full_name || '',
    }
    const projectUpdate = {
      supervisor_id: supervisor?.id || null,
      supervisor_email: supervisor?.email || '',
      supervisor_name: supervisor?.full_name || 'Pending Assignment',
    }

    try {
      if (isSupabaseConfigured) {
        const rpcResult = await supabase.rpc('admin_assign_student_to_supervisor', {
          target_student_id: student.id,
          target_supervisor_id: supervisor?.id || null,
        })

        if (rpcResult.error && !isMissingRpcFunction(rpcResult.error)) throw rpcResult.error

        if (rpcResult.error) {
          const profileResult = await supabase.from('profiles').update(profileUpdate).eq('id', student.id)
          if (profileResult.error) throw profileResult.error
          for (const project of linkedProjects) {
            const updateResult = await supabase.from('research_projects').update(projectUpdate).eq('id', project.id)
            if (updateResult.error) throw updateResult.error
          }
        }

        await addAudit(currentUser.full_name, supervisor ? 'assigned student to supervisor' : 'removed supervisor assignment for', `${student.full_name || student.email}${supervisor ? ` → ${supervisor.full_name || supervisor.email}` : ''}`)
        await loadFromSupabase(currentUser)
      } else {
        const log = makeAudit(currentUser.full_name, supervisor ? 'assigned student to supervisor' : 'removed supervisor assignment for', `${student.full_name || student.email}${supervisor ? ` → ${supervisor.full_name || supervisor.email}` : ''}`)
        const linkedIds = new Set(linkedProjects.map((project) => String(project.id)))
        setLocal((current) => ({
          ...current,
          profiles: current.profiles.map((user) => String(user.id) === String(student.id) ? { ...user, ...profileUpdate } : user),
          projects: current.projects.map((project) => linkedIds.has(String(project.id)) ? { ...project, ...projectUpdate } : project),
          auditLogs: [log, ...current.auditLogs],
        }))
      }
      setMessage(supervisor ? `${student.full_name || student.email} was assigned to ${supervisor.full_name || supervisor.email}.` : `Supervisor assignment removed for ${student.full_name || student.email}.`)
    } catch (error) {
      setMessage(error.message?.toLowerCase?.().includes('permission') || error.message?.toLowerCase?.().includes('row-level security') ? 'You do not have permission to access this admin feature.' : (error.message || 'Could not update supervisor assignment.'))
    }
  }

  async function saveEvaluation(form) {
    const project = data.projects.find((item) => String(item.id) === String(form.project_id))
    if (!project) {
      setMessage('Please select a completed group project before saving the final evaluation.')
      return { ok: false }
    }

    const progress = Number(getProjectProgress(project, data.reports) || project.progress || 0)
    if (progress < 100) {
      setMessage('This project is not eligible for final evaluation until progress reaches 100%.')
      return { ok: false }
    }

    const scoreKeys = ['title_novelty', 'research_contents', 'flow_writing_data', 'plagiarism_ai', 'university_guideline']
    const scores = Object.fromEntries(scoreKeys.map((key) => [key, Number(form[key])]))
    const invalid = scoreKeys.some((key) => !Number.isFinite(scores[key]) || scores[key] < 1 || scores[key] > 10)
    if (invalid) {
      setMessage('Each criterion must be scored from 1 to 10.')
      return { ok: false }
    }

    const existingEvaluation = data.evaluations.find((evaluation) => String(evaluation.project_id) === String(project.id))
    const now = new Date().toISOString()
    const record = {
      id: existingEvaluation?.id || crypto.randomUUID(),
      project_id: project.id,
      evaluator_name: currentUser.full_name,
      evaluation_type: 'Final Evaluation Rubric /50',
      attendance_score: scores.title_novelty,
      progress_score: scores.research_contents,
      research_quality_score: scores.flow_writing_data,
      writing_score: scores.plagiarism_ai,
      presentation_score: scores.university_guideline,
      teamwork_score: 0,
      comments: form.comments || '',
      created_at: existingEvaluation?.created_at || now,
      updated_at: now,
      rubric_version: 'final_rubric_50_v1',
      max_score: 50,
    }

    const recordForDb = {
      project_id: record.project_id,
      evaluator_name: record.evaluator_name,
      evaluation_type: record.evaluation_type,
      attendance_score: record.attendance_score,
      progress_score: record.progress_score,
      research_quality_score: record.research_quality_score,
      writing_score: record.writing_score,
      presentation_score: record.presentation_score,
      teamwork_score: record.teamwork_score,
      comments: record.comments,
      rubric_version: record.rubric_version,
      max_score: record.max_score,
      updated_at: record.updated_at,
    }

    if (isSupabaseConfigured) {
      let result
      if (existingEvaluation?.id) {
        result = await supabase.from('evaluations').update(recordForDb).eq('id', existingEvaluation.id)
      } else {
        result = await supabase.from('evaluations').insert(recordForDb)
      }
      if (result.error) {
        const msg = result.error.message?.toLowerCase?.().includes('eligible')
          ? 'This project is not eligible for final evaluation until progress reaches 100%.'
          : result.error.message
        setMessage(msg)
        return { ok: false }
      }
      await addAudit(currentUser.full_name, existingEvaluation ? 'updated' : 'saved', 'final evaluation /50')
      await loadFromSupabase()
    } else {
      const log = makeAudit(currentUser.full_name, existingEvaluation ? 'updated' : 'saved', 'final evaluation /50')
      setLocal((current) => ({
        ...current,
        evaluations: existingEvaluation
          ? current.evaluations.map((evaluation) => String(evaluation.id) === String(existingEvaluation.id) ? { ...evaluation, ...record } : evaluation)
          : [record, ...current.evaluations],
        auditLogs: [log, ...current.auditLogs],
      }))
    }
    setMessage('Final evaluation saved successfully.')
    return { ok: true }
  }


  async function markInvitationAccepted(invitationId) {
    if (!invitationId) return
    const updates = { status: 'Accepted', accepted_at: new Date().toISOString() }
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('invitations').update(updates).eq('id', invitationId)
      if (error) return setMessage(`Account created, but invitation status could not be updated: ${error.message}`)
      await loadFromSupabase()
    } else {
      setLocal((current) => ({
        ...current,
        invitations: current.invitations.map((item) => item.id === invitationId ? { ...item, ...updates } : item),
      }))
    }
    setAcceptedInvitation(null)
    if (typeof window !== 'undefined') window.history.replaceState({}, document.title, window.location.pathname)
  }

  function openInvitationEmail(invitation) {
    const emailBody = buildInvitationEmail(invitation, websiteSettings)
    const mailto = `mailto:${encodeURIComponent(invitation.email)}?subject=${encodeURIComponent(invitation.subject || '')}&body=${encodeURIComponent(emailBody)}`
    window.location.href = mailto
  }

  async function sendInvitationWithResend(invitation) {
    if (!isSupabaseConfigured || !supabase?.functions?.invoke) {
      throw new Error('Supabase Edge Functions are not configured. Add your Supabase environment variables and deploy send-invitation-email.')
    }

    const { data: emailResult, error } = await supabase.functions.invoke('send-invitation-email', {
      body: {
        invitationId: invitation.id,
        to: invitation.email,
        fullName: invitation.full_name,
        role: invitation.role,
        roleLabel: getRoleLabel(invitation.role),
        subject: invitation.subject,
        body: invitation.body,
        token: invitation.token,
        invitationLink: invitation.invitation_link || makeInvitationLink(invitation.token),
        expiresAt: invitation.expires_at,
        websiteName: websiteSettings.siteName || defaultWebsiteSettings.siteName,
        contactInfo: 'College of Pharmacy, Hawler Medical University',
      },
    })

    if (error) throw new Error(error.message || 'Invitation email could not be sent.')
    if (emailResult?.error) throw new Error(emailResult.error)
    return emailResult
  }

  async function createInvitation(form, options = {}) {
    if (allowedRole !== 'admin') return setMessage('Only admin users can create invitations.')
    const fullName = String(form.full_name || '').trim()
    const email = String(form.email || '').trim().toLowerCase()
    const roleValue = form.role || 'student'
    if (!fullName || !email || !email.includes('@') || !email.includes('.')) return setMessage('Please write a valid full name and email address.')

    const now = new Date()
    const activeDuplicate = data.invitations.some((item) =>
      String(item.email || '').toLowerCase() === email &&
      item.role === roleValue &&
      getInvitationDisplayStatus(item) === 'Pending'
    )
    if (activeDuplicate) return setMessage('A pending active invitation already exists for this email and role. Cancel it or wait until it expires before creating another.')

    const token = makeInvitationToken()
    const expiresAt = form.expires_at || addDays(now, Number(form.expires_in_days || 7)).toISOString()
    const invitation = {
      id: crypto.randomUUID(),
      full_name: fullName,
      email,
      role: roleValue,
      subject: form.subject || invitationTemplates[roleValue]?.subject || 'Invitation to join Pharmacy Research Platform',
      body: form.body || invitationTemplates[roleValue]?.body || 'Dear [Name], you are invited to join our platform.',
      token,
      invitation_link: makeInvitationLink(token),
      expires_at: expiresAt,
      status: 'Pending',
      created_by: currentUser?.email || currentUser?.full_name || 'admin',
      created_at: now.toISOString(),
      sent_at: isSupabaseConfigured ? null : new Date().toISOString(),
    }

    if (isSupabaseConfigured) {
      const duplicateCheck = await supabase
        .from('invitations')
        .select('id,email,role,status,expires_at')
        .eq('email', email)
        .eq('role', roleValue)
        .eq('status', 'Pending')
        .gt('expires_at', new Date().toISOString())
        .limit(1)
      if (duplicateCheck.error) {
        return setMessage(`Could not validate invitation duplicates. Run supabase/invitations.sql first. Details: ${duplicateCheck.error.message}`)
      }
      if (duplicateCheck.data?.length) return setMessage('A pending active invitation already exists for this email and role.')

      const { error } = await supabase.from('invitations').insert(invitation)
      if (error) return setMessage(`Invitation could not be saved. Run supabase/invitations.sql first. Details: ${error.message}`)

      try {
        await sendInvitationWithResend(invitation)
        await supabase.from('invitations').update({ sent_at: new Date().toISOString() }).eq('id', invitation.id)
        await addAudit(currentUser.full_name, 'created and emailed invitation to', `${fullName} (${getRoleLabel(roleValue)})`)
        await loadFromSupabase()
        setMessage('Invitation saved and email sent successfully through Resend.')
        return invitation
      } catch (emailError) {
        await addAudit(currentUser.full_name, 'created invitation but email failed for', `${fullName} (${getRoleLabel(roleValue)})`)
        await loadFromSupabase()
        setMessage(`Invitation was saved, but the email could not be sent: ${emailError.message}. Check Supabase Edge Function logs, RESEND_API_KEY, and INVITE_FROM_EMAIL.`)
        return invitation
      }
    } else {
      const log = makeAudit(currentUser.full_name, 'created invitation for', `${fullName} (${getRoleLabel(roleValue)})`)
      setLocal((current) => ({ ...current, invitations: [invitation, ...current.invitations], auditLogs: [log, ...current.auditLogs] }))
    }

    if (options.openEmail !== false) openInvitationEmail(invitation)
    setMessage('Invitation created locally. Your email app should open with the prepared invitation email. For automatic email delivery, connect Supabase Edge Function + Resend.')
    return invitation
  }

  async function resendInvitation(invitationId) {
    const target = data.invitations.find((item) => item.id === invitationId)
    if (!target) return setMessage('Invitation not found.')
    if (target.status === 'Cancelled') return setMessage('Cancelled invitations cannot be resent. Create a new invitation instead.')
    const token = makeInvitationToken()
    const updates = {
      token,
      invitation_link: makeInvitationLink(token),
      expires_at: addDays(new Date(), 7).toISOString(),
      status: 'Pending',
      sent_at: isSupabaseConfigured ? null : new Date().toISOString(),
    }
    const updatedInvitation = { ...target, ...updates }

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('invitations').update(updates).eq('id', invitationId)
      if (error) return setMessage(error.message)
      try {
        await sendInvitationWithResend(updatedInvitation)
        await supabase.from('invitations').update({ sent_at: new Date().toISOString() }).eq('id', invitationId)
        await addAudit(currentUser.full_name, 'resent invitation email to', target.email)
        await loadFromSupabase()
        setMessage('Invitation resent successfully through Resend with a new secure token and 7-day expiry.')
        return
      } catch (emailError) {
        await addAudit(currentUser.full_name, 'updated invitation but resend email failed for', target.email)
        await loadFromSupabase()
        setMessage(`Invitation token was updated, but the email could not be resent: ${emailError.message}. Check Supabase Edge Function logs and Resend secrets.`)
        return
      }
    } else {
      const log = makeAudit(currentUser.full_name, 'resent invitation to', target.email)
      setLocal((current) => ({
        ...current,
        invitations: current.invitations.map((item) => item.id === invitationId ? updatedInvitation : item),
        auditLogs: [log, ...current.auditLogs],
      }))
      openInvitationEmail(updatedInvitation)
      setMessage('Invitation resent locally with a new secure token and 7-day expiry. Your email app should open for manual sending.')
    }
  }

  async function cancelInvitation(invitationId) {
    const target = data.invitations.find((item) => item.id === invitationId)
    if (!target) return setMessage('Invitation not found.')
    const updates = { status: 'Cancelled', cancelled_at: new Date().toISOString() }
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('invitations').update(updates).eq('id', invitationId)
      if (error) return setMessage(error.message)
      await addAudit(currentUser.full_name, 'cancelled invitation for', target.email)
      await loadFromSupabase()
    } else {
      const log = makeAudit(currentUser.full_name, 'cancelled invitation for', target.email)
      setLocal((current) => ({
        ...current,
        invitations: current.invitations.map((item) => item.id === invitationId ? { ...item, ...updates } : item),
        auditLogs: [log, ...current.auditLogs],
      }))
    }
    setMessage('Invitation cancelled.')
  }

  function copyInvitationLink(invitation) {
    const link = invitation.invitation_link || makeInvitationLink(invitation.token)
    navigator.clipboard?.writeText(link)
    setMessage('Invitation link copied to clipboard.')
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

  async function createDeadline(form) {
    if (!['admin', 'supervisor'].includes(allowedRole)) {
      setMessage('Only supervisors and admins can add deadlines.')
      return { ok: false, error: 'Only supervisors and admins can add deadlines.' }
    }

    const title = form.title?.trim() || ''
    const dueDate = form.due_date || ''
    if (!title || !dueDate) {
      const error = 'Please write the deadline title and due date.'
      setMessage(error)
      return { ok: false, error }
    }

    const assignedProjects = allowedRole === 'supervisor'
      ? getVisibleProjects(data.projects, 'supervisor', currentUser)
      : data.projects
    const assignedStudents = getAssignedSupervisorStudents(data, assignedProjects, data.reports)
    const selectedStudents = form.target_scope === 'all_assigned'
      ? assignedStudents
      : Array.isArray(form.selected_students) ? form.selected_students : []

    if (!selectedStudents.length) {
      const error = 'Please select at least one student.'
      setMessage(error)
      return { ok: false, error }
    }

    if (allowedRole === 'supervisor') {
      if (!assignedStudents.length) {
        const error = 'No assigned students were found for this supervisor.'
        setMessage(error)
        return { ok: false, error }
      }
      const allowedKeys = new Set(assignedStudents.map((student) => student.key))
      const hasInvalidStudent = selectedStudents.some((student) => !allowedKeys.has(student.key))
      if (hasInvalidStudent) {
        const error = 'You can only assign deadlines to your own assigned students.'
        setMessage(error)
        return { ok: false, error }
      }
    }

    const targetStudentIds = selectedStudents.map((student) => student.id).filter(Boolean)
    const targetStudentEmails = selectedStudents.map((student) => student.email).filter(Boolean)
    const targetStudentNames = selectedStudents.map((student) => student.name).filter(Boolean)
    const targetStudentKeys = selectedStudents.map((student) => student.key).filter(Boolean)
    const deadline = {
      id: crypto.randomUUID(),
      title,
      description: form.description?.trim() || '',
      deadline_type: form.deadline_type || 'Supervisor Deadline',
      due_date: dueDate,
      academic_year: form.academic_year || '2026-2027',
      status: form.status || 'Active',
      priority: form.priority || 'Normal',
      target_scope: form.target_scope === 'all_assigned' ? 'all_assigned' : 'selected_students',
      target_student_ids: targetStudentIds,
      target_student_emails: targetStudentEmails,
      target_student_names: targetStudentNames,
      target_student_keys: targetStudentKeys,
      supervisor_id: currentUser?.id || null,
      supervisor_email: currentUser?.email || '',
      created_by: currentUser?.id || null,
      created_by_email: currentUser?.email || '',
      created_at: new Date().toISOString(),
    }

    const notificationRows = selectedStudents.map((student) => ({
      id: crypto.randomUUID(),
      profile_id: student.id || null,
      recipient_user_id: student.id || null,
      recipient_email: student.email || '',
      sender_user_id: currentUser?.id || null,
      notification_type: 'deadline_assigned',
      related_deadline_id: deadline.id,
      title: 'New Deadline Assigned',
      message: `${currentUser?.full_name || 'Your supervisor'} assigned a new deadline: ${deadline.title}. Due date: ${deadline.due_date}.${deadline.description ? ` ${deadline.description}` : ''}`,
      type: 'Deadline',
      target_role: 'student',
      is_read: false,
      created_at: new Date().toISOString(),
    }))

    try {
      if (isSupabaseConfigured) {
        const { id: _id, created_at: _createdAt, ...deadlineForDb } = deadline
        const insertResult = await supabase.from('deadlines').insert(deadlineForDb).select('*').single()
        if (insertResult.error) {
          const rawMessage = insertResult.error.message || 'Deadline could not be saved.'
          const error = rawMessage.toLowerCase().includes('row-level security') || rawMessage.toLowerCase().includes('policy')
            ? 'Deadline could not be saved because of Supabase permission rules. Run supabase/deadline_add_button_fix.sql in Supabase SQL Editor, then try again.'
            : `${rawMessage}. Run supabase/deadline_add_button_fix.sql in Supabase SQL Editor, then try again.`
          setMessage(error)
          return { ok: false, error }
        }
        if (notificationRows.length) {
          const notificationForDb = notificationRows.map(({ id: _noteId, ...note }) => note)
          const noteResult = await supabase.from('notifications').insert(notificationForDb)
          if (noteResult.error) console.warn('Deadline notification could not be saved:', noteResult.error)
        }
        await addAudit(currentUser.full_name, 'created', `deadline: ${deadline.title}`)
        await loadFromSupabase()
      } else {
        const log = makeAudit(currentUser.full_name, 'created', `deadline: ${deadline.title}`)
        setLocal((current) => ({
          ...current,
          deadlines: [deadline, ...current.deadlines],
          notifications: [...notificationRows, ...(current.notifications || [])],
          auditLogs: [log, ...current.auditLogs],
        }))
      }
      const success = selectedStudents.length
        ? `Deadline added successfully for ${selectedStudents.length} student${selectedStudents.length === 1 ? '' : 's'}.`
        : 'Deadline added successfully.'
      setMessage(success)
      return { ok: true, deadline }
    } catch (error) {
      console.error('Deadline creation failed:', error)
      const errorMessage = error?.message || 'Deadline could not be saved. Please try again.'
      setMessage(errorMessage)
      return { ok: false, error: errorMessage }
    }
  }

  async function removeDeadline(deadlineId) {
    if (!['admin', 'supervisor'].includes(allowedRole)) return setMessage('Only supervisors and admins can remove deadlines.')
    const target = data.deadlines.find((d) => String(d.id) === String(deadlineId))
    if (!target) return setMessage('Deadline not found.')
    if (!window.confirm('Are you sure you want to remove this deadline?')) return

    if (isSupabaseConfigured) {
      const directDelete = await supabase.from('deadlines').delete().eq('id', deadlineId)
      if (directDelete.error) {
        const rpcDelete = await supabase.rpc('remove_deadline_safe', { deadline_id_input: deadlineId })
        if (rpcDelete.error) {
          const errorMessage = rpcDelete.error.message || directDelete.error.message || 'Deadline could not be removed.'
          return setMessage(`${errorMessage}. Run supabase/deadline_stuck_remove_fix.sql in Supabase SQL Editor, then try again.`)
        }
      }
      setData((current) => ({
        ...current,
        deadlines: (current.deadlines || []).filter((deadline) => String(deadline.id) !== String(deadlineId)),
        notifications: (current.notifications || []).filter((notification) => String(notification.related_deadline_id) !== String(deadlineId)),
      }))
      await addAudit(currentUser.full_name, 'removed', `deadline: ${target.title}`)
      await loadFromSupabase()
    } else {
      const log = makeAudit(currentUser.full_name, 'removed', `deadline: ${target.title}`)
      setLocal((current) => ({
        ...current,
        deadlines: (current.deadlines || []).filter((d) => String(d.id) !== String(deadlineId)),
        notifications: (current.notifications || []).filter((notification) => String(notification.related_deadline_id) !== String(deadlineId)),
        auditLogs: [log, ...current.auditLogs],
      }))
    }
    setMessage('Deadline removed successfully.')
  }

  async function markNotificationRead(id) {
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
      if (error) return setMessage(error.message)
      await loadFromSupabase()
      return
    }
    setLocal((current) => ({
      ...current,
      notifications: current.notifications.map((n) => n.id === id ? { ...n, is_read: true } : n),
    }))
  }

  async function removeNotification(id) {
    const target = data.notifications.find((notification) => String(notification.id) === String(id))
    if (!target) {
      setMessage('Notification not found.')
      return { ok: false, error: 'Notification not found.' }
    }
    if (!notificationForUser(target, currentUser, allowedRole) && allowedRole !== 'admin') {
      const error = 'You do not have permission to remove this notification.'
      setMessage(error)
      return { ok: false, error }
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('notifications').delete().eq('id', id)
      if (error) {
        const errorMessage = error.message || 'Notification could not be removed.'
        setMessage(errorMessage)
        return { ok: false, error: errorMessage }
      }
      await loadFromSupabase()
    } else {
      setLocal((current) => ({
        ...current,
        notifications: (current.notifications || []).filter((notification) => String(notification.id) !== String(id)),
      }))
    }
    setMessage('Notification removed successfully.')
    return { ok: true }
  }

  function exportCsv() {
    const header = 'Group,Title,Area,Supervisor,Approval,Status,Progress,Final Due\n'
    const rows = filteredProjects.map((p) => `"${p.group_name}","${p.title}","${p.area}","${p.supervisor_name}","${p.approval}","${p.status}","${formatProgress(p.progress)}%","${p.final_due}"`).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pharmacy_research_platform_project_summary.csv'
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

  const visibleReports = useMemo(() => getVisibleReports(data.reports, visibleProjects, allowedRole, currentUser), [data.reports, visibleProjects, allowedRole, currentUser])

  const visibleDeadlines = useMemo(() => getVisibleDeadlines(data.deadlines, allowedRole, currentUser), [data.deadlines, allowedRole, currentUser])

  const visibleData = useMemo(() => ({
    ...data,
    profiles: allowedRole === 'admin' ? data.profiles : [],
    projects: visibleProjects,
    reports: visibleReports,
    deadlines: visibleDeadlines,
    evaluations: allowedRole === 'student' ? [] : data.evaluations,
    auditLogs: allowedRole === 'admin' ? data.auditLogs : [],
    invitations: allowedRole === 'admin' ? data.invitations : [],
  }), [data, allowedRole, visibleProjects, visibleReports, visibleDeadlines])

  const stats = useMemo(() => {
    const approved = visibleProjects.filter((p) => p.approval === 'Approved').length
    const pendingReports = visibleReports.filter((r) => ['Submitted', 'Revision Required'].includes(r.status)).length
    const averageProgress = visibleProjects.length ? Math.round(visibleProjects.reduce((sum, p) => sum + Number(p.progress || 0), 0) / visibleProjects.length) : 0
    const unread = data.notifications.filter((n) => !n.is_read && notificationForUser(n, currentUser, allowedRole)).length
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
    return <ResetPasswordPage onUpdatePassword={handleUpdatePassword} onBackToLogin={() => { setPasswordRecoveryMode(false); window.history.replaceState({}, document.title, window.location.pathname); setMessage('') }} message={message} loading={passwordResetLoading} settings={websiteSettings} />
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} onForgotPassword={handleForgotPassword} message={message} loading={loginLoading} adminOnly={isAdminPortal} settings={websiteSettings} invitation={acceptedInvitation} />
  }

  if (isAdminPortal && allowedRole !== 'admin') {
    return <AdminAccessDenied currentUser={currentUser} onLogout={logout} />
  }

  if (isAdminPortal && allowedRole === 'admin') {
    return (
      <AdminControlPanel
        settings={websiteSettings}
        pdfReportSettings={pdfReportSettings}
        adminPanelTab={adminPanelTab}
        setAdminPanelTab={setAdminPanelTab}
        updateSettings={updateWebsiteSettings}
        resetSettings={resetWebsiteSettings}
        updatePdfReportSettings={updatePdfReportSettings}
        uploadPdfReportLogo={uploadPdfReportLogo}
        removePdfReportLogo={removePdfReportLogo}
        resetPdfReportSettings={resetPdfReportSettings}
        data={data}
        projects={filteredProjects}
        currentUser={currentUser}
        updateProject={updateProject}
        updateUserRole={updateUserRole}
        updateUserStatus={updateUserStatus}
        exportCsv={exportCsv}
        createDeadline={createDeadline}
        removeDeadline={removeDeadline}
        deleteWeeklyReport={deleteWeeklyReport}
        deleteUploadedFile={deleteUploadedFile}
        deleteUserAccount={deleteUserAccount}
        deleteResearchGroup={deleteResearchGroup}
        deleteResearchProject={deleteResearchProject}
        loadError={dataLoadError}
        assignStudentToSupervisor={assignStudentToSupervisor}
        createInvitation={createInvitation}
        resendInvitation={resendInvitation}
        cancelInvitation={cancelInvitation}
        copyInvitationLink={copyInvitationLink}
        createNotification={createNotification}
        markNotificationRead={markNotificationRead}
        removeNotification={removeNotification}
        printPdfReport={printPdfReport}
        databaseMode={databaseMode}
        auditLogs={visibleData.auditLogs}
        onLogout={logout}
        message={message}
      />
    )
  }

  return (
    <div className="app">
      <header className="hero no-print" style={{ backgroundImage: `url(${websiteSettings.heroImage || '/hero-page.png'})` }}>
        <UserProfileMenu
          currentUser={currentUser}
          onLogout={logout}
        />
      </header>

      <main>

        <div className="tabs no-print">
          <button onClick={() => setTab('dashboard')} className={tab === 'dashboard' ? 'active' : ''}><LayoutDashboard size={16} /> {isAdminPortal ? 'Admin Dashboard' : 'Dashboard'}</button>
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

            {allowedRole === 'supervisor' && <FilterBar filters={filters} setFilters={setFilters} projects={visibleProjects} />}

            {allowedRole === 'student' && <StudentDashboard data={visibleData} projects={visibleProjects} currentUser={currentUser} createProject={createProject} createWeeklyReport={createWeeklyReport} sendWeeklyReportToMyEmail={sendWeeklyReportToMyEmail} emailSendingReports={emailSendingReports} />}
            {allowedRole === 'supervisor' && <SupervisorDashboard data={visibleData} projects={filteredProjects} currentUser={currentUser} reviewReport={reviewReport} createDeadline={createDeadline} removeDeadline={removeDeadline} sendWeeklyReportToMyEmail={sendWeeklyReportToMyEmail} emailSendingReports={emailSendingReports} />}
            {allowedRole === 'committee' && <CommitteeDashboard data={visibleData} projects={visibleProjects} updateProject={updateProject} saveEvaluation={saveEvaluation} />}
            {allowedRole === 'admin' && <AdminDashboard data={visibleData} projects={visibleProjects} currentUser={currentUser} updateProject={updateProject} updateUserRole={updateUserRole} updateUserStatus={updateUserStatus} assignStudentToSupervisor={assignStudentToSupervisor} exportCsv={exportCsv} deleteWeeklyReport={deleteWeeklyReport} deleteUploadedFile={deleteUploadedFile} deleteUserAccount={deleteUserAccount} deleteResearchGroup={deleteResearchGroup} deleteResearchProject={deleteResearchProject} loadError={dataLoadError} />}
          </>
        )}

        {tab === 'notifications' && <NotificationsTab data={data} role={allowedRole} currentUser={currentUser} createNotification={createNotification} markNotificationRead={markNotificationRead} removeNotification={removeNotification} />}
        {tab === 'reports' && <ReportsTab data={visibleData} projects={filteredProjects} currentUser={currentUser} role={allowedRole} printPdfReport={printPdfReport} exportCsv={exportCsv} pdfReportSettings={pdfReportSettings} />}
        {tab === 'database' && allowedRole === 'admin' && <DatabaseTab databaseMode={databaseMode} />}
        {tab === 'database' && allowedRole !== 'admin' && <div className="card"><SectionHeader icon={Lock} title="Database Access Locked" subtitle="Only Admin accounts can view database status" /><p className="muted">Please use your role dashboard, notifications, or reports page.</p></div>}
        {tab === 'audit' && allowedRole === 'admin' && <AuditTab logs={visibleData.auditLogs} />}
      </main>
    </div>
  )
}

function UserProfileMenu({ currentUser, onLogout }) {
  const storageKey = `pharmatrack-profile-photo-${currentUser?.email || currentUser?.id || 'user'}`
  const [open, setOpen] = useState(false)
  const [photo, setPhoto] = useState(() => localStorage.getItem(storageKey) || '')
  const initial = String(currentUser?.full_name || currentUser?.email || 'U').trim().charAt(0).toUpperCase()
  const displayName = currentUser?.full_name || 'User'
  const displayEmail = currentUser?.email || 'No email available'

  function handlePhotoUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      setPhoto(result)
      localStorage.setItem(storageKey, result)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  function removePhoto() {
    setPhoto('')
    localStorage.removeItem(storageKey)
  }

  return (
    <div className={`student-profile-menu user-profile-menu ${open ? 'open' : ''}`} onMouseLeave={() => setOpen(false)}>
      <button className="student-profile-trigger redesigned" type="button" onClick={() => setOpen((value) => !value)} aria-label="Open profile menu">
        {photo ? <img src={photo} alt="Profile" /> : <span>{initial}</span>}
        <span className="profile-online-dot" aria-hidden="true" />
      </button>
      {open && (
        <div className="student-profile-dropdown redesigned-profile-card">
          <div className="profile-cover" />
          <div className="profile-card-body simplified-profile-card">
            <div className="profile-avatar-shell">
              <div className="student-profile-large redesigned">
                {photo ? <img src={photo} alt="Profile" /> : <span>{initial}</span>}
              </div>
            </div>

            <div className="profile-identity simplified-profile-identity">
              <h3>{displayName}</h3>
              <p>{displayEmail}</p>
            </div>

            <label className="profile-upload-button redesigned">
              <Upload size={15} /> {photo ? 'Change photo' : 'Add photo'}
              <input type="file" accept="image/*" onChange={handlePhotoUpload} />
            </label>
            <div className="profile-menu-actions">
              {photo && <button className="profile-menu-button subtle" type="button" onClick={removePhoto}>Remove</button>}
              <button className="profile-menu-button logout" type="button" onClick={onLogout}><LogOut size={15} /> Logout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


function AdminControlPanel({
  settings,
  pdfReportSettings = defaultPdfReportSettings,
  adminPanelTab,
  setAdminPanelTab,
  updateSettings,
  resetSettings,
  updatePdfReportSettings,
  uploadPdfReportLogo,
  removePdfReportLogo,
  resetPdfReportSettings,
  data,
  projects,
  currentUser,
  updateProject,
  updateUserRole,
  updateUserStatus,
  exportCsv,
  createDeadline,
  removeDeadline,
  deleteWeeklyReport,
  deleteUploadedFile,
  deleteUserAccount,
  deleteResearchGroup,
  deleteResearchProject,
  assignStudentToSupervisor,
  createInvitation,
  resendInvitation,
  cancelInvitation,
  copyInvitationLink,
  createNotification,
  markNotificationRead,
  removeNotification,
  printPdfReport,
  databaseMode,
  auditLogs,
  onLogout,
  message,
  loadError = '',
}) {
  const [draft, setDraft] = useState(settings)
  const [brandingError, setBrandingError] = useState('')
  useEffect(() => {
    setDraft(settings)
  }, [settings])

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'branding', label: 'Website Settings', icon: SlidersHorizontal },
    { id: 'login-settings', label: 'Login Page Settings', icon: Lock },
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'invitations', label: 'Invite Users', icon: Mail },
    { id: 'deadlines', label: 'Deadlines', icon: CalendarDays },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'reports', label: 'Reports', icon: Printer },
    { id: 'pdf-report', label: 'PDF Report Customization', icon: FileText },
    { id: 'database', label: 'Database', icon: Database },
    { id: 'audit', label: 'Audit Log', icon: ShieldCheck },
  ]

  function changeAdminPanelTab(nextTab) {
    if (!isAdminPanelTab(nextTab)) return
    setAdminPanelTab(nextTab)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('panel', nextTab)
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function handleImageUpload(key, file) {
    if (!file) return
    if (!file.type?.startsWith('image/')) {
      setBrandingError('Please choose a valid image file.')
      return
    }

    try {
      setBrandingError('Uploading image...')
      const isLogo = key === 'loginLogoImage'
      const outputType = isLogo && file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const dataUrl = isLogo
        ? await optimizeImageFile(file, { maxWidth: 600, maxHeight: 600, quality: 0.9, outputType })
        : await optimizeImageFile(file, { maxWidth: 1920, maxHeight: 1280, quality: 0.86, outputType })

      if (isSupabaseConfigured) {
        const blob = await fetch(dataUrl).then((response) => response.blob())
        const extension = outputType === 'image/png' ? 'png' : 'jpg'
        const safeName = String(file.name || key).replace(/[^a-z0-9._-]/gi, '-').toLowerCase()
        const filePath = `login-page/${key}-${Date.now()}-${safeName}.${extension}`
        const upload = await supabase.storage
          .from('app-assets')
          .upload(filePath, blob, {
            contentType: outputType,
            cacheControl: '3600',
            upsert: true,
          })

        if (upload.error) {
          updateDraft(key, dataUrl)
          setBrandingError(`Image preview loaded locally, but global upload failed: ${upload.error.message}. Run supabase/login_page_assets.sql in Supabase SQL Editor, then upload again.`)
          return
        }

        const { data: publicData } = supabase.storage.from('app-assets').getPublicUrl(filePath)
        const publicUrl = publicData?.publicUrl
        if (!publicUrl) throw new Error('Image uploaded, but Supabase did not return a public URL.')
        updateDraft(key, publicUrl)
        setBrandingError('Image uploaded successfully. Click Save Login Page Settings to publish it on the login page.')
        return
      }

      updateDraft(key, dataUrl)
      setBrandingError('Image preview loaded locally. Connect Supabase Storage to save it globally for all users.')
    } catch (error) {
      try {
        const fallback = await fileToDataUrl(file)
        updateDraft(key, fallback)
        setBrandingError(`Image preview loaded locally, but upload failed: ${error.message || 'Unknown error'}`)
      } catch {
        setBrandingError(error.message || 'Could not upload the selected image. Try a smaller JPG or PNG file.')
      }
    }
  }

  function saveLoginPageSettings() {
    const required = [
      ['loginWelcomeTitle', 'Welcome title'],
      ['loginWelcomeSubtitle', 'Subtitle/description'],
      ['loginFeatureOne', 'Feature point 1'],
      ['loginFeatureTwo', 'Feature point 2'],
      ['loginFeatureThree', 'Feature point 3'],
    ]
    const missing = required.filter(([key]) => !String(draft[key] || '').trim()).map(([, label]) => label)
    if (missing.length) {
      window.alert(`Please complete these required login page settings: ${missing.join(', ')}`)
      return
    }
    const titleSize = Number(draft.loginWelcomeTitleFontSize || defaultWebsiteSettings.loginWelcomeTitleFontSize)
    const descriptionSize = Number(draft.loginDescriptionFontSize || defaultWebsiteSettings.loginDescriptionFontSize)
    const featureSize = Number(draft.loginFeatureFontSize || defaultWebsiteSettings.loginFeatureFontSize)
    if (titleSize < 24 || titleSize > 120 || descriptionSize < 12 || descriptionSize > 60 || featureSize < 12 || featureSize > 60) {
      window.alert('Please keep title size between 24–120 px, and description/feature text size between 12–60 px.')
      return
    }
    updateSettings(draft)
  }

  const pendingUsers = data.profiles.filter((u) => (u.status || 'Pending') === 'Pending').length
  const activeUsers = data.profiles.filter((u) => (u.status || 'Pending') === 'Active').length
  const activeDeadlines = data.deadlines.filter((d) => (d.status || 'Active') === 'Active').length

  return (
    <div className="admin-panel-shell">
      <aside className="admin-sidebar no-print">
        <div className="admin-brand-block">
          <div className="admin-logo-mark"><Settings size={22} /></div>
          <div>
            <h2>{settings.adminPanelName || 'Pharmacy Research Platform Control Center'}</h2>
            <p>Website management panel</p>
          </div>
        </div>
        <div className="admin-profile-mini">
          <div className="status-avatar">{String(currentUser.full_name || 'A').trim().charAt(0).toUpperCase()}</div>
          <div>
            <b>{currentUser.full_name}</b>
            <p>Administrator</p>
          </div>
        </div>
        <nav className="admin-side-nav">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={adminPanelTab === item.id ? 'active' : ''} onClick={() => changeAdminPanelTab(item.id)}>
                <Icon size={17} /> {item.label}
              </button>
            )
          })}
        </nav>
        <button className="admin-logout" onClick={onLogout}><LogOut size={16} /> Logout</button>
      </aside>

      <main className="admin-panel-main">
        <header className="admin-panel-topbar no-print">
          <div>
            <p className="eyebrow"><UserCog size={16} /> Admin subdomain</p>
            <h1>{adminPanelTab === 'branding' ? 'Website Settings' : adminPanelTab === 'login-settings' ? 'Login Page Settings' : adminPanelTab === 'users' ? 'Users & Roles' : adminPanelTab === 'invitations' ? 'Invitation Manager' : adminPanelTab === 'deadlines' ? 'Deadline Manager' : adminPanelTab === 'notifications' ? 'Notifications' : adminPanelTab === 'reports' ? 'Reports' : adminPanelTab === 'pdf-report' ? 'PDF Report Customization' : adminPanelTab === 'database' ? 'Database Tools' : adminPanelTab === 'audit' ? 'Audit Log' : 'Control Center'}</h1>
            <p>{settings.adminWelcome}</p>
          </div>
          <a className="admin-preview-link" href="/" target="_blank" rel="noreferrer">Open main website</a>
        </header>

        {message && <div className="message no-print">{message}</div>}

        {adminPanelTab === 'overview' && (
          <div className="admin-panel-stack">
            <section className="admin-management-grid">
              <div className="admin-management-card">
                <div className="icon-box dark"><Users size={22} /></div>
                <p>Users</p>
                <h2>{data.profiles.length}</h2>
                <span>{activeUsers} active • {pendingUsers} pending</span>
              </div>
              <div className="admin-management-card">
                <div className="icon-box dark"><Mail size={22} /></div>
                <p>Invitations</p>
                <h2>{data.invitations.length}</h2>
                <span>{data.invitations.filter((i) => getInvitationDisplayStatus(i) === 'Pending').length} pending invites</span>
              </div>
              <div className="admin-management-card">
                <div className="icon-box dark"><BookOpen size={22} /></div>
                <p>Projects</p>
                <h2>{data.projects.length}</h2>
                <span>Research records in the system</span>
              </div>
              <div className="admin-management-card">
                <div className="icon-box dark"><CalendarDays size={22} /></div>
                <p>Deadlines</p>
                <h2>{activeDeadlines}</h2>
                <span>Active academic milestones</span>
              </div>
              <div className="admin-management-card">
                <div className="icon-box dark"><ImageIcon size={22} /></div>
                <p>Hero image</p>
                <h2>{settings.heroImage ? 'Set' : 'None'}</h2>
                <span>Homepage visual background</span>
              </div>
            </section>

            <section className="admin-split-layout">
              <div className="card admin-preview-card">
                <SectionHeader icon={ImageIcon} title="Website Preview" subtitle="Current public homepage visual and text settings" />
                <div className="admin-hero-preview" style={{ backgroundImage: `url(${settings.heroImage || '/hero-page.png'})` }}>
                  <div>
                    <h3>{settings.homepageHeadline}</h3>
                    <p>{settings.homepageSubtitle}</p>
                  </div>
                </div>
              </div>
              <div className="card admin-quick-actions">
                <SectionHeader icon={Settings} title="Quick Management" subtitle="Common website management actions" />
                <button className="secondary wide" onClick={() => changeAdminPanelTab('branding')}><SlidersHorizontal size={16} /> Change homepage hero and texts</button>
                <button className="secondary wide" onClick={() => changeAdminPanelTab('login-settings')}><Lock size={16} /> Edit login page design</button>
                <button className="secondary wide" onClick={() => changeAdminPanelTab('pdf-report')}><FileText size={16} /> Customize PDF report template</button>
                <button className="secondary wide" onClick={() => changeAdminPanelTab('users')}><Users size={16} /> Manage users and approvals</button>
                <button className="secondary wide" onClick={() => changeAdminPanelTab('invitations')}><Mail size={16} /> Invite users by role</button>
                <button className="secondary wide" onClick={() => changeAdminPanelTab('deadlines')}><CalendarDays size={16} /> Add or remove deadlines</button>
                <button className="secondary wide" onClick={exportCsv}><Download size={16} /> Export project CSV</button>
              </div>
            </section>
          </div>
        )}

        {adminPanelTab === 'branding' && (
          <div className="admin-split-layout">
            <div className="card">
              <SectionHeader icon={SlidersHorizontal} title="Website Content Settings" subtitle="Change homepage text, hero image, and admin panel labels" />
              <div className="form-grid">
                <label className="field"><span>Main website name</span><input value={draft.siteName || ''} onChange={(e) => updateDraft('siteName', e.target.value)} placeholder="Pharmacy Research Platform" /></label>
                <label className="field"><span>Admin panel name</span><input value={draft.adminPanelName || ''} onChange={(e) => updateDraft('adminPanelName', e.target.value)} placeholder="Pharmacy Research Platform Control Center" /></label>
                <label className="field wide-field"><span>Homepage headline</span><input value={draft.homepageHeadline || ''} onChange={(e) => updateDraft('homepageHeadline', e.target.value)} placeholder="A web-based Pharmacy Research Project Management System" /></label>
                <label className="field wide-field"><span>Homepage subtitle</span><textarea value={draft.homepageSubtitle || ''} onChange={(e) => updateDraft('homepageSubtitle', e.target.value)} placeholder="Write the subtitle shown on the public website" /></label>
                <label className="field wide-field"><span>Admin welcome message</span><textarea value={draft.adminWelcome || ''} onChange={(e) => updateDraft('adminWelcome', e.target.value)} placeholder="Write the admin panel welcome text" /></label>
                <label className="field wide-field"><span>Maintenance notice / announcement</span><input value={draft.maintenanceNotice || ''} onChange={(e) => updateDraft('maintenanceNotice', e.target.value)} placeholder="Optional notice shown to admins" /></label>
              </div>

              <div className="settings-actions">
                <button className="primary" onClick={() => updateSettings(draft)}><Save size={16} /> Save Website Settings</button>
                <button className="secondary" onClick={resetSettings}>Reset Defaults</button>
              </div>
            </div>

            <div className="card">
              <SectionHeader icon={ImageIcon} title="Homepage Hero Image" subtitle="Upload a preview image or paste a hosted image URL" />
              <label className="field"><span>Homepage hero image URL</span><input value={draft.heroImage || ''} onChange={(e) => updateDraft('heroImage', e.target.value)} placeholder="/hero-page.png or image URL" /></label>
              <label className="field"><span>Upload homepage hero image</span><input type="file" accept="image/*" onChange={(e) => handleImageUpload('heroImage', e.target.files?.[0])} /></label>
              <div className="admin-image-preview" style={{ backgroundImage: `url(${draft.heroImage || '/hero-page.png'})` }} />

              <div className="soft-box settings-note">
                <b>Important</b>
                <p>For a permanent public change, use a hosted image URL or save settings to Supabase. Local uploaded images are useful for preview and testing.</p>
              </div>
            </div>
          </div>
        )}

        {adminPanelTab === 'login-settings' && (
          <div className="admin-split-layout login-settings-layout">
            <div className="card">
              <SectionHeader icon={Lock} title="Login Page Settings" subtitle="Customize only the login page images and text content" />
              <div className="form-grid">
                <label className="field wide-field"><span>Background photo/image URL</span><input value={draft.loginBackgroundImage || ''} onChange={(e) => updateDraft('loginBackgroundImage', e.target.value)} placeholder="/hero-page.png or hosted image URL" /></label>
                <label className="field wide-field"><span>Upload background photo/image</span><input type="file" accept="image/*" onChange={(e) => handleImageUpload('loginBackgroundImage', e.target.files?.[0])} /></label>
                <label className="field wide-field"><span>Logo/icon image URL</span><input value={draft.loginLogoImage || ''} onChange={(e) => updateDraft('loginLogoImage', e.target.value)} placeholder="Optional logo/icon image URL" /></label>
                <label className="field wide-field"><span>Upload logo/icon image</span><input type="file" accept="image/*" onChange={(e) => handleImageUpload('loginLogoImage', e.target.files?.[0])} /></label>
                <label className="field wide-field"><span>Welcome title</span><input value={draft.loginWelcomeTitle || ''} onChange={(e) => updateDraft('loginWelcomeTitle', e.target.value)} placeholder="Welcome to Research Platform" /></label>
                <label className="field wide-field"><span>Subtitle / description</span><textarea value={draft.loginWelcomeSubtitle || ''} onChange={(e) => updateDraft('loginWelcomeSubtitle', e.target.value)} placeholder="Publish your groundbreaking research and connect with scholars worldwide." /></label>
                <label className="field"><span>Feature point 1</span><input value={draft.loginFeatureOne || ''} onChange={(e) => updateDraft('loginFeatureOne', e.target.value)} placeholder="Open Access Publishing" /></label>
                <label className="field"><span>Feature point 2</span><input value={draft.loginFeatureTwo || ''} onChange={(e) => updateDraft('loginFeatureTwo', e.target.value)} placeholder="Peer Review Excellence" /></label>
                <label className="field"><span>Feature point 3</span><input value={draft.loginFeatureThree || ''} onChange={(e) => updateDraft('loginFeatureThree', e.target.value)} placeholder="Global Research Community" /></label>

                <div className="settings-subsection wide-field"><h3>Welcome title text style</h3><p>Change the title size, color, font, bold, and italic style.</p></div>
                <label className="field"><span>Title size (px)</span><input type="number" min="24" max="120" value={draft.loginWelcomeTitleFontSize || defaultWebsiteSettings.loginWelcomeTitleFontSize} onChange={(e) => updateDraft('loginWelcomeTitleFontSize', Number(e.target.value))} /></label>
                <label className="field"><span>Title color</span><input type="color" value={draft.loginWelcomeTitleColor || defaultWebsiteSettings.loginWelcomeTitleColor} onChange={(e) => updateDraft('loginWelcomeTitleColor', e.target.value)} /></label>
                <label className="field"><span>Title font</span><select value={draft.loginWelcomeTitleFontFamily || defaultWebsiteSettings.loginWelcomeTitleFontFamily} onChange={(e) => updateDraft('loginWelcomeTitleFontFamily', e.target.value)}>{loginFontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}</select></label>
                <label className="settings-toggle"><input type="checkbox" checked={draft.loginWelcomeTitleBold !== false} onChange={(e) => updateDraft('loginWelcomeTitleBold', e.target.checked)} /><span><b>Title bold</b><small>Turn off to use normal title weight.</small></span></label>
                <label className="settings-toggle"><input type="checkbox" checked={Boolean(draft.loginWelcomeTitleItalic)} onChange={(e) => updateDraft('loginWelcomeTitleItalic', e.target.checked)} /><span><b>Title italic</b><small>Turn on to italicize the welcome title.</small></span></label>

                <div className="settings-subsection wide-field"><h3>Description text style</h3><p>Change the subtitle/description size, color, font, bold, and italic style.</p></div>
                <label className="field"><span>Description size (px)</span><input type="number" min="12" max="60" value={draft.loginDescriptionFontSize || defaultWebsiteSettings.loginDescriptionFontSize} onChange={(e) => updateDraft('loginDescriptionFontSize', Number(e.target.value))} /></label>
                <label className="field"><span>Description color</span><input type="color" value={draft.loginDescriptionColor || defaultWebsiteSettings.loginDescriptionColor} onChange={(e) => updateDraft('loginDescriptionColor', e.target.value)} /></label>
                <label className="field"><span>Description font</span><select value={draft.loginDescriptionFontFamily || defaultWebsiteSettings.loginDescriptionFontFamily} onChange={(e) => updateDraft('loginDescriptionFontFamily', e.target.value)}>{loginFontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}</select></label>
                <label className="settings-toggle"><input type="checkbox" checked={Boolean(draft.loginDescriptionBold)} onChange={(e) => updateDraft('loginDescriptionBold', e.target.checked)} /><span><b>Description bold</b><small>Turn on to bold the subtitle/description.</small></span></label>
                <label className="settings-toggle"><input type="checkbox" checked={Boolean(draft.loginDescriptionItalic)} onChange={(e) => updateDraft('loginDescriptionItalic', e.target.checked)} /><span><b>Description italic</b><small>Turn on to italicize the subtitle/description.</small></span></label>

                <div className="settings-subsection wide-field"><h3>Feature points text style</h3><p>Change all three feature points together.</p></div>
                <label className="field"><span>Feature text size (px)</span><input type="number" min="12" max="60" value={draft.loginFeatureFontSize || defaultWebsiteSettings.loginFeatureFontSize} onChange={(e) => updateDraft('loginFeatureFontSize', Number(e.target.value))} /></label>
                <label className="field"><span>Feature text color</span><input type="color" value={draft.loginFeatureColor || defaultWebsiteSettings.loginFeatureColor} onChange={(e) => updateDraft('loginFeatureColor', e.target.value)} /></label>
                <label className="field"><span>Feature text font</span><select value={draft.loginFeatureFontFamily || defaultWebsiteSettings.loginFeatureFontFamily} onChange={(e) => updateDraft('loginFeatureFontFamily', e.target.value)}>{loginFontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}</select></label>
                <label className="settings-toggle"><input type="checkbox" checked={draft.loginFeatureBold !== false} onChange={(e) => updateDraft('loginFeatureBold', e.target.checked)} /><span><b>Feature text bold</b><small>Turn off to use normal feature text weight.</small></span></label>
                <label className="settings-toggle"><input type="checkbox" checked={Boolean(draft.loginFeatureItalic)} onChange={(e) => updateDraft('loginFeatureItalic', e.target.checked)} /><span><b>Feature text italic</b><small>Turn on to italicize feature points.</small></span></label>

                <label className="field"><span>Background color 1</span><input type="color" value={draft.loginGradientStart || defaultWebsiteSettings.loginGradientStart} onChange={(e) => updateDraft('loginGradientStart', e.target.value)} /></label>
                <label className="field"><span>Background color 2</span><input type="color" value={draft.loginGradientEnd || defaultWebsiteSettings.loginGradientEnd} onChange={(e) => updateDraft('loginGradientEnd', e.target.value)} /></label>
                <label className="field"><span>Circle color</span><input type="color" value={draft.loginCircleColor || defaultWebsiteSettings.loginCircleColor} onChange={(e) => updateDraft('loginCircleColor', e.target.value)} /></label>
                <label className="settings-toggle wide-field">
                  <input type="checkbox" checked={draft.loginShowGradientOverlay !== false} onChange={(e) => updateDraft('loginShowGradientOverlay', e.target.checked)} />
                  <span><b>Show blue/gradient background overlay</b><small>Turn this off to make the overlay invisible and show only the uploaded background image.</small></span>
                </label>
                <label className="settings-toggle wide-field">
                  <input type="checkbox" checked={draft.loginShowCircles !== false} onChange={(e) => updateDraft('loginShowCircles', e.target.checked)} />
                  <span><b>Show background circles</b><small>Turn this off to remove/hide the circles from the login page.</small></span>
                </label>
              </div>
              {brandingError && <div className="message">{brandingError}</div>}

              <div className="settings-actions">
                <button className="primary" onClick={saveLoginPageSettings}><Save size={16} /> Save Login Page Settings</button>
                <button className="secondary" onClick={() => setDraft((current) => ({
                  ...current,
                  loginBackgroundImage: defaultWebsiteSettings.loginBackgroundImage,
                  loginLogoImage: defaultWebsiteSettings.loginLogoImage,
                  loginWelcomeTitle: defaultWebsiteSettings.loginWelcomeTitle,
                  loginWelcomeSubtitle: defaultWebsiteSettings.loginWelcomeSubtitle,
                  loginFeatureOne: defaultWebsiteSettings.loginFeatureOne,
                  loginFeatureTwo: defaultWebsiteSettings.loginFeatureTwo,
                  loginFeatureThree: defaultWebsiteSettings.loginFeatureThree,
                  loginWelcomeTitleFontSize: defaultWebsiteSettings.loginWelcomeTitleFontSize,
                  loginWelcomeTitleColor: defaultWebsiteSettings.loginWelcomeTitleColor,
                  loginWelcomeTitleFontFamily: defaultWebsiteSettings.loginWelcomeTitleFontFamily,
                  loginWelcomeTitleBold: defaultWebsiteSettings.loginWelcomeTitleBold,
                  loginWelcomeTitleItalic: defaultWebsiteSettings.loginWelcomeTitleItalic,
                  loginDescriptionFontSize: defaultWebsiteSettings.loginDescriptionFontSize,
                  loginDescriptionColor: defaultWebsiteSettings.loginDescriptionColor,
                  loginDescriptionFontFamily: defaultWebsiteSettings.loginDescriptionFontFamily,
                  loginDescriptionBold: defaultWebsiteSettings.loginDescriptionBold,
                  loginDescriptionItalic: defaultWebsiteSettings.loginDescriptionItalic,
                  loginFeatureFontSize: defaultWebsiteSettings.loginFeatureFontSize,
                  loginFeatureColor: defaultWebsiteSettings.loginFeatureColor,
                  loginFeatureFontFamily: defaultWebsiteSettings.loginFeatureFontFamily,
                  loginFeatureBold: defaultWebsiteSettings.loginFeatureBold,
                  loginFeatureItalic: defaultWebsiteSettings.loginFeatureItalic,
                  loginGradientStart: defaultWebsiteSettings.loginGradientStart,
                  loginGradientEnd: defaultWebsiteSettings.loginGradientEnd,
                  loginCircleColor: defaultWebsiteSettings.loginCircleColor,
                  loginShowGradientOverlay: defaultWebsiteSettings.loginShowGradientOverlay,
                  loginShowCircles: defaultWebsiteSettings.loginShowCircles,
                }))}>Reset Login Defaults</button>
              </div>

              <div className="soft-box settings-note">
                <b>Fixed design style</b>
                <p>You can edit the background image, logo/icon, welcome title, subtitle, feature points, text styles, background colors, and circle color. You can also hide the blue/gradient overlay and hide the circles completely.</p>
              </div>
            </div>

            <div className="card login-admin-preview-card">
              <SectionHeader icon={Eye} title="Login Page Preview" subtitle="Preview of the current login branding section" />
              <div className={`login-settings-preview ${draft.loginShowCircles === false ? 'circles-hidden' : 'circles-live'}`} style={{
                '--auth-bg-image': `url(${draft.loginBackgroundImage || draft.loginHeroImage || draft.heroImage || '/hero-page.png'})`,
                '--login-bg-start': draft.loginGradientStart || defaultWebsiteSettings.loginGradientStart,
                '--login-bg-end': draft.loginGradientEnd || defaultWebsiteSettings.loginGradientEnd,
                '--login-circle-color': draft.loginCircleColor || defaultWebsiteSettings.loginCircleColor,
                '--login-overlay-opacity': draft.loginShowGradientOverlay === false ? '0' : '.86',
                '--login-circle-opacity': draft.loginShowCircles === false ? '0' : '.16',
                '--login-title-font-size': `${draft.loginWelcomeTitleFontSize || defaultWebsiteSettings.loginWelcomeTitleFontSize}px`,
                '--login-title-color': draft.loginWelcomeTitleColor || defaultWebsiteSettings.loginWelcomeTitleColor,
                '--login-title-font-family': draft.loginWelcomeTitleFontFamily || defaultWebsiteSettings.loginWelcomeTitleFontFamily,
                '--login-title-font-weight': draft.loginWelcomeTitleBold === false ? '500' : '800',
                '--login-title-font-style': draft.loginWelcomeTitleItalic ? 'italic' : 'normal',
                '--login-description-font-size': `${draft.loginDescriptionFontSize || defaultWebsiteSettings.loginDescriptionFontSize}px`,
                '--login-description-color': draft.loginDescriptionColor || defaultWebsiteSettings.loginDescriptionColor,
                '--login-description-font-family': draft.loginDescriptionFontFamily || defaultWebsiteSettings.loginDescriptionFontFamily,
                '--login-description-font-weight': draft.loginDescriptionBold ? '800' : '500',
                '--login-description-font-style': draft.loginDescriptionItalic ? 'italic' : 'normal',
                '--login-feature-font-size': `${draft.loginFeatureFontSize || defaultWebsiteSettings.loginFeatureFontSize}px`,
                '--login-feature-color': draft.loginFeatureColor || defaultWebsiteSettings.loginFeatureColor,
                '--login-feature-font-family': draft.loginFeatureFontFamily || defaultWebsiteSettings.loginFeatureFontFamily,
                '--login-feature-font-weight': draft.loginFeatureBold === false ? '500' : '800',
                '--login-feature-font-style': draft.loginFeatureItalic ? 'italic' : 'normal',
              }}>
                <div className="auth-circle auth-circle-one" />
                <div className="auth-circle auth-circle-two" />
                <div className="auth-circle auth-circle-three" />
                <div className="login-settings-preview-content">
                  <div className="auth-brand-logo preview-logo">
                    {draft.loginLogoImage ? <img src={draft.loginLogoImage} alt="Login logo preview" /> : <BookOpen size={26} />}
                  </div>
                  <h3>{draft.loginWelcomeTitle || defaultWebsiteSettings.loginWelcomeTitle}</h3>
                  <p>{draft.loginWelcomeSubtitle || defaultWebsiteSettings.loginWelcomeSubtitle}</p>
                  <ul>
                    {[draft.loginFeatureOne, draft.loginFeatureTwo, draft.loginFeatureThree].map((item, index) => (
                      <li key={index}><CheckCircle2 size={15} /> {item || `Feature point ${index + 1}`}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="admin-image-preview small" style={{ backgroundImage: `url(${draft.loginLogoImage || ''})` }}>
                {!draft.loginLogoImage && <span>No logo/icon image selected</span>}
              </div>
            </div>
          </div>
        )}

        {adminPanelTab === 'invitations' && <InvitationManager invitations={data.invitations} settings={settings} createInvitation={createInvitation} resendInvitation={resendInvitation} cancelInvitation={cancelInvitation} copyInvitationLink={copyInvitationLink} />}
        {adminPanelTab === 'users' && <AdminDashboard data={data} projects={projects} currentUser={currentUser} loadError={loadError} updateProject={updateProject} updateUserRole={updateUserRole} updateUserStatus={updateUserStatus} assignStudentToSupervisor={assignStudentToSupervisor} exportCsv={exportCsv} deleteWeeklyReport={deleteWeeklyReport} deleteUploadedFile={deleteUploadedFile} deleteUserAccount={deleteUserAccount} deleteResearchGroup={deleteResearchGroup} deleteResearchProject={deleteResearchProject} />}
        {adminPanelTab === 'deadlines' && <DeadlineManager deadlines={data.deadlines} createDeadline={createDeadline} removeDeadline={removeDeadline} students={data.profiles.filter((profile) => profile.role === 'student').map((student) => ({ key: makeStudentOptionKey(student), id: student.id, name: student.full_name, email: student.email, group: student.department || student.area || 'Student' }))} currentUser={currentUser} />}
        {adminPanelTab === 'notifications' && <NotificationsTab data={data} role="admin" currentUser={currentUser} createNotification={createNotification} markNotificationRead={markNotificationRead} removeNotification={removeNotification} />}
        {adminPanelTab === 'reports' && <ReportsTab data={data} projects={projects} currentUser={currentUser} role="admin" printPdfReport={printPdfReport} exportCsv={exportCsv} pdfReportSettings={pdfReportSettings} />}
        {adminPanelTab === 'pdf-report' && <PdfReportCustomizationPanel settings={pdfReportSettings} updateSettings={updatePdfReportSettings} uploadLogo={uploadPdfReportLogo} removeLogo={removePdfReportLogo} resetSettings={resetPdfReportSettings} data={data} projects={projects} currentUser={currentUser} printPdfReport={printPdfReport} />}
        {adminPanelTab === 'database' && <DatabaseTab databaseMode={databaseMode} />}
        {adminPanelTab === 'audit' && <AuditTab logs={auditLogs} />}
      </main>
    </div>
  )
}


function InvitationManager({ invitations, settings, createInvitation, resendInvitation, cancelInvitation, copyInvitationLink }) {
  const defaultRole = 'student'
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    role: defaultRole,
    subject: invitationTemplates[defaultRole].subject,
    body: invitationTemplates[defaultRole].body,
    expires_in_days: 7,
  })
  const [filters, setFilters] = useState({ search: '', role: 'all', status: 'all' })
  const [previewOpen, setPreviewOpen] = useState(true)

  function updateRole(role) {
    setForm((current) => ({
      ...current,
      role,
      subject: invitationTemplates[role]?.subject || current.subject,
      body: invitationTemplates[role]?.body || current.body,
    }))
  }

  function resetForm() {
    setForm({
      full_name: '',
      email: '',
      role: defaultRole,
      subject: invitationTemplates[defaultRole].subject,
      body: invitationTemplates[defaultRole].body,
      expires_in_days: 7,
    })
  }

  const draftToken = useMemo(() => 'secure-token-generated-on-send', [])
  const previewInvitation = {
    ...form,
    token: draftToken,
    invitation_link: `${typeof window !== 'undefined' ? window.location.origin : ''}/?invite=${draftToken}`,
    expires_at: addDays(new Date(), Number(form.expires_in_days || 7)).toISOString(),
    status: 'Pending',
  }

  const filteredInvitations = invitations.filter((item) => {
    const q = filters.search.trim().toLowerCase()
    const displayStatus = getInvitationDisplayStatus(item)
    const matchesSearch = !q || [item.full_name, item.email, item.subject, item.role].some((value) => String(value || '').toLowerCase().includes(q))
    const matchesRole = filters.role === 'all' || item.role === filters.role
    const matchesStatus = filters.status === 'all' || displayStatus === filters.status
    return matchesSearch && matchesRole && matchesStatus
  })

  async function handleSendInvitation() {
    const created = await createInvitation(form, { openEmail: !isSupabaseConfigured })
    if (created) resetForm()
  }

  return (
    <div className="invitation-panel">
      <div className="admin-split-layout invitation-layout">
        <div className="card invitation-compose-card">
          <SectionHeader icon={Mail} title="Invite Users" subtitle="Create secure role-based invitations with editable email templates" />
          <div className="form-grid">
            <label className="field"><span>Full name</span><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Recipient full name" /></label>
            <label className="field"><span>Email address</span><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="recipient@hmu.edu.krd" /></label>
            <label className="field"><span>Assigned role</span><select value={form.role} onChange={(e) => updateRole(e.target.value)}>{invitationRoles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
            <label className="field"><span>Expires after</span><select value={form.expires_in_days} onChange={(e) => setForm({ ...form, expires_in_days: e.target.value })}><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></label>
            <label className="field wide-field"><span>Email subject</span><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Invitation email subject" /></label>
            <label className="field wide-field"><span>Email body</span><textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write the invitation email body" /></label>
          </div>
          <div className="invitation-template-help">
            <b>Available placeholders:</b> [Name], [Role], [Link], [Expiration Date], [Website Name]
          </div>
          <div className="settings-actions">
            <button className="secondary" type="button" onClick={() => setPreviewOpen((current) => !current)}><Eye size={16} /> {previewOpen ? 'Hide Preview' : 'Preview Email'}</button>
            <button className="primary" type="button" onClick={handleSendInvitation}><Send size={16} /> Send Invitation</button>
          </div>
        </div>

        {previewOpen && (
          <div className="card invitation-preview-card">
            <SectionHeader icon={Eye} title="Email Preview" subtitle="Review the message before sending" />
            <div className="email-preview-shell">
              <p className="small muted">To: {form.email || 'recipient@hmu.edu.krd'}</p>
              <h3>{form.subject || 'Invitation email subject'}</h3>
              <pre>{buildInvitationEmail(previewInvitation, settings)}</pre>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <SectionHeader icon={ClipboardCheck} title="Invitation Tracking" subtitle="Search, resend, cancel, and monitor invitation status" />
        <div className="invitation-filters">
          <label className="field"><span>Search</span><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search name, email, role, subject" /></label>
          <label className="field"><span>Role</span><select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}><option value="all">All roles</option>{invitationRoles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
          <label className="field"><span>Status</span><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">All statuses</option><option>Pending</option><option>Accepted</option><option>Expired</option><option>Cancelled</option></select></label>
        </div>

        <div className="invitation-table-wrap">
          <table className="invitation-table">
            <thead><tr><th>Recipient</th><th>Role</th><th>Status</th><th>Sent</th><th>Expires</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredInvitations.length ? filteredInvitations.map((item) => {
                const status = getInvitationDisplayStatus(item)
                return (
                  <tr key={item.id}>
                    <td><b>{item.full_name}</b><p>{item.email}</p></td>
                    <td>{getRoleLabel(item.role)}</td>
                    <td><Pill tone={status === 'Pending' ? 'amber' : status === 'Accepted' ? 'green' : status === 'Expired' ? 'red' : 'slate'}>{status}</Pill></td>
                    <td>{item.sent_at ? new Date(item.sent_at).toLocaleDateString() : String(item.created_at || '').slice(0, 10)}</td>
                    <td>{item.expires_at ? new Date(item.expires_at).toLocaleDateString() : 'Not set'}</td>
                    <td>
                      <div className="invitation-row-actions">
                        <button className="secondary compact-button" onClick={() => copyInvitationLink(item)}><Copy size={14} /> Copy</button>
                        <button className="secondary compact-button" onClick={() => resendInvitation(item.id)}><RefreshCw size={14} /> Resend</button>
                        {status === 'Pending' && <button className="danger compact-button" onClick={() => cancelInvitation(item.id)}><XCircle size={14} /> Cancel</button>}
                      </div>
                    </td>
                  </tr>
                )
              }) : (
                <tr><td colSpan="6"><EmptyState title="No invitations found" text="Create the first invitation using the form above, or adjust your filters." icon={Mail} /></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="soft-box settings-note">
          <b><Clock size={15} /> Security note</b>
          <p>Each invitation uses a unique token and a fixed expiry period. Production email delivery uses a Supabase Edge Function connected to Resend. Keep RESEND_API_KEY and sender settings in Supabase Function Secrets, never in the browser.</p>
        </div>
      </div>
    </div>
  )
}

function AdminAccessDenied({ currentUser, onLogout }) {
  return (
    <div className="login-page admin-denied-page">
      <div className="card admin-denied-card">
        <div className="icon-box dark"><Lock size={22} /></div>
        <h1>Admin Access Only</h1>
        <p className="muted">You are currently logged in as <b>{currentUser?.full_name || 'a non-admin user'}</b>. The admin subdomain is restricted to approved Admin accounts only.</p>
        <button className="primary" onClick={onLogout}><LogOut size={16} /> Logout and return to Admin Login</button>
      </div>
    </div>
  )
}

function FilterBar({ filters, setFilters, projects }) {
  const areas = ['All', ...DEPARTMENT_OPTIONS]
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

function StudentDashboard({ data, projects, currentUser, createProject, createWeeklyReport, sendWeeklyReportToMyEmail, emailSendingReports = {} }) {
  const ownProjects = projects.filter((p) => isOwnStudentProject(p, currentUser))
  const selectedProject = ownProjects[0] || data.projects.find((p) => isOwnStudentProject(p, currentUser))
  const hasSubmittedResearchTitle = Boolean(selectedProject)
  const reports = data.reports.filter((r) => String(r.project_id) === String(selectedProject?.id) && reportOwnedByUser(r, currentUser))
  const projectProgress = selectedProject ? getProjectProgress(selectedProject, data.reports) : 0
  const [titleForm, setTitleForm] = useState({ title: '', area: DEFAULT_DEPARTMENT, group_name: `${currentUser.full_name} Research Group`, final_due: '2026-06-20' })
  const [reportForm, setReportForm] = useState({ completed_work: '', challenges: '', next_week_plan: '', attendance: 'Attended' })
  const [file, setFile] = useState(null)

  return (
    <div className="stack student-dashboard-layout">
      <div className="grid two-one student-dashboard-row student-dashboard-top-row">
        <div className="card student-project-card">
          <SectionHeader icon={BookOpen} title="My Research Project" subtitle="Your submitted project and progress" />
          {selectedProject ? (
            <div className="soft-box project-progress-card-surface">
              <div className="split project-progress-header">
                <div>
                  <p className="muted small bold">{selectedProject.group_name}</p>
                  <h3>{selectedProject.area}</h3>
                  <p className="muted">{selectedProject.title}</p>
                  <p className="muted small">Supervisor: {selectedProject.supervisor_name}</p>
                </div>
                <Pill tone={selectedProject.approval === 'Approved' ? 'green' : 'amber'}>{selectedProject.approval}</Pill>
              </div>
              <div className="progress-row"><span>Progress</span><span>{formatProgress(projectProgress)}%</span></div>
              <ProgressBar value={projectProgress} />
            </div>
          ) : <EmptyState title="No project yet" text="Submit a research title below to create your first project." />}
        </div>

        <div className="student-dashboard-side-top">
          <DeadlinesCard deadlines={data.deadlines} />
        </div>
      </div>

      <div className="grid two-one student-dashboard-row student-report-feedback-row">
        <div className="card student-weekly-report-card">
          <SectionHeader icon={MessageSquareText} title="Submit Weekly Report" subtitle="Submit progress and upload evidence file" />
          {selectedProject ? (
            <>
              <div className="form-grid weekly-report-form-grid">
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
              <button className="primary" onClick={() => createWeeklyReport({ ...reportForm, project_id: selectedProject.id, submitted_by: currentUser.full_name }, file)}><Upload size={16} /> Submit Weekly Report</button>
            </>
          ) : <EmptyState title="Weekly reports locked" text="Create a research project first, then weekly report submission will be available." icon={Lock} />}
        </div>

        <div className="card supervisor-feedback-card-fixed student-feedback-aligned-card">
          <SectionHeader icon={MessageSquareText} title="Supervisor Feedback" subtitle="Latest comments" />
          {reports.length ? (
            <div className="feedback-form-scroll-container student-supervisor-feedback-container">
              {reports.map((r) => {
                const attachment = getReportAttachment(r, data.uploadedFiles)
                return (
                  <div className="mini-card" key={r.id}>
                    <div className="split">
                      <b>Week {r.week_number}</b>
                      <div className="inline-actions">
                        <Pill tone={r.status === 'Accepted' ? 'green' : r.status === 'Revision Required' ? 'red' : 'amber'}>{r.status}</Pill>
                        <EmailReportButton loading={Boolean(emailSendingReports[r.id])} onSend={() => sendWeeklyReportToMyEmail(r.id)} />
                      </div>
                    </div>
                    <div className="supervisor-feedback-scroll-box student-feedback-box"><p>{r.supervisor_feedback || 'Waiting for supervisor review.'}</p></div>
                    <ReportAttachmentBox attachment={attachment} />
                    <p className="muted small">Score: {r.score ?? 'Pending'}/20</p>
                  </div>
                )
              })}
            </div>
          ) : <EmptyState title="No feedback yet" text="Feedback will appear after your supervisor reviews a weekly report." icon={MessageSquareText} />}
        </div>
      </div>


      {!hasSubmittedResearchTitle && (
        <div className="card">
          <SectionHeader icon={FileText} title="Submit New Research Title" subtitle="Create a new project for committee review" />
          <div className="form-grid compact">
            <input value={titleForm.title} onChange={(e) => setTitleForm({ ...titleForm, title: e.target.value })} placeholder="Research title" />
            <select value={titleForm.area} onChange={(e) => setTitleForm({ ...titleForm, area: e.target.value })}>
              {DEPARTMENT_OPTIONS.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
            <input value={titleForm.group_name} onChange={(e) => setTitleForm({ ...titleForm, group_name: e.target.value })} placeholder="Group name" />
            <input type="date" value={titleForm.final_due} onChange={(e) => setTitleForm({ ...titleForm, final_due: e.target.value })} />
          </div>
          <button className="primary" onClick={() => createProject(titleForm)}>Submit Title</button>
        </div>
      )}
    </div>
  )
}

function SupervisorDashboard({ data, projects, currentUser, reviewReport, createDeadline, removeDeadline, sendWeeklyReportToMyEmail, emailSendingReports = {} }) {
  const [feedback, setFeedback] = useState({})
  const [selectedStudent, setSelectedStudent] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedGroup, setSelectedGroup] = useState('all')
  const assignedProjects = useMemo(() => projects.filter((p) => isAssignedSupervisorProject(p, currentUser)), [projects, currentUser])
  const supervisorProgressProjects = useMemo(() => getSupervisorProgressProjects(data, assignedProjects), [data, assignedProjects])
  const studentOptions = useMemo(() => getAssignedSupervisorStudents(data, assignedProjects, []), [data, assignedProjects])
  const allowedReports = useMemo(() => getSupervisorAllowedReports(data, assignedProjects, currentUser), [data, assignedProjects, currentUser])

  const groupOptions = useMemo(() => {
    return Array.from(new Set(assignedProjects.map((project) => project.group_name || 'No research group'))).sort((a, b) => a.localeCompare(b))
  }, [assignedProjects])

  useEffect(() => {
    if (selectedStudent !== 'all' && !studentOptions.some((student) => student.key === selectedStudent)) setSelectedStudent('all')
    if (selectedGroup !== 'all' && !groupOptions.includes(selectedGroup)) setSelectedGroup('all')
  }, [studentOptions, groupOptions, selectedStudent, selectedGroup])

  const reports = allowedReports.filter((report) => {
    const project = assignedProjects.find((item) => String(item.id) === String(report.project_id))
    const selectedStudentOption = selectedStudent === 'all' ? null : studentOptions.find((student) => student.key === selectedStudent)
    const statusMatches = selectedStatus === 'all' || report.status === selectedStatus
    const groupMatches = selectedGroup === 'all' || (project?.group_name || 'No research group') === selectedGroup
    const studentMatches = selectedStudent === 'all' || itemMatchesStudentOption(report, selectedStudentOption)
    return statusMatches && groupMatches && studentMatches
  })

  const selectedStudentName = selectedStudent === 'all' ? '' : studentOptions.find((student) => student.key === selectedStudent)?.name

  return (
    <div className="stack">
      {supervisorProgressProjects.length ? <ProjectProgressSection projects={supervisorProgressProjects} reports={allowedReports} students={studentOptions} /> : <div className="card"><EmptyState title="No assigned projects" text="Ask the admin to assign projects to your exact login name, or assign yourself from the Admin view for testing." icon={Users} /></div>}
      <DeadlineManager deadlines={data.deadlines} createDeadline={createDeadline} removeDeadline={removeDeadline} students={studentOptions} currentUser={currentUser} />

      <div className="card supervisor-review-reports-card">
        <SectionHeader icon={ClipboardCheck} title="Review Weekly Reports" subtitle="Choose a student, then review their weekly reports" />
        <div className="supervisor-report-filter-panel">
          <label className="field">
            <span>Student</span>
            <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
              <option value="all">All Assigned Students</option>
              {studentOptions.map((student) => (
                <option key={student.key} value={student.key}>
                  {student.name}{student.email ? ` — ${student.email}` : ''}{student.group ? ` (${student.group})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Report status</span>
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="Submitted">Pending</option>
              <option value="Accepted">Accepted</option>
              <option value="Rejected">Rejected</option>
              <option value="Revision Required">Needs Revision</option>
            </select>
          </label>
          <label className="field">
            <span>Research group</span>
            <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
              <option value="all">All Research Groups</option>
              {groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
          </label>
        </div>
        {reports.length ? (
          <div className="supervisor-review-reports-scroll-container">
            {reports.map((r) => {
              const project = data.projects.find((p) => p.id === r.project_id)
              const student = findStudentProfileForReport(data, r)
              return (
                <div className="review-card" key={r.id}>
                  <div className="split">
                    <div>
                      <p className="muted small bold">Student: {student?.full_name || r.submitted_by || project?.group_name || 'Unknown student'}</p>
                      {(student?.email || r.student_email || r.submitted_by_email || project?.group_name) && <p className="muted small">{student?.email || r.student_email || r.submitted_by_email || ''}{project?.group_name ? `${student?.email || r.student_email || r.submitted_by_email ? ' • ' : ''}${project.group_name}` : ''}</p>}
                      <h3>{project?.title || 'Weekly Report'}</h3>
                      <p className="muted small">Week {r.week_number} • Department: {r.department || project?.area || 'Not specified'} • Submitted {String(r.submitted_at || '').slice(0, 10) || 'date unavailable'}</p>
                    </div>
                    <div className="inline-actions">
                      <Pill tone={r.status === 'Accepted' ? 'green' : r.status === 'Revision Required' ? 'red' : 'amber'}>{r.status}</Pill>
                      <EmailReportButton loading={Boolean(emailSendingReports[r.id])} onSend={() => sendWeeklyReportToMyEmail(r.id)} />
                    </div>
                  </div>
                  <div className="report-detail-box">
                    <h4>Submitted report content</h4>
                    <div className="three-cols">
                      <div><b>Completed</b><p>{r.completed_work || 'No completed work written.'}</p></div>
                      <div><b>Challenges</b><p>{r.challenges || 'No challenges written.'}</p></div>
                      <div><b>Next plan</b><p>{r.next_week_plan || 'No next plan written.'}</p></div>
                    </div>
                  </div>
                  <div className="report-detail-box">
                    <h4>Attached file</h4>
                    {(() => {
                      const attachment = getReportAttachment(r, data.uploadedFiles)
                      return <ReportAttachmentBox attachment={attachment} />
                    })()}
                  </div>
                  <div className="report-detail-box supervisor-feedback-review-box">
                    <h4>Supervisor feedback section</h4>
                    <textarea
                      className="supervisor-feedback-textarea"
                      value={feedback[r.id] ?? r.supervisor_feedback ?? ''}
                      onChange={(e) => setFeedback({ ...feedback, [r.id]: e.target.value })}
                      placeholder="Supervisor feedback"
                    />
                    <div className="supervisor-feedback-actions">
                      <button onClick={() => reviewReport(r.id, 'Accepted', feedback[r.id] || 'Accepted. Continue with the next milestone.')} className="success">Approve</button>
                      <button onClick={() => reviewReport(r.id, 'Revision Required', feedback[r.id] || 'Revision required. Please add more detail.')} className="warning">Request Revision</button>
                      <button onClick={() => reviewReport(r.id, 'Rejected', feedback[r.id] || 'Rejected. Please meet your supervisor for guidance.')} className="danger">Reject</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : <EmptyState title={selectedStudentName ? 'No weekly reports found for this student.' : 'No weekly reports found for your assigned students.'} text={selectedStudentName ? `${selectedStudentName} has not submitted weekly reports matching this filter yet.` : 'Only reports from students assigned to you will appear here.'} icon={ClipboardCheck} />}
      </div>
    </div>
  )
}



function StudentMultiSelectDropdown({ students = [], targetScope, selectedKeys = [], onChange, error }) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handlePointerDown(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const filteredStudents = students.filter((student) => {
    const haystack = `${student.name || ''} ${student.email || ''} ${student.group || ''}`.toLowerCase()
    return haystack.includes(searchTerm.trim().toLowerCase())
  })

  const selectedStudents = targetScope === 'all_assigned'
    ? students
    : students.filter((student) => selectedKeys.includes(student.key))

  const summaryText = targetScope === 'all_assigned'
    ? 'All Assigned Students'
    : selectedStudents.length
      ? selectedStudents.map((student) => student.name).join(', ')
      : 'Select student(s)'

  function selectAllStudents() {
    onChange({ target_scope: 'all_assigned', selected_student_keys: [] })
    setOpen(false)
  }

  function toggleStudent(studentKey) {
    const currentKeys = targetScope === 'all_assigned' ? [] : selectedKeys
    const nextKeys = currentKeys.includes(studentKey)
      ? currentKeys.filter((key) => key !== studentKey)
      : [...currentKeys, studentKey]
    onChange({ target_scope: 'selected_students', selected_student_keys: nextKeys })
  }

  function removeStudent(studentKey, event) {
    event.stopPropagation()
    const nextKeys = selectedKeys.filter((key) => key !== studentKey)
    onChange({ target_scope: nextKeys.length ? 'selected_students' : 'selected_students', selected_student_keys: nextKeys })
  }

  return (
    <div className="field deadline-student-dropdown-field" ref={dropdownRef}>
      <span>Send deadline to</span>
      <button
        className={`student-multiselect-trigger${open ? ' open' : ''}${error ? ' error' : ''}`}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={selectedStudents.length ? 'student-multiselect-summary' : 'student-multiselect-placeholder'}>{summaryText}</span>
        <SlidersHorizontal size={16} />
      </button>
      {targetScope === 'selected_students' && selectedStudents.length > 0 && (
        <div className="selected-student-chips">
          {selectedStudents.map((student) => (
            <button key={student.key} type="button" className="selected-student-chip" onClick={(event) => removeStudent(student.key, event)}>
              {student.name}
              <XCircle size={13} />
            </button>
          ))}
        </div>
      )}
      {error && <small className="form-error-text">{error}</small>}
      {open && (
        <div className="student-multiselect-menu">
          <div className="student-multiselect-search">
            <Search size={15} />
            <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search by name or email" autoFocus />
          </div>
          <button type="button" className={`student-option-row all-option${targetScope === 'all_assigned' ? ' selected' : ''}`} onClick={selectAllStudents}>
            <span className="student-option-check">{targetScope === 'all_assigned' ? '✓' : ''}</span>
            <span><b>All Assigned Students</b><small>Send only to your assigned students</small></span>
          </button>
          <div className="student-options-scroll">
            {filteredStudents.length ? filteredStudents.map((student) => {
              const selected = targetScope === 'selected_students' && selectedKeys.includes(student.key)
              return (
                <button key={student.key} type="button" className={`student-option-row${selected ? ' selected' : ''}`} onClick={() => toggleStudent(student.key)}>
                  <span className="student-option-check">{selected ? '✓' : ''}</span>
                  <span>
                    <b>{student.name}</b>
                    <small>{student.email || 'No email'}{student.group ? ` • ${student.group}` : ''}</small>
                  </span>
                </button>
              )
            }) : <div className="student-option-empty">No assigned students found.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function DeadlineManager({ deadlines, createDeadline, removeDeadline, students = [], currentUser }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    deadline_type: 'Weekly Report',
    due_date: '',
    academic_year: '2026-2027',
    status: 'Active',
    priority: 'Normal',
    target_scope: 'all_assigned',
    selected_student_keys: [],
  })
  const [studentSelectError, setStudentSelectError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [savingDeadline, setSavingDeadline] = useState(false)

  const selectedStudents = form.target_scope === 'all_assigned'
    ? students
    : students.filter((student) => form.selected_student_keys.includes(student.key))
  const hasValidDeadlineRecipients = selectedStudents.length > 0

  function resetForm() {
    setForm({ title: '', description: '', deadline_type: 'Weekly Report', due_date: '', academic_year: '2026-2027', status: 'Active', priority: 'Normal', target_scope: 'all_assigned', selected_student_keys: [] })
    setStudentSelectError('')
    setFieldErrors({})
  }

  function updateFormField(field, value) {
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateStudentSelection(nextSelection) {
    setStudentSelectError('')
    setForm((current) => ({ ...current, ...nextSelection }))
  }

  function validateDeadlineForm() {
    const nextErrors = {}
    if (!form.title.trim()) nextErrors.title = 'Please write a deadline title.'
    if (!form.due_date) nextErrors.due_date = 'Please choose a due date.'
    if (!selectedStudents.length) setStudentSelectError('Please select at least one student.')
    else setStudentSelectError('')
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0 && selectedStudents.length > 0
  }

  async function submitDeadline(event) {
    event?.preventDefault?.()
    if (savingDeadline) return
    if (!validateDeadlineForm()) return
    setSavingDeadline(true)
    const result = await createDeadline({
      ...form,
      selected_students: selectedStudents,
      target_scope: form.target_scope,
    })
    setSavingDeadline(false)
    if (result?.ok) resetForm()
  }

  return (
    <div className="card supervisor-deadline-card">
      <SectionHeader icon={CalendarDays} title="Set and Manage Deadlines" subtitle="Choose which assigned student receives each deadline" />
      <form className="deadline-create-form" onSubmit={submitDeadline} noValidate>
        <div className="deadline-target-panel deadline-target-panel-dropdown">
          <StudentMultiSelectDropdown
            students={students}
            targetScope={form.target_scope}
            selectedKeys={form.selected_student_keys}
            onChange={updateStudentSelection}
            error={studentSelectError}
          />
          <div className="deadline-target-summary">
            <b>Selected recipients</b>
            <p>{form.target_scope === 'all_assigned' ? 'All Assigned Students' : selectedStudents.length ? selectedStudents.map((student) => student.name).join(', ') : 'No assigned students selected'}</p>
            {!students.length && <small className="form-error-text">No assigned students found.</small>}
          </div>
        </div>
        <div className="deadline-form-grid deadline-form-grid-updated">
          <label className="field">
            <span>Deadline title</span>
            <input value={form.title} onChange={(e) => updateFormField('title', e.target.value)} placeholder="Example: Submit weekly report 3" aria-invalid={Boolean(fieldErrors.title)} />
            {fieldErrors.title && <small className="form-error-text">{fieldErrors.title}</small>}
          </label>
          <label className="field"><span>Deadline type</span><select value={form.deadline_type} onChange={(e) => updateFormField('deadline_type', e.target.value)}><option>Weekly Report</option><option>Proposal</option><option>Data Collection</option><option>Draft Thesis</option><option>Final Thesis</option><option>Poster</option><option>Presentation</option><option>Supervisor Deadline</option></select></label>
          <label className="field">
            <span>Due date</span>
            <input type="date" value={form.due_date} onChange={(e) => updateFormField('due_date', e.target.value)} aria-invalid={Boolean(fieldErrors.due_date)} />
            {fieldErrors.due_date && <small className="form-error-text">{fieldErrors.due_date}</small>}
          </label>
          <label className="field"><span>Academic year</span><input value={form.academic_year} onChange={(e) => updateFormField('academic_year', e.target.value)} placeholder="2026-2027" /></label>
          <label className="field"><span>Status</span><select value={form.status} onChange={(e) => updateFormField('status', e.target.value)}><option>Active</option><option>Inactive</option><option>Completed</option></select></label>
          <label className="field"><span>Priority</span><select value={form.priority} onChange={(e) => updateFormField('priority', e.target.value)}><option>Normal</option><option>High</option><option>Urgent</option><option>Low</option></select></label>
          <label className="field deadline-description-field"><span>Description</span><textarea value={form.description} onChange={(e) => updateFormField('description', e.target.value)} placeholder="Write deadline details or instructions" /></label>
          <div className="deadline-actions">
            <button className="primary" type="submit" disabled={savingDeadline || !hasValidDeadlineRecipients}>
              <CalendarDays size={16} /> {savingDeadline ? 'Adding Deadline...' : 'Add Deadline'}
            </button>
            {!hasValidDeadlineRecipients && <small className="form-error-text deadline-action-error">Please select at least one student.</small>}
          </div>
        </div>
      </form>
      <div className="deadline-list">
        {deadlines.length ? deadlines.map((d) => (
          <div className="mini-card deadline-item" key={d.id}>
            <div>
              <b>{d.title}</b>
              <p>{d.deadline_type} • {d.due_date} • {d.academic_year || 'Academic year not set'}{d.priority ? ` • ${d.priority} priority` : ''}</p>
              {d.description && <p className="small muted">{d.description}</p>}
              {hasDeadlineTargets(d) && <p className="small muted"><b>Students:</b> {listValue(d.target_student_names).join(', ') || listValue(d.target_student_emails).join(', ') || 'Selected students'}</p>}
              <Pill tone={d.status === 'Active' ? 'green' : d.status === 'Completed' ? 'blue' : 'slate'}>{d.status || 'Active'}</Pill>
            </div>
            <button className="danger compact-button" type="button" onClick={() => removeDeadline(d.id)}>Remove</button>
          </div>
        )) : <EmptyState title="No deadlines" text="Add the first supervisor deadline using the form above." icon={CalendarDays} />}
      </div>
    </div>
  )
}

function ProjectProgressSection({ projects = [], reports = [], students = [] }) {
  const [selectedStudent, setSelectedStudent] = useState('all')

  useEffect(() => {
    if (selectedStudent !== 'all' && !students.some((student) => student.key === selectedStudent)) setSelectedStudent('all')
  }, [students, selectedStudent])

  const selectedStudentOption = selectedStudent === 'all' ? null : students.find((student) => student.key === selectedStudent)
  const filteredProjects = selectedStudentOption
    ? projects.filter((project) => projectMatchesStudentOption(project, selectedStudentOption, reports))
    : projects.filter((project) => students.some((student) => projectMatchesStudentOption(project, student, reports)))

  return (
    <div className="card supervisor-project-progress-section">
      <SectionHeader icon={CheckCircle2} title="Project Progress" subtitle="Choose which assigned student’s project progress to view" />
      <div className="progress-filter-panel">
        <label className="field">
          <span>Student</span>
          <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
            <option value="all">All Assigned Students</option>
            {students.map((student) => (
              <option key={student.key} value={student.key}>{student.name}{student.email ? ` — ${student.email}` : ''}{student.group ? ` (${student.group})` : ''}</option>
            ))}
          </select>
        </label>
      </div>
      {filteredProjects.length ? (
        <div className="project-progress-list">
          {filteredProjects.map((project) => {
            const student = students.find((item) => projectMatchesStudentOption(project, item, reports))
            const projectReports = reports.filter((report) => String(report.project_id) === String(project.id))
            const latestReportDate = projectReports.map((report) => report.submitted_at).filter(Boolean).sort().at(-1)
            const progress = getProjectProgress(project, reports)
            return (
              <div className="project-progress-wide-card" key={project.id}>
                <div className="split project-progress-header">
                  <div>
                    <p className="muted small bold">{student?.name || project.group_name || 'Student'}</p>
                    {student?.email && <p className="muted small">{student.email}</p>}
                    <h3>{project.title}</h3>
                    <p className="muted">Research group: {project.group_name || 'Not specified'}</p>
                    <p className="muted small">Last update: {latestReportDate ? new Date(latestReportDate).toLocaleString() : project.created_at ? new Date(project.created_at).toLocaleString() : 'No updates yet'}</p>
                  </div>
                  <div className="progress-status-column">
                    <Pill tone={project.status === 'Needs Attention' ? 'amber' : project.status === 'Rejected' ? 'red' : 'green'}>{project.status || project.approval || 'Pending'}</Pill>
                    <strong>{formatProgress(progress)}%</strong>
                  </div>
                </div>
                <div className="progress-row"><span>Progress</span><span>{formatProgress(progress)}%</span></div>
                <ProgressBar value={progress} />
              </div>
            )
          })}
        </div>
      ) : <EmptyState title={selectedStudentOption ? 'No project progress found for this student.' : 'No project progress found for your assigned students.'} text={selectedStudentOption ? 'Project progress will appear after this student has an assigned research project or accepted reports.' : 'Only progress records from students assigned to you will appear here.'} icon={CheckCircle2} />}
    </div>
  )
}

function CommitteeDashboard({ data = emptyData, projects = [], updateProject, saveEvaluation }) {
  const reports = Array.isArray(data?.reports) ? data.reports : []
  const evaluations = Array.isArray(data?.evaluations) ? data.evaluations : []
  const sourceProjects = Array.isArray(projects) ? projects : []
  const [reviewSearch, setReviewSearch] = useState('')
  const [reviewStatus, setReviewStatus] = useState('all')
  const [reviewDepartment, setReviewDepartment] = useState('all')
  const [reviewGroup, setReviewGroup] = useState('all')
  const [projectSearch, setProjectSearch] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [evalForm, setEvalForm] = useState({ title_novelty: '', research_contents: '', flow_writing_data: '', plagiarism_ai: '', university_guideline: '', comments: '' })
  const [evalMessage, setEvalMessage] = useState('')
  const [savingEvaluation, setSavingEvaluation] = useState(false)

  const reviewStatusOptions = ['all', ...Array.from(new Set(sourceProjects.flatMap((p) => [p.status, p.approval]).filter(Boolean)))]
  const reviewGroupOptions = ['all', ...Array.from(new Set(sourceProjects.map((p) => p.group_name).filter(Boolean))).sort((a, b) => a.localeCompare(b))]

  const reviewProjects = sourceProjects.filter((project) => {
    const q = reviewSearch.trim().toLowerCase()
    const matchesSearch = !q || [project.title, project.group_name, project.area, project.supervisor_name, project.student_email, project.created_by_email, getProjectStudents(project).join(' ')].some((value) => String(value || '').toLowerCase().includes(q))
    const matchesStatus = reviewStatus === 'all' || project.status === reviewStatus || project.approval === reviewStatus
    const matchesDepartment = reviewDepartment === 'all' || project.area === reviewDepartment
    const matchesGroup = reviewGroup === 'all' || project.group_name === reviewGroup
    return matchesSearch && matchesStatus && matchesDepartment && matchesGroup
  })

  const completedProjects = sourceProjects.filter((project) => Number(getProjectProgress(project, reports) || project.progress || 0) >= 100)
  const completedProjectOptions = completedProjects.filter((project) => {
    const q = projectSearch.trim().toLowerCase()
    return !q || [project.title, project.group_name, project.supervisor_name, project.student_email, project.created_by_email, getProjectStudents(project).join(' ')].some((value) => String(value || '').toLowerCase().includes(q))
  })

  useEffect(() => {
    if (selectedProjectId && !completedProjects.some((project) => String(project.id) === String(selectedProjectId))) {
      setSelectedProjectId('')
    }
  }, [completedProjects, selectedProjectId])

  const selectedProject = completedProjects.find((project) => String(project.id) === String(selectedProjectId))
  const existingEvaluation = selectedProject ? evaluations.find((evaluation) => String(evaluation.project_id) === String(selectedProject.id)) : null

  useEffect(() => {
    if (!selectedProject) {
      setEvalForm({ title_novelty: '', research_contents: '', flow_writing_data: '', plagiarism_ai: '', university_guideline: '', comments: '' })
      setEvalMessage('')
      return
    }
    if (existingEvaluation) {
      const normalizeSavedScore = (value) => {
        const numeric = Number(value || 0)
        if (!Number.isFinite(numeric) || numeric <= 0) return ''
        return String(Math.min(10, Math.max(1, numeric)))
      }
      setEvalForm({
        title_novelty: normalizeSavedScore(existingEvaluation.attendance_score),
        research_contents: normalizeSavedScore(existingEvaluation.progress_score),
        flow_writing_data: normalizeSavedScore(existingEvaluation.research_quality_score),
        plagiarism_ai: normalizeSavedScore(existingEvaluation.writing_score),
        university_guideline: normalizeSavedScore(existingEvaluation.presentation_score),
        comments: existingEvaluation.comments || '',
      })
      setEvalMessage(`Saved evaluation loaded. Current total: ${Number(existingEvaluation.total_score || 0) > 50 ? 'old /100 score' : `${existingEvaluation.total_score || 0}/50`}.`)
    } else {
      setEvalForm({ title_novelty: '', research_contents: '', flow_writing_data: '', plagiarism_ai: '', university_guideline: '', comments: '' })
      setEvalMessage('')
    }
  }, [selectedProjectId, existingEvaluation?.id])

  const rubricCriteria = [
    ['1', 'Title novelty', 'title_novelty'],
    ['2', 'Research contents: well-reviewed, summarized, and organized', 'research_contents'],
    ['3', 'Flow of writing and data presentation', 'flow_writing_data'],
    ['4', 'Plagiarism and AI', 'plagiarism_ai'],
    ['5', 'Follow the university guideline', 'university_guideline'],
  ]
  const rubricKeys = rubricCriteria.map(([, , key]) => key)
  const total = rubricKeys.reduce((sum, key) => sum + Number(evalForm[key] || 0), 0)
  const hasInvalidScore = rubricKeys.some((key) => {
    const value = Number(evalForm[key])
    return !Number.isFinite(value) || value < 1 || value > 10
  })

  function updateRubricScore(key, value) {
    setEvalMessage('')
    if (value === '') {
      setEvalForm((current) => ({ ...current, [key]: '' }))
      return
    }
    const numeric = Math.min(10, Math.max(1, Number(value)))
    setEvalForm((current) => ({ ...current, [key]: Number.isFinite(numeric) ? String(numeric) : '' }))
  }

  async function submitFinalEvaluation() {
    if (!selectedProject) {
      setEvalMessage('Please select a completed group project.')
      return
    }
    if (hasInvalidScore) {
      setEvalMessage('Each criterion must be scored from 1 to 10.')
      return
    }
    setSavingEvaluation(true)
    const result = await saveEvaluation({ ...evalForm, project_id: selectedProject.id })
    setSavingEvaluation(false)
    if (result?.ok) setEvalMessage('Final evaluation saved successfully.')
    else setEvalMessage('Could not save final evaluation. Please check the message above and try again.')
  }

  return (
    <div className="stack committee-dashboard-layout">
      <div className="card committee-review-card combined-filter-card">
        <SectionHeader icon={Search} title="Research Committee Review" subtitle="Search, filter, approve, reject, or request revision for project titles" />
        <div className="section-filter-bar committee-filter-bar">
          <label className="field"><span>Search</span><input value={reviewSearch} onChange={(e) => setReviewSearch(e.target.value)} placeholder="Search title, group, student, supervisor..." /></label>
          <label className="field"><span>Status</span><select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}><option value="all">All statuses</option>{reviewStatusOptions.filter((item) => item !== 'all').map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label className="field"><span>Department</span><select value={reviewDepartment} onChange={(e) => setReviewDepartment(e.target.value)}><option value="all">All departments</option>{DEPARTMENT_OPTIONS.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
          <label className="field"><span>Research group</span><select value={reviewGroup} onChange={(e) => setReviewGroup(e.target.value)}><option value="all">All groups</option>{reviewGroupOptions.filter((item) => item !== 'all').map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
        </div>
        {reviewProjects.length ? <ProjectDecisionTable projects={reviewProjects} updateProject={updateProject} /> : <EmptyState title="No matching projects" text="Try changing the filters or wait for students to submit research titles." icon={Search} />}
      </div>

      <div className="card final-evaluation-card">
        <SectionHeader icon={CheckCircle2} title="Final Evaluation Rubric" subtitle="Completed group projects only • Total: /50" />
        <div className="final-evaluation-selector">
          <label className="field"><span>Search completed projects</span><input value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} placeholder="Search by title, group, student, or supervisor" /></label>
          <label className="field"><span>Completed group project</span><select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}><option value="">Select a completed group project</option>{completedProjectOptions.map((project) => <option key={project.id} value={project.id}>{project.title} — {project.group_name || 'No group'} — {getProjectStudents(project).join(', ') || project.student_email || project.created_by_email || 'Student not linked'} — {project.supervisor_name || 'No supervisor'} — progress: 100%</option>)}</select></label>
        </div>

        {!completedProjects.length ? (
          <EmptyState title="No group projects have reached 100% progress yet." text="Final evaluation becomes available only when a group project reaches 100% progress." icon={CheckCircle2} />
        ) : selectedProject ? (
          <div className="final-evaluation-body">
            <div className="selected-project-summary soft-box">
              <div>
                <p className="eyebrow">Selected completed project</p>
                <h3>{selectedProject.title}</h3>
                <p className="muted">Group: {selectedProject.group_name || 'Not specified'}</p>
                <p className="muted small">Students: {getProjectStudents(selectedProject).join(', ') || selectedProject.student_email || selectedProject.created_by_email || 'Not linked'} • Supervisor: {selectedProject.supervisor_name || 'Not assigned'} • Progress: {formatProgress(getProjectProgress(selectedProject, reports) || selectedProject.progress)}%</p>
              </div>
              {existingEvaluation && <Pill tone="blue">Already evaluated</Pill>}
            </div>

            <div className="rubric-table-wrap">
              <table className="rubric-table final-rubric-table">
                <thead><tr><th>No.</th><th>Criteria</th><th>Score</th></tr></thead>
                <tbody>
                  {rubricCriteria.map(([number, label, key]) => (
                    <tr key={key}>
                      <td>{number}</td>
                      <td>{label}</td>
                      <td><input type="number" min="1" max="10" value={evalForm[key]} onChange={(e) => updateRubricScore(key, e.target.value)} aria-label={`${label} score`} /><span className="rubric-score-unit">/10</span></td>
                    </tr>
                  ))}
                  <tr className="rubric-total-row"><td>Total</td><td></td><td><strong>{total}/50</strong></td></tr>
                </tbody>
              </table>
            </div>

            {hasInvalidScore && <p className="form-error-text">Each criterion must be scored from 1 to 10.</p>}
            <label className="field"><span>Comments</span><textarea value={evalForm.comments} onChange={(e) => setEvalForm((current) => ({ ...current, comments: e.target.value }))} placeholder="Final evaluation comments" /></label>
            <div className="final-evaluation-actions">
              <div className="total-box final-total-box"><p>Total</p><h2>{total}/50</h2></div>
              <button className="primary" type="button" disabled={savingEvaluation || hasInvalidScore} onClick={submitFinalEvaluation}><CheckCircle2 size={16} /> {savingEvaluation ? 'Saving...' : existingEvaluation ? 'Update Final Evaluation' : 'Save Final Evaluation'}</button>
            </div>
            {evalMessage && <div className={`message ${evalMessage.includes('success') ? 'success-message' : ''}`}>{evalMessage}</div>}
          </div>
        ) : (
          <EmptyState title="Select a completed group project" text="Choose a 100% completed project from the dropdown to open the /50 final evaluation rubric." icon={CheckCircle2} />
        )}
      </div>
    </div>
  )
}


function AdminDashboard({ data = emptyData, projects = [], currentUser, loadError = '', updateProject, updateUserRole, updateUserStatus, assignStudentToSupervisor, exportCsv, deleteWeeklyReport, deleteUploadedFile, deleteUserAccount, deleteResearchGroup, deleteResearchProject }) {
  const usersLoading = !data || !Array.isArray(data.profiles)
  data = cleanData({
    ...emptyData,
    ...(data || {}),
    profiles: Array.isArray(data?.profiles) ? data.profiles : [],
    projects: Array.isArray(data?.projects) ? data.projects : [],
    reports: Array.isArray(data?.reports) ? data.reports : [],
    uploadedFiles: Array.isArray(data?.uploadedFiles) ? data.uploadedFiles : [],
    deadlines: Array.isArray(data?.deadlines) ? data.deadlines : [],
    notifications: Array.isArray(data?.notifications) ? data.notifications : [],
    evaluations: Array.isArray(data?.evaluations) ? data.evaluations : [],
    auditLogs: Array.isArray(data?.auditLogs) ? data.auditLogs : [],
    invitations: Array.isArray(data?.invitations) ? data.invitations : [],
  })
  projects = Array.isArray(projects) ? projects : []
  const supervisors = data.profiles.filter((u) => u.role === 'supervisor')
  const students = data.profiles.filter((u) => u.role === 'student')
  const [projectSupervisorId, setProjectSupervisorId] = useState(supervisors[0]?.id || '')
  const [userTab, setUserTab] = useState('pending')
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('all')
  const [userStatusFilter, setUserStatusFilter] = useState('all')
  const [userDepartmentFilter, setUserDepartmentFilter] = useState('all')
  const [adminActionLoading, setAdminActionLoading] = useState('')

  useEffect(() => {
    if (!projectSupervisorId && supervisors[0]?.id) setProjectSupervisorId(supervisors[0].id)
  }, [projectSupervisorId, supervisors])

  const pendingUsers = data.profiles.filter((u) => (u.status || 'Pending') === 'Pending')
  const activeUsers = data.profiles.filter((u) => (u.status || 'Pending') === 'Active')
  const rejectedUsers = data.profiles.filter((u) => (u.status || 'Pending') === 'Rejected')

  const baseUsersToShow = userTab === 'pending'
    ? pendingUsers
    : userTab === 'roles'
      ? activeUsers
      : rejectedUsers

  function getUserDepartment(user) {
    const direct = user.department || user.area || user.research_area
    if (direct) return direct
    const relatedProject = projects.find((project) =>
      String(project.student_id || project.created_by || '') === String(user.id) ||
      normalizeText(project.student_email || project.created_by_email) === normalizeText(user.email) ||
      normalizeText(project.group_name) === normalizeText(user.full_name) ||
      getProjectStudents(project).map(normalizeText).includes(normalizeText(user.full_name))
    )
    return relatedProject?.area || 'Not set'
  }

  function getAssignedSupervisor(user) {
    if (user.role !== 'student') return null
    if (user.assigned_supervisor_id || user.assigned_supervisor_email || user.assigned_supervisor_name) {
      const byId = supervisors.find((s) => String(s.id) === String(user.assigned_supervisor_id))
      const byEmail = supervisors.find((s) => normalizeText(s.email) === normalizeText(user.assigned_supervisor_email))
      return byId || byEmail || { id: user.assigned_supervisor_id || '', full_name: user.assigned_supervisor_name || 'Assigned supervisor', email: user.assigned_supervisor_email || '' }
    }
    const relatedProject = projects.find((project) =>
      String(project.student_id || project.created_by || '') === String(user.id) ||
      normalizeText(project.student_email || project.created_by_email) === normalizeText(user.email) ||
      normalizeText(project.group_name) === normalizeText(user.full_name) ||
      getProjectStudents(project).map(normalizeText).includes(normalizeText(user.full_name))
    )
    if (!relatedProject) return null
    return supervisors.find((s) => String(s.id) === String(relatedProject.supervisor_id)) ||
      supervisors.find((s) => normalizeText(s.email) === normalizeText(relatedProject.supervisor_email)) ||
      supervisors.find((s) => normalizeText(s.full_name) === normalizeText(relatedProject.supervisor_name)) ||
      (relatedProject.supervisor_name && relatedProject.supervisor_name !== 'Pending Assignment' ? { id: relatedProject.supervisor_id || '', full_name: relatedProject.supervisor_name, email: relatedProject.supervisor_email || '' } : null)
  }

  function getSupervisorStudentCount(supervisor) {
    const assigned = getAssignedSupervisorStudents(data, projects.filter((project) => isAssignedSupervisorProject(project, supervisor)), data.reports)
    return assigned.length
  }

  const departmentOptions = Array.from(new Set([...DEPARTMENT_OPTIONS, ...data.profiles.map(getUserDepartment).filter((value) => value && value !== 'Not set')])).sort((a, b) => a.localeCompare(b))

  const usersToShow = baseUsersToShow.filter((user) => {
    const q = userSearch.trim().toLowerCase()
    const department = getUserDepartment(user)
    const assigned = getAssignedSupervisor(user)
    const matchesSearch = !q || [user.full_name, user.email, user.role, user.status, department, assigned?.full_name, assigned?.email].some((value) => String(value || '').toLowerCase().includes(q))
    const matchesRole = userRoleFilter === 'all' || user.role === userRoleFilter
    const matchesStatus = userStatusFilter === 'all' || (user.status || 'Pending') === userStatusFilter
    const matchesDepartment = userDepartmentFilter === 'all' || department === userDepartmentFilter
    return matchesSearch && matchesRole && matchesStatus && matchesDepartment
  })

  const tabTitle = userTab === 'pending'
    ? 'Pending User Approval'
    : userTab === 'roles'
      ? 'Role Management'
      : 'Rejected Users'

  const tabSubtitle = userTab === 'pending'
    ? 'Approve or reject newly registered users before they can access the platform.'
    : userTab === 'roles'
      ? 'Search, filter, change roles, update status, assign students to supervisors, and delete accounts.'
      : 'Review rejected accounts and restore them if needed.'

  const researchGroups = getProjectGroupSummaries(projects)
  const selectedProjectSupervisor = supervisors.find((supervisor) => String(supervisor.id) === String(projectSupervisorId))

  async function runAdminAction(key, action) {
    if (adminActionLoading) return
    setAdminActionLoading(key)
    try {
      await action()
    } finally {
      setAdminActionLoading('')
    }
  }

  function AdminPanelDeleteButton({ itemKey, label, onDelete }) {
    const loading = adminActionLoading === itemKey
    return (
      <button className="danger compact-button delete-item-button admin-panel-delete-button" type="button" disabled={Boolean(adminActionLoading)} onClick={() => runAdminAction(itemKey, onDelete)}>
        <Trash2 size={14} /> {loading ? 'Deleting...' : label}
      </button>
    )
  }

  function handleProjectSupervisorAssign(projectId) {
    const supervisor = selectedProjectSupervisor
    updateProject(projectId, {
      supervisor_name: supervisor?.full_name || 'Pending Assignment',
      supervisor_id: supervisor?.id || null,
      supervisor_email: supervisor?.email || '',
    })
  }

  return (
    <div className="admin-dashboard-grid full-admin-dashboard-grid">
      <div className="card admin-user-management-card admin-users-and-roles-card">
        <SectionHeader icon={Users} title="Users and Roles" subtitle="Approve users, manage roles, assign students, and delete accounts" />

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

        <div className="admin-user-filter-bar">
          <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search name, email, role, department, status..." />
          <select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)}>
            <option value="all">All roles</option>
            {roleButtons.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
          </select>
          <select value={userStatusFilter} onChange={(e) => setUserStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Active">Active</option>
            <option value="Rejected">Rejected</option>
          </select>
          <select value={userDepartmentFilter} onChange={(e) => setUserDepartmentFilter(e.target.value)}>
            <option value="all">All departments</option>
            {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
        </div>

        <div className="soft-box admin-tab-note">
          <b>{tabTitle}</b>
          <p>{tabSubtitle}</p>
        </div>

        <div className="admin-user-approval-scroll-container admin-users-and-roles-scroll">
          {loadError ? <EmptyState title="Failed to load users. Please try again." text={loadError} icon={Users} /> : usersLoading ? <EmptyState title="Loading users..." text="Please wait while the user list loads." icon={Users} /> : usersToShow.length ? usersToShow.map((u) => {
            const isCurrentAdmin = u.id === currentUser.id
            const statusTone = u.status === 'Active' ? 'green' : u.status === 'Rejected' ? 'red' : 'amber'
            const requestedRoleLabel = roleButtons.find((role) => role.id === u.role)?.label || u.role || 'Student'
            const submittedAt = String(u.created_at || u.submitted_at || u.registered_at || '').slice(0, 16).replace('T', ' ') || 'Date unavailable'
            const department = getUserDepartment(u)
            const assignedSupervisor = getAssignedSupervisor(u)
            const supervisorStudentCount = u.role === 'supervisor' ? getSupervisorStudentCount(u) : 0
            const assignmentLoading = adminActionLoading === `assign-${u.id}`
            return (
              <div className="mini-card user-role-row admin-pending-user-request admin-user-role-management-row" key={u.id}>
                <div className="admin-pending-user-info">
                  <b>{u.full_name || 'Unnamed user'}</b>
                  <p>{u.email || 'No email available'}</p>
                  <p className="small muted">Role: <b>{requestedRoleLabel}</b> • Status: <b>{u.status || 'Pending'}</b></p>
                  <p className="small muted">Department: <b>{department}</b></p>
                  <p className="small muted">Submitted: <b>{submittedAt}</b></p>
                  {u.role === 'student' && <p className="small muted">Assigned supervisor: <b>{assignedSupervisor?.full_name || 'Not assigned'}</b>{assignedSupervisor?.email ? ` • ${assignedSupervisor.email}` : ''}</p>}
                  {u.role === 'supervisor' && <p className="small muted">Assigned students/projects: <b>{supervisorStudentCount}</b></p>}
                  {isCurrentAdmin && <p className="small muted">Current admin account</p>}
                </div>
                <div className="role-management admin-pending-user-actions admin-role-actions-expanded">
                  <Pill tone={u.role === 'admin' ? 'blue' : u.role === 'supervisor' ? 'green' : u.role === 'committee' ? 'amber' : 'slate'}>{requestedRoleLabel}</Pill>
                  <Pill tone={statusTone}>{u.status || 'Pending'}</Pill>

                  {(userTab === 'roles' || userTab === 'pending') && (
                    <select value={u.role} disabled={isCurrentAdmin || Boolean(adminActionLoading)} onChange={(e) => runAdminAction(`role-${u.id}`, () => updateUserRole(u.id, e.target.value))}>
                      {roleButtons.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
                    </select>
                  )}

                  {(userTab === 'roles' || userTab === 'pending' || userTab === 'rejected') && (
                    <select value={u.status || 'Pending'} disabled={isCurrentAdmin || Boolean(adminActionLoading)} onChange={(e) => runAdminAction(`status-${u.id}`, () => updateUserStatus(u.id, e.target.value))}>
                      <option value="Pending">Pending</option>
                      <option value="Active">Active / Approved</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  )}

                  {u.role === 'student' && (
                    <label className="admin-inline-assignment-field">
                      <span>Supervisor</span>
                      <select value={assignedSupervisor?.id || ''} disabled={Boolean(adminActionLoading)} onChange={(e) => runAdminAction(`assign-${u.id}`, () => assignStudentToSupervisor?.(u.id, e.target.value))}>
                        <option value="">Not assigned</option>
                        {supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.full_name || supervisor.email}</option>)}
                      </select>
                      {assignmentLoading && <small className="muted">Updating...</small>}
                    </label>
                  )}

                  {userTab === 'pending' && !isCurrentAdmin && <button className="success compact-button" disabled={Boolean(adminActionLoading)} onClick={() => runAdminAction(`accept-${u.id}`, () => updateUserStatus(u.id, 'Active'))}>Accept</button>}
                  {userTab === 'pending' && !isCurrentAdmin && <button className="danger compact-button" disabled={Boolean(adminActionLoading)} onClick={() => runAdminAction(`reject-${u.id}`, () => updateUserStatus(u.id, 'Rejected'))}>Reject</button>}
                  {userTab === 'rejected' && !isCurrentAdmin && <button className="warning compact-button" disabled={Boolean(adminActionLoading)} onClick={() => runAdminAction(`pending-${u.id}`, () => updateUserStatus(u.id, 'Pending'))}>Move to Pending</button>}
                  {userTab === 'rejected' && !isCurrentAdmin && <button className="success compact-button" disabled={Boolean(adminActionLoading)} onClick={() => runAdminAction(`accept-${u.id}`, () => updateUserStatus(u.id, 'Active'))}>Accept</button>}
                  {canDeleteUserAccount(u, currentUser) && deleteUserAccount && (
                    <AdminPanelDeleteButton itemKey={`user-${u.id}`} label="Delete Account" onDelete={() => deleteUserAccount(u.id)} />
                  )}
                </div>
              </div>
            )
          }) : <EmptyState title="No users found." text="Try changing the search/filter settings or wait for users to register." icon={Users} />}
        </div>
      </div>

      <div className="card admin-assignment-card">
        <SectionHeader icon={UserCog} title="Project Supervisor Assignment" subtitle="Assign or update supervisors for submitted research titles" />
        <label className="field">
          <span>Choose supervisor</span>
          <select value={projectSupervisorId} onChange={(e) => setProjectSupervisorId(e.target.value)}>
            <option value="">Pending Assignment / remove supervisor</option>
            {supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.full_name || supervisor.email}</option>)}
          </select>
        </label>
        <div className="managed-list compact-managed-list admin-project-assignment-list">
          {projects.length ? projects.map((p) => (
            <div className="mini-card managed-item" key={p.id}>
              <div>
                <b>{p.group_name}</b>
                <p>{p.title}</p>
                <p className="small muted">Student: {p.student_email || p.created_by_email || getProjectStudents(p).join(', ') || 'Not linked'}</p>
                <p className="small muted">Supervisor: {p.supervisor_name || 'Pending Assignment'}</p>
              </div>
              <div className="stacked-actions">
                <button className="secondary compact-button" disabled={Boolean(adminActionLoading)} onClick={() => runAdminAction(`project-assign-${p.id}`, () => handleProjectSupervisorAssign(p.id))}>Update Supervisor</button>
                <button className="warning compact-button" disabled={Boolean(adminActionLoading)} onClick={() => runAdminAction(`project-unassign-${p.id}`, () => updateProject(p.id, { supervisor_name: 'Pending Assignment', supervisor_id: null, supervisor_email: '' }))}>Remove Assignment</button>
              </div>
            </div>
          )) : <EmptyState title="No projects to assign" text="Project assignments appear after students submit titles." icon={BookOpen} />}
        </div>
        <button className="primary" onClick={exportCsv}><Download size={16} /> Export CSV Report</button>
      </div>

      <div className="admin-management-alignment-grid">
        <div className="card admin-delete-management-card admin-research-title-card">
          <SectionHeader icon={BookOpen} title="Research Title Deletion" subtitle="Admins can delete research titles/projects and related report data" />
          <div className="managed-list compact-managed-list">
            {projects.length ? projects.map((project) => {
              const reportCount = data.reports.filter((report) => String(report.project_id) === String(project.id)).length
              return (
                <div className="mini-card managed-item" key={project.id}>
                  <div>
                    <b>{project.title || 'Untitled research title'}</b>
                    <p className="small muted">Group: {project.group_name || 'N/A'} • Area: {project.area || 'N/A'}</p>
                    <p className="small muted">Supervisor: {project.supervisor_name || 'Pending Assignment'} • Reports: {reportCount}</p>
                  </div>
                  {canDeleteResearchProject(project, currentUser) && deleteResearchProject && (
                    <AdminPanelDeleteButton itemKey={`project-${project.id}`} label="Delete Title" onDelete={() => deleteResearchProject(project.id)} />
                  )}
                </div>
              )
            }) : <EmptyState title="No research titles" text="Research titles will appear after students submit them." icon={BookOpen} />}
          </div>
        </div>

        <div className="card admin-delete-management-card admin-project-progress-card">
          <SectionHeader icon={CheckCircle2} title="Project Progress Management" subtitle="Admin view of all research progress records" />
          <div className="managed-list compact-managed-list">
            {projects.length ? projects.map((project) => (
              <div className="mini-card managed-item admin-progress-management-item" key={`progress-${project.id}`}>
                <div>
                  <b>{project.title || 'Untitled research title'}</b>
                  <p className="small muted">Student: {project.student_email || project.created_by_email || getProjectStudents(project).join(', ') || 'Not linked'} • Group: {project.group_name || 'N/A'}</p>
                  <p className="small muted">Status: {project.status || 'Pending'} • Last update: {String(project.updated_at || project.created_at || '').slice(0, 10) || 'N/A'}</p>
                </div>
                <div className="admin-progress-inline">
                  <span>{formatProgress(project.progress)}%</span>
                  <ProgressBar value={project.progress} />
                </div>
              </div>
            )) : <EmptyState title="No project progress" text="Project progress will appear after research titles are submitted." icon={CheckCircle2} />}
          </div>
        </div>

        <div className="card admin-delete-management-card admin-report-deletion-card">
          <SectionHeader icon={Trash2} title="Report Deletion" subtitle="Admins can delete any weekly report" />
          <div className="managed-list">
            {data.reports.length ? data.reports.map((report) => {
              const project = data.projects.find((p) => String(p.id) === String(report.project_id))
              return (
                <div className="mini-card managed-item" key={report.id}>
                  <div>
                    <b>Week {report.week_number} — {project?.title || 'Weekly Report'}</b>
                    <p className="small muted">Submitted by: {report.submitted_by || 'Unknown'} • {String(report.submitted_at || '').slice(0, 10)}</p>
                    <p className="small muted">Status: {report.status}</p>
                  </div>
                  {canDeleteReport(report, currentUser) && deleteWeeklyReport && <AdminPanelDeleteButton itemKey={`report-${report.id}`} label="Delete Report" onDelete={() => deleteWeeklyReport(report.id)} />}
                </div>
              )
            }) : <EmptyState title="No weekly reports" text="Submitted weekly reports will appear here." icon={MessageSquareText} />}
          </div>
        </div>

        <div className="card admin-delete-management-card admin-uploaded-document-card">
          <SectionHeader icon={FileText} title="Uploaded Document Deletion" subtitle="Admins can delete any uploaded file" />
          <div className="managed-list">
            {data.uploadedFiles.length ? data.uploadedFiles.map((file) => {
              const report = data.reports.find((item) => String(item.id) === String(file.report_id))
              return (
                <div className="mini-card managed-item" key={file.id}>
                  <div>
                    <b>{file.file_name || 'Uploaded document'}</b>
                    <p className="small muted">{file.file_type || 'Document'} • Week {report?.week_number || 'N/A'} • {String(file.created_at || '').slice(0, 10)}</p>
                    <ReportAttachmentBox attachment={file} canDelete={canDeleteUploadedFile(file, currentUser, data.reports)} onDelete={() => deleteUploadedFile(file.id)} />
                  </div>
                </div>
              )
            }) : <EmptyState title="No uploaded documents" text="Uploaded documents will appear here." icon={FileText} />}
          </div>
        </div>
      </div>

      <div className="card admin-delete-management-card admin-research-group-card">
        <SectionHeader icon={Users} title="Research Group Deletion" subtitle="Admins can delete research groups and their linked projects/reports safely" />
        <div className="managed-list compact-managed-list">
          {researchGroups.length ? researchGroups.map((group) => (
            <div className="mini-card managed-item" key={group.group_name}>
              <div>
                <b>{group.group_name}</b>
                <p className="small muted">{group.count} research title{group.count === 1 ? '' : 's'} linked to this group</p>
              </div>
              {canDeleteResearchGroup(group.group_name, currentUser) && deleteResearchGroup && (
                <AdminPanelDeleteButton itemKey={`group-${group.group_name}`} label="Delete Group" onDelete={() => deleteResearchGroup(group.group_name)} />
              )}
            </div>
          )) : <EmptyState title="No research groups" text="Research groups will appear after research titles are submitted." icon={Users} />}
        </div>
      </div>
    </div>
  )
}

function ProjectDecisionTable({ projects, updateProject }) {
  return (
    <div className="table-wrap"><table><thead><tr><th>Project</th><th>Area</th><th>Progress</th><th>Decision</th></tr></thead><tbody>{projects.map((p) => <tr key={p.id}><td><b>{p.group_name}</b><p>{p.title}</p></td><td>{p.area}</td><td><ProgressBar value={p.progress} /><p className="small muted">{formatProgress(p.progress)}%</p></td><td><button className="success" onClick={() => updateProject(p.id, { approval: 'Approved', status: 'Ongoing' })}>Approve</button><button className="warning" onClick={() => updateProject(p.id, { approval: 'Revision Required', status: 'Needs Attention' })}>Revise</button><button className="danger" onClick={() => updateProject(p.id, { approval: 'Rejected', status: 'Rejected' })}>Reject</button><br /><Pill tone={p.approval === 'Approved' ? 'green' : p.approval === 'Rejected' ? 'red' : 'amber'}>{p.approval}</Pill></td></tr>)}</tbody></table></div>
  )
}

function NotificationsTab({ data, role, currentUser, createNotification, markNotificationRead, removeNotification }) {
  const [form, setForm] = useState({ title: '', message: '', type: 'Reminder', target_role: 'all' })
  const [removingNotificationId, setRemovingNotificationId] = useState('')
  const visibleNotifications = data.notifications.filter((n) => notificationForUser(n, currentUser, role))

  async function handleRemoveNotification(notificationId) {
    if (removingNotificationId) return
    if (!window.confirm('Are you sure you want to remove this notification?')) return
    setRemovingNotificationId(notificationId)
    try {
      await removeNotification(notificationId)
    } finally {
      setRemovingNotificationId('')
    }
  }

  return (
    <div className="grid two-one">
      <div className="card">
        <SectionHeader icon={Bell} title="Notifications and Reminders" subtitle="Deadline reminders and admin messages" />
        <div className="notification-list">
          {data.deadlines.map((d) => <div className="mini-card reminder" key={d.id}><div className="split"><div><b>{d.title}</b><p>{d.deadline_type} deadline on {d.due_date}</p></div><Pill tone="blue">Deadline</Pill></div></div>)}
          {visibleNotifications.length ? visibleNotifications.map((n) => {
            const removing = String(removingNotificationId) === String(n.id)
            return (
              <div className={`mini-card notification-item ${n.is_read ? '' : 'unread'}`} key={n.id}>
                <div className="split notification-item-layout">
                  <div>
                    <b>{n.title}</b>
                    <p>{n.message}</p>
                    <p className="small muted">{n.type} • {String(n.created_at).slice(0, 16).replace('T', ' ')}</p>
                  </div>
                  <div className="notification-actions">
                    <button type="button" onClick={() => markNotificationRead(n.id)} disabled={removing}>{n.is_read ? 'Read' : 'Mark read'}</button>
                    <button type="button" className="danger compact-button" onClick={() => handleRemoveNotification(n.id)} disabled={removing}>
                      <Trash2 size={14} /> {removing ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </div>
              </div>
            )
          }) : <EmptyState title="No custom notifications" text="Admin-created notifications will appear here." icon={Bell} />}
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

function ReportTable({ children }) {
  return <div className="table-wrap"><table>{children}</table></div>
}

function reportSectionVisible(settings, key) {
  return normalizePdfReportSettings(settings).sections[key] !== false
}

function getReportStudentLabel(report, data) {
  const student = findStudentProfileForReport(data, report)
  return student?.full_name || report.submitted_by || report.student_name || report.created_by_email || 'Student'
}

function getReportProject(data, report) {
  return (data.projects || []).find((project) => String(project.id) === String(report.project_id)) || null
}

function PdfReportSection({ settings, sectionKey, title, children, exists = true }) {
  if (!exists || !reportSectionVisible(settings, sectionKey)) return null
  return <section className={`report-section report-section-${sectionKey}`}><h3>{title}</h3>{children}</section>
}


function NoRecords({ text = 'No records available.' }) {
  return <p className="no-records-message">{text}</p>
}

function makeSupervisorOptionKey(supervisor = {}) {
  if (supervisor.id) return `id:${supervisor.id}`
  if (supervisor.email) return `email:${normalizeText(supervisor.email)}`
  return `name:${normalizeText(supervisor.name || supervisor.full_name || 'unknown-supervisor')}`
}

function upsertSupervisorOption(map, supervisor = {}, fallback = {}) {
  const name = supervisor.name || supervisor.full_name || fallback.name || 'Supervisor'
  const email = supervisor.email || fallback.email || ''
  const id = supervisor.id || fallback.id || null
  const key = makeSupervisorOptionKey({ id, email, name })
  if (!map.has(key)) {
    map.set(key, { key, id, email, name })
    return
  }
  const existing = map.get(key)
  map.set(key, {
    ...existing,
    id: existing.id || id,
    email: existing.email || email,
    name: existing.name || name,
  })
}

function getReportSupervisorOptions(data = {}, projects = []) {
  const supervisors = new Map()
  ;(data.profiles || [])
    .filter((profile) => profile.role === 'supervisor')
    .forEach((profile) => upsertSupervisorOption(supervisors, profile))
  ;(projects || []).forEach((project) => {
    const supervisor = findSupervisorProfileForProject(data, project)
    if (supervisor?.id || supervisor?.email || supervisor?.full_name) {
      upsertSupervisorOption(supervisors, supervisor, {
        id: project.supervisor_id || project.supervisor_user_id || null,
        email: project.supervisor_email || '',
        name: project.supervisor_name || project.supervisor || project.assigned_supervisor || 'Supervisor',
      })
    }
  })
  return Array.from(supervisors.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function projectMatchesSupervisorOption(project = {}, supervisor = {}) {
  if (!project || !supervisor) return false
  const supervisorId = normalizeText(project.supervisor_id || project.supervisor_user_id)
  const supervisorEmail = normalizeText(project.supervisor_email)
  const supervisorName = normalizeText(project.supervisor_name || project.supervisor || project.assigned_supervisor)
  return (
    (!!supervisor.id && supervisorId === normalizeText(supervisor.id)) ||
    (!!supervisor.email && supervisorEmail === normalizeText(supervisor.email)) ||
    (!!supervisor.name && supervisorName === normalizeText(supervisor.name))
  )
}

function getReportStudentOptions(data = {}, projects = [], reports = []) {
  const students = new Map()
  // Only derive report dropdown students from the currently allowed/assigned projects and reports.
  // This prevents admin/committee supervisor-filtered dropdowns and supervisor dropdowns from leaking unrelated students.
  getAssignedSupervisorStudents(data, projects, reports).forEach((student) => upsertStudentOption(students, student, student))
  return Array.from(students.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function optionMatchesSearch(option = {}, search = '') {
  const q = normalizeText(search)
  if (!q) return true
  return [option.name, option.email, option.group, option.title, option.supervisorName].some((value) => normalizeText(value).includes(q))
}

function getStudentResearchLabel(student = {}, projects = [], reports = []) {
  const project = (projects || []).find((item) => projectMatchesStudentOption(item, student, reports))
  return project?.title || project?.group_name || student.group || 'No research project linked'
}

function getStudentSupervisorLabel(data = {}, student = {}, projects = [], reports = []) {
  const project = (projects || []).find((item) => projectMatchesStudentOption(item, student, reports))
  const supervisor = findSupervisorProfileForProject(data, project)
  return supervisor?.full_name || project?.supervisor_name || 'Not assigned'
}

function getProgressStatusLabel(project = {}, reports = []) {
  const progress = Number(getProjectProgress(project, reports) ?? project.progress ?? 0)
  if (progress >= 100 || normalizeText(project.status).includes('complete')) return 'Completed'
  if (progress >= 60) return 'In Progress'
  if (progress > 0) return 'Started'
  return 'Not Started'
}

function projectMatchesProgressFilter(project = {}, reports = [], filter = 'All') {
  if (!filter || filter === 'All') return true
  return getProgressStatusLabel(project, reports) === filter
}

function projectHasEvaluation(project = {}, evaluations = []) {
  return (evaluations || []).some((evaluation) => String(evaluation.project_id) === String(project.id))
}

function projectMatchesEvaluationFilter(project = {}, evaluations = [], filter = 'All') {
  if (!filter || filter === 'All') return true
  const hasEvaluation = projectHasEvaluation(project, evaluations)
  return filter === 'Evaluated' ? hasEvaluation : !hasEvaluation
}

function deadlineTargetsStudentOption(deadline = {}, student = {}) {
  return deadlineTargetsStudent(deadline, { id: student.id, email: student.email, full_name: student.name || student.full_name })
}

function studentOptionToProfile(student = {}) {
  return {
    id: student.id || null,
    full_name: student.name || student.full_name || 'Student',
    email: student.email || '',
    role: 'student',
    group: student.group || '',
  }
}

function buildStudentOptionGroups(data = {}, supervisorOptions = [], selectedSupervisorKey = 'all', projects = [], reports = [], search = '') {
  const groups = []
  const selectedSupervisor = supervisorOptions.find((item) => item.key === selectedSupervisorKey)
  const supervisorsToUse = selectedSupervisorKey === 'all'
    ? supervisorOptions
    : selectedSupervisor
      ? [selectedSupervisor]
      : []

  supervisorsToUse.forEach((supervisor) => {
    const supervisorProjects = (projects || []).filter((project) => projectMatchesSupervisorOption(project, supervisor))
    const options = getReportStudentOptions(data, supervisorProjects, reports)
      .map((student) => ({ ...student, title: getStudentResearchLabel(student, supervisorProjects, reports), supervisorName: supervisor.name }))
      .filter((student) => optionMatchesSearch(student, search))
    groups.push({ key: supervisor.key, label: supervisor.name || 'Supervisor', options })
  })

  if (selectedSupervisorKey === 'all' && !groups.length) {
    const allOptions = getReportStudentOptions(data, projects, reports)
      .map((student) => ({ ...student, title: getStudentResearchLabel(student, projects, reports), supervisorName: getStudentSupervisorLabel(data, student, projects, reports) }))
      .filter((student) => optionMatchesSearch(student, search))
    groups.push({ key: 'all', label: 'All Supervisors', options: allOptions })
  }

  return groups
}
function ReportsTab({ data, projects, currentUser, role, printPdfReport, exportCsv, pdfReportSettings = defaultPdfReportSettings }) {
  const settings = normalizePdfReportSettings(pdfReportSettings)
  const generatedAt = new Date()
  const generatedLabel = generatedAt.toLocaleString()
  const [selectedSupervisorKey, setSelectedSupervisorKey] = useState('all')
  const [selectedStudentKey, setSelectedStudentKey] = useState(role === 'student' ? makeStudentOptionKey({ id: currentUser?.id, email: currentUser?.email, name: currentUser?.full_name }) : 'all')
  const [supervisorSearch, setSupervisorSearch] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [reportFilters, setReportFilters] = useState({ group: 'All', title: '', progress: 'All', evaluation: 'All' })
  const [printMessage, setPrintMessage] = useState('')
  const isAdminLike = role === 'admin' || role === 'committee'
  const baseProjects = Array.isArray(projects) ? projects : []
  const allReports = Array.isArray(data.reports) ? data.reports : []
  const allDeadlines = Array.isArray(data.deadlines) ? data.deadlines : []
  const allEvaluations = Array.isArray(data.evaluations) ? data.evaluations : []
  const supervisorOptions = useMemo(() => getReportSupervisorOptions(data, baseProjects), [data, baseProjects])
  const filteredSupervisorOptions = useMemo(() => supervisorOptions.filter((supervisor) => optionMatchesSearch(supervisor, supervisorSearch)), [supervisorOptions, supervisorSearch])

  useEffect(() => {
    if (role === 'student') {
      setSelectedSupervisorKey('all')
      setSelectedStudentKey(makeStudentOptionKey({ id: currentUser?.id, email: currentUser?.email, name: currentUser?.full_name }))
      return
    }
    if (role === 'supervisor') {
      setSelectedSupervisorKey('all')
      return
    }
    if (!selectedSupervisorKey) setSelectedStudentKey('all')
  }, [role, currentUser?.id, currentUser?.email, currentUser?.full_name, selectedSupervisorKey])

  const supervisorFilteredProjects = useMemo(() => {
    if (!isAdminLike) return baseProjects
    if (!selectedSupervisorKey) return []
    if (selectedSupervisorKey === 'all') return baseProjects
    const selectedSupervisor = supervisorOptions.find((supervisor) => supervisor.key === selectedSupervisorKey)
    if (!selectedSupervisor) return []
    return baseProjects.filter((project) => projectMatchesSupervisorOption(project, selectedSupervisor))
  }, [isAdminLike, baseProjects, selectedSupervisorKey, supervisorOptions])

  const groupOptions = useMemo(() => {
    const groups = Array.from(new Set(supervisorFilteredProjects.map((project) => project.group_name).filter(Boolean)))
    return groups.sort((a, b) => a.localeCompare(b))
  }, [supervisorFilteredProjects])

  const projectFilteredProjects = useMemo(() => {
    const titleSearch = normalizeText(reportFilters.title)
    return supervisorFilteredProjects.filter((project) => {
      const matchesGroup = reportFilters.group === 'All' || project.group_name === reportFilters.group
      const matchesTitle = !titleSearch || [project.title, project.group_name, project.area].some((value) => normalizeText(value).includes(titleSearch))
      const matchesProgress = projectMatchesProgressFilter(project, allReports, reportFilters.progress)
      const matchesEvaluation = projectMatchesEvaluationFilter(project, allEvaluations, reportFilters.evaluation)
      return matchesGroup && matchesTitle && matchesProgress && matchesEvaluation
    })
  }, [supervisorFilteredProjects, reportFilters, allReports, allEvaluations])

  const supervisorStudentOptions = useMemo(() => {
    if (role !== 'supervisor') return []
    return getAssignedSupervisorStudents(data, projectFilteredProjects, allReports)
      .map((student) => ({ ...student, title: getStudentResearchLabel(student, projectFilteredProjects, allReports), supervisorName: currentUser?.full_name || 'Supervisor' }))
  }, [role, data, projectFilteredProjects, allReports, currentUser?.full_name])

  const adminStudentGroups = useMemo(() => {
    if (!isAdminLike) return []
    return buildStudentOptionGroups(data, supervisorOptions, selectedSupervisorKey, projectFilteredProjects, allReports, studentSearch)
  }, [isAdminLike, data, supervisorOptions, selectedSupervisorKey, projectFilteredProjects, allReports, studentSearch])

  const adminStudentOptions = useMemo(() => {
    const map = new Map()
    adminStudentGroups.forEach((group) => group.options.forEach((student) => upsertStudentOption(map, student, student)))
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [adminStudentGroups])

  const selectableStudentOptions = role === 'supervisor'
    ? supervisorStudentOptions.filter((student) => optionMatchesSearch(student, studentSearch))
    : isAdminLike
      ? adminStudentOptions
      : [studentOptionToProfile({ id: currentUser?.id, email: currentUser?.email, name: currentUser?.full_name })]

  const selectedStudent = role === 'student'
    ? { id: currentUser?.id, email: currentUser?.email, name: currentUser?.full_name || 'Student', group: currentUser?.department || '' }
    : selectableStudentOptions.find((student) => student.key === selectedStudentKey) || null

  const studentFilteredProjects = useMemo(() => {
    if (role === 'student') return projectFilteredProjects.filter((project) => isOwnStudentProject(project, currentUser))
    if (selectedStudentKey === 'all') return projectFilteredProjects
    if (!selectedStudent) return []
    return projectFilteredProjects.filter((project) => projectMatchesStudentOption(project, selectedStudent, allReports))
  }, [role, projectFilteredProjects, selectedStudentKey, selectedStudent, allReports, currentUser])

  const selectedProjectIds = useMemo(() => new Set(studentFilteredProjects.map((project) => String(project.id))), [studentFilteredProjects])

  const scopedReports = useMemo(() => {
    return allReports.filter((report) => {
      const projectAllowed = !report.project_id || selectedProjectIds.has(String(report.project_id))
      if (!projectAllowed) return false
      if (role === 'student') return reportOwnedByUser(report, currentUser)
      if (selectedStudentKey === 'all') return true
      return selectedStudent ? itemMatchesStudentOption(report, selectedStudent) : false
    })
  }, [allReports, selectedProjectIds, role, currentUser, selectedStudentKey, selectedStudent])

  const scopedDeadlines = useMemo(() => {
    return allDeadlines.filter((deadline) => {
      if (role === 'student') return deadlineVisibleToUser(deadline, 'student', currentUser)
      if (selectedStudentKey !== 'all' && selectedStudent) {
        return !hasDeadlineTargets(deadline) || deadlineTargetsStudentOption(deadline, selectedStudent)
      }
      if (role === 'supervisor') return deadlineVisibleToUser(deadline, 'supervisor', currentUser)
      return true
    })
  }, [allDeadlines, role, currentUser, selectedStudentKey, selectedStudent])

  const scopedEvaluations = useMemo(() => allEvaluations.filter((evaluation) => selectedProjectIds.has(String(evaluation.project_id))), [allEvaluations, selectedProjectIds])
  const scopedStudents = useMemo(() => {
    if (role === 'student') return [studentOptionToProfile({ id: currentUser?.id, email: currentUser?.email, name: currentUser?.full_name })]
    if (selectedStudentKey !== 'all' && selectedStudent) return [studentOptionToProfile(selectedStudent)]
    return selectableStudentOptions.map(studentOptionToProfile)
  }, [role, currentUser, selectedStudentKey, selectedStudent, selectableStudentOptions])
  const scopedSupervisors = useMemo(() => {
    if (role === 'supervisor') return [currentUser]
    if (!isAdminLike) return []
    if (selectedSupervisorKey === 'all') return supervisorOptions
    return supervisorOptions.filter((supervisor) => supervisor.key === selectedSupervisorKey)
  }, [role, currentUser, isAdminLike, selectedSupervisorKey, supervisorOptions])

  const hasProjects = studentFilteredProjects.length > 0
  const showGeneratedAt = settings.showGeneratedDateTime !== false && reportSectionVisible(settings, 'generatedDateTime')
  const footerText = String(settings.footerText || '').trim()
  const departmentLine = [settings.universityName, settings.collegeName, settings.departmentName].filter(Boolean).join(' • ')
  const feedbackReports = scopedReports.filter((report) => report.feedback || report.supervisor_feedback)
  const selectedSupervisor = supervisorOptions.find((supervisor) => supervisor.key === selectedSupervisorKey) || null
  const noAssignedStudentsForSupervisor = isAdminLike && selectedSupervisorKey && selectedSupervisorKey !== 'all' && selectableStudentOptions.length === 0
  const studentDropdownDisabled = isAdminLike && !selectedSupervisorKey
  const canGenerateReport = role === 'student' || role === 'admin' || role === 'committee' || (role === 'supervisor' && (selectedStudentKey === 'all' || Boolean(selectedStudent)))

  const updateFilter = (key, value) => setReportFilters((current) => ({ ...current, [key]: value }))

  const handleSupervisorChange = (value) => {
    setSelectedSupervisorKey(value)
    setSelectedStudentKey('all')
    setPrintMessage('')
  }

  const handlePrint = async () => {
    if (!canGenerateReport) {
      setPrintMessage('You do not have permission to generate this report.')
      return
    }

    if (isSupabaseConfigured) {
      const targetStudent = selectedStudentKey === 'all' ? null : selectedStudent
      const targetSupervisor = role === 'supervisor' ? currentUser : selectedSupervisor
      const { data: allowed, error } = await supabase.rpc('can_generate_pdf_report', {
        target_student_id: targetStudent?.id || null,
        target_student_email: targetStudent?.email || null,
        target_supervisor_id: targetSupervisor?.id || null,
        target_supervisor_email: targetSupervisor?.email || null,
      })
      if (error || allowed === false) {
        setPrintMessage('You do not have permission to generate this report.')
        return
      }
    }

    setPrintMessage('')
    printPdfReport()
  }

  return (
    <div className="stack">
      <div className="card no-print report-control-card">
        <SectionHeader icon={Printer} title="Print / Export PDF Reports" subtitle="Use the existing Print/PDF report button with role-based data permissions" />

        {role === 'student' ? (
          <div className="soft-box compact-report-note"><b>Student report:</b> your PDF report automatically uses only your own data.</div>
        ) : (
          <div className="report-filter-panel">
            {role === 'supervisor' ? (
              <div className="field-group report-selector-group">
                <label className="field"><span>Search assigned student</span><input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search by name, email, or title" /></label>
                <label className="field"><span>Select assigned student</span><select value={selectedStudentKey} onChange={(e) => { setSelectedStudentKey(e.target.value); setPrintMessage('') }}>
                  <option value="all">All Assigned Students</option>
                  {selectableStudentOptions.map((student) => <option key={student.key} value={student.key}>{student.name}{student.email ? ` • ${student.email}` : ''}{student.title ? ` • ${student.title}` : ''}</option>)}
                </select></label>
                {!supervisorStudentOptions.length && <p className="form-error-text">No students found.</p>}
              </div>
            ) : (
              <>
                <div className="field-group report-selector-group two-col">
                  <label className="field"><span>Search supervisor</span><input value={supervisorSearch} onChange={(e) => setSupervisorSearch(e.target.value)} placeholder="Search supervisor" /></label>
                  <label className="field"><span>Select supervisor</span><select value={selectedSupervisorKey} onChange={(e) => handleSupervisorChange(e.target.value)}>
                    <option value="">Select a supervisor first</option>
                    <option value="all">All Supervisors</option>
                    {filteredSupervisorOptions.map((supervisor) => <option key={supervisor.key} value={supervisor.key}>{supervisor.name}{supervisor.email ? ` • ${supervisor.email}` : ''}</option>)}
                  </select></label>
                </div>
                <div className="field-group report-selector-group">
                  <label className="field"><span>Search student</span><input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} disabled={studentDropdownDisabled} placeholder={studentDropdownDisabled ? 'Select a supervisor first' : 'Search by name, email, research group, or title'} /></label>
                  <label className="field"><span>Select student</span><select value={selectedStudentKey} onChange={(e) => { setSelectedStudentKey(e.target.value); setPrintMessage('') }} disabled={studentDropdownDisabled}>
                    <option value="all">All Students</option>
                    {adminStudentGroups.map((group) => group.options.length ? (
                      <optgroup key={group.key} label={group.label}>
                        {group.options.map((student) => <option key={`${group.key}-${student.key}`} value={student.key}>{student.name}{student.email ? ` • ${student.email}` : ''}{student.title ? ` • ${student.title}` : ''}</option>)}
                      </optgroup>
                    ) : null)}
                  </select></label>
                  {studentDropdownDisabled && <p className="muted small">Select a supervisor first.</p>}
                  {noAssignedStudentsForSupervisor && <p className="form-error-text">No assigned students found for this supervisor.</p>}
                  {!studentDropdownDisabled && !noAssignedStudentsForSupervisor && selectableStudentOptions.length === 0 && <p className="form-error-text">No students found.</p>}
                </div>
              </>
            )}

            <div className="field-group report-selector-group report-extra-filters">
              <label className="field"><span>Research group</span><select value={reportFilters.group} onChange={(e) => updateFilter('group', e.target.value)}><option>All</option>{groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
              <label className="field"><span>Research title/project</span><input value={reportFilters.title} onChange={(e) => updateFilter('title', e.target.value)} placeholder="Search title or project" /></label>
              <label className="field"><span>Progress status</span><select value={reportFilters.progress} onChange={(e) => updateFilter('progress', e.target.value)}><option>All</option><option>Not Started</option><option>Started</option><option>In Progress</option><option>Completed</option></select></label>
              <label className="field"><span>Final evaluation</span><select value={reportFilters.evaluation} onChange={(e) => updateFilter('evaluation', e.target.value)}><option>All</option><option>Evaluated</option><option>Not Evaluated</option></select></label>
            </div>
          </div>
        )}

        <div className="report-selection-summary">
          <span><b>Projects:</b> {studentFilteredProjects.length}</span>
          <span><b>Weekly reports:</b> {scopedReports.length}</span>
          <span><b>Feedback:</b> {feedbackReports.length}</span>
          <span><b>Final evaluations:</b> {scopedEvaluations.length}</span>
        </div>
        {printMessage && <div className="form-error-text">{printMessage}</div>}
        <div className="action-row report-actions"><button className="primary" onClick={handlePrint}><Printer size={16} /> Print / Save as PDF</button><button className="secondary" onClick={exportCsv}><Download size={16} /> Export CSV</button></div>
      </div>

      <div className="card print-report pdf-report-template">
        <div className="report-header pdf-report-header">
          {settings.logoUrl ? <img className="pdf-report-logo" src={settings.logoUrl} alt="Report logo" /> : null}
          <div>
            <h2>{settings.headerText || departmentLine || defaultPdfReportSettings.headerText}</h2>
            <h1>{settings.reportTitle || defaultPdfReportSettings.reportTitle}</h1>
            {departmentLine && <p>{departmentLine}</p>}
            {showGeneratedAt && <p>Generated by: {currentUser.full_name || currentUser.email} • Date/time: {generatedLabel}</p>}
          </div>
        </div>

        <PdfReportSection settings={settings} sectionKey="userInformation" title="User Information">
          <div className="report-grid">
            <p><b>Name:</b> {currentUser.full_name || 'User'}</p>
            <p><b>Email:</b> {currentUser.email || 'Not available'}</p>
            <p><b>Role:</b> {getRoleLabel(role)}</p>
            <p><b>Status:</b> {currentUser.status || 'Active'}</p>
          </div>
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="studentInformation" title="Student Information">
          {scopedStudents.length ? (
            <ReportTable><thead><tr><th>Student</th><th>Email</th><th>Supervisor</th><th>Research/project</th></tr></thead><tbody>{scopedStudents.map((student) => <tr key={student.id || student.email || student.full_name}><td>{student.full_name}</td><td>{student.email || '-'}</td><td>{getStudentSupervisorLabel(data, { id: student.id, email: student.email, name: student.full_name }, studentFilteredProjects, scopedReports)}</td><td>{getStudentResearchLabel({ id: student.id, email: student.email, name: student.full_name }, studentFilteredProjects, scopedReports)}</td></tr>)}</tbody></ReportTable>
          ) : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="supervisorInformation" title="Supervisor Information">
          {scopedSupervisors.length ? (
            <ReportTable><thead><tr><th>Supervisor</th><th>Email</th><th>Assigned students</th><th>Assigned projects</th></tr></thead><tbody>{scopedSupervisors.map((supervisor) => { const supervisorProjects = role === 'supervisor' ? studentFilteredProjects : studentFilteredProjects.filter((project) => projectMatchesSupervisorOption(project, supervisor)); const assignedStudents = getAssignedSupervisorStudents(data, supervisorProjects, scopedReports); return <tr key={supervisor.id || supervisor.email || supervisor.key}><td>{supervisor.full_name || supervisor.name}</td><td>{supervisor.email || '-'}</td><td>{assignedStudents.length}</td><td>{supervisorProjects.length}</td></tr> })}</tbody></ReportTable>
          ) : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="researchGroup" title="Research Group">
          {hasProjects ? <ReportTable><thead><tr><th>Group</th><th>Students</th><th>Supervisor</th><th>Status</th></tr></thead><tbody>{studentFilteredProjects.map((project) => <tr key={project.id}><td>{project.group_name || 'Research group'}</td><td>{getProjectStudents(project).join(', ') || project.student_email || '-'}</td><td>{project.supervisor_name || 'Pending Assignment'}</td><td>{project.approval || project.status || '-'}</td></tr>)}</tbody></ReportTable> : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="researchTitle" title="Research Title / Project">
          {hasProjects ? <ReportTable><thead><tr><th>Title</th><th>Department</th><th>Final due</th><th>Approval</th></tr></thead><tbody>{studentFilteredProjects.map((project) => <tr key={project.id}><td>{project.title}</td><td>{project.area || '-'}</td><td>{project.final_due || '-'}</td><td>{project.approval || '-'}</td></tr>)}</tbody></ReportTable> : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="weeklyReports" title="Weekly Reports">
          {scopedReports.length ? <ReportTable><thead><tr><th>Week</th><th>Project</th><th>Student</th><th>Status</th><th>Score</th><th>Submitted</th></tr></thead><tbody>{scopedReports.map((report) => { const project = getReportProject({ ...data, projects: studentFilteredProjects }, report); return <tr key={report.id}><td>{report.week_number || '-'}</td><td>{project?.title || 'Weekly Report'}</td><td>{getReportStudentLabel(report, data)}</td><td>{report.status || 'Submitted'}</td><td>{report.score ?? '-'}</td><td>{report.submitted_at ? new Date(report.submitted_at).toLocaleDateString() : '-'}</td></tr> })}</tbody></ReportTable> : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="feedback" title="Feedback">
          {feedbackReports.length ? <ReportTable><thead><tr><th>Week</th><th>Project</th><th>Student</th><th>Feedback</th></tr></thead><tbody>{feedbackReports.map((report) => { const project = getReportProject({ ...data, projects: studentFilteredProjects }, report); return <tr key={report.id}><td>{report.week_number || '-'}</td><td>{project?.title || 'Weekly Report'}</td><td>{getReportStudentLabel(report, data)}</td><td className="compact-feedback-cell">{report.feedback || report.supervisor_feedback}</td></tr> })}</tbody></ReportTable> : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="projectProgress" title="Project Progress">
          {hasProjects ? <ReportTable><thead><tr><th>Group</th><th>Title</th><th>Progress</th><th>Status</th></tr></thead><tbody>{studentFilteredProjects.map((project) => <tr key={project.id}><td>{project.group_name || '-'}</td><td>{project.title}</td><td>{formatProgress(getProjectProgress(project, scopedReports))}%</td><td>{getProgressStatusLabel(project, scopedReports)}</td></tr>)}</tbody></ReportTable> : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="deadlines" title="Deadlines">
          {scopedDeadlines.length ? <ReportTable><thead><tr><th>Deadline</th><th>Type</th><th>Due date</th><th>Status</th></tr></thead><tbody>{scopedDeadlines.map((deadline) => <tr key={deadline.id}><td>{deadline.title}</td><td>{deadline.deadline_type}</td><td>{deadline.due_date}</td><td>{deadline.status || 'Active'}</td></tr>)}</tbody></ReportTable> : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="finalEvaluationRubric" title="Final Evaluation Rubric / Result">
          {scopedEvaluations.length ? <ReportTable><thead><tr><th>Project</th><th>Evaluator</th><th>Title novelty</th><th>Research contents</th><th>Writing/data flow</th><th>Plagiarism/AI</th><th>Guideline</th><th>Total</th></tr></thead><tbody>{scopedEvaluations.map((evaluation) => { const project = studentFilteredProjects.find((item) => String(item.id) === String(evaluation.project_id)); const total = Number(evaluation.total_score ?? 0) || [evaluation.attendance_score, evaluation.progress_score, evaluation.research_quality_score, evaluation.writing_score, evaluation.presentation_score].reduce((sum, score) => sum + Number(score || 0), 0); return <tr key={evaluation.id}><td>{project?.title || 'Completed project'}</td><td>{evaluation.evaluator_name || '-'}</td><td>{evaluation.attendance_score ?? '-'}</td><td>{evaluation.progress_score ?? '-'}</td><td>{evaluation.research_quality_score ?? '-'}</td><td>{evaluation.writing_score ?? '-'}</td><td>{evaluation.presentation_score ?? '-'}</td><td>{total}/{evaluation.max_score || 50}</td></tr> })}</tbody></ReportTable> : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="signatures" title="Signatures">
          <div className="signature-grid"><div><span />Student Signature</div><div><span />Supervisor Signature</div><div><span />Research Committee / Admin Signature</div></div>
        </PdfReportSection>

        {(footerText || settings.showPageNumbers !== false) && <footer className="pdf-report-footer"><p>{footerText}</p>{settings.showPageNumbers !== false && <p className="pdf-page-number">Page <span className="page-number-placeholder" /></p>}</footer>}
      </div>
    </div>
  )
}

function PdfReportCustomizationPanel({ settings, updateSettings, uploadLogo, removeLogo, resetSettings, data, projects, currentUser, printPdfReport }) {
  const [draft, setDraft] = useState(() => normalizePdfReportSettings(settings))
  const [localMessage, setLocalMessage] = useState('')

  useEffect(() => {
    setDraft(normalizePdfReportSettings(settings))
  }, [settings])

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function updateSection(sectionKey, value) {
    setDraft((current) => ({ ...current, sections: { ...current.sections, [sectionKey]: value } }))
  }

  async function saveDraft() {
    if (!String(draft.reportTitle || '').trim()) {
      setLocalMessage('Please write a report header/title text before saving.')
      return
    }
    const result = await updateSettings(draft)
    setLocalMessage(result?.ok === false ? 'Global database save failed. Run supabase/pdf_report_customization_update.sql in Supabase SQL Editor, refresh, then save again.' : 'PDF report settings saved successfully.')
  }

  async function handleLogoUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const result = await uploadLogo(file)
    if (result?.logoUrl) {
      setDraft((current) => ({ ...current, logoUrl: result.logoUrl, logoPath: result.logoPath || '' }))
    }
  }

  async function handleRemoveLogo() {
    await removeLogo()
    setDraft((current) => ({ ...current, logoUrl: '', logoPath: '' }))
  }

  async function handleReset() {
    await resetSettings()
    setDraft(defaultPdfReportSettings)
    setLocalMessage('PDF report settings reset to the default design.')
  }

  return (
    <div className="admin-panel-stack pdf-customization-page">
      <div className="card">
        <SectionHeader icon={FileText} title="PDF Report Customization" subtitle="Customize the existing Print/PDF Report template used by student, supervisor, admin, and research committee reports" />
        <div className="form-grid">
          <label className="field wide-field"><span>Report header/title text</span><input value={draft.reportTitle || ''} onChange={(e) => updateDraft('reportTitle', e.target.value)} placeholder="Pharmacy Research Project Management Report" /></label>
          <label className="field"><span>Header line</span><input value={draft.headerText || ''} onChange={(e) => updateDraft('headerText', e.target.value)} placeholder="Hawler Medical University – College of Pharmacy" /></label>
          <label className="field"><span>University name</span><input value={draft.universityName || ''} onChange={(e) => updateDraft('universityName', e.target.value)} placeholder="Hawler Medical University" /></label>
          <label className="field"><span>College name</span><input value={draft.collegeName || ''} onChange={(e) => updateDraft('collegeName', e.target.value)} placeholder="College of Pharmacy" /></label>
          <label className="field"><span>Department name</span><input value={draft.departmentName || ''} onChange={(e) => updateDraft('departmentName', e.target.value)} placeholder="Department of Pharmacy" /></label>
          <label className="field wide-field"><span>Footer text</span><textarea value={draft.footerText || ''} onChange={(e) => updateDraft('footerText', e.target.value)} placeholder="Optional footer text shown at the bottom of printed/PDF reports" /></label>
        </div>
        <div className="settings-actions">
          <button className="primary" onClick={saveDraft}><Save size={16} /> Save PDF Report Settings</button>
          <button className="secondary" onClick={handleReset}><RefreshCw size={16} /> Reset Default PDF Design</button>
          <button className="secondary" onClick={printPdfReport}><Printer size={16} /> Preview by Print / Save as PDF</button>
        </div>
        {localMessage && <div className="message">{localMessage}</div>}
      </div>

      <div className="admin-split-layout">
        <div className="card">
          <SectionHeader icon={ImageIcon} title="Report Logo" subtitle="Upload, replace, or remove the logo used in the existing PDF report template" />
          <label className="field"><span>Logo URL</span><input value={draft.logoUrl || ''} onChange={(e) => updateDraft('logoUrl', e.target.value)} placeholder="Paste hosted logo URL or upload below" /></label>
          <label className="field"><span>Upload / replace logo</span><input type="file" accept="image/*" onChange={handleLogoUpload} /></label>
          {draft.logoUrl ? <div className="pdf-logo-preview"><img src={draft.logoUrl} alt="PDF report logo preview" /></div> : <div className="pdf-logo-preview empty"><span>No logo selected</span></div>}
          <div className="settings-actions">
            <button className="secondary" onClick={() => updateSettings({ ...draft, logoUrl: draft.logoUrl, logoPath: draft.logoPath || '' })}><Save size={16} /> Save Logo Setting</button>
            <button className="danger" onClick={handleRemoveLogo}><Trash2 size={16} /> Remove Logo</button>
          </div>
          <div className="soft-box settings-note"><p>Uploaded logos use the existing Supabase Storage bucket <code>app-assets</code>. If storage is not configured, the logo still previews locally.</p></div>
        </div>

        <div className="card">
          <SectionHeader icon={Eye} title="Template Preview" subtitle="The existing Print/PDF button uses these saved settings globally" />
          <div className="pdf-template-preview">
            {draft.logoUrl ? <img src={draft.logoUrl} alt="Logo preview" /> : <div className="preview-logo-placeholder">Logo</div>}
            <h4>{draft.headerText || defaultPdfReportSettings.headerText}</h4>
            <h3>{draft.reportTitle || defaultPdfReportSettings.reportTitle}</h3>
            <p>{[draft.universityName, draft.collegeName, draft.departmentName].filter(Boolean).join(' • ')}</p>
            <div className="preview-report-lines"><span /><span /><span /></div>
            {draft.footerText && <small>{draft.footerText}</small>}
          </div>
        </div>
      </div>

      <div className="card">
        <SectionHeader icon={SlidersHorizontal} title="Show / Hide Report Sections" subtitle="Control which sections appear in printed/PDF reports across all roles" />
        <div className="pdf-toggle-grid">
          {pdfReportSectionLabels.map(([key, label]) => (
            <label className="settings-toggle" key={key}>
              <input type="checkbox" checked={draft.sections[key] !== false} onChange={(e) => updateSection(key, e.target.checked)} />
              <span><b>{label}</b><small>{draft.sections[key] !== false ? 'Shown in reports when data exists.' : 'Hidden from reports.'}</small></span>
            </label>
          ))}
          <label className="settings-toggle">
            <input type="checkbox" checked={draft.showPageNumbers !== false} onChange={(e) => updateDraft('showPageNumbers', e.target.checked)} />
            <span><b>Page numbers</b><small>Show page number text in the report footer.</small></span>
          </label>
          <label className="settings-toggle">
            <input type="checkbox" checked={draft.showGeneratedDateTime !== false} onChange={(e) => updateDraft('showGeneratedDateTime', e.target.checked)} />
            <span><b>Generated date/time</b><small>Show generated date/time in the header.</small></span>
          </label>
        </div>
        <div className="soft-box settings-note"><p>Students, supervisors, and research committee users cannot edit these settings; they only use the saved template when pressing the existing Print/PDF button.</p></div>
      </div>
    </div>
  )
}

function DeadlinesCard({ deadlines }) {
  return <div className="card"><SectionHeader icon={CalendarDays} title="Deadlines" subtitle="Upcoming milestones" />{deadlines.map((d) => <div className="mini-card" key={d.id}><b>{d.title}</b><p>{d.deadline_type} • {d.due_date}</p></div>)}</div>
}

function ProjectCard({ project, reports = [] }) {
  const progress = getProjectProgress(project, reports)
  return (
    <div className="card project-card project-progress-card-full">
      <div className="project-progress-card-surface">
        <div className="split project-progress-header"><p className="muted small bold">{project.group_name}</p><Pill tone={project.status === 'Needs Attention' ? 'amber' : project.status === 'Rejected' ? 'red' : 'green'}>{project.status}</Pill></div>
        <h3>{project.area}</h3>
        <p>{project.title}</p>
        <div className="progress-row"><span>Progress</span><span>{formatProgress(progress)}%</span></div>
        <ProgressBar value={progress} />
      </div>
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

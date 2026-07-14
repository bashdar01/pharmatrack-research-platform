import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Inbox,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  Filter,
  Image as ImageIcon,
  Info,
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
  Palette,
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
import aboutUsHmuLogo from './assets/about-us-hmu-logo.svg'

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
const RESEARCH_GUIDELINES_PDF_URL = '/research-guidelines.pdf'
const RESEARCH_GUIDELINES_DOWNLOAD_NAME = 'Research-Guidelines.pdf'

function clampProgress(value) {
  const numeric = Number(value || 0)
  return Math.max(0, Math.min(100, Number(numeric.toFixed(2))))
}

function calculateProjectProgressFromReports(reports, projectOrId) {
  const project = typeof projectOrId === 'object' ? projectOrId : { id: projectOrId }
  const acceptedCount = getReportsForProject(reports || [], project).filter((report) => report.status === 'Accepted').length
  return clampProgress(acceptedCount * REPORT_PROGRESS_INCREMENT)
}

function formatProgress(value) {
  const numeric = clampProgress(value)
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2)
}


function getProjectIdentityValues(project = {}) {
  return [
    project.id,
    project.project_id,
    project.research_project_id,
    project.group_id,
    project.research_group_id,
    project.requested_group_id,
  ].map((value) => String(value || '')).filter(Boolean)
}

function reportLinkedToProject(report = {}, project = {}) {
  if (!report || !project) return false
  const projectIds = getProjectIdentityValues(project)
  const reportIds = [
    report.project_id,
    report.research_project_id,
    report.group_id,
    report.research_group_id,
    report.requested_group_id,
  ].map((value) => String(value || '')).filter(Boolean)
  if (projectIds.length && reportIds.some((id) => projectIds.includes(id))) return true

  const projectNames = [project.group_name, project.title, project.project_name, project.research_group_name]
    .map(normalizeText)
    .filter(Boolean)
  const reportNames = [report.group_name, report.project_name, report.research_group_name, report.project_title, report.title]
    .map(normalizeText)
    .filter(Boolean)
  return projectNames.length > 0 && reportNames.some((name) => projectNames.includes(name))
}

function getReportsForProject(dataOrReports = {}, project = {}) {
  const reports = Array.isArray(dataOrReports) ? dataOrReports : (dataOrReports.reports || [])
  if (!project) return []
  return (reports || []).filter((report) => reportLinkedToProject(report, project))
}

function getProjectProgress(project, reports = []) {
  if (!project) return 0
  return calculateProjectProgressFromReports(reports, project)
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

const QUESTION_ATTACHMENT_BUCKET = 'question-attachments'
const QUESTION_ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function getQuestionAttachment(question = {}, type = 'question') {
  const prefix = type === 'answer' ? 'answer_attachment' : 'question_attachment'
  const name = question[`${prefix}_name`] || ''
  const path = question[`${prefix}_path`] || ''
  const url = question[`${prefix}_url`] || question[`${prefix}_data_url`] || ''
  const mimeType = question[`${prefix}_mime_type`] || ''
  const size = question[`${prefix}_size`] || null
  if (!name && !path && !url) return null
  return { file_name: name || 'Attachment', file_path: path, file_url: url, file_mime_type: mimeType, file_size: size }
}

function formatFileSize(bytes) {
  const numeric = Number(bytes || 0)
  if (!numeric) return ''
  if (numeric < 1024) return `${numeric} B`
  if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1)} KB`
  return `${(numeric / (1024 * 1024)).toFixed(1)} MB`
}

function validateQuestionAttachmentFile(file) {
  if (!file) return ''
  const extension = String(file.name || '').split('.').pop()?.toLowerCase() || ''
  const allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif', 'webp']
  const mimeType = String(file.type || '').toLowerCase()
  const allowedMime = mimeType.startsWith('image/') || [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ].includes(mimeType)
  if (!allowedExtensions.includes(extension) && !allowedMime) return 'Only PDF, Word, image, and Excel attachments are allowed.'
  if (file.size > 10 * 1024 * 1024) return 'Attachment must be 10 MB or smaller.'
  return ''
}

async function makeLocalQuestionAttachment(file, questionId, type = 'question') {
  if (!file) return {}
  const validationError = validateQuestionAttachmentFile(file)
  if (validationError) throw new Error(validationError)
  const dataUrl = await readFileAsDataUrl(file)
  const prefix = type === 'answer' ? 'answer_attachment' : 'question_attachment'
  return {
    [`${prefix}_name`]: file.name,
    [`${prefix}_path`]: '',
    [`${prefix}_url`]: dataUrl,
    [`${prefix}_mime_type`]: file.type || 'application/octet-stream',
    [`${prefix}_size`]: file.size || null,
  }
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


const ROLE_HERO_DEFAULTS = {
  student: {
    imageUrl: '',
    imagePath: '',
    title: 'Welcome to Your Research Journey',
    subtitle: 'Track your project, weekly reports, deadlines, meetings, and supervisor feedback in one place.',
    overlayOpacity: 0.38,
    textColor: '#ffffff',
    alignment: 'left',
    enabled: true,
    buttonLabel: '',
    buttonRoute: '',
  },
  supervisor: {
    imageUrl: '',
    imagePath: '',
    title: 'Guide Research, Support Progress',
    subtitle: 'Manage research projects, students, deadlines, weekly reports, feedback, and meetings.',
    overlayOpacity: 0.38,
    textColor: '#ffffff',
    alignment: 'left',
    enabled: true,
    buttonLabel: '',
    buttonRoute: '',
  },
  committee: {
    imageUrl: '',
    imagePath: '',
    title: 'Review Research, Maintain Quality',
    subtitle: 'Evaluate submissions, manage project decisions, and monitor approved research projects.',
    overlayOpacity: 0.38,
    textColor: '#ffffff',
    alignment: 'left',
    enabled: true,
    buttonLabel: '',
    buttonRoute: '',
  },
  admin: {
    imageUrl: '',
    imagePath: '',
    title: 'Manage the Research Platform',
    subtitle: 'Control users, assignments, projects, reports, platform settings, and customization.',
    overlayOpacity: 0.38,
    textColor: '#ffffff',
    alignment: 'left',
    enabled: true,
    buttonLabel: '',
    buttonRoute: '',
  },
}

const roleHeroOptions = [
  { value: 'student', label: 'Student Dashboard' },
  { value: 'supervisor', label: 'Supervisor Dashboard' },
  { value: 'committee', label: 'Research Committee Dashboard' },
  { value: 'admin', label: 'Admin Dashboard' },
]

function cloneRoleHeroDefaults() {
  return Object.fromEntries(Object.entries(ROLE_HERO_DEFAULTS).map(([role, settings]) => [role, { ...settings }]))
}

function normalizeRoleHeroRole(role) {
  const normalized = String(role || 'student').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['research_committee', 'researchcommittee', 'committee'].includes(normalized)) return 'committee'
  if (['supervisor', 'advisor'].includes(normalized)) return 'supervisor'
  if (['admin', 'administrator'].includes(normalized)) return 'admin'
  return 'student'
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, numeric))
}

function safeHeroTextColor(value, fallback = '#ffffff') {
  const raw = String(value || '').trim()
  return /^#[0-9a-f]{3,8}$/i.test(raw) ? raw : fallback
}

function sanitizeRoleHeroRoute(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^(https?:|mailto:)/i.test(raw)) return raw
  if (/^\/?[a-z0-9/_-]+$/i.test(raw)) return raw
  return ''
}

function normalizeRoleHeroConfig(role, config = {}) {
  const key = normalizeRoleHeroRole(role)
  const defaults = ROLE_HERO_DEFAULTS[key] || ROLE_HERO_DEFAULTS.student
  const next = { ...defaults, ...(config || {}) }
  next.imageUrl = sanitizeSettingImageUrl(next.imageUrl || next.image_url || next.image || '')
  next.imagePath = String(next.imagePath || next.image_path || '')
  next.title = String(next.title || defaults.title).trim() || defaults.title
  next.subtitle = String(next.subtitle || defaults.subtitle).trim() || defaults.subtitle
  next.overlayOpacity = clampNumber(next.overlayOpacity ?? next.overlay ?? defaults.overlayOpacity, 0, 0.85, defaults.overlayOpacity)
  next.textColor = safeHeroTextColor(next.textColor, defaults.textColor)
  next.alignment = ['left', 'center', 'right'].includes(String(next.alignment || '').toLowerCase()) ? String(next.alignment).toLowerCase() : defaults.alignment
  next.enabled = next.enabled !== false
  next.buttonLabel = String(next.buttonLabel || next.ctaLabel || '').trim()
  next.buttonRoute = sanitizeRoleHeroRoute(next.buttonRoute || next.ctaRoute || '')
  return next
}

function normalizeRoleHeroSettings(roleHeroes = {}, settings = {}) {
  const source = roleHeroes && typeof roleHeroes === 'object' ? roleHeroes : {}
  const flattened = {
    student: {
      imageUrl: settings.student_hero_image || settings.studentHeroImage,
      title: settings.student_hero_title || settings.studentHeroTitle,
      subtitle: settings.student_hero_subtitle || settings.studentHeroSubtitle,
      overlayOpacity: settings.student_hero_overlay || settings.studentHeroOverlay,
      textColor: settings.student_hero_text_color || settings.studentHeroTextColor,
      alignment: settings.student_hero_alignment || settings.studentHeroAlignment,
      enabled: settings.student_hero_enabled ?? settings.studentHeroEnabled,
      buttonLabel: settings.student_hero_button_label || settings.studentHeroButtonLabel,
      buttonRoute: settings.student_hero_button_route || settings.studentHeroButtonRoute,
    },
    supervisor: {
      imageUrl: settings.supervisor_hero_image || settings.supervisorHeroImage,
      title: settings.supervisor_hero_title || settings.supervisorHeroTitle,
      subtitle: settings.supervisor_hero_subtitle || settings.supervisorHeroSubtitle,
      overlayOpacity: settings.supervisor_hero_overlay || settings.supervisorHeroOverlay,
      textColor: settings.supervisor_hero_text_color || settings.supervisorHeroTextColor,
      alignment: settings.supervisor_hero_alignment || settings.supervisorHeroAlignment,
      enabled: settings.supervisor_hero_enabled ?? settings.supervisorHeroEnabled,
      buttonLabel: settings.supervisor_hero_button_label || settings.supervisorHeroButtonLabel,
      buttonRoute: settings.supervisor_hero_button_route || settings.supervisorHeroButtonRoute,
    },
    committee: {
      imageUrl: settings.committee_hero_image || settings.committeeHeroImage || settings.research_committee_hero_image,
      title: settings.committee_hero_title || settings.committeeHeroTitle || settings.research_committee_hero_title,
      subtitle: settings.committee_hero_subtitle || settings.committeeHeroSubtitle || settings.research_committee_hero_subtitle,
      overlayOpacity: settings.committee_hero_overlay || settings.committeeHeroOverlay || settings.research_committee_hero_overlay,
      textColor: settings.committee_hero_text_color || settings.committeeHeroTextColor || settings.research_committee_hero_text_color,
      alignment: settings.committee_hero_alignment || settings.committeeHeroAlignment || settings.research_committee_hero_alignment,
      enabled: settings.committee_hero_enabled ?? settings.committeeHeroEnabled ?? settings.research_committee_hero_enabled,
      buttonLabel: settings.committee_hero_button_label || settings.committeeHeroButtonLabel || settings.research_committee_hero_button_label,
      buttonRoute: settings.committee_hero_button_route || settings.committeeHeroButtonRoute || settings.research_committee_hero_button_route,
    },
    admin: {
      imageUrl: settings.admin_hero_image || settings.adminHeroImage,
      title: settings.admin_hero_title || settings.adminHeroTitle,
      subtitle: settings.admin_hero_subtitle || settings.adminHeroSubtitle,
      overlayOpacity: settings.admin_hero_overlay || settings.adminHeroOverlay,
      textColor: settings.admin_hero_text_color || settings.adminHeroTextColor,
      alignment: settings.admin_hero_alignment || settings.adminHeroAlignment,
      enabled: settings.admin_hero_enabled ?? settings.adminHeroEnabled,
      buttonLabel: settings.admin_hero_button_label || settings.adminHeroButtonLabel,
      buttonRoute: settings.admin_hero_button_route || settings.adminHeroButtonRoute,
    },
  }
  return Object.fromEntries(roleHeroOptions.map(({ value }) => [value, normalizeRoleHeroConfig(value, { ...(flattened[value] || {}), ...(source[value] || {}) })]))
}

function getRoleHeroSettings(settings = defaultWebsiteSettings, role = 'student') {
  const normalized = normalizeRoleHeroSettings(settings?.roleHeroes, settings || {})
  return normalized[normalizeRoleHeroRole(role)] || normalized.student
}

function getRoleHeroLabel(role) {
  const normalized = normalizeRoleHeroRole(role)
  return roleHeroOptions.find((item) => item.value === normalized)?.label || 'Student Dashboard'
}

const DEFAULT_BUTTON_COLORS = {
  primary: {
    background: '#2563eb',
    text: '#ffffff',
    icon: '#ffffff',
    hoverBackground: '#1d4ed8',
    hoverText: '#ffffff',
    activeBackground: '#1e40af',
    activeText: '#ffffff',
    border: '#2563eb',
    focusRing: '#93c5fd',
  },
  secondary: {
    background: '#eff6ff',
    text: '#1d4ed8',
    icon: '#1d4ed8',
    hoverBackground: '#dbeafe',
    hoverText: '#1e40af',
    activeBackground: '#bfdbfe',
    activeText: '#1e3a8a',
    border: '#bfdbfe',
  },
  success: {
    background: '#ecfdf5',
    text: '#047857',
    icon: '#047857',
    hoverBackground: '#10b981',
    hoverText: '#ffffff',
    border: '#a7f3d0',
  },
  revision: {
    background: '#fffbeb',
    text: '#b45309',
    icon: '#b45309',
    hoverBackground: '#f59e0b',
    hoverText: '#ffffff',
    border: '#fde68a',
  },
  danger: {
    background: '#fef2f2',
    text: '#b91c1c',
    icon: '#b91c1c',
    hoverBackground: '#dc2626',
    hoverText: '#ffffff',
    border: '#fecaca',
  },
  disabled: {
    background: '#e5e7eb',
    text: '#9ca3af',
    icon: '#9ca3af',
    border: '#d1d5db',
  },
  heroNavigation: {
    inactiveBackground: '#ffffff',
    inactiveText: '#2563eb',
    inactiveIcon: '#2563eb',
    inactiveBorder: '#ffffff',
    hoverBackground: '#ffffff',
    hoverText: '#1d4ed8',
    activeBackground: '#ffffff',
    activeText: '#2563eb',
    activeBorder: '#2563eb',
    shadow: '#0f172a2e',
  },
  search: {
    background: '#0f8f9d',
    icon: '#ffffff',
    hoverBackground: '#0b7480',
    border: '#0b7480',
  },
}

const BUTTON_COLOR_SECTIONS = [
  {
    key: 'primary',
    title: 'Primary buttons',
    description: 'Save, submit, send, create, add, assign, confirm, sign in, and other main actions.',
    fields: [
      ['background', 'Primary button background'],
      ['text', 'Primary button text'],
      ['icon', 'Primary button icon'],
      ['hoverBackground', 'Primary hover background'],
      ['hoverText', 'Primary hover text'],
      ['activeBackground', 'Primary active background'],
      ['activeText', 'Primary active text'],
      ['border', 'Primary border'],
      ['focusRing', 'Primary focus-ring color'],
    ],
  },
  {
    key: 'secondary',
    title: 'Secondary buttons',
    description: 'View, edit, back, cancel, download, learn more, filter, and supporting actions.',
    fields: [
      ['background', 'Secondary background'],
      ['text', 'Secondary text'],
      ['icon', 'Secondary icon'],
      ['hoverBackground', 'Secondary hover background'],
      ['hoverText', 'Secondary hover text'],
      ['activeBackground', 'Secondary active background'],
      ['activeText', 'Secondary active text'],
      ['border', 'Secondary border'],
    ],
  },
  {
    key: 'success',
    title: 'Success / Accept buttons',
    description: 'Accept, approve, complete, and positive decisions.',
    fields: [
      ['background', 'Success background'],
      ['text', 'Success text'],
      ['icon', 'Success icon'],
      ['hoverBackground', 'Success hover background'],
      ['hoverText', 'Success hover text'],
      ['border', 'Success border'],
    ],
  },
  {
    key: 'revision',
    title: 'Revision / Warning buttons',
    description: 'Request revision, reschedule, unassign, and warning actions.',
    fields: [
      ['background', 'Revision background'],
      ['text', 'Revision text'],
      ['icon', 'Revision icon'],
      ['hoverBackground', 'Revision hover background'],
      ['hoverText', 'Revision hover text'],
      ['border', 'Revision border'],
    ],
  },
  {
    key: 'danger',
    title: 'Danger buttons',
    description: 'Reject, delete, remove, logout, cancel meeting, and destructive actions.',
    fields: [
      ['background', 'Danger background'],
      ['text', 'Danger text'],
      ['icon', 'Danger icon'],
      ['hoverBackground', 'Danger hover background'],
      ['hoverText', 'Danger hover text'],
      ['border', 'Danger border'],
    ],
  },
  {
    key: 'disabled',
    title: 'Disabled buttons',
    description: 'Buttons unavailable while loading or because an action is not permitted.',
    fields: [
      ['background', 'Disabled background'],
      ['text', 'Disabled text'],
      ['icon', 'Disabled icon'],
      ['border', 'Disabled border'],
    ],
  },
  {
    key: 'heroNavigation',
    title: 'Hero navigation buttons',
    description: 'Inactive, hover, and active navigation buttons displayed over each role hero picture.',
    fields: [
      ['inactiveBackground', 'Hero navigation inactive background'],
      ['inactiveText', 'Hero navigation inactive text'],
      ['inactiveIcon', 'Hero navigation inactive icon'],
      ['inactiveBorder', 'Hero navigation inactive border'],
      ['hoverBackground', 'Hero navigation hover background'],
      ['hoverText', 'Hero navigation hover text'],
      ['activeBackground', 'Hero navigation active background'],
      ['activeText', 'Hero navigation active text'],
      ['activeBorder', 'Hero navigation active border'],
      ['shadow', 'Hero navigation shadow color'],
    ],
  },
  {
    key: 'search',
    title: 'Search button',
    description: 'The rectangular search button attached to the role hero search field.',
    fields: [
      ['background', 'Search button background'],
      ['icon', 'Search button icon'],
      ['hoverBackground', 'Search button hover background'],
      ['border', 'Search button border'],
    ],
  },
]

const BUTTON_COLOR_CSS_VARIABLES = {
  primary: {
    background: '--btn-primary-bg',
    text: '--btn-primary-text',
    icon: '--btn-primary-icon',
    hoverBackground: '--btn-primary-hover-bg',
    hoverText: '--btn-primary-hover-text',
    activeBackground: '--btn-primary-active-bg',
    activeText: '--btn-primary-active-text',
    border: '--btn-primary-border',
    focusRing: '--btn-primary-focus-ring',
  },
  secondary: {
    background: '--btn-secondary-bg',
    text: '--btn-secondary-text',
    icon: '--btn-secondary-icon',
    hoverBackground: '--btn-secondary-hover-bg',
    hoverText: '--btn-secondary-hover-text',
    activeBackground: '--btn-secondary-active-bg',
    activeText: '--btn-secondary-active-text',
    border: '--btn-secondary-border',
  },
  success: {
    background: '--btn-success-bg',
    text: '--btn-success-text',
    icon: '--btn-success-icon',
    hoverBackground: '--btn-success-hover-bg',
    hoverText: '--btn-success-hover-text',
    border: '--btn-success-border',
  },
  revision: {
    background: '--btn-revision-bg',
    text: '--btn-revision-text',
    icon: '--btn-revision-icon',
    hoverBackground: '--btn-revision-hover-bg',
    hoverText: '--btn-revision-hover-text',
    border: '--btn-revision-border',
  },
  danger: {
    background: '--btn-danger-bg',
    text: '--btn-danger-text',
    icon: '--btn-danger-icon',
    hoverBackground: '--btn-danger-hover-bg',
    hoverText: '--btn-danger-hover-text',
    border: '--btn-danger-border',
  },
  disabled: {
    background: '--btn-disabled-bg',
    text: '--btn-disabled-text',
    icon: '--btn-disabled-icon',
    border: '--btn-disabled-border',
  },
  heroNavigation: {
    inactiveBackground: '--hero-nav-inactive-bg',
    inactiveText: '--hero-nav-inactive-text',
    inactiveIcon: '--hero-nav-inactive-icon',
    inactiveBorder: '--hero-nav-inactive-border',
    hoverBackground: '--hero-nav-hover-bg',
    hoverText: '--hero-nav-hover-text',
    activeBackground: '--hero-nav-active-bg',
    activeText: '--hero-nav-active-text',
    activeBorder: '--hero-nav-active-border',
    shadow: '--hero-nav-shadow',
  },
  search: {
    background: '--search-btn-bg',
    icon: '--search-btn-icon',
    hoverBackground: '--search-btn-hover-bg',
    border: '--search-btn-border',
  },
}


const DEFAULT_INTERFACE_COLORS = {
  topHeader: {
    background: '#ffffff',
    text: '#1f2937',
    icon: '#1f2937',
    border: '#e5e7eb',
    shadow: 'rgba(15, 23, 42, 0.08)',
    buttonBackground: '#ffffff',
    buttonText: '#1f2937',
    buttonIcon: '#1f2937',
    buttonHoverBackground: '#f3f4f6',
    buttonHoverText: '#111827',
    hamburgerBackground: '#2563eb',
    hamburgerIcon: '#ffffff',
    inboxTriggerBackground: '#ffffff',
    inboxTriggerIcon: '#2563eb',
    roleDropdownBackground: '#ffffff',
    roleDropdownText: '#1f2937',
    avatarBackground: '#dbeafe',
    avatarText: '#1e3a8a',
  },
  sidebar: {
    background: '#292829',
    secondaryBackground: '#292829',
    border: 'rgba(255, 255, 255, 0.12)',
    shadow: 'rgba(15, 23, 42, 0.18)',
    text: '#ffffff',
    icon: '#ffffff',
    inactiveBackground: 'rgba(255, 255, 255, 0.10)',
    inactiveText: '#ffffff',
    inactiveIcon: '#ffffff',
    hoverBackground: '#ffffff',
    hoverText: '#4d4c4d',
    hoverIcon: '#4d4c4d',
    activeBackground: '#ffffff',
    activeText: '#4d4c4d',
    activeIcon: '#4d4c4d',
    utilityBackground: 'rgba(255, 255, 255, 0.10)',
    utilityText: '#ffffff',
    closeButtonBackground: 'rgba(255, 255, 255, 0.12)',
    closeButtonIcon: '#ffffff',
    scrollbarTrack: 'transparent',
    scrollbarThumb: 'rgba(255, 255, 255, 0.35)',
    iconContainerBackground: '#ffffff',
    iconContainerBorder: '#d1d5db',
    iconContainerIcon: '#2f8f86',
    iconContainerHoverBackground: '#ffffff',
    iconContainerHoverIcon: '#35b8ae',
    iconContainerActiveBackground: '#ffffff',
    iconContainerActiveIcon: '#35b8ae',
    iconContainerDisabledBackground: '#e5e7eb',
    iconContainerDisabledIcon: '#9ca3af',
    iconContainerShadow: 'rgba(15, 23, 42, 0.12)',
    iconContainerRadius: '18px',
  },
  inbox: {
    popupBackground: '#ffffff',
    headerBackground: '#ffffff',
    titleText: '#111827',
    text: '#374151',
    secondaryText: '#6b7280',
    icon: '#2563eb',
    border: '#e5e7eb',
    shadow: 'rgba(15, 23, 42, 0.20)',
    unreadBackground: '#eff6ff',
    unreadText: '#1f2937',
    readBackground: '#ffffff',
    readText: '#4b5563',
    hoverBackground: '#f8fafc',
    badgeBackground: '#dc2626',
    badgeText: '#ffffff',
    unreadIndicator: '#2563eb',
    emptyBackground: '#f9fafb',
    emptyText: '#6b7280',
    markReadBackground: '#f3f4f6',
    markReadText: '#374151',
    deleteBackground: '#fef2f2',
    deleteText: '#b91c1c',
    closeBackground: '#ffffff',
    closeIcon: '#4b5563',
  },
}

const INTERFACE_COLOR_SECTIONS = [
  {
    key: 'topHeader',
    title: 'Top Header Colors',
    description: 'Authenticated header, mobile hamburger, role switcher, profile avatar, and header utility controls.',
    fields: [
      ['background', 'Header background'],
      ['text', 'Header text color'],
      ['icon', 'Header icon color'],
      ['buttonBackground', 'Header button background'],
      ['buttonText', 'Header button text color'],
      ['buttonIcon', 'Header button icon color'],
      ['buttonHoverBackground', 'Header button hover background'],
      ['buttonHoverText', 'Header button hover text'],
      ['border', 'Header border color'],
      ['shadow', 'Header shadow color'],
      ['hamburgerBackground', 'Hamburger button background'],
      ['hamburgerIcon', 'Hamburger icon color'],
      ['roleDropdownBackground', 'Role dropdown background'],
      ['roleDropdownText', 'Role dropdown text color'],
      ['avatarBackground', 'Profile / avatar background'],
      ['avatarText', 'Profile / avatar text color'],
    ],
  },
  {
    key: 'sidebar',
    title: 'Sidebar Colors',
    description: 'Complete role and Admin Subdomain sidebar appearance, navigation states, utility controls, close button, and scrollbar.',
    fields: [
      ['background', 'Sidebar main background'],
      ['secondaryBackground', 'Sidebar secondary background'],
      ['border', 'Sidebar border color'],
      ['shadow', 'Sidebar shadow color'],
      ['text', 'Sidebar text color'],
      ['icon', 'Sidebar icon color'],
      ['inactiveBackground', 'Sidebar inactive item background'],
      ['inactiveText', 'Sidebar inactive item text'],
      ['inactiveIcon', 'Sidebar inactive item icon'],
      ['hoverBackground', 'Sidebar hover background'],
      ['hoverText', 'Sidebar hover text'],
      ['hoverIcon', 'Sidebar hover icon'],
      ['activeBackground', 'Sidebar active background'],
      ['activeText', 'Sidebar active text'],
      ['activeIcon', 'Sidebar active icon'],
      ['utilityBackground', 'Sidebar utility button background'],
      ['utilityText', 'Sidebar utility button text'],
      ['closeButtonBackground', 'Sidebar close button background'],
      ['closeButtonIcon', 'Sidebar close X icon color'],
      ['scrollbarTrack', 'Sidebar scrollbar track'],
      ['scrollbarThumb', 'Sidebar scrollbar thumb'],
    ],
  },
  {
    id: 'sidebar-icon-container',
    key: 'sidebar',
    title: 'Sidebar Icon Container Colors',
    description: 'Rounded icon tile background, border, icon, hover, active, disabled, shadow, and corner radius across role and Admin Subdomain sidebars.',
    fields: [
      ['iconContainerBackground', 'Icon container background'],
      ['iconContainerBorder', 'Icon container border'],
      ['iconContainerIcon', 'Icon color'],
      ['iconContainerHoverBackground', 'Icon container hover background'],
      ['iconContainerHoverIcon', 'Icon hover color'],
      ['iconContainerActiveBackground', 'Icon container active background'],
      ['iconContainerActiveIcon', 'Icon active color'],
      ['iconContainerDisabledBackground', 'Icon container disabled background'],
      ['iconContainerDisabledIcon', 'Icon disabled color'],
      ['iconContainerShadow', 'Icon container shadow'],
      ['iconContainerRadius', 'Icon container corner radius'],
    ],
  },
  {
    key: 'inbox',
    title: 'Inbox Colors',
    description: 'Existing Inbox popup, message states, unread badge, text, indicators, action buttons, close button, and empty state.',
    fields: [
      ['popupBackground', 'Inbox popup background'],
      ['headerBackground', 'Inbox header background'],
      ['titleText', 'Inbox title text'],
      ['text', 'Inbox normal text'],
      ['secondaryText', 'Inbox secondary / date text'],
      ['icon', 'Inbox icon color'],
      ['border', 'Inbox border'],
      ['shadow', 'Inbox shadow color'],
      ['unreadBackground', 'Inbox unread item background'],
      ['unreadText', 'Inbox unread item text'],
      ['readBackground', 'Inbox read item background'],
      ['readText', 'Inbox read item text'],
      ['hoverBackground', 'Inbox item hover background'],
      ['badgeBackground', 'Unread count badge background'],
      ['badgeText', 'Unread count badge text'],
      ['unreadIndicator', 'Unread indicator color'],
      ['emptyBackground', 'Empty-state background'],
      ['emptyText', 'Empty-state text'],
      ['markReadBackground', 'Mark as Read button background'],
      ['markReadText', 'Mark as Read button text'],
      ['deleteBackground', 'Delete button background'],
      ['deleteText', 'Delete button text'],
      ['closeBackground', 'Close button background'],
      ['closeIcon', 'Close X icon color'],
    ],
  },
]

const INTERFACE_COLOR_CSS_VARIABLES = {
  topHeader: {
    background: '--top-header-bg',
    text: '--top-header-text',
    icon: '--top-header-icon',
    border: '--top-header-border',
    shadow: '--top-header-shadow',
    buttonBackground: '--top-header-button-bg',
    buttonText: '--top-header-button-text',
    buttonIcon: '--top-header-button-icon',
    buttonHoverBackground: '--top-header-button-hover-bg',
    buttonHoverText: '--top-header-button-hover-text',
    hamburgerBackground: '--top-header-hamburger-bg',
    hamburgerIcon: '--top-header-hamburger-icon',
    inboxTriggerBackground: '--top-header-inbox-trigger-bg',
    inboxTriggerIcon: '--top-header-inbox-trigger-icon',
    roleDropdownBackground: '--top-header-role-dropdown-bg',
    roleDropdownText: '--top-header-role-dropdown-text',
    avatarBackground: '--top-header-avatar-bg',
    avatarText: '--top-header-avatar-text',
  },
  sidebar: {
    background: '--sidebar-bg',
    secondaryBackground: '--sidebar-secondary-bg',
    border: '--sidebar-border',
    shadow: '--sidebar-shadow',
    text: '--sidebar-text',
    icon: '--sidebar-icon',
    inactiveBackground: '--sidebar-inactive-bg',
    inactiveText: '--sidebar-inactive-text',
    inactiveIcon: '--sidebar-inactive-icon',
    hoverBackground: '--sidebar-hover-bg',
    hoverText: '--sidebar-hover-text',
    hoverIcon: '--sidebar-hover-icon',
    activeBackground: '--sidebar-active-bg',
    activeText: '--sidebar-active-text',
    activeIcon: '--sidebar-active-icon',
    utilityBackground: '--sidebar-utility-bg',
    utilityText: '--sidebar-utility-text',
    closeButtonBackground: '--sidebar-close-bg',
    closeButtonIcon: '--sidebar-close-icon',
    scrollbarTrack: '--sidebar-scrollbar-track',
    scrollbarThumb: '--sidebar-scrollbar-thumb',
    iconContainerBackground: '--sidebar-icon-container-bg',
    iconContainerBorder: '--sidebar-icon-container-border',
    iconContainerIcon: '--sidebar-icon-container-icon',
    iconContainerHoverBackground: '--sidebar-icon-container-hover-bg',
    iconContainerHoverIcon: '--sidebar-icon-container-hover-icon',
    iconContainerActiveBackground: '--sidebar-icon-container-active-bg',
    iconContainerActiveIcon: '--sidebar-icon-container-active-icon',
    iconContainerDisabledBackground: '--sidebar-icon-container-disabled-bg',
    iconContainerDisabledIcon: '--sidebar-icon-container-disabled-icon',
    iconContainerShadow: '--sidebar-icon-container-shadow',
    iconContainerRadius: '--sidebar-icon-container-radius',
  },
  inbox: {
    popupBackground: '--inbox-popup-bg',
    headerBackground: '--inbox-header-bg',
    titleText: '--inbox-title-text',
    text: '--inbox-text',
    secondaryText: '--inbox-secondary-text',
    icon: '--inbox-icon',
    border: '--inbox-border',
    shadow: '--inbox-shadow',
    unreadBackground: '--inbox-unread-bg',
    unreadText: '--inbox-unread-text',
    readBackground: '--inbox-read-bg',
    readText: '--inbox-read-text',
    hoverBackground: '--inbox-hover-bg',
    badgeBackground: '--inbox-badge-bg',
    badgeText: '--inbox-badge-text',
    unreadIndicator: '--inbox-unread-indicator',
    emptyBackground: '--inbox-empty-bg',
    emptyText: '--inbox-empty-text',
    markReadBackground: '--inbox-mark-read-bg',
    markReadText: '--inbox-mark-read-text',
    deleteBackground: '--inbox-delete-bg',
    deleteText: '--inbox-delete-text',
    closeBackground: '--inbox-close-bg',
    closeIcon: '--inbox-close-icon',
  },
}

const INTERFACE_COLOR_SECTION_ALIASES = {
  topHeader: ['topHeader', 'top_header', 'header', 'authenticatedHeader'],
  sidebar: ['sidebar', 'sideBar', 'navigationSidebar'],
  inbox: ['inbox', 'notifications', 'notificationDropdown', 'notification_dropdown'],
}

const INTERFACE_COLOR_FIELD_ALIASES = {
  background: ['background', 'backgroundColor', 'bg'],
  secondaryBackground: ['secondaryBackground', 'secondaryBackgroundColor', 'gradientEnd', 'secondaryBg'],
  text: ['text', 'textColor', 'color', 'foreground'],
  icon: ['icon', 'iconColor'],
  border: ['border', 'borderColor'],
  shadow: ['shadow', 'shadowColor'],
  buttonBackground: ['buttonBackground', 'buttonBg'],
  buttonText: ['buttonText', 'buttonTextColor'],
  buttonIcon: ['buttonIcon', 'buttonIconColor'],
  buttonHoverBackground: ['buttonHoverBackground', 'buttonHoverBg', 'hoverBackground'],
  buttonHoverText: ['buttonHoverText', 'buttonHoverTextColor', 'hoverText'],
  hamburgerBackground: ['hamburgerBackground', 'hamburgerBg'],
  hamburgerIcon: ['hamburgerIcon', 'hamburgerIconColor'],
  inboxTriggerBackground: ['inboxTriggerBackground', 'inboxButtonBackground', 'inboxTriggerBg'],
  inboxTriggerIcon: ['inboxTriggerIcon', 'inboxButtonIcon', 'inboxTriggerIconColor'],
  roleDropdownBackground: ['roleDropdownBackground', 'roleDropdownBg'],
  roleDropdownText: ['roleDropdownText', 'roleDropdownTextColor'],
  avatarBackground: ['avatarBackground', 'profileBackground', 'avatarBg'],
  avatarText: ['avatarText', 'profileText', 'avatarTextColor'],
  inactiveBackground: ['inactiveBackground', 'inactiveBg'],
  inactiveText: ['inactiveText', 'inactiveTextColor'],
  inactiveIcon: ['inactiveIcon', 'inactiveIconColor'],
  hoverBackground: ['hoverBackground', 'hoverBg'],
  hoverText: ['hoverText', 'hoverTextColor'],
  hoverIcon: ['hoverIcon', 'hoverIconColor'],
  activeBackground: ['activeBackground', 'activeBg'],
  activeText: ['activeText', 'activeTextColor'],
  activeIcon: ['activeIcon', 'activeIconColor'],
  utilityBackground: ['utilityBackground', 'utilityBg'],
  utilityText: ['utilityText', 'utilityTextColor'],
  closeButtonBackground: ['closeButtonBackground', 'closeBackground', 'closeButtonBg'],
  closeButtonIcon: ['closeButtonIcon', 'closeIcon', 'closeButtonIconColor'],
  scrollbarTrack: ['scrollbarTrack', 'scrollTrack'],
  scrollbarThumb: ['scrollbarThumb', 'scrollThumb'],
  iconContainerBackground: ['iconContainerBackground', 'iconContainerBg', 'sidebarIconBackground'],
  iconContainerBorder: ['iconContainerBorder', 'iconContainerBorderColor', 'sidebarIconBorder'],
  iconContainerIcon: ['iconContainerIcon', 'iconContainerIconColor', 'sidebarIconColor'],
  iconContainerHoverBackground: ['iconContainerHoverBackground', 'iconContainerHoverBg'],
  iconContainerHoverIcon: ['iconContainerHoverIcon', 'iconContainerHoverIconColor'],
  iconContainerActiveBackground: ['iconContainerActiveBackground', 'iconContainerActiveBg'],
  iconContainerActiveIcon: ['iconContainerActiveIcon', 'iconContainerActiveIconColor'],
  iconContainerDisabledBackground: ['iconContainerDisabledBackground', 'iconContainerDisabledBg'],
  iconContainerDisabledIcon: ['iconContainerDisabledIcon', 'iconContainerDisabledIconColor'],
  iconContainerShadow: ['iconContainerShadow', 'iconContainerShadowColor'],
  iconContainerRadius: ['iconContainerRadius', 'iconContainerBorderRadius', 'sidebarIconRadius'],
  popupBackground: ['popupBackground', 'popupBg', 'background'],
  headerBackground: ['headerBackground', 'headerBg'],
  titleText: ['titleText', 'titleColor'],
  secondaryText: ['secondaryText', 'dateText', 'mutedText'],
  unreadBackground: ['unreadBackground', 'unreadBg'],
  unreadText: ['unreadText', 'unreadTextColor'],
  readBackground: ['readBackground', 'readBg'],
  readText: ['readText', 'readTextColor'],
  badgeBackground: ['badgeBackground', 'badgeBg'],
  badgeText: ['badgeText', 'badgeTextColor'],
  unreadIndicator: ['unreadIndicator', 'indicatorColor'],
  emptyBackground: ['emptyBackground', 'emptyBg'],
  emptyText: ['emptyText', 'emptyTextColor'],
  markReadBackground: ['markReadBackground', 'markReadBg'],
  markReadText: ['markReadText', 'markReadTextColor'],
  deleteBackground: ['deleteBackground', 'deleteBg'],
  deleteText: ['deleteText', 'deleteTextColor'],
  closeBackground: ['closeBackground', 'closeBg'],
  closeIcon: ['closeIcon', 'closeIconColor'],
}

function cloneDefaultInterfaceColors() {
  return JSON.parse(JSON.stringify(DEFAULT_INTERFACE_COLORS))
}

function isValidThemeCssColor(value) {
  const raw = String(value || '').trim()
  if (!raw) return false
  if (raw.toLowerCase() === 'transparent') return true
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return true
  const match = raw.match(/^rgba?\((.*)\)$/i)
  if (!match) return false
  const parts = match[1].split(',').map((part) => part.trim())
  const wantsAlpha = /^rgba/i.test(raw)
  if (parts.length !== (wantsAlpha ? 4 : 3)) return false
  const channelsValid = parts.slice(0, 3).every((part) => {
    if (/^\d+(?:\.\d+)?%$/.test(part)) {
      const number = Number(part.slice(0, -1))
      return number >= 0 && number <= 100
    }
    if (!/^\d+(?:\.\d+)?$/.test(part)) return false
    const number = Number(part)
    return number >= 0 && number <= 255
  })
  if (!channelsValid) return false
  if (!wantsAlpha) return true
  if (!/^(?:0|1|0?\.\d+)$/.test(parts[3])) return false
  const alpha = Number(parts[3])
  return alpha >= 0 && alpha <= 1
}

const INTERFACE_LENGTH_FIELDS = new Set(['iconContainerRadius'])

function isValidThemeCssLength(value) {
  const raw = String(value || '').trim()
  if (!raw) return false
  if (raw === '0') return true
  return /^(?:\d+|\d*\.\d+)(?:px|rem|em|%|vh|vw)$/i.test(raw)
}

function normalizeThemeCssColor(value, fallback) {
  const raw = String(value ?? '').trim()
  return isValidThemeCssColor(raw) ? raw : fallback
}

function normalizeInterfaceThemeValue(fieldKey, value, fallback) {
  const raw = String(value ?? '').trim()
  if (INTERFACE_LENGTH_FIELDS.has(fieldKey)) return isValidThemeCssLength(raw) ? raw : fallback
  return normalizeThemeCssColor(raw, fallback)
}

function normalizeInterfaceColors(colors = {}, legacySidebar = {}) {
  const parsed = parseJsonObject(colors)
  const source = parseJsonObject(parsed.interface_colors ?? parsed.interfaceColors ?? parsed.interface_theme ?? parsed.interfaceTheme ?? parsed)
  const legacySidebarSource = parseJsonObject(legacySidebar)
  const normalized = {}

  for (const [sectionKey, defaultSection] of Object.entries(DEFAULT_INTERFACE_COLORS)) {
    const aliases = INTERFACE_COLOR_SECTION_ALIASES[sectionKey] || [sectionKey]
    let incomingSection = {}
    for (const alias of aliases) {
      const candidate = parseJsonObject(source?.[alias])
      if (Object.keys(candidate).length) {
        incomingSection = candidate
        break
      }
    }
    if (sectionKey === 'sidebar') incomingSection = { ...legacySidebarSource, ...incomingSection }

    normalized[sectionKey] = {}
    for (const [fieldKey, defaultValue] of Object.entries(defaultSection)) {
      const fieldAliases = [fieldKey, ...(INTERFACE_COLOR_FIELD_ALIASES[fieldKey] || [])]
      const incomingValue = firstDefinedThemeValue(incomingSection, [...new Set(fieldAliases)])
      normalized[sectionKey][fieldKey] = normalizeInterfaceThemeValue(fieldKey, incomingValue, defaultValue)
    }
  }

  return normalized
}

function interfaceColorSettingsMatch(left, right) {
  return JSON.stringify(normalizeInterfaceColors(left)) === JSON.stringify(normalizeInterfaceColors(right))
}

function applyInterfaceTheme(colors = DEFAULT_INTERFACE_COLORS) {
  if (typeof document === 'undefined') return normalizeInterfaceColors(colors)
  const normalized = normalizeInterfaceColors(colors)
  const root = document.documentElement

  for (const [sectionKey, fields] of Object.entries(INTERFACE_COLOR_CSS_VARIABLES)) {
    for (const [fieldKey, cssVariable] of Object.entries(fields)) {
      const value = normalized?.[sectionKey]?.[fieldKey] ?? DEFAULT_INTERFACE_COLORS?.[sectionKey]?.[fieldKey]
      if (value) root.style.setProperty(cssVariable, value)
    }
  }

  const sidebar = normalized.sidebar

  // Keep sidebar item-icon colors and rounded icon-container colors independent.
  // The previous compatibility mapping replaced the icon-container color with the
  // inactive item color. With the common white inactive icon and white container
  // background, real role-sidebar icons became invisible even though the preview
  // could still appear correct. The canonical interface_colors.sidebar values now
  // map directly to their matching CSS variables.
  root.style.setProperty('--sidebar-icon', sidebar.icon)
  root.style.setProperty('--sidebar-inactive-icon', sidebar.inactiveIcon)
  root.style.setProperty('--sidebar-hover-icon', sidebar.hoverIcon)
  root.style.setProperty('--sidebar-active-icon', sidebar.activeIcon)
  root.style.setProperty('--sidebar-icon-inactive', sidebar.iconContainerIcon)
  root.style.setProperty('--sidebar-icon-hover', sidebar.iconContainerHoverIcon)
  root.style.setProperty('--sidebar-icon-active', sidebar.iconContainerActiveIcon)

  const compatibilityVariables = {
    '--sidebar-btn-inactive-bg': sidebar.inactiveBackground,
    '--sidebar-btn-inactive-text': sidebar.inactiveText,
    '--sidebar-btn-inactive-icon': sidebar.inactiveIcon,
    '--sidebar-btn-hover-bg': sidebar.hoverBackground,
    '--sidebar-btn-hover-text': sidebar.hoverText,
    '--sidebar-btn-active-bg': sidebar.activeBackground,
    '--sidebar-btn-active-text': sidebar.activeText,
    '--sidebar-btn-active-icon': sidebar.activeIcon,
    '--sidebar-btn-border': sidebar.border,
    '--sidebar-inactive-border': sidebar.border,
    '--sidebar-active-border': sidebar.border,
  }
  Object.entries(compatibilityVariables).forEach(([name, value]) => root.style.setProperty(name, value))

  root.dataset.interfaceThemeReady = 'true'
  return normalized
}

function cloneDefaultButtonColors() {
  return JSON.parse(JSON.stringify(DEFAULT_BUTTON_COLORS))
}

function isValidThemeHexColor(value) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(value || '').trim())
}

function normalizeThemeHexColor(value, fallback) {
  const raw = String(value || '').trim()
  return isValidThemeHexColor(raw) ? raw.toLowerCase() : fallback
}

const BUTTON_COLOR_SECTION_ALIASES = {
  primary: ['primary', 'main', 'primaryButtons'],
  secondary: ['secondary', 'secondaryButtons'],
  success: ['success', 'accept', 'approve', 'successButtons'],
  revision: ['revision', 'warning', 'revisionButtons', 'warningButtons'],
  danger: ['danger', 'reject', 'destructive', 'dangerButtons'],
  disabled: ['disabled', 'disabledButtons'],
  heroNavigation: ['heroNavigation', 'hero_navigation', 'heroNav', 'hero_nav'],
  search: ['search', 'searchButton', 'search_button'],
  sidebar: ['sidebar', 'sidebarButtons', 'sidebar_buttons'],
}

const BUTTON_COLOR_FIELD_ALIASES = {
  background: ['background', 'backgroundColor', 'bg'],
  text: ['text', 'textColor', 'color', 'foreground'],
  icon: ['icon', 'iconColor'],
  hoverBackground: ['hoverBackground', 'hoverBackgroundColor', 'hoverColor', 'hoverBg'],
  hoverText: ['hoverText', 'hoverTextColor', 'hoverForeground'],
  activeBackground: ['activeBackground', 'activeBackgroundColor', 'activeColor', 'activeBg'],
  activeText: ['activeText', 'activeTextColor', 'activeForeground'],
  border: ['border', 'borderColor'],
  focusRing: ['focusRing', 'focusRingColor', 'focus'],
  inactiveBackground: ['inactiveBackground', 'inactiveBackgroundColor', 'inactiveBg'],
  inactiveText: ['inactiveText', 'inactiveTextColor'],
  inactiveIcon: ['inactiveIcon', 'inactiveIconColor'],
  inactiveBorder: ['inactiveBorder', 'inactiveBorderColor'],
  activeBorder: ['activeBorder', 'activeBorderColor'],
  shadow: ['shadow', 'shadowColor'],
  activeIcon: ['activeIcon', 'activeIconColor'],
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function firstDefinedThemeValue(source, aliases = []) {
  for (const key of aliases) {
    const value = source?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return undefined
}

function normalizeButtonColors(colors = {}) {
  const parsed = parseJsonObject(colors)
  const source = parseJsonObject(parsed.button_colors ?? parsed.buttonColors ?? parsed.button_theme ?? parsed.buttonTheme ?? parsed)
  const normalized = {}

  for (const [sectionKey, defaultSection] of Object.entries(DEFAULT_BUTTON_COLORS)) {
    const sectionAliases = BUTTON_COLOR_SECTION_ALIASES[sectionKey] || [sectionKey]
    let incomingSection = {}
    for (const alias of sectionAliases) {
      const candidate = parseJsonObject(source?.[alias])
      if (Object.keys(candidate).length) {
        incomingSection = candidate
        break
      }
    }

    normalized[sectionKey] = {}
    for (const [fieldKey, defaultValue] of Object.entries(defaultSection)) {
      const aliases = [fieldKey, ...(BUTTON_COLOR_FIELD_ALIASES[fieldKey] || [])]
      const incomingValue = firstDefinedThemeValue(incomingSection, [...new Set(aliases)])
      normalized[sectionKey][fieldKey] = normalizeThemeHexColor(incomingValue, defaultValue)
    }
  }

  return normalized
}

function buttonColorSettingsMatch(left, right) {
  return JSON.stringify(normalizeButtonColors(left)) === JSON.stringify(normalizeButtonColors(right))
}

function applyButtonTheme(colors = DEFAULT_BUTTON_COLORS) {
  if (typeof document === 'undefined') return normalizeButtonColors(colors)
  const normalized = normalizeButtonColors(colors)
  const root = document.documentElement

  for (const [sectionKey, fields] of Object.entries(BUTTON_COLOR_CSS_VARIABLES)) {
    for (const [fieldKey, cssVariable] of Object.entries(fields)) {
      const value = normalized?.[sectionKey]?.[fieldKey] ?? DEFAULT_BUTTON_COLORS?.[sectionKey]?.[fieldKey]
      if (value) root.style.setProperty(cssVariable, value)
    }
  }

  root.dataset.buttonThemeReady = 'true'
  return normalized
}

function applyButtonColorCssVariables(colors = DEFAULT_BUTTON_COLORS) {
  return applyButtonTheme(colors)
}

function colorPickerValue(value) {
  const raw = String(value || '').trim()
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.slice(1).split('').map((char) => `${char}${char}`).join('')}`
  }
  if (/^#[0-9a-f]{8}$/i.test(raw)) return raw.slice(0, 7)
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw
  const parsed = parseThemeCssColor(raw)
  if (parsed) {
    const toHex = (number) => Math.max(0, Math.min(255, Math.round(number))).toString(16).padStart(2, '0')
    return `#${toHex(parsed.r)}${toHex(parsed.g)}${toHex(parsed.b)}`
  }
  return '#000000'
}

function parseThemeHexColor(value) {
  const raw = String(value || '').trim().replace('#', '')
  if (![3, 6, 8].includes(raw.length) || !/^[0-9a-f]+$/i.test(raw)) return null
  const expanded = raw.length === 3 ? raw.split('').map((char) => `${char}${char}`).join('') : raw
  const rgb = expanded.slice(0, 6)
  const alpha = expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1
  return {
    r: parseInt(rgb.slice(0, 2), 16),
    g: parseInt(rgb.slice(2, 4), 16),
    b: parseInt(rgb.slice(4, 6), 16),
    a: alpha,
  }
}


function parseThemeCssColor(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  const hex = parseThemeHexColor(raw)
  if (hex) return hex
  const match = raw.match(/^rgba?\((.*)\)$/i)
  if (!match) return null
  const parts = match[1].split(',').map((part) => part.trim())
  const wantsAlpha = /^rgba/i.test(raw)
  if (parts.length !== (wantsAlpha ? 4 : 3)) return null
  const channels = parts.slice(0, 3).map((part) => (
    part.endsWith('%') ? (Number(part.slice(0, -1)) / 100) * 255 : Number(part)
  ))
  if (channels.some((number) => !Number.isFinite(number) || number < 0 || number > 255)) return null
  const alpha = wantsAlpha ? Number(parts[3]) : 1
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null
  return { r: channels[0], g: channels[1], b: channels[2], a: alpha }
}

function themeCssContrastRatio(background, foreground, base = { r: 255, g: 255, b: 255 }) {
  const bg = compositeThemeColor(parseThemeCssColor(background), base)
  const fg = compositeThemeColor(parseThemeCssColor(foreground), bg || base)
  if (!bg || !fg) return 1
  const lighter = Math.max(relativeThemeLuminance(bg), relativeThemeLuminance(fg))
  const darker = Math.min(relativeThemeLuminance(bg), relativeThemeLuminance(fg))
  return (lighter + 0.05) / (darker + 0.05)
}

function validateInterfaceColorValues(colors = {}) {
  const normalizedSource = colors && typeof colors === 'object' ? colors : {}
  const invalid = []
  for (const section of INTERFACE_COLOR_SECTIONS) {
    for (const [fieldKey, label] of section.fields) {
      const value = normalizedSource?.[section.key]?.[fieldKey]
      const valid = INTERFACE_LENGTH_FIELDS.has(fieldKey) ? isValidThemeCssLength(value) : isValidThemeCssColor(value)
      if (!valid) invalid.push(label)
    }
  }
  return invalid
}

function getInterfaceColorContrastWarnings(colors = {}) {
  const normalized = normalizeInterfaceColors(colors)
  const warnings = []
  const pairs = [
    ['Top header text', normalized.topHeader.background, normalized.topHeader.text],
    ['Top header icon', normalized.topHeader.background, normalized.topHeader.icon],
    ['Header button text', normalized.topHeader.buttonBackground, normalized.topHeader.buttonText],
    ['Header button icon', normalized.topHeader.buttonBackground, normalized.topHeader.buttonIcon],
    ['Hamburger icon', normalized.topHeader.hamburgerBackground, normalized.topHeader.hamburgerIcon],
    ['Role dropdown text', normalized.topHeader.roleDropdownBackground, normalized.topHeader.roleDropdownText],
    ['Avatar text', normalized.topHeader.avatarBackground, normalized.topHeader.avatarText],
    ['Sidebar text', normalized.sidebar.background, normalized.sidebar.text],
    ['Sidebar icon', normalized.sidebar.background, normalized.sidebar.icon],
    ['Sidebar inactive text', normalized.sidebar.inactiveBackground === 'transparent' ? normalized.sidebar.background : normalized.sidebar.inactiveBackground, normalized.sidebar.inactiveText],
    ['Sidebar inactive icon', normalized.sidebar.inactiveBackground === 'transparent' ? normalized.sidebar.background : normalized.sidebar.inactiveBackground, normalized.sidebar.inactiveIcon],
    ['Sidebar hover text', normalized.sidebar.hoverBackground, normalized.sidebar.hoverText],
    ['Sidebar active text', normalized.sidebar.activeBackground, normalized.sidebar.activeText],
    ['Sidebar icon container icon', normalized.sidebar.iconContainerBackground, normalized.sidebar.iconContainerIcon],
    ['Sidebar icon container hover icon', normalized.sidebar.iconContainerHoverBackground, normalized.sidebar.iconContainerHoverIcon],
    ['Sidebar icon container active icon', normalized.sidebar.iconContainerActiveBackground, normalized.sidebar.iconContainerActiveIcon],
    ['Sidebar icon container disabled icon', normalized.sidebar.iconContainerDisabledBackground, normalized.sidebar.iconContainerDisabledIcon],
    ['Inbox title', normalized.inbox.headerBackground, normalized.inbox.titleText],
    ['Inbox normal text', normalized.inbox.popupBackground, normalized.inbox.text],
    ['Inbox secondary text', normalized.inbox.popupBackground, normalized.inbox.secondaryText],
    ['Inbox unread text', normalized.inbox.unreadBackground, normalized.inbox.unreadText],
    ['Inbox read text', normalized.inbox.readBackground, normalized.inbox.readText],
    ['Inbox badge text', normalized.inbox.badgeBackground, normalized.inbox.badgeText],
    ['Inbox empty-state text', normalized.inbox.emptyBackground, normalized.inbox.emptyText],
    ['Inbox Mark as Read text', normalized.inbox.markReadBackground, normalized.inbox.markReadText],
    ['Inbox Delete text', normalized.inbox.deleteBackground, normalized.inbox.deleteText],
    ['Inbox close icon', normalized.inbox.closeBackground, normalized.inbox.closeIcon],
  ]
  for (const [label, background, foreground] of pairs) {
    if (themeCssContrastRatio(background, foreground) < 3) warnings.push(`${label} may be difficult to read.`)
  }
  return Array.from(new Set(warnings))
}

function compositeThemeColor(color, base = { r: 255, g: 255, b: 255 }) {
  if (!color) return null
  return {
    r: Math.round(color.r * color.a + base.r * (1 - color.a)),
    g: Math.round(color.g * color.a + base.g * (1 - color.a)),
    b: Math.round(color.b * color.a + base.b * (1 - color.a)),
  }
}

function relativeThemeLuminance(color) {
  const rgb = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

function themeContrastRatio(background, foreground) {
  const bg = compositeThemeColor(parseThemeHexColor(background))
  const fg = compositeThemeColor(parseThemeHexColor(foreground), bg || undefined)
  if (!bg || !fg) return 1
  const lighter = Math.max(relativeThemeLuminance(bg), relativeThemeLuminance(fg))
  const darker = Math.min(relativeThemeLuminance(bg), relativeThemeLuminance(fg))
  return (lighter + 0.05) / (darker + 0.05)
}

function themeColorDistance(first, second) {
  const a = compositeThemeColor(parseThemeHexColor(first))
  const b = compositeThemeColor(parseThemeHexColor(second))
  if (!a || !b) return 0
  return Math.sqrt(((a.r - b.r) ** 2) + ((a.g - b.g) ** 2) + ((a.b - b.b) ** 2))
}

function validateButtonColorValues(colors = {}) {
  const invalid = []
  for (const section of BUTTON_COLOR_SECTIONS) {
    for (const [fieldKey, label] of section.fields) {
      if (!isValidThemeHexColor(colors?.[section.key]?.[fieldKey])) invalid.push(label)
    }
  }
  return invalid
}

function getButtonColorContrastWarnings(colors = {}) {
  const normalized = normalizeButtonColors(colors)
  const warnings = []
  const pairs = [
    ['Primary button text', normalized.primary.background, normalized.primary.text],
    ['Primary button icon', normalized.primary.background, normalized.primary.icon],
    ['Primary hover text', normalized.primary.hoverBackground, normalized.primary.hoverText],
    ['Secondary button text', normalized.secondary.background, normalized.secondary.text],
    ['Secondary button icon', normalized.secondary.background, normalized.secondary.icon],
    ['Success button text', normalized.success.background, normalized.success.text],
    ['Success button icon', normalized.success.background, normalized.success.icon],
    ['Revision button text', normalized.revision.background, normalized.revision.text],
    ['Revision button icon', normalized.revision.background, normalized.revision.icon],
    ['Danger button text', normalized.danger.background, normalized.danger.text],
    ['Danger button icon', normalized.danger.background, normalized.danger.icon],
    ['Hero inactive text', normalized.heroNavigation.inactiveBackground, normalized.heroNavigation.inactiveText],
    ['Hero inactive icon', normalized.heroNavigation.inactiveBackground, normalized.heroNavigation.inactiveIcon],
    ['Hero active text', normalized.heroNavigation.activeBackground, normalized.heroNavigation.activeText],
    ['Search icon', normalized.search.background, normalized.search.icon],
  ]
  for (const [label, background, foreground] of pairs) {
    if (themeContrastRatio(background, foreground) < 3) warnings.push(`${label} may have insufficient contrast.`)
  }
  if (
    themeColorDistance(normalized.heroNavigation.inactiveBackground, normalized.heroNavigation.activeBackground) < 24
    && themeColorDistance(normalized.heroNavigation.inactiveText, normalized.heroNavigation.activeText) < 24
    && themeColorDistance(normalized.heroNavigation.inactiveBorder, normalized.heroNavigation.activeBorder) < 24
  ) {
    warnings.push('Hero navigation active and inactive states may be difficult to distinguish.')
  }
  return Array.from(new Set(warnings))
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
  loginGradientStart: '#1d4ed8',
  loginGradientEnd: '#2563eb',
  loginCircleColor: '#ffffff',
  loginShowGradientOverlay: true,
  loginShowCircles: true,
  adminWelcome: 'Manage website content, user access, deadlines, projects, database status, and audit activity from one admin control panel.',
  maintenanceNotice: '',
  assetUpdatedAt: '',
  button_colors: cloneDefaultButtonColors(),
  interface_colors: cloneDefaultInterfaceColors(),
  roleHeroes: cloneRoleHeroDefaults(),
}



const ABOUT_US_PAGE_KEY = 'about_us'
const defaultAboutUsPage = {
  page_key: ABOUT_US_PAGE_KEY,
  title: 'About Us',
  subtitle: 'College of Pharmacy Research Platform',
  content_html: '<h2>About the Platform</h2><p>The College of Pharmacy Research Platform supports students, supervisors, research committee members, and administrators in managing research projects, weekly reports, deadlines, questions, and academic progress in one secure system.</p><p>Use the admin subdomain to customize this page for your college or department.</p>',
  content_json: {},
  image_url: '',
  is_published: true,
  updated_at: '',
}

function sanitizeRichStyle(styleValue) {
  const allowed = new Set(['color', 'background-color', 'text-align', 'font-size', 'font-weight', 'font-style', 'text-decoration'])
  return String(styleValue || '')
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [rawName, ...rawValueParts] = chunk.split(':')
      const name = String(rawName || '').trim().toLowerCase()
      const value = rawValueParts.join(':').trim()
      if (!allowed.has(name) || !value) return ''
      const lowered = value.toLowerCase()
      if (lowered.includes('javascript:') || lowered.includes('expression(') || lowered.includes('url(') || lowered.includes('<') || lowered.includes('>')) return ''
      if (name === 'font-size' && !/^\d{1,3}(px|rem|em|%)$/.test(value)) return ''
      if ((name === 'color' || name === 'background-color') && !/^#[0-9a-f]{3,8}$/i.test(value) && !/^rgba?\([0-9\s,%.]+\)$/i.test(value) && !/^[a-z]+$/i.test(value)) return ''
      if (name === 'text-align' && !['left', 'center', 'right', 'justify'].includes(lowered)) return ''
      return `${name}: ${value}`
    })
    .filter(Boolean)
    .join('; ')
}

function sanitizeRichHtml(html) {
  const input = String(html || '')
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return input.replace(/<\/?script[^>]*>/gi, '').replace(/on\w+\s*=\s*(['"]).*?\1/gi, '')
  }
  const allowedTags = new Set(['H1', 'H2', 'H3', 'H4', 'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'A', 'SPAN', 'DIV', 'BLOCKQUOTE', 'HR', 'IMG', 'FONT'])
  const allowedAttrs = new Set(['href', 'target', 'rel', 'style', 'class', 'src', 'alt', 'title', 'color', 'size'])
  const template = document.createElement('template')
  template.innerHTML = input
  const nodes = Array.from(template.content.querySelectorAll('*'))
  nodes.forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      const text = document.createTextNode(node.textContent || '')
      node.replaceWith(text)
      return
    }
    Array.from(node.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase()
      const value = attr.value || ''
      if (name.startsWith('on') || !allowedAttrs.has(name)) {
        node.removeAttribute(attr.name)
        return
      }
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(value)) {
        node.removeAttribute(attr.name)
        return
      }
      if (name === 'href' && value && !/^(https?:|mailto:|\/|#)/i.test(value)) {
        node.removeAttribute(attr.name)
        return
      }
      if (name === 'src' && value && !/^(https?:|data:image\/|\/)/i.test(value)) {
        node.removeAttribute(attr.name)
        return
      }
      if (name === 'style') {
        const cleanStyle = sanitizeRichStyle(value)
        if (cleanStyle) node.setAttribute('style', cleanStyle)
        else node.removeAttribute('style')
      }
    })
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy')
      node.setAttribute('alt', node.getAttribute('alt') || 'About Us image')
    }
  })
  return template.innerHTML.trim()
}

function normalizeAboutUsPage(page = {}) {
  const next = { ...defaultAboutUsPage, ...(page || {}) }
  next.page_key = ABOUT_US_PAGE_KEY
  next.title = String(next.title || defaultAboutUsPage.title).trim() || defaultAboutUsPage.title
  next.subtitle = String(next.subtitle || '')
  next.content_html = sanitizeRichHtml(next.content_html || defaultAboutUsPage.content_html)
  next.content_json = next.content_json && typeof next.content_json === 'object' ? next.content_json : {}
  next.image_url = sanitizeSettingImageUrl(next.image_url || next.content_json?.image_url || '')
  next.is_published = next.is_published !== false
  return next
}

function loadAboutUsPageLocal() {
  try {
    const saved = localStorage.getItem('pharmatrack-about-us-page')
    return saved ? normalizeAboutUsPage(JSON.parse(saved)) : defaultAboutUsPage
  } catch {
    return defaultAboutUsPage
  }
}

function saveAboutUsPageLocal(page) {
  try {
    localStorage.setItem('pharmatrack-about-us-page', JSON.stringify(normalizeAboutUsPage(page)))
  } catch {
    // Local preview cache is optional.
  }
}

const PDF_REPORT_SETTINGS_KEY = 'pdf_report'
const PDF_REPORT_ROLE_KEYS = {
  student: 'pdf_report_customization_student',
  supervisor: 'pdf_report_customization_supervisor',
  admin: 'pdf_report_customization_admin',
  committee: 'pdf_report_customization_research_committee',
}

const pdfReportRoleOptions = [
  { value: 'student', label: 'Student' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Admin' },
  { value: 'committee', label: 'Research Committee' },
]

function normalizePdfReportRole(role) {
  const value = String(role || 'student').toLowerCase().replace(/[\s-]+/g, '_')
  if (['research_committee', 'committee', 'researchcommittee'].includes(value)) return 'committee'
  if (['admin', 'administrator'].includes(value)) return 'admin'
  if (['supervisor', 'advisor'].includes(value)) return 'supervisor'
  return 'student'
}

function getPdfReportRoleLabel(role) {
  const normalized = normalizePdfReportRole(role)
  return pdfReportRoleOptions.find((item) => item.value === normalized)?.label || 'Student'
}

function getPdfReportSettingsKey(role) {
  return PDF_REPORT_ROLE_KEYS[normalizePdfReportRole(role)] || PDF_REPORT_ROLE_KEYS.student
}

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
  showLogo: true,
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

function loadPdfReportSettingsForRole(role, fallback = defaultPdfReportSettings) {
  try {
    const normalizedRole = normalizePdfReportRole(role)
    const saved = localStorage.getItem(`pharmatrack-pdf-report-settings-${normalizedRole}`)
    return saved ? normalizePdfReportSettings(JSON.parse(saved)) : normalizePdfReportSettings(fallback)
  } catch {
    return normalizePdfReportSettings(fallback)
  }
}

function savePdfReportSettingsForRoleLocal(role, settings) {
  const normalizedRole = normalizePdfReportRole(role)
  localStorage.setItem(`pharmatrack-pdf-report-settings-${normalizedRole}`, JSON.stringify(normalizePdfReportSettings(settings)))
}

function loadPdfReportSettingsByRole() {
  const globalSettings = loadPdfReportSettings()
  return Object.fromEntries(pdfReportRoleOptions.map(({ value }) => [value, loadPdfReportSettingsForRole(value, globalSettings)]))
}

function getPdfReportSettingsForRole(role, roleSettings = {}, globalSettings = defaultPdfReportSettings) {
  const normalizedRole = normalizePdfReportRole(role)
  return normalizePdfReportSettings(roleSettings?.[normalizedRole] || globalSettings || defaultPdfReportSettings)
}

function normalizeSettings(settings) {
  const rawSettings = parseJsonObject(settings)
  const next = { ...defaultWebsiteSettings, ...rawSettings }
  const savedButtonColors = rawSettings.button_colors
    ?? rawSettings.buttonColors
    ?? rawSettings.button_theme
    ?? rawSettings.buttonTheme
    ?? defaultWebsiteSettings.button_colors
  const parsedButtonColors = parseJsonObject(savedButtonColors)
  const buttonColorSource = parseJsonObject(
    parsedButtonColors.button_colors
      ?? parsedButtonColors.buttonColors
      ?? parsedButtonColors.button_theme
      ?? parsedButtonColors.buttonTheme
      ?? parsedButtonColors
  )
  const legacySidebarColors = parseJsonObject(
    buttonColorSource.sidebar
      ?? buttonColorSource.sidebarButtons
      ?? buttonColorSource.sidebar_buttons
      ?? {}
  )
  const savedInterfaceColors = rawSettings.interface_colors
    ?? rawSettings.interfaceColors
    ?? rawSettings.interface_theme
    ?? rawSettings.interfaceTheme
    ?? {}

  next.button_colors = normalizeButtonColors(savedButtonColors)
  next.interface_colors = normalizeInterfaceColors(savedInterfaceColors, legacySidebarColors)
  delete next.buttonColors
  delete next.button_theme
  delete next.buttonTheme
  delete next.interfaceColors
  delete next.interface_theme
  delete next.interfaceTheme
  next.roleHeroes = normalizeRoleHeroSettings(next.roleHeroes, next)
  return next
}

function loadWebsiteSettings() {
  try {
    const saved = localStorage.getItem('pharmatrack-website-settings')
    const settings = saved ? normalizeSettings(saved) : normalizeSettings(defaultWebsiteSettings)
    applyButtonTheme(settings.button_colors)
    applyInterfaceTheme(settings.interface_colors)
    return settings
  } catch {
    const settings = normalizeSettings(defaultWebsiteSettings)
    applyButtonTheme(settings.button_colors)
    applyInterfaceTheme(settings.interface_colors)
    return settings
  }
}

function saveWebsiteSettingsLocal(settings) {
  localStorage.setItem('pharmatrack-website-settings', JSON.stringify(normalizeSettings(settings)))
}



function sanitizeSettingImageUrl(value) {
  const raw = String(value || '').trim()
  if (!raw || raw === 'none') return ''
  if (raw.startsWith('url(')) {
    return raw.replace(/^url\((.*)\)$/i, '$1').trim().replace(/^['"]|['"]$/g, '')
  }
  return raw
}

function versionedAssetUrl(value, version) {
  const raw = sanitizeSettingImageUrl(value)
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return raw
  if (raw.startsWith('/')) return raw
  const stamp = String(version || '').trim()
  if (!stamp) return raw
  const separator = raw.includes('?') ? '&' : '?'
  return `${raw}${separator}v=${encodeURIComponent(stamp)}`
}

function cssImageUrl(value, version) {
  const raw = versionedAssetUrl(value, version)
  if (!raw) return 'none'
  return `url("${raw.replace(/"/g, '%22')}")`
}

function settingImageUrl(value, fallback = '/hero-page.png', version = '') {
  const raw = versionedAssetUrl(value, version)
  return raw || fallback
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

const adminPanelTabs = ['overview', 'branding', 'button-colors', 'login-settings', 'about-us', 'users', 'supervisors', 'dual-roles', 'invitations', 'deadlines', 'notifications', 'reports', 'pdf-report', 'group-requests', 'database', 'audit', 'profile-settings']

const adminPanelPathAliases = {
  '': 'overview',
  admin: 'overview',
  overview: 'overview',
  dashboard: 'overview',
  branding: 'branding',
  settings: 'branding',
  website: 'branding',
  'website-settings': 'branding',
  buttons: 'button-colors',
  'button-colors': 'button-colors',
  'button-color-customization': 'button-colors',
  login: 'login-settings',
  'login-settings': 'login-settings',
  'about-us': 'about-us',
  about: 'about-us',
  'about-us-customization': 'about-us',
  'about-customization': 'about-us',
  'research-guidelines': 'overview',
  guidelines: 'overview',
  'graduation-research-guidelines': 'overview',
  users: 'users',
  roles: 'users',
  'users-roles': 'users',
  'users-and-roles': 'users',
  supervisors: 'supervisors',
  'supervisor-management': 'supervisors',
  'student-supervisor-assignment': 'supervisors',
  'project-supervisor-assignment': 'supervisors',
  'project-leader-assignment': 'supervisors',
  'dual-roles': 'dual-roles',
  'dual-role-management': 'dual-roles',
  'committee-supervisor-access': 'dual-roles',
  'committee-supervisor-management': 'dual-roles',
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
  'group-requests': 'group-requests',
  'research-group-requests': 'group-requests',
  'group-join-requests': 'group-requests',
  database: 'database',
  audit: 'audit',
  'audit-log': 'audit',
  profile: 'profile-settings',
  'profile-settings': 'profile-settings',
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


function getInitialMainTab() {
  if (typeof window === 'undefined') return 'dashboard'
  const params = new URLSearchParams(window.location.search)
  const queryTab = params.get('tab')
  const aliases = {
    dashboard: 'dashboard',
    'research-workspace': 'research-workspace',
    workspace: 'research-workspace',
    'my-research': 'research-workspace',
    'project-progress': 'research-workspace',
    'weekly-reports': 'research-workspace',
    'supervisor-feedback': 'research-workspace',
    deadlines: 'research-workspace',
    'project-management': 'project-management',
    projects: 'project-management',
    questions: 'questions',
    'meeting-requests': 'meetings',
    meetings: 'meetings',
    'join-research-group': 'join-group',
    'join-group': 'join-group',
    'research-groups': 'groups',
    groups: 'groups',
    'group-join-requests': 'group-requests',
    'group-requests': 'group-requests',
    reports: 'reports',
    'pdf-reports': 'reports',
    'print-pdf-reports': 'reports',
    database: 'database',
    audit: 'audit',
    'audit-log': 'audit',
    about: 'about-us',
    'about-us': 'about-us',
    profile: 'profile-settings',
    'profile-settings': 'profile-settings',
  }
  if (aliases[queryTab]) return aliases[queryTab]
  const hashTab = String(window.location.hash || '').replace('#', '').trim().toLowerCase()
  if (aliases[hashTab]) return aliases[hashTab]
  const parts = window.location.pathname.split('/').map((part) => part.trim().toLowerCase()).filter(Boolean)
  const lastPart = parts[parts.length - 1] || ''
  return aliases[lastPart] || 'dashboard'
}

function getRoleRouteSegment(role = 'student') {
  if (role === 'committee') return 'committee'
  if (role === 'supervisor') return 'supervisor'
  if (role === 'admin') return 'admin'
  return 'student'
}

function getAuthenticatedTabPath(tabId = 'dashboard', role = 'student') {
  const base = getRoleRouteSegment(role)
  const paths = {
    dashboard: `/${base}/dashboard`,
    'research-workspace': `/${base}/research-workspace`,
    'project-management': '/supervisor/project-management',
    questions: `/${base}/questions`,
    meetings: `/${base}/meeting-requests`,
    'join-group': '/student/join-research-group',
    groups: '/supervisor/research-groups',
    'group-requests': `/${base}/group-join-requests`,
    database: '/admin/database',
    audit: '/admin/audit-log',
    reports: `/${base}/pdf-reports`,
    'about-us': '/about',
    'profile-settings': `/${base}/profile`,
  }
  return paths[tabId] || `/${base}/dashboard`
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
  studentQuestions: [],
  groupJoinRequests: [],
  groupMembers: [],
  meetingRequests: [],
}

const sampleNames = ['Aveen Mohammed', 'Hemn Karim', 'Dr. Lara Ahmed', 'Dr. Rebaz Hassan', 'College Admin']
const sampleEmails = ['aveen@hmu.edu.krd', 'hemn@hmu.edu.krd', 'lara.ahmed@hmu.edu.krd', 'rebaz.hassan@hmu.edu.krd', 'admin.pharmacy@hmu.edu.krd']

function cleanData(data) {
  const cleaned = { ...emptyData, ...data }
  cleaned.profiles = (cleaned.profiles || []).filter(
    (u) => !sampleNames.includes(u.full_name) && !sampleEmails.includes(u.email)
  )
  cleaned.reports = cleaned.reports || []
  cleaned.groupMembers = cleaned.groupMembers || []
  cleaned.projects = enrichProjectsWithGroupMembers(cleaned.projects || [], cleaned.profiles || [], cleaned.groupMembers || []).map((project) => ({
    ...project,
    progress: getProjectProgress(project, cleaned.reports),
  }))
  cleaned.uploadedFiles = cleaned.uploadedFiles || []
  cleaned.deadlines = cleaned.deadlines || []
  cleaned.notifications = cleaned.notifications || []
  cleaned.evaluations = cleaned.evaluations || []
  cleaned.auditLogs = cleaned.auditLogs || []
  cleaned.invitations = cleaned.invitations || []
  cleaned.studentQuestions = cleaned.studentQuestions || []
  cleaned.groupJoinRequests = cleaned.groupJoinRequests || []
  cleaned.meetingRequests = cleaned.meetingRequests || []
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

function updateStoredCurrentUser(user) {
  if (!user) return
  try {
    const saved = localStorage.getItem('pharmatrack-current-user')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed?.expires_at) {
        localStorage.setItem('pharmatrack-current-user', JSON.stringify({ ...parsed, user }))
        return
      }
      localStorage.setItem('pharmatrack-current-user', JSON.stringify(user))
      return
    }
  } catch (_error) {
    localStorage.removeItem('pharmatrack-current-user')
  }
  sessionStorage.setItem('pharmatrack-current-user-session', JSON.stringify(user))
}

function getProfilePhotoUrl(user = {}) {
  return user.profile_photo_url || user.avatar_url || user.photo_url || ''
}

function getProfileDisplayName(user = {}) {
  return user.display_name || user.full_name || user.email || 'User'
}

function normalizeProfileUpdateFields(updates = {}) {
  const allowed = ['full_name', 'display_name', 'phone_number', 'department', 'program', 'profile_photo_url', 'profile_photo_path']
  return allowed.reduce((result, key) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) result[key] = updates[key]
    return result
  }, {})
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function uniqueTextList(values = []) {
  const seen = new Set()
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeText(value)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function getProjectStudents(project) {
  const baseStudents = Array.isArray(project?.students)
    ? project.students
    : typeof project?.students === 'string'
      ? project.students.split(',').map((name) => name.trim()).filter(Boolean)
      : []
  return uniqueTextList([
    ...baseStudents,
    ...listValue(project?.member_names),
    ...listValue(project?.member_emails),
  ])
}

function getResearchGroupMemberRecords(groupMembers = [], project = {}) {
  if (!project) return []
  const projectIds = [project.id, project.group_id, project.project_id, project.research_project_id].map((value) => String(value || '')).filter(Boolean)
  const projectNames = [project.group_name, project.title].map(normalizeText).filter(Boolean)
  return (groupMembers || []).filter((member) => {
    if (member.status && normalizeText(member.status) !== 'active') return false
    const memberIds = [member.group_id, member.project_id, member.research_project_id, member.requested_group_id].map((value) => String(value || '')).filter(Boolean)
    const memberNames = [member.group_name, member.project_name, member.research_group_name].map(normalizeText).filter(Boolean)
    return memberIds.some((id) => projectIds.includes(id)) || memberNames.some((name) => projectNames.includes(name))
  })
}

function getResearchGroupMemberProfiles(data = {}, project = {}) {
  const profiles = data.profiles || []
  const records = getResearchGroupMemberRecords(data.groupMembers || [], project)
  const profileMap = new Map()

  records.forEach((member) => {
    const matched = profiles.find((profile) =>
      (!!member.student_id && String(profile.id) === String(member.student_id)) ||
      (!!member.student_email && normalizeText(profile.email) === normalizeText(member.student_email)) ||
      (!!member.student_name && normalizeText(profile.full_name) === normalizeText(member.student_name))
    )
    // Research supervisors may be stored as created_by/supervisor fields on projects.
    // Never render a supervisor as a student project member.
    if (matched?.role && normalizeMeetingRole(matched.role) !== 'student') return
    const memberRole = normalizeText(member.member_role || member.project_role || member.role)
    const profile = matched || {
      id: member.student_id || null,
      full_name: member.student_name || member.student_email || 'Student',
      email: member.student_email || '',
      role: 'student',
    }
    const key = profile.id || normalizeText(profile.email) || normalizeText(profile.full_name)
    if (!key) return
    const isLeader = memberRole === 'project_leader' || memberRole === 'research_project_leader'
    const existing = profileMap.get(key) || {}
    profileMap.set(key, {
      ...existing,
      ...profile,
      memberRole: isLeader ? 'project_leader' : (existing.memberRole || 'member'),
      roleStatus: isLeader ? 'Project Leader' : (existing.roleStatus || 'Member'),
      joined_at: existing.joined_at || member.joined_at || member.created_at || '',
      membership_status: member.status || existing.membership_status || 'Active',
    })
  })

  return Array.from(profileMap.values()).filter((profile) => !profile.role || normalizeMeetingRole(profile.role) === 'student')
}

function getResearchGroupMemberLabels(data = {}, project = {}) {
  return getResearchGroupMemberProfiles(data, project).flatMap((profile) => [profile.full_name, profile.email]).filter(Boolean)
}

function memberRecordMatchesStudent(member = {}, student = {}) {
  if (!member || !student) return false
  const studentId = normalizeText(student.id)
  const studentEmail = normalizeText(student.email)
  const studentName = normalizeText(student.full_name || student.name)
  return (
    (!!studentId && normalizeText(member.student_id) === studentId) ||
    (!!studentEmail && normalizeText(member.student_email) === studentEmail) ||
    (!!studentName && normalizeText(member.student_name) === studentName)
  )
}

function getStudentMembershipRecords(data = {}, student = {}) {
  return (data.groupMembers || []).filter((member) => {
    if (member.status && normalizeText(member.status) !== 'active') return false
    return memberRecordMatchesStudent(member, student)
  })
}

function getProjectByMembershipRecord(data = {}, member = {}) {
  if (!member) return null
  const memberIds = [member.group_id, member.project_id, member.research_project_id, member.requested_group_id]
    .map((value) => String(value || ''))
    .filter(Boolean)
  const project = (data.projects || []).find((item) => memberIds.includes(String(item.id)))
  if (project) return project
  const memberNames = [member.group_name, member.project_name, member.research_group_name, member.requested_group_name]
    .map(normalizeText)
    .filter(Boolean)
  return (data.projects || []).find((item) => [item.group_name, item.title].map(normalizeText).some((name) => memberNames.includes(name))) || null
}

function getProjectContext(data = {}, project = null) {
  const group = project ? ((data.projects || []).find((item) => String(item.id) === String(project.id)) || project) : null
  const reports = group ? getReportsForProject(data, group) : []
  const members = group ? getProjectMemberProfiles(data, group, reports) : []
  const supervisor = group ? findSupervisorProfileForProject(data, group) : null
  const deadlines = group ? getDeadlinesForProject(data.deadlines || [], group, members) : []
  const evaluations = group ? (data.evaluations || []).filter((evaluation) => String(evaluation.project_id) === String(group.id)) : []
  return { group, project: group, reports, members, supervisor, deadlines, evaluations, progress: group ? getProjectProgress(group, data.reports || []) : 0 }
}

function getStudentProjectContext(data = {}, student = {}) {
  const profile = findProfileForUser(data, student) || student || {}
  const group = getStudentCurrentResearchGroup(data, profile)
  if (!group) return { student: profile, group: null, project: null, supervisor: null, members: [], progress: 0, deadlines: [], reports: [], evaluations: [] }
  return { student: profile, ...getProjectContext(data, group) }
}

function getSupervisorProjectStudents(data = {}, supervisor = {}) {
  const projects = (data.projects || []).filter((project) => isAssignedSupervisorProject(project, supervisor))
  return getAssignedSupervisorStudents(data, projects, data.reports || [])
}

function getProjectMemberProfiles(data = {}, project = {}, reports = []) {
  const members = new Map()
  const addMember = (profile = {}, fallback = {}) => {
    if (profile.role && profile.role !== 'student') return
    const name = profile.full_name || profile.name || fallback.name || fallback.full_name || fallback.email || 'Student'
    const email = profile.email || fallback.email || ''
    const id = profile.id || fallback.id || null
    const roleStatus = fallback.roleStatus || profile.roleStatus || profile.member_status || profile.status || 'Member'
    const key = id || normalizeText(email) || normalizeText(name)
    if (!key) return
    const existing = members.get(key) || {}
    members.set(key, {
      ...existing,
      ...profile,
      id: existing.id || id,
      full_name: existing.full_name || name,
      email: existing.email || email,
      role: 'student',
      roleStatus: existing.roleStatus === 'Project Leader' ? existing.roleStatus : roleStatus,
      joined_at: existing.joined_at || profile.joined_at || fallback.joined_at || '',
      membership_status: existing.membership_status || profile.membership_status || fallback.membership_status || 'Active',
    })
  }

  ;(project.member_profiles || []).forEach((profile) => addMember(profile, { roleStatus: profile.roleStatus || 'Member' }))
  getResearchGroupMemberProfiles(data, project).forEach((profile) => addMember(profile, { roleStatus: profile.roleStatus || 'Member', joined_at: profile.joined_at, membership_status: profile.membership_status }))

  const explicitStudent = findProfileByIdentity(data, {
    id: project.student_id || project.created_by || project.owner_id,
    email: project.student_email || project.created_by_email || project.owner_email,
    name: project.student_name || project.submitted_by,
  })
  if ((explicitStudent?.role === 'student') || project.student_email || project.student_name) {
    addMember(explicitStudent || {}, {
      id: project.student_id || null,
      email: project.student_email || '',
      name: project.student_name || project.submitted_by || 'Student',
      roleStatus: 'Member',
    })
  }

  getProjectStudents(project).forEach((studentName) => {
    const matchedProfile = (data.profiles || []).find((profile) =>
      profile.role === 'student' && (normalizeText(profile.full_name) === normalizeText(studentName) || normalizeText(profile.email) === normalizeText(studentName))
    )
    addMember(matchedProfile || {}, {
      name: matchedProfile?.full_name || studentName,
      email: matchedProfile?.email || (String(studentName || '').includes('@') ? studentName : ''),
      roleStatus: 'Member',
    })
  })

  getReportsForProject(reports || [], project).forEach((report) => {
    const student = findStudentProfileForReport(data, report)
    addMember(student || {}, {
      id: report.student_id || report.submitted_by_id || report.user_id || report.created_by || null,
      email: report.student_email || report.submitted_by_email || report.created_by_email || '',
      name: report.submitted_by || student?.full_name || 'Student',
      roleStatus: 'Report submitter',
    })
  })

  return Array.from(members.values())
    .filter((member) => member.full_name || member.email)
    .sort((a, b) => String(a.full_name || a.email || '').localeCompare(String(b.full_name || b.email || '')))
}

function ProjectMembersCompact({ members = [], emptyText = 'No project members found.' }) {
  const visibleMembers = (members || []).filter(Boolean)
  return (
    <div className="project-members-compact">
      <p className="project-members-title"><Users size={14} /> Project members</p>
      {visibleMembers.length ? (
        <div className="project-member-chips">
          {visibleMembers.map((member, index) => {
            const isLeader = normalizeText(member.roleStatus || member.memberRole) === 'project leader' || normalizeText(member.memberRole) === 'project_leader'
            return (
              <span className={`project-member-chip ${isLeader ? 'leader' : ''}`} key={member.id || member.email || member.full_name || index}>
                <b>{member.full_name || member.name || member.email || 'Student'}</b>
                {isLeader && <small className="project-leader-badge">Project Leader</small>}
              </span>
            )
          })}
        </div>
      ) : <p className="muted small project-members-empty">{emptyText}</p>}
    </div>
  )
}

function enrichProjectsWithGroupMembers(projects = [], profiles = [], groupMembers = []) {
  const data = { profiles, groupMembers }
  return (projects || []).map((project) => {
    const memberProfiles = getProjectMembersWithoutSupervisor(data, project, [])
    const memberNames = uniqueTextList(memberProfiles.map((profile) => profile.full_name).filter(Boolean))
    const memberEmails = uniqueTextList(memberProfiles.map((profile) => profile.email).filter(Boolean))
    const students = uniqueTextList([
      ...getProjectStudents(project),
      ...memberNames,
      ...memberEmails,
    ])
    return { ...project, students, member_names: memberNames, member_emails: memberEmails, member_profiles: memberProfiles }
  })
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
  if (user?.current_research_group_id && String(user.current_research_group_id) === String(project.id)) return true
  if (user?.research_group_id && String(user.research_group_id) === String(project.id)) return true
  if (user?.group_id && String(user.group_id) === String(project.id)) return true
  if (userName && students.includes(userName)) return true
  if (userEmail && students.includes(userEmail)) return true

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

function getVisibleProjects(projects, role, user, data = null) {
  if (role === 'admin' || role === 'committee') return projects
  if (role === 'supervisor') return projects.filter((project) => isAssignedSupervisorProject(project, user))
  if (role === 'student') {
    const profile = data ? (findProfileForUser(data, user) || user) : user
    const currentGroup = data ? getStudentCurrentResearchGroup(data, user) : null
    return projects.filter((project) =>
      (!!currentGroup?.id && String(project.id) === String(currentGroup.id)) ||
      (isOwnStudentProject(project, profile || user) && isApprovedResearchProject(project))
    )
  }
  return []
}

function getVisibleReports(reports, visibleProjects, role, user) {
  if (role === 'admin' || role === 'committee') return reports
  if (role === 'student' || role === 'supervisor') {
    return (reports || []).filter((report) => (visibleProjects || []).some((project) => reportLinkedToProject(report, project)))
  }
  return []
}

function isAdminUser(user) {
  return user?.role === 'admin'
}

function isResearchCommitteeUser(user) {
  return user?.role === 'committee'
}

function hasCommitteeSupervisorAccess(user) {
  if (!user || user.role !== 'committee') return false
  if (user.can_act_as_supervisor === true) return true
  if (String(user.can_act_as_supervisor || '').toLowerCase() === 'true') return true
  const secondaryRoles = listValue(user.secondary_roles).map((role) => normalizeText(role))
  return secondaryRoles.includes('supervisor') || secondaryRoles.includes('supervisor access')
}

function getActiveRoleLabel(baseRole, activeRole) {
  if (baseRole === 'admin') {
    return ({ admin: 'Admin', student: 'Student', supervisor: 'Supervisor', committee: 'Research Committee' }[activeRole]) || 'Admin'
  }
  if (baseRole === 'committee' && activeRole === 'supervisor') return 'Supervisor'
  if (baseRole === 'committee') return 'Research Committee'
  return ({ student: 'BSc Student', supervisor: 'Supervisor', admin: 'Admin', committee: 'Research Committee' }[activeRole]) || 'User'
}

function canManageAllGroupMemberships(user) {
  return isAdminUser(user) || isResearchCommitteeUser(user)
}

function normalizeProjectDecisionValue(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '')
}

function getProjectDecisionKey(project = {}) {
  const approvalKey = normalizeProjectDecisionValue(project.approval || project.approval_status || project.committee_status)
  if (['approved', 'accepted'].includes(approvalKey)) return 'accepted'
  if (approvalKey === 'rejected') return 'rejected'
  if (['revisionrequired', 'revisionrequested', 'needsrevision'].includes(approvalKey)) return 'revision'

  const statusKey = normalizeProjectDecisionValue(project.status)
  if (statusKey === 'rejected') return 'rejected'
  if (['needsattention', 'revisionrequired', 'revisionrequested', 'needsrevision'].includes(statusKey)) return 'revision'
  if (statusKey === 'ongoing' && ['approved', 'accepted'].includes(approvalKey)) return 'accepted'
  return 'pending'
}

function isProjectCommitteeDecided(project = {}) {
  return ['accepted', 'revision', 'rejected'].includes(getProjectDecisionKey(project))
}

function getProjectDecisionLabel(project = {}) {
  const key = getProjectDecisionKey(project)
  if (key === 'accepted') return 'Accepted'
  if (key === 'revision') return 'Revision Requested'
  if (key === 'rejected') return 'Rejected'
  return 'Pending Committee Review'
}

function getProjectDecisionTone(project = {}) {
  const key = getProjectDecisionKey(project)
  if (key === 'accepted') return 'green'
  if (key === 'revision') return 'amber'
  if (key === 'rejected') return 'red'
  return 'amber'
}

function normalizeReviewDecisionKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '')
}

function isFinalWeeklyReportDecision(reportOrStatus = {}) {
  const status = typeof reportOrStatus === 'string' ? reportOrStatus : reportOrStatus?.status
  const key = normalizeReviewDecisionKey(status)
  return ['accepted', 'rejected', 'revisionrequired', 'revisionrequested', 'needsrevision'].includes(key)
}

function getWeeklyReportDecisionTone(status) {
  const key = normalizeReviewDecisionKey(status)
  if (key === 'accepted') return 'green'
  if (key === 'rejected') return 'red'
  if (['revisionrequired', 'revisionrequested', 'needsrevision'].includes(key)) return 'amber'
  return 'amber'
}

function isApprovedResearchProject(project = {}) {
  const approval = normalizeText(project.approval || project.approval_status || project.committee_status || project.status)
  return ['approved', 'accepted'].includes(approval) || normalizeText(project.status) === 'ongoing'
}

function canSubmitSupervisorProject(user) {
  return Boolean(user && ['supervisor', 'admin', 'committee'].includes(user.role))
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
  const studentProfiles = (data.profiles || []).filter((profile) => normalizeMeetingRole(profile.role) === 'student')

  assignedProjectList.forEach((project) => {
    getResearchGroupMemberProfiles(data, project).forEach((memberProfile) => {
      upsertStudentOption(students, memberProfile, {
        id: memberProfile.id || null,
        email: memberProfile.email || '',
        name: memberProfile.full_name || memberProfile.email || 'Student',
        group: project.group_name || project.title || 'Research group',
      })
    })

    const explicitStudent = findProfileByIdentity(data, {
      id: project.student_id || project.created_by,
      email: project.student_email || project.created_by_email,
      submitted_by: project.student_name,
    })
    if (normalizeMeetingRole(explicitStudent?.role) === 'student' || project.student_id || project.student_email || project.student_name) {
      upsertStudentOption(students, explicitStudent || {}, {
        id: project.student_id || null,
        email: project.student_email || '',
        name: explicitStudent?.full_name || project.student_name || 'Student',
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

function isStudentAssignedToSupervisorProfile(student = {}, supervisor = {}) {
  if (!student || !supervisor) return false
  const studentSupervisorIds = [student.assigned_supervisor_id, student.supervisor_id, student.supervisor_user_id, student.assigned_to_id]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  const supervisorIds = [supervisor.id, supervisor.user_id, supervisor.profile_id, supervisor.supervisor_id]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  const studentSupervisorEmails = [student.assigned_supervisor_email, student.supervisor_email, student.assigned_to_email]
    .map(normalizeText)
    .filter(Boolean)
  const supervisorEmails = [supervisor.email, supervisor.user_email, supervisor.supervisor_email]
    .map(normalizeText)
    .filter(Boolean)
  const studentSupervisorNames = [student.assigned_supervisor_name, student.supervisor_name, student.supervisor, student.assigned_supervisor, student.assigned_to_name]
    .map(normalizeText)
    .filter(Boolean)
  const supervisorNames = [supervisor.full_name, supervisor.name, supervisor.display_name, supervisor.supervisor_name, supervisor.assigned_supervisor_name]
    .map(normalizeText)
    .filter(Boolean)

  return (
    studentSupervisorIds.some((id) => supervisorIds.includes(id)) ||
    studentSupervisorEmails.some((email) => supervisorEmails.includes(email)) ||
    studentSupervisorNames.some((name) => supervisorNames.includes(name))
  )
}

function getDirectAssignedStudentsForSupervisor(data = {}, supervisor = {}) {
  const students = new Map()
  ;(data.profiles || [])
    .filter((profile) => normalizeMeetingRole(profile.role) === 'student' && isStudentAssignedToSupervisorProfile(profile, supervisor))
    .forEach((student) => {
      upsertStudentOption(students, student, {
        id: student.id || null,
        email: student.email || '',
        name: student.full_name || student.email || 'Student',
        group: student.research_group || student.group_name || student.department || student.program || 'Assigned student',
      })
    })
  return Array.from(students.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function mergeStudentOptions(...groups) {
  const students = new Map()
  groups.flat().filter(Boolean).forEach((student) => upsertStudentOption(students, student, student))
  return Array.from(students.values()).sort((a, b) => a.name.localeCompare(b.name))
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
  const studentId = normalizeText(student.id)
  const studentEmail = normalizeText(student.email)
  const studentName = normalizeText(student.name || student.full_name)
  const projectStudentLabels = getProjectStudents(project).map(normalizeText)
  if ((studentEmail && projectStudentLabels.includes(studentEmail)) || (studentName && projectStudentLabels.includes(studentName))) return true
  if (studentId && [project.student_id, project.created_by, project.owner_id].map(normalizeText).includes(studentId)) return true
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

function getDeadlineProjectIds(deadline = {}) {
  return [deadline.project_id, deadline.research_project_id, deadline.target_project_id, deadline.group_id, deadline.research_group_id]
    .map((value) => String(value || ''))
    .filter(Boolean)
}

function deadlineLinkedToProject(deadline = {}, project = {}) {
  if (!deadline || !project) return false
  const ids = getDeadlineProjectIds(deadline)
  if (ids.includes(String(project.id))) return true
  const deadlineGroupText = normalizeText(deadline.group_name || deadline.research_group_name || deadline.project_name || deadline.project_title)
  return !!deadlineGroupText && [project.group_name, project.title].map(normalizeText).includes(deadlineGroupText)
}

function getDeadlinesForProject(deadlines = [], project = {}, members = []) {
  return (deadlines || []).filter((deadline) => {
    if (deadlineLinkedToProject(deadline, project)) return true
    if (!getDeadlineProjectIds(deadline).length && !hasDeadlineTargets(deadline)) return true
    return (members || []).some((member) => deadlineTargetsStudent(deadline, { id: member.id, email: member.email, full_name: member.full_name || member.name }))
  })
}

function deadlineVisibleToUser(deadline, role, user, data = {}) {
  if (!deadline || !user) return false
  if (role === 'admin' || role === 'committee') return true
  if (role === 'student') {
    const context = getStudentProjectContext(data, user)
    if (hasDeadlineTargets(deadline)) return deadlineTargetsStudent(deadline, context.student || user)
    if (context.project && deadlineLinkedToProject(deadline, context.project)) return true
    return !getDeadlineProjectIds(deadline).length
  }
  if (role === 'supervisor') {
    const userId = normalizeText(user.id)
    const userEmail = normalizeText(user.email)
    const supervisedProjects = (data.projects || []).filter((project) => isAssignedSupervisorProject(project, user))
    return (
      (!!userId && normalizeText(deadline.created_by) === userId) ||
      (!!userId && normalizeText(deadline.supervisor_id) === userId) ||
      (!!userEmail && normalizeText(deadline.created_by_email) === userEmail) ||
      (!!userEmail && normalizeText(deadline.supervisor_email) === userEmail) ||
      supervisedProjects.some((project) => deadlineLinkedToProject(deadline, project)) ||
      (!hasDeadlineTargets(deadline) && !getDeadlineProjectIds(deadline).length)
    )
  }
  return false
}

function getVisibleDeadlines(deadlines = [], role, user, data = {}) {
  return (deadlines || []).filter((deadline) => deadlineVisibleToUser(deadline, role, user, data))
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
  return (data.reports || []).filter((report) => {
    const project = (assignedProjects || []).find((item) => reportLinkedToProject(report, item))
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



function getProjectLeaderProfile(data = {}, project = {}) {
  if (!project) return null
  const leaderId = project.project_leader_id || project.research_project_leader_id || project.leader_id
  const leaderEmail = normalizeText(project.project_leader_email || project.research_project_leader_email || project.leader_email)
  const leaderName = normalizeText(project.project_leader_name || project.research_project_leader_name || project.leader_name)
  const fromFields = findProfileByIdentity(data, {
    id: leaderId,
    email: leaderEmail,
    name: leaderName,
  })
  if (fromFields?.role === 'student') return { ...fromFields, memberRole: 'project_leader', roleStatus: 'Project Leader' }

  const leaderRecord = getResearchGroupMemberRecords(data.groupMembers || [], project).find((member) => {
    if (member.status && normalizeText(member.status) !== 'active') return false
    const role = normalizeText(member.member_role || member.project_role || member.role)
    return role === 'project_leader' || role === 'research_project_leader'
  })
  if (!leaderRecord) return null
  const matched = findProfileByIdentity(data, {
    id: leaderRecord.student_id,
    email: leaderRecord.student_email,
    name: leaderRecord.student_name,
  })
  if (matched?.role && normalizeMeetingRole(matched.role) !== 'student') return null
  return {
    ...(matched || {}),
    id: matched?.id || leaderRecord.student_id || null,
    full_name: matched?.full_name || leaderRecord.student_name || leaderRecord.student_email || 'Project Leader',
    email: matched?.email || leaderRecord.student_email || '',
    role: 'student',
    memberRole: 'project_leader',
    roleStatus: 'Project Leader',
    joined_at: leaderRecord.joined_at || '',
  }
}

function isStudentProjectLeader(data = {}, project = {}, student = {}) {
  if (!project || !student) return false
  const leader = getProjectLeaderProfile(data, project)
  if (!leader) return false
  return (
    (!!student.id && !!leader.id && String(student.id) === String(leader.id)) ||
    (!!student.email && !!leader.email && normalizeText(student.email) === normalizeText(leader.email)) ||
    (!!student.full_name && !!leader.full_name && normalizeText(student.full_name) === normalizeText(leader.full_name))
  )
}


function projectMemberMatchesUser(member = {}, user = {}) {
  if (!member || !user) return false
  return (
    (!!member.id && !!user.id && String(member.id) === String(user.id)) ||
    (!!member.email && !!user.email && normalizeText(member.email) === normalizeText(user.email)) ||
    (!!member.full_name && !!user.full_name && normalizeText(member.full_name) === normalizeText(user.full_name))
  )
}

function getWeeklyReportSubmissionPermission(data = {}, project = {}, student = {}) {
  if (!project || !student) return { canSubmit: false, reason: 'You must join or be assigned to a research project before submitting weekly reports.' }
  const members = getProjectMembersWithoutSupervisor(data, project, data.reports || [])
  const activeMembers = members.filter((member) => !member.membership_status || normalizeText(member.membership_status) === 'active')
  const membershipCount = activeMembers.length
  const currentStudentIsMember = activeMembers.some((member) => projectMemberMatchesUser(member, student)) || isOwnStudentProject(project, student)
  const isLeader = isStudentProjectLeader(data, project, student)

  if (membershipCount <= 1 && currentStudentIsMember) {
    return {
      canSubmit: true,
      reason: 'You are the only student in this project and can submit weekly reports.',
      mode: 'single_student',
    }
  }
  if (membershipCount > 1 && isLeader) {
    return { canSubmit: true, reason: 'You are the project leader for this project.', mode: 'project_leader' }
  }
  if (membershipCount > 1 && !getProjectLeaderProfile(data, project)) {
    return { canSubmit: false, reason: 'A project leader must be assigned before weekly reports can be submitted.' }
  }
  return { canSubmit: false, reason: 'Only the project leader can submit weekly reports for this project.' }
}

function getProjectMembersWithoutSupervisor(data = {}, project = {}, reports = []) {
  const supervisor = findSupervisorProfileForProject(data, project)
  const supervisorKeys = [supervisor?.id, supervisor?.email, supervisor?.full_name, project?.supervisor_id, project?.supervisor_email, project?.supervisor_name]
    .map(normalizeText)
    .filter(Boolean)
  const leader = getProjectLeaderProfile(data, project)
  return getProjectMemberProfiles(data, project, reports).filter((member) => {
    const memberKeys = [member.id, member.email, member.full_name].map(normalizeText).filter(Boolean)
    const isSupervisor = memberKeys.some((key) => supervisorKeys.includes(key)) || member.role === 'supervisor'
    if (isSupervisor) return false
    const isLeader = leader && memberKeys.some((key) => [leader.id, leader.email, leader.full_name].map(normalizeText).includes(key))
    if (isLeader) member.roleStatus = 'Project Leader'
    return true
  })
}

function findAssignedSupervisorForStudent(data, studentUser) {
  if (!studentUser) return null
  const studentProfile = findProfileForUser(data, studentUser) || studentUser
  const directSupervisor = (data.profiles || []).find((profile) =>
    normalizeMeetingRole(profile.role) === 'supervisor' && isStudentAssignedToSupervisorProfile(studentProfile, profile)
  )
  if (directSupervisor) return directSupervisor

  const project = getStudentCurrentResearchGroup(data, studentProfile) || (data.projects || []).find((item) => isOwnStudentProject(item, studentProfile))
  const projectSupervisor = findSupervisorProfileForProject(data, project)
  if (projectSupervisor) return projectSupervisor
  return null
}

function questionOwnedByStudent(question = {}, studentUser = {}) {
  if (!question || !studentUser) return false
  return (
    (!!question.student_id && !!studentUser.id && String(question.student_id) === String(studentUser.id)) ||
    (!!question.student_email && !!studentUser.email && normalizeText(question.student_email) === normalizeText(studentUser.email)) ||
    (!!question.student_name && !!studentUser.full_name && normalizeText(question.student_name) === normalizeText(studentUser.full_name))
  )
}

function supervisorCanAccessQuestion(data, question = {}, supervisorUser = {}) {
  if (!question || !supervisorUser || supervisorUser.role !== 'supervisor') return false
  if (
    (!!question.supervisor_id && !!supervisorUser.id && String(question.supervisor_id) === String(supervisorUser.id)) ||
    (!!question.supervisor_email && !!supervisorUser.email && normalizeText(question.supervisor_email) === normalizeText(supervisorUser.email)) ||
    (!!question.supervisor_name && !!supervisorUser.full_name && normalizeText(question.supervisor_name) === normalizeText(supervisorUser.full_name))
  ) return true

  const student = findProfileByIdentity(data, {
    id: question.student_id,
    email: question.student_email,
    submitted_by: question.student_name,
  })
  return Boolean(student && isStudentAssignedToSupervisorProfile(student, supervisorUser))
}

function questionStudentLabel(data, question = {}) {
  const student = findProfileByIdentity(data, {
    id: question.student_id,
    email: question.student_email,
    submitted_by: question.student_name,
  })
  return {
    name: student?.full_name || question.student_name || question.student_email || 'Student',
    email: student?.email || question.student_email || '',
  }
}

function getSupervisorQuestionStudents(data = {}, supervisorUser = {}, questions = []) {
  const supervisedProjects = (data.projects || []).filter((project) => isAssignedSupervisorProject(project, supervisorUser))
  const students = new Map()
  mergeStudentOptions(getAssignedSupervisorStudents(data, supervisedProjects, data.reports || []), getDirectAssignedStudentsForSupervisor(data, supervisorUser)).forEach((student) => {
    upsertStudentOption(students, student, student)
  })
  ;(questions || []).forEach((question) => {
    const student = questionStudentLabel(data, question)
    upsertStudentOption(students, { id: question.student_id || null, email: student.email || question.student_email || '', name: student.name || question.student_name || 'Student' }, { group: question.group_name || 'Question student' })
  })
  return Array.from(students.values()).filter((student) => student.name || student.email || student.id).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
}

function questionMatchesStudentFilter(question = {}, studentKey = '', data = {}) {
  if (!studentKey || studentKey === 'all') return true
  const student = questionStudentLabel(data, question)
  const candidates = [
    makeStudentOptionKey({ id: question.student_id, email: question.student_email, name: question.student_name }),
    makeStudentOptionKey({ id: question.student_id, email: student.email, name: student.name }),
    `id:${question.student_id || ''}`,
    `email:${normalizeText(question.student_email || student.email || '')}`,
    `name:${normalizeText(question.student_name || student.name || '')}`,
  ]
  return candidates.map(String).includes(String(studentKey))
}


function projectStudentIdentityMatches(project = {}, student = {}) {
  const studentId = normalizeText(student.id)
  const studentEmail = normalizeText(student.email)
  const studentName = normalizeText(student.full_name || student.name)
  const projectStudents = getProjectStudents(project).map(normalizeText)
  return (
    (!!student?.current_research_group_id && String(student.current_research_group_id) === String(project.id)) ||
    (!!student?.research_group_id && String(student.research_group_id) === String(project.id)) ||
    (!!student?.group_id && String(student.group_id) === String(project.id)) ||
    (!!studentId && [project.student_id, project.created_by, project.owner_id].map(normalizeText).includes(studentId)) ||
    (!!studentEmail && [project.student_email, project.created_by_email, project.owner_email].map(normalizeText).includes(studentEmail)) ||
    (!!studentName && (normalizeText(project.student_name) === studentName || normalizeText(project.group_name) === studentName || projectStudents.includes(studentName))) ||
    (!!studentEmail && projectStudents.includes(studentEmail))
  )
}

function getAcceptedJoinRequestProjectIdsForStudent(data = {}, student = {}) {
  return (data.groupJoinRequests || [])
    .filter((request) => requestOwnedByStudent(request, student) && normalizeText(request.status) === 'accepted')
    .flatMap((request) => [request.requested_group_id, request.group_id, request.project_id, request.research_project_id])
    .map((value) => String(value || ''))
    .filter(Boolean)
}

function studentCanViewProject(data = {}, project = {}, student = {}) {
  if (!project || !student) return false
  if (projectStudentIdentityMatches(project, student) || isOwnStudentProject(project, student)) return true

  const membershipProject = getStudentMembershipRecords(data, student)
    .map((member) => getProjectByMembershipRecord(data, member))
    .some((item) => item && String(item.id) === String(project.id))
  if (membershipProject) return true

  const acceptedProjectIds = getAcceptedJoinRequestProjectIdsForStudent(data, student)
  if (acceptedProjectIds.includes(String(project.id))) return true

  const projectIds = getProjectIdentityValues(project)
  const membershipRecord = getStudentMembershipRecords(data, student).some((member) => {
    const memberIds = [member.group_id, member.project_id, member.research_project_id, member.requested_group_id]
      .map((value) => String(value || ''))
      .filter(Boolean)
    if (memberIds.some((id) => projectIds.includes(id))) return true
    const memberNames = [member.group_name, member.project_name, member.research_group_name, member.requested_group_name].map(normalizeText).filter(Boolean)
    const projectNames = [project.group_name, project.title, project.project_name, project.research_group_name].map(normalizeText).filter(Boolean)
    return memberNames.some((name) => projectNames.includes(name))
  })
  return Boolean(membershipRecord)
}

function getStudentVisibleProjects(data = {}, studentUser = {}) {
  const profile = findProfileForUser(data, studentUser) || studentUser || {}
  const seen = new Set()
  return (data.projects || [])
    .filter((project) => isApprovedResearchProject(project) && studentCanViewProject(data, project, profile))
    .filter((project) => {
      const key = String(project.id || `${project.group_name || ''}-${project.title || ''}`)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function getStudentCurrentResearchGroup(data = {}, studentUser = {}) {
  const profile = findProfileForUser(data, studentUser) || studentUser || {}
  const activeMembershipProject = getStudentMembershipRecords(data, profile)
    .map((member) => getProjectByMembershipRecord(data, member))
    .find(Boolean)
  if (activeMembershipProject) return activeMembershipProject
  const profileGroupId = profile.current_research_group_id || profile.research_group_id || profile.group_id
  if (profileGroupId) {
    const project = (data.projects || []).find((item) => String(item.id) === String(profileGroupId))
    return project || { id: profileGroupId, group_name: profile.current_research_group_name || profile.research_group || profile.group_name || 'Research group' }
  }
  if (profile.current_research_group_name || profile.research_group || profile.group_name) {
    const groupName = profile.current_research_group_name || profile.research_group || profile.group_name
    const project = (data.projects || []).find((item) => normalizeText(item.group_name) === normalizeText(groupName))
    return project || { id: null, group_name: groupName }
  }
  const memberProject = (data.projects || []).find((project) => studentCanViewProject(data, project, profile))
  if (memberProject) return memberProject
  const acceptedProjectIds = getAcceptedJoinRequestProjectIdsForStudent(data, profile)
  const acceptedProject = (data.projects || []).find((item) => acceptedProjectIds.includes(String(item.id)))
  if (acceptedProject) return acceptedProject
  return null
}

function getResearchGroupOptions(data = {}, currentUser = null) {
  const seen = new Map()
  ;(data.projects || []).forEach((project) => {
    if (!isApprovedResearchProject(project)) return
    const key = project.id || normalizeText(project.group_name || project.title)
    if (!key || seen.has(String(key))) return
    const supervisor = findSupervisorProfileForProject(data, project)
    seen.set(String(key), {
      id: project.id,
      group_name: project.group_name || project.title || 'Research Group',
      title: project.title || 'Untitled project',
      supervisor_id: project.supervisor_id || supervisor?.id || null,
      supervisor_email: project.supervisor_email || supervisor?.email || '',
      supervisor_name: project.supervisor_name || supervisor?.full_name || 'Pending Assignment',
      area: project.area || '',
      students: getProjectStudents(project),
      raw: project,
    })
  })
  const currentGroup = currentUser ? getStudentCurrentResearchGroup(data, currentUser) : null
  // Students who already belong to a research group should not see or request other groups.
  // The current project/group is shown in the student dashboard instead.
  if (currentUser?.role === 'student' && currentGroup) return []
  return Array.from(seen.values())
    .sort((a, b) => String(a.group_name).localeCompare(String(b.group_name)))
}

function requestMatchesGroup(request = {}, group = {}) {
  return String(request.requested_group_id || '') === String(group.id || '') || normalizeText(request.requested_group_name) === normalizeText(group.group_name)
}

function requestOwnedByStudent(request = {}, studentUser = {}) {
  return (
    (!!request.student_id && !!studentUser.id && String(request.student_id) === String(studentUser.id)) ||
    (!!request.student_email && !!studentUser.email && normalizeText(request.student_email) === normalizeText(studentUser.email))
  )
}

function requestVisibleToSupervisor(data = {}, request = {}, supervisorUser = {}) {
  if (!request || !supervisorUser) return false
  if (request.supervisor_id && supervisorUser.id && String(request.supervisor_id) === String(supervisorUser.id)) return true
  if (request.supervisor_email && supervisorUser.email && normalizeText(request.supervisor_email) === normalizeText(supervisorUser.email)) return true
  const group = (data.projects || []).find((project) => String(project.id) === String(request.requested_group_id))
  return Boolean(group && isAssignedSupervisorProject(group, supervisorUser))
}

function groupJoinRequestLabel(data = {}, request = {}) {
  const group = (data.projects || []).find((project) => String(project.id) === String(request.requested_group_id))
  const student = findProfileByIdentity(data, { id: request.student_id, email: request.student_email, submitted_by: request.student_name })
  const currentGroup = request.current_group_id ? (data.projects || []).find((project) => String(project.id) === String(request.current_group_id)) : null
  return {
    studentName: student?.full_name || request.student_name || request.student_email || 'Student',
    studentEmail: student?.email || request.student_email || '',
    groupName: group?.group_name || request.requested_group_name || 'Research Group',
    projectTitle: group?.title || request.requested_project_title || '',
    supervisorName: group?.supervisor_name || request.supervisor_name || 'Pending Assignment',
    currentSupervisor: student?.assigned_supervisor_name || request.current_supervisor_name || '',
    currentGroup: currentGroup?.group_name || request.current_group_name || '',
  }
}

function supervisorCanManageGroup(project = {}, supervisorUser = {}) {
  return Boolean(project && supervisorUser?.role === 'supervisor' && isAssignedSupervisorProject(project, supervisorUser))
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

const MEETING_STATUS_LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  reschedule_proposed: 'Different Time Proposed',
  cancelled: 'Cancelled',
  completed: 'Completed',
}

function normalizeMeetingStatus(status = '') {
  const value = String(status || 'pending').trim().toLowerCase().replace(/\s+/g, '_')
  return MEETING_STATUS_LABELS[value] ? value : 'pending'
}

function getMeetingStatusLabel(status = '') {
  return MEETING_STATUS_LABELS[normalizeMeetingStatus(status)] || 'Pending'
}

function normalizeMeetingRole(role = '') {
  const value = normalizeText(role).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (['student', 'students', 'bsc_student', 'bachelor_student', 'undergraduate_student'].includes(value) || value.includes('student')) return 'student'
  if (['supervisor', 'supervisors', 'research_supervisor', 'project_supervisor', 'academic_supervisor'].includes(value) || value.includes('supervisor')) return 'supervisor'
  if (['committee', 'research_committee', 'research_committee_member'].includes(value) || value.includes('committee')) return 'committee'
  if (value === 'admin' || value === 'administrator' || value.includes('admin')) return 'admin'
  return value
}

function profileMatchesUser(profile = {}, user = {}) {
  if (!profile || !user) return false
  const profileIds = [profile.id, profile.user_id, profile.profile_id, profile.student_id, profile.supervisor_id]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  const userIds = [user.id, user.user_id, user.profile_id, user.student_id, user.supervisor_id]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  const profileEmails = [profile.email, profile.user_email, profile.recipient_email, profile.student_email, profile.supervisor_email]
    .map(normalizeText)
    .filter(Boolean)
  const userEmails = [user.email, user.user_email, user.recipient_email, user.student_email, user.supervisor_email]
    .map(normalizeText)
    .filter(Boolean)
  const profileNames = [profile.full_name, profile.name, profile.display_name, profile.student_name, profile.supervisor_name, profile.assigned_supervisor_name]
    .map(normalizeText)
    .filter(Boolean)
  const userNames = [user.full_name, user.name, user.display_name, user.student_name, user.supervisor_name, user.assigned_supervisor_name]
    .map(normalizeText)
    .filter(Boolean)

  return (
    profileIds.some((id) => userIds.includes(id)) ||
    profileEmails.some((email) => userEmails.includes(email)) ||
    profileNames.some((name) => userNames.includes(name))
  )
}

function meetingParticipantMatches(row = {}, user = {}, keys = []) {
  if (!row || !user) return false
  const ids = keys.map((key) => row[`${key}_id`]).filter(Boolean).map(String)
  const emails = keys.map((key) => row[`${key}_email`]).filter(Boolean).map(normalizeText)
  return (
    (!!user.id && ids.includes(String(user.id))) ||
    (!!user.email && emails.includes(normalizeText(user.email)))
  )
}

function getAssignedMeetingSupervisorForStudent(data = {}, studentUser = {}) {
  const studentProfile = findProfileForUser(data, studentUser) || studentUser
  if (!studentProfile) return null

  const directSupervisorIdentity = {
    id: studentProfile.assigned_supervisor_id || studentProfile.supervisor_id || studentProfile.supervisor_user_id || studentProfile.assigned_to_id,
    email: studentProfile.assigned_supervisor_email || studentProfile.supervisor_email || studentProfile.assigned_to_email,
    name: studentProfile.assigned_supervisor_name || studentProfile.supervisor_name || studentProfile.supervisor || studentProfile.assigned_supervisor || studentProfile.assigned_to_name,
  }
  const directSupervisor = findProfileByIdentity(data, directSupervisorIdentity)
  if (directSupervisor) return { ...directSupervisor, role: 'supervisor' }

  const profileSupervisor = (data.profiles || []).find((profile) =>
    normalizeMeetingRole(profile.role) === 'supervisor' && isStudentAssignedToSupervisorProfile(studentProfile, profile)
  )
  if (profileSupervisor) return profileSupervisor

  if (directSupervisorIdentity.id || directSupervisorIdentity.email || directSupervisorIdentity.name) {
    return {
      id: directSupervisorIdentity.id || null,
      email: directSupervisorIdentity.email || '',
      full_name: directSupervisorIdentity.name || directSupervisorIdentity.email || 'Assigned Supervisor',
      role: 'supervisor',
    }
  }

  const currentGroup = getStudentCurrentResearchGroup(data, studentProfile)
  const groupSupervisor = currentGroup ? findSupervisorProfileForProject(data, currentGroup) : null
  if (groupSupervisor) return { ...groupSupervisor, role: 'supervisor' }

  const memberProject = (data.projects || []).find((project) =>
    getResearchGroupMemberProfiles(data, project).some((member) => profileMatchesUser(member, studentProfile)) ||
    isOwnStudentProject(project, studentProfile)
  )
  const memberSupervisor = memberProject ? findSupervisorProfileForProject(data, memberProject) : null
  return memberSupervisor ? { ...memberSupervisor, role: 'supervisor' } : null
}

function getMeetingStudentsForSupervisor(data = {}, supervisorUser = {}) {
  const supervisorProfile = findProfileForUser(data, supervisorUser) || supervisorUser
  const assignedProjects = getVisibleProjects(data.projects || [], 'supervisor', supervisorProfile, data)
  return mergeStudentOptions(
    getDirectAssignedStudentsForSupervisor(data, supervisorProfile),
    getAssignedSupervisorStudents(data, assignedProjects, data.reports || [])
  )
}

function getMeetingStudentProfile(data = {}, studentOption = {}) {
  return findProfileByIdentity(data, {
    id: studentOption.id,
    email: studentOption.email,
    submitted_by: studentOption.name,
    name: studentOption.name,
  }) || {
    id: studentOption.id || null,
    email: studentOption.email || '',
    full_name: studentOption.name || studentOption.email || 'Student',
    role: 'student',
  }
}

function canUsersRequestMeeting(data = {}, requester = {}, recipient = {}) {
  if (!requester || !recipient) return false
  if (requester.id && recipient.id && String(requester.id) === String(recipient.id)) return false
  const requesterRole = normalizeMeetingRole(requester.role)
  const recipientRole = normalizeMeetingRole(recipient.role)
  const student = requesterRole === 'student' ? requester : recipientRole === 'student' ? recipient : null
  const supervisor = requesterRole === 'supervisor' ? requester : recipientRole === 'supervisor' ? recipient : null
  if (!student || !supervisor) return false

  // Direct student profile assignment.
  if (isStudentAssignedToSupervisorProfile(student, supervisor)) return true

  // Student can request the supervisor returned by the assignment resolver.
  const assignedSupervisor = getAssignedMeetingSupervisorForStudent(data, student)
  if (assignedSupervisor && profileMatchesUser(assignedSupervisor, supervisor)) return true

  // Supervisor can request any student returned by the supervisor assignment resolver.
  const allowedStudents = getMeetingStudentsForSupervisor(data, supervisor)
  if (allowedStudents.some((option) => profileMatchesUser(getMeetingStudentProfile(data, option), student))) return true

  // Project/group fallback for records where assignment is stored on the project/member row.
  const sharedProject = (data.projects || []).find((project) => {
    if (!isAssignedSupervisorProject(project, supervisor)) return false
    return (
      isOwnStudentProject(project, student) ||
      getResearchGroupMemberProfiles(data, project).some((member) => profileMatchesUser(member, student)) ||
      projectMatchesStudentOption(project, student, data.reports || [])
    )
  })
  return Boolean(sharedProject)
}

function meetingVisibleToUser(meeting = {}, user = {}) {
  if (!meeting || !user) return false
  return meetingParticipantMatches(meeting, user, ['requester', 'recipient', 'student', 'supervisor'])
}

function getMeetingsForUser(data = {}, user = {}) {
  return (data.meetingRequests || [])
    .filter((meeting) => meetingVisibleToUser(meeting, user))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
}

function formatMeetingDateTime(date, time) {
  const dateText = date ? new Date(`${date}T00:00:00`).toLocaleDateString() : 'Date not set'
  return `${dateText}${time ? ` at ${time}` : ''}`
}

function getMeetingOtherParticipant(meeting = {}, currentUser = {}, data = {}) {
  const currentIsRequester = meetingParticipantMatches(meeting, currentUser, ['requester'])
  const id = currentIsRequester ? meeting.recipient_id : meeting.requester_id
  const email = currentIsRequester ? meeting.recipient_email : meeting.requester_email
  return findProfileByIdentity(data, { id, email }) || {
    id,
    email,
    full_name: currentIsRequester ? (meeting.recipient_name || 'Recipient') : (meeting.requester_name || 'Requester'),
    role: currentIsRequester ? meeting.recipient_role : meeting.requester_role,
  }
}

function Pill({ children, tone = 'slate', className = '' }) {
  return <span className={`pill ${tone} ${className}`.trim()}>{children}</span>
}

function ProgressBar({ value }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
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

function EmptyState({ title = 'No records available.', text = 'No records available.', icon: Icon = FileText }) {
  return (
    <div className="empty-state">
      <Icon size={34} />
      <h3>{title}</h3>
      <p>{text || 'No records available.'}</p>
    </div>
  )
}

function LoadingSpinner({ size = 14 }) {
  return <span className="button-spinner loading-spinner" style={{ width: size, height: size }} aria-hidden="true" />
}

function LoadingBlock({ text = 'Loading records...' }) {
  return <div className="loading-state"><LoadingSpinner size={18} /><span>{text}</span></div>
}

function ButtonContent({ loading = false, loadingText = 'Loading...', icon: Icon, iconSize = 16, children }) {
  return <>{loading ? <LoadingSpinner size={iconSize} /> : Icon ? <Icon size={iconSize} /> : null}{loading ? loadingText : children}</>
}


function resolveHeroRouteToTab(target = '') {
  const raw = String(target || '').trim()
  if (!raw) return ''
  const clean = raw.replace(/^https?:\/\/[^/]+/i, '').split('?')[0].split('#')[0].replace(/^\/+|\/+$/g, '')
  const last = clean.split('/').filter(Boolean).pop() || clean
  const map = {
    dashboard: 'dashboard',
    'research-workspace': 'research-workspace',
    workspace: 'research-workspace',
    'my-research': 'dashboard',
    research: 'dashboard',
    projects: 'project-management',
    'project-management': 'project-management',
    progress: 'dashboard',
    'project-progress': 'dashboard',
    reports: 'reports',
    'pdf-reports': 'reports',
    pdf: 'reports',
    meetings: 'meetings',
    'meeting-requests': 'meetings',
    questions: 'questions',
    deadlines: 'dashboard',
    inbox: 'dashboard',
    notifications: 'dashboard',
    groups: 'groups',
    'join-group': 'join-group',
    'group-requests': 'group-requests',
    users: 'dashboard',
    audit: 'audit',
    database: 'database',
    profile: 'profile-settings',
    'profile-settings': 'profile-settings',
  }
  return map[last] || map[clean] || raw
}


const SEARCH_ENABLED_ROLES = ['student', 'supervisor', 'committee']

const roleFeatureSearchItems = {
  student: [
    { id: 'student-dashboard', label: 'Dashboard', description: 'Open your student dashboard hero page.', keywords: ['home', 'overview'], tab: 'dashboard', icon: LayoutDashboard },
    { id: 'student-workspace', label: 'Research Workspace', description: 'Manage your active research workflow.', keywords: ['workspace', 'research tools', 'work area'], tab: 'research-workspace', icon: BookOpen },
    { id: 'submit-weekly-report', label: 'Submit Weekly Report', description: 'Submit your project weekly progress report.', keywords: ['weekly', 'report', 'progress report', 'submit report'], tab: 'research-workspace', sectionId: 'submit-weekly-report', icon: FileText },
    { id: 'weekly-report-history', label: 'Weekly Report History', description: 'Review submitted weekly reports and status.', keywords: ['weekly history', 'submitted reports', 'report status'], tab: 'research-workspace', sectionId: 'weekly-report-history', icon: ClipboardCheck },
    { id: 'supervisor-feedback', label: 'Supervisor Feedback', description: 'View supervisor comments and report feedback.', keywords: ['feedback', 'comments', 'supervisor review'], tab: 'research-workspace', sectionId: 'supervisor-feedback', icon: MessageSquareText },
    { id: 'project-progress', label: 'Project Progress', description: 'View project progress and milestones.', keywords: ['progress', 'milestone', 'status'], tab: 'research-workspace', sectionId: 'project-progress', icon: CheckCircle2 },
    { id: 'my-research', label: 'My Research', description: 'Open your research project information.', keywords: ['project', 'my project', 'research project', 'research group'], tab: 'research-workspace', sectionId: 'my-research', icon: BookOpen },
    { id: 'project-members', label: 'Project Members', description: 'View students in your project group.', keywords: ['members', 'team', 'group students'], tab: 'research-workspace', sectionId: 'project-members', icon: Users },
    { id: 'project-leader', label: 'Project Leader', description: 'View project leader information.', keywords: ['leader', 'project leader'], tab: 'research-workspace', sectionId: 'project-leader', icon: UserCog },
    { id: 'deadlines', label: 'Deadlines', description: 'View project deadlines and milestones.', keywords: ['deadline', 'due date', 'milestones'], tab: 'research-workspace', sectionId: 'deadlines', icon: CalendarDays },
    { id: 'meeting-requests', label: 'Meeting Requests', description: 'Request and respond to meetings.', keywords: ['meeting', 'appointment', 'schedule'], tab: 'meetings', icon: CalendarDays },
    { id: 'questions', label: 'Questions', description: 'Ask your supervisor research questions.', keywords: ['ask', 'question', 'supervisor question'], tab: 'questions', icon: MessageSquareText },
    { id: 'join-research-group', label: 'Join Research Group', description: 'Browse approved groups and request to join.', keywords: ['join', 'research group', 'group request'], tab: 'join-group', icon: Users, requiresTabVisible: true },
    { id: 'inbox', label: 'Inbox', description: 'Open your Inbox messages and reminders.', keywords: ['notification', 'notifications', 'message', 'reminder'], action: 'open-inbox', icon: Inbox },
    { id: 'pdf-reports', label: 'Print/PDF Reports', description: 'Open the existing PDF reports page.', keywords: ['pdf', 'print', 'reports', 'download'], tab: 'reports', icon: Printer },
    { id: 'about-us', label: 'About Us', description: 'Open the platform About Us page.', keywords: ['about', 'hmu', 'college'], tab: 'about-us', icon: Info },
    { id: 'research-guidelines', label: 'Research Guidelines', description: 'Download the research guidelines PDF.', keywords: ['guidelines', 'research guidelines', 'pdf guideline'], action: 'download-guidelines', icon: Download },
    { id: 'profile-settings', label: 'Profile Settings', description: 'Update your profile and account settings.', keywords: ['profile', 'settings', 'account', 'password'], tab: 'profile-settings', icon: Settings },
  ],
  supervisor: [
    { id: 'supervisor-dashboard', label: 'Dashboard', description: 'Open your supervisor dashboard hero page.', keywords: ['home', 'overview'], tab: 'dashboard', icon: LayoutDashboard },
    { id: 'supervisor-workspace', label: 'Research Workspace', description: 'Manage supervised research activities.', keywords: ['workspace', 'research tools', 'work area'], tab: 'research-workspace', icon: BookOpen },
    { id: 'submit-research-project', label: 'Submit Research Project', description: 'Submit a supervisor project for committee review.', keywords: ['submit project', 'new project', 'proposal'], tab: 'project-management', sectionId: 'submit-research-project', icon: FileText },
    { id: 'my-submitted-projects', label: 'My Submitted Projects', description: 'View committee status for submitted projects.', keywords: ['submitted projects', 'my projects', 'committee status'], tab: 'project-management', sectionId: 'my-submitted-projects', icon: ClipboardCheck },
    { id: 'project-management', label: 'Project Management', description: 'Open supervisor project management tools.', keywords: ['projects', 'manage projects'], tab: 'project-management', icon: ClipboardCheck },
    { id: 'project-progress', label: 'Project Progress', description: 'Monitor supervised project progress.', keywords: ['progress', 'milestones', 'status'], tab: 'research-workspace', sectionId: 'project-progress', icon: CheckCircle2 },
    { id: 'review-weekly-reports', label: 'Review Weekly Reports', description: 'Review student weekly progress reports.', keywords: ['weekly', 'review reports', 'student reports'], tab: 'research-workspace', sectionId: 'review-weekly-reports', icon: ClipboardCheck },
    { id: 'provide-supervisor-feedback', label: 'Provide Supervisor Feedback', description: 'Write feedback for weekly reports.', keywords: ['feedback', 'comments', 'review'], tab: 'research-workspace', sectionId: 'review-weekly-reports', icon: MessageSquareText },
    { id: 'manage-deadlines', label: 'Set and Manage Deadlines', description: 'Create and remove student deadlines.', keywords: ['deadline', 'due date', 'set deadline'], tab: 'research-workspace', sectionId: 'manage-deadlines', icon: CalendarDays },
    { id: 'assign-project-leader', label: 'Assign Project Leader', description: 'Choose a student leader for a project.', keywords: ['leader', 'project leader', 'assign leader'], tab: 'project-management', sectionId: 'assign-project-leader', icon: UserCog },
    { id: 'project-members', label: 'Project Members', description: 'View students in supervised project groups.', keywords: ['members', 'students', 'group members'], tab: 'research-workspace', sectionId: 'project-members', icon: Users },
    { id: 'group-join-requests', label: 'Group Join Requests', description: 'Review student requests to join your groups.', keywords: ['join requests', 'group requests', 'student requests'], tab: 'groups', sectionId: 'group-join-requests', icon: UserPlus },
    { id: 'meeting-requests', label: 'Meeting Requests', description: 'Request and respond to meetings.', keywords: ['meeting', 'appointment', 'schedule'], tab: 'meetings', icon: CalendarDays },
    { id: 'student-questions', label: 'Student Questions', description: 'Answer questions from assigned students.', keywords: ['questions', 'answers', 'student questions'], tab: 'questions', icon: MessageSquareText },
    { id: 'inbox', label: 'Inbox', description: 'Open your Inbox messages and reminders.', keywords: ['notification', 'notifications', 'message', 'reminder'], action: 'open-inbox', icon: Inbox },
    { id: 'pdf-reports', label: 'Print/PDF Reports', description: 'Open the existing PDF reports page.', keywords: ['pdf', 'print', 'reports', 'download'], tab: 'reports', icon: Printer },
    { id: 'about-us', label: 'About Us', description: 'Open the platform About Us page.', keywords: ['about', 'hmu', 'college'], tab: 'about-us', icon: Info },
    { id: 'research-guidelines', label: 'Research Guidelines', description: 'Download the research guidelines PDF.', keywords: ['guidelines', 'research guidelines', 'pdf guideline'], action: 'download-guidelines', icon: Download },
    { id: 'profile-settings', label: 'Profile Settings', description: 'Update your profile and account settings.', keywords: ['profile', 'settings', 'account', 'password'], tab: 'profile-settings', icon: Settings },
  ],
  committee: [
    { id: 'committee-dashboard', label: 'Dashboard', description: 'Open the Research Committee dashboard hero page.', keywords: ['home', 'overview'], tab: 'dashboard', icon: LayoutDashboard },
    { id: 'committee-workspace', label: 'Research Workspace', description: 'Review research submissions and monitoring tools.', keywords: ['workspace', 'review tools'], tab: 'research-workspace', icon: BookOpen },
    { id: 'review-project-submissions', label: 'Review Project Submissions', description: 'Review submitted project titles and proposals.', keywords: ['review submissions', 'project review', 'title review'], tab: 'research-workspace', sectionId: 'review-project-submissions', icon: Search },
    { id: 'accept-project', label: 'Accept Project', description: 'Approve a submitted research project.', keywords: ['accept', 'approve', 'decision'], tab: 'research-workspace', sectionId: 'review-project-submissions', icon: CheckCircle2 },
    { id: 'reject-project', label: 'Reject Project', description: 'Reject a submitted research project.', keywords: ['reject', 'decision'], tab: 'research-workspace', sectionId: 'review-project-submissions', icon: XCircle },
    { id: 'request-revision', label: 'Request Revision', description: 'Request project title/proposal revision.', keywords: ['revision', 'revise', 'decision'], tab: 'research-workspace', sectionId: 'review-project-submissions', icon: RefreshCw },
    { id: 'approved-projects', label: 'Approved Projects', description: 'View accepted/approved research projects.', keywords: ['approved', 'accepted projects'], tab: 'research-workspace', sectionId: 'approved-projects', icon: ClipboardCheck },
    { id: 'group-join-requests', label: 'Group Join Requests', description: 'Review group join request decisions.', keywords: ['join requests', 'group requests', 'student requests'], tab: 'group-requests', icon: Users },
    { id: 'add-students-to-group', label: 'Add Students to Group', description: 'Open group join/request management.', keywords: ['add students', 'group members'], tab: 'group-requests', icon: UserPlus },
    { id: 'project-progress', label: 'Project Progress', description: 'Monitor project progress.', keywords: ['progress', 'milestones', 'status'], tab: 'research-workspace', sectionId: 'project-progress', icon: CheckCircle2 },
    { id: 'weekly-report-review', label: 'Weekly Report Review', description: 'Review weekly reports and project updates.', keywords: ['weekly', 'reports', 'report review'], tab: 'research-workspace', sectionId: 'weekly-report-review', icon: FileText },
    { id: 'inbox', label: 'Inbox', description: 'Open your Inbox messages and reminders.', keywords: ['notification', 'notifications', 'message', 'reminder'], action: 'open-inbox', icon: Inbox },
    { id: 'pdf-reports', label: 'Print/PDF Reports', description: 'Open the existing PDF reports page.', keywords: ['pdf', 'print', 'reports', 'download'], tab: 'reports', icon: Printer },
    { id: 'about-us', label: 'About Us', description: 'Open the platform About Us page.', keywords: ['about', 'hmu', 'college'], tab: 'about-us', icon: Info },
    { id: 'research-guidelines', label: 'Research Guidelines', description: 'Download the research guidelines PDF.', keywords: ['guidelines', 'research guidelines', 'pdf guideline'], action: 'download-guidelines', icon: Download },
    { id: 'profile-settings', label: 'Profile Settings', description: 'Update your profile and account settings.', keywords: ['profile', 'settings', 'account', 'password'], tab: 'profile-settings', icon: Settings },
  ],
}

function scoreRoleSearchItem(item, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return 0
  const label = String(item.label || '').toLowerCase()
  const description = String(item.description || '').toLowerCase()
  const keywords = (item.keywords || []).map((keyword) => String(keyword || '').toLowerCase())
  if (label === q) return 100
  if (label.startsWith(q)) return 90
  if (keywords.some((keyword) => keyword === q || keyword.startsWith(q))) return 82
  if (label.includes(q)) return 74
  if (keywords.some((keyword) => keyword.includes(q))) return 66
  if (description.includes(q)) return 48
  return 0
}

function scrollToRoleSearchSection(sectionId, fallbackLabel = '') {
  if (!sectionId || typeof document === 'undefined') return
  const target = document.getElementById(sectionId) || document.querySelector(`[data-search-section="${CSS.escape(sectionId)}"]`)
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    target.classList?.add?.('role-search-target-highlight')
    window.setTimeout(() => target.classList?.remove?.('role-search-target-highlight'), 1300)
    return
  }
  const wanted = String(fallbackLabel || '').trim().toLowerCase()
  if (!wanted) return
  const candidates = Array.from(document.querySelectorAll('.card, .mini-card, section, form, [class*="card"]'))
  const fallback = candidates.find((node) => String(node.textContent || '').toLowerCase().includes(wanted))
  if (fallback) fallback.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function triggerGuidelinesDownload() {
  if (typeof document === 'undefined') return
  const link = document.createElement('a')
  link.href = RESEARCH_GUIDELINES_PDF_URL
  link.download = RESEARCH_GUIDELINES_DOWNLOAD_NAME
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function RoleFeatureSearch({ role = 'student', items = [], availableTabs = [], onNavigate }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [isResultsOpen, setIsResultsOpen] = useState(false)
  const searchRootRef = useRef(null)
  const searchInputRef = useRef(null)
  const normalizedRole = normalizeRoleHeroRole(role)
  const isSearchEnabled = SEARCH_ENABLED_ROLES.includes(normalizedRole)

  useEffect(() => {
    if (!isSearchEnabled) return undefined

    function handleOutsidePointer(event) {
      if (!searchRootRef.current?.contains(event.target)) {
        setFocused(false)
        setIsResultsOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key !== 'Escape') return
      setIsResultsOpen(false)
      setFocused(false)
      searchInputRef.current?.blur()
    }

    document.addEventListener('mousedown', handleOutsidePointer)
    document.addEventListener('touchstart', handleOutsidePointer, { passive: true })
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer)
      document.removeEventListener('touchstart', handleOutsidePointer)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isSearchEnabled])

  if (!isSearchEnabled) return null
  const availableTabSet = new Set([...(availableTabs || []), 'reports', 'about-us', 'profile-settings', 'research-workspace', 'dashboard'])
  const filteredItems = items.filter((item) => !item.requiresTabVisible || availableTabSet.has(item.tab))
  const trimmedQuery = query.trim()
  const results = trimmedQuery
    ? filteredItems
      .map((item) => ({ ...item, score: scoreRoleSearchItem(item, trimmedQuery) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, 7)
    : []

  function handleSelect(item) {
    setQuery('')
    setFocused(false)
    setIsResultsOpen(false)
    if (item.action === 'download-guidelines') {
      triggerGuidelinesDownload()
      return
    }
    if (item.action === 'open-inbox') {
      window.dispatchEvent(new CustomEvent('open-platform-inbox'))
      return
    }
    const nextTab = item.tab || resolveHeroRouteToTab(item.path || item.id)
    if (nextTab) {
      onNavigate?.(nextTab, item.sectionId || '')
      return
    }
    if (item.sectionId) {
      window.setTimeout(() => scrollToRoleSearchSection(item.sectionId, item.label), 280)
      window.setTimeout(() => scrollToRoleSearchSection(item.sectionId, item.label), 720)
    }
  }

  function handleFeatureSearchSubmit(event) {
    event.preventDefault()

    if (!trimmedQuery) {
      setIsResultsOpen(false)
      searchInputRef.current?.focus()
      return
    }

    setFocused(true)
    setIsResultsOpen(true)
    searchInputRef.current?.focus()
  }

  function handleQueryChange(event) {
    const nextQuery = event.target.value
    setQuery(nextQuery)
    setFocused(true)
    setIsResultsOpen(Boolean(nextQuery.trim()))
  }

  function handleInputKeyDown(event) {
    if (event.key === 'ArrowDown' && isResultsOpen && results.length) {
      event.preventDefault()
      searchRootRef.current?.querySelector('.role-feature-search__result')?.focus()
    }
  }

  function handleResultKeyDown(event, index) {
    const resultButtons = Array.from(searchRootRef.current?.querySelectorAll('.role-feature-search__result') || [])
    if (!resultButtons.length) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      resultButtons[(index + 1) % resultButtons.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      resultButtons[(index - 1 + resultButtons.length) % resultButtons.length]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      resultButtons[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      resultButtons[resultButtons.length - 1]?.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setIsResultsOpen(false)
      searchInputRef.current?.focus()
    }
  }

  return (
    <div ref={searchRootRef} className={`role-feature-search role-feature-search-${normalizedRole}`}>
      <form className={`role-feature-search__box ${focused ? 'is-focused' : ''}`} onSubmit={handleFeatureSearchSubmit}>
        <div className="role-feature-search__input-shell">
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={handleQueryChange}
            onFocus={() => {
              setFocused(true)
              if (trimmedQuery) setIsResultsOpen(true)
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Search pages, tools, and actions..."
            className="role-feature-search__input"
            aria-label="Search pages, tools, and actions"
            aria-expanded={isResultsOpen && Boolean(trimmedQuery)}
            aria-controls="role-feature-search-results"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="role-feature-search__clear"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery('')
                setIsResultsOpen(false)
                searchInputRef.current?.focus()
              }}
              aria-label="Clear search"
            >
              <XCircle size={17} />
            </button>
          )}
        </div>
        <button type="submit" className="role-feature-search__button" aria-label="Search">
          <Search aria-hidden="true" />
        </button>
      </form>
      {isResultsOpen && trimmedQuery && (
        <div id="role-feature-search-results" className="role-feature-search__results" role="listbox" aria-label="Search results">
          {results.length ? results.map((item, index) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className="role-feature-search__result search-result-force-white"
                data-state="inactive"
                data-active="false"
                style={{ background: '#ffffff', backgroundColor: '#ffffff', backgroundImage: 'none', color: '#111827' }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(item)}
                onKeyDown={(event) => handleResultKeyDown(event, index)}
                role="option"
              >
                <span className="role-feature-search__result-icon">{Icon ? <Icon size={17} /> : <Search size={17} />}</span>
                <span className="role-feature-search__result-text"><b>{item.label}</b><small>{item.description}</small></span>
              </button>
            )
          }) : <div className="role-feature-search__empty">No matching tools found for your role.</div>}
        </div>
      )}
    </div>
  )
}

function RoleHeroBanner({ role = 'student', settings = defaultWebsiteSettings, onNavigate, navigationItems = [], activeTab = '', className = '' }) {
  const hero = getRoleHeroSettings(settings, role)
  const image = versionedAssetUrl(hero?.imageUrl, settings?.assetUpdatedAt)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [image])

  if (!hero?.enabled) return null
  const roleClass = normalizeRoleHeroRole(role)
  const hasFeatureSearch = SEARCH_ENABLED_ROLES.includes(roleClass)
  const alignClass = ['center', 'right'].includes(hero.alignment) ? hero.alignment : 'left'
  const shouldShowImage = Boolean(image && !imageFailed)
  const heroStyle = {
    '--role-hero-overlay': hero.overlayOpacity,
    '--role-hero-text': hero.textColor,
  }

  function handleHeroCta() {
    const target = sanitizeRoleHeroRoute(hero.buttonRoute)
    if (!target) return
    if (/^(https?:|mailto:)/i.test(target)) {
      window.open(target, '_blank', 'noopener,noreferrer')
      return
    }
    if (onNavigate) onNavigate(resolveHeroRouteToTab(target))
  }

  return (
    <section className={`role-hero-banner role-hero-picture-card role-hero-navigation-shell role-hero-${roleClass} role-hero-align-${alignClass} ${shouldShowImage ? 'role-hero-has-image' : 'role-hero-no-image'} ${hasFeatureSearch ? 'role-hero-has-feature-search' : 'role-hero-no-feature-search'} ${className}`.trim()} style={heroStyle}>
      <div className="role-hero-picture-card__media" aria-hidden="true">
        {shouldShowImage && (
          <img
            className="role-hero-picture-card__image"
            src={image}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
      <div className="role-hero-banner__overlay" />
      <div className="role-hero-banner__content">
        <h1 className="role-hero-banner__title">{hero.title}</h1>
        {hero.subtitle && <p className="role-hero-banner__subtitle">{hero.subtitle}</p>}
        {hero.buttonLabel && hero.buttonRoute && (
          <button type="button" className="role-hero-banner__button" onClick={handleHeroCta}>{hero.buttonLabel}</button>
        )}
      </div>
      {(navigationItems.length > 0 || hasFeatureSearch) && (
        <div className={`role-hero-actions-panel ${hasFeatureSearch ? 'role-hero-actions-panel--with-search' : 'role-hero-actions-panel--nav-only'}`}>
          {navigationItems.length > 0 && (
            <nav className="hero-role-navigation" aria-label="Role page navigation">
              {navigationItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`hero-nav-button${activeTab === item.id ? ' active is-active' : ''}`}
                    onClick={() => onNavigate?.(item.id)}
                    aria-current={activeTab === item.id ? 'page' : undefined}
                    aria-selected={activeTab === item.id ? 'true' : 'false'}
                    data-active={activeTab === item.id ? 'true' : 'false'}
                  >
                    {Icon && <Icon size={16} />}
                    <span>{item.label}</span>
                    {item.badge > 0 && <span className="tab-badge">{item.badge}</span>}
                  </button>
                )
              })}
            </nav>
          )}
          {hasFeatureSearch && (
            <RoleFeatureSearch
              role={roleClass}
              items={roleFeatureSearchItems[roleClass] || []}
              availableTabs={navigationItems.map((item) => item.id)}
              onNavigate={onNavigate}
            />
          )}
        </div>
      )}
    </section>
  )
}



function getActionLoadingText(key = '') {
  const value = String(key).toLowerCase()
  if (value.includes('delete') || value.includes('remove') || value.includes('cancel')) return 'Deleting...'
  if (value.includes('reject')) return 'Rejecting...'
  if (value.includes('accept') || value.includes('approve')) return 'Accepting...'
  if (value.includes('revise') || value.includes('revision')) return 'Requesting...'
  if (value.includes('send') || value.includes('invite') || value.includes('email') || value.includes('resend')) return 'Sending...'
  if (value.includes('save')) return 'Saving...'
  return 'Updating...'
}


const fallbackDialogApi = {
  alert: (message) => { console.warn(message); return Promise.resolve(true) },
  confirm: (message) => { console.warn(message); return Promise.resolve(false) },
  prompt: (message) => { console.warn(message); return Promise.resolve(null) },
}
let appDialogApi = fallbackDialogApi

function showAppAlert(message, options = {}) {
  return appDialogApi.alert(message, options)
}

function showAppConfirm(message, options = {}) {
  return appDialogApi.confirm(message, options)
}

function showAppPrompt(message, defaultValue = '', options = {}) {
  return appDialogApi.prompt(message, defaultValue, options)
}

function AppDialog({ dialog, onClose }) {
  const [inputValue, setInputValue] = useState(dialog?.defaultValue || '')
  const dialogRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setInputValue(dialog?.defaultValue || '')
    if (!dialog?.open) return
    const timer = window.setTimeout(() => {
      if (dialog.kind === 'prompt') inputRef.current?.focus()
      else dialogRef.current?.querySelector('button')?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [dialog])

  useEffect(() => {
    if (!dialog?.open) return
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose(dialog.kind === 'confirm' ? false : dialog.kind === 'prompt' ? null : true)
      }
      if (event.key === 'Enter' && dialog.kind !== 'prompt') {
        event.preventDefault()
        onClose(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialog, onClose])

  if (!dialog?.open) return null
  const type = dialog.type || (dialog.kind === 'confirm' ? 'warning' : 'info')
  const Icon = type === 'success' ? CheckCircle2 : type === 'danger' || type === 'error' ? XCircle : type === 'warning' ? Info : Info
  const title = dialog.title || (dialog.kind === 'confirm' ? 'Confirm Action' : dialog.kind === 'prompt' ? 'Input Required' : type === 'error' ? 'Error' : 'Notice')

  return (
    <div className="app-dialog-backdrop" role="presentation">
      <div className={`app-dialog app-dialog-${type}`} role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" ref={dialogRef}>
        <div className="app-dialog-icon"><Icon size={24} /></div>
        <div className="app-dialog-body">
          <h2 id="app-dialog-title">{title}</h2>
          <p>{dialog.message}</p>
          {dialog.kind === 'prompt' && (
            <input
              ref={inputRef}
              className="app-dialog-input"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onClose(inputValue)
                }
              }}
            />
          )}
        </div>
        <div className="app-dialog-actions">
          {(dialog.kind === 'confirm' || dialog.kind === 'prompt') && (
            <button type="button" className="secondary" onClick={() => onClose(dialog.kind === 'prompt' ? null : false)}>{dialog.cancelLabel || 'Cancel'}</button>
          )}
          <button type="button" className={dialog.kind === 'confirm' && type === 'danger' ? 'danger' : 'primary'} onClick={() => onClose(dialog.kind === 'prompt' ? inputValue : true)}>{dialog.confirmLabel || (dialog.kind === 'confirm' ? 'Confirm' : 'OK')}</button>
        </div>
      </div>
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
  const heroSrc = settingImageUrl(settings.loginBackgroundImage || settings.loginHeroImage || settings.heroImage, '/hero-page.png', settings.assetUpdatedAt)
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

  const loginGrayTextButtonStyle = {
    color: '#4d4c4d',
    WebkitTextFillColor: '#4d4c4d',
    fontWeight: 700,
    background: 'transparent',
    backgroundColor: 'transparent',
    border: '0',
    boxShadow: 'none',
    padding: 0,
    margin: 0,
    borderRadius: 0,
    cursor: 'pointer',
  }

  return (
    <div className="login-page modern-login-page">
      <div className="auth-shell">
        <section className={`auth-brand-panel ${settings.loginShowCircles === false ? 'circles-hidden' : 'circles-live'}`} style={{
          '--auth-bg-image': cssImageUrl(heroSrc),
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
                  <span
                    role="button"
                    tabIndex={0}
                    className="gray-login-text-button plain-login-action forgot-password-link"
                    data-login-action="forgot-password"
                    style={loginGrayTextButtonStyle}
                    onClick={() => setMode('forgot')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode('forgot') } }}
                  >Forgot password?</span>
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
                <button id="login-auth-submit-button" data-login-submit="true" className="wide auth-submit-button login-submit-button sign-in-button" disabled={loading} onClick={() => onForgotPassword(form.email)}>
                  <Mail size={18} /> {loading ? 'Sending reset link...' : 'Send password reset email'}
                </button>
              ) : (
                <button id="login-auth-submit-button" data-login-submit="true" className="wide auth-submit-button login-submit-button sign-in-button" disabled={loading} onClick={() => onLogin({ ...form, mode, adminPortal: adminOnly })}>
                  <Lock size={18} /> {loading ? 'Please wait...' : isRegister ? 'Create account' : 'Sign in'}
                </button>
              )}

              {!adminOnly && (
                <div className="auth-bottom-row">
                  {isRegister ? (
                    <p>Already have an account? <button type="button" className="auth-text-link inline" onClick={() => setMode('login')}>Sign in</button></p>
                  ) : (
                    <p>Don’t have an account? <span
                      role="button"
                      tabIndex={0}
                      className="gray-login-text-button plain-login-action signup-link"
                      data-login-action="signup"
                      style={loginGrayTextButtonStyle}
                      onClick={() => setMode('register')}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode('register') } }}
                    >Sign up for free</span></p>
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
  const heroSrc = settingImageUrl(settings.loginBackgroundImage || settings.loginHeroImage || settings.heroImage, '/hero-page.png', settings.assetUpdatedAt)
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
          '--auth-bg-image': cssImageUrl(heroSrc),
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

function mergeRowsById(primary = [], extra = []) {
  const rows = [...(primary || [])]
  const seen = new Set(rows.map((item) => String(item?.id || '')).filter(Boolean))
  ;(extra || []).forEach((item) => {
    const key = String(item?.id || '')
    if (key && seen.has(key)) return
    if (key) seen.add(key)
    rows.push(item)
  })
  return rows
}

async function loadStudentMemberDashboardViaRpc(user = {}) {
  if (!isSupabaseConfigured || !user || normalizeText(user.role) !== 'student') {
    return { projects: [], reports: [], uploadedFiles: [], deadlines: [], groupMembers: [] }
  }
  try {
    const { data: result, error } = await supabase.rpc('get_student_project_member_dashboard')
    if (error) {
      console.warn('Student member dashboard RPC not available:', error.message || error)
      return { projects: [], reports: [], uploadedFiles: [], deadlines: [], groupMembers: [] }
    }
    return {
      projects: Array.isArray(result?.projects) ? result.projects : [],
      reports: Array.isArray(result?.reports) ? result.reports : [],
      uploadedFiles: Array.isArray(result?.uploadedFiles) ? result.uploadedFiles : [],
      deadlines: Array.isArray(result?.deadlines) ? result.deadlines : [],
      groupMembers: Array.isArray(result?.groupMembers) ? result.groupMembers : [],
    }
  } catch (error) {
    console.warn('Student member dashboard RPC failed:', error.message || error)
    return { projects: [], reports: [], uploadedFiles: [], deadlines: [], groupMembers: [] }
  }
}


export default function App() {
  const [appDialog, setAppDialog] = useState(null)
  const [role, setRole] = useState('student')
  const [tab, setTab] = useState(getInitialMainTab)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sidebarRef = useRef(null)
  const sidebarToggleRef = useRef(null)
  const [data, setData] = useState(loadLocalData)
  const [dataLoadError, setDataLoadError] = useState('')
  const [dataLoading, setDataLoading] = useState(false)
  const [websiteSettings, setWebsiteSettings] = useState(loadWebsiteSettings)
  const [aboutUsPage, setAboutUsPage] = useState(loadAboutUsPageLocal)
  const [pdfReportSettings, setPdfReportSettings] = useState(loadPdfReportSettings)
  const [pdfReportSettingsByRole, setPdfReportSettingsByRole] = useState(loadPdfReportSettingsByRole)
  const [adminPanelTab, setAdminPanelTab] = useState(getInitialAdminPanelTab)
  const [currentUser, setCurrentUser] = useState(loadCurrentUser)
  const [activeRoleOverride, setActiveRoleOverride] = useState('')
  const [message, setMessage] = useState('')

  const closeAppDialog = React.useCallback((result) => {
    setAppDialog((current) => {
      if (current?.resolve) current.resolve(result)
      return null
    })
  }, [])

  useEffect(() => {
    if (!sidebarOpen) return undefined

    const handleOutsideSidebarClose = (event) => {
      const target = event.target
      const sidebarElement = sidebarRef.current
      const toggleElement = sidebarToggleRef.current

      if (!target || sidebarElement?.contains(target) || toggleElement?.contains(target)) {
        return
      }

      setSidebarOpen(false)
    }

    const handleSidebarEscape = (event) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideSidebarClose)
    document.addEventListener('touchstart', handleOutsideSidebarClose, { passive: true })
    document.addEventListener('keydown', handleSidebarEscape)

    return () => {
      document.removeEventListener('mousedown', handleOutsideSidebarClose)
      document.removeEventListener('touchstart', handleOutsideSidebarClose)
      document.removeEventListener('keydown', handleSidebarEscape)
    }
  }, [sidebarOpen])

  useEffect(() => {
    appDialogApi = {
      alert: (message, options = {}) => new Promise((resolve) => setAppDialog({ open: true, kind: 'alert', type: options.type || 'info', title: options.title || 'Notice', message, confirmLabel: options.confirmLabel || 'OK', resolve })),
      confirm: (message, options = {}) => new Promise((resolve) => setAppDialog({ open: true, kind: 'confirm', type: options.type || 'warning', title: options.title || 'Confirm Action', message, confirmLabel: options.confirmLabel || 'Confirm', cancelLabel: options.cancelLabel || 'Cancel', resolve })),
      prompt: (message, defaultValue = '', options = {}) => new Promise((resolve) => setAppDialog({ open: true, kind: 'prompt', type: options.type || 'info', title: options.title || 'Input Required', message, defaultValue, confirmLabel: options.confirmLabel || 'OK', cancelLabel: options.cancelLabel || 'Cancel', resolve })),
    }
    return () => { appDialogApi = fallbackDialogApi }
  }, [])
  const [loginLoading, setLoginLoading] = useState(false)
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false)
  const [passwordResetLoading, setPasswordResetLoading] = useState(false)
  const [acceptedInvitation, setAcceptedInvitation] = useState(null)
  const [filters, setFilters] = useState({ search: '', area: 'All', status: 'All' })
  const [emailSendingReports, setEmailSendingReports] = useState({})
  const isAdminPortal = useMemo(() => isAdminPortalRequest(), [])

  const databaseMode = isSupabaseConfigured ? 'Supabase connected' : 'Local database mode'
  const baseRole = currentUser?.role || 'student'
  const isAdminBaseRole = baseRole === 'admin'
  const committeeSupervisorAccess = hasCommitteeSupervisorAccess(currentUser)
  const adminRoleModes = ['student', 'supervisor', 'committee']
  const allowedRole = isAdminBaseRole && adminRoleModes.includes(activeRoleOverride)
    ? activeRoleOverride
    : baseRole === 'committee' && committeeSupervisorAccess && activeRoleOverride === 'supervisor'
      ? 'supervisor'
      : baseRole
  const adminViewingAsRole = isAdminBaseRole && allowedRole !== 'admin'
  const roleContextUser = currentUser
  const activeRoleUser = currentUser
  const roleContextReady = true

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    localStorage.removeItem('pharmatrack-theme')
  }, [])

  useLayoutEffect(() => {
    applyButtonTheme(websiteSettings?.button_colors)
    applyInterfaceTheme(websiteSettings?.interface_colors)
  }, [websiteSettings?.button_colors, websiteSettings?.interface_colors])

  useEffect(() => {
    loadWebsiteSettingsFromSupabase()
    loadAboutUsPageFromSupabase()
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
      setEmailSendingReports({})
      loadFromSupabase(currentUser)
    }
  }, [])

  useEffect(() => {
    if (currentUser && role !== currentUser.role) {
      setRole(currentUser.role)
      setMessage('')
    }
  }, [role, currentUser])

  useEffect(() => {
    if (allowedRole !== 'admin' && ['database', 'audit'].includes(tab)) {
      setTab('dashboard')
    }
  }, [allowedRole, tab])

  useEffect(() => {
    if (!isAdminBaseRole && !committeeSupervisorAccess && activeRoleOverride) {
      setActiveRoleOverride('')
      setTab('dashboard')
    }
  }, [isAdminBaseRole, committeeSupervisorAccess, activeRoleOverride])

  async function loadFromSupabase(userOverride = currentUser) {
    if (!isSupabaseConfigured) return
    setDataLoading(true)
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

      let studentQuestionsData = []
      try {
        const studentQuestions = await supabase.from('student_questions').select('*').order('created_at', { ascending: false })
        if (!studentQuestions.error) studentQuestionsData = studentQuestions.data || []
      } catch {
        studentQuestionsData = []
      }

      let groupJoinRequestsData = []
      try {
        const groupJoinRequests = await supabase.from('group_join_requests').select('*').order('requested_at', { ascending: false })
        if (!groupJoinRequests.error) groupJoinRequestsData = groupJoinRequests.data || []
      } catch {
        groupJoinRequestsData = []
      }

      let groupMembersData = []
      try {
        const groupMembers = await supabase.from('research_group_members').select('*').order('joined_at', { ascending: false })
        if (!groupMembers.error) groupMembersData = groupMembers.data || []
      } catch {
        groupMembersData = []
      }

      let meetingRequestsData = []
      try {
        const meetingRequests = await supabase.from('meeting_requests').select('*').order('created_at', { ascending: false })
        if (!meetingRequests.error) meetingRequestsData = meetingRequests.data || []
      } catch {
        meetingRequestsData = []
      }

      const freshProfile = (profiles.data || []).find((profile) =>
        (!!userOverride?.id && String(profile.id) === String(userOverride.id)) ||
        (!!userOverride?.email && normalizeText(profile.email) === normalizeText(userOverride.email))
      )
      const memberDashboardData = await loadStudentMemberDashboardViaRpc(freshProfile || userOverride)
      groupMembersData = mergeRowsById(groupMembersData, memberDashboardData.groupMembers)
      const reportsData = mergeRowsById(reports.data || [], memberDashboardData.reports)
      const uploadedFilesData = mergeRowsById(uploadedFiles.data || [], memberDashboardData.uploadedFiles)
      const deadlinesData = mergeRowsById(deadlines.data || [], memberDashboardData.deadlines)
      const rawProjectsData = mergeRowsById(projects.data || [], memberDashboardData.projects)
      const projectsData = enrichProjectsWithGroupMembers(rawProjectsData, profiles.data || [], groupMembersData).map((project) => ({
        ...project,
        progress: getProjectProgress(project, reportsData),
      }))

      if (freshProfile) {
        const mergedUser = { ...userOverride, ...freshProfile }
        setCurrentUser(mergedUser)
        updateStoredCurrentUser(mergedUser)
      }

      setDataLoadError('')
      setData(cleanData({
        profiles: profiles.data || [],
        projects: projectsData,
        reports: reportsData,
        uploadedFiles: uploadedFilesData,
        deadlines: deadlinesData,
        notifications: notifications.data || [],
        evaluations: evaluations.data || [],
        auditLogs: auditLogs.data || [],
        invitations: invitationsData,
        studentQuestions: studentQuestionsData,
        groupJoinRequests: groupJoinRequestsData,
        groupMembers: groupMembersData,
        meetingRequests: meetingRequestsData,
      }))
    } catch (error) {
      setDataLoadError(error.message || 'Unknown database error')
      setMessage(`Database error: ${error.message}`)
    } finally {
      setDataLoading(false)
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
      if (error) {
        console.warn('Website settings could not be loaded from app_settings:', error)
        return
      }
      if (row?.value) {
        const settings = normalizeSettings(row.value)
        applyButtonTheme(settings.button_colors)
        applyInterfaceTheme(settings.interface_colors)
        setWebsiteSettings(settings)
        saveWebsiteSettingsLocal(settings)
      }
    } catch (error) {
      console.warn('Website settings loading failed:', error)
      // The website can still run with the last locally cached settings.
    }
  }

  async function loadPdfReportSettingsFromSupabase() {
    if (!isSupabaseConfigured) return
    try {
      const keys = [PDF_REPORT_SETTINGS_KEY, ...Object.values(PDF_REPORT_ROLE_KEYS)]
      const { data: rows, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', keys)
      if (error) return

      const rowMap = new Map((rows || []).map((row) => [row.key, row.value]))
      const globalSettings = rowMap.has(PDF_REPORT_SETTINGS_KEY)
        ? normalizePdfReportSettings(rowMap.get(PDF_REPORT_SETTINGS_KEY))
        : loadPdfReportSettings()

      setPdfReportSettings(globalSettings)
      savePdfReportSettingsLocal(globalSettings)

      const nextRoleSettings = Object.fromEntries(pdfReportRoleOptions.map(({ value }) => {
        const roleValue = rowMap.get(getPdfReportSettingsKey(value))
        const settings = roleValue ? normalizePdfReportSettings(roleValue) : normalizePdfReportSettings(globalSettings)
        savePdfReportSettingsForRoleLocal(value, settings)
        return [value, settings]
      }))
      setPdfReportSettingsByRole(nextRoleSettings)
    } catch {
      // The default PDF design still works if the optional settings row is not created yet.
    }
  }

  async function updatePdfReportSettings(nextValues, options = {}) {
    if (currentUser?.role !== 'admin') {
      setMessage('Only Admin accounts can edit PDF report customization settings.')
      return { ok: false }
    }

    const targetRole = options.role ? normalizePdfReportRole(options.role) : null
    const baseSettings = targetRole
      ? getPdfReportSettingsForRole(targetRole, pdfReportSettingsByRole, pdfReportSettings)
      : pdfReportSettings
    const nextSettings = normalizePdfReportSettings({ ...baseSettings, ...nextValues })

    if (targetRole) {
      setPdfReportSettingsByRole((current) => ({ ...current, [targetRole]: nextSettings }))
      savePdfReportSettingsForRoleLocal(targetRole, nextSettings)
    } else {
      setPdfReportSettings(nextSettings)
      savePdfReportSettingsLocal(nextSettings)
    }

    if (isSupabaseConfigured) {
      try {
        const rpcName = targetRole ? 'save_pdf_report_role_settings' : 'save_pdf_report_settings'
        const rpcArgs = targetRole
          ? {
              next_value: nextSettings,
              role_value: targetRole,
              updated_by_value: currentUser?.email || currentUser?.full_name || 'admin',
            }
          : {
              next_value: nextSettings,
              updated_by_value: currentUser?.email || currentUser?.full_name || 'admin',
            }

        const { data: savedValue, error } = await supabase.rpc(rpcName, rpcArgs)

        if (error) {
          const missingRpc = String(error.message || '').toLowerCase().includes('function') || String(error.message || '').toLowerCase().includes('schema cache')
          throw new Error(
            missingRpc
              ? `${error.message}. Run supabase/pdf_report_role_customization_update.sql in Supabase SQL Editor, refresh the website, then save again.`
              : error.message
          )
        }

        const savedSettings = normalizePdfReportSettings(savedValue || nextSettings)
        if (targetRole) {
          setPdfReportSettingsByRole((current) => ({ ...current, [targetRole]: savedSettings }))
          savePdfReportSettingsForRoleLocal(targetRole, savedSettings)
        } else {
          setPdfReportSettings(savedSettings)
          savePdfReportSettingsLocal(savedSettings)
        }

        if (!options.silent) {
          await addAudit(currentUser.full_name, 'updated', targetRole ? `PDF report customization settings for ${getPdfReportRoleLabel(targetRole)}` : 'PDF report customization settings')
          setMessage(targetRole ? `PDF settings for ${getPdfReportRoleLabel(targetRole)} saved successfully.` : 'PDF report settings saved successfully.')
        }
        return { ok: true, settings: savedSettings }
      } catch (error) {
        const roleText = targetRole ? ` for ${getPdfReportRoleLabel(targetRole)}` : ''
        setMessage(`PDF settings${roleText} were kept locally for preview, but global database save failed: ${error.message}. Run the latest supabase/pdf_report_role_customization_update.sql in Supabase SQL Editor, refresh, then save again.`)
        return { ok: false, error }
      }
    }

    if (!options.silent) {
      setMessage(targetRole ? `PDF report customization for ${getPdfReportRoleLabel(targetRole)} saved locally for preview. Connect Supabase and run supabase/pdf_report_role_customization_update.sql to save globally.` : 'PDF report customization saved locally for preview. Connect Supabase and run supabase/pdf_report_role_customization_update.sql to save globally.')
    }
    return { ok: true, settings: nextSettings }
  }

  async function uploadPdfReportLogo(file, options = {}) {
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

      await updatePdfReportSettings({ logoUrl, logoPath }, { silent: true, role: options.role })
      setMessage(isSupabaseConfigured ? 'PDF report logo uploaded. Click Save PDF Report Settings to confirm other changes.' : 'PDF report logo loaded locally for preview.')
      return { ok: true, logoUrl, logoPath }
    } catch (error) {
      try {
        const fallback = await fileToDataUrl(file)
        await updatePdfReportSettings({ logoUrl: fallback, logoPath: '' }, { silent: true, role: options.role })
        setMessage(`Logo preview loaded locally, but Supabase upload failed: ${error.message}. Run the updated supabase/pdf_report_customization_update.sql, then upload again.`)
        return { ok: true, logoUrl: fallback }
      } catch {
        setMessage(error.message || 'Could not upload the selected logo. Try a smaller JPG or PNG file.')
        return { ok: false }
      }
    }
  }

  async function removePdfReportLogo(options = {}) {
    if (currentUser?.role !== 'admin') {
      setMessage('Only Admin accounts can remove PDF report logos.')
      return { ok: false }
    }

    const targetRole = options.role ? normalizePdfReportRole(options.role) : null
    const oldPath = targetRole ? getPdfReportSettingsForRole(targetRole, pdfReportSettingsByRole, pdfReportSettings).logoPath : pdfReportSettings.logoPath
    await updatePdfReportSettings({ logoUrl: '', logoPath: '' }, { silent: true, role: targetRole })
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

  async function resetPdfReportSettings(options = {}) {
    return updatePdfReportSettings(defaultPdfReportSettings, { role: options.role })
  }

  async function updateWebsiteSettings(nextValues, options = {}) {
    if (currentUser?.role !== 'admin') {
      const error = new Error('Only Admin accounts can edit website settings.')
      setMessage(error.message)
      return { ok: false, error }
    }

    const nextSettings = normalizeSettings({
      ...websiteSettings,
      ...parseJsonObject(nextValues),
      assetUpdatedAt: new Date().toISOString(),
    })
    if (!sanitizeSettingImageUrl(nextSettings.heroImage)) nextSettings.heroImage = defaultWebsiteSettings.heroImage
    if (!sanitizeSettingImageUrl(nextSettings.loginBackgroundImage)) nextSettings.loginBackgroundImage = defaultWebsiteSettings.loginBackgroundImage
    if (!sanitizeSettingImageUrl(nextSettings.loginHeroImage)) nextSettings.loginHeroImage = nextSettings.loginBackgroundImage || defaultWebsiteSettings.loginHeroImage

    const commitSettings = (value) => {
      const committed = normalizeSettings(value)
      applyButtonTheme(committed.button_colors)
      applyInterfaceTheme(committed.interface_colors)
      setWebsiteSettings(committed)
      saveWebsiteSettingsLocal(committed)
      return committed
    }

    const deferCommitUntilSuccess = options.deferCommitUntilSuccess === true
    if (!deferCommitUntilSuccess) commitSettings(nextSettings)

    if (isSupabaseConfigured) {
      try {
        const rpcResult = await supabase.rpc('save_website_settings', {
          next_value: nextSettings,
          updated_by_value: currentUser?.email || currentUser?.full_name || 'admin',
        })

        let savedValue = rpcResult.data
        if (rpcResult.error) {
          const messageText = String(rpcResult.error.message || '')
          const missingRpc = messageText.toLowerCase().includes('function') || messageText.toLowerCase().includes('schema cache')
          if (!missingRpc) throw new Error(messageText)

          const fallbackSave = await supabase
            .from('app_settings')
            .upsert(
              {
                key: 'website',
                value: nextSettings,
                updated_by: currentUser?.email || currentUser?.full_name || 'admin',
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'key' }
            )
            .select('value')
            .maybeSingle()

          if (fallbackSave.error) {
            throw new Error(`${messageText}. Direct app_settings save also failed: ${fallbackSave.error.message}`)
          }
          savedValue = fallbackSave.data?.value
        }

        const verification = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'website')
          .maybeSingle()

        if (verification.error) throw verification.error
        if (!verification.data?.value && !savedValue) {
          throw new Error('The website settings row was not returned after saving.')
        }

        const savedSettings = normalizeSettings(verification.data?.value || savedValue || nextSettings)
        if (options.verifyButtonColors && !buttonColorSettingsMatch(savedSettings.button_colors, nextSettings.button_colors)) {
          throw new Error('Supabase returned success, but the saved button_colors value did not match the selected colors.')
        }
        if (options.verifyInterfaceColors && !interfaceColorSettingsMatch(savedSettings.interface_colors, nextSettings.interface_colors)) {
          throw new Error('Supabase returned success, but the saved interface_colors value did not match the selected colors.')
        }

        const committedSettings = commitSettings(savedSettings)
        if (!options.silent) {
          await addAudit(currentUser.full_name, 'updated', 'website settings')
          setMessage('Website settings saved globally and applied successfully.')
        }
        return { ok: true, settings: committedSettings }
      } catch (error) {
        if (!options.silent) setMessage(`Global website settings save failed: ${error.message}`)
        return { ok: false, error }
      }
    }

    const localSettings = deferCommitUntilSuccess ? commitSettings(nextSettings) : nextSettings
    if (!options.silent) {
      setMessage('Website settings saved locally for preview. Connect Supabase and run supabase/website_settings.sql to make settings global.')
    }
    return { ok: true, settings: localSettings }
  }

  async function loadAboutUsPageFromSupabase() {
    if (!isSupabaseConfigured) return
    try {
      const { data: page, error } = await supabase
        .from('site_pages')
        .select('*')
        .eq('page_key', ABOUT_US_PAGE_KEY)
        .maybeSingle()
      if (error) {
        console.warn('About Us page load failed. Run supabase/migrations/202607040001_about_us_page_customization.sql if needed:', error)
        return
      }
      if (page) {
        const normalized = normalizeAboutUsPage(page)
        setAboutUsPage(normalized)
        saveAboutUsPageLocal(normalized)
      }
    } catch (error) {
      console.warn('About Us page load failed:', error)
    }
  }

  async function updateAboutUsPage(nextValues, options = {}) {
    if (currentUser?.role !== 'admin') {
      setMessage('Only Admin accounts can edit the About Us page.')
      return { ok: false }
    }

    const nextPage = normalizeAboutUsPage({ ...aboutUsPage, ...nextValues, updated_at: new Date().toISOString() })
    setAboutUsPage(nextPage)
    saveAboutUsPageLocal(nextPage)

    if (isSupabaseConfigured) {
      try {
        const payload = {
          page_key: ABOUT_US_PAGE_KEY,
          title: nextPage.title,
          subtitle: nextPage.subtitle,
          content_html: nextPage.content_html,
          content_json: { ...(nextPage.content_json || {}), image_url: nextPage.image_url || '' },
          image_url: nextPage.image_url || '',
          is_published: nextPage.is_published,
          updated_by: currentUser?.id || null,
          updated_at: new Date().toISOString(),
        }
        const { data: savedPage, error } = await supabase
          .from('site_pages')
          .upsert(payload, { onConflict: 'page_key' })
          .select('*')
          .maybeSingle()
        if (error) throw error
        const normalized = normalizeAboutUsPage(savedPage || nextPage)
        setAboutUsPage(normalized)
        saveAboutUsPageLocal(normalized)
        if (!options.silent) {
          await addAudit(currentUser.full_name, 'updated', 'About Us page', {
            action_type: 'about_us_page_updated',
            description: `${currentUser.full_name || currentUser.email || 'Admin'} updated the About Us page.`,
          })
          setMessage('About Us page updated successfully.')
        }
        return { ok: true, page: normalized }
      } catch (error) {
        if (!options.silent) setMessage(`Failed to update About Us page. Run supabase/migrations/202607040001_about_us_page_customization.sql in Supabase SQL Editor, then try again. ${error.message || ''}`)
        return { ok: false, error }
      }
    }

    if (!options.silent) setMessage('About Us page updated locally. Connect Supabase and run the About Us SQL migration to save globally.')
    return { ok: true, page: nextPage }
  }

  async function uploadAboutUsImage(file) {
    if (currentUser?.role !== 'admin') return { ok: false, error: new Error('Only Admin accounts can upload About Us images.') }
    if (!file?.type?.startsWith('image/')) return { ok: false, error: new Error('Please choose a valid image file.') }
    try {
      const outputType = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg'
      const dataUrl = await optimizeImageFile(file, { maxWidth: 1400, maxHeight: 900, quality: 0.88, outputType })
      if (!isSupabaseConfigured) return { ok: true, url: dataUrl }
      const blob = await fetch(dataUrl).then((response) => response.blob())
      const extension = outputType === 'image/png' ? 'png' : outputType === 'image/webp' ? 'webp' : 'jpg'
      const safeName = sanitizeFileName(file.name || 'about-us-image').toLowerCase()
      const filePath = `about-us/about-us-${Date.now()}-${safeName}.${extension}`
      const upload = await supabase.storage
        .from('app-assets')
        .upload(filePath, blob, { contentType: outputType, cacheControl: '3600', upsert: true })
      if (upload.error) throw upload.error
      const { data: publicData } = supabase.storage.from('app-assets').getPublicUrl(filePath)
      const publicUrl = publicData?.publicUrl || ''
      if (!publicUrl) throw new Error('Image uploaded, but Supabase did not return a public URL.')
      return { ok: true, url: publicUrl, path: filePath }
    } catch (error) {
      return { ok: false, error }
    }
  }

  async function resetWebsiteSettings() {
    await updateWebsiteSettings(defaultWebsiteSettings)
    setMessage('Website settings reset to default values.')
  }

  function makeAudit(actor, action, entity, details = {}) {
    const description = details.description || `${actor || 'System'} ${action || 'updated'} ${entity || 'record'}`
    return {
      id: crypto.randomUUID(),
      actor: actor || currentUser?.full_name || currentUser?.email || 'System',
      actor_id: details.actor_id || currentUser?.id || null,
      actor_email: details.actor_email || currentUser?.email || '',
      actor_role: details.actor_role || currentUser?.role || '',
      action,
      action_type: details.action_type || action,
      entity,
      affected_entity: details.affected_entity || entity,
      affected_user_id: details.affected_user_id || null,
      affected_project_id: details.affected_project_id || details.project_id || null,
      affected_report_id: details.affected_report_id || details.report_id || null,
      old_value: details.old_value ?? null,
      new_value: details.new_value ?? null,
      description,
      details,
      created_at: new Date().toISOString(),
    }
  }

  async function addAudit(actor, action, entity, details = {}) {
    const log = makeAudit(actor, action, entity, details)
    if (isSupabaseConfigured) {
      const auditRow = {
        actor: log.actor,
        action: log.action,
        entity: log.entity,
        actor_id: log.actor_id,
        actor_email: log.actor_email,
        actor_role: log.actor_role,
        action_type: log.action_type,
        affected_entity: log.affected_entity,
        affected_user_id: log.affected_user_id,
        affected_project_id: log.affected_project_id,
        affected_report_id: log.affected_report_id,
        old_value: log.old_value,
        new_value: log.new_value,
        description: log.description,
        details: log.details,
      }
      const { error } = await supabase.from('audit_logs').insert(auditRow)
      if (error) {
        console.warn('Audit log write failed; main action was kept:', error)
        const fallback = await supabase.from('audit_logs').insert({ actor: log.actor, action: log.action, entity: log.entity }).catch((fallbackError) => ({ error: fallbackError }))
        if (fallback?.error) console.warn('Audit log fallback write failed:', fallback.error)
      }
      return log
    }
    setLocal((current) => ({ ...current, auditLogs: [log, ...(current.auditLogs || [])] }))
    return log
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
      setMessage('')
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

  async function sendSupervisorProjectWorkflowEmail(kind, projectId, decision = '') {
    if (!isSupabaseConfigured || !supabase?.functions?.invoke) return { ok: false, error: 'Email sending requires Supabase Edge Functions.' }
    const { data: result, error } = await supabase.functions.invoke('send-platform-email', {
      body: {
        kind,
        projectId,
        decision,
        appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      },
    })
    if (error) throw new Error(error.message || 'Project workflow email could not be sent.')
    if (result?.error) throw new Error(result.error)
    return { ok: true, result }
  }

  async function createProject(form) {
    const actionUser = activeRoleUser || currentUser
    if (!canSubmitSupervisorProject(actionUser)) {
      setMessage('Students cannot submit research titles or research groups. Please request to join an approved project after Research Committee approval.')
      return { ok: false, error: 'Students cannot submit research titles or research groups.' }
    }
    if (!form.title?.trim()) {
      setMessage('Please write a research title first.')
      return { ok: false, error: 'Please write a research title first.' }
    }
    if (!DEPARTMENT_OPTIONS.includes(form.area)) {
      setMessage('Please select a valid department.')
      return { ok: false, error: 'Please select a valid department.' }
    }
    const now = new Date().toISOString()
    const project = {
      id: crypto.randomUUID(),
      group_name: form.group_name || `${actionUser?.full_name || 'Supervisor'} Research Group`,
      title: form.title,
      area: normalizeDepartment(form.area),
      expected_members: form.expected_members ? Number(form.expected_members) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || form.final_due || null,
      supervisor_name: actionUser?.full_name || actionUser?.email || 'Supervisor',
      supervisor_id: actionUser?.id || null,
      supervisor_email: actionUser?.email || '',
      student_id: null,
      student_email: '',
      created_by: actionUser?.id || null,
      created_by_email: actionUser?.email || '',
      created_by_role: actionUser?.role || 'supervisor',
      submitted_by_role: actionUser?.role || 'supervisor',
      submitted_by_name: actionUser?.full_name || actionUser?.email || 'Supervisor',
      submitted_at: now,
      approval: 'Pending Committee Review',
      status: 'Pending',
      progress: 0,
      final_due: form.final_due || form.end_date || '',
      students: [],
      created_at: now,
    }

    let savedProject = project
    let emailFailed = false
    if (isSupabaseConfigured) {
      const { id, ...projectForDb } = project
      const { data: inserted, error } = await supabase.from('research_projects').insert(projectForDb).select().single()
      if (error) {
        setMessage(error.message)
        return { ok: false, error: error.message }
      }
      savedProject = inserted || project
      const committeeUsers = (data.profiles || []).filter((profile) => profile.role === 'committee')
      const notices = committeeUsers.map((committee) => ({
        profile_id: committee.id || null,
        recipient_user_id: committee.id || null,
        recipient_email: committee.email || '',
        sender_user_id: actionUser?.id || null,
        project_id: savedProject.id || null,
        notification_type: `supervisor_project_${savedProject.id}_submitted_${committee.id || committee.email}`,
        title: 'New Supervisor Project Submission',
        message: `${actionUser?.full_name || actionUser?.email || 'A supervisor'} submitted ${savedProject.title || 'a research project'} for Research Committee review.`,
        type: 'Supervisor Project Submission',
        target_role: 'committee',
        is_read: false,
        created_at: now,
      }))
      if (notices.length) {
        const noticeResult = await supabase.from('notifications').insert(notices)
        if (noticeResult.error) console.warn('Project submission notification failed:', noticeResult.error)
      }
      try {
        await sendSupervisorProjectWorkflowEmail('supervisor_project_submitted', savedProject.id)
      } catch (emailError) {
        console.warn('Supervisor project submission email failed:', emailError)
        emailFailed = true
      }
      await addAudit(actionUser.full_name, 'submitted', 'supervisor research project')
      await loadFromSupabase(currentUser)
    } else {
      const committeeUsers = (data.profiles || []).filter((profile) => profile.role === 'committee')
      const notices = committeeUsers.map((committee) => ({
        id: crypto.randomUUID(),
        profile_id: committee.id || null,
        recipient_user_id: committee.id || null,
        recipient_email: committee.email || '',
        sender_user_id: actionUser?.id || null,
        project_id: project.id,
        notification_type: `supervisor_project_${project.id}_submitted_${committee.id || committee.email}`,
        title: 'New Supervisor Project Submission',
        message: `${actionUser?.full_name || actionUser?.email || 'A supervisor'} submitted ${project.title || 'a research project'} for Research Committee review.`,
        type: 'Supervisor Project Submission',
        target_role: 'committee',
        is_read: false,
        created_at: now,
      }))
      const log = makeAudit(actionUser.full_name, 'submitted', 'supervisor research project')
      setLocal((current) => ({ ...current, projects: [project, ...current.projects], notifications: [...notices, ...current.notifications], auditLogs: [log, ...current.auditLogs] }))
    }
    setMessage(emailFailed ? 'Research project submitted successfully, but email notification failed.' : 'Research project submitted to Research Committee successfully.')
    return { ok: true, project: savedProject, emailSent: !emailFailed }
  }


  async function sendProjectLeaderAssignedEmail(projectId, studentId) {
    if (!isSupabaseConfigured || !supabase?.functions?.invoke) return { ok: false, error: 'Email sending requires Supabase Edge Functions.' }
    const { data: result, error } = await supabase.functions.invoke('send-platform-email', {
      body: {
        kind: 'project_leader_assigned',
        projectId,
        studentId,
        appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      },
    })
    if (error) throw new Error(error.message || 'Project leader email could not be sent.')
    if (result?.error) throw new Error(result.error)
    return { ok: true, result }
  }

  async function assignProjectLeader(projectId, studentId) {
    const project = data.projects.find((item) => String(item.id) === String(projectId))
    const student = (data.profiles || []).find((profile) => String(profile.id) === String(studentId) && profile.role === 'student')
    if (!project || !student) {
      setMessage('Project or student was not found. Please refresh and try again.')
      return { ok: false }
    }
    if (!(isAssignedSupervisorProject(project, currentUser) || canManageAllGroupMemberships(currentUser))) {
      setMessage('You do not have permission to assign a project leader for this project.')
      return { ok: false }
    }
    const members = getProjectMembersWithoutSupervisor(data, project, data.reports)
    const isMember = members.some((member) => String(member.id || '') === String(student.id) || normalizeText(member.email) === normalizeText(student.email))
    if (!isMember) {
      setMessage('Project leader must be an existing student member of this project.')
      return { ok: false }
    }

    let emailFailed = false
    if (isSupabaseConfigured) {
      const rpcResult = await supabase.rpc('assign_project_leader', { p_project_id: project.id, p_student_id: student.id })
      if (rpcResult.error) {
        // Fallback for deployments before the SQL function is run.
        const activeMembers = getResearchGroupMemberRecords(data.groupMembers || [], project)
        for (const member of activeMembers) {
          if (!member.id) continue
          await supabase.from('research_group_members').update({ member_role: String(member.student_id) === String(student.id) || normalizeText(member.student_email) === normalizeText(student.email) ? 'project_leader' : 'member' }).eq('id', member.id)
        }
        const updateResult = await supabase.from('research_projects').update({
          project_leader_id: student.id,
          project_leader_name: student.full_name || student.email || 'Project Leader',
          project_leader_email: student.email || '',
          project_leader_assigned_at: new Date().toISOString(),
        }).eq('id', project.id)
        if (updateResult.error) {
          setMessage(rpcResult.error.message || updateResult.error.message)
          return { ok: false }
        }
      }
      const note = {
        profile_id: student.id || null,
        recipient_user_id: student.id || null,
        recipient_email: student.email || '',
        sender_user_id: currentUser?.id || null,
        project_id: project.id,
        notification_type: `project_leader_assigned_${project.id}_${student.id}`,
        title: 'Research Project Leader Assigned',
        message: `You have been assigned as Research Project Leader for ${project.title || project.group_name || 'your project'}. Only the project leader can submit weekly reports for this project.`,
        type: 'Project Leader',
        target_role: 'student',
        is_read: false,
        created_at: new Date().toISOString(),
      }
      const notificationResult = await supabase.from('notifications').insert(note)
      if (notificationResult.error) console.warn('Project leader notification failed:', notificationResult.error)
      try {
        await sendProjectLeaderAssignedEmail(project.id, student.id)
      } catch (emailError) {
        console.warn('Project leader assignment email failed:', emailError)
        emailFailed = true
      }
      await addAudit(currentUser.full_name, 'assigned project leader', project.title || project.group_name || `project ${project.id}`, {
        action_type: 'project_leader_assignment',
        affected_project_id: project.id,
        affected_user_id: student.id,
        old_value: getProjectLeaderProfile(data, project)?.full_name || getProjectLeaderProfile(data, project)?.email || 'Not assigned',
        new_value: student.full_name || student.email || 'Project Leader',
        description: `${currentUser.full_name || currentUser.email || 'A user'} assigned ${student.full_name || student.email || 'a student'} as Project Leader for ${project.title || project.group_name || 'a project'}.`,
      })
      await loadFromSupabase(currentUser)
    } else {
      setLocal((current) => ({
        ...current,
        projects: current.projects.map((item) => String(item.id) === String(project.id) ? { ...item, project_leader_id: student.id, project_leader_name: student.full_name, project_leader_email: student.email, project_leader_assigned_at: new Date().toISOString() } : item),
        groupMembers: (current.groupMembers || []).map((member) => String(member.group_id) === String(project.id) ? { ...member, member_role: String(member.student_id) === String(student.id) || normalizeText(member.student_email) === normalizeText(student.email) ? 'project_leader' : 'member' } : member),
      }))
    }
    setMessage(emailFailed ? 'Project leader assigned, but email notification failed.' : 'Project leader assigned successfully.')
    return { ok: true, emailSent: !emailFailed }
  }

  async function createWeeklyReport(form, file) {
    const actionUser = activeRoleUser || currentUser
    if (!form.project_id) {
      setMessage('Create or select a research project first.')
      return { ok: false, error: 'Create or select a research project first.' }
    }
    const weeklyProject = data.projects.find((project) => String(project.id) === String(form.project_id))
    if (actionUser?.role === 'student') {
      const permission = getWeeklyReportSubmissionPermission(data, weeklyProject, actionUser)
      if (!permission.canSubmit) {
        setMessage(permission.reason || 'Only the project leader can submit weekly reports for this project.')
        return { ok: false, error: permission.reason || 'Only the project leader can submit weekly reports for this project.' }
      }
    }
    if (!form.completed_work?.trim()) {
      setMessage('Please write the work completed this week before submitting.')
      return { ok: false, error: 'Please write the work completed this week before submitting.' }
    }
    const nextWeek = Math.max(
      0,
      ...data.reports
        .filter((r) => String(r.project_id) === String(form.project_id) && reportOwnedByUser(r, actionUser))
        .map((r) => Number(r.week_number || 0))
    ) + 1
    const report = {
      id: crypto.randomUUID(),
      project_id: form.project_id,
      week_number: nextWeek,
      submitted_by: actionUser?.full_name || form.submitted_by,
      submitted_by_id: actionUser?.id || null,
      submitted_by_email: actionUser?.email || '',
      student_id: actionUser?.id || null,
      student_email: actionUser?.email || '',
      user_id: actionUser?.id || null,
      created_by: actionUser?.id || null,
      created_by_email: actionUser?.email || '',
      submitted_at: new Date().toISOString(),
      completed_work: form.completed_work,
      challenges: form.challenges,
      next_week_plan: form.next_week_plan,
      attendance: form.attendance,
      status: 'Submitted',
      supervisor_feedback: 'Waiting for supervisor review.',
      score: null,
    }

    let submissionNotice = 'Weekly report submitted successfully and supervisor notified.'
    if (isSupabaseConfigured) {
      const { id, ...reportForDb } = report
      const { data: inserted, error } = await supabase.from('weekly_reports').insert(reportForDb).select().single()
      if (error) {
        setMessage(error.message)
        return { ok: false, error: error.message }
      }

      let uploadWarning = ''
      let notificationFailed = false
      let emailFailed = false

      try {
        if (file) await uploadProjectFile(file, form.project_id, inserted.id, 'Weekly Report Evidence', actionUser)
      } catch (uploadError) {
        uploadWarning = uploadError.message || 'Attachment upload failed.'
        console.warn('Weekly report attachment upload failed:', uploadError)
      }

      try {
        const notificationResult = await notifySupervisorAboutSubmittedReport({ ...inserted, id: inserted.id })
        notificationFailed = Boolean(notificationResult?.notificationFailed)
        emailFailed = Boolean(notificationResult?.emailFailed)
      } catch (notificationError) {
        notificationFailed = true
        console.warn('Weekly report notification could not be created:', notificationError)
      }

      await addAudit(form.submitted_by, 'submitted', `weekly report ${nextWeek}`)
      await loadFromSupabase(currentUser)

      if (emailFailed) submissionNotice = 'Weekly report submitted successfully, but email notification failed.'
      else if (notificationFailed) submissionNotice = 'Weekly report submitted successfully, but supervisor notification failed.'
      else submissionNotice = 'Weekly report submitted successfully and supervisor notified.'
      if (uploadWarning) submissionNotice += ` Attachment upload failed: ${uploadWarning}`
    } else {
      const attachment = file ? await makeLocalReportAttachment(file, form.project_id, report.id, actionUser) : null
      const reportWithAttachment = attachment ? { ...report, attachment } : report
      const log = makeAudit(form.submitted_by, 'submitted', `weekly report ${nextWeek}`)
      const project = data.projects.find((item) => String(item.id) === String(form.project_id))
      const supervisor = findSupervisorProfileForProject(data, project)
      const notification = supervisor ? {
        id: crypto.randomUUID(),
        profile_id: supervisor.id || null,
        recipient_user_id: supervisor.id || null,
        recipient_email: supervisor.email || '',
        sender_user_id: actionUser?.id || null,
        weekly_report_id: report.id,
        project_id: form.project_id,
        notification_type: 'weekly_report_submitted',
        title: 'New Weekly Report Submitted',
        message: `A new weekly report has been submitted by ${actionUser?.full_name || report.submitted_by || 'Student'} for Week ${nextWeek}.`,
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
    setMessage(submissionNotice)
    return { ok: true, report, message: submissionNotice }
  }

  async function uploadProjectFile(file, projectId, reportId, fileType, uploaderUser = currentUser) {
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
      uploaded_by: uploaderUser?.id || null,
      uploaded_by_email: uploaderUser?.email || '',
      user_id: uploaderUser?.id || null,
      created_by: uploaderUser?.id || null,
      created_by_email: uploaderUser?.email || '',
      file_mime_type: file.type || 'application/octet-stream',
    }).select().single()
    if (insert.error) throw insert.error
    return insert.data
  }

  async function createReportNotification({ recipient, report, project, notificationType, title, message, includeEmail = false, actor = activeRoleUser || currentUser }) {
    if (!recipient || !report || !notificationType) return { notificationCreated: false, notificationFailed: true, emailSent: false, emailFailed: false }
    const actorProfile = actor || activeRoleUser || currentUser || {}
    const recipientId = recipient.id || null
    const recipientEmail = recipient.email || ''
    const reportId = report.id
    const alreadyExists = (data.notifications || []).some((note) =>
      String(note.weekly_report_id || '') === String(reportId) &&
      String(note.notification_type || note.type || '') === String(notificationType) &&
      (
        (recipientId && String(note.recipient_user_id || note.profile_id || '') === String(recipientId)) ||
        (!recipientId && normalizeText(note.recipient_email) === normalizeText(recipientEmail))
      )
    )
    if (alreadyExists) return { notificationCreated: false, notificationSkipped: true, emailSent: false, emailFailed: false }

    const notification = {
      id: crypto.randomUUID(),
      profile_id: recipientId,
      recipient_user_id: recipientId,
      recipient_email: recipientEmail,
      sender_user_id: actorProfile?.id || null,
      weekly_report_id: reportId,
      project_id: project?.id || report.project_id || null,
      notification_type: notificationType,
      title,
      message,
      type: 'Weekly Report',
      target_role: recipient.role || 'supervisor',
      is_read: false,
      created_at: new Date().toISOString(),
    }

    let notificationCreated = false
    let emailSent = false
    let emailFailed = false

    if (isSupabaseConfigured) {
      const { id, ...notificationForDb } = notification
      const duplicateQuery = await supabase
        .from('notifications')
        .select('id')
        .eq('weekly_report_id', reportId)
        .eq('notification_type', notificationType)
        .or(recipientId ? `recipient_user_id.eq.${recipientId},profile_id.eq.${recipientId}` : `recipient_email.eq.${recipientEmail}`)
        .limit(1)
      if (!duplicateQuery.error && duplicateQuery.data?.length) {
        notificationCreated = false
      } else {
        const { error } = await supabase.from('notifications').insert(notificationForDb)
        if (error) throw error
        notificationCreated = true
      }

      if (includeEmail && supabase?.functions?.invoke) {
        try {
          const { data: emailResult, error: emailError } = await supabase.functions.invoke('email-weekly-report-to-me', {
            body: {
              reportId,
              mode: 'notification',
              recipientUserId: recipientId,
              recipientEmail,
              notificationType,
              appUrl: typeof window !== 'undefined' ? window.location.origin : '',
            },
          })
          if (emailError || emailResult?.error) throw new Error(emailError?.message || emailResult?.error || 'Weekly report email failed.')
          emailSent = true
        } catch (emailError) {
          emailFailed = true
          console.warn('Weekly report email notification could not be sent:', emailError)
        }
      }
    } else {
      setLocal((current) => ({ ...current, notifications: [notification, ...(current.notifications || [])] }))
      notificationCreated = true
    }

    return { notificationCreated, emailSent, emailFailed, notificationFailed: false }
  }

  async function notifySupervisorAboutSubmittedReport(report) {
    const project = data.projects.find((item) => String(item.id) === String(report.project_id))
    const reportStudent = findStudentProfileForReport(data, report) || activeRoleUser || currentUser
    // Weekly reports are project/group-based. Prefer the project/group supervisor,
    // then fall back to a direct student-supervisor assignment. Never notify all supervisors.
    const supervisor = findSupervisorProfileForProject(data, project) || findAssignedSupervisorForStudent(data, reportStudent)
    if (!supervisor?.email && !supervisor?.id) {
      console.warn('No assigned supervisor found for submitted weekly report:', report.id)
      return { notificationCreated: false, notificationFailed: true, emailSent: false, emailFailed: false }
    }
    return await createReportNotification({
      recipient: supervisor,
      report,
      project,
      notificationType: 'weekly_report_submitted',
      title: 'New Weekly Report Submitted',
      message: `New weekly report submitted by ${reportStudent?.full_name || report.submitted_by || 'Student'}.`,
      includeEmail: true,
      actor: reportStudent,
    })
  }

  async function notifyStudentAboutReviewedReport(report, status, feedback) {
    const project = data.projects.find((item) => String(item.id) === String(report.project_id))
    const student = findStudentProfileForReport(data, report)
    if (!student) return
    const statusLabel = getReviewStatusLabel(status)
    const details = feedback ? `Feedback: ${feedback}` : ''
    await createReportNotification({
      recipient: student,
      report,
      project,
      notificationType: `weekly_report_review_${String(statusLabel).toLowerCase().replaceAll(' ', '_')}_${makeNotificationFingerprint(statusLabel, feedback)}`,
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
    if (isFinalWeeklyReportDecision(targetReport)) {
      setMessage('This weekly report has already received a final decision.')
      return { ok: false, alreadyDecided: true }
    }

    const updatedReports = data.reports.map((report) =>
      String(report.id) === String(reportId)
        ? { ...report, status, supervisor_feedback: feedback }
        : report
    )
    const nextProgress = calculateProjectProgressFromReports(updatedReports, targetReport.project_id)

    if (isSupabaseConfigured) {
      const finalStatusGuard = '("Accepted","Rejected","Revision Required","Revision Requested","accepted","rejected","revision_requested")'
      const { data: reviewedRow, error } = await supabase
        .from('weekly_reports')
        .update({ status, supervisor_feedback: feedback })
        .eq('id', reportId)
        .not('status', 'in', finalStatusGuard)
        .select('id,status')
        .maybeSingle()
      if (error) {
        setMessage(error.message)
        return { ok: false, error: error.message }
      }
      if (!reviewedRow) {
        setMessage('This weekly report has already received a final decision.')
        await loadFromSupabase(currentUser)
        return { ok: false, alreadyDecided: true }
      }

      const progressUpdate = await supabase.from('research_projects').update({ progress: nextProgress }).eq('id', targetReport.project_id)
      if (progressUpdate.error) return setMessage(progressUpdate.error.message)

      try {
        await notifyStudentAboutReviewedReport(targetReport, status, feedback)
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
        notification_type: `weekly_report_review_${String(statusLabel).toLowerCase().replaceAll(' ', '_')}_${makeNotificationFingerprint(statusLabel, feedback)}`,
        title: `Week ${targetReport.week_number} Report ${statusLabel}`,
        message: `Your Week ${targetReport.week_number} report has been ${statusLabel} by your supervisor.${feedback ? ` Feedback: ${feedback}` : ''}`,
        type: 'Weekly Report',
        target_role: 'student',
        is_read: false,
        created_at: new Date().toISOString(),
      } : null
      setLocal((current) => ({
        ...current,
        reports: current.reports.map((r) => r.id === reportId ? { ...r, status, supervisor_feedback: feedback } : r),
        projects: current.projects.map((p) => String(p.id) === String(targetReport.project_id) ? { ...p, progress: nextProgress } : p),
        notifications: notification ? [notification, ...(current.notifications || [])] : (current.notifications || []),
        auditLogs: [log, ...current.auditLogs],
      }))
    }
    setMessage(status === 'Accepted' ? 'Weekly report accepted successfully.' : `Supervisor review saved. Project progress is now ${formatProgress(nextProgress)}%.`)
  }


  async function uploadQuestionAttachmentFile(file, questionId, type = 'question') {
    if (!isSupabaseConfigured || !file) return null
    const validationError = validateQuestionAttachmentFile(file)
    if (validationError) throw new Error(validationError)
    const safeName = sanitizeFileName(file.name)
    const filePath = `student-questions/${questionId}/${type}/${Date.now()}-${safeName}`
    const upload = await supabase.storage.from(QUESTION_ATTACHMENT_BUCKET).upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    })
    if (upload.error) throw upload.error
    return {
      file_name: file.name,
      file_path: filePath,
      file_mime_type: file.type || 'application/octet-stream',
      file_size: file.size || null,
    }
  }

  async function openQuestionAttachment(question, type = 'question') {
    const attachment = getQuestionAttachment(question, type)
    if (!attachment) return
    if (attachment.file_url) {
      window.open(attachment.file_url, '_blank', 'noopener,noreferrer')
      return
    }
    if (!isSupabaseConfigured || !attachment.file_path) {
      setMessage('Attachment file is not available for download.')
      return
    }
    const { data: signed, error } = await supabase.storage.from(QUESTION_ATTACHMENT_BUCKET).createSignedUrl(attachment.file_path, 60 * 10, {
      download: attachment.file_name || true,
    })
    if (error || !signed?.signedUrl) {
      setMessage(error?.message || 'Could not open attachment.')
      return
    }
    window.open(signed.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function sendQuestionEmail(kind, questionId) {
    if (!isSupabaseConfigured || !supabase?.functions?.invoke) return { ok: false, error: 'Email sending requires Supabase Edge Functions.' }
    const { data: result, error } = await supabase.functions.invoke('send-platform-email', {
      body: {
        kind,
        questionId,
        appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      },
    })
    if (error) throw new Error(error.message || 'Question email could not be sent.')
    if (result?.error) throw new Error(result.error)
    return { ok: true, result }
  }

  async function createQuestionNotification({ recipient, sender, question, title, message, targetRole }) {
    if (!recipient || !question) return { ok: false }
    const note = {
      id: crypto.randomUUID(),
      profile_id: recipient.id || null,
      recipient_user_id: recipient.id || null,
      recipient_email: recipient.email || '',
      sender_user_id: sender?.id || null,
      notification_type: `student_question_${question.id}_${targetRole || 'user'}`,
      title,
      message,
      type: 'Student Question',
      target_role: targetRole || recipient.role || 'all',
      is_read: false,
      created_at: new Date().toISOString(),
    }
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('notifications').insert(note)
      if (error) return { ok: false, error: error.message }
      return { ok: true, notification: note }
    }
    return { ok: true, notification: note }
  }

  async function submitStudentQuestion(questionText, attachmentFile = null) {
    const actionUser = activeRoleUser || currentUser
    if (actionUser?.role !== 'student') {
      setMessage('Only students can submit questions to supervisors.')
      return { ok: false, error: 'Only students can submit questions.' }
    }
    const text = String(questionText || '').trim()
    if (!text) {
      setMessage('Please write your question before submitting.')
      return { ok: false, error: 'Please write your question.' }
    }
    const supervisor = findAssignedSupervisorForStudent(data, actionUser)
    if (!supervisor) {
      setMessage('No supervisor assigned yet.')
      return { ok: false, error: 'No supervisor assigned yet.' }
    }

    const question = {
      id: crypto.randomUUID(),
      student_id: actionUser?.id || null,
      student_email: actionUser?.email || '',
      student_name: actionUser?.full_name || actionUser?.email || 'Student',
      supervisor_id: supervisor.id || null,
      supervisor_email: supervisor.email || '',
      supervisor_name: supervisor.full_name || supervisor.email || 'Supervisor',
      question_text: text,
      answer_text: '',
      status: 'Pending',
      created_at: new Date().toISOString(),
      answered_at: null,
      answered_by: null,
    }

    let savedQuestion = question
    if (isSupabaseConfigured) {
      const { data: inserted, error } = await supabase.from('student_questions').insert(question).select().single()
      if (error) {
        const missingTable = String(error.message || '').toLowerCase().includes('student_questions') || String(error.message || '').toLowerCase().includes('relation')
        const messageText = missingTable ? `${error.message}. Run supabase/student_questions.sql in Supabase SQL Editor, refresh, then try again.` : error.message
        setMessage(messageText)
        return { ok: false, error: messageText }
      }
      savedQuestion = inserted
      if (attachmentFile) {
        try {
          setMessage('Uploading attachment...')
          const attachment = await uploadQuestionAttachmentFile(attachmentFile, savedQuestion.id, 'question')
          const attachmentUpdates = {
            question_attachment_name: attachment.file_name,
            question_attachment_path: attachment.file_path,
            question_attachment_mime_type: attachment.file_mime_type,
            question_attachment_size: attachment.file_size,
            question_attachment_url: '',
          }
          const { data: updatedWithAttachment, error: attachmentUpdateError } = await supabase.from('student_questions').update(attachmentUpdates).eq('id', savedQuestion.id).select().single()
          if (attachmentUpdateError) throw attachmentUpdateError
          savedQuestion = updatedWithAttachment || { ...savedQuestion, ...attachmentUpdates }
        } catch (attachmentError) {
          console.warn('Failed to upload question attachment:', attachmentError)
          await loadFromSupabase()
          setMessage('Failed to upload attachment.')
          return { ok: false, question: savedQuestion, error: attachmentError.message || 'Failed to upload attachment.' }
        }
      }
      await createQuestionNotification({
        recipient: supervisor,
        sender: actionUser,
        question: savedQuestion,
        title: 'New Student Question',
        message: attachmentFile ? `New question with attachment from ${actionUser?.full_name || actionUser?.email || 'Student'}.` : `New question from ${actionUser?.full_name || actionUser?.email || 'Student'}.`,
        targetRole: 'supervisor',
      })
      try {
        await sendQuestionEmail('student_question_submitted', savedQuestion.id)
        await loadFromSupabase()
        setMessage('Question submitted successfully and supervisor notified.')
        return { ok: true, question: savedQuestion, emailSent: true }
      } catch (emailError) {
        console.warn('Question submitted, but email notification failed:', emailError)
        await loadFromSupabase()
        setMessage('Question submitted successfully, but email notification failed.')
        return { ok: true, question: savedQuestion, emailSent: false, warning: emailError.message }
      }
    }

    if (attachmentFile) {
      try {
        Object.assign(question, await makeLocalQuestionAttachment(attachmentFile, question.id, 'question'))
      } catch (attachmentError) {
        setMessage('Failed to upload attachment.')
        return { ok: false, error: attachmentError.message || 'Failed to upload attachment.' }
      }
    }
    const notification = {
      id: crypto.randomUUID(),
      profile_id: supervisor.id || null,
      recipient_user_id: supervisor.id || null,
      recipient_email: supervisor.email || '',
      sender_user_id: actionUser?.id || null,
      notification_type: `student_question_${question.id}_supervisor`,
      title: 'New Student Question',
      message: attachmentFile ? `New question with attachment from ${actionUser?.full_name || actionUser?.email || 'Student'}.` : `New question from ${actionUser?.full_name || actionUser?.email || 'Student'}.`,
      type: 'Student Question',
      target_role: 'supervisor',
      is_read: false,
      created_at: new Date().toISOString(),
    }
    setLocal((current) => ({
      ...current,
      studentQuestions: [question, ...(current.studentQuestions || [])],
      notifications: [notification, ...(current.notifications || [])],
    }))
    setMessage('Question submitted successfully and supervisor notified locally.')
    return { ok: true, question }
  }

  async function answerStudentQuestion(questionId, answerText, attachmentFile = null) {
    const actionUser = activeRoleUser || currentUser
    if (actionUser?.role !== 'supervisor') {
      setMessage('Only supervisors can answer student questions.')
      return { ok: false, error: 'Only supervisors can answer student questions.' }
    }
    const answer = String(answerText || '').trim()
    if (!answer) {
      setMessage('Please write an answer before submitting.')
      return { ok: false, error: 'Please write an answer.' }
    }
    const question = (data.studentQuestions || []).find((item) => String(item.id) === String(questionId))
    if (!question) {
      setMessage('Question not found. Please refresh and try again.')
      return { ok: false, error: 'Question not found.' }
    }
    if (!supervisorCanAccessQuestion(data, question, actionUser)) {
      setMessage('You do not have permission to answer this question.')
      return { ok: false, error: 'You do not have permission to answer this question.' }
    }

    const updates = {
      answer_text: answer,
      status: 'Answered',
      answered_at: new Date().toISOString(),
      answered_by: actionUser?.id || null,
      answered_by_name: actionUser?.full_name || actionUser?.email || 'Supervisor',
    }
    const student = findProfileByIdentity(data, {
      id: question.student_id,
      email: question.student_email,
      submitted_by: question.student_name,
    }) || { id: question.student_id, email: question.student_email, full_name: question.student_name, role: 'student' }

    if (isSupabaseConfigured) {
      const { data: initialUpdated, error } = await supabase.from('student_questions').update(updates).eq('id', questionId).select().single()
      if (error) {
        setMessage(error.message)
        return { ok: false, error: error.message }
      }
      let updated = initialUpdated || { ...question, ...updates }
      let attachmentWarning = ''
      if (attachmentFile) {
        try {
          setMessage('Uploading attachment...')
          const attachment = await uploadQuestionAttachmentFile(attachmentFile, questionId, 'answer')
          const attachmentUpdates = {
            answer_attachment_name: attachment.file_name,
            answer_attachment_path: attachment.file_path,
            answer_attachment_mime_type: attachment.file_mime_type,
            answer_attachment_size: attachment.file_size,
            answer_attachment_url: '',
          }
          const { data: updatedWithAttachment, error: attachmentUpdateError } = await supabase.from('student_questions').update(attachmentUpdates).eq('id', questionId).select().single()
          if (attachmentUpdateError) throw attachmentUpdateError
          updated = updatedWithAttachment || { ...updated, ...attachmentUpdates }
        } catch (attachmentError) {
          console.warn('Answer saved, but attachment upload failed:', attachmentError)
          attachmentWarning = 'Answer saved, but attachment upload failed.'
        }
      }
      await createQuestionNotification({
        recipient: student,
        sender: actionUser,
        question: updated || { ...question, ...updates },
        title: 'Supervisor Answered Your Question',
        message: attachmentFile && !attachmentWarning ? 'Your supervisor answered your question and attached a file.' : 'Your supervisor answered your question.',
        targetRole: 'student',
      })
      try {
        await sendQuestionEmail('student_question_answered', questionId)
        await loadFromSupabase()
        setMessage(attachmentWarning || 'Answer submitted successfully and student notified.')
        return { ok: true, question: updated, emailSent: true, warning: attachmentWarning }
      } catch (emailError) {
        console.warn('Answer submitted, but email notification failed:', emailError)
        await loadFromSupabase()
        setMessage(attachmentWarning ? `${attachmentWarning} Email notification failed.` : 'Answer submitted successfully, but email notification failed.')
        return { ok: true, question: updated, emailSent: false, warning: attachmentWarning || emailError.message }
      }
    }

    let updatedQuestion = { ...question, ...updates }
    if (attachmentFile) {
      try {
        updatedQuestion = { ...updatedQuestion, ...(await makeLocalQuestionAttachment(attachmentFile, question.id, 'answer')) }
      } catch (attachmentError) {
        setMessage('Answer saved, but attachment upload failed.')
      }
    }
    const notification = {
      id: crypto.randomUUID(),
      profile_id: student.id || null,
      recipient_user_id: student.id || null,
      recipient_email: student.email || '',
      sender_user_id: actionUser?.id || null,
      notification_type: `student_question_${question.id}_student`,
      title: 'Supervisor Answered Your Question',
      message: 'Your supervisor answered your question.',
      type: 'Student Question',
      target_role: 'student',
      is_read: false,
      created_at: new Date().toISOString(),
    }
    setLocal((current) => ({
      ...current,
      studentQuestions: (current.studentQuestions || []).map((item) => String(item.id) === String(questionId) ? updatedQuestion : item),
      notifications: [notification, ...(current.notifications || [])],
    }))
    setMessage('Answer submitted successfully and student notified locally.')
    return { ok: true, question: updatedQuestion }
  }


  async function sendGroupJoinEmail(kind, requestId, decision = '') {
    if (!isSupabaseConfigured || !supabase?.functions?.invoke) return { ok: false, error: 'Email sending requires Supabase Edge Functions.' }
    const { data: result, error } = await supabase.functions.invoke('send-platform-email', {
      body: {
        kind,
        requestId,
        decision,
        appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      },
    })
    if (error) throw new Error(error.message || 'Group join email could not be sent.')
    if (result?.error) throw new Error(result.error)
    return { ok: true, result }
  }

  async function createGroupJoinNotification({ recipient, sender, request, title, message, targetRole }) {
    if (!recipient || !request) return { ok: false }
    const note = {
      id: crypto.randomUUID(),
      profile_id: recipient.id || null,
      recipient_user_id: recipient.id || null,
      recipient_email: recipient.email || '',
      sender_user_id: sender?.id || null,
      project_id: request.requested_group_id || null,
      notification_type: `group_join_${request.id}_${String(title || targetRole || 'notice').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      title,
      message,
      type: 'Research Group Request',
      target_role: targetRole || recipient.role || 'all',
      is_read: false,
      created_at: new Date().toISOString(),
    }
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('notifications').insert(note)
      if (error) return { ok: false, error: error.message }
      return { ok: true, notification: note }
    }
    return { ok: true, notification: note }
  }

  async function submitGroupJoinRequest(groupId, requestMessage = '') {
    const actionUser = activeRoleUser || currentUser
    if (actionUser?.role !== 'student') {
      setMessage('Only students can request to join research groups.')
      return { ok: false }
    }
    const group = (data.projects || []).find((project) => String(project.id) === String(groupId))
    if (!group) {
      setMessage('Research group not found. Please refresh and try again.')
      return { ok: false }
    }
    if (!isApprovedResearchProject(group)) {
      setMessage('This research group is not approved yet and cannot accept join requests.')
      return { ok: false }
    }
    const currentGroup = getStudentCurrentResearchGroup(data, actionUser)
    if (currentGroup) {
      setMessage('You are already assigned to a research group.')
      return { ok: false }
    }
    const existingPending = (data.groupJoinRequests || []).find((request) =>
      requestOwnedByStudent(request, actionUser) &&
      String(request.requested_group_id || '') === String(group.id) &&
      String(request.status || '').toLowerCase() === 'pending'
    )
    if (existingPending) {
      setMessage('Your request is pending.')
      return { ok: false }
    }

    const supervisor = findSupervisorProfileForProject(data, group)
    const request = {
      id: crypto.randomUUID(),
      student_id: actionUser.id || null,
      student_email: actionUser.email || '',
      student_name: actionUser.full_name || actionUser.email || 'Student',
      requested_group_id: group.id,
      requested_group_name: group.group_name || group.title || 'Research Group',
      requested_project_title: group.title || '',
      current_group_id: currentGroup?.id || null,
      current_group_name: currentGroup?.group_name || '',
      supervisor_id: supervisor?.id || group.supervisor_id || null,
      supervisor_email: supervisor?.email || group.supervisor_email || '',
      supervisor_name: supervisor?.full_name || group.supervisor_name || '',
      status: 'Pending',
      request_message: String(requestMessage || '').trim(),
      decision_message: '',
      requested_at: new Date().toISOString(),
      decided_at: null,
      decided_by: null,
      decided_by_name: '',
      decision_email_sent_at: null,
    }

    let savedRequest = request
    if (isSupabaseConfigured) {
      const { id, ...requestForDb } = request
      const { data: inserted, error } = await supabase.from('group_join_requests').insert(requestForDb).select().single()
      if (error) {
        const missingTable = String(error.message || '').toLowerCase().includes('group_join_requests') || String(error.message || '').toLowerCase().includes('relation')
        const messageText = missingTable ? `${error.message}. Run supabase/group_join_requests.sql in Supabase SQL Editor, refresh, then try again.` : error.message
        setMessage(messageText)
        return { ok: false, error: messageText }
      }
      savedRequest = inserted
      const groupManagers = (data.profiles || []).filter((profile) => profile.role === 'admin' || profile.role === 'committee')
      for (const manager of groupManagers) {
        await createGroupJoinNotification({
          recipient: manager,
          sender: actionUser,
          request: savedRequest,
          title: 'New Research Group Join Request',
          message: `${actionUser.full_name || actionUser.email || 'A student'} requested to join ${group.group_name || group.title || 'a research group'}.`,
          targetRole: manager.role || 'admin',
        })
      }
      if (supervisor) {
        await createGroupJoinNotification({
          recipient: supervisor,
          sender: actionUser,
          request: savedRequest,
          title: 'New Research Group Join Request',
          message: `${actionUser.full_name || actionUser.email || 'A student'} requested to join ${group.group_name || group.title || 'your research group'}.`,
          targetRole: 'supervisor',
        })
      }
      try {
        await sendGroupJoinEmail('group_join_request_submitted', savedRequest.id)
      } catch (emailError) {
        console.warn('Group join request email could not be sent:', emailError)
      }
      await loadFromSupabase(actionUser)
    } else {
      const groupManagers = (data.profiles || []).filter((profile) => profile.role === 'admin' || profile.role === 'committee')
      const notices = groupManagers.map((manager) => ({
        id: crypto.randomUUID(),
        profile_id: manager.id,
        recipient_user_id: manager.id,
        recipient_email: manager.email || '',
        sender_user_id: actionUser?.id || null,
        project_id: group.id,
        notification_type: `group_join_${request.id}_${manager.role || 'manager'}`,
        title: 'New Research Group Join Request',
        message: `${actionUser.full_name || actionUser.email || 'A student'} requested to join ${group.group_name || group.title || 'a research group'}.`,
        type: 'Research Group Request',
        target_role: manager.role || 'admin',
        is_read: false,
        created_at: new Date().toISOString(),
      }))
      setLocal((current) => ({
        ...current,
        groupJoinRequests: [request, ...(current.groupJoinRequests || [])],
        notifications: [...notices, ...(current.notifications || [])],
      }))
    }
    setMessage('Research group join request submitted successfully.')
    return { ok: true, request: savedRequest }
  }

  async function decideGroupJoinRequest(requestId, status, decisionMessage = '') {
    const request = (data.groupJoinRequests || []).find((item) => String(item.id) === String(requestId))
    if (!request) {
      setMessage('Group join request not found. Please refresh and try again.')
      return { ok: false }
    }
    const normalizedStatus = status === 'Accepted' ? 'Accepted' : 'Rejected'
    if (!canManageAllGroupMemberships(currentUser) && !requestVisibleToSupervisor(data, request, currentUser)) {
      setMessage('You do not have permission to manage this group join request.')
      return { ok: false }
    }
    if (request.status && request.status !== 'Pending') {
      setMessage(`This request is already ${request.status}.`)
      return { ok: false, alreadyDecided: true }
    }
    const group = (data.projects || []).find((project) => String(project.id) === String(request.requested_group_id))
    const student = findProfileByIdentity(data, { id: request.student_id, email: request.student_email, submitted_by: request.student_name })
    if (!group || !student) {
      setMessage('Student or research group was not found. Please refresh and try again.')
      return { ok: false }
    }
    if (normalizedStatus === 'Accepted' && !isApprovedResearchProject(group)) {
      setMessage('This project is not approved by the Research Committee yet. Students can only join approved projects.')
      return { ok: false }
    }
    const currentStudentGroup = normalizedStatus === 'Accepted' ? getStudentCurrentResearchGroup(data, student) : null
    if (currentStudentGroup?.id && String(currentStudentGroup.id) !== String(group.id)) {
      setMessage('This student is already assigned to a research group.')
      return { ok: false, blocked: true }
    }

    const decidedAt = new Date().toISOString()
    const decisionUpdates = {
      status: normalizedStatus,
      decision_message: String(decisionMessage || '').trim(),
      decided_at: decidedAt,
      decided_by: currentUser?.id || null,
      decided_by_name: currentUser?.full_name || currentUser?.email || (isResearchCommitteeUser(currentUser) ? 'Research Committee' : 'Admin'),
    }
    let emailFailed = false

    try {
      if (isSupabaseConfigured) {
        const rpcName = normalizedStatus === 'Accepted' ? 'accept_group_join_request' : 'reject_group_join_request'
        const { error: rpcError } = await supabase.rpc(rpcName, {
          request_id: requestId,
          decision_message: decisionUpdates.decision_message || '',
        })
        if (rpcError) {
          const rpcMessage = String(rpcError.message || '')
          const rpcMessageLower = rpcMessage.toLowerCase()
          if (isMissingRpcFunction(rpcError)) {
            throw new Error('Group join approval backend function is missing. Run supabase/group_join_request_profile_safe_accept_fix.sql in Supabase SQL Editor, then try again.')
          }
          if (rpcMessageLower.includes('supervisor assignment cannot be changed') || rpcMessageLower.includes('decision_message') || rpcMessageLower.includes('ambiguous')) {
            throw new Error('Group join approval database function needs the latest safe fix. Run supabase/group_join_request_profile_safe_accept_fix.sql in Supabase SQL Editor, then try again.')
          }
          throw rpcError
        }

        await createGroupJoinNotification({
          recipient: student,
          sender: currentUser,
          request: { ...request, ...decisionUpdates },
          title: normalizedStatus === 'Accepted' ? 'Research Group Join Request Accepted' : 'Research Group Join Request Rejected',
          message: normalizedStatus === 'Accepted' ? `You have joined ${group.group_name || group.title || 'your research group'}. You can now submit weekly reports.` : 'Your research group join request was rejected.',
          targetRole: 'student',
        })
        if (normalizedStatus === 'Accepted') {
          const supervisor = findSupervisorProfileForProject(data, group)
          if (supervisor?.id || supervisor?.email) {
            await createGroupJoinNotification({
              recipient: supervisor,
              sender: currentUser,
              request: { ...request, ...decisionUpdates },
              title: 'Student Joined Research Group',
              message: `${student.full_name || student.email || 'A student'} joined ${group.group_name || group.title || 'your research group'}.`,
              targetRole: 'supervisor',
            })
            try {
              await sendSupervisorGroupMemberEmail(group.id, { id: student.id, email: student.email, name: student.full_name })
            } catch (supervisorEmailError) {
              console.warn('Supervisor group membership email failed:', supervisorEmailError)
              emailFailed = true
            }
          }
        }
        try {
          await sendGroupJoinEmail('group_join_decision', requestId, normalizedStatus)
        } catch (emailError) {
          console.warn('Group join decision email failed:', emailError)
          emailFailed = true
        }
        await loadFromSupabase(currentUser)
      } else {
        const existingStudents = listValue(group.students)
        const memberLabels = [student.full_name, student.email].filter(Boolean)
        const nextStudents = normalizedStatus === 'Accepted' ? uniqueTextList([...existingStudents, ...memberLabels]) : existingStudents
        const notification = {
          id: crypto.randomUUID(),
          profile_id: student.id || null,
          recipient_user_id: student.id || null,
          recipient_email: student.email || '',
          sender_user_id: currentUser?.id || null,
          project_id: group.id,
          notification_type: `group_join_${request.id}_${normalizedStatus.toLowerCase()}`,
          title: normalizedStatus === 'Accepted' ? 'Research Group Join Request Accepted' : 'Research Group Join Request Rejected',
          message: normalizedStatus === 'Accepted' ? `You have joined ${group.group_name || group.title || 'your research group'}. You can now submit weekly reports.` : 'Your research group join request was rejected.',
          type: 'Research Group Request',
          target_role: 'student',
          is_read: false,
          created_at: decidedAt,
        }
        setLocal((current) => ({
          ...current,
          groupJoinRequests: (current.groupJoinRequests || []).map((item) => String(item.id) === String(requestId) ? { ...item, ...decisionUpdates } : item),
          projects: (current.projects || []).map((project) => String(project.id) === String(group.id) ? { ...project, students: nextStudents } : project),
          profiles: (current.profiles || []).map((profile) => String(profile.id) === String(student.id) ? { ...profile, current_research_group_id: normalizedStatus === 'Accepted' ? group.id : profile.current_research_group_id, current_research_group_name: normalizedStatus === 'Accepted' ? group.group_name : profile.current_research_group_name } : profile),
          groupMembers: normalizedStatus === 'Accepted' ? [{ id: crypto.randomUUID(), group_id: group.id, project_id: group.id, student_id: student.id || null, student_email: student.email || null, student_name: student.full_name || student.email || 'Student', supervisor_id: group.supervisor_id || null, supervisor_email: group.supervisor_email || '', supervisor_name: group.supervisor_name || '', status: 'Active', joined_at: decidedAt }, ...(current.groupMembers || [])] : (current.groupMembers || []),
          notifications: [notification, ...(current.notifications || [])],
        }))
      }
      if (normalizedStatus === 'Accepted') {
        setMessage(emailFailed ? 'Request accepted, but email notification failed.' : 'Request accepted and student notified by email.')
      } else {
        setMessage(emailFailed ? 'Request rejected, but email notification failed.' : 'Request rejected and student notified by email.')
      }
      return { ok: true, emailSent: !emailFailed }
    } catch (error) {
      setMessage(error.message || `Failed to ${normalizedStatus === 'Accepted' ? 'accept' : 'reject'} group join request.`)
      return { ok: false, error: error.message }
    }
  }


  async function sendDirectGroupAddEmail(groupId, student) {
    if (!isSupabaseConfigured || !supabase?.functions?.invoke) return { ok: false, error: 'Email sending requires Supabase Edge Functions.' }
    const { data: result, error } = await supabase.functions.invoke('send-platform-email', {
      body: {
        kind: 'group_member_added_directly',
        groupId,
        studentId: student?.id || null,
        studentEmail: student?.email || '',
        addedByRole: isResearchCommitteeUser(currentUser) ? 'Research Committee' : isAdminUser(currentUser) ? 'Admin' : 'Supervisor',
        appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      },
    })
    if (error) throw new Error(error.message || 'Student group email could not be sent.')
    if (result?.error) throw new Error(result.error)
    return { ok: true, result }
  }

  async function sendSupervisorGroupMemberEmail(groupId, student) {
    if (!isSupabaseConfigured || !supabase?.functions?.invoke) return { ok: false, error: 'Email sending requires Supabase Edge Functions.' }
    const { data: result, error } = await supabase.functions.invoke('send-platform-email', {
      body: {
        kind: 'group_member_added_supervisor_notice',
        groupId,
        studentId: student?.id || null,
        studentEmail: student?.email || '',
        addedByRole: isResearchCommitteeUser(currentUser) ? 'Research Committee' : isAdminUser(currentUser) ? 'Admin' : 'Supervisor',
        appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      },
    })
    if (error) throw new Error(error.message || 'Supervisor group email could not be sent.')
    if (result?.error) throw new Error(result.error)
    return { ok: true, result }
  }

  async function directAddStudentsToGroup(projectId, studentKeys = []) {
    const group = (data.projects || []).find((project) => String(project.id) === String(projectId))
    if (!group || !canManageAllGroupMemberships(currentUser)) {
      setMessage('You do not have permission to add students to this research group.')
      return { ok: false }
    }
    if (!isApprovedResearchProject(group)) {
      setMessage('Students can only be added to projects approved by the Research Committee.')
      return { ok: false }
    }
    const selectedStudents = (data.profiles || [])
      .filter((profile) => profile.role === 'student')
      .map((student) => ({
        key: makeStudentOptionKey(student),
        id: student.id,
        email: student.email || '',
        name: student.full_name || student.email || 'Student',
        currentGroup: getStudentCurrentResearchGroup(data, student),
        assignedSupervisor: student.assigned_supervisor_name || student.assigned_supervisor_email || '',
      }))
      .filter((student) => studentKeys.includes(student.key))

    if (!selectedStudents.length) {
      setMessage('Please select at least one student.')
      return { ok: false }
    }

    const blockedStudent = selectedStudents.find((student) => student.currentGroup?.id && String(student.currentGroup.id) !== String(group.id))
    if (blockedStudent) {
      setMessage('This student is already assigned to a research group.')
      return { ok: false, blocked: true }
    }

    const alreadyInGroup = new Set(getProjectMemberProfiles(data, group, data.reports || []).map((member) => member.id || normalizeText(member.email) || normalizeText(member.full_name)).filter(Boolean))
    const studentsToAdd = selectedStudents.filter((student) => !alreadyInGroup.has(student.id || normalizeText(student.email) || normalizeText(student.name)))
    if (!studentsToAdd.length) {
      setMessage('Selected student is already in this research group.')
      return { ok: false, alreadyMember: true }
    }

    const existingStudents = listValue(group.students)
    const nextStudentLabels = uniqueTextList([...existingStudents, ...studentsToAdd.flatMap((student) => [student.name, student.email]).filter(Boolean)])
    const now = new Date().toISOString()
    let emailFailed = false

    try {
      if (isSupabaseConfigured) {
        const projectUpdate = await supabase.from('research_projects').update({ students: nextStudentLabels }).eq('id', group.id)
        if (projectUpdate.error) throw projectUpdate.error

        for (const student of studentsToAdd) {
          const membershipUpdate = await supabase.from('research_group_members').upsert({
            group_id: group.id,
            project_id: group.id,
            student_id: student.id || null,
            student_email: student.email || null,
            student_name: student.name || student.email || 'Student',
            supervisor_id: group.supervisor_id || null,
            supervisor_email: group.supervisor_email || '',
            supervisor_name: group.supervisor_name || '',
            status: 'Active',
            joined_at: now,
            added_by: currentUser?.id || null,
          }, { onConflict: student.id ? 'group_id,student_id' : 'group_id,student_email' })
          if (membershipUpdate.error) throw membershipUpdate.error

          const profile = findProfileByIdentity(data, { id: student.id, email: student.email }) || { id: student.id, email: student.email, full_name: student.name, role: 'student' }
          await createGroupJoinNotification({
            recipient: profile,
            sender: currentUser,
            request: { id: `direct-${group.id}-${student.id || student.email}`, requested_group_id: group.id },
            title: 'Added to Research Group',
            message: `You were added to ${group.group_name || group.title || 'a research group'} by ${isResearchCommitteeUser(currentUser) ? 'Research Committee' : 'Admin'}. You can now submit weekly reports.`,
            targetRole: 'student',
          })

          try {
            await sendDirectGroupAddEmail(group.id, student)
          } catch (emailError) {
            console.warn('Direct group add email failed:', emailError)
            emailFailed = true
          }

          const supervisor = findSupervisorProfileForProject(data, group)
          if (supervisor?.id || supervisor?.email) {
            await createGroupJoinNotification({
              recipient: supervisor,
              sender: currentUser,
              request: { id: `direct-supervisor-${group.id}-${student.id || student.email}`, requested_group_id: group.id },
              title: 'Student Added to Research Group',
              message: `${student.name || student.email || 'A student'} was added to ${group.group_name || group.title || 'your research group'}.`,
              targetRole: 'supervisor',
            })
            try {
              await sendSupervisorGroupMemberEmail(group.id, student)
            } catch (supervisorEmailError) {
              console.warn('Supervisor group add email failed:', supervisorEmailError)
              emailFailed = true
            }
          }
        }
        await loadFromSupabase(currentUser)
      } else {
        const notifications = studentsToAdd.map((student) => ({
          id: crypto.randomUUID(),
          profile_id: student.id || null,
          recipient_user_id: student.id || null,
          recipient_email: student.email || '',
          sender_user_id: currentUser?.id || null,
          project_id: group.id,
          notification_type: `group_direct_add_${group.id}_${student.id || normalizeText(student.email)}`,
          title: 'Added to Research Group',
          message: `You were added to ${group.group_name || group.title || 'a research group'}. You can now submit weekly reports.`,
          type: 'Research Group Membership',
          target_role: 'student',
          is_read: false,
          created_at: now,
        }))
        setLocal((current) => ({
          ...current,
          projects: current.projects.map((project) => String(project.id) === String(group.id) ? { ...project, students: nextStudentLabels } : project),
          profiles: current.profiles.map((profile) => studentsToAdd.some((student) => String(student.id) === String(profile.id)) ? { ...profile, current_research_group_id: group.id, current_research_group_name: group.group_name || group.title || 'Research Group' } : profile),
          groupMembers: [...studentsToAdd.map((student) => ({ id: crypto.randomUUID(), group_id: group.id, project_id: group.id, student_id: student.id || null, student_email: student.email || null, student_name: student.name || student.email || 'Student', supervisor_id: group.supervisor_id || null, supervisor_email: group.supervisor_email || '', supervisor_name: group.supervisor_name || '', status: 'Active', joined_at: now, added_by: currentUser?.id || null })), ...(current.groupMembers || [])],
          notifications: [...notifications, ...(current.notifications || [])],
        }))
      }

      const successMessage = studentsToAdd.length === 1 ? 'Student added to research group successfully.' : 'Students added to research group successfully.'
      setMessage(emailFailed ? 'Student added successfully, but email notification failed.' : successMessage)
      return { ok: true, emailSent: !emailFailed }
    } catch (error) {
      setMessage(error.message || 'Could not add students to research group.')
      return { ok: false, error: error.message }
    }
  }

  async function supervisorAddStudentsToGroup(projectId, studentKeys = []) {
    const group = (data.projects || []).find((project) => String(project.id) === String(projectId))
    if (!group || !supervisorCanManageGroup(group, currentUser)) {
      setMessage('You do not have permission to manage this research group.')
      return { ok: false }
    }
    if (!isApprovedResearchProject(group)) {
      setMessage('Students can only be added to projects approved by the Research Committee.')
      return { ok: false }
    }
    const assignedStudents = mergeStudentOptions(
      getAssignedSupervisorStudents(data, [group], data.reports),
      getDirectAssignedStudentsForSupervisor(data, currentUser)
    )
    const selectedStudents = assignedStudents.filter((student) => studentKeys.includes(student.key))
    if (!selectedStudents.length) {
      setMessage('Please select at least one assigned student.')
      return { ok: false }
    }
    const existingStudents = listValue(group.students)
    const nextStudentLabels = uniqueTextList([...existingStudents, ...selectedStudents.flatMap((student) => [student.name, student.email]).filter(Boolean)])
    try {
      if (isSupabaseConfigured) {
        const projectUpdate = await supabase.from('research_projects').update({ students: nextStudentLabels }).eq('id', group.id)
        if (projectUpdate.error) throw projectUpdate.error
        for (const student of selectedStudents) {
          if (!student.id && !student.email) continue
          try {
            const membershipUpdate = await supabase.from('research_group_members').upsert({
              group_id: group.id,
              project_id: group.id,
              student_id: student.id || null,
              student_email: student.email || null,
              student_name: student.name || student.email || 'Student',
              supervisor_id: group.supervisor_id || currentUser?.id || null,
              supervisor_email: group.supervisor_email || currentUser?.email || '',
              supervisor_name: group.supervisor_name || currentUser?.full_name || '',
              status: 'Active',
              added_by: currentUser?.id || null,
            }, { onConflict: student.id ? 'group_id,student_id' : 'group_id,student_email' })
            if (membershipUpdate.error) throw membershipUpdate.error
          } catch (membershipError) {
            const missingMembershipTable = String(membershipError.message || '').toLowerCase().includes('research_group_members') || String(membershipError.message || '').toLowerCase().includes('relation')
            if (!missingMembershipTable) throw membershipError
            console.warn('research_group_members table is not available yet. Run supabase/group_join_requests.sql to enable official group membership records.', membershipError)
          }
          if (!student.id) continue
          const profile = findProfileByIdentity(data, { id: student.id, email: student.email }) || { id: student.id, email: student.email, full_name: student.name, role: 'student' }
          await createGroupJoinNotification({
            recipient: profile,
            sender: currentUser,
            request: { id: `${group.id}-${student.id}`, requested_group_id: group.id },
            title: 'Added to Research Group',
            message: `You were added to ${group.group_name || group.title || 'a research group'} by your supervisor.`,
            targetRole: 'student',
          })
        }
        await loadFromSupabase(currentUser)
      } else {
        setLocal((current) => ({
          ...current,
          projects: current.projects.map((project) => String(project.id) === String(group.id) ? { ...project, students: nextStudentLabels } : project),
          profiles: current.profiles.map((profile) => selectedStudents.some((student) => String(student.id) === String(profile.id)) ? { ...profile, current_research_group_id: group.id, current_research_group_name: group.group_name || group.title || 'Research Group' } : profile),
          groupMembers: [...selectedStudents.map((student) => ({ id: crypto.randomUUID(), group_id: group.id, project_id: group.id, student_id: student.id || null, student_email: student.email || null, student_name: student.name || student.email || 'Student', supervisor_id: group.supervisor_id || currentUser?.id || null, supervisor_email: group.supervisor_email || currentUser?.email || '', supervisor_name: group.supervisor_name || currentUser?.full_name || '', status: 'Active', joined_at: new Date().toISOString() })), ...(current.groupMembers || [])],
        }))
      }
      setMessage('Students added to research group successfully.')
      return { ok: true }
    } catch (error) {
      setMessage(error.message || 'Could not add students to research group.')
      return { ok: false, error: error.message }
    }
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
    if (!(await showAppConfirm('Are you sure you want to delete this item?', { title: 'Delete Item', type: 'danger', confirmLabel: 'Delete' }))) return

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
    if (!(await showAppConfirm('Are you sure you want to delete this item?', { title: 'Delete Item', type: 'danger', confirmLabel: 'Delete' }))) return

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
    if (!(await showAppConfirm('Are you sure you want to delete this account? This action cannot be undone.', { title: 'Delete Account', type: 'danger', confirmLabel: 'Delete Account' }))) return

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
    if (!(await showAppConfirm('Are you sure you want to delete this research title?', { title: 'Delete Research Title', type: 'danger', confirmLabel: 'Delete' }))) return

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
          groupJoinRequests: (current.groupJoinRequests || []).filter((request) => String(request.requested_group_id) !== String(projectId) && String(request.current_group_id) !== String(projectId)),
          groupMembers: (current.groupMembers || []).filter((member) => String(member.group_id || member.project_id || member.research_project_id || '') !== String(projectId)),
          deadlines: (current.deadlines || []).filter((deadline) => ![deadline.project_id, deadline.research_project_id, deadline.target_project_id, deadline.group_id].some((value) => String(value || '') === String(projectId))),
          profiles: (current.profiles || []).map((profile) => [profile.current_research_group_id, profile.research_group_id, profile.group_id, profile.project_id, profile.research_title_id].some((value) => String(value || '') === String(projectId)) ? { ...profile, current_research_group_id: null, current_research_group_name: '', research_group_id: null, group_id: null, project_id: null, research_title_id: null } : profile),
          auditLogs: [log, ...current.auditLogs],
        }))
      }
      setMessage('Research title deleted successfully.')
    } catch (error) {
      setMessage(error.message?.toLowerCase?.().includes('permission') || error.message?.toLowerCase?.().includes('row-level security') ? 'You do not have permission to perform this action.' : (error.message || 'Failed to delete research title.'))
    }
  }

  async function deleteResearchGroup(groupName) {
    const normalizedGroup = String(groupName || '').trim()
    if (!normalizedGroup) return setMessage('Research group not found. Please refresh and try again.')
    if (!canDeleteResearchGroup(normalizedGroup, currentUser)) {
      return setMessage('You do not have permission to perform this action.')
    }
    if (!(await showAppConfirm('Are you sure you want to delete this research group?', { title: 'Delete Research Group', type: 'danger', confirmLabel: 'Delete' }))) return

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
          groupJoinRequests: (current.groupJoinRequests || []).filter((request) => !groupProjectIds.includes(String(request.requested_group_id)) && !groupProjectIds.includes(String(request.current_group_id)) && normalizeText(request.requested_group_name) !== normalizeText(normalizedGroup)),
          groupMembers: (current.groupMembers || []).filter((member) => !groupProjectIds.includes(String(member.group_id || member.project_id || member.research_project_id || ''))),
          deadlines: (current.deadlines || []).filter((deadline) => ![deadline.project_id, deadline.research_project_id, deadline.target_project_id, deadline.group_id].some((value) => groupProjectIds.includes(String(value || '')))),
          profiles: (current.profiles || []).map((profile) => groupProjectIds.includes(String(profile.current_research_group_id || profile.research_group_id || profile.group_id || profile.project_id || profile.research_title_id || '')) || normalizeText(profile.current_research_group_name) === normalizeText(normalizedGroup) ? { ...profile, current_research_group_id: null, current_research_group_name: '', research_group_id: null, group_id: null, project_id: null, research_title_id: null } : profile),
          auditLogs: [log, ...current.auditLogs],
        }))
      }
      setMessage('Research group deleted successfully.')
    } catch (error) {
      setMessage(error.message?.toLowerCase?.().includes('permission') || error.message?.toLowerCase?.().includes('row-level security') ? 'You do not have permission to perform this action.' : (error.message || 'Failed to delete project.'))
    }
  }

  async function updateProject(projectId, fields) {
    const targetProject = (data.projects || []).find((project) => String(project.id) === String(projectId)) || {}
    const nextFields = { ...fields }
    const approvalChanged = Object.prototype.hasOwnProperty.call(nextFields, 'approval') && String(targetProject.approval || '') !== String(nextFields.approval || '')
    if (approvalChanged && isProjectCommitteeDecided(targetProject)) {
      return setMessage('This title submission has already received a final decision.')
    }
    if (approvalChanged) {
      nextFields.reviewed_at = new Date().toISOString()
      nextFields.reviewed_by = currentUser?.id || null
      nextFields.reviewed_by_name = currentUser?.full_name || currentUser?.email || ''
      if (nextFields.approval === 'Approved') nextFields.accepted_at = nextFields.reviewed_at
    }
    let emailFailed = false
    if (isSupabaseConfigured) {
      const { data: projectUpdateRow, error } = await supabase.from('research_projects').update(nextFields).eq('id', projectId).select('id').maybeSingle()
      if (error) return setMessage(error.message || 'Project update failed.')
      if (approvalChanged && !projectUpdateRow) return setMessage('This title submission has already received a final decision.')
      if (approvalChanged) {
        const supervisor = findSupervisorProfileForProject(data, targetProject) || { id: targetProject.supervisor_id, email: targetProject.supervisor_email, full_name: targetProject.supervisor_name, role: 'supervisor' }
        if (supervisor?.id || supervisor?.email) {
          const note = {
            profile_id: supervisor.id || null,
            recipient_user_id: supervisor.id || null,
            recipient_email: supervisor.email || '',
            sender_user_id: currentUser?.id || null,
            project_id: projectId,
            notification_type: `supervisor_project_${projectId}_${String(nextFields.approval).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
            title: nextFields.approval === 'Approved' ? 'Research Project Accepted' : nextFields.approval === 'Rejected' ? 'Research Project Rejected' : 'Research Project Revision Requested',
            message: nextFields.approval === 'Approved'
              ? `${targetProject.title || 'Your research project'} was approved and is now available for students to request joining.`
              : `${targetProject.title || 'Your research project'} status changed to ${nextFields.approval}.`,
            type: 'Supervisor Project Review',
            target_role: 'supervisor',
            is_read: false,
            created_at: nextFields.reviewed_at,
          }
          const noticeResult = await supabase.from('notifications').insert(note)
          if (noticeResult.error) console.warn('Project review notification failed:', noticeResult.error)
        }
        try {
          await sendSupervisorProjectWorkflowEmail('supervisor_project_reviewed', projectId, nextFields.approval)
        } catch (emailError) {
          console.warn('Project review email failed:', emailError)
          emailFailed = true
        }
      }
      await addAudit(currentUser.full_name, 'updated', `project ${projectId}`)
      await loadFromSupabase(currentUser)
    } else {
      const log = makeAudit(currentUser.full_name, 'updated', `project ${projectId}`)
      setLocal((current) => ({
        ...current,
        projects: current.projects.map((p) => p.id === projectId ? { ...p, ...nextFields } : p),
        auditLogs: [log, ...current.auditLogs],
      }))
    }
    setMessage(approvalChanged && emailFailed ? 'Decision saved, but email notification failed.' : approvalChanged ? 'Project decision saved.' : 'Project updated.')
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


  function formatEdgeFunctionError(error, functionName = 'assign-supervisor') {
    const message = String(error?.message || error || '')
    const details = String(error?.context?.message || error?.details || '')
    const combined = [message, details].filter(Boolean).join(' ')
    if (/failed to send a request|fetch|network|cors/i.test(combined)) {
      return `Failed to send a request to the ${functionName} Edge Function. Deploy it with --no-verify-jwt and check Supabase Edge Function logs.`
    }
    return combined || `The ${functionName} Edge Function failed.`
  }

  async function assignSupervisorThroughEdgeFunction({ student, supervisorId, projectId = '' }) {
    if (!isSupabaseConfigured) throw new Error('Supabase Edge Functions are not configured.')

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase URL or anon key is missing.')

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (sessionError || !accessToken) throw new Error('Please log out, log in again, and try assigning the supervisor again.')

    const payload = {
      studentId: student.id,
      supervisorId: supervisorId || null,
      projectId: projectId || null,
      action: supervisorId ? 'assign' : 'remove',
      appUrl: window.location?.origin || '',
    }

    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/assign-supervisor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })

    const text = await response.text().catch(() => '')
    let result = null
    try {
      result = text ? JSON.parse(text) : null
    } catch (_parseError) {
      result = { error: text }
    }

    if (!response.ok) {
      throw new Error(result?.error || result?.message || `assign-supervisor Edge Function failed with status ${response.status}.`)
    }
    if (result?.error) throw new Error(result.error)
    return result || { success: true }
  }

  async function sendSupervisorAssignmentEmails({ student, supervisor, linkedProjects = [], assignedAt }) {
    if (!isSupabaseConfigured) throw new Error('Automatic email requires Supabase Edge Function send-assignment-email.')
    if (!student?.email) throw new Error('Student email address is missing.')
    if (!supervisor?.email) throw new Error('Supervisor email address is missing.')

    const projectIds = linkedProjects.map((project) => project.id).filter(Boolean)
    const appUrl = window.location?.origin || ''
    const { data: result, error } = await supabase.functions.invoke('send-assignment-email', {
      body: {
        kind: 'assignment',
        studentId: student.id,
        supervisorId: supervisor.id,
        projectIds,
        assignmentDate: assignedAt,
        appUrl,
      },
    })

    if (error) throw new Error(formatEdgeFunctionError(error, 'send-assignment-email'))
    if (result?.error) throw new Error(result.error)
    return result || { success: true }
  }

  async function assignStudentToSupervisor(studentId, supervisorId, options = {}) {
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

    const projectAlreadyAssignedToSupervisor = supervisor ? linkedProjects.some((project) => (
      String(project.supervisor_id || '') === String(supervisor.id) ||
      normalizeText(project.supervisor_email) === normalizeText(supervisor.email) ||
      normalizeText(project.supervisor_name) === normalizeText(supervisor.full_name)
    )) : false
    const profileAlreadyAssignedToSupervisor = supervisor ? (
      String(student.assigned_supervisor_id || '') === String(supervisor.id) ||
      normalizeText(student.assigned_supervisor_email) === normalizeText(supervisor.email) ||
      normalizeText(student.assigned_supervisor_name) === normalizeText(supervisor.full_name)
    ) : false
    const alreadyAssignedToSameSupervisor = Boolean(supervisor && (profileAlreadyAssignedToSupervisor || projectAlreadyAssignedToSupervisor))
    const assignmentEmailAlreadySent = Boolean(supervisor && student.assigned_supervisor_email_sent_at && (
      String(student.assigned_supervisor_email_supervisor_id || '') === String(supervisor.id) ||
      normalizeText(student.assigned_supervisor_email_supervisor_email) === normalizeText(supervisor.email)
    ))
    const hasAnySupervisorAssignment = Boolean(student.assigned_supervisor_id || student.assigned_supervisor_email || student.assigned_supervisor_name || linkedProjects.some((project) => project.supervisor_id || project.supervisor_email || (project.supervisor_name && project.supervisor_name !== 'Pending Assignment')))
    const removalWithoutChange = !supervisor && !hasAnySupervisorAssignment

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

    if (options.assignmentScope === 'student') {
      const previousSupervisor = student.assigned_supervisor_id
        ? data.profiles.find((user) => String(user.id) === String(student.assigned_supervisor_id))
        : data.profiles.find((user) => user.role === 'supervisor' && (normalizeText(user.email) === normalizeText(student.assigned_supervisor_email) || normalizeText(user.full_name) === normalizeText(student.assigned_supervisor_name)))
      if (supervisor && alreadyAssignedToSameSupervisor && assignmentEmailAlreadySent) {
        setMessage(`${student.full_name || student.email} is already assigned to ${supervisor.full_name || supervisor.email}. No duplicate email was sent.`)
        return
      }
      const assignedAt = new Date().toISOString()
      let emailError = null

      try {
        if (isSupabaseConfigured) {
          const rpcResult = await supabase.rpc('admin_assign_student_supervisor_only', {
            target_student_id: student.id,
            target_supervisor_id: supervisor?.id || null,
          })
          if (rpcResult.error) throw rpcResult.error

          const notices = []
          if (supervisor) {
            notices.push({
              profile_id: student.id || null,
              recipient_user_id: student.id || null,
              recipient_email: student.email || '',
              sender_user_id: currentUser?.id || null,
              notification_type: `student_supervisor_assigned_${student.id}_${supervisor.id}`,
              title: 'Supervisor Assigned',
              message: `${supervisor.full_name || supervisor.email || 'A supervisor'} has been assigned as your supervisor.`,
              type: 'Supervisor Assignment',
              target_role: 'student',
              is_read: false,
              created_at: assignedAt,
            })
            notices.push({
              profile_id: supervisor.id || null,
              recipient_user_id: supervisor.id || null,
              recipient_email: supervisor.email || '',
              sender_user_id: currentUser?.id || null,
              notification_type: `student_assigned_to_supervisor_${student.id}_${supervisor.id}`,
              title: 'New Student Assigned',
              message: `${student.full_name || student.email || 'A student'} has been assigned to you by admin.`,
              type: 'Supervisor Assignment',
              target_role: 'supervisor',
              is_read: false,
              created_at: assignedAt,
            })
          } else {
            notices.push({
              profile_id: student.id || null,
              recipient_user_id: student.id || null,
              recipient_email: student.email || '',
              sender_user_id: currentUser?.id || null,
              notification_type: `student_supervisor_removed_${student.id}_${assignedAt}`,
              title: 'Supervisor Removed',
              message: 'Your supervisor assignment was removed by admin.',
              type: 'Supervisor Assignment',
              target_role: 'student',
              is_read: false,
              created_at: assignedAt,
            })
            if (previousSupervisor?.id || previousSupervisor?.email) {
              notices.push({
                profile_id: previousSupervisor.id || null,
                recipient_user_id: previousSupervisor.id || null,
                recipient_email: previousSupervisor.email || '',
                sender_user_id: currentUser?.id || null,
                notification_type: `student_supervisor_removed_notice_${student.id}_${previousSupervisor.id || normalizeText(previousSupervisor.email)}_${assignedAt}`,
                title: 'Student Supervisor Assignment Removed',
                message: `${student.full_name || student.email || 'A student'} is no longer assigned to you by admin.`,
                type: 'Supervisor Assignment',
                target_role: 'supervisor',
                is_read: false,
                created_at: assignedAt,
              })
            }
          }
          if (notices.length) {
            const noticeResult = await supabase.from('notifications').insert(notices)
            if (noticeResult.error) console.warn('Student-supervisor notification failed:', noticeResult.error)
          }

          if (supervisor && (!alreadyAssignedToSameSupervisor || !assignmentEmailAlreadySent)) {
            try {
              await sendSupervisorAssignmentEmails({ student, supervisor, linkedProjects, assignedAt })
            } catch (notificationError) {
              console.warn('Student-supervisor assignment email failed:', notificationError)
              emailError = notificationError
            }
          }

          await addAudit(currentUser.full_name, supervisor ? 'assigned student supervisor' : 'removed student supervisor', `${student.full_name || student.email}${supervisor ? ` → ${supervisor.full_name || supervisor.email}` : ''}`)
          await loadFromSupabase(currentUser)
        } else {
          const localNotices = []
          if (supervisor) {
            localNotices.push({ id: crypto.randomUUID(), profile_id: student.id || null, recipient_user_id: student.id || null, recipient_email: student.email || '', sender_user_id: currentUser?.id || null, notification_type: `student_supervisor_assigned_${student.id}_${supervisor.id}`, title: 'Supervisor Assigned', message: `${supervisor.full_name || supervisor.email || 'A supervisor'} has been assigned as your supervisor.`, type: 'Supervisor Assignment', target_role: 'student', is_read: false, created_at: assignedAt })
            localNotices.push({ id: crypto.randomUUID(), profile_id: supervisor.id || null, recipient_user_id: supervisor.id || null, recipient_email: supervisor.email || '', sender_user_id: currentUser?.id || null, notification_type: `student_assigned_to_supervisor_${student.id}_${supervisor.id}`, title: 'New Student Assigned', message: `${student.full_name || student.email || 'A student'} has been assigned to you by admin.`, type: 'Supervisor Assignment', target_role: 'supervisor', is_read: false, created_at: assignedAt })
          } else {
            localNotices.push({ id: crypto.randomUUID(), profile_id: student.id || null, recipient_user_id: student.id || null, recipient_email: student.email || '', sender_user_id: currentUser?.id || null, notification_type: `student_supervisor_removed_${student.id}_${assignedAt}`, title: 'Supervisor Removed', message: 'Your supervisor assignment was removed by admin.', type: 'Supervisor Assignment', target_role: 'student', is_read: false, created_at: assignedAt })
          }
          const log = makeAudit(currentUser.full_name, supervisor ? 'assigned student supervisor' : 'removed student supervisor', `${student.full_name || student.email}${supervisor ? ` → ${supervisor.full_name || supervisor.email}` : ''}`)
          setLocal((current) => ({
            ...current,
            profiles: current.profiles.map((user) => String(user.id) === String(student.id) ? { ...user, ...profileUpdate } : user),
            notifications: [...localNotices, ...(current.notifications || [])],
            auditLogs: [log, ...current.auditLogs],
          }))
        }

        if (!supervisor) {
          setMessage(`Supervisor assignment removed for ${student.full_name || student.email}.`)
        } else if ((alreadyAssignedToSameSupervisor && assignmentEmailAlreadySent)) {
          setMessage(`${student.full_name || student.email} is already assigned to ${supervisor.full_name || supervisor.email}. No duplicate email was sent.`)
        } else if (emailError) {
          setMessage('Supervisor assigned successfully, but email notification failed.')
        } else if (!isSupabaseConfigured) {
          setMessage('Supervisor assigned successfully. Automatic email notifications require Supabase Edge Function deployment.')
        } else {
          setMessage('Supervisor assigned successfully and email notifications sent.')
        }
      } catch (error) {
        const errorMessage = String(error.message || '')
        setMessage(errorMessage.toLowerCase().includes('admin_assign_student_supervisor_only') || errorMessage.toLowerCase().includes('could not find') ? 'Could not update student supervisor assignment. Run the new Supabase Supervisor Management SQL migration first.' : (errorMessage || 'Could not update student supervisor assignment.'))
      }
      return
    }

    try {
      const assignedAt = new Date().toISOString()
      let emailResult = null
      let emailError = null

      if (isSupabaseConfigured) {
        let assignmentBackendError = null
        try {
          const backendResult = await assignSupervisorThroughEdgeFunction({ student, supervisorId: supervisor?.id || null, projectId: options.projectId || '' })
          await addAudit(currentUser.full_name, supervisor ? 'assigned student to supervisor' : 'removed supervisor assignment for', `${student.full_name || student.email}${supervisor ? ` → ${supervisor.full_name || supervisor.email}` : ''}`)
          await loadFromSupabase(currentUser)

          if (!supervisor) {
            setMessage(backendResult?.message || (removalWithoutChange ? `No supervisor assignment was found for ${student.full_name || student.email}.` : 'Supervisor removed successfully.'))
          } else if (backendResult?.noChange || backendResult?.emailSkipped) {
            setMessage(`${student.full_name || student.email} is already assigned to ${supervisor.full_name || supervisor.email}. No duplicate email was sent.`)
          } else if (backendResult?.emailSent || backendResult?.notificationsSent) {
            setMessage('Supervisor assigned successfully and email notifications sent.')
          } else if (backendResult?.emailFailed || backendResult?.emailError) {
            setMessage(`Supervisor assigned successfully, but email notification failed. Please check the email service or Edge Function logs. ${backendResult.emailError || ''}`.trim())
          } else {
            setMessage('Supervisor assigned successfully.')
          }
          return
        } catch (backendError) {
          assignmentBackendError = backendError
          console.warn('assign-supervisor Edge Function failed; falling back to database assignment only:', backendError)
        }

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

        if (supervisor && assignmentBackendError) {
          emailError = assignmentBackendError
        } else if (supervisor && (!alreadyAssignedToSameSupervisor || !assignmentEmailAlreadySent)) {
          try {
            emailResult = await sendSupervisorAssignmentEmails({ student, supervisor, linkedProjects, assignedAt })
          } catch (notificationError) {
            console.warn('Supervisor assignment email notification failed:', notificationError)
            emailError = notificationError
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

      if (!supervisor) {
        setMessage(removalWithoutChange ? `No supervisor assignment was found for ${student.full_name || student.email}.` : `Supervisor assignment removed for ${student.full_name || student.email}.`)
      } else if ((alreadyAssignedToSameSupervisor && assignmentEmailAlreadySent) || emailResult?.skipped) {
        setMessage(`${student.full_name || student.email} is already assigned to ${supervisor.full_name || supervisor.email}. No duplicate email was sent.`)
      } else if (emailError) {
        setMessage(`Supervisor assigned successfully, but email notification failed. Please check the email service or Edge Function logs. ${emailError.message || ''}`.trim())
      } else if (!isSupabaseConfigured) {
        setMessage(`Supervisor assigned successfully. Automatic email notifications require Supabase Edge Function deployment.`)
      } else {
        setMessage('Supervisor assigned successfully and email notifications sent.')
      }
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
    if (!form.title.trim() || !form.message.trim()) {
      setMessage('Please write inbox message title and message.')
      return { ok: false, error: 'Please write inbox message title and message.' }
    }
    const note = { id: crypto.randomUUID(), title: form.title, message: form.message, type: form.type, target_role: form.target_role, is_read: false, created_at: new Date().toISOString() }
    if (isSupabaseConfigured) {
      const { id, ...noteForDb } = note
      const { error } = await supabase.from('notifications').insert(noteForDb)
      if (error) {
        setMessage(error.message)
        return { ok: false, error: error.message }
      }
      await addAudit(currentUser.full_name, 'created', 'inbox/reminder')
      await loadFromSupabase()
    } else {
      const log = makeAudit(currentUser.full_name, 'created', 'inbox/reminder')
      setLocal((current) => ({ ...current, notifications: [note, ...current.notifications], auditLogs: [log, ...current.auditLogs] }))
    }
    setMessage('Inbox message created.')
    return { ok: true, notification: note }
  }

  async function sendMeetingRequestEmail(kind, meetingId, status = '') {
    if (!isSupabaseConfigured || !supabase?.functions?.invoke) return { ok: false, error: 'Email sending requires Supabase Edge Functions.' }
    const { data: result, error } = await supabase.functions.invoke('send-platform-email', {
      body: {
        kind,
        meetingId,
        status,
        appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      },
    })
    if (error) throw new Error(error.message || 'Meeting email could not be sent.')
    if (result?.error) throw new Error(result.error)
    return { ok: true, result }
  }

  async function createMeetingInboxNotification({ recipient, sender, meeting, title, message }) {
    if (!recipient || !meeting) return { ok: false }
    const note = {
      id: crypto.randomUUID(),
      profile_id: recipient.id || null,
      recipient_user_id: recipient.id || null,
      recipient_email: recipient.email || '',
      sender_user_id: sender?.id || null,
      project_id: meeting.project_id || null,
      notification_type: `meeting_request_${meeting.id}_${String(title || 'update').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      title,
      message,
      type: 'Meeting Request',
      target_role: recipient.role || 'all',
      is_read: false,
      created_at: new Date().toISOString(),
    }
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('notifications').insert(note)
      if (error) return { ok: false, error: error.message }
      return { ok: true, notification: note }
    }
    return { ok: true, notification: note }
  }

  async function createMeetingRequest(form) {
    const actionUser = activeRoleUser || currentUser
    const requesterProfile = findProfileForUser(data, actionUser) || actionUser
    const roleCandidates = [form?.requester_role, allowedRole, requesterProfile?.role, actionUser?.role]
      .map((value) => normalizeMeetingRole(value))
      .filter(Boolean)
    const requesterRole = roleCandidates.find((value) => ['student', 'supervisor'].includes(value)) || roleCandidates[0] || ''
    const requester = { ...(requesterProfile || {}), role: requesterRole }
    let selectedStudent = null
    if (!['student', 'supervisor'].includes(requesterRole)) {
      setMessage('Only students and supervisors can request meetings. Please refresh the page and open Meeting Requests again from a Student or Supervisor role.')
      return { ok: false }
    }
    const title = String(form.title || '').trim()
    const purpose = String(form.purpose || '').trim()
    const requestedDate = form.requested_date || ''
    const requestedStartTime = form.requested_start_time || ''
    if (!title || !purpose || !requestedDate || !requestedStartTime) {
      setMessage('Please add a title, purpose, date, and start time.')
      return { ok: false }
    }

    let recipient = null
    let student = null
    let supervisor = null
    if (requesterRole === 'student') {
      student = requester
      supervisor = getAssignedMeetingSupervisorForStudent(data, requester)
      recipient = supervisor
      if (!supervisor) {
        setMessage('You must have an assigned supervisor before requesting a meeting.')
        return { ok: false }
      }
    } else {
      supervisor = requester
      const allowedStudents = getMeetingStudentsForSupervisor(data, requester)
      selectedStudent = allowedStudents.find((item) =>
        String(item.id || '') === String(form.student_id || '') ||
        normalizeText(item.email) === normalizeText(form.student_email) ||
        String(item.key || '') === String(form.student_key || '') ||
        normalizeText(item.name) === normalizeText(form.student_name)
      )
      if (!selectedStudent) {
        setMessage('You currently have no assigned students available for meeting requests.')
        return { ok: false }
      }
      student = getMeetingStudentProfile(data, selectedStudent)
      recipient = student
    }

    const selectedFromAllowedMeetingList = requesterRole === 'student'
      ? Boolean(supervisor)
      : Boolean(selectedStudent && student)
    if (!selectedFromAllowedMeetingList && !canUsersRequestMeeting(data, requester, recipient)) {
      setMessage('This meeting participant is not linked to your assigned student/supervisor. Refresh the page after assignment changes, then try again.')
      return { ok: false }
    }

    const duplicate = (data.meetingRequests || []).find((meeting) =>
      normalizeMeetingStatus(meeting.status) === 'pending' &&
      String(meeting.requester_id || '') === String(requester.id || '') &&
      String(meeting.recipient_id || '') === String(recipient.id || '') &&
      String(meeting.requested_date || '') === String(requestedDate) &&
      String(meeting.requested_start_time || '') === String(requestedStartTime)
    )
    if (duplicate) {
      setMessage('A pending meeting request with the same person, date, and time already exists.')
      return { ok: false }
    }

    const relatedProject = requesterRole === 'student'
      ? getStudentCurrentResearchGroup(data, requester)
      : getVisibleProjects(data.projects || [], 'supervisor', requester, data).find((project) => getResearchGroupMemberProfiles(data, project).some((member) => profileMatchesUser(member, student)) || isOwnStudentProject(project, student))

    const now = new Date().toISOString()
    const meeting = {
      id: crypto.randomUUID(),
      requester_id: requester.id || null,
      requester_email: requester.email || '',
      requester_name: requester.full_name || requester.email || 'Requester',
      requester_role: requester.role || '',
      recipient_id: recipient.id || null,
      recipient_email: recipient.email || '',
      recipient_name: recipient.full_name || recipient.email || 'Recipient',
      recipient_role: recipient.role || '',
      student_id: student?.id || null,
      student_email: student?.email || '',
      supervisor_id: supervisor?.id || null,
      supervisor_email: supervisor?.email || '',
      project_id: relatedProject?.id || null,
      group_id: relatedProject?.group_id || relatedProject?.id || null,
      title,
      purpose,
      requested_date: requestedDate,
      requested_start_time: requestedStartTime,
      duration_minutes: Number(form.duration_minutes || 30),
      meeting_type: form.meeting_type || 'In Person',
      location: String(form.location || '').trim(),
      meeting_link: String(form.meeting_link || '').trim(),
      notes: String(form.notes || '').trim(),
      status: 'pending',
      response_note: '',
      proposed_date: null,
      proposed_start_time: null,
      created_at: now,
      updated_at: now,
      responded_at: null,
      cancelled_at: null,
    }

    let savedMeeting = meeting
    let emailFailed = false
    if (isSupabaseConfigured) {
      const { id, ...meetingForDb } = meeting
      let inserted = null
      let error = null

      // Prefer the safe RPC when the latest meeting SQL has been installed. It maps the
      // logged-in auth email to the correct profile row and avoids false role/assignment errors.
      const rpcResult = await supabase.rpc('create_meeting_request_safe', {
        p_recipient_profile_id: recipient.id || null,
        p_recipient_email: recipient.email || '',
        p_title: title,
        p_purpose: purpose,
        p_requested_date: requestedDate,
        p_requested_start_time: requestedStartTime,
        p_duration_minutes: Number(form.duration_minutes || 30),
        p_meeting_type: form.meeting_type || 'In Person',
        p_location: String(form.location || '').trim(),
        p_meeting_link: String(form.meeting_link || '').trim(),
        p_notes: String(form.notes || '').trim(),
      })

      if (!rpcResult.error) {
        inserted = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data
      } else if (String(rpcResult.error.message || '').toLowerCase().includes('create_meeting_request_safe')) {
        const directResult = await supabase.from('meeting_requests').insert(meetingForDb).select().single()
        inserted = directResult.data
        error = directResult.error
      } else {
        error = rpcResult.error
      }

      if (error) {
        const details = error.message || 'Could not save meeting request.'
        const needsSql = /assigned|role|requester|row-level security|policy|permission/i.test(details)
        setMessage(needsSql ? `${details} Run supabase/meeting_requests_role_assignment_fix.sql once in Supabase SQL Editor, then try again.` : details)
        return { ok: false, error: details }
      }
      savedMeeting = inserted || meeting
      await createMeetingInboxNotification({
        recipient,
        sender: requester,
        meeting: savedMeeting,
        title: 'New Meeting Request',
        message: 'You have received a new meeting request.',
      })
      try {
        await sendMeetingRequestEmail('meeting_request_sent', savedMeeting.id, 'pending')
      } catch (error) {
        console.warn('Meeting request email failed:', error)
        emailFailed = true
      }
      await loadFromSupabase(currentUser)
    } else {
      const notice = { id: crypto.randomUUID(), profile_id: recipient.id || null, recipient_user_id: recipient.id || null, recipient_email: recipient.email || '', sender_user_id: requester.id || null, project_id: meeting.project_id || null, notification_type: `meeting_request_${meeting.id}_sent`, title: 'New Meeting Request', message: 'You have received a new meeting request.', type: 'Meeting Request', target_role: recipient.role || 'all', is_read: false, created_at: now }
      setLocal((current) => ({ ...current, meetingRequests: [meeting, ...(current.meetingRequests || [])], notifications: [notice, ...(current.notifications || [])] }))
    }
    setMessage(emailFailed ? 'Meeting request saved, but the email notification could not be sent.' : 'Meeting request sent.')
    return { ok: true, meeting: savedMeeting }
  }

  async function respondMeetingRequest(meetingId, action, form = {}) {
    const actionUser = activeRoleUser || currentUser
    const actor = findProfileForUser(data, actionUser) || actionUser
    const meeting = (data.meetingRequests || []).find((item) => String(item.id) === String(meetingId))
    if (!meeting) {
      setMessage('Meeting request not found.')
      return { ok: false }
    }
    const status = normalizeMeetingStatus(meeting.status)
    const isRequester = meetingParticipantMatches(meeting, actor, ['requester'])
    const isRecipient = meetingParticipantMatches(meeting, actor, ['recipient'])
    if (!isRequester && !isRecipient) {
      setMessage('You can only respond to your own meeting requests.')
      return { ok: false }
    }

    const now = new Date().toISOString()
    const updates = { updated_at: now }
    let noticeTitle = 'Meeting Request Updated'
    let noticeMessage = 'Your meeting request has been updated.'
    let emailKind = 'meeting_request_updated'

    if (action === 'accept') {
      if (!((status === 'pending' && isRecipient) || (status === 'reschedule_proposed' && isRequester))) {
        setMessage('This meeting request cannot be accepted by this user.')
        return { ok: false }
      }
      updates.status = 'accepted'
      updates.responded_at = now
      updates.response_note = String(form.response_note || '').trim()
      if (status === 'reschedule_proposed' && meeting.proposed_date && meeting.proposed_start_time) {
        updates.requested_date = meeting.proposed_date
        updates.requested_start_time = meeting.proposed_start_time
      }
      noticeTitle = 'Meeting Request Accepted'
      noticeMessage = 'Your meeting request has been accepted.'
      emailKind = 'meeting_request_accepted'
    } else if (action === 'reject') {
      if (!((status === 'pending' && isRecipient) || (status === 'reschedule_proposed' && isRequester))) {
        setMessage('This meeting request cannot be rejected by this user.')
        return { ok: false }
      }
      updates.status = 'rejected'
      updates.responded_at = now
      updates.response_note = String(form.response_note || '').trim()
      noticeTitle = 'Meeting Request Rejected'
      noticeMessage = 'Your meeting request has been rejected.'
      emailKind = 'meeting_request_rejected'
    } else if (action === 'reschedule') {
      if (!(status === 'pending' && isRecipient)) {
        setMessage('Only the recipient can propose a different time for a pending meeting request.')
        return { ok: false }
      }
      if (!form.proposed_date || !form.proposed_start_time) {
        setMessage('Please choose the proposed date and time.')
        return { ok: false }
      }
      updates.status = 'reschedule_proposed'
      updates.proposed_date = form.proposed_date
      updates.proposed_start_time = form.proposed_start_time
      updates.response_note = String(form.response_note || '').trim()
      updates.responded_at = now
      noticeTitle = 'Different Meeting Time Proposed'
      noticeMessage = 'A different meeting time has been proposed.'
      emailKind = 'meeting_request_reschedule_proposed'
    } else if (action === 'cancel') {
      if (!['pending', 'accepted', 'reschedule_proposed'].includes(status)) {
        setMessage('This meeting request is already closed.')
        return { ok: false }
      }
      updates.status = 'cancelled'
      updates.cancelled_at = now
      updates.response_note = String(form.response_note || '').trim()
      noticeTitle = 'Meeting Cancelled'
      noticeMessage = 'The meeting has been cancelled.'
      emailKind = 'meeting_request_cancelled'
    } else {
      setMessage('Unknown meeting action.')
      return { ok: false }
    }

    let emailFailed = false
    const otherParticipant = getMeetingOtherParticipant(meeting, actor, data)
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('meeting_requests').update(updates).eq('id', meeting.id)
      if (error) {
        setMessage(error.message || 'Could not update meeting request.')
        return { ok: false, error: error.message }
      }
      await createMeetingInboxNotification({ recipient: otherParticipant, sender: actor, meeting, title: noticeTitle, message: noticeMessage })
      try {
        await sendMeetingRequestEmail(emailKind, meeting.id, updates.status)
      } catch (error) {
        console.warn('Meeting response email failed:', error)
        emailFailed = true
      }
      await loadFromSupabase(currentUser)
    } else {
      const notice = { id: crypto.randomUUID(), profile_id: otherParticipant.id || null, recipient_user_id: otherParticipant.id || null, recipient_email: otherParticipant.email || '', sender_user_id: actor.id || null, project_id: meeting.project_id || null, notification_type: `meeting_request_${meeting.id}_${action}_${now}`, title: noticeTitle, message: noticeMessage, type: 'Meeting Request', target_role: otherParticipant.role || 'all', is_read: false, created_at: now }
      setLocal((current) => ({
        ...current,
        meetingRequests: (current.meetingRequests || []).map((item) => String(item.id) === String(meeting.id) ? { ...item, ...updates } : item),
        notifications: [notice, ...(current.notifications || [])],
      }))
    }
    setMessage(emailFailed ? 'Meeting request updated, but the email notification could not be sent.' : 'Meeting request updated.')
    return { ok: true }
  }

  async function createDeadline(form) {
    const actionUser = activeRoleUser || currentUser
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
      ? getVisibleProjects(data.projects, 'supervisor', actionUser, data)
      : data.projects
    const assignedStudents = allowedRole === 'supervisor'
      ? mergeStudentOptions(getAssignedSupervisorStudents(data, assignedProjects, data.reports), getDirectAssignedStudentsForSupervisor(data, actionUser))
      : getAssignedSupervisorStudents(data, assignedProjects, data.reports)
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
      supervisor_id: actionUser?.id || null,
      supervisor_email: actionUser?.email || '',
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
      message: `${actionUser?.full_name || 'Your supervisor'} assigned a new deadline: ${deadline.title}. Due date: ${deadline.due_date}.${deadline.description ? ` ${deadline.description}` : ''}`,
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
    if (!(await showAppConfirm('Are you sure you want to remove this deadline?', { title: 'Remove Deadline', type: 'danger', confirmLabel: 'Remove' }))) return

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
      setMessage('Inbox message not found.')
      return { ok: false, error: 'Inbox message not found.' }
    }
    if (!notificationForUser(target, currentUser, allowedRole) && allowedRole !== 'admin') {
      const error = 'You do not have permission to delete this inbox message.'
      setMessage(error)
      return { ok: false, error }
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('notifications').delete().eq('id', id)
      if (error) {
        const errorMessage = error.message || 'Inbox message could not be deleted.'
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
    setMessage('Inbox message deleted successfully.')
    return { ok: true }
  }

  async function updateOwnProfile(updates = {}) {
    const cleanUpdates = normalizeProfileUpdateFields(updates)
    delete cleanUpdates.email
    delete cleanUpdates.role
    delete cleanUpdates.status

    const hasFullNameField = Object.prototype.hasOwnProperty.call(cleanUpdates, 'full_name')
    if (hasFullNameField) {
      cleanUpdates.full_name = String(cleanUpdates.full_name || '').trim()
      if (!cleanUpdates.full_name) {
        throw new Error('Full name is required.')
      }
    }

    if (!Object.keys(cleanUpdates).length) {
      return currentUser
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('profiles')
        .update(cleanUpdates)
        .eq('id', currentUser.id)
      if (error) throw error
      const updatedUser = { ...currentUser, ...cleanUpdates }
      setCurrentUser(updatedUser)
      updateStoredCurrentUser(updatedUser)
      await addAudit(currentUser.full_name || currentUser.email, 'updated', hasFullNameField ? 'own profile' : 'own profile photo')
      await loadFromSupabase(updatedUser)
      return updatedUser
    }

    const updatedUser = { ...currentUser, ...cleanUpdates }
    setCurrentUser(updatedUser)
    updateStoredCurrentUser(updatedUser)
    setLocal((current) => ({
      ...current,
      profiles: (current.profiles || []).map((profile) => String(profile.id) === String(currentUser.id) ? { ...profile, ...cleanUpdates } : profile),
    }))
    return updatedUser
  }

  async function uploadOwnProfilePhoto(file) {
    if (!file) throw new Error('Please choose a profile photo.')
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) throw new Error('Please choose a JPG, PNG, or WebP image.')

    if (!isSupabaseConfigured) {
      const dataUrl = await optimizeImageFile(file, { maxWidth: 600, maxHeight: 600, quality: 0.88, outputType: file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg' })
      return updateOwnProfile({ profile_photo_url: dataUrl, profile_photo_path: '' })
    }

    const outputType = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
    const dataUrl = await optimizeImageFile(file, { maxWidth: 700, maxHeight: 700, quality: 0.88, outputType })
    const blob = await fetch(dataUrl).then((response) => response.blob())
    const extension = outputType === 'image/png' ? 'png' : outputType === 'image/webp' ? 'webp' : 'jpg'
    const ownerKey = String(currentUser.id || currentUser.email || 'user').replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
    const safeName = String(file.name || 'profile-photo').replace(/[^a-z0-9._-]/gi, '-').toLowerCase()
    const filePath = `${ownerKey}/profile-${Date.now()}-${safeName}.${extension}`
    const upload = await supabase.storage.from('profile-photos').upload(filePath, blob, {
      cacheControl: '3600',
      contentType: outputType,
      upsert: true,
    })
    if (upload.error) throw upload.error
    const { data: publicData } = supabase.storage.from('profile-photos').getPublicUrl(filePath)
    const publicUrl = publicData?.publicUrl
    if (!publicUrl) throw new Error('Profile photo uploaded, but Supabase did not return a public URL.')
    return updateOwnProfile({ profile_photo_url: publicUrl, profile_photo_path: filePath })
  }

  async function updateOwnPassword(currentPassword, newPassword, confirmPassword) {
    if (!newPassword || newPassword.length < 6) throw new Error('New password must be at least 6 characters.')
    if (newPassword !== confirmPassword) throw new Error('New password and confirm password must match.')

    if (isSupabaseConfigured) {
      if (!currentPassword) throw new Error('Please enter your current password.')
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email: currentUser.email, password: currentPassword })
      if (verifyError) throw new Error('Current password is incorrect.')
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      return { ok: true }
    }

    if (currentUser.password_hash && currentUser.password_hash !== localPasswordKey(currentPassword || '')) {
      throw new Error('Current password is incorrect.')
    }
    const updatedUser = { ...currentUser, password_hash: localPasswordKey(newPassword) }
    setCurrentUser(updatedUser)
    updateStoredCurrentUser(updatedUser)
    setLocal((current) => ({
      ...current,
      profiles: (current.profiles || []).map((profile) => String(profile.id) === String(currentUser.id) ? { ...profile, password_hash: localPasswordKey(newPassword) } : profile),
    }))
    return { ok: true }
  }

  async function sendCommitteeSupervisorAccessEmail(targetUser, enabled) {
    if (!isSupabaseConfigured || !supabase?.functions?.invoke || !targetUser?.email) return { ok: false, error: 'Email sending requires Supabase Edge Functions.' }
    const { data: result, error } = await supabase.functions.invoke('send-platform-email', {
      body: {
        kind: 'committee_supervisor_access',
        targetUserId: targetUser.id,
        enabled,
        appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      },
    })
    if (error) throw new Error(error.message || 'Dual-role access email could not be sent.')
    if (result?.error) throw new Error(result.error)
    return { ok: true, result }
  }

  async function updateCommitteeSupervisorAccess(userId, enabled) {
    const targetUser = data.profiles.find((user) => String(user.id) === String(userId))
    if (!targetUser) {
      setMessage('Research Committee user not found.')
      return { ok: false, error: 'Research Committee user not found.' }
    }
    if (currentUser?.role !== 'admin') {
      setMessage('Only admins can update dual-role supervisor access.')
      return { ok: false, error: 'Only admins can update dual-role supervisor access.' }
    }
    if (targetUser.role !== 'committee') {
      setMessage('Supervisor access can only be changed for Research Committee users.')
      return { ok: false, error: 'Supervisor access can only be changed for Research Committee users.' }
    }

    let emailFailed = false
    let auditAlreadyWritten = false
    try {
      if (isSupabaseConfigured) {
        const rpcResult = await supabase.rpc('admin_set_committee_supervisor_access', { target_profile_id: userId, enabled })
        if (!rpcResult.error) auditAlreadyWritten = true
        if (rpcResult.error) {
          if (isMissingRpcFunction(rpcResult.error)) {
            const fallbackUpdate = await supabase.from('profiles').update({ can_act_as_supervisor: Boolean(enabled) }).eq('id', userId)
            if (fallbackUpdate.error) throw fallbackUpdate.error
          } else {
            throw rpcResult.error
          }
        }
        const note = {
          profile_id: targetUser.id || null,
          recipient_user_id: targetUser.id || null,
          recipient_email: targetUser.email || '',
          sender_user_id: currentUser?.id || null,
          notification_type: `committee_supervisor_access_${targetUser.id}_${enabled ? 'enabled' : 'disabled'}`,
          title: enabled ? 'Supervisor Access Enabled' : 'Supervisor Access Disabled',
          message: enabled
            ? 'Admin enabled Supervisor access for your Research Committee account. Use the Role dropdown to switch dashboards.'
            : 'Admin disabled Supervisor mode for your Research Committee account. Your Research Committee dashboard is still available.',
          type: 'Dual Role Management',
          target_role: 'committee',
          is_read: false,
          created_at: new Date().toISOString(),
        }
        const noticeResult = await supabase.from('notifications').insert(note)
        if (noticeResult.error) console.warn('Dual role notification failed:', noticeResult.error)
        try {
          await sendCommitteeSupervisorAccessEmail(targetUser, enabled)
        } catch (emailError) {
          console.warn('Dual role access email failed:', emailError)
          emailFailed = true
        }
        if (!auditAlreadyWritten) {
          await addAudit(currentUser.full_name, enabled ? 'enabled supervisor access for' : 'disabled supervisor access for', targetUser.full_name || targetUser.email || `user ${userId}`, {
            action_type: enabled ? 'committee_supervisor_access_enabled' : 'committee_supervisor_access_disabled',
            affected_user_id: targetUser.id,
            affected_user_email: targetUser.email || '',
            old_value: hasCommitteeSupervisorAccess(targetUser) ? 'Research Committee + Supervisor Access' : 'Research Committee only',
            new_value: enabled ? 'Research Committee + Supervisor Access' : 'Research Committee only',
            description: `${currentUser.full_name || currentUser.email || 'Admin'} ${enabled ? 'enabled' : 'disabled'} Supervisor access for ${targetUser.full_name || targetUser.email || 'a Research Committee user'}.`,
          })
        }
        await loadFromSupabase(currentUser)
      } else {
        const log = makeAudit(currentUser.full_name, enabled ? 'enabled supervisor access for' : 'disabled supervisor access for', targetUser.full_name || targetUser.email || `user ${userId}`)
        setLocal((current) => ({
          ...current,
          profiles: current.profiles.map((user) => String(user.id) === String(userId) ? { ...user, can_act_as_supervisor: Boolean(enabled) } : user),
          notifications: [{
            id: crypto.randomUUID(),
            profile_id: targetUser.id || null,
            recipient_user_id: targetUser.id || null,
            recipient_email: targetUser.email || '',
            sender_user_id: currentUser?.id || null,
            title: enabled ? 'Supervisor Access Enabled' : 'Supervisor Access Disabled',
            message: enabled ? 'Admin enabled Supervisor mode for your Research Committee account.' : 'Admin disabled Supervisor mode for your Research Committee account.',
            type: 'Dual Role Management',
            target_role: 'committee',
            is_read: false,
            created_at: new Date().toISOString(),
          }, ...(current.notifications || [])],
          auditLogs: [log, ...current.auditLogs],
        }))
      }
      setMessage(emailFailed ? 'Supervisor access updated successfully, but email notification failed.' : 'Supervisor access updated successfully.')
      return { ok: true, emailSent: !emailFailed }
    } catch (error) {
      const errorMessage = error.message?.toLowerCase?.().includes('permission') || error.message?.toLowerCase?.().includes('row-level security')
        ? 'Failed to update supervisor access. Run supabase/migrations/202607020007_committee_supervisor_access.sql in Supabase SQL Editor, then try again.'
        : (error.message || 'Failed to update supervisor access.')
      setMessage(errorMessage)
      return { ok: false, error: errorMessage }
    }
  }

  function exportCsv() {
    const header = 'Group,Title,Department,Supervisor,Approval,Status,Progress,Final Due\n'
    const rows = filteredProjects.map((p) => `"${p.group_name}","${p.title}","${p.area}","${p.supervisor_name}","${getProjectDecisionLabel(p)}","${p.status}","${formatProgress(p.progress)}%","${p.final_due}"`).join('\n')
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

  const visibleProjects = useMemo(() => {
    return getVisibleProjects(data.projects, allowedRole, activeRoleUser, data)
  }, [data, allowedRole, activeRoleUser])

  const filteredProjects = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return visibleProjects.filter((p) => {
      const matchesSearch = !q || [p.title, p.group_name, p.area, p.supervisor_name, p.approval, p.status].some((value) => String(value || '').toLowerCase().includes(q))
      const matchesArea = filters.area === 'All' || p.area === filters.area
      const matchesStatus = filters.status === 'All' || p.status === filters.status || p.approval === filters.status
      return matchesSearch && matchesArea && matchesStatus
    })
  }, [visibleProjects, filters])

  const visibleReports = useMemo(() => getVisibleReports(data.reports, visibleProjects, allowedRole, activeRoleUser), [data.reports, visibleProjects, allowedRole, activeRoleUser])

  const visibleDeadlines = useMemo(() => getVisibleDeadlines(data.deadlines, allowedRole, activeRoleUser, data), [data, allowedRole, activeRoleUser])

  const visibleData = useMemo(() => ({
    ...data,
    profiles: data.profiles,
    projects: visibleProjects,
    reports: visibleReports,
    deadlines: visibleDeadlines,
    evaluations: allowedRole === 'student' ? data.evaluations.filter((evaluation) => visibleProjects.some((project) => String(project.id) === String(evaluation.project_id))) : data.evaluations,
    auditLogs: allowedRole === 'admin' ? data.auditLogs : [],
    invitations: allowedRole === 'admin' ? data.invitations : [],
    groupMembers: data.groupMembers || [],
  }), [data, allowedRole, visibleProjects, visibleReports, visibleDeadlines])

  const studentCurrentResearchGroup = useMemo(() => (
    allowedRole === 'student' && roleContextReady ? getStudentCurrentResearchGroup(data, activeRoleUser) : null
  ), [allowedRole, data, activeRoleUser, roleContextReady])

  useEffect(() => {
    if (allowedRole === 'student' && tab === 'join-group' && studentCurrentResearchGroup && !dataLoading) {
      setTab('dashboard')
    }
  }, [allowedRole, tab, studentCurrentResearchGroup, dataLoading])

  const stats = useMemo(() => ({
    unread: data.notifications.filter((n) => !n.is_read && notificationForUser(n, currentUser, allowedRole)).length,
  }), [data.notifications, currentUser, allowedRole])

  useEffect(() => {
    if (tab === 'notifications') setTab('dashboard')
  }, [tab])

  useEffect(() => {
    if (typeof window === 'undefined' || dataLoading) return undefined
    const sectionId = decodeURIComponent(String(window.location.hash || '').replace(/^#/, ''))
    if (!sectionId) return undefined

    const firstTimer = window.setTimeout(() => scrollToRoleSearchSection(sectionId), 180)
    const secondTimer = window.setTimeout(() => scrollToRoleSearchSection(sectionId), 650)

    return () => {
      window.clearTimeout(firstTimer)
      window.clearTimeout(secondTimer)
    }
  }, [tab, dataLoading])

  if (passwordRecoveryMode) {
    return <><ResetPasswordPage onUpdatePassword={handleUpdatePassword} onBackToLogin={() => { setPasswordRecoveryMode(false); window.history.replaceState({}, document.title, window.location.pathname); setMessage('') }} message={message} loading={passwordResetLoading} settings={websiteSettings} /><AppDialog dialog={appDialog} onClose={closeAppDialog} /></>
  }

  if (!currentUser) {
    return <><LoginPage onLogin={handleLogin} onForgotPassword={handleForgotPassword} message={message} loading={loginLoading} adminOnly={isAdminPortal} settings={websiteSettings} invitation={acceptedInvitation} /><AppDialog dialog={appDialog} onClose={closeAppDialog} /></>
  }

  if (isAdminPortal && allowedRole !== 'admin' && !isAdminBaseRole) {
    return <><AdminAccessDenied currentUser={currentUser} onLogout={logout} /><AppDialog dialog={appDialog} onClose={closeAppDialog} /></>
  }

  if (isAdminPortal && allowedRole === 'admin') {
    return (
      <>
      <AdminControlPanel
        settings={websiteSettings}
        aboutUsPage={aboutUsPage}
        updateAboutUsPage={updateAboutUsPage}
        uploadAboutUsImage={uploadAboutUsImage}
        pdfReportSettings={getPdfReportSettingsForRole('admin', pdfReportSettingsByRole, pdfReportSettings)}
        pdfReportSettingsByRole={pdfReportSettingsByRole}
        globalPdfReportSettings={pdfReportSettings}
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
        dataLoading={dataLoading}
        assignStudentToSupervisor={assignStudentToSupervisor}
        assignProjectLeader={assignProjectLeader}
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
        decideGroupJoinRequest={decideGroupJoinRequest}
        directAddStudentsToGroup={directAddStudentsToGroup}
        updateOwnProfile={updateOwnProfile}
        uploadOwnProfilePhoto={uploadOwnProfilePhoto}
        updateOwnPassword={updateOwnPassword}
        updateCommitteeSupervisorAccess={updateCommitteeSupervisorAccess}
      />
      <AppDialog dialog={appDialog} onClose={closeAppDialog} />
      </>
    )
  }

  const mainNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { id: 'research-workspace', label: 'Research Workspace', icon: BookOpen, show: true },
    { id: 'project-management', label: 'Project Management', icon: ClipboardCheck, show: allowedRole === 'supervisor' },
    { id: 'questions', label: allowedRole === 'supervisor' ? 'Student Questions' : 'Questions', icon: MessageSquareText, show: allowedRole === 'student' || allowedRole === 'supervisor' },
    { id: 'meetings', label: 'Meeting Requests', icon: CalendarDays, show: allowedRole === 'student' || allowedRole === 'supervisor' },
    { id: 'join-group', label: 'Join Research Group', icon: Users, show: allowedRole === 'student' && !studentCurrentResearchGroup },
    { id: 'groups', label: 'Research Groups', icon: Users, show: allowedRole === 'supervisor' },
    { id: 'group-requests', label: 'Group Requests', icon: Users, show: allowedRole === 'admin' || allowedRole === 'committee' },
    { id: 'database', label: 'Database', icon: Database, show: allowedRole === 'admin' },
    { id: 'audit', label: 'Audit Log', icon: ShieldCheck, show: allowedRole === 'admin' },
  ].filter((item) => item.show)
  const utilityNavItems = [
    { id: 'inbox', label: 'Inbox', icon: Inbox, type: 'action' },
    { id: 'reports', label: 'Print/PDF Reports', icon: Printer, type: 'button' },
    { id: 'about-us', label: 'About Us', icon: null, type: 'button' },
    { id: 'guidelines', label: 'Research Guidelines', icon: FileText, type: 'download' },
    { id: 'scholar', label: 'HMU Google Scholar', icon: GraduationCap, type: 'external' },
    { id: 'profile-settings', label: 'Profile Settings', icon: Settings, type: 'button' },
  ]
  function handleMainNavClick(tabId, sectionId = '') {
    setSidebarOpen(false)

    if (tabId === 'inbox') {
      window.dispatchEvent(new CustomEvent('open-platform-inbox'))
      return
    }

    const shouldHardNavigate = ['student', 'supervisor', 'committee'].includes(baseRole) && !activeRoleOverride
    if (typeof window !== 'undefined' && !isAdminPortal && shouldHardNavigate) {
      const nextPath = getAuthenticatedTabPath(tabId, allowedRole)
      if (nextPath) {
        const nextUrl = sectionId ? `${nextPath}#${encodeURIComponent(sectionId)}` : nextPath
        const currentUrl = `${window.location.pathname}${window.location.hash || ''}`

        if (currentUrl === nextUrl) {
          window.location.reload()
        } else {
          window.location.assign(nextUrl)
        }
        return
      }
    }

    setTab(tabId)
    if (typeof window !== 'undefined' && !isAdminPortal) {
      const nextPath = getAuthenticatedTabPath(tabId, allowedRole)
      if (nextPath && window.location.pathname !== nextPath) {
        window.history.pushState({}, '', nextPath)
      }
    }
  }

  function handleRoleSwitch(nextMode) {
    if (isAdminBaseRole) {
      const normalizedMode = ['student', 'supervisor', 'committee'].includes(nextMode) ? nextMode : ''
      setActiveRoleOverride(normalizedMode)
      setTab('dashboard')
      addAudit(currentUser?.full_name || currentUser?.email || 'Admin', 'switched role', normalizedMode || 'admin', {
        action_type: 'admin_role_view_switch',
        new_value: normalizedMode || 'admin',
        description: `Admin switched active role to ${getActiveRoleLabel('admin', normalizedMode || 'admin')}.`,
      }).catch((error) => console.warn('Role switch audit failed:', error))
      return
    }
    setActiveRoleOverride(nextMode === 'supervisor' ? 'supervisor' : '')
    setTab('dashboard')
  }

  return (
    <div className={`app app-main-shell main-dashboard-with-sidebar role-${allowedRole} ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <aside ref={sidebarRef} className={`main-sidebar no-print ${sidebarOpen ? 'open' : ''}`} aria-label="Role navigation">
        <div className="sidebar-fixed-head">
          <button type="button" className="sidebar-close-button" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">×</button>
        </div>
        <nav className="main-side-nav sidebar-utility-nav" aria-label="Sidebar utilities">
          {utilityNavItems.map((item) => {
            const Icon = item.icon
            if (item.type === 'download') {
              return (
                <a key={item.id} href={RESEARCH_GUIDELINES_PDF_URL} download={RESEARCH_GUIDELINES_DOWNLOAD_NAME} className="sidebar-utility-link sidebar-nav-item">
                  <span className="side-nav-icon sidebar-icon-container"><Icon size={18} /></span>
                  <span className="sidebar-item-label">{item.label}</span>
                </a>
              )
            }
            if (item.type === 'external') {
              return (
                <a key={item.id} href="https://scholar.google.com/citations?hl=en&view_op=search_authors&mauthors=hawler+medical+universty&btnG=" target="_blank" rel="noopener noreferrer" className="sidebar-utility-link sidebar-nav-item">
                  <span className="side-nav-icon sidebar-icon-container"><Icon size={18} /></span>
                  <span className="sidebar-item-label">{item.label}</span>
                </a>
              )
            }
            return (
              <button key={item.id} type="button" onClick={() => handleMainNavClick(item.id)} className={`sidebar-nav-item ${tab === item.id ? 'active' : ''}`} aria-current={tab === item.id ? 'page' : undefined}>
                <span className="side-nav-icon sidebar-icon-container">{item.id === 'about-us' ? <img src={aboutUsHmuLogo} alt="HMU logo" className="about-us-hmu-logo" /> : Icon ? <Icon size={18} /> : null}</span>
                <span className="sidebar-item-label">{item.label}</span>
              </button>
            )
          })}
        </nav>

      </aside>

      <div className="main-workspace">
        <header className="main-compact-header no-print">
          <div className="main-compact-left">
            <button ref={sidebarToggleRef} type="button" className="sidebar-menu-toggle" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={sidebarOpen}>
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
          <div className="main-header-actions">
            {(isAdminBaseRole || committeeSupervisorAccess) && (
              <RoleSwitchDropdown
                activeRole={allowedRole}
                mode={isAdminBaseRole ? 'admin' : 'committee'}
                onChange={handleRoleSwitch}
              />
            )}
            <UserProfileMenu currentUser={currentUser} onLogout={logout} onOpenProfile={() => handleMainNavClick('profile-settings')} />
          </div>
        </header>

        <NotificationBellMenu
          data={data}
          role={allowedRole}
          currentUser={currentUser}
          dataLoading={dataLoading}
          unreadCount={stats.unread}
          markNotificationRead={markNotificationRead}
          removeNotification={removeNotification}
          showTrigger={false}
        />

        <RoleHeroBanner role={allowedRole} settings={websiteSettings} onNavigate={handleMainNavClick} navigationItems={mainNavItems} activeTab={tab} className="authenticated-role-hero" />

        <main className={`app-content-panel ${tab === 'dashboard' && allowedRole === 'admin' ? 'empty-dashboard-content-panel' : ''} ${tab === 'dashboard' && allowedRole !== 'admin' ? 'role-dashboard-content-panel' : ''}`}>
        {message && tab !== 'dashboard' && <div className="message no-print">{message}</div>}

        {tab === 'dashboard' && roleContextReady && (
          <RoleDashboardOverview role={allowedRole} data={visibleData} projects={allowedRole === 'supervisor' ? filteredProjects : visibleProjects} currentUser={activeRoleUser} onNavigate={handleMainNavClick} />
        )}

        {tab === 'research-workspace' && (
          <ResearchWorkspaceShell role={allowedRole}>
            {allowedRole === 'student' && roleContextReady && <StudentResearchWorkspace data={visibleData} projects={visibleProjects} currentUser={activeRoleUser} createWeeklyReport={createWeeklyReport} dataLoading={dataLoading} sendWeeklyReportToMyEmail={sendWeeklyReportToMyEmail} emailSendingReports={emailSendingReports} heroSettings={websiteSettings} onNavigate={handleMainNavClick} />}
            {allowedRole === 'supervisor' && roleContextReady && <SupervisorResearchWorkspace data={visibleData} projects={filteredProjects} currentUser={activeRoleUser} dataLoading={dataLoading} reviewReport={reviewReport} createDeadline={createDeadline} removeDeadline={removeDeadline} sendWeeklyReportToMyEmail={sendWeeklyReportToMyEmail} emailSendingReports={emailSendingReports} heroSettings={websiteSettings} onNavigate={handleMainNavClick} />}
            {allowedRole === 'committee' && <CommitteeResearchWorkspace data={visibleData} projects={visibleProjects} dataLoading={dataLoading} updateProject={updateProject} saveEvaluation={saveEvaluation} heroSettings={websiteSettings} onNavigate={handleMainNavClick} />}
            {allowedRole === 'admin' && <AdminResearchWorkspace data={visibleData} projects={visibleProjects} currentUser={currentUser} updateProject={updateProject} updateUserRole={updateUserRole} updateUserStatus={updateUserStatus} assignStudentToSupervisor={assignStudentToSupervisor} exportCsv={exportCsv} deleteWeeklyReport={deleteWeeklyReport} deleteUploadedFile={deleteUploadedFile} deleteUserAccount={deleteUserAccount} deleteResearchGroup={deleteResearchGroup} deleteResearchProject={deleteResearchProject} loadError={dataLoadError} dataLoading={dataLoading} heroSettings={websiteSettings} onNavigate={handleMainNavClick} />}
          </ResearchWorkspaceShell>
        )}

        {tab === 'about-us' && <AboutUsPage page={aboutUsPage} />}
        {tab === 'profile-settings' && <ProfileSettingsPage currentUser={currentUser} onBack={() => handleMainNavClick('dashboard')} updateOwnProfile={updateOwnProfile} uploadOwnProfilePhoto={uploadOwnProfilePhoto} updateOwnPassword={updateOwnPassword} />}
        {tab === 'questions' && allowedRole === 'student' && roleContextReady && <StudentQuestionsTab data={data} currentUser={activeRoleUser} dataLoading={dataLoading} submitStudentQuestion={submitStudentQuestion} openQuestionAttachment={openQuestionAttachment} />}
        {tab === 'questions' && allowedRole === 'supervisor' && roleContextReady && <SupervisorQuestionsTab data={data} currentUser={activeRoleUser} dataLoading={dataLoading} answerStudentQuestion={answerStudentQuestion} openQuestionAttachment={openQuestionAttachment} />}
        {tab === 'meetings' && (allowedRole === 'student' || allowedRole === 'supervisor') && roleContextReady && <MeetingRequestsPage data={data} role={allowedRole} currentUser={activeRoleUser} dataLoading={dataLoading} createMeetingRequest={createMeetingRequest} respondMeetingRequest={respondMeetingRequest} />}
        {tab === 'project-management' && allowedRole === 'supervisor' && roleContextReady && <SupervisorProjectManagementTab data={visibleData} projects={filteredProjects} currentUser={activeRoleUser} dataLoading={dataLoading} createProject={createProject} assignProjectLeader={assignProjectLeader} />}
        {tab === 'join-group' && allowedRole === 'student' && roleContextReady && !studentCurrentResearchGroup && <StudentJoinResearchGroupTab data={data} currentUser={activeRoleUser} dataLoading={dataLoading} submitGroupJoinRequest={submitGroupJoinRequest} />}
        {tab === 'groups' && allowedRole === 'supervisor' && roleContextReady && <SupervisorResearchGroupManagementTab data={data} currentUser={activeRoleUser} dataLoading={dataLoading} supervisorAddStudentsToGroup={supervisorAddStudentsToGroup} decideGroupJoinRequest={decideGroupJoinRequest} />}
        {tab === 'group-requests' && (allowedRole === 'admin' || allowedRole === 'committee') && <AdminGroupJoinRequestsTab data={data} currentUser={currentUser} dataLoading={dataLoading} decideGroupJoinRequest={decideGroupJoinRequest} directAddStudentsToGroup={directAddStudentsToGroup} />}
        {tab === 'reports' && <ReportsTab data={data} projects={filteredProjects} currentUser={activeRoleUser} role={allowedRole} printPdfReport={printPdfReport} exportCsv={exportCsv} pdfReportSettings={getPdfReportSettingsForRole(allowedRole, pdfReportSettingsByRole, pdfReportSettings)} dataLoading={dataLoading} />}
        {tab === 'database' && allowedRole === 'admin' && <DatabaseTab databaseMode={databaseMode} />}
        {tab === 'database' && allowedRole !== 'admin' && <div className="card"><SectionHeader icon={Lock} title="Database Access Locked" subtitle="Only Admin accounts can view database status" /><p className="muted">Please use your role dashboard, inbox, or reports page.</p></div>}
        {tab === 'audit' && allowedRole === 'admin' && <AuditTab logs={visibleData.auditLogs} dataLoading={dataLoading} />}
        </main>
      </div>
      {(allowedRole === 'student' || allowedRole === 'supervisor') && <AIAssistantWidget role={allowedRole} />}
      <AppDialog dialog={appDialog} onClose={closeAppDialog} />
    </div>
  )
}




const AI_ASSISTANT_LIBRARY = {
  student: [
    {
      title: 'Dashboard basics',
      icon: LayoutDashboard,
      questions: [
        {
          question: 'How do I use my student dashboard?',
          answer: 'Use the student dashboard as your research home page. First check your project card and group information. Then review Project Progress, Weekly Reports, Supervisor Feedback, Deadlines, and Questions. Use the top-header buttons for About Us, HMU Google Scholar, and Research Guidelines.'
        },
        {
          question: 'Where do I see my project progress?',
          answer: 'Go to your Student Dashboard and open the Project Progress section. The progress area shows your project status, weekly report progress, and supervisor review results. If you are a project member, you can view the progress for your group project even if you are not the project leader.'
        },
        {
          question: 'Where can I download the research guidelines?',
          answer: 'Click the Research Guidelines button in the top header. It will directly download the official PDF file. It does not open a separate page, so you stay on your dashboard.'
        },
      ],
    },
    {
      title: 'Weekly reports',
      icon: FileText,
      questions: [
        {
          question: 'How do I submit a weekly report?',
          answer: 'Go to Student Dashboard → Submit Weekly Report. Fill in: Work completed this week, Problems or challenges, Next week plan, Attendance, and upload an evidence file if needed. Then click Submit Weekly Report. If your project has a project leader and you are not the leader, the submit area will stay locked.'
        },
        {
          question: 'Why is my weekly report submit area locked?',
          answer: 'The submit area is locked when your project already has a project leader and you are a normal project member. In that case, only the project leader submits weekly reports for the group. You can still view project progress, weekly reports, supervisor feedback, status, and attachments.'
        },
        {
          question: 'How do I check if my weekly report was accepted or needs revision?',
          answer: 'Open the Weekly Reports or Supervisor Feedback area on your dashboard. Each submitted report shows its review status, such as Accepted, Rejected, Revision Requested, or Pending Review. Read the supervisor feedback carefully and follow the requested changes if revision is required.'
        },
      ],
    },
    {
      title: 'Questions to supervisor',
      icon: MessageSquareText,
      questions: [
        {
          question: 'How do I ask my supervisor a question from the dashboard?',
          answer: 'Open the Questions section from the student dashboard/sidebar. Write a clear question, choose or attach a file if needed, then submit it. Your supervisor will be able to view and answer it inside the platform.'
        },
        {
          question: 'What should I write when asking my supervisor?',
          answer: 'Use a clear academic style: explain what you are working on, what problem you faced, what you already tried, and what exact guidance you need. Example: “Dear Supervisor, I need guidance about [topic]. I tried [step], but I am unsure about [specific issue]. Could you please advise me?”'
        },
        {
          question: 'Where do I see my supervisor answer?',
          answer: 'Go to the Questions section and find your submitted question. The supervisor answer will appear under the question. If the supervisor added an attachment, use the Download Attachment button to open it.'
        },
      ],
    },
    {
      title: 'Deadlines and feedback',
      icon: CalendarDays,
      questions: [
        {
          question: 'Where do I see my deadlines?',
          answer: 'Open the Deadlines section on your student dashboard. You will see the task title, description, due date, priority, and status. Check this section regularly so you do not miss supervisor-assigned tasks.'
        },
        {
          question: 'How do I read supervisor feedback?',
          answer: 'Open Supervisor Feedback on your dashboard. Feedback is linked to your project weekly reports. Read the status first, then the feedback message, then check any attachment. If revision is requested, update your work based on the comments.'
        },
        {
          question: 'What should I do after receiving revision feedback?',
          answer: 'Read all comments, identify the exact requested changes, update your work/report, and submit again if the system allows resubmission. If something is unclear, ask your supervisor through the Questions section.'
        },
      ],
    },
  ],
  supervisor: [
    {
      title: 'Review weekly reports',
      icon: ClipboardCheck,
      questions: [
        {
          question: 'How do I review a student weekly report?',
          answer: 'Go to Supervisor Dashboard → Weekly Report Review. Open the submitted report, read the completed work, challenges, next week plan, attendance, and attachment if available. Then choose Approve, Request Revision, or Reject and add feedback if the form asks for it.'
        },
        {
          question: 'What happens after I approve or reject a weekly report?',
          answer: 'After you choose a final decision, the report status is saved and the decision buttons should hide or become unavailable. The student can view the final status and your feedback from their dashboard.'
        },
        {
          question: 'How do I request revision for a weekly report?',
          answer: 'In Weekly Report Review, click Request Revision. Write clear feedback explaining what the student must correct, such as missing details, unclear results, weak next-week plan, or missing attachment. Keep the feedback specific and actionable.'
        },
      ],
    },
    {
      title: 'Answer student questions',
      icon: MessageSquareText,
      questions: [
        {
          question: 'How do I answer a student question?',
          answer: 'Open the Supervisor Questions section. Select the student question, read the question and any attachment, write your answer in the supervisor answer field, attach a file if needed, and submit the answer. The student will then see it in their Questions section.'
        },
        {
          question: 'How should I write a clear supervisor answer?',
          answer: 'Use a direct structure: acknowledge the question, give the academic guidance, mention the required next step, and ask the student to update or resubmit if needed. Keep the answer professional and specific.'
        },
        {
          question: 'How do I attach notes or files to an answer?',
          answer: 'When answering the student question, use the attachment upload field if available. After submitting, the student should see the answer and a Download Attachment button for the uploaded file.'
        },
      ],
    },
    {
      title: 'Groups and members',
      icon: Users,
      questions: [
        {
          question: 'How do I accept a student join request?',
          answer: 'Go to Supervisor Dashboard → Group Join Requests or Research Group Management. Find the student request, confirm the requested group, then click Accept. The student will be added to the group/project members list if they are eligible.'
        },
        {
          question: 'How do I reject a student join request?',
          answer: 'Open the Group Join Requests section, find the request, and click Reject. The request status changes to rejected and the student should no longer appear as pending for that group.'
        },
        {
          question: 'How do I assign or check a project leader?',
          answer: 'Open Project Management or the group/project members area. Find the project members list and choose the student who should be project leader using the existing project leader control. Normal members can view progress and feedback, but the leader submits group weekly reports.'
        },
      ],
    },
    {
      title: 'Deadlines and feedback',
      icon: CalendarDays,
      questions: [
        {
          question: 'How do I send a deadline to students?',
          answer: 'Go to the Deadline section. Choose the recipient group or assigned students, enter the deadline title, due date, priority, and instructions, then click the submit/send button. Students will see the deadline in their dashboard.'
        },
        {
          question: 'How do I give useful feedback?',
          answer: 'When reviewing reports, write feedback that tells students exactly what is good, what must be corrected, and what to do next. Example: “Good progress on the literature review. Please add recent references, clarify the objective, and update the next-week plan.”'
        },
        {
          question: 'Where do I monitor project progress?',
          answer: 'Use the supervisor dashboard project/progress sections to view submitted weekly reports, project status, group members, deadlines, and report decisions. Progress is based on the project/group reports and review status.'
        },
      ],
    },
  ],
}

function AIAssistantWidget({ role }) {
  const normalizedRole = role === 'supervisor' ? 'supervisor' : role === 'student' ? 'student' : null
  const sections = normalizedRole ? AI_ASSISTANT_LIBRARY[normalizedRole] : []
  const [isOpen, setIsOpen] = useState(false)
  const [openSection, setOpenSection] = useState(sections[0]?.title || '')
  const [selectedPrompt, setSelectedPrompt] = useState(null)

  useEffect(() => {
    setOpenSection(sections[0]?.title || '')
    setSelectedPrompt(null)
  }, [normalizedRole])

  if (!normalizedRole) return null

  const roleLabel = normalizedRole === 'student' ? 'Student AI Assistant' : 'Supervisor AI Assistant'
  const helperText = normalizedRole === 'student'
    ? 'Choose a task to get academic writing and communication help.'
    : 'Choose a task to draft feedback, deadlines, or guidance.'

  return (
    <div className={`ai-assistant-widget ${isOpen ? 'open' : ''} no-print`}>
      {isOpen && (
        <section className="ai-assistant-panel" aria-label={roleLabel}>
          <div className="ai-assistant-panel-header">
            <div>
              <p className="ai-assistant-eyebrow"><MessageSquareText size={14} /> Academic Support</p>
              <h3>{roleLabel}</h3>
              <span>{helperText}</span>
            </div>
            <button type="button" className="ai-assistant-close" onClick={() => setIsOpen(false)} aria-label="Close AI assistant">
              <XCircle size={18} />
            </button>
          </div>

          <div className="ai-assistant-body">
            <div className="ai-assistant-accordion">
              {sections.map((section) => {
                const Icon = section.icon || BookOpen
                const expanded = openSection === section.title
                return (
                  <div className="ai-assistant-category" key={section.title}>
                    <button
                      type="button"
                      className={`ai-assistant-category-header ${expanded ? 'active' : ''}`}
                      onClick={() => setOpenSection(expanded ? '' : section.title)}
                    >
                      <span><Icon size={16} /> {section.title}</span>
                      <strong>{expanded ? '−' : '+'}</strong>
                    </button>
                    {expanded && (
                      <div className="ai-assistant-question-list">
                        {section.questions.map((item) => (
                          <button
                            type="button"
                            key={item.question}
                            className={`ai-assistant-question ${selectedPrompt?.question === item.question ? 'selected' : ''}`}
                            onClick={() => setSelectedPrompt(item)}
                          >
                            {item.question}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="ai-assistant-answer-card">
              {selectedPrompt ? (
                <>
                  <p className="ai-assistant-answer-label">Suggested answer</p>
                  <h4>{selectedPrompt.question}</h4>
                  <p>{selectedPrompt.answer}</p>
                </>
              ) : (
                <div className="ai-assistant-empty">
                  <MessageSquareText size={22} />
                  <p>Select a question header, then choose one premade question.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <button type="button" className="ai-assistant-launcher" onClick={() => setIsOpen((value) => !value)} aria-expanded={isOpen}>
        <MessageSquareText size={18} />
        <span>AI Assistant</span>
      </button>
    </div>
  )
}

function AboutUsPage({ page }) {
  const normalized = normalizeAboutUsPage(page)
  return (
    <section className="about-us-page-shell">
      <article className="about-us-hero-card">
        <div>
          <p className="eyebrow"><BookOpen size={16} /> About the Platform</p>
          <h1>{normalized.title}</h1>
          {normalized.subtitle && <p>{normalized.subtitle}</p>}
        </div>
        {normalized.image_url && <img src={normalized.image_url} alt="About Us" />}
      </article>
      <article className="about-us-content-card">
        <div className="about-us-rich-content" dangerouslySetInnerHTML={{ __html: normalized.content_html }} />
      </article>
    </section>
  )
}



function AboutUsCustomizationPanel({ page, updatePage, uploadImage }) {
  const [draft, setDraft] = useState(() => normalizeAboutUsPage(page))
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const editorRef = useRef(null)

  useEffect(() => {
    const normalized = normalizeAboutUsPage(page)
    setDraft(normalized)
    if (editorRef.current) editorRef.current.innerHTML = normalized.content_html || ''
  }, [page])

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function editorCommand(command, value = null) {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    updateDraft('content_html', editorRef.current?.innerHTML || '')
  }

  function setBlock(block) {
    editorCommand('formatBlock', block)
  }

  async function addLink() {
    const url = await showAppPrompt('Enter link URL', '', { title: 'Add Link', confirmLabel: 'Add Link' })
    if (!url) return
    const cleanUrl = /^(https?:|mailto:|#|\/)/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    editorCommand('createLink', cleanUrl)
  }

  async function handleImageUpload(file) {
    if (!file || uploading) return
    setUploading(true)
    setStatus('Uploading About Us image...')
    try {
      const result = await uploadImage?.(file)
      if (!result?.ok) throw result?.error || new Error('Failed to upload image.')
      updateDraft('image_url', result.url)
      editorRef.current?.focus()
      document.execCommand('insertImage', false, result.url)
      updateDraft('content_html', editorRef.current?.innerHTML || '')
      setStatus('Image uploaded. Preview it below, then save the About Us page.')
    } catch (error) {
      setStatus(error.message || 'Failed to upload image.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (saving) return
    if (!String(draft.title || '').trim()) {
      setStatus('Page title is required.')
      return
    }
    setSaving(true)
    setStatus('Saving About Us content...')
    try {
      const cleanContent = sanitizeRichHtml(editorRef.current?.innerHTML || draft.content_html || '')
      const result = await updatePage?.({ ...draft, content_html: cleanContent })
      setStatus(result?.ok ? 'About Us page updated successfully.' : 'Failed to update About Us page.')
    } catch (error) {
      setStatus(error.message || 'Failed to update About Us page.')
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    const normalized = normalizeAboutUsPage(page)
    setDraft(normalized)
    if (editorRef.current) editorRef.current.innerHTML = normalized.content_html || ''
    setStatus('Changes reset.')
  }

  const preview = normalizeAboutUsPage({ ...draft, content_html: sanitizeRichHtml(editorRef.current?.innerHTML || draft.content_html || '') })

  return (
    <section className="admin-panel-stack about-admin-panel">
      <div className="admin-management-card">
        <SectionHeader icon={BookOpen} title="About Us Customization" subtitle="Edit the About Us page shown on the main website for all logged-in users" />
        <div className="form-grid">
          <label className="field">
            <span>Page title</span>
            <input value={draft.title} onChange={(e) => updateDraft('title', e.target.value)} placeholder="About Us" />
          </label>
          <label className="field">
            <span>Subtitle</span>
            <input value={draft.subtitle} onChange={(e) => updateDraft('subtitle', e.target.value)} placeholder="College of Pharmacy Research Platform" />
          </label>
          <label className="field">
            <span>Header image URL</span>
            <input value={draft.image_url || ''} onChange={(e) => updateDraft('image_url', e.target.value)} placeholder="Optional image URL" />
          </label>
          <label className="field about-publish-field">
            <span>Publication status</span>
            <select value={draft.is_published ? 'published' : 'draft'} onChange={(e) => updateDraft('is_published', e.target.value === 'published')}>
              <option value="published">Published</option>
              <option value="draft">Draft / hidden</option>
            </select>
          </label>
        </div>
      </div>

      <div className="admin-management-card rich-editor-card">
        <div className="rich-editor-toolbar" aria-label="About Us formatting toolbar">
          <button type="button" onClick={() => editorCommand('bold')}><b>B</b></button>
          <button type="button" onClick={() => editorCommand('italic')}><i>I</i></button>
          <button type="button" onClick={() => editorCommand('underline')}><u>U</u></button>
          <select aria-label="Text style" onChange={(e) => e.target.value && setBlock(e.target.value)} defaultValue="">
            <option value="">Heading / Paragraph</option>
            <option value="H2">Heading</option>
            <option value="H3">Subheading</option>
            <option value="P">Paragraph</option>
          </select>
          <select aria-label="Font size" onChange={(e) => e.target.value && editorCommand('fontSize', e.target.value)} defaultValue="">
            <option value="">Font size</option>
            <option value="2">Small</option>
            <option value="3">Normal</option>
            <option value="4">Large</option>
            <option value="5">Extra large</option>
          </select>
          <label className="toolbar-color-field">
            <span>Color</span>
            <input type="color" onChange={(e) => editorCommand('foreColor', e.target.value)} />
          </label>
          <button type="button" onClick={() => editorCommand('justifyLeft')}>Left</button>
          <button type="button" onClick={() => editorCommand('justifyCenter')}>Center</button>
          <button type="button" onClick={() => editorCommand('justifyRight')}>Right</button>
          <button type="button" onClick={() => editorCommand('justifyFull')}>Justify</button>
          <button type="button" onClick={() => editorCommand('insertUnorderedList')}>• List</button>
          <button type="button" onClick={() => editorCommand('insertOrderedList')}>1. List</button>
          <button type="button" onClick={addLink}>Link</button>
          <button type="button" onClick={() => editorCommand('removeFormat')}>Clear</button>
          <label className="toolbar-upload-button">
            {uploading ? 'Uploading image...' : 'Upload image'}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleImageUpload(e.target.files?.[0])} disabled={uploading} />
          </label>
        </div>
        <div
          ref={editorRef}
          className="rich-text-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={() => updateDraft('content_html', editorRef.current?.innerHTML || '')}
          dangerouslySetInnerHTML={{ __html: draft.content_html || '' }}
        />
        <div className="action-row">
          <button type="button" className="primary" onClick={handleSave} disabled={saving || uploading}>
            <ButtonContent loading={saving} loadingText="Saving About Us content...">Save About Us Page</ButtonContent>
          </button>
          <button type="button" className="secondary" onClick={handleReset} disabled={saving || uploading}>Reset / Cancel</button>
        </div>
        {status && <div className="message">{status}</div>}
      </div>

      <div className="admin-management-card about-preview-panel">
        <SectionHeader icon={Eye} title="Preview" subtitle="This is how the About Us page will appear on the main website" />
        <AboutUsPage page={preview} />
      </div>
    </section>
  )
}

function RoleSwitchDropdown({ activeRole, mode = 'committee', onChange }) {
  const options = mode === 'admin'
    ? [
        { value: 'admin', label: 'Admin' },
        { value: 'student', label: 'Student' },
        { value: 'supervisor', label: 'Supervisor' },
        { value: 'committee', label: 'Research Committee' },
      ]
    : [
        { value: 'committee', label: 'Research Committee' },
        { value: 'supervisor', label: 'Supervisor' },
      ]
  const value = mode === 'admin' ? activeRole || 'admin' : activeRole === 'supervisor' ? 'supervisor' : 'committee'
  return (
    <label className="role-switch-dropdown role-switch-label-hidden no-print" aria-label="Role">
      <select value={value} onChange={(e) => onChange?.(e.target.value)} aria-label="Role">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function InboxTrayIcon({ size = 20, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4.5 4.5h15l2 9.5v3.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V14l2-9.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 14h5.2a1.6 1.6 0 0 1 1.35.75l.9 1.5a1.6 1.6 0 0 0 1.35.75h.4a1.6 1.6 0 0 0 1.35-.75l.9-1.5A1.6 1.6 0 0 1 15.8 14H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 9h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function NotificationBellMenu({ data, role, currentUser, dataLoading = false, unreadCount = 0, markNotificationRead, removeNotification, showTrigger = true }) {
  const [open, setOpen] = useState(false)
  const [removingNotificationId, setRemovingNotificationId] = useState('')
  const [readingNotificationId, setReadingNotificationId] = useState('')
  const wrapperRef = useRef(null)
  const visibleNotifications = useMemo(() => (
    Array.isArray(data?.notifications) ? data.notifications.filter((notification) => notificationForUser(notification, currentUser, role)) : []
  ), [data?.notifications, currentUser, role])

  useEffect(() => {
    function handleOpenInbox() {
      setOpen(true)
    }

    window.addEventListener('open-platform-inbox', handleOpenInbox)
    return () => window.removeEventListener('open-platform-inbox', handleOpenInbox)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    function handleOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false)
    }
    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  async function handleMarkRead(notificationId) {
    if (!markNotificationRead || readingNotificationId || removingNotificationId) return
    setReadingNotificationId(notificationId)
    try {
      await markNotificationRead(notificationId)
    } finally {
      setReadingNotificationId('')
    }
  }

  async function handleRemove(notificationId) {
    if (!removeNotification || removingNotificationId) return
    if (!(await showAppConfirm('Are you sure you want to delete this inbox message?', { title: 'Delete Inbox Message', type: 'danger', confirmLabel: 'Delete' }))) return
    setRemovingNotificationId(notificationId)
    try {
      await removeNotification(notificationId)
    } finally {
      setRemovingNotificationId('')
    }
  }

  return (
    <div className={`notification-bell-menu ${showTrigger ? '' : 'notification-bell-menu--triggerless'} ${open ? 'open' : ''}`} ref={wrapperRef}>
      {showTrigger && (
        <button
          className={`main-notification-button header-inbox-button inbox-button ${open ? 'active' : ''}`}
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label="Open inbox"
          aria-expanded={open}
        >
          <span className="notification-icon" aria-hidden="true"><InboxTrayIcon size={18} /></span>
          <strong className="inbox-button-label">Inbox</strong>
          {unreadCount > 0 && <span className="inbox-unread-count notification-badge">{unreadCount}</span>}
        </button>
      )}

      <div className="notification-popover" role="dialog" aria-label="Inbox">
        <div className="notification-popover-head">
          <div>
            <b>Inbox</b>
            <small>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</small>
          </div>
          <span
            role="button"
            tabIndex={0}
            className="notification-x-plain"
            onClick={() => setOpen(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setOpen(false)
              }
            }}
            aria-label="Close inbox"
          >×</span>
        </div>

        <div className="notification-popover-list">
          {dataLoading ? (
            <div className="notification-popover-state">Loading inbox messages...</div>
          ) : visibleNotifications.length ? visibleNotifications.map((notification) => {
            const removing = String(removingNotificationId) === String(notification.id)
            const reading = String(readingNotificationId) === String(notification.id)
            return (
              <article className={`notification-popover-item ${notification.is_read ? '' : 'unread'}`} key={notification.id}>
                <div
                  role="button"
                  tabIndex={reading || removing ? -1 : 0}
                  className="notification-popover-content notification-text-button notification-content"
                  onClick={() => {
                    if (!reading && !removing && !notification.is_read) handleMarkRead(notification.id)
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && !reading && !removing && !notification.is_read) {
                      event.preventDefault()
                      handleMarkRead(notification.id)
                    }
                  }}
                  aria-disabled={reading || removing}
                >
                  <span className="notification-dot" aria-hidden="true" />
                  <span className="notification-text-stack notification-text notification-body">
                    <b className="notification-title">{notification.title || notification.type || 'Update'}</b>
                    <small className="notification-message">{notification.message || 'You have a new update.'}</small>
                    <em className="notification-time">{String(notification.created_at || '').slice(0, 16).replace('T', ' ') || 'Date unavailable'}</em>
                  </span>
                </div>
                <div className="notification-popover-actions">
                  {!notification.is_read && (
                    <button type="button" className="notification-read-button" onClick={() => handleMarkRead(notification.id)} disabled={reading || removing}>
                      <ButtonContent loading={reading} loadingText="Saving...">Mark read</ButtonContent>
                    </button>
                  )}
                  <button type="button" className="danger ghost-icon-button notification-delete-button" onClick={() => handleRemove(notification.id)} disabled={removing} aria-label="Delete inbox message">
                    <ButtonContent loading={removing} loadingText="..."><Trash2 size={14} /></ButtonContent>
                  </button>
                </div>
              </article>
            )
          }) : (
            <div className="notification-popover-state">No inbox messages.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProfileSettingsPage({ currentUser, onBack, updateOwnProfile, uploadOwnProfilePhoto, updateOwnPassword }) {
  const [form, setForm] = useState(() => ({
    full_name: currentUser?.full_name || '',
    display_name: currentUser?.display_name || '',
    phone_number: currentUser?.phone_number || '',
    department: currentUser?.department || '',
    program: currentUser?.program || '',
  }))
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' })
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(getProfilePhotoUrl(currentUser))
  const [statusMessage, setStatusMessage] = useState('')
  const [loadingKey, setLoadingKey] = useState('')
  const roleLabel = ({ student: 'Student', supervisor: 'Supervisor', admin: 'Admin', committee: 'Research Committee' }[currentUser?.role]) || currentUser?.role || 'User'

  useEffect(() => {
    setForm({
      full_name: currentUser?.full_name || '',
      display_name: currentUser?.display_name || '',
      phone_number: currentUser?.phone_number || '',
      department: currentUser?.department || '',
      program: currentUser?.program || '',
    })
    setPhotoPreview(getProfilePhotoUrl(currentUser))
    setPhotoFile(null)
  }, [currentUser])

  async function handlePhotoSelect(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setStatusMessage('Failed to upload profile photo. Please choose a JPG, PNG, or WebP image.')
      event.target.value = ''
      return
    }
    setPhotoFile(file)
    try {
      const preview = await fileToDataUrl(file)
      setPhotoPreview(preview)
    } catch (_error) {
      setPhotoPreview(getProfilePhotoUrl(currentUser))
    }
  }

  async function handlePhotoUpload() {
    if (!photoFile || loadingKey) return
    setLoadingKey('photo')
    setStatusMessage('Uploading photo...')
    try {
      const updated = await uploadOwnProfilePhoto(photoFile)
      setPhotoPreview(getProfilePhotoUrl(updated) || photoPreview)
      setPhotoFile(null)
      setStatusMessage('Profile photo updated successfully.')
    } catch (error) {
      setStatusMessage(error.message || 'Failed to upload profile photo.')
    } finally {
      setLoadingKey('')
    }
  }

  async function handleProfileSave(event) {
    event.preventDefault()
    if (loadingKey) return
    setLoadingKey('profile')
    setStatusMessage('Saving profile...')
    try {
      await updateOwnProfile({
        full_name: form.full_name,
        display_name: form.display_name,
        phone_number: form.phone_number,
        department: form.department,
        program: form.program,
      })
      setStatusMessage('Profile updated successfully.')
    } catch (error) {
      setStatusMessage(error.message || 'Failed to update profile.')
    } finally {
      setLoadingKey('')
    }
  }

  async function handlePasswordSave(event) {
    event.preventDefault()
    if (loadingKey) return
    setLoadingKey('password')
    setStatusMessage('Updating password...')
    try {
      await updateOwnPassword(passwordForm.current, passwordForm.next, passwordForm.confirm)
      setPasswordForm({ current: '', next: '', confirm: '' })
      setStatusMessage('Password updated successfully.')
    } catch (error) {
      setStatusMessage(error.message || 'Failed to update password.')
    } finally {
      setLoadingKey('')
    }
  }

  return (
    <section className="profile-settings-page no-print">
      <div className="profile-settings-hero">
        <div>
          <p className="eyebrow"><UserCog size={16} /> Profile Settings</p>
          <h2>Manage your account profile</h2>
          <p>Update your name, profile photo, allowed profile details, and password. Your email and role are read-only.</p>
        </div>
        <button type="button" className="secondary" onClick={onBack}>Back to Dashboard</button>
      </div>

      {statusMessage && <div className="message profile-settings-message">{statusMessage}</div>}

      <div className="profile-settings-grid">
        <article className="profile-settings-card profile-photo-card">
          <SectionHeader icon={ImageIcon} title="Profile Photo" subtitle="JPG, PNG, or WebP" />
          <div className="profile-photo-preview">
            {photoPreview ? <img src={photoPreview} alt="Profile preview" /> : <span>{String(getProfileDisplayName(currentUser)).charAt(0).toUpperCase()}</span>}
          </div>
          <label className="profile-file-picker">
            <Upload size={16} /> Choose photo
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelect} />
          </label>
          <button type="button" className="primary wide" onClick={handlePhotoUpload} disabled={!photoFile || loadingKey === 'photo'}>
            <ButtonContent loading={loadingKey === 'photo'} loadingText="Uploading photo...">Save Photo</ButtonContent>
          </button>
        </article>

        <form className="profile-settings-card" onSubmit={handleProfileSave}>
          <SectionHeader icon={UserCog} title="Personal Information" subtitle="Only your own profile can be updated" />
          <div className="profile-form-grid">
            <label>
              <span>Full name</span>
              <input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required />
            </label>
            <label>
              <span>Display name</span>
              <input value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} placeholder="Optional" />
            </label>
            <label>
              <span>Phone number</span>
              <input value={form.phone_number} onChange={(event) => setForm({ ...form, phone_number: event.target.value })} placeholder="Optional" />
            </label>
            <label>
              <span>Department / Program</span>
              <select value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>
                <option value="">Not specified</option>
                {DEPARTMENT_OPTIONS.map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
            </label>
            <label>
              <span>Program</span>
              <input value={form.program} onChange={(event) => setForm({ ...form, program: event.target.value })} placeholder="Optional" />
            </label>
            <label>
              <span>Email</span>
              <input value={currentUser?.email || ''} readOnly />
            </label>
            <label>
              <span>Role</span>
              <input value={roleLabel} readOnly />
            </label>
          </div>
          <button type="submit" className="primary" disabled={loadingKey === 'profile'}>
            <ButtonContent loading={loadingKey === 'profile'} loadingText="Saving profile..."><Save size={16} /> Save Profile</ButtonContent>
          </button>
        </form>

        <form className="profile-settings-card" onSubmit={handlePasswordSave}>
          <SectionHeader icon={Lock} title="Account Security" subtitle="Change your password securely" />
          <div className="profile-form-grid">
            <label>
              <span>Current password</span>
              <input type="password" value={passwordForm.current} onChange={(event) => setPasswordForm({ ...passwordForm, current: event.target.value })} autoComplete="current-password" />
            </label>
            <label>
              <span>New password</span>
              <input type="password" value={passwordForm.next} onChange={(event) => setPasswordForm({ ...passwordForm, next: event.target.value })} autoComplete="new-password" />
            </label>
            <label>
              <span>Confirm new password</span>
              <input type="password" value={passwordForm.confirm} onChange={(event) => setPasswordForm({ ...passwordForm, confirm: event.target.value })} autoComplete="new-password" />
            </label>
          </div>
          <button type="submit" className="primary" disabled={loadingKey === 'password'}>
            <ButtonContent loading={loadingKey === 'password'} loadingText="Updating password..."><Lock size={16} /> Update Password</ButtonContent>
          </button>
        </form>
      </div>
    </section>
  )
}

function UserProfileMenu({ currentUser, onLogout, onOpenProfile }) {
  const [open, setOpen] = useState(false)
  const [menuVisible, setMenuVisible] = useState(false)
  const closeTimerRef = useRef(null)
  const hideTimerRef = useRef(null)
  const photo = getProfilePhotoUrl(currentUser)
  const initial = String(getProfileDisplayName(currentUser) || currentUser?.email || 'U').trim().charAt(0).toUpperCase()
  const displayName = getProfileDisplayName(currentUser)
  const displayEmail = currentUser?.email || 'No email available'

  function openProfileSettings() {
    if (onOpenProfile) onOpenProfile()
    setOpen(false)
    setMenuVisible(false)
  }

  function keepProfileOpen() {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    closeTimerRef.current = null
    hideTimerRef.current = null
    setMenuVisible(true)
    setOpen(true)
  }

  function scheduleProfileClose() {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false)
      hideTimerRef.current = window.setTimeout(() => {
        setMenuVisible(false)
        hideTimerRef.current = null
      }, 260)
      closeTimerRef.current = null
    }, 420)
  }

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
  }, [])

  return (
    <div className={`student-profile-menu user-profile-menu ${open ? 'open' : menuVisible ? 'closing' : ''}`} onMouseEnter={keepProfileOpen} onMouseLeave={scheduleProfileClose}>
      <button className="student-profile-trigger redesigned" type="button" onClick={() => (open ? scheduleProfileClose() : keepProfileOpen())} aria-label="Open profile menu">
        {photo ? <img src={photo} alt="Profile" /> : <span>{initial}</span>}
        <span className="profile-online-dot" aria-hidden="true" />
      </button>
      {menuVisible && (
        <div className="student-profile-dropdown redesigned-profile-card">
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

            <button className="profile-upload-button redesigned" type="button" onClick={openProfileSettings}>
              <Upload size={15} /> {photo ? 'Change photo' : 'Add photo'}
            </button>
            <div className="profile-menu-actions">
              <button className="profile-menu-button subtle" type="button" onClick={openProfileSettings}><Settings size={15} /> Profile Settings</button>
              <button className="profile-menu-button logout" type="button" onClick={onLogout}><LogOut size={15} /> Logout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


function ColorSettingField({
  label,
  value,
  defaultValue,
  onChange,
  onReset,
  validator = isValidThemeHexColor,
  placeholder = '#2563eb',
  validationMessage = 'Use a valid 3-, 6-, or 8-digit HEX value.',
  showColorPicker = true,
  previewStyle = {},
}) {
  const valid = validator(value)
  const visualPreviewStyle = showColorPicker
    ? { backgroundColor: valid ? value : '#ffffff', ...previewStyle }
    : { backgroundColor: '#ffffff', borderRadius: valid ? value : defaultValue, ...previewStyle }
  return (
    <div className={`button-color-setting-field${valid ? '' : ' is-invalid'}`}>
      <div className="button-color-setting-label-row">
        <span>{label}</span>
        <span className="button-color-setting-preview" style={visualPreviewStyle} aria-hidden="true" />
      </div>
      <div className={`button-color-setting-controls${showColorPicker ? '' : ' no-color-picker'}`}>
        {showColorPicker && (
          <input
            className="button-color-picker"
            type="color"
            value={colorPickerValue(value)}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`${label} color picker`}
          />
        )}
        <input
          className="button-color-hex-input"
          type="text"
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          spellCheck="false"
          aria-label={`${label} value`}
          aria-invalid={!valid}
        />
        <button type="button" className="button-color-field-reset" onClick={() => onReset(defaultValue)} aria-label={`Reset ${label}`} title={`Reset ${label}`}>
          <RefreshCw size={14} />
        </button>
      </div>
      {!valid && <small className="button-color-field-error">{validationMessage}</small>}
    </div>
  )
}

function ButtonColorCustomizationPanel({
  colors,
  savedColors,
  onChange,
  onResetField,
  onSave,
  onResetPreview,
  onRestoreDefaults,
  loadingKey = '',
  status = '',
  error = '',
}) {
  const normalizedPreview = normalizeButtonColors(colors)
  const contrastWarnings = getButtonColorContrastWarnings(colors)
  const invalidFields = validateButtonColorValues(colors)
  return (
    <div className="button-color-customization-page admin-panel-stack">
      <div className="card button-color-customization-intro">
        <SectionHeader icon={Palette} title="Button Color Customization" subtitle="Control button backgrounds, text, icons, borders, hover states, active states, hero navigation, and search colors across the entire platform" />
        <div className="soft-box settings-note">
          <b>Connected to the existing Website Settings system</b>
          <p>These values are saved inside the existing <code>app_settings</code> website record through the current <code>save_website_settings</code> flow. No duplicate table, route, or permissions system is created.</p>
        </div>
        {error && <div className="button-color-message is-error" role="alert">{error}</div>}
        {status && <div className="button-color-message is-success" role="status">{status}</div>}
        {invalidFields.length > 0 && (
          <div className="button-color-message is-error" role="alert">
            <b>Invalid color values:</b> {invalidFields.join(', ')}
          </div>
        )}
        {contrastWarnings.length > 0 && (
          <div className="button-color-message is-warning" role="status">
            <b>Contrast review:</b>
            <ul>{contrastWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="button-color-editor-layout">
        <div className="button-color-sections">
          {BUTTON_COLOR_SECTIONS.map((section, sectionIndex) => (
            <details className="card button-color-section" key={section.key} open={sectionIndex < 2 ? true : undefined}>
              <summary>
                <span><b>{section.title}</b><small>{section.description}</small></span>
                <span className="button-color-section-count">{section.fields.length} colors</span>
              </summary>
              <div className="button-color-field-grid">
                {section.fields.map(([fieldKey, label]) => (
                  <ColorSettingField
                    key={`${section.key}-${fieldKey}`}
                    label={label}
                    value={colors?.[section.key]?.[fieldKey] ?? DEFAULT_BUTTON_COLORS[section.key][fieldKey]}
                    defaultValue={DEFAULT_BUTTON_COLORS[section.key][fieldKey]}
                    onChange={(value) => onChange(section.key, fieldKey, value)}
                    onReset={(value) => onResetField(section.key, fieldKey, value)}
                  />
                ))}
              </div>
            </details>
          ))}
        </div>

        <aside className="card button-color-live-preview">
          <SectionHeader icon={Eye} title="Live Preview" subtitle="Preview updates immediately. These buttons do not perform actions." />
          <div className="button-color-preview-stack" style={{
            '--preview-primary-bg': normalizedPreview.primary.background,
            '--preview-primary-text': normalizedPreview.primary.text,
            '--preview-primary-border': normalizedPreview.primary.border,
          }}>
            <button type="button" className="button-theme-preview button-theme-preview--primary"><Save size={16} /> Primary Button</button>
            <button type="button" className="button-theme-preview button-theme-preview--secondary"><Eye size={16} /> Secondary Button</button>
            <button type="button" className="button-theme-preview button-theme-preview--success"><CheckCircle2 size={16} /> Accept Button</button>
            <button type="button" className="button-theme-preview button-theme-preview--revision"><RefreshCw size={16} /> Revision Button</button>
            <button type="button" className="button-theme-preview button-theme-preview--danger"><XCircle size={16} /> Reject Button</button>
            <button type="button" className="button-theme-preview" disabled><Lock size={16} /> Disabled Button</button>
            <div className="button-theme-preview-group">
              <span>Hero navigation</span>
              <button type="button" className="hero-nav-button button-theme-preview-hero">Inactive</button>
              <button type="button" className="hero-nav-button button-theme-preview-hero active" aria-current="page">Active</button>
            </div>
            <div className="button-theme-preview-group">
              <span>Search</span>
              <button type="button" className="role-feature-search__button button-theme-preview-search" aria-label="Search preview"><Search size={21} /></button>
            </div>
          </div>
          <div className="button-color-saved-indicator">
            <span className="button-color-setting-preview" style={{ background: savedColors?.primary?.background || DEFAULT_BUTTON_COLORS.primary.background }} />
            <span><b>Last saved primary color</b><small>{savedColors?.primary?.background || DEFAULT_BUTTON_COLORS.primary.background}</small></span>
          </div>
        </aside>
      </div>

      <div className="card button-color-sticky-actions">
        <div>
          <b>Publish button colors</b>
          <p>Saving updates the existing website settings record and makes the CSS variables available to every role after loading or refreshing the site.</p>
        </div>
        <div className="settings-actions compact-actions">
          <button type="button" className="primary min-button-width" disabled={Boolean(loadingKey)} onClick={onSave}>
            <ButtonContent loading={loadingKey === 'save-button-colors'} loadingText="Saving colors..." icon={Save}>Save Button Colors</ButtonContent>
          </button>
          <button type="button" className="secondary min-button-width" disabled={Boolean(loadingKey)} onClick={onResetPreview}>
            <RefreshCw size={16} /> Reset Preview
          </button>
          <button type="button" className="danger min-button-width" disabled={Boolean(loadingKey)} onClick={onRestoreDefaults}>
            <RefreshCw size={16} /> Restore Default Button Colors
          </button>
        </div>
      </div>
    </div>
  )
}


function InterfaceColorCustomizationPanel({
  colors,
  savedColors,
  onChange,
  onResetField,
  onSave,
  onResetPreview,
  onRestoreDefaults,
  loadingKey = '',
  status = '',
  error = '',
}) {
  const normalizedPreview = normalizeInterfaceColors(colors)
  const contrastWarnings = getInterfaceColorContrastWarnings(colors)
  const invalidFields = validateInterfaceColorValues(colors)

  return (
    <div className="interface-color-customization-page admin-panel-stack">
      <div className="card button-color-customization-intro">
        <SectionHeader icon={SlidersHorizontal} title="Interface Color Customization" subtitle="Customize the authenticated Top Header, complete Sidebar appearance, and existing Inbox popup across all roles" />
        <div className="soft-box settings-note">
          <b>One shared settings source</b>
          <p>Top Header, Sidebar, and Inbox colors are saved under <code>interface_colors</code> in the same existing <code>app_settings</code> website record. Existing Sidebar button values are migrated into this canonical Sidebar section automatically.</p>
        </div>
        {error && <div className="button-color-message is-error" role="alert">{error}</div>}
        {status && <div className="button-color-message is-success" role="status">{status}</div>}
        {invalidFields.length > 0 && (
          <div className="button-color-message is-error" role="alert">
            <b>Invalid color values:</b> {invalidFields.join(', ')}
          </div>
        )}
        {contrastWarnings.length > 0 && (
          <div className="button-color-message is-warning" role="status">
            <b>Readability review:</b>
            <ul>{contrastWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="button-color-editor-layout interface-color-editor-layout">
        <div className="button-color-sections">
          {INTERFACE_COLOR_SECTIONS.map((section) => (
            <details className="card button-color-section" key={section.id || section.key} open>
              <summary>
                <span><b>{section.title}</b><small>{section.description}</small></span>
                <span className="button-color-section-count">{section.fields.length} colors</span>
              </summary>
              <div className="button-color-field-grid">
                {section.fields.map(([fieldKey, label]) => {
                  const isLengthField = INTERFACE_LENGTH_FIELDS.has(fieldKey)
                  return (
                    <ColorSettingField
                      key={`${section.key}-${fieldKey}`}
                      label={label}
                      value={colors?.[section.key]?.[fieldKey] ?? DEFAULT_INTERFACE_COLORS[section.key][fieldKey]}
                      defaultValue={DEFAULT_INTERFACE_COLORS[section.key][fieldKey]}
                      onChange={(value) => onChange(section.key, fieldKey, value)}
                      onReset={(value) => onResetField(section.key, fieldKey, value)}
                      validator={isLengthField ? isValidThemeCssLength : isValidThemeCssColor}
                      showColorPicker={!isLengthField}
                      placeholder={isLengthField ? '18px' : fieldKey.toLowerCase().includes('shadow') || fieldKey.toLowerCase().includes('background') ? 'rgba(15, 23, 42, 0.18)' : '#2563eb'}
                      validationMessage={isLengthField ? 'Use a CSS length such as 18px, 1rem, or 50%.' : 'Use HEX, 8-digit HEX, RGB, RGBA, or transparent.'}
                    />
                  )
                })}
              </div>
            </details>
          ))}
        </div>

        <aside className="card button-color-live-preview interface-color-live-preview">
          <SectionHeader icon={Eye} title="Interface Live Preview" subtitle="Preview controls are visual only and do not perform real actions." />

          <div className="interface-preview-section">
            <span className="interface-preview-label">Top Header Preview</span>
            <div className="interface-header-preview">
              <button type="button" className="interface-preview-hamburger" aria-label="Hamburger preview"><span /><span /><span /></button>
              <div className="interface-preview-header-copy"><b>Research Dashboard</b><small>Student role</small></div>
              <div className="interface-preview-header-actions">
                <select defaultValue="student" aria-label="Role preview"><option value="student">Student</option></select>
                <button type="button" className="interface-preview-avatar" aria-label="Profile preview">M</button>
              </div>
            </div>
          </div>

          <div className="interface-preview-section">
            <span className="interface-preview-label">Sidebar Preview</span>
            <div className="interface-sidebar-preview">
              <div className="interface-sidebar-preview-head">
                <b>Navigation</b>
                <button type="button" className="interface-sidebar-preview-close" aria-label="Close preview">×</button>
              </div>
              <button type="button" className="interface-sidebar-preview-item">
                <span className="interface-sidebar-preview-icon"><LayoutDashboard size={16} /></span><span>Inactive item</span>
              </button>
              <button type="button" className="interface-sidebar-preview-item is-hovered">
                <span className="interface-sidebar-preview-icon"><BookOpen size={16} /></span><span>Hovered item</span>
              </button>
              <button type="button" className="interface-sidebar-preview-item active">
                <span className="interface-sidebar-preview-icon"><Settings size={16} /></span><span>Active item</span>
              </button>
              <button type="button" className="interface-sidebar-preview-utility">
                <span className="interface-sidebar-preview-icon"><Printer size={16} /></span><span>Print/PDF Reports</span>
              </button>
              <button type="button" className="interface-sidebar-preview-item admin-example">
                <span className="interface-sidebar-preview-icon"><SlidersHorizontal size={16} /></span><span>Admin Subdomain</span>
              </button>
            </div>
          </div>

          <div className="interface-preview-section">
            <span className="interface-preview-label">Inbox Preview</span>
            <div className="interface-inbox-preview">
              <div className="interface-inbox-preview-head">
                <div><b>Inbox</b><small>1 unread</small></div>
                <button type="button" className="interface-inbox-preview-close" aria-label="Close Inbox preview">×</button>
              </div>
              <div className="interface-inbox-preview-list">
                <article className="interface-inbox-preview-item unread">
                  <span className="interface-inbox-preview-dot" />
                  <div><b>New project update</b><p>Your research project has a new decision.</p><small>Today, 10:30</small></div>
                  <div className="interface-inbox-preview-actions">
                    <button type="button" className="interface-inbox-preview-read">Mark read</button>
                    <button type="button" className="interface-inbox-preview-delete" aria-label="Delete preview"><Trash2 size={13} /></button>
                  </div>
                </article>
                <article className="interface-inbox-preview-item read">
                  <span className="interface-inbox-preview-dot" />
                  <div><b>Weekly report received</b><p>Your previous message has been read.</p><small>Yesterday</small></div>
                </article>
                <div className="interface-inbox-preview-empty">No additional Inbox messages.</div>
              </div>
            </div>
          </div>

          <div className="button-color-saved-indicator">
            <span className="button-color-setting-preview" style={{ background: savedColors?.topHeader?.background || DEFAULT_INTERFACE_COLORS.topHeader.background }} />
            <span><b>Last saved header color</b><small>{savedColors?.topHeader?.background || DEFAULT_INTERFACE_COLORS.topHeader.background}</small></span>
          </div>
        </aside>
      </div>

      <div className="card button-color-sticky-actions">
        <div>
          <b>Publish interface colors</b>
          <p>Saving updates the existing website settings row, applies the theme immediately, and preserves every unrelated customization value.</p>
        </div>
        <div className="settings-actions compact-actions">
          <button type="button" className="primary min-button-width" disabled={Boolean(loadingKey)} onClick={onSave}>
            <ButtonContent loading={loadingKey === 'save-interface-colors'} loadingText="Saving interface colors..." icon={Save}>Save Interface Colors</ButtonContent>
          </button>
          <button type="button" className="secondary min-button-width" disabled={Boolean(loadingKey)} onClick={onResetPreview}>
            <RefreshCw size={16} /> Reset Unsaved Changes
          </button>
          <button type="button" className="danger min-button-width" disabled={Boolean(loadingKey)} onClick={onRestoreDefaults}>
            <RefreshCw size={16} /> Restore Default Interface Colors
          </button>
        </div>
      </div>
    </div>
  )
}

function AdminControlPanel({
  settings,
  aboutUsPage = defaultAboutUsPage,
  updateAboutUsPage,
  uploadAboutUsImage,
  pdfReportSettings = defaultPdfReportSettings,
  pdfReportSettingsByRole = {},
  globalPdfReportSettings = defaultPdfReportSettings,
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
  assignProjectLeader,
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
  decideGroupJoinRequest,
  directAddStudentsToGroup,
  updateOwnProfile,
  uploadOwnProfilePhoto,
  updateOwnPassword,
  updateCommitteeSupervisorAccess,
  loadError = '',
  dataLoading = false,
}) {
  const [draft, setDraft] = useState(settings)
  const [brandingError, setBrandingError] = useState('')
  const [panelActionLoading, setPanelActionLoading] = useState('')
  const [selectedRoleHero, setSelectedRoleHero] = useState('student')
  const [buttonColorStatus, setButtonColorStatus] = useState('')
  const [buttonColorError, setButtonColorError] = useState('')
  const [interfaceColorStatus, setInterfaceColorStatus] = useState('')
  const [interfaceColorError, setInterfaceColorError] = useState('')
  useEffect(() => {
    setDraft(settings)
  }, [settings])

  useEffect(() => {
    const previewingColors = adminPanelTab === 'button-colors'
    applyButtonColorCssVariables(previewingColors ? draft.button_colors : settings.button_colors)
    applyInterfaceTheme(previewingColors ? draft.interface_colors : settings.interface_colors)
  }, [adminPanelTab, draft.button_colors, draft.interface_colors, settings.button_colors, settings.interface_colors])

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'branding', label: 'Website Settings', icon: SlidersHorizontal },
    { id: 'button-colors', label: 'Color Customization', icon: Palette },
    { id: 'login-settings', label: 'Login Page Settings', icon: Lock },
    { id: 'about-us', label: 'About Us Customization', icon: BookOpen },
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'supervisors', label: 'Supervisor Management', icon: UserCog },
    { id: 'dual-roles', label: 'Dual Role Management', icon: ShieldCheck },
    { id: 'invitations', label: 'Invite Users', icon: Mail },
    { id: 'deadlines', label: 'Deadlines', icon: CalendarDays },
    { id: 'notifications', label: 'Inbox', icon: Inbox },
    { id: 'group-requests', label: 'Group Join Requests', icon: Users },
    { id: 'database', label: 'Database', icon: Database },
    { id: 'audit', label: 'Audit Log', icon: ShieldCheck },
    { id: 'reports', label: 'Reports', icon: Printer },
    { id: 'pdf-report', label: 'PDF Report Customization', icon: FileText },
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


  function updateButtonColorDraft(sectionKey, fieldKey, value) {
    setButtonColorError('')
    setButtonColorStatus('Preview updated. Save when you are satisfied with the colors.')
    setDraft((current) => {
      const currentColors = current.button_colors && typeof current.button_colors === 'object' ? current.button_colors : cloneDefaultButtonColors()
      return {
        ...current,
        button_colors: {
          ...currentColors,
          [sectionKey]: {
            ...DEFAULT_BUTTON_COLORS[sectionKey],
            ...(currentColors[sectionKey] || {}),
            [fieldKey]: value,
          },
        },
      }
    })
  }

  function resetButtonColorField(sectionKey, fieldKey, value) {
    updateButtonColorDraft(sectionKey, fieldKey, value)
    setButtonColorStatus('Field reset to the approved default. This is still a preview until saved.')
  }

  async function saveButtonColors() {
    const invalid = validateButtonColorValues(draft.button_colors)
    if (invalid.length) {
      const errorText = `Please correct these invalid HEX values before saving: ${invalid.join(', ')}`
      setButtonColorError(errorText)
      await showAppAlert(errorText, { title: 'Invalid Button Colors', type: 'warning' })
      return { ok: false }
    }

    const normalizedColors = normalizeButtonColors(draft.button_colors)
    const warnings = getButtonColorContrastWarnings(normalizedColors)
    if (warnings.length) {
      const confirmed = await showAppConfirm(
        `Some color combinations may be difficult to read:\n\n${warnings.slice(0, 8).join('\n')}\n\nSave these colors anyway?`,
        { title: 'Contrast Warning', type: 'warning', confirmLabel: 'Save Anyway' },
      )
      if (!confirmed) return { ok: false }
    }

    const nextDraft = normalizeSettings({ ...settings, button_colors: normalizedColors })
    setButtonColorError('')
    setButtonColorStatus('Saving and verifying button colors...')

    const result = await updateSettings(nextDraft, {
      deferCommitUntilSuccess: true,
      verifyButtonColors: true,
    })

    if (!result?.ok) {
      const errorText = result?.error?.message || 'Button colors could not be saved to the existing website settings record.'
      setButtonColorStatus('')
      setButtonColorError(errorText)
      await showAppAlert(errorText, { title: 'Button Colors Not Saved', type: 'error' })
      return result
    }

    const savedSettings = normalizeSettings(result.settings || nextDraft)
    setDraft(savedSettings)
    applyButtonTheme(savedSettings.button_colors)
    setButtonColorStatus('Button colors were saved, verified, and applied to the live website.')
    await showAppAlert('Button colors were saved successfully and are now applied across the website.', { title: 'Button Colors Saved', type: 'success' })
    return { ok: true, settings: savedSettings }
  }

  function resetButtonColorPreview() {
    const saved = normalizeButtonColors(settings.button_colors)
    setDraft((current) => ({ ...current, button_colors: saved }))
    applyButtonColorCssVariables(saved)
    setButtonColorError('')
    setButtonColorStatus('Preview reset to the last saved button colors. No database change was made.')
  }

  async function restoreDefaultButtonColors() {
    const confirmed = await showAppConfirm(
      'Restore the approved default palette for all button categories? This will save the defaults globally after confirmation.',
      { title: 'Restore Default Button Colors', type: 'warning', confirmLabel: 'Restore Defaults' },
    )
    if (!confirmed) return { ok: false }

    const defaults = cloneDefaultButtonColors()
    const nextDraft = normalizeSettings({ ...settings, button_colors: defaults })
    const result = await updateSettings(nextDraft, {
      deferCommitUntilSuccess: true,
      verifyButtonColors: true,
    })

    if (!result?.ok) {
      const errorText = result?.error?.message || 'Default button colors could not be saved.'
      setButtonColorError(errorText)
      setButtonColorStatus('')
      await showAppAlert(errorText, { title: 'Defaults Not Restored', type: 'error' })
      return result
    }

    const savedSettings = normalizeSettings(result.settings || nextDraft)
    setDraft(savedSettings)
    applyButtonTheme(savedSettings.button_colors)
    setButtonColorError('')
    setButtonColorStatus('Default button colors were restored, verified, and applied successfully.')
    await showAppAlert('Default button colors were restored successfully.', { title: 'Defaults Restored', type: 'success' })
    return { ok: true, settings: savedSettings }
  }


  function updateInterfaceColorDraft(sectionKey, fieldKey, value) {
    setInterfaceColorError('')
    setInterfaceColorStatus('Preview updated. Save when you are satisfied with the interface colors.')
    setDraft((current) => {
      const currentColors = normalizeInterfaceColors(current.interface_colors)
      const nextSection = {
        ...DEFAULT_INTERFACE_COLORS[sectionKey],
        ...(currentColors[sectionKey] || {}),
        [fieldKey]: value,
      }

      if (sectionKey === 'sidebar') {
        const iconFieldGroups = [
          ['icon', 'inactiveIcon', 'iconContainerIcon'],
          ['hoverIcon', 'iconContainerHoverIcon'],
          ['activeIcon', 'iconContainerActiveIcon'],
        ]
        const relatedFields = iconFieldGroups.find((fields) => fields.includes(fieldKey))
        relatedFields?.forEach((relatedField) => {
          nextSection[relatedField] = value
        })
      }

      return {
        ...current,
        interface_colors: {
          ...currentColors,
          [sectionKey]: nextSection,
        },
      }
    })
  }

  function resetInterfaceColorField(sectionKey, fieldKey, value) {
    updateInterfaceColorDraft(sectionKey, fieldKey, value)
    setInterfaceColorStatus('Field reset to the approved default. This is still a preview until saved.')
  }

  async function saveInterfaceColors() {
    const invalid = validateInterfaceColorValues(draft.interface_colors)
    if (invalid.length) {
      const errorText = `Please correct these invalid color values before saving: ${invalid.join(', ')}`
      setInterfaceColorError(errorText)
      await showAppAlert(errorText, { title: 'Invalid Interface Colors', type: 'warning' })
      return { ok: false }
    }

    const normalizedColors = normalizeInterfaceColors(draft.interface_colors)
    const warnings = getInterfaceColorContrastWarnings(normalizedColors)
    if (warnings.length) {
      const confirmed = await showAppConfirm(
        `This color combination may be difficult to read:\n\n${warnings.slice(0, 10).join('\n')}\n\nSave these colors anyway?`,
        { title: 'Interface Contrast Warning', type: 'warning', confirmLabel: 'Save Anyway' },
      )
      if (!confirmed) return { ok: false }
    }

    const nextDraft = normalizeSettings({
      ...settings,
      interface_colors: normalizedColors,
    })
    setInterfaceColorError('')
    setInterfaceColorStatus('Saving and verifying interface colors...')

    const result = await updateSettings(nextDraft, {
      deferCommitUntilSuccess: true,
      verifyInterfaceColors: true,
    })

    if (!result?.ok) {
      const errorText = result?.error?.message || 'Interface colors could not be saved to the existing website settings record.'
      setInterfaceColorStatus('')
      setInterfaceColorError(errorText)
      await showAppAlert(errorText, { title: 'Interface Colors Not Saved', type: 'error' })
      return result
    }

    const savedSettings = normalizeSettings(result.settings || nextDraft)
    setDraft(savedSettings)
    applyButtonTheme(savedSettings.button_colors)
    applyInterfaceTheme(savedSettings.interface_colors)
    setInterfaceColorStatus('Top Header, Sidebar, and Inbox colors were saved, verified, and applied to the live website.')
    await showAppAlert('Interface colors were saved successfully and are now applied across the website.', { title: 'Interface Colors Saved', type: 'success' })
    return { ok: true, settings: savedSettings }
  }

  function resetInterfaceColorPreview() {
    const saved = normalizeInterfaceColors(settings.interface_colors)
    setDraft((current) => ({ ...current, interface_colors: saved }))
    applyInterfaceTheme(saved)
    setInterfaceColorError('')
    setInterfaceColorStatus('Unsaved interface changes were reset to the last saved colors. No database change was made.')
  }

  async function restoreDefaultInterfaceColors() {
    const confirmed = await showAppConfirm(
      'Restore the approved default colors for the Top Header, Sidebar, and Inbox? Unrelated website settings will be preserved.',
      { title: 'Restore Default Interface Colors', type: 'warning', confirmLabel: 'Restore Defaults' },
    )
    if (!confirmed) return { ok: false }

    const defaults = cloneDefaultInterfaceColors()
    const nextDraft = normalizeSettings({
      ...settings,
      interface_colors: defaults,
    })
    const result = await updateSettings(nextDraft, {
      deferCommitUntilSuccess: true,
      verifyInterfaceColors: true,
    })

    if (!result?.ok) {
      const errorText = result?.error?.message || 'Default interface colors could not be saved.'
      setInterfaceColorError(errorText)
      setInterfaceColorStatus('')
      await showAppAlert(errorText, { title: 'Defaults Not Restored', type: 'error' })
      return result
    }

    const savedSettings = normalizeSettings(result.settings || nextDraft)
    setDraft(savedSettings)
    applyButtonTheme(savedSettings.button_colors)
    applyInterfaceTheme(savedSettings.interface_colors)
    setInterfaceColorError('')
    setInterfaceColorStatus('Default interface colors were restored, verified, and applied successfully.')
    await showAppAlert('Default interface colors were restored successfully.', { title: 'Defaults Restored', type: 'success' })
    return { ok: true, settings: savedSettings }
  }


  function updateRoleHeroDraft(role, patch = {}) {
    const normalizedRole = normalizeRoleHeroRole(role)
    setDraft((current) => {
      const currentHeroes = normalizeRoleHeroSettings(current.roleHeroes, current)
      const nextHero = normalizeRoleHeroConfig(normalizedRole, { ...currentHeroes[normalizedRole], ...(patch || {}) })
      return {
        ...current,
        roleHeroes: {
          ...currentHeroes,
          [normalizedRole]: nextHero,
        },
      }
    })
  }

  async function handleRoleHeroImageUpload(role, file) {
    const normalizedRole = normalizeRoleHeroRole(role)
    if (!file || panelActionLoading) return
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setBrandingError('Please choose a JPG, PNG, or WEBP image for the role dashboard picture.')
      return
    }
    if (file.size > 7 * 1024 * 1024) {
      setBrandingError('Please choose an image smaller than 7 MB for faster dashboard loading. The picture will be auto-fitted to the dashboard area.')
      return
    }

    try {
      setPanelActionLoading(`upload-role-hero-${normalizedRole}`)
      setBrandingError('Uploading and auto-fitting role dashboard picture...')
      const outputType = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg'
      const dataUrl = await optimizeImageFile(file, { maxWidth: 1920, maxHeight: 900, quality: 0.88, outputType })
      let imageUrl = dataUrl
      let imagePath = ''

      if (isSupabaseConfigured) {
        const blob = await fetch(dataUrl).then((response) => response.blob())
        const extension = outputType === 'image/png' ? 'png' : outputType === 'image/webp' ? 'webp' : 'jpg'
        const safeName = String(file.name || `${normalizedRole}-hero`).replace(/[^a-z0-9._-]/gi, '-').toLowerCase()
        imagePath = `role-heroes/${normalizedRole}-hero-${Date.now()}-${safeName}.${extension}`
        const upload = await supabase.storage
          .from('app-assets')
          .upload(imagePath, blob, { contentType: outputType, cacheControl: '3600', upsert: true })

        if (upload.error) {
          updateRoleHeroDraft(normalizedRole, { imageUrl: dataUrl, imagePath: '' })
          setBrandingError(`Role hero preview loaded locally, but global upload failed: ${upload.error.message}. Check the existing app-assets storage bucket and website settings SQL.`)
          return
        }

        const { data: publicData } = supabase.storage.from('app-assets').getPublicUrl(imagePath)
        imageUrl = publicData?.publicUrl || dataUrl
      }

      updateRoleHeroDraft(normalizedRole, { imageUrl, imagePath })
      setBrandingError(isSupabaseConfigured ? 'Role dashboard picture uploaded and auto-fitted. Click Save Role Hero Settings to publish it globally.' : 'Role dashboard picture preview loaded locally and auto-fitted. Connect Supabase Storage to save it globally for all users.')
    } catch (error) {
      try {
        const fallback = await fileToDataUrl(file)
        updateRoleHeroDraft(normalizedRole, { imageUrl: fallback, imagePath: '' })
        setBrandingError(`Role dashboard picture preview loaded locally and auto-fitted, but upload failed: ${error.message || 'Unknown error'}`)
      } catch {
        setBrandingError(error.message || 'Could not upload the selected role hero image. Try a smaller JPG, PNG, or WEBP file.')
      }
    } finally {
      setPanelActionLoading('')
    }
  }

  async function removeRoleHeroImage(role) {
    const normalizedRole = normalizeRoleHeroRole(role)
    const currentHeroes = normalizeRoleHeroSettings(draft.roleHeroes, draft)
    const oldPath = currentHeroes[normalizedRole]?.imagePath
    updateRoleHeroDraft(normalizedRole, { imageUrl: '', imagePath: '' })
    if (isSupabaseConfigured && oldPath) {
      try {
        await supabase.storage.from('app-assets').remove([oldPath])
      } catch {
        // Hiding the image in settings is enough even if old storage cleanup fails.
      }
    }
    setBrandingError('Role dashboard picture removed. Click Save Role Hero Settings to publish the change globally.')
  }

  function resetRoleHeroDraft(role) {
    const normalizedRole = normalizeRoleHeroRole(role)
    updateRoleHeroDraft(normalizedRole, ROLE_HERO_DEFAULTS[normalizedRole] || ROLE_HERO_DEFAULTS.student)
    setBrandingError('Role hero reset to the default text and fallback background. Click Save Role Hero Settings to publish it globally.')
  }

  async function handleImageUpload(key, file) {
    if (!file || panelActionLoading) return
    if (!file.type?.startsWith('image/')) {
      setBrandingError('Please choose a valid image file.')
      return
    }

    try {
      setPanelActionLoading(`upload-${key}`)
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
        const filePath = `website-backgrounds/${key}-${Date.now()}-${safeName}.${extension}`
        const upload = await supabase.storage
          .from('app-assets')
          .upload(filePath, blob, {
            contentType: outputType,
            cacheControl: '3600',
            upsert: true,
          })

        if (upload.error) {
          updateDraft(key, dataUrl)
          setBrandingError(`Image preview loaded locally, but global upload failed: ${upload.error.message}. Run supabase/website_settings.sql in Supabase SQL Editor, then upload again.`)
          return
        }

        const { data: publicData } = supabase.storage.from('app-assets').getPublicUrl(filePath)
        const publicUrl = publicData?.publicUrl
        if (!publicUrl) throw new Error('Image uploaded, but Supabase did not return a public URL.')
        updateDraft(key, publicUrl)
        setBrandingError(key === 'heroImage' ? 'Hero background uploaded successfully. Click Save Website Settings to publish it globally.' : key === 'loginBackgroundImage' ? 'Login background uploaded successfully. Click Save Login Page Settings to publish it globally.' : 'Image uploaded successfully. Click Save Login Page Settings to publish it globally.')
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
    } finally {
      setPanelActionLoading('')
    }
  }


  async function removeWebsiteBackground(key, label) {
    if (panelActionLoading) return
    const next = { ...draft, [key]: defaultWebsiteSettings[key] || '/hero-page.png', assetUpdatedAt: new Date().toISOString() }
    setDraft(next)
    const result = await updateSettings(next)
    if (result?.ok) {
      setBrandingError(`${label} removed successfully. The default background will be used.`)
    } else {
      setBrandingError(`Failed to remove ${label.toLowerCase()}. Check the website settings SQL/RLS setup.`)
    }
  }

  async function runPanelAction(key, action) {
    if (panelActionLoading) return
    setPanelActionLoading(key)
    try {
      await action()
    } finally {
      setPanelActionLoading('')
    }
  }

  async function saveLoginPageSettings() {
    const required = [
      ['loginWelcomeTitle', 'Welcome title'],
      ['loginWelcomeSubtitle', 'Subtitle/description'],
      ['loginFeatureOne', 'Feature point 1'],
      ['loginFeatureTwo', 'Feature point 2'],
      ['loginFeatureThree', 'Feature point 3'],
    ]
    const missing = required.filter(([key]) => !String(draft[key] || '').trim()).map(([, label]) => label)
    if (missing.length) {
      await showAppAlert(`Please complete these required login page settings: ${missing.join(', ')}`, { title: 'Required Settings', type: 'warning' })
      return
    }
    const titleSize = Number(draft.loginWelcomeTitleFontSize || defaultWebsiteSettings.loginWelcomeTitleFontSize)
    const descriptionSize = Number(draft.loginDescriptionFontSize || defaultWebsiteSettings.loginDescriptionFontSize)
    const featureSize = Number(draft.loginFeatureFontSize || defaultWebsiteSettings.loginFeatureFontSize)
    if (titleSize < 24 || titleSize > 120 || descriptionSize < 12 || descriptionSize > 60 || featureSize < 12 || featureSize > 60) {
      await showAppAlert('Please keep title size between 24–120 px, and description/feature text size between 12–60 px.', { title: 'Invalid Text Size', type: 'warning' })
      return
    }
    return updateSettings(draft)
  }

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
        <nav className="admin-side-nav">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} type="button" className={`admin-sidebar-link sidebar-nav-item ${adminPanelTab === item.id ? 'active' : ''}`} aria-current={adminPanelTab === item.id ? 'page' : undefined} onClick={() => changeAdminPanelTab(item.id)}>
                <span className="side-nav-icon sidebar-icon-container"><Icon size={17} /></span>
                <span className="sidebar-item-label">{item.label}</span>
              </button>
            )
          })}
        </nav>
        <button type="button" className="admin-logout sidebar-nav-item" onClick={onLogout}>
          <span className="side-nav-icon sidebar-icon-container"><LogOut size={16} /></span>
          <span className="sidebar-item-label">Logout</span>
        </button>
      </aside>

      <main className="admin-panel-main">
        <header className="admin-panel-topbar no-print">
          <div className="admin-topbar-actions">
            <a className="admin-preview-link admin-guidelines-link" href={RESEARCH_GUIDELINES_PDF_URL} download={RESEARCH_GUIDELINES_DOWNLOAD_NAME}><FileText size={16} /> Research Guidelines</a>
            <a className="admin-preview-link" href="/" target="_blank" rel="noreferrer">Open main website</a>
          </div>
        </header>

        {message && adminPanelTab !== 'overview' && <div className="message no-print">{message}</div>}
        {dataLoading && adminPanelTab !== 'overview' && <LoadingBlock text="Loading admin records..." />}

        {adminPanelTab === 'profile-settings' && <ProfileSettingsPage currentUser={currentUser} onBack={() => changeAdminPanelTab('overview')} updateOwnProfile={updateOwnProfile} uploadOwnProfilePhoto={uploadOwnProfilePhoto} updateOwnPassword={updateOwnPassword} />}
        {adminPanelTab === 'about-us' && <AboutUsCustomizationPanel page={aboutUsPage} updatePage={updateAboutUsPage} uploadImage={uploadAboutUsImage} currentUser={currentUser} />}

        {adminPanelTab === 'overview' && (
          <div className="empty-dashboard-page" aria-hidden="true" />
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
                <button className="primary min-button-width" disabled={Boolean(panelActionLoading)} onClick={() => runPanelAction('save-website', () => updateSettings(draft))}><ButtonContent loading={panelActionLoading === 'save-website'} loadingText="Saving..." icon={Save}>Save Website Settings</ButtonContent></button>
                <button className="secondary min-button-width" disabled={Boolean(panelActionLoading)} onClick={() => runPanelAction('reset-website', resetSettings)}><ButtonContent loading={panelActionLoading === 'reset-website'} loadingText="Resetting..." icon={RefreshCw}>Reset Defaults</ButtonContent></button>
              </div>
            </div>

            <div className="card">
              <SectionHeader icon={ImageIcon} title="Homepage Hero Image" subtitle="Upload a preview image or paste a hosted image URL" />
              <label className="field"><span>Homepage hero image URL</span><input value={draft.heroImage || ''} onChange={(e) => updateDraft('heroImage', e.target.value)} placeholder="/hero-page.png or image URL" /></label>
              <label className="field"><span>Upload homepage hero image</span><input type="file" accept="image/*" onChange={(e) => handleImageUpload('heroImage', e.target.files?.[0])} /></label>
              <div className="admin-image-preview" style={{ '--hero-bg-image': cssImageUrl(draft.heroImage, draft.assetUpdatedAt), backgroundImage: cssImageUrl(draft.heroImage, draft.assetUpdatedAt) }} />
              <div className="settings-actions compact-actions">
                <button className="secondary min-button-width" disabled={Boolean(panelActionLoading)} onClick={() => runPanelAction('save-hero-background', () => updateSettings(draft))}><ButtonContent loading={panelActionLoading === 'save-hero-background'} loadingText="Saving..." icon={Save}>Save Hero Background</ButtonContent></button>
                <button className="danger min-button-width" disabled={Boolean(panelActionLoading)} onClick={() => runPanelAction('remove-hero-background', () => removeWebsiteBackground('heroImage', 'Hero background'))}><ButtonContent loading={panelActionLoading === 'remove-hero-background'} loadingText="Removing..." icon={Trash2}>Remove Hero Background</ButtonContent></button>
              </div>

              <div className="soft-box settings-note">
                <b>Important</b>
                <p>For a permanent public change, use a hosted image URL or save settings to Supabase. Local uploaded images are useful for preview and testing.</p>
              </div>
            </div>

            <div className="card role-hero-editor-card">
              <SectionHeader icon={ImageIcon} title="Role Dashboard Pictures" subtitle="Customize large dashboard pictures and text using the existing website settings and app-assets storage" />
              {(() => {
                const roleHeroes = normalizeRoleHeroSettings(draft.roleHeroes, draft)
                const selectedHero = roleHeroes[normalizeRoleHeroRole(selectedRoleHero)] || roleHeroes.student
                return (
                  <>
                    <div className="role-hero-editor-top">
                      <label className="field"><span>Role / page</span><select value={selectedRoleHero} onChange={(e) => setSelectedRoleHero(e.target.value)}>{roleHeroOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                      <label className="settings-toggle role-hero-enable-toggle"><input type="checkbox" checked={selectedHero.enabled !== false} onChange={(e) => updateRoleHeroDraft(selectedRoleHero, { enabled: e.target.checked })} /><span><b>Show dashboard picture</b><small>Hide or show this large role dashboard picture section.</small></span></label>
                    </div>

                    <RoleHeroBanner role={selectedRoleHero} settings={{ ...draft, roleHeroes }} className="role-hero-admin-preview" onNavigate={() => {}} />

                    <div className="form-grid role-hero-settings-grid">
                      <label className="field wide-field"><span>Dashboard picture URL</span><input value={selectedHero.imageUrl || ''} onChange={(e) => updateRoleHeroDraft(selectedRoleHero, { imageUrl: e.target.value, imagePath: '' })} placeholder="Paste image URL or upload below" /><small>Images are automatically resized visually to fit inside the dashboard picture area without cropping or stretching.</small></label>
                      <label className="field wide-field"><span>Upload dashboard picture</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleRoleHeroImageUpload(selectedRoleHero, e.target.files?.[0])} /><small>Recommended: 1600px or wider. The page will auto-resize the picture so the full image remains visible on desktop and mobile.</small></label>
                      <label className="field wide-field"><span>Heading</span><input value={selectedHero.title || ''} onChange={(e) => updateRoleHeroDraft(selectedRoleHero, { title: e.target.value })} placeholder={ROLE_HERO_DEFAULTS[normalizeRoleHeroRole(selectedRoleHero)].title} /></label>
                      <label className="field wide-field"><span>Subtitle</span><textarea value={selectedHero.subtitle || ''} onChange={(e) => updateRoleHeroDraft(selectedRoleHero, { subtitle: e.target.value })} placeholder={ROLE_HERO_DEFAULTS[normalizeRoleHeroRole(selectedRoleHero)].subtitle} /></label>
                      <label className="field"><span>Text color</span><input type="color" value={selectedHero.textColor || '#ffffff'} onChange={(e) => updateRoleHeroDraft(selectedRoleHero, { textColor: e.target.value })} /></label>
                      <label className="field"><span>Text alignment</span><select value={selectedHero.alignment || 'left'} onChange={(e) => updateRoleHeroDraft(selectedRoleHero, { alignment: e.target.value })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                      <label className="field"><span>Optional button label</span><input value={selectedHero.buttonLabel || ''} onChange={(e) => updateRoleHeroDraft(selectedRoleHero, { buttonLabel: e.target.value })} placeholder="Example: View My Research" /></label>
                      <label className="field wide-field"><span>Optional button destination</span><input value={selectedHero.buttonRoute || ''} onChange={(e) => updateRoleHeroDraft(selectedRoleHero, { buttonRoute: e.target.value })} placeholder="Example: dashboard, reports, meetings, questions, /student/my-research" /></label>
                    </div>

                    <div className="settings-actions compact-actions">
                      <button className="primary min-button-width" disabled={Boolean(panelActionLoading)} onClick={() => runPanelAction('save-role-heroes', () => updateSettings({ ...draft, roleHeroes: normalizeRoleHeroSettings(draft.roleHeroes, draft) }))}><ButtonContent loading={panelActionLoading === 'save-role-heroes'} loadingText="Saving..." icon={Save}>Save Role Hero Settings</ButtonContent></button>
                      <button className="secondary min-button-width" disabled={Boolean(panelActionLoading)} onClick={() => runPanelAction(`remove-role-hero-${selectedRoleHero}`, () => removeRoleHeroImage(selectedRoleHero))}><ButtonContent loading={panelActionLoading === `remove-role-hero-${selectedRoleHero}`} loadingText="Removing..." icon={Trash2}>Remove Image</ButtonContent></button>
                      <button className="secondary min-button-width" disabled={Boolean(panelActionLoading)} onClick={() => resetRoleHeroDraft(selectedRoleHero)}><RefreshCw size={16} /> Reset Selected Role</button>
                    </div>

                    <div className="soft-box settings-note">
                      <b>Connected to existing customization</b>
                      <p>These role dashboard pictures are saved inside the existing website settings record and use the existing Supabase Storage bucket <code>app-assets</code>. The displayed image automatically fits the page using cover resizing, so uploaded pictures fill the dashboard without stretching. No duplicate settings page, upload table, or storage bucket is created.</p>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        )}


        {adminPanelTab === 'button-colors' && (
          <div className="complete-color-customization-stack">
            <ButtonColorCustomizationPanel
              colors={draft.button_colors || cloneDefaultButtonColors()}
              savedColors={normalizeButtonColors(settings.button_colors)}
              onChange={updateButtonColorDraft}
              onResetField={resetButtonColorField}
              onSave={() => runPanelAction('save-button-colors', saveButtonColors)}
              onResetPreview={resetButtonColorPreview}
              onRestoreDefaults={() => runPanelAction('restore-button-colors', restoreDefaultButtonColors)}
              loadingKey={panelActionLoading}
              status={buttonColorStatus}
              error={buttonColorError}
            />
            <InterfaceColorCustomizationPanel
              colors={draft.interface_colors || cloneDefaultInterfaceColors()}
              savedColors={normalizeInterfaceColors(settings.interface_colors)}
              onChange={updateInterfaceColorDraft}
              onResetField={resetInterfaceColorField}
              onSave={() => runPanelAction('save-interface-colors', saveInterfaceColors)}
              onResetPreview={resetInterfaceColorPreview}
              onRestoreDefaults={() => runPanelAction('restore-interface-colors', restoreDefaultInterfaceColors)}
              loadingKey={panelActionLoading}
              status={interfaceColorStatus}
              error={interfaceColorError}
            />
          </div>
        )}

        {adminPanelTab === 'login-settings' && (
          <div className="admin-split-layout login-settings-layout">
            <div className="card">
              <SectionHeader icon={Lock} title="Login Page Settings" subtitle="Customize only the login page images and text content" />
              <div className="form-grid">
                <label className="field wide-field"><span>Background photo/image URL</span><input value={draft.loginBackgroundImage || ''} onChange={(e) => updateDraft('loginBackgroundImage', e.target.value)} placeholder="/hero-page.png or hosted image URL" /></label>
                <label className="field wide-field"><span>Upload background photo/image</span><input type="file" accept="image/*" onChange={(e) => handleImageUpload('loginBackgroundImage', e.target.files?.[0])} /></label>
                <div className="settings-actions compact-actions wide-field">
                  <button className="secondary min-button-width" disabled={Boolean(panelActionLoading)} onClick={() => runPanelAction('save-login-background', () => updateSettings(draft))}><ButtonContent loading={panelActionLoading === 'save-login-background'} loadingText="Saving..." icon={Save}>Save Login Background</ButtonContent></button>
                  <button className="danger min-button-width" disabled={Boolean(panelActionLoading)} onClick={() => runPanelAction('remove-login-background', () => removeWebsiteBackground('loginBackgroundImage', 'Login background'))}><ButtonContent loading={panelActionLoading === 'remove-login-background'} loadingText="Removing..." icon={Trash2}>Remove Login Background</ButtonContent></button>
                </div>
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
                <button className="primary min-button-width" disabled={Boolean(panelActionLoading)} onClick={() => runPanelAction('save-login', saveLoginPageSettings)}><ButtonContent loading={panelActionLoading === 'save-login'} loadingText="Saving..." icon={Save}>Save Login Page Settings</ButtonContent></button>
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
                '--auth-bg-image': cssImageUrl(draft.loginBackgroundImage || draft.loginHeroImage || draft.heroImage, draft.assetUpdatedAt),
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
        {adminPanelTab === 'users' && <AdminDashboard data={data} projects={projects} currentUser={currentUser} loadError={loadError} updateProject={updateProject} updateUserRole={updateUserRole} updateUserStatus={updateUserStatus} exportCsv={exportCsv} deleteWeeklyReport={deleteWeeklyReport} deleteUploadedFile={deleteUploadedFile} deleteUserAccount={deleteUserAccount} deleteResearchGroup={deleteResearchGroup} deleteResearchProject={deleteResearchProject} />}
        {adminPanelTab === 'supervisors' && <SupervisorManagementTab data={data} projects={projects} currentUser={currentUser} loadError={loadError} dataLoading={dataLoading} updateProject={updateProject} assignStudentToSupervisor={assignStudentToSupervisor} assignProjectLeader={assignProjectLeader} exportCsv={exportCsv} />}
        {adminPanelTab === 'dual-roles' && <DualRoleManagementTab data={data} currentUser={currentUser} loadError={loadError} dataLoading={dataLoading} updateCommitteeSupervisorAccess={updateCommitteeSupervisorAccess} />}
        {adminPanelTab === 'deadlines' && <DeadlineManager deadlines={data.deadlines} createDeadline={createDeadline} removeDeadline={removeDeadline} students={data.profiles.filter((profile) => profile.role === 'student').map((student) => ({ key: makeStudentOptionKey(student), id: student.id, name: student.full_name, email: student.email, group: student.department || student.area || 'Student' }))} currentUser={currentUser} />}
        {adminPanelTab === 'notifications' && <NotificationsTab data={data} role="admin" currentUser={currentUser} createNotification={createNotification} markNotificationRead={markNotificationRead} removeNotification={removeNotification} />}
        {adminPanelTab === 'reports' && <ReportsTab data={data} projects={projects} currentUser={currentUser} role="admin" printPdfReport={printPdfReport} exportCsv={exportCsv} pdfReportSettings={getPdfReportSettingsForRole('admin', pdfReportSettingsByRole, globalPdfReportSettings)} dataLoading={dataLoading} />}
        {adminPanelTab === 'group-requests' && <AdminGroupJoinRequestsTab data={data} currentUser={currentUser} dataLoading={dataLoading} decideGroupJoinRequest={decideGroupJoinRequest} directAddStudentsToGroup={directAddStudentsToGroup} />}
        {adminPanelTab === 'pdf-report' && <PdfReportCustomizationPanel settingsByRole={pdfReportSettingsByRole} globalSettings={globalPdfReportSettings} updateSettings={updatePdfReportSettings} uploadLogo={uploadPdfReportLogo} removeLogo={removePdfReportLogo} resetSettings={resetPdfReportSettings} data={data} projects={projects} currentUser={currentUser} printPdfReport={printPdfReport} />}
        {adminPanelTab === 'database' && <DatabaseTab databaseMode={databaseMode} />}
        {adminPanelTab === 'audit' && <AuditTab logs={auditLogs} dataLoading={dataLoading} />}
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
  const [invitationActionLoading, setInvitationActionLoading] = useState('')

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

  async function runInvitationAction(key, action) {
    if (invitationActionLoading) return
    setInvitationActionLoading(key)
    try {
      await action()
    } finally {
      setInvitationActionLoading('')
    }
  }

  async function handleSendInvitation() {
    await runInvitationAction('send-invitation', async () => {
      const created = await createInvitation(form, { openEmail: !isSupabaseConfigured })
      if (created) resetForm()
    })
  }

  async function handleResendInvitation(invitationId) {
    await runInvitationAction(`resend-${invitationId}`, () => resendInvitation(invitationId))
  }

  async function handleCancelInvitation(invitationId) {
    if (!(await showAppConfirm('Are you sure you want to cancel this invitation?', { title: 'Cancel Invitation', type: 'danger', confirmLabel: 'Cancel Invitation' }))) return
    await runInvitationAction(`cancel-${invitationId}`, () => cancelInvitation(invitationId))
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
            <button className="primary min-button-width" type="button" disabled={Boolean(invitationActionLoading)} onClick={handleSendInvitation}><ButtonContent loading={invitationActionLoading === 'send-invitation'} loadingText="Sending..." icon={Send}>Send Invitation</ButtonContent></button>
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
                        <button className="secondary compact-button min-button-width" disabled={Boolean(invitationActionLoading)} onClick={() => handleResendInvitation(item.id)}><ButtonContent loading={invitationActionLoading === `resend-${item.id}`} loadingText="Sending..." icon={RefreshCw} iconSize={14}>Resend</ButtonContent></button>
                        {status === 'Pending' && <button className="danger compact-button min-button-width" disabled={Boolean(invitationActionLoading)} onClick={() => handleCancelInvitation(item.id)}><ButtonContent loading={invitationActionLoading === `cancel-${item.id}`} loadingText="Cancelling..." icon={XCircle} iconSize={14}>Cancel</ButtonContent></button>}
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
      <SectionHeader icon={Filter} title="Search and Filter" subtitle="Find projects by title, group, department, supervisor, approval, or status" />
      <div className="filter-grid">
        <label className="field">
          <span>Search</span>
          <div className="input-icon"><Search size={16} /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search projects..." /></div>
        </label>
        <label className="field">
          <span>Department</span>
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

function MeetingRequestsPage({ data = emptyData, role, currentUser, dataLoading = false, createMeetingRequest, respondMeetingRequest }) {
  const [form, setForm] = useState({
    title: '',
    purpose: '',
    requested_date: '',
    requested_start_time: '',
    duration_minutes: 30,
    meeting_type: 'In Person',
    location: '',
    meeting_link: '',
    notes: '',
    student_id: '',
    student_email: '',
    student_key: '',
    student_name: '',
  })
  const [responseDrafts, setResponseDrafts] = useState({})
  const [busyKey, setBusyKey] = useState('')

  const profile = findProfileForUser(data, currentUser) || currentUser
  const meetings = getMeetingsForUser(data, profile)
  const assignedSupervisor = role === 'student' ? getAssignedMeetingSupervisorForStudent(data, profile) : null
  const supervisorStudents = role === 'supervisor' ? getMeetingStudentsForSupervisor(data, profile) : []
  const incoming = meetings.filter((meeting) => {
    const status = normalizeMeetingStatus(meeting.status)
    const isRecipientPending = status === 'pending' && meetingParticipantMatches(meeting, profile, ['recipient'])
    const isRequesterReschedule = status === 'reschedule_proposed' && meetingParticipantMatches(meeting, profile, ['requester'])
    return isRecipientPending || isRequesterReschedule
  })
  const sent = meetings.filter((meeting) => {
    const status = normalizeMeetingStatus(meeting.status)
    return ['pending', 'reschedule_proposed'].includes(status) && meetingParticipantMatches(meeting, profile, ['requester'])
  })
  const upcoming = meetings.filter((meeting) => normalizeMeetingStatus(meeting.status) === 'accepted')
  const closed = meetings.filter((meeting) => ['rejected', 'cancelled', 'completed'].includes(normalizeMeetingStatus(meeting.status)))

  useEffect(() => {
    if (role !== 'supervisor') return
    if (form.student_id || form.student_email || form.student_key || !supervisorStudents.length) return
    const first = supervisorStudents[0]
    setForm((current) => ({ ...current, student_id: first.id || '', student_email: first.email || '', student_key: first.key || '', student_name: first.name || '' }))
  }, [role, supervisorStudents, form.student_id, form.student_email])

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateResponse(meetingId, key, value) {
    setResponseDrafts((current) => ({
      ...current,
      [meetingId]: { ...(current[meetingId] || {}), [key]: value },
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!createMeetingRequest || busyKey) return
    setBusyKey('send')
    try {
      const result = await createMeetingRequest({ ...form, requester_role: role })
      if (result?.ok) {
        setForm({
          title: '',
          purpose: '',
          requested_date: '',
          requested_start_time: '',
          duration_minutes: 30,
          meeting_type: 'In Person',
          location: '',
          meeting_link: '',
          notes: '',
          student_id: role === 'supervisor' ? (supervisorStudents[0]?.id || '') : '',
          student_email: role === 'supervisor' ? (supervisorStudents[0]?.email || '') : '',
          student_key: role === 'supervisor' ? (supervisorStudents[0]?.key || '') : '',
          student_name: role === 'supervisor' ? (supervisorStudents[0]?.name || '') : '',
        })
      }
    } finally {
      setBusyKey('')
    }
  }

  async function handleAction(meeting, action) {
    if (!respondMeetingRequest || busyKey) return
    const draft = responseDrafts[meeting.id] || {}
    setBusyKey(`${action}-${meeting.id}`)
    try {
      await respondMeetingRequest(meeting.id, action, draft)
    } finally {
      setBusyKey('')
    }
  }

  const cannotRequest = role === 'student' ? !assignedSupervisor : !supervisorStudents.length

  return (
    <div className="meeting-requests-page dashboard-grid">
      <section className="card meeting-request-form-card">
        <SectionHeader icon={CalendarDays} title="Request a Meeting" subtitle="Send a meeting request only to users assigned to you." />
        {dataLoading ? <LoadingBlock text="Loading meeting permissions..." /> : cannotRequest ? (
          <div className="meeting-info-box">
            {role === 'student'
              ? 'You must have an assigned supervisor before requesting a meeting.'
              : 'You currently have no assigned students available for meeting requests.'}
          </div>
        ) : (
          <form className="meeting-request-form" onSubmit={handleSubmit}>
            {role === 'student' ? (
              <div className="meeting-assigned-card">
                <div className="meeting-assigned-avatar">{String(assignedSupervisor?.full_name || assignedSupervisor?.email || 'S').charAt(0).toUpperCase()}</div>
                <div>
                  <b>{assignedSupervisor?.full_name || assignedSupervisor?.email || 'Assigned Supervisor'}</b>
                  <small>{assignedSupervisor?.department || assignedSupervisor?.program || assignedSupervisor?.email || 'Assigned supervisor'}</small>
                </div>
              </div>
            ) : (
              <label className="field wide-field">
                <span>Student</span>
                <select value={form.student_id || form.student_email || form.student_key || form.student_name} onChange={(event) => {
                  const selected = supervisorStudents.find((student) =>
                    String(student.id || student.email || student.key || student.name) === String(event.target.value)
                  )
                  updateForm('student_id', selected?.id || '')
                  updateForm('student_email', selected?.email || '')
                  updateForm('student_key', selected?.key || '')
                  updateForm('student_name', selected?.name || '')
                }}>
                  {supervisorStudents.map((student) => (
                    <option key={student.id || student.email || student.key || student.name} value={student.id || student.email || student.key || student.name}>{student.name || student.email} {student.email ? `— ${student.email}` : ''}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="form-grid two-cols">
              <label className="field"><span>Meeting title</span><input value={form.title} onChange={(e) => updateForm('title', e.target.value)} placeholder="Example: Weekly progress discussion" /></label>
              <label className="field"><span>Meeting type</span><select value={form.meeting_type} onChange={(e) => updateForm('meeting_type', e.target.value)}><option>In Person</option><option>Online</option></select></label>
              <label className="field"><span>Requested date</span><input type="date" value={form.requested_date} onChange={(e) => updateForm('requested_date', e.target.value)} /></label>
              <label className="field"><span>Start time</span><input type="time" value={form.requested_start_time} onChange={(e) => updateForm('requested_start_time', e.target.value)} /></label>
              <label className="field"><span>Duration</span><select value={form.duration_minutes} onChange={(e) => updateForm('duration_minutes', e.target.value)}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
              <label className="field"><span>{form.meeting_type === 'Online' ? 'Online meeting link' : 'Location'}</span><input value={form.meeting_type === 'Online' ? form.meeting_link : form.location} onChange={(e) => updateForm(form.meeting_type === 'Online' ? 'meeting_link' : 'location', e.target.value)} placeholder={form.meeting_type === 'Online' ? 'Paste link if available' : 'Office, department, or room'} /></label>
            </div>
            <label className="field wide-field"><span>Purpose / reason</span><textarea value={form.purpose} onChange={(e) => updateForm('purpose', e.target.value)} placeholder="Explain why you want to meet." /></label>
            <label className="field wide-field"><span>Notes optional</span><textarea value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} placeholder="Any extra details." /></label>
            <div className="action-row">
              <button type="submit" className="primary meeting-primary-btn" disabled={busyKey === 'send'}>
                <ButtonContent loading={busyKey === 'send'} loadingText="Sending..." icon={Send}>Send Meeting Request</ButtonContent>
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="card meeting-section-card meeting-incoming-card">
        <SectionHeader icon={Inbox} title="Incoming Requests" subtitle="Accept, reject, or suggest a different time." />
        <MeetingRequestList meetings={incoming} currentUser={profile} data={data} emptyText="No incoming meeting requests." responseDrafts={responseDrafts} updateResponse={updateResponse} onAction={handleAction} busyKey={busyKey} mode="incoming" />
      </section>

      <section className="card meeting-section-card">
        <SectionHeader icon={Send} title="Sent Requests" subtitle="Requests you sent that are waiting for a decision." />
        <MeetingRequestList meetings={sent} currentUser={profile} data={data} emptyText="No sent meeting requests." responseDrafts={responseDrafts} updateResponse={updateResponse} onAction={handleAction} busyKey={busyKey} mode="sent" />
      </section>

      <section className="card meeting-section-card">
        <SectionHeader icon={CheckCircle2} title="Upcoming Meetings" subtitle="Accepted meetings with confirmed details." />
        <MeetingRequestList meetings={upcoming} currentUser={profile} data={data} emptyText="No upcoming meetings." responseDrafts={responseDrafts} updateResponse={updateResponse} onAction={handleAction} busyKey={busyKey} mode="upcoming" />
      </section>

      <section className="card meeting-section-card">
        <SectionHeader icon={Clock} title="Previous / Closed Requests" subtitle="Rejected, cancelled, or completed requests remain here for history." />
        <MeetingRequestList meetings={closed} currentUser={profile} data={data} emptyText="No previous meeting requests." responseDrafts={responseDrafts} updateResponse={updateResponse} onAction={handleAction} busyKey={busyKey} mode="closed" />
      </section>
    </div>
  )
}

function MeetingRequestList({ meetings = [], currentUser, data = emptyData, emptyText = 'No meeting requests.', responseDrafts = {}, updateResponse, onAction, busyKey = '', mode = '' }) {
  if (!meetings.length) return <EmptyState title={emptyText} text="Meeting records will appear here." icon={CalendarDays} />
  return (
    <div className="meeting-request-list">
      {meetings.map((meeting) => (
        <MeetingRequestCard key={meeting.id} meeting={meeting} currentUser={currentUser} data={data} draft={responseDrafts[meeting.id] || {}} updateResponse={updateResponse} onAction={onAction} busyKey={busyKey} mode={mode} />
      ))}
    </div>
  )
}

function MeetingRequestCard({ meeting, currentUser, data, draft = {}, updateResponse, onAction, busyKey = '', mode = '' }) {
  const status = normalizeMeetingStatus(meeting.status)
  const other = getMeetingOtherParticipant(meeting, currentUser, data)
  const isRequester = meetingParticipantMatches(meeting, currentUser, ['requester'])
  const isRecipient = meetingParticipantMatches(meeting, currentUser, ['recipient'])
  const canRecipientDecide = status === 'pending' && isRecipient
  const canRequesterDecideProposal = status === 'reschedule_proposed' && isRequester
  const canCancel = ['pending', 'accepted', 'reschedule_proposed'].includes(status) && (isRequester || isRecipient)
  const busy = (action) => busyKey === `${action}-${meeting.id}`
  return (
    <article className={`meeting-request-card meeting-status-${status}`}>
      <div className="meeting-card-head">
        <div>
          <h4>{meeting.title || 'Meeting request'}</h4>
          <p className="muted small">With {other.full_name || other.email || 'Participant'} • {other.role ? getRoleLabel(other.role) : 'Participant'}</p>
        </div>
        <span className="meeting-status-badge">{getMeetingStatusLabel(status)}</span>
      </div>
      <div className="meeting-card-body">
        <p><b>Purpose:</b> {meeting.purpose || 'No purpose provided.'}</p>
        <p><b>Requested:</b> {formatMeetingDateTime(meeting.requested_date, meeting.requested_start_time)} {meeting.duration_minutes ? `• ${meeting.duration_minutes} min` : ''}</p>
        {status === 'reschedule_proposed' && (meeting.proposed_date || meeting.proposed_start_time) && <p><b>Proposed time:</b> {formatMeetingDateTime(meeting.proposed_date, meeting.proposed_start_time)}</p>}
        <p><b>Type:</b> {meeting.meeting_type || 'In Person'}{meeting.location ? ` • ${meeting.location}` : ''}{meeting.meeting_link ? ` • ${meeting.meeting_link}` : ''}</p>
        {meeting.notes && <p><b>Notes:</b> {meeting.notes}</p>}
        {meeting.response_note && <p><b>Response note:</b> {meeting.response_note}</p>}
        <p className="muted small">Created: {String(meeting.created_at || '').slice(0, 16).replace('T', ' ') || 'Date unavailable'}</p>
      </div>
      {(canRecipientDecide || canRequesterDecideProposal || canCancel) && mode !== 'closed' && (
        <div className="meeting-card-actions">
          {(canRecipientDecide || canRequesterDecideProposal) && (
            <>
              <button type="button" className="meeting-accept-btn" onClick={() => onAction?.(meeting, 'accept')} disabled={busy('accept')}>
                <ButtonContent loading={busy('accept')} loadingText="Accepting..." icon={CheckCircle2}>Accept</ButtonContent>
              </button>
              <button type="button" className="meeting-reject-btn" onClick={() => onAction?.(meeting, 'reject')} disabled={busy('reject')}>
                <ButtonContent loading={busy('reject')} loadingText="Rejecting..." icon={XCircle}>Reject</ButtonContent>
              </button>
            </>
          )}
          {canRecipientDecide && (
            <div className="meeting-reschedule-box">
              <div className="form-grid two-cols compact">
                <label className="field"><span>Different date</span><input type="date" value={draft.proposed_date || ''} onChange={(e) => updateResponse?.(meeting.id, 'proposed_date', e.target.value)} /></label>
                <label className="field"><span>Different time</span><input type="time" value={draft.proposed_start_time || ''} onChange={(e) => updateResponse?.(meeting.id, 'proposed_start_time', e.target.value)} /></label>
              </div>
              <label className="field wide-field"><span>Response note optional</span><input value={draft.response_note || ''} onChange={(e) => updateResponse?.(meeting.id, 'response_note', e.target.value)} placeholder="Add a reason or note." /></label>
              <button type="button" className="meeting-secondary-btn" onClick={() => onAction?.(meeting, 'reschedule')} disabled={busy('reschedule')}>
                <ButtonContent loading={busy('reschedule')} loadingText="Sending..." icon={Clock}>Request a Different Time</ButtonContent>
              </button>
            </div>
          )}
          {canCancel && <button type="button" className="meeting-cancel-btn" onClick={() => onAction?.(meeting, 'cancel')} disabled={busy('cancel')}><ButtonContent loading={busy('cancel')} loadingText="Cancelling..." icon={XCircle}>Cancel</ButtonContent></button>}
        </div>
      )}
    </article>
  )
}


function getRoleWorkspaceCopy(role = 'student') {
  const map = {
    student: {
      title: 'Student Dashboard',
      subtitle: 'A clean overview of your research activity. Open the workspace for forms, submissions, feedback, and active project tools.',
      workspaceTitle: 'Research Workspace',
      workspaceSubtitle: 'Manage your project progress, reports, feedback, deadlines, and research activities in one place.',
      button: 'Open Research Workspace',
    },
    supervisor: {
      title: 'Supervisor Dashboard',
      subtitle: 'Review your supervised research activity at a glance. Open the workspace for project, report, deadline, and student tools.',
      workspaceTitle: 'Research Workspace',
      workspaceSubtitle: 'Manage supervised projects, weekly reports, student progress, deadlines, and feedback in one place.',
      button: 'Open Research Workspace',
    },
    committee: {
      title: 'Research Committee Dashboard',
      subtitle: 'Monitor review activity and approved research at a glance. Open the workspace for committee decisions and project monitoring.',
      workspaceTitle: 'Research Workspace',
      workspaceSubtitle: 'Review research submissions, monitor projects, and manage committee actions in one place.',
      button: 'Open Research Workspace',
    },
    admin: {
      title: 'Admin Dashboard',
      subtitle: 'A compact platform overview. Open the workspace for active management tools and operational workflows.',
      workspaceTitle: 'Research Workspace',
      workspaceSubtitle: 'Access the platform’s active management tools and operational workflows in one place.',
      button: 'Open Research Workspace',
    },
  }
  return map[role] || map.student
}

function getRoleDashboardHighlights(role, data = emptyData, projects = [], currentUser) {
  const projectList = Array.isArray(projects) ? projects : []
  const firstProject = projectList.find(isApprovedResearchProject) || projectList[0]
  const visibleNotifications = (data.notifications || []).filter((item) => notificationForUser(item, currentUser, role)).slice(0, 4)
  const deadlinePreview = (data.deadlines || []).slice(0, 4)
  return { firstProject, visibleNotifications, deadlinePreview }
}

function DashboardOverviewCard({ icon: Icon, title, children, action }) {
  return (
    <section className="card dashboard-overview-card-clean">
      <SectionHeader icon={Icon} title={title} subtitle="" />
      <div className="dashboard-overview-card-body">{children}</div>
      {action && <div className="inline-actions dashboard-overview-card-actions">{action}</div>}
    </section>
  )
}

function RoleDashboardOverview({ role = 'student', onNavigate }) {
  if (role === 'admin') return null

  const cardsByRole = {
    student: [
      {
        icon: BookOpen,
        title: 'Your Research Workspace',
        description: 'Keep weekly reports, project progress, deadlines, and supervisor feedback together in one focused workspace.',
        buttonLabel: 'Open workspace',
        tab: 'research-workspace',
      },
      {
        icon: MessageSquareText,
        title: 'Questions and Guidance',
        description: 'Ask research questions, review replies, and keep important guidance from your supervisor easy to find.',
        buttonLabel: 'Open questions',
        tab: 'questions',
      },
      {
        icon: CalendarDays,
        title: 'Plan a Supervisor Meeting',
        description: 'Send a meeting request, follow its status, and keep upcoming research discussions organized.',
        buttonLabel: 'View meeting requests',
        tab: 'meetings',
      },
    ],
    supervisor: [
      {
        icon: BookOpen,
        title: 'Supervision Workspace',
        description: 'Review weekly progress, provide feedback, manage deadlines, and follow each supervised project in one place.',
        buttonLabel: 'Open workspace',
        tab: 'research-workspace',
      },
      {
        icon: ClipboardCheck,
        title: 'Manage Research Projects',
        description: 'Create, update, and organize supervised research projects while keeping every project record accessible.',
        buttonLabel: 'Manage projects',
        tab: 'project-management',
      },
      {
        icon: MessageSquareText,
        title: 'Support Your Students',
        description: 'Review student questions and provide clear research guidance without losing the discussion history.',
        buttonLabel: 'Open student questions',
        tab: 'questions',
      },
    ],
    committee: [
      {
        icon: ClipboardCheck,
        title: 'Review Research Submissions',
        description: 'Open submitted projects, examine their information, and complete committee review decisions.',
        buttonLabel: 'Start reviewing',
        tab: 'research-workspace',
        sectionId: 'review-project-submissions',
      },
      {
        icon: Users,
        title: 'Research Group Requests',
        description: 'Review group membership requests and help place eligible students into the correct research groups.',
        buttonLabel: 'View group requests',
        tab: 'group-requests',
      },
      {
        icon: Printer,
        title: 'Committee Reports',
        description: 'Open the reporting area to review, prepare, and print role-appropriate research information.',
        buttonLabel: 'Open reports',
        tab: 'reports',
      },
    ],
  }

  const cards = cardsByRole[role] || cardsByRole.student

  return (
    <section className="role-dashboard-feature-section" aria-label={`${getRoleLabel(role)} dashboard shortcuts`}>
      <div className="role-dashboard-feature-grid">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <article className="role-dashboard-feature-card" key={`${role}-${card.title}`}>
              <div className="role-dashboard-feature-icon" aria-hidden="true">
                <Icon />
              </div>
              <h2>{card.title}</h2>
              <p>{card.description}</p>
              <button
                type="button"
                className="role-dashboard-feature-button"
                onClick={() => onNavigate?.(card.tab, card.sectionId || '')}
              >
                {card.buttonLabel}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function ResearchWorkspaceShell({ role = 'student', children }) {
  const copy = getRoleWorkspaceCopy(role)
  return (
    <div className="stack research-workspace-page">
      <section className="card research-workspace-header-card">
        <p className="eyebrow">Workspace</p>
        <h2>{copy.workspaceTitle}</h2>
        <p className="muted">{copy.workspaceSubtitle}</p>
      </section>
      {children}
    </div>
  )
}

function AdminDashboard() {
  return null
}

function StudentResearchWorkspace({ data, projects, currentUser, createWeeklyReport, dataLoading = false, sendWeeklyReportToMyEmail, emailSendingReports = {}, heroSettings = defaultWebsiteSettings, onNavigate }) {
  const studentProfile = findProfileForUser(data, currentUser) || currentUser
  const studentProjectContext = getStudentProjectContext(data, studentProfile)
  const joinedProject = studentProjectContext.project
  const visibleMemberProjects = getStudentVisibleProjects(data, studentProfile)
  const ownProjects = projects.filter((p) => isOwnStudentProject(p, studentProfile) && isApprovedResearchProject(p))
  const selectedProject = joinedProject || visibleMemberProjects[0] || ownProjects[0] || data.projects.find((p) => studentCanViewProject(data, p, studentProfile) && isApprovedResearchProject(p))
  const selectedProjectContext = selectedProject ? getProjectContext(data, selectedProject) : studentProjectContext
  const reports = selectedProject ? getReportsForProject(data, selectedProject) : []
  const groupMemberProfiles = selectedProject ? getProjectMembersWithoutSupervisor(data, selectedProject, data.reports) : []
  const projectLeader = selectedProject ? getProjectLeaderProfile(data, selectedProject) : null
  const isProjectLeader = selectedProject ? isStudentProjectLeader(data, selectedProject, currentUser) : false
  const weeklyReportPermission = selectedProject ? getWeeklyReportSubmissionPermission(data, selectedProject, currentUser) : { canSubmit: false, reason: 'You must join or be assigned to a research project before submitting weekly reports.' }
  const canSubmitWeeklyReport = Boolean(weeklyReportPermission.canSubmit)
  const projectProgress = selectedProject ? getProjectProgress(selectedProject, data.reports || []) : (selectedProjectContext.progress || 0)
  const projectDeadlines = selectedProject ? getDeadlinesForProject(data.deadlines || [], selectedProject, groupMemberProfiles) : []
  const [reportForm, setReportForm] = useState({ completed_work: '', challenges: '', next_week_plan: '', attendance: 'Attended' })
  const [file, setFile] = useState(null)
  const [submittingReport, setSubmittingReport] = useState(false)

  async function handleSubmitWeeklyReport() {
    if (submittingReport) return
    if (!selectedProject) return
    if (!canSubmitWeeklyReport) {
      await showAppAlert(weeklyReportPermission.reason || 'Only the project leader can submit weekly reports for this project.', { title: 'Weekly Report Locked', type: 'warning' })
      return
    }
    setSubmittingReport(true)
    try {
      const result = await createWeeklyReport({ ...reportForm, project_id: selectedProject.id, submitted_by: currentUser.full_name }, file)
      if (result?.ok) {
        setReportForm({ completed_work: '', challenges: '', next_week_plan: '', attendance: 'Attended' })
        setFile(null)
      }
    } finally {
      setSubmittingReport(false)
    }
  }


  if (dataLoading) return <LoadingBlock text="Loading student dashboard..." />

  const currentStudentIsProjectMember = Boolean(selectedProject) && (
    groupMemberProfiles.some((member) => projectMemberMatchesUser(member, studentProfile)) ||
    isOwnStudentProject(selectedProject, studentProfile)
  )
  const shouldPrioritizeFeedbackForMember = Boolean(
    selectedProject &&
    currentStudentIsProjectMember &&
    projectLeader &&
    !isProjectLeader
  )

  const weeklyReportCard = (
    <div id="submit-weekly-report" data-search-section="submit-weekly-report" className={`card student-weekly-report-card ${shouldPrioritizeFeedbackForMember ? 'student-weekly-report-card-compact locked-weekly-report-secondary' : ''}`}>
      <span id="weekly-report-history" className="section-scroll-anchor" aria-hidden="true"></span><SectionHeader icon={MessageSquareText} title="Submit Weekly Report" subtitle={shouldPrioritizeFeedbackForMember ? 'Submission locked for project members' : 'Submit progress and upload evidence file'} />
      {selectedProject && canSubmitWeeklyReport ? (
        <>
          <div className="form-grid weekly-report-form-grid">
            <TextArea label="Work completed this week" value={reportForm.completed_work} onChange={(v) => setReportForm({ ...reportForm, completed_work: v })} />
            <TextArea label="Problems or challenges" value={reportForm.challenges} onChange={(v) => setReportForm({ ...reportForm, challenges: v })} />
            <TextArea label="Next week plan" value={reportForm.next_week_plan} onChange={(v) => setReportForm({ ...reportForm, next_week_plan: v })} />
            <label className="field weekly-upload-field">
              <span>Upload file</span>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <label className="field weekly-attendance-field">
              <span>Attendance</span>
              <select value={reportForm.attendance} onChange={(e) => setReportForm({ ...reportForm, attendance: e.target.value })}>
                <option>Attended</option><option>Online</option><option>Absent</option><option>Not scheduled</option>
              </select>
            </label>
          </div>
          <div className="weekly-report-actions">
            <button className="primary min-button-width weekly-submit-button" type="button" disabled={submittingReport} onClick={handleSubmitWeeklyReport}><ButtonContent loading={submittingReport} loadingText="Submitting..." icon={Upload}>Submit Weekly Report</ButtonContent></button>
          </div>
        </>
      ) : selectedProject ? (
        <EmptyState title="Weekly reports locked" text={weeklyReportPermission.reason || 'Only the project leader can submit weekly reports for this project.'} icon={Lock} />
      ) : <EmptyState title="Weekly reports locked" text="You must join or be assigned to a research project before submitting weekly reports." icon={Lock} />}
    </div>
  )

  const feedbackCard = (
    <div id="supervisor-feedback" data-search-section="supervisor-feedback" className={`card supervisor-feedback-card-fixed student-feedback-aligned-card ${shouldPrioritizeFeedbackForMember ? 'student-feedback-priority-card member-feedback-primary-card' : ''}`}>
      <SectionHeader icon={MessageSquareText} title="Supervisor Feedback" subtitle={shouldPrioritizeFeedbackForMember ? 'Project weekly reports and supervisor review' : 'Latest comments'} />
      {reports.length ? (
        <div className="feedback-form-scroll-container student-supervisor-feedback-container">
          {reports.map((r) => {
            const attachment = getReportAttachment(r, data.uploadedFiles)
            return (
              <div className="mini-card project-member-report-feedback-card" key={r.id}>
                <div className="split">
                  <b>Week {r.week_number}</b>
                  <div className="inline-actions">
                    <Pill tone={r.status === 'Accepted' ? 'green' : r.status === 'Revision Required' ? 'red' : 'amber'}>{r.status}</Pill>
                    <EmailReportButton loading={Boolean(emailSendingReports[r.id])} onSend={() => sendWeeklyReportToMyEmail(r.id)} />
                  </div>
                </div>
                <div className="report-member-summary">
                  <p><b>Submitted by:</b> {getReportStudentLabel(r, data)}</p>
                  {r.submitted_at && <p><b>Submitted:</b> {new Date(r.submitted_at).toLocaleString()}</p>}
                </div>
                <div className="supervisor-feedback-scroll-box student-feedback-box"><p>{r.supervisor_feedback || 'Waiting for supervisor review.'}</p></div>
                <ReportAttachmentBox attachment={attachment} />
              </div>
            )
          })}
        </div>
      ) : <EmptyState title="No feedback yet" text="Feedback will appear after your supervisor reviews a weekly report." icon={MessageSquareText} />}
    </div>
  )

  return (
    <div className="stack student-dashboard-layout">
      <div className="grid two-one student-dashboard-row student-dashboard-top-row">
        <div id="my-research" data-search-section="my-research" className="card student-project-card">
          <SectionHeader icon={BookOpen} title="My Research Project" subtitle="Your joined or assigned project and progress" />
          {selectedProject ? (
            <div className="soft-box project-progress-card-surface">
              <div className="split project-progress-header">
                <div>
                  <p className="muted small bold">{selectedProject.group_name}</p>
                  <h3>{selectedProject.area}</h3>
                  <p className="muted">{selectedProject.title}</p>
                  <p className="muted small">Supervisor: {selectedProject.supervisor_name || 'Pending Assignment'}</p>
                  <p className="muted small">Project Leader: {projectLeader?.full_name || projectLeader?.email || 'Not assigned yet'}</p>
                  {isProjectLeader && <Pill tone="blue">You are the project leader for this project.</Pill>}
                </div>
                <Pill tone={getProjectDecisionTone(selectedProject)}>{getProjectDecisionLabel(selectedProject)}</Pill>
              </div>
              <span id="project-progress" className="section-scroll-anchor" aria-hidden="true"></span><div className="progress-row"><span>Progress</span><span>{formatProgress(projectProgress)}%</span></div>
              <ProgressBar value={projectProgress} />
              <span id="project-members" className="section-scroll-anchor" aria-hidden="true"></span><span id="project-leader" className="section-scroll-anchor" aria-hidden="true"></span><ProjectMembersCompact members={groupMemberProfiles} />
            </div>
          ) : <EmptyState title="No research project assigned yet." text="Request to join an approved supervisor project to see progress and weekly report access." />}
        </div>

        <div id="deadlines" data-search-section="deadlines" className="student-dashboard-side-top">
          <DeadlinesCard deadlines={projectDeadlines.length || selectedProject ? projectDeadlines : data.deadlines} />
        </div>
      </div>

      <div className={`grid two-one student-dashboard-row student-report-feedback-row ${shouldPrioritizeFeedbackForMember ? 'student-report-feedback-row-swapped member-feedback-layout' : ''}`}>
        {shouldPrioritizeFeedbackForMember ? (
          <>
            {feedbackCard}
            {weeklyReportCard}
          </>
        ) : (
          <>
            {weeklyReportCard}
            {feedbackCard}
          </>
        )}
      </div>

    </div>
  )
}


function SupervisorWeeklyReportReviewCard({ data, projects, currentUser, reviewReport, sendWeeklyReportToMyEmail, emailSendingReports = {} }) {
  const [feedback, setFeedback] = useState({})
  const [selectedStudent, setSelectedStudent] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedGroup, setSelectedGroup] = useState('all')
  const [reviewLoadingKey, setReviewLoadingKey] = useState('')
  const assignedProjects = useMemo(() => projects.filter((p) => isAssignedSupervisorProject(p, currentUser)), [projects, currentUser])
  const approvedAssignedProjects = useMemo(() => assignedProjects.filter(isApprovedResearchProject), [assignedProjects])
  const studentOptions = useMemo(() => mergeStudentOptions(getAssignedSupervisorStudents(data, approvedAssignedProjects.length ? approvedAssignedProjects : assignedProjects, data.reports), getDirectAssignedStudentsForSupervisor(data, currentUser)), [data, approvedAssignedProjects, assignedProjects, currentUser])
  const allowedReports = useMemo(() => getSupervisorAllowedReports(data, approvedAssignedProjects.length ? approvedAssignedProjects : assignedProjects, currentUser), [data, approvedAssignedProjects, assignedProjects, currentUser])

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

  async function handleReviewAction(reportId, status, fallbackFeedback) {
    const key = `${reportId}-${status}`
    if (reviewLoadingKey || !reviewReport) return
    setReviewLoadingKey(key)
    try {
      await reviewReport(reportId, status, feedback[reportId] || fallbackFeedback)
    } finally {
      setReviewLoadingKey('')
    }
  }

  return (
    <div id="review-weekly-reports" data-search-section="review-weekly-reports" className="card supervisor-review-reports-card dashboard-review-reports-card">
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
                    <EmailReportButton loading={Boolean(emailSendingReports[r.id])} onSend={() => sendWeeklyReportToMyEmail?.(r.id)} />
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
                    disabled={isFinalWeeklyReportDecision(r)}
                  />
                  {isFinalWeeklyReportDecision(r) ? (
                    <div className="final-decision-note">
                      <Pill tone={getWeeklyReportDecisionTone(r.status)}>{r.status}</Pill>
                      <span>This weekly report has already received a final decision.</span>
                    </div>
                  ) : (
                    <div className="supervisor-feedback-actions decision-actions">
                      <button onClick={() => handleReviewAction(r.id, 'Accepted', 'Accepted. Continue with the next milestone.')} disabled={Boolean(reviewLoadingKey)} className="accept-btn approve-btn decision-btn min-button-width weekly-report-decision-btn weekly-report-accept-btn"><ButtonContent loading={reviewLoadingKey === `${r.id}-Accepted`} loadingText="Accepting..." icon={CheckCircle2}>Approve</ButtonContent></button>
                      <button onClick={() => handleReviewAction(r.id, 'Revision Required', 'Revision required. Please add more detail.')} disabled={Boolean(reviewLoadingKey)} className="revision-btn decision-btn min-button-width weekly-report-decision-btn weekly-report-revision-btn"><ButtonContent loading={reviewLoadingKey === `${r.id}-Revision Required`} loadingText="Requesting..." icon={RefreshCw}>Request Revision</ButtonContent></button>
                      <button onClick={() => handleReviewAction(r.id, 'Rejected', 'Rejected. Please meet your supervisor for guidance.')} disabled={Boolean(reviewLoadingKey)} className="reject-btn danger-btn min-button-width weekly-report-decision-btn weekly-report-reject-btn"><ButtonContent loading={reviewLoadingKey === `${r.id}-Rejected`} loadingText="Rejecting..." icon={XCircle}>Reject</ButtonContent></button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : <EmptyState title={selectedStudentName ? 'No weekly reports found for this student.' : 'No weekly reports found for your assigned students.'} text={selectedStudentName ? `${selectedStudentName} has not submitted weekly reports matching this filter yet.` : 'Only reports from students assigned to you will appear here.'} icon={ClipboardCheck} />}
    </div>
  )
}

function SupervisorProjectManagementTab({ data, projects, currentUser, dataLoading = false, createProject, assignProjectLeader }) {
  const [projectForm, setProjectForm] = useState({ title: '', group_name: `${currentUser.full_name || 'Supervisor'} Research Group`, area: DEFAULT_DEPARTMENT, expected_members: '', start_date: '', end_date: '', final_due: '' })
  const [submittingProject, setSubmittingProject] = useState(false)
  const [leaderSelections, setLeaderSelections] = useState({})
  const [leaderAssigningProjectId, setLeaderAssigningProjectId] = useState('')
  const [leaderProjectSearch, setLeaderProjectSearch] = useState('')
  const [selectedLeaderProjectId, setSelectedLeaderProjectId] = useState('')
  const assignedProjects = useMemo(() => projects.filter((p) => isAssignedSupervisorProject(p, currentUser)), [projects, currentUser])
  const approvedAssignedProjects = useMemo(() => assignedProjects.filter(isApprovedResearchProject), [assignedProjects])
  const supervisorProgressProjects = useMemo(() => getSupervisorProgressProjects(data, approvedAssignedProjects.length ? approvedAssignedProjects : assignedProjects), [data, approvedAssignedProjects, assignedProjects])
  const studentOptions = useMemo(() => mergeStudentOptions(getAssignedSupervisorStudents(data, approvedAssignedProjects.length ? approvedAssignedProjects : assignedProjects, data.reports), getDirectAssignedStudentsForSupervisor(data, currentUser)), [data, approvedAssignedProjects, assignedProjects, currentUser])
  const allowedReports = useMemo(() => getSupervisorAllowedReports(data, approvedAssignedProjects.length ? approvedAssignedProjects : assignedProjects, currentUser), [data, approvedAssignedProjects, assignedProjects, currentUser])
  const filteredLeaderProjects = useMemo(() => {
    const q = leaderProjectSearch.trim().toLowerCase()
    return approvedAssignedProjects.filter((project) => {
      const leader = getProjectLeaderProfile(data, project)
      const haystack = [project.title, project.group_name, project.area, getProjectDecisionLabel(project), leader?.full_name, leader?.email].join(' ').toLowerCase()
      return !q || haystack.includes(q)
    })
  }, [approvedAssignedProjects, leaderProjectSearch, data])
  const selectedLeaderProject = filteredLeaderProjects.find((project) => String(project.id) === String(selectedLeaderProjectId)) || filteredLeaderProjects[0] || null

  useEffect(() => {
    if (!selectedLeaderProjectId && selectedLeaderProject?.id) setSelectedLeaderProjectId(selectedLeaderProject.id)
    if (selectedLeaderProjectId && !filteredLeaderProjects.some((project) => String(project.id) === String(selectedLeaderProjectId))) {
      setSelectedLeaderProjectId(filteredLeaderProjects[0]?.id || '')
    }
  }, [selectedLeaderProjectId, selectedLeaderProject?.id, filteredLeaderProjects])

  async function handleSubmitSupervisorProject() {
    if (submittingProject || !createProject) return
    setSubmittingProject(true)
    try {
      const result = await createProject(projectForm)
      if (result?.ok) {
        setProjectForm({ title: '', group_name: `${currentUser.full_name || 'Supervisor'} Research Group`, area: DEFAULT_DEPARTMENT, expected_members: '', start_date: '', end_date: '', final_due: '' })
      }
    } finally {
      setSubmittingProject(false)
    }
  }

  async function handleAssignLeader(projectId) {
    const studentId = leaderSelections[projectId]
    if (!studentId || leaderAssigningProjectId || !assignProjectLeader) return
    setLeaderAssigningProjectId(projectId)
    try {
      await assignProjectLeader(projectId, studentId)
    } finally {
      setLeaderAssigningProjectId('')
    }
  }

  if (dataLoading) return <LoadingBlock text="Loading project management..." />

  return (
    <div className="stack supervisor-project-management-layout">
      <div id="submit-research-project" data-search-section="submit-research-project" className="card supervisor-submit-project-card">
        <SectionHeader icon={FileText} title="Submit Research Project" subtitle="Supervisor projects are reviewed by the Research Committee before students can join" />
        <div className="form-grid supervisor-project-form-grid">
          <label className="field wide-field"><span>Research title/project title</span><input value={projectForm.title} onChange={(e) => setProjectForm({ ...projectForm, title: e.target.value })} placeholder="Write the research project title" /></label>
          <label className="field"><span>Research group name</span><input value={projectForm.group_name} onChange={(e) => setProjectForm({ ...projectForm, group_name: e.target.value })} placeholder="Research group name" /></label>
          <label className="field"><span>Department</span><select value={projectForm.area} onChange={(e) => setProjectForm({ ...projectForm, area: e.target.value })}>{DEPARTMENT_OPTIONS.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
          <label className="field"><span>Expected members</span><input type="number" min="1" value={projectForm.expected_members} onChange={(e) => setProjectForm({ ...projectForm, expected_members: e.target.value })} placeholder="e.g. 4" /></label>
          <label className="field"><span>Start date</span><input type="date" value={projectForm.start_date} onChange={(e) => setProjectForm({ ...projectForm, start_date: e.target.value })} /></label>
          <label className="field"><span>Expected end date</span><input type="date" value={projectForm.end_date} onChange={(e) => setProjectForm({ ...projectForm, end_date: e.target.value, final_due: e.target.value })} /></label>
        </div>
        <div className="inline-actions"><button className="primary min-button-width" type="button" disabled={submittingProject} onClick={handleSubmitSupervisorProject}><ButtonContent loading={submittingProject} loadingText="Submitting..." icon={Send}>Submit to Research Committee</ButtonContent></button></div>
      </div>

      <div id="my-submitted-projects" data-search-section="my-submitted-projects" className="card supervisor-submissions-card">
        <SectionHeader icon={ClipboardCheck} title="My Submitted Projects" subtitle="Committee status, comments, and availability for student joining" />
        {assignedProjects.length ? (
          <div className="table-wrap compact-table-wrap"><table><thead><tr><th>Project</th><th>Group</th><th>Department</th><th>Status</th><th>Committee comment</th><th>Reviewed</th></tr></thead><tbody>{assignedProjects.map((project) => <tr key={project.id}><td><b>{project.title || 'Untitled project'}</b></td><td>{project.group_name || 'Research Group'}</td><td>{project.area || '-'}</td><td><Pill tone={getProjectDecisionTone(project)}>{getProjectDecisionLabel(project)}</Pill></td><td>{project.committee_comments || project.decision_message || project.admin_comment || '-'}</td><td>{project.reviewed_at ? new Date(project.reviewed_at).toLocaleDateString() : '-'}</td></tr>)}</tbody></table></div>
        ) : <EmptyState title="No project submissions yet." text="Submit a research project above so the Research Committee can review it." icon={FileText} />}
      </div>

      {supervisorProgressProjects.length ? <ProjectProgressSection projects={supervisorProgressProjects} reports={allowedReports} students={studentOptions} data={data} /> : <div className="card"><EmptyState title="No approved supervised projects yet" text="Project progress appears after the Research Committee approves your submitted project or an approved project is assigned to you." icon={Users} /></div>}

      <div id="assign-project-leader" data-search-section="assign-project-leader" className="card project-leader-assignment-card">
        <SectionHeader icon={UserCog} title="Project Leader Assignment" subtitle="Select a project title first, then choose one student member as Research Project Leader" />
        {approvedAssignedProjects.length ? (
          <div className="project-leader-dropdown-layout">
            <div className="form-grid project-title-selector-grid">
              <label className="field wide-field">
                <span>Search Project Title</span>
                <input value={leaderProjectSearch} onChange={(e) => setLeaderProjectSearch(e.target.value)} placeholder="Search project title, research group, department, status, or current leader..." />
              </label>
              <label className="field wide-field">
                <span>Select Project Title</span>
                <select value={selectedLeaderProject?.id || ''} onChange={(e) => setSelectedLeaderProjectId(e.target.value)}>
                  {filteredLeaderProjects.map((project) => {
                    const leader = getProjectLeaderProfile(data, project)
                    return <option key={project.id} value={project.id}>{project.title || 'Untitled project'}{project.group_name ? ` — ${project.group_name}` : ''} — {getProjectDecisionLabel(project)}{leader ? ` — Leader: ${leader.full_name || leader.email}` : ' — No leader'}</option>
                  })}
                </select>
              </label>
            </div>

            {selectedLeaderProject ? (() => {
              const project = selectedLeaderProject
              const members = getProjectMembersWithoutSupervisor(data, project, data.reports)
              const leader = getProjectLeaderProfile(data, project)
              const selectedLeader = leaderSelections[project.id] || leader?.id || ''
              return (
                <div className="soft-box project-leader-card selected-project-leader-card" key={project.id}>
                  <div className="split">
                    <div>
                      <h3>{project.title || 'Untitled project'}</h3>
                      <p className="muted small">Group: {project.group_name || 'Research Group'} • Department: {project.area || 'Not specified'}</p>
                      <p className="muted small">Supervisor: {project.supervisor_name || currentUser.full_name || 'Supervisor'}</p>
                      <p className="muted small">Current Project Leader: <b>{leader?.full_name || leader?.email || 'Not assigned yet'}</b></p>
                    </div>
                    <Pill tone={getProjectDecisionTone(project)}>{getProjectDecisionLabel(project)}</Pill>
                  </div>
                  <ProjectMembersCompact members={members} emptyText="No students found in this project." />
                  <div className="project-leader-controls">
                    <label className="field">
                      <span>Select Project Leader</span>
                      <select value={selectedLeader} disabled={!members.length || leaderAssigningProjectId === project.id} onChange={(e) => setLeaderSelections({ ...leaderSelections, [project.id]: e.target.value })}>
                        <option value="">Choose a student member</option>
                        {members.map((member) => <option key={member.id || member.email} value={member.id || ''} disabled={!member.id}>{member.full_name || member.email}{member.email ? ` — ${member.email}` : ''}</option>)}
                      </select>
                    </label>
                    <button className="primary min-button-width" type="button" disabled={leaderAssigningProjectId === project.id || !selectedLeader || !members.length} onClick={() => handleAssignLeader(project.id)}>
                      <ButtonContent loading={leaderAssigningProjectId === project.id} loadingText="Assigning leader..." icon={UserPlus}>Assign Project Leader</ButtonContent>
                    </button>
                  </div>
                </div>
              )
            })() : <EmptyState title="No projects found." text="Try another project title or wait until an accepted project has students." icon={Search} />}
          </div>
        ) : <EmptyState title="No accepted projects yet." text="Project leader assignment appears after a project is accepted and students join." icon={UserCog} />}
      </div>


    </div>
  )
}




function SupervisorResearchWorkspace({ data, projects, currentUser, dataLoading = false, reviewReport, createDeadline, removeDeadline, sendWeeklyReportToMyEmail, emailSendingReports = {}, heroSettings = defaultWebsiteSettings, onNavigate }) {
  const assignedProjects = useMemo(() => projects.filter((p) => isAssignedSupervisorProject(p, currentUser)), [projects, currentUser])
  const approvedProjects = useMemo(() => assignedProjects.filter(isApprovedResearchProject), [assignedProjects])
  const members = approvedProjects.flatMap((project) => getProjectMembersWithoutSupervisor(data, project, data.reports))
  const uniqueMembers = new Map()
  members.forEach((member) => {
    const key = member.id || normalizeText(member.email) || normalizeText(member.full_name)
    if (key && !uniqueMembers.has(key)) uniqueMembers.set(key, member)
  })
  const studentOptions = useMemo(() => mergeStudentOptions(getAssignedSupervisorStudents(data, approvedProjects.length ? approvedProjects : assignedProjects, data.reports), getDirectAssignedStudentsForSupervisor(data, currentUser)), [data, approvedProjects, assignedProjects, currentUser])

  if (dataLoading) return <LoadingBlock text="Loading supervisor dashboard..." />

  return (
    <div className="stack supervisor-dashboard-layout">
      <div id="project-members" data-search-section="project-members" className="card supervisor-members-overview-card">
        <SectionHeader icon={Users} title="Supervised Project Members" subtitle="Students in accepted groups only" />
        <ProjectMembersCompact members={Array.from(uniqueMembers.values())} />
      </div>

      <div className="supervisor-dashboard-workflow-grid">
        <SupervisorWeeklyReportReviewCard
          data={data}
          projects={projects}
          currentUser={currentUser}
          reviewReport={reviewReport}
          sendWeeklyReportToMyEmail={sendWeeklyReportToMyEmail}
          emailSendingReports={emailSendingReports}
        />
        <DeadlineManager
          deadlines={data.deadlines}
          createDeadline={createDeadline}
          removeDeadline={removeDeadline}
          students={studentOptions}
          currentUser={currentUser}
        />
      </div>
    </div>
  )
}

function QuestionStatusBadge({ status }) {
  const normalized = String(status || 'Pending')
  return <Pill tone={normalized === 'Answered' ? 'green' : 'amber'}>{normalized}</Pill>
}

function QuestionAttachmentBox({ question, type = 'question', onOpenAttachment }) {
  const attachment = getQuestionAttachment(question, type)
  if (!attachment) return null
  const attachmentTypeClass = type === 'answer' ? 'answer-attachment-card' : 'question-attachment-card'
  return (
    <div className={`question-attachment-box ${attachmentTypeClass} attachment-card file-attachment uploaded-file-card attachment-preview`}>
      <div className="attachment-file-info">
        <b>{attachment.file_name || 'Attached file'}</b>
        <p className="muted small">{type === 'answer' ? 'Supervisor answer attachment' : 'Student question attachment'}{formatFileSize(attachment.file_size) ? ` • ${formatFileSize(attachment.file_size)}` : ''}</p>
      </div>
      <button className="secondary compact-link download-attachment-btn attachment-download-btn download-attachment" type="button" onClick={() => onOpenAttachment?.(question, type)}>
        <Download size={15} /> Download Attachment
      </button>
    </div>
  )
}

function QuestionCard({ question, data, role, answerValue = '', answerFile = null, onAnswerChange, onAnswerFileChange, onSubmitAnswer, onOpenAttachment, answering = false }) {
  const student = questionStudentLabel(data, question)
  const answered = String(question.status || 'Pending') === 'Answered' || Boolean(question.answer_text)
  return (
    <div className="question-card">
      <div className="question-card-header">
        <div>
          <b>{role === 'supervisor' ? student.name : question.supervisor_name || question.supervisor_email || 'Assigned supervisor'}</b>
          {role === 'supervisor' && student.email && <p className="muted small">{student.email}</p>}
          {role === 'student' && question.supervisor_email && <p className="muted small">{question.supervisor_email}</p>}
        </div>
        <QuestionStatusBadge status={answered ? 'Answered' : 'Pending'} />
      </div>
      <div className="question-body">
        <p className="question-label">Question</p>
        <p>{question.question_text || 'No question text available.'}</p>
        <QuestionAttachmentBox question={question} type="question" onOpenAttachment={onOpenAttachment} />
      </div>
      <p className="muted small">Submitted: {question.created_at ? new Date(question.created_at).toLocaleString() : '-'}</p>
      {question.answer_text ? (
        <div className="question-answer-box">
          <p className="question-label">Supervisor answer</p>
          <p>{question.answer_text}</p>
          <QuestionAttachmentBox question={question} type="answer" onOpenAttachment={onOpenAttachment} />
          <p className="muted small">Answered: {question.answered_at ? new Date(question.answered_at).toLocaleString() : '-'}</p>
        </div>
      ) : role === 'student' ? (
        <div className="question-answer-box pending-answer">Waiting for supervisor answer.</div>
      ) : null}
      {role === 'supervisor' && !answered && (
        <div className="question-answer-form">
          <label className="field wide-field">
            <span>Answer</span>
            <textarea value={answerValue} onChange={(e) => onAnswerChange(question.id, e.target.value)} placeholder="Write a clear answer for the student..." />
          </label>
          <label className="field wide-field">
            <span>Optional answer attachment</span>
            <input type="file" accept={QUESTION_ATTACHMENT_ACCEPT} onChange={(e) => onAnswerFileChange?.(question.id, e.target.files?.[0] || null)} />
            {answerFile?.name && <small className="muted">Selected: {answerFile.name}</small>}
          </label>
          <button className="primary min-button-width" type="button" disabled={answering || !String(answerValue || '').trim()} onClick={() => onSubmitAnswer(question.id)}>
            <ButtonContent loading={answering} loadingText={answerFile ? 'Uploading attachment...' : 'Sending answer...'} icon={Send}>Send Answer</ButtonContent>
          </button>
        </div>
      )}
    </div>
  )
}

function StudentQuestionsTab({ data, currentUser, dataLoading = false, submitStudentQuestion, openQuestionAttachment }) {
  const [questionText, setQuestionText] = useState('')
  const [questionFile, setQuestionFile] = useState(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [statusFilter, setStatusFilter] = useState('all')
  const [submitting, setSubmitting] = useState(false)
  const supervisor = findAssignedSupervisorForStudent(data, currentUser)
  const questions = (data.studentQuestions || [])
    .filter((question) => questionOwnedByStudent(question, currentUser))
    .filter((question) => {
      const answered = String(question.status || 'Pending') === 'Answered' || Boolean(question.answer_text)
      if (statusFilter === 'pending') return !answered
      if (statusFilter === 'answered') return answered
      return true
    })
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const result = await submitStudentQuestion(questionText, questionFile)
      if (result?.ok) {
        setQuestionText('')
        setQuestionFile(null)
        setFileInputKey((value) => value + 1)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const emptyTitle = statusFilter === 'pending' ? 'No pending questions found.' : statusFilter === 'answered' ? 'No answered questions found.' : 'No questions yet.'

  return (
    <div className="questions-grid">
      <div className="card question-form-card">
        <SectionHeader icon={MessageSquareText} title="Questions" subtitle="Ask your assigned supervisor a research question" />
        {!supervisor ? (
          <EmptyState title="No supervisor assigned yet." text="You can ask questions after Admin assigns you to a supervisor." icon={Users} />
        ) : (
          <>
            <div className="soft-box compact-supervisor-box">
              <b>Assigned supervisor</b>
              <p>{supervisor.full_name || supervisor.email}</p>
              {supervisor.email && <p className="muted small">{supervisor.email}</p>}
            </div>
            <label className="field wide-field">
              <span>Your question</span>
              <textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Write your question for your supervisor..." />
            </label>
            <label className="field wide-field">
              <span>Optional attachment</span>
              <input key={fileInputKey} type="file" accept={QUESTION_ATTACHMENT_ACCEPT} onChange={(e) => setQuestionFile(e.target.files?.[0] || null)} />
              {questionFile?.name && <small className="muted">Selected: {questionFile.name}</small>}
            </label>
            <button className="primary min-button-width" type="button" disabled={submitting || !questionText.trim()} onClick={handleSubmit}>
              <ButtonContent loading={submitting} loadingText={questionFile ? 'Uploading attachment...' : 'Submitting question...'} icon={Send}>Submit Question</ButtonContent>
            </button>
          </>
        )}
      </div>
      <div className="card">
        <SectionHeader icon={MessageSquareText} title="Previous Questions" subtitle="Track pending and answered questions" />
        <div className="question-filter-grid student-question-filter-grid">
          <label className="field">
            <span>Question Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Questions</option>
              <option value="pending">Pending Questions</option>
              <option value="answered">Answered Questions</option>
            </select>
          </label>
        </div>
        {dataLoading ? <LoadingBlock text="Loading questions..." /> : questions.length ? (
          <div className="question-list">
            {questions.map((question) => <QuestionCard key={question.id} question={question} data={data} role="student" onOpenAttachment={openQuestionAttachment} />)}
          </div>
        ) : <EmptyState title={emptyTitle} text="Your submitted questions and supervisor answers will appear here." icon={MessageSquareText} />}
      </div>
    </div>
  )
}

function SupervisorQuestionsTab({ data, currentUser, dataLoading = false, answerStudentQuestion, openQuestionAttachment }) {
  const [answers, setAnswers] = useState({})
  const [answerFiles, setAnswerFiles] = useState({})
  const [answeringId, setAnsweringId] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [studentFilter, setStudentFilter] = useState('all')
  const accessibleQuestions = (data.studentQuestions || [])
    .filter((question) => supervisorCanAccessQuestion(data, question, currentUser))
  const studentOptions = getSupervisorQuestionStudents(data, currentUser, accessibleQuestions)
  const questions = accessibleQuestions
    .filter((question) => {
      const answered = String(question.status || 'Pending') === 'Answered' || Boolean(question.answer_text)
      if (statusFilter === 'pending') return !answered
      if (statusFilter === 'answered') return answered
      return true
    })
    .filter((question) => questionMatchesStudentFilter(question, studentFilter, data))
    .sort((a, b) => {
      const statusSort = String(a.status || 'Pending') === 'Pending' && String(b.status || 'Pending') !== 'Pending' ? -1 : String(b.status || 'Pending') === 'Pending' && String(a.status || 'Pending') !== 'Pending' ? 1 : 0
      if (statusSort) return statusSort
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    })

  function updateAnswer(questionId, value) {
    setAnswers((current) => ({ ...current, [questionId]: value }))
  }

  function updateAnswerFile(questionId, file) {
    setAnswerFiles((current) => ({ ...current, [questionId]: file || null }))
  }

  async function submitAnswer(questionId) {
    if (answeringId) return
    setAnsweringId(questionId)
    try {
      const result = await answerStudentQuestion(questionId, answers[questionId], answerFiles[questionId] || null)
      if (result?.ok) {
        setAnswers((current) => ({ ...current, [questionId]: '' }))
        setAnswerFiles((current) => ({ ...current, [questionId]: null }))
      }
    } finally {
      setAnsweringId('')
    }
  }

  const emptyTitle = !studentOptions.length ? 'No students found.' : statusFilter === 'pending' ? 'No pending questions found.' : statusFilter === 'answered' ? 'No answered questions found.' : 'No questions found.'

  return (
    <div className="card">
      <SectionHeader icon={MessageSquareText} title="Student Questions" subtitle="Answer questions from your assigned students" />
      <div className="question-filter-grid">
        <label className="field">
          <span>Question Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Questions</option>
            <option value="pending">Pending Questions</option>
            <option value="answered">Answered Questions</option>
          </select>
        </label>
        <label className="field">
          <span>Select Student</span>
          <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
            <option value="all">All Assigned Students</option>
            {studentOptions.map((student) => <option key={student.key} value={student.key}>{student.name}{student.email ? ` — ${student.email}` : ''}</option>)}
          </select>
          {!studentOptions.length && <small className="muted">No students found.</small>}
        </label>
      </div>
      {dataLoading ? <LoadingBlock text="Loading questions..." /> : questions.length ? (
        <div className="question-list supervisor-question-list">
          {questions.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              data={data}
              role="supervisor"
              answerValue={answers[question.id] ?? question.answer_text ?? ''}
              answerFile={answerFiles[question.id] || null}
              onAnswerChange={updateAnswer}
              onAnswerFileChange={updateAnswerFile}
              onSubmitAnswer={submitAnswer}
              onOpenAttachment={openQuestionAttachment}
              answering={String(answeringId) === String(question.id)}
            />
          ))}
        </div>
      ) : <EmptyState title={emptyTitle} text="Questions from your assigned students will appear here." icon={MessageSquareText} />}
    </div>
  )
}



function GroupRequestStatusBadge({ status }) {
  const normalized = String(status || 'Pending')
  const tone = normalized === 'Accepted' ? 'green' : normalized === 'Rejected' ? 'red' : 'amber'
  return <Pill tone={tone}>{normalized}</Pill>
}

function StudentJoinResearchGroupTab({ data, currentUser, dataLoading = false, submitGroupJoinRequest }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [messageText, setMessageText] = useState('')
  const [submittingId, setSubmittingId] = useState('')
  const currentGroup = getStudentCurrentResearchGroup(data, currentUser)

  if (currentGroup) {
    const memberProfiles = getResearchGroupMemberProfiles(data, currentGroup)
    const members = uniqueTextList([
      ...memberProfiles.map((profile) => profile.full_name || profile.email).filter(Boolean),
      ...getProjectStudents(currentGroup).filter((member) => !String(member || '').includes('@')),
    ])
    return (
      <div className="admin-panel-stack group-join-page">
        <div className="card combined-group-join-card">
          <SectionHeader icon={Users} title="Current Research Group" subtitle="You are already assigned to a research project, so joining other groups is disabled" />
          <div className="notice info compact-notice">
            <b>You are already assigned to a research group.</b>
            <p>The Join Research Group feature is hidden once your group membership is active.</p>
          </div>
          <div className="soft-box project-progress-card-surface">
            <p className="muted small bold">{currentGroup.group_name || 'Research Group'}</p>
            <h3>{currentGroup.title || 'Research project'}</h3>
            <p className="muted small">Supervisor: {currentGroup.supervisor_name || 'Pending Assignment'}{currentGroup.supervisor_email ? ` • ${currentGroup.supervisor_email}` : ''}</p>
            {members.length ? <p className="muted small">Group members: {members.join(', ')}</p> : null}
            <p className="muted small">Open the Dashboard to view project progress, deadlines, and Submit Weekly Report.</p>
          </div>
        </div>
      </div>
    )
  }

  const requests = (data.groupJoinRequests || [])
    .filter((request) => requestOwnedByStudent(request, currentUser))
    .sort((a, b) => new Date(b.requested_at || 0) - new Date(a.requested_at || 0))
  const latestRequestForGroup = (group) => requests.find((request) => requestMatchesGroup(request, group))
  const normalizedSearch = search.trim().toLowerCase()
  const allGroups = getResearchGroupOptions(data, currentUser)
  const filteredGroups = allGroups.filter((group) => {
    const request = latestRequestForGroup(group)
    const requestStatus = String(request?.status || 'Available').toLowerCase()
    const statusMatch =
      statusFilter === 'all' ||
      (statusFilter === 'available' && !request) ||
      (statusFilter === 'pending' && requestStatus === 'pending') ||
      (statusFilter === 'accepted' && requestStatus === 'accepted') ||
      (statusFilter === 'rejected' && requestStatus === 'rejected')
    if (!statusMatch) return false
    if (!normalizedSearch) return true
    const haystack = [
      group.group_name,
      group.title,
      group.area,
      group.supervisor_name,
      group.supervisor_email,
      ...(group.students || []),
    ].join(' ').toLowerCase()
    return haystack.includes(normalizedSearch)
  })

  async function handleRequest(groupId) {
    if (submittingId || currentGroup) return
    const group = allGroups.find((item) => String(item.id) === String(groupId))
    const existingRequest = group ? latestRequestForGroup(group) : null
    if (existingRequest && String(existingRequest.status || '').toLowerCase() === 'pending') return
    setSubmittingId(groupId)
    try {
      const result = await submitGroupJoinRequest(groupId, messageText)
      if (result?.ok) setMessageText('')
    } finally {
      setSubmittingId('')
    }
  }

  function renderAction(group) {
    const request = latestRequestForGroup(group)
    const status = String(request?.status || '').toLowerCase()
    if (currentGroup) return <button className="secondary min-button-width" type="button" disabled>You are already assigned</button>
    if (status === 'pending') return <button className="secondary min-button-width" type="button" disabled>Request Pending</button>
    if (status === 'accepted') return <button className="success min-button-width" type="button" disabled>Accepted</button>
    if (status === 'rejected') return <button className="danger ghost min-button-width" type="button" disabled>Rejected</button>
    return (
      <button className="primary min-button-width" type="button" disabled={Boolean(submittingId)} onClick={() => handleRequest(group.id)}>
        <ButtonContent loading={submittingId === group.id} loadingText="Submitting request..." icon={Send}>Request to Join</ButtonContent>
      </button>
    )
  }

  return (
    <div className="admin-panel-stack group-join-page">
      <div className="card combined-group-join-card">
        <SectionHeader icon={Users} title="Join Research Group" subtitle="Search available research groups and request to join from one place" />
        {currentGroup && (
          <div className="notice info compact-notice">
            <b>You are already assigned to a research group.</b>
            <p>{currentGroup.group_name || currentGroup.title || 'Your current group'} is linked to your account.</p>
          </div>
        )}
        <div className="form-grid group-join-filter-grid">
          <label className="field wide-field"><span>Search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search research groups, projects, supervisors, or students..." /></label>
          <label className="field"><span>Filter</span><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All groups</option>
            <option value="available">Available groups</option>
            <option value="pending">My pending requests</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select></label>
          {!currentGroup && <label className="field wide-field"><span>Request message</span><textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Optional message for the supervisor/admin..." /></label>}
        </div>

        {dataLoading ? <LoadingBlock text="Loading available research groups..." /> : filteredGroups.length ? (
          <div className="group-card-grid joined-group-list">
            {filteredGroups.map((group) => {
              const request = latestRequestForGroup(group)
              const status = request?.status || 'Available'
              return (
                <div className="mini-card group-card" key={group.id || group.group_name}>
                  <div className="split">
                    <div>
                      <div className="question-card-header">
                        <div>
                          <b>{group.group_name || 'Research Group'}</b>
                          <p className="muted small">{group.title || 'No research title/project'} • {group.area || 'No department/program'}</p>
                        </div>
                        {request ? <GroupRequestStatusBadge status={status} /> : <Pill tone="blue">Available</Pill>}
                      </div>
                      <p className="muted small">Supervisor: {group.supervisor_name || 'Pending Assignment'}{group.supervisor_email ? ` • ${group.supervisor_email}` : ''}</p>
                      <p className="muted small">Members: {(group.students || []).join(', ') || 'No listed members yet'}</p>
                      {request?.request_message && <p className="muted small">Your request: {request.request_message}</p>}
                      {request?.decision_message && <div className="question-answer-box"><p className="question-label">Decision comment</p><p>{request.decision_message}</p></div>}
                      {request?.requested_at && <p className="muted small">Requested: {new Date(request.requested_at).toLocaleString()}</p>}
                    </div>
                    <div className="group-card-actions">{renderAction(group)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState
            title={normalizedSearch ? 'No matching research groups found.' : 'No available research groups found.'}
            text={normalizedSearch ? 'Try another group name, project title, supervisor, student, or department keyword.' : 'No research groups/projects are currently available to join.'}
            icon={Search}
          />
        )}
      </div>
    </div>
  )
}

function SupervisorResearchGroupManagementTab({ data, currentUser, dataLoading = false, supervisorAddStudentsToGroup, decideGroupJoinRequest }) {
  const assignedProjects = (data.projects || []).filter((project) => supervisorCanManageGroup(project, currentUser) && isApprovedResearchProject(project))
  const assignedStudents = mergeStudentOptions(getAssignedSupervisorStudents(data, assignedProjects, data.reports), getDirectAssignedStudentsForSupervisor(data, currentUser))
  const [selectedGroupId, setSelectedGroupId] = useState(assignedProjects[0]?.id || '')
  const [selectedKeys, setSelectedKeys] = useState([])
  const [adding, setAdding] = useState(false)
  const [decisionLoading, setDecisionLoading] = useState('')
  const pendingRequests = (data.groupJoinRequests || []).filter((request) => requestVisibleToSupervisor(data, request, currentUser)).sort((a, b) => new Date(b.requested_at || 0) - new Date(a.requested_at || 0))

  useEffect(() => {
    if (!selectedGroupId && assignedProjects[0]?.id) setSelectedGroupId(assignedProjects[0].id)
  }, [assignedProjects, selectedGroupId])

  async function handleAddStudents() {
    if (adding) return
    setAdding(true)
    try {
      const result = await supervisorAddStudentsToGroup(selectedGroupId, selectedKeys)
      if (result?.ok) setSelectedKeys([])
    } finally {
      setAdding(false)
    }
  }

  async function handleDecision(requestId, status) {
    if (decisionLoading) return
    setDecisionLoading(`${requestId}-${status}`)
    try {
      await decideGroupJoinRequest(requestId, status, '')
    } finally {
      setDecisionLoading('')
    }
  }

  return (
    <div className="admin-panel-stack group-join-page">
      <div className="card">
        <SectionHeader icon={Users} title="Research Group Membership" subtitle="Add your assigned students into your research groups" />
        {dataLoading ? <LoadingBlock text="Loading groups..." /> : assignedProjects.length ? (
          <div className="form-grid">
            <label className="field"><span>Select research group</span><select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>{assignedProjects.map((project) => <option key={project.id} value={project.id}>{project.group_name || project.title} — {project.title}</option>)}</select></label>
            <label className="field wide-field"><span>Select assigned students</span><select multiple value={selectedKeys} onChange={(e) => setSelectedKeys(Array.from(e.target.selectedOptions).map((option) => option.value))}>{assignedStudents.map((student) => <option key={student.key} value={student.key}>{student.name}{student.email ? ` — ${student.email}` : ''}</option>)}</select><small className="muted">Hold Command/Ctrl to select multiple students.</small></label>
            <button className="primary min-button-width" type="button" disabled={adding || !selectedGroupId || !selectedKeys.length} onClick={handleAddStudents}><ButtonContent loading={adding} loadingText="Adding students..." icon={UserPlus}>Add Students to Group</ButtonContent></button>
          </div>
        ) : <EmptyState title="No supervised research groups found." text="Groups appear here after you are assigned as supervisor." icon={Users} />}
      </div>
      <div className="card">
        <SectionHeader icon={Clock} title="Group Join Requests" subtitle="Approve or reject requests for groups you supervise" />
        {dataLoading ? <LoadingBlock text="Loading group join requests..." /> : pendingRequests.length ? (
          <div className="question-list">
            {pendingRequests.map((request) => {
              const label = groupJoinRequestLabel(data, request)
              const isPending = String(request.status || 'Pending') === 'Pending'
              return <div className="question-card" key={request.id}>
                <div className="question-card-header"><div><b>{label.studentName}</b><p className="muted small">{label.studentEmail || 'No email'} • Requested group: {label.groupName}</p></div><GroupRequestStatusBadge status={request.status} /></div>
                {request.request_message && <p>{request.request_message}</p>}
                <p className="muted small">Requested: {request.requested_at ? new Date(request.requested_at).toLocaleString() : '-'}</p>
                {isPending && <div className="inline-actions group-join-actions"><button className="accept-btn decision-btn min-button-width group-join-accept-btn" disabled={Boolean(decisionLoading)} onClick={() => handleDecision(request.id, 'Accepted')}><ButtonContent loading={decisionLoading === `${request.id}-Accepted`} loadingText="Approving..." icon={CheckCircle2}>Accept</ButtonContent></button><button className="reject-btn danger-btn min-button-width group-join-reject-btn" disabled={Boolean(decisionLoading)} onClick={() => handleDecision(request.id, 'Rejected')}><ButtonContent loading={decisionLoading === `${request.id}-Rejected`} loadingText="Rejecting..." icon={XCircle}>Reject</ButtonContent></button></div>}
              </div>
            })}
          </div>
        ) : <EmptyState title="No group join requests found." text="Requests for your supervised groups will appear here." icon={Users} />}
      </div>
    </div>
  )
}

function AdminGroupJoinRequestsTab({ data, currentUser, dataLoading = false, decideGroupJoinRequest, directAddStudentsToGroup }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('Pending')
  const [decisionMessages, setDecisionMessages] = useState({})
  const [loadingKey, setLoadingKey] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedStudentKeys, setSelectedStudentKeys] = useState([])
  const [studentSearch, setStudentSearch] = useState('')
  const [addingStudents, setAddingStudents] = useState(false)
  const manageableGroups = (data.projects || []).filter(isApprovedResearchProject).sort((a, b) => String(a.group_name || a.title || '').localeCompare(String(b.group_name || b.title || '')))
  const directAddStudentOptions = (data.profiles || []).filter((profile) => profile.role === 'student').map((student) => {
    const currentGroup = getStudentCurrentResearchGroup(data, student)
    return {
      key: makeStudentOptionKey(student),
      id: student.id,
      name: student.full_name || student.email || 'Student',
      email: student.email || '',
      group: currentGroup?.group_name || currentGroup?.title || 'No current group',
      supervisor: student.assigned_supervisor_name || student.assigned_supervisor_email || '',
    }
  })
  const filteredDirectAddStudents = directAddStudentOptions.filter((student) => {
    const q = studentSearch.trim().toLowerCase()
    const haystack = `${student.name} ${student.email} ${student.group} ${student.supervisor}`.toLowerCase()
    return !q || haystack.includes(q)
  })
  const selectedGroup = manageableGroups.find((group) => String(group.id) === String(selectedGroupId)) || manageableGroups[0] || null

  useEffect(() => {
    if (!selectedGroupId && selectedGroup?.id) setSelectedGroupId(selectedGroup.id)
  }, [selectedGroupId, selectedGroup?.id])

  const requests = (data.groupJoinRequests || []).filter((request) => {
    const label = groupJoinRequestLabel(data, request)
    const matchesStatus = status === 'All' || String(request.status || 'Pending') === status
    const q = search.trim().toLowerCase()
    const haystack = `${label.studentName} ${label.studentEmail} ${label.groupName} ${label.projectTitle} ${label.currentSupervisor} ${label.supervisorName} ${request.request_message || ''}`.toLowerCase()
    return matchesStatus && (!q || haystack.includes(q))
  }).sort((a, b) => new Date(b.requested_at || 0) - new Date(a.requested_at || 0))

  async function handleDecision(requestId, nextStatus) {
    if (loadingKey) return
    setLoadingKey(`${requestId}-${nextStatus}`)
    try {
      await decideGroupJoinRequest(requestId, nextStatus, decisionMessages[requestId] || '')
    } finally {
      setLoadingKey('')
    }
  }

  async function handleDirectAdd() {
    if (!directAddStudentsToGroup || addingStudents || !selectedGroupId || !selectedStudentKeys.length) return
    setAddingStudents(true)
    try {
      const result = await directAddStudentsToGroup(selectedGroupId, selectedStudentKeys)
      if (result?.ok) setSelectedStudentKeys([])
    } finally {
      setAddingStudents(false)
    }
  }

  return (
    <div className="admin-panel-stack group-requests-admin-page">
      {(isAdminUser(currentUser) || isResearchCommitteeUser(currentUser)) && directAddStudentsToGroup && (
        <div className="card direct-group-add-card">
          <SectionHeader icon={UserPlus} title="Direct Group Membership" subtitle="Add students to a research group without a pending request" />
          {dataLoading ? <LoadingBlock text="Loading groups..." /> : manageableGroups.length ? (
            <div className="form-grid">
              <label className="field"><span>Select Research Group</span><select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>{manageableGroups.map((group) => <option key={group.id} value={group.id}>{group.group_name || group.title || 'Research Group'} — {group.title || 'No title'} — {group.supervisor_name || 'No supervisor'}</option>)}</select></label>
              <label className="field"><span>Search students</span><input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search student name, email, group, or supervisor..." /></label>
              <label className="field wide-field"><span>Select Student(s)</span><select multiple value={selectedStudentKeys} onChange={(e) => setSelectedStudentKeys(Array.from(e.target.selectedOptions).map((option) => option.value))}>{filteredDirectAddStudents.map((student) => <option key={student.key} value={student.key}>{student.name}{student.email ? ` — ${student.email}` : ''} — {student.group}{student.supervisor ? ` — Supervisor: ${student.supervisor}` : ''}</option>)}</select><small className="muted">Hold Command/Ctrl to select multiple students.</small></label>
              {selectedGroup && <div className="soft-box wide-field compact-group-details"><b>{selectedGroup.group_name || selectedGroup.title || 'Research Group'}</b><p className="muted small">Project: {selectedGroup.title || 'Not available'} • Supervisor: {selectedGroup.supervisor_name || selectedGroup.supervisor_email || 'Not assigned'}</p><ProjectMembersCompact members={getProjectMemberProfiles(data, selectedGroup, data.reports || [])} /></div>}
              <button className="primary min-button-width" type="button" disabled={addingStudents || !selectedGroupId || !selectedStudentKeys.length} onClick={handleDirectAdd}><ButtonContent loading={addingStudents} loadingText={selectedStudentKeys.length > 1 ? 'Adding students...' : 'Adding student...'} icon={UserPlus}>{selectedStudentKeys.length > 1 ? 'Add Students to Group' : 'Add Student to Group'}</ButtonContent></button>
            </div>
          ) : <EmptyState title="No research groups found." text="Create or approve a research project/group before adding students." icon={Users} />}
        </div>
      )}
      <div className="card">
        <SectionHeader icon={Users} title="Group Join Requests" subtitle="Review, approve, or reject student research group join requests" />
        <div className="form-grid">
          <label className="field"><span>Search requests</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student, email, requested group, project, supervisor..." /></label>
          <label className="field"><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="All">All</option><option value="Pending">Pending</option><option value="Accepted">Accepted</option><option value="Rejected">Rejected</option></select></label>
        </div>
      </div>
      <div className="card">
        {dataLoading ? <LoadingBlock text="Loading group join requests..." /> : requests.length ? (
          <div className="admin-scroll-box group-request-scroll-box">
            {requests.map((request) => {
              const label = groupJoinRequestLabel(data, request)
              const isPending = String(request.status || 'Pending') === 'Pending'
              return <div className="mini-card managed-item group-request-row" key={request.id}>
                <div>
                  <div className="question-card-header"><div><b>{label.studentName}</b><p className="muted small">{label.studentEmail || 'No email'} • Requested: {label.groupName}</p></div><GroupRequestStatusBadge status={request.status} /></div>
                  <p className="muted small">Research title/project: {label.projectTitle || 'Not available'}</p>
                  <p className="muted small">Current supervisor: {label.currentSupervisor || 'Not available'} • Group supervisor: {label.supervisorName || 'Not available'}</p>
                  {request.request_message && <p className="muted small">Request message: {request.request_message}</p>}
                  <p className="muted small">Request date: {request.requested_at ? new Date(request.requested_at).toLocaleString() : '-'}</p>
                  {isPending && <label className="field wide-field compact-decision-field"><span>Optional rejection/decision comment</span><input value={decisionMessages[request.id] || ''} onChange={(e) => setDecisionMessages((current) => ({ ...current, [request.id]: e.target.value }))} placeholder="Optional comment for student" /></label>}
                </div>
                {isPending && <div className="inline-actions group-join-actions"><button className="accept-btn decision-btn min-button-width group-join-accept-btn" disabled={Boolean(loadingKey)} onClick={() => handleDecision(request.id, 'Accepted')}><ButtonContent loading={loadingKey === `${request.id}-Accepted`} loadingText="Accepting..." icon={CheckCircle2}>Accept</ButtonContent></button><button className="reject-btn danger-btn min-button-width group-join-reject-btn" disabled={Boolean(loadingKey)} onClick={() => handleDecision(request.id, 'Rejected')}><ButtonContent loading={loadingKey === `${request.id}-Rejected`} loadingText="Rejecting..." icon={XCircle}>Reject</ButtonContent></button></div>}
              </div>
            })}
          </div>
        ) : <EmptyState title={search ? 'No matching requests found.' : 'No group join requests found.'} text="Student research group join requests will appear here." icon={Users} />}
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

  const summaryText = !students.length
    ? 'No assigned students found'
    : targetScope === 'all_assigned'
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
        className={`student-multiselect-trigger${open ? ' open' : ''}${error ? ' error' : ''}${!students.length ? ' disabled' : ''}`}
        type="button"
        disabled={!students.length}
        onClick={() => students.length && setOpen((value) => !value)}
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
          {students.length > 0 && (
            <button type="button" className={`student-option-row all-option${targetScope === 'all_assigned' ? ' selected' : ''}`} onClick={selectAllStudents}>
              <span className="student-option-check">{targetScope === 'all_assigned' ? '✓' : ''}</span>
              <span><b>All Assigned Students</b><small>Send only to your assigned students</small></span>
            </button>
          )}
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
  const [removingDeadlineId, setRemovingDeadlineId] = useState('')

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
    try {
      const result = await createDeadline({
        ...form,
        selected_students: selectedStudents,
        target_scope: form.target_scope,
      })
      if (result?.ok) resetForm()
    } finally {
      setSavingDeadline(false)
    }
  }

  async function handleRemoveDeadline(deadlineId) {
    if (removingDeadlineId) return
    setRemovingDeadlineId(String(deadlineId))
    try {
      await removeDeadline(deadlineId)
    } finally {
      setRemovingDeadlineId('')
    }
  }

  return (
    <div id="manage-deadlines" data-search-section="manage-deadlines" className="card supervisor-deadline-card">
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
              <ButtonContent loading={savingDeadline} loadingText="Adding..." icon={CalendarDays}>Add Deadline</ButtonContent>
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
            <button className="danger compact-button min-button-width" type="button" disabled={Boolean(removingDeadlineId)} onClick={() => handleRemoveDeadline(d.id)}><ButtonContent loading={String(removingDeadlineId) === String(d.id)} loadingText="Removing..." icon={Trash2} iconSize={14}>Remove</ButtonContent></button>
          </div>
        )) : <EmptyState title="No deadlines" text="Add the first supervisor deadline using the form above." icon={CalendarDays} />}
      </div>
    </div>
  )
}

function ProjectProgressSection({ projects = [], reports = [], data = emptyData }) {
  const projectOptions = useMemo(() => {
    const seen = new Set()
    return (projects || [])
      .filter((project) => project?.id && !seen.has(String(project.id)) && seen.add(String(project.id)))
      .sort((a, b) => String(a.title || a.group_name || '').localeCompare(String(b.title || b.group_name || '')))
  }, [projects])
  const [selectedProjectId, setSelectedProjectId] = useState('all')

  useEffect(() => {
    if (selectedProjectId !== 'all' && !projectOptions.some((project) => String(project.id) === String(selectedProjectId))) {
      setSelectedProjectId('all')
    }
  }, [projectOptions, selectedProjectId])

  const selectedProject = selectedProjectId === 'all' ? null : projectOptions.find((project) => String(project.id) === String(selectedProjectId))
  const filteredProjects = selectedProject ? [selectedProject] : projectOptions

  return (
    <div id="project-progress" data-search-section="project-progress" className="card supervisor-project-progress-section">
      <SectionHeader icon={CheckCircle2} title="Project Progress" subtitle="Choose which project title progress to view" />
      <div className="progress-filter-panel">
        <label className="field wide-field">
          <span>Select Project Title</span>
          <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            <option value="all">All Project Titles</option>
            {projectOptions.map((project) => {
              const leader = getProjectLeaderProfile(data, project)
              const labelParts = [project.title || 'Untitled project', project.group_name || '', getProjectDecisionLabel(project), leader ? `Leader: ${leader.full_name || leader.email}` : 'No leader']
              return <option key={project.id} value={project.id}>{labelParts.filter(Boolean).join(' — ')}</option>
            })}
          </select>
        </label>
      </div>
      {filteredProjects.length ? (
        <div className="project-progress-list">
          {filteredProjects.map((project) => {
            const projectReports = reports.filter((report) => String(report.project_id) === String(project.id))
            const latestReportDate = projectReports.map((report) => report.submitted_at).filter(Boolean).sort().at(-1)
            const progress = getProjectProgress(project, reports)
            const leader = getProjectLeaderProfile(data, project)
            const supervisor = findSupervisorProfileForProject(data, project)
            const members = getProjectMembersWithoutSupervisor(data, project, reports)
            const projectDeadlines = getDeadlinesForProject(data.deadlines || [], project, members)
            return (
              <div className="project-progress-wide-card" key={project.id}>
                <div className="split project-progress-header">
                  <div>
                    <p className="muted small bold">{project.group_name || 'Research Group'}</p>
                    <h3>{project.title || 'Untitled project'}</h3>
                    <p className="muted">Department: {project.area || 'Not specified'}</p>
                    <p className="muted small">Supervisor: {supervisor?.full_name || project.supervisor_name || project.supervisor_email || 'Not assigned'}</p>
                    <p className="muted small">Project Leader: {leader?.full_name || leader?.email || 'Not assigned yet'}</p>
                    <p className="muted small">Last update: {latestReportDate ? new Date(latestReportDate).toLocaleString() : project.created_at ? new Date(project.created_at).toLocaleString() : 'No updates yet'}</p>
                  </div>
                  <div className="progress-status-column">
                    <Pill tone={getProjectDecisionTone(project)}>{getProjectDecisionLabel(project)}</Pill>
                    <strong>{formatProgress(progress)}%</strong>
                  </div>
                </div>
                <div className="progress-row"><span>Progress</span><span>{formatProgress(progress)}%</span></div>
                <ProgressBar value={progress} />
                <ProjectMembersCompact members={members} />
                {projectDeadlines.length ? (
                  <div className="project-progress-deadlines">
                    <b>Deadlines</b>
                    {projectDeadlines.map((deadline) => <p className="muted small" key={deadline.id || `${deadline.title}-${deadline.due_date}`}>{deadline.title || deadline.deadline_type} • {deadline.due_date || 'No due date'}</p>)}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : <EmptyState title="No project progress available." text="Project progress will appear after a supervised project has members or reports." icon={CheckCircle2} />}
    </div>
  )
}

function CommitteeResearchWorkspace({ data = emptyData, projects = [], dataLoading = false, updateProject, saveEvaluation, heroSettings = defaultWebsiteSettings, onNavigate }) {
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
    try {
      const result = await saveEvaluation({ ...evalForm, project_id: selectedProject.id })
      if (result?.ok) setEvalMessage('Final evaluation saved successfully.')
      else setEvalMessage('Could not save final evaluation. Please check the message above and try again.')
    } finally {
      setSavingEvaluation(false)
    }
  }

  if (dataLoading) return <LoadingBlock text="Loading research committee records..." />

  return (
    <div className="stack committee-dashboard-layout">
      <div id="review-project-submissions" data-search-section="review-project-submissions" className="card committee-review-card combined-filter-card">
        <SectionHeader icon={Search} title="Research Committee Review" subtitle="Search, filter, approve, reject, or request revision for project titles" />
        <div className="section-filter-bar committee-filter-bar">
          <label className="field"><span>Search</span><input value={reviewSearch} onChange={(e) => setReviewSearch(e.target.value)} placeholder="Search title, group, student, supervisor..." /></label>
          <label className="field"><span>Status</span><select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}><option value="all">All statuses</option>{reviewStatusOptions.filter((item) => item !== 'all').map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label className="field"><span>Department</span><select value={reviewDepartment} onChange={(e) => setReviewDepartment(e.target.value)}><option value="all">All departments</option>{DEPARTMENT_OPTIONS.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
          <label className="field"><span>Research group</span><select value={reviewGroup} onChange={(e) => setReviewGroup(e.target.value)}><option value="all">All groups</option>{reviewGroupOptions.filter((item) => item !== 'all').map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
        </div>
        {reviewProjects.length ? <ProjectDecisionTable projects={reviewProjects} updateProject={updateProject} data={data} reports={reports} /> : <EmptyState title="No matching projects" text="Try changing the filters or wait for supervisors to submit research projects." icon={Search} />}
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
              <button className="primary min-button-width" type="button" disabled={savingEvaluation || hasInvalidScore} onClick={submitFinalEvaluation}><ButtonContent loading={savingEvaluation} loadingText="Saving..." icon={CheckCircle2}>{existingEvaluation ? 'Update Final Evaluation' : 'Save Final Evaluation'}</ButtonContent></button>
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




function DualRoleManagementTab({ data = emptyData, currentUser, loadError = '', dataLoading = false, updateCommitteeSupervisorAccess }) {
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState('')
  const [localMessage, setLocalMessage] = useState('')
  const committeeUsers = (data.profiles || [])
    .filter((user) => user.role === 'committee')
    .sort((a, b) => String(a.full_name || a.email || '').localeCompare(String(b.full_name || b.email || '')))
  const filteredCommitteeUsers = committeeUsers.filter((user) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [
      user.full_name,
      user.display_name,
      user.email,
      user.department,
      user.program,
      hasCommitteeSupervisorAccess(user) ? 'research committee supervisor access' : 'research committee only',
    ].some((value) => String(value || '').toLowerCase().includes(q))
  })

  async function handleAccessChange(user, enabled) {
    if (!updateCommitteeSupervisorAccess || actionLoading) return
    setLocalMessage('')
    const key = `${user.id}-${enabled ? 'enable' : 'disable'}`
    setActionLoading(key)
    try {
      const result = await updateCommitteeSupervisorAccess(user.id, enabled)
      if (result?.ok) setLocalMessage('Supervisor access updated successfully.')
      else if (result?.error) setLocalMessage(result.error)
    } finally {
      setActionLoading('')
    }
  }

  return (
    <div className="admin-panel-stack dual-role-management-tab">
      <div className="card dual-role-management-card">
        <SectionHeader icon={ShieldCheck} title="Dual Role Management" subtitle="Allow selected Research Committee users to switch into Supervisor mode without creating duplicate accounts" />
        <div className="section-filter-bar dual-role-filter-bar">
          <label className="field wide-field">
            <span>Search Research Committee users</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, department, program, or status..." />
          </label>
        </div>
        {localMessage && <div className={`message ${localMessage.includes('success') ? 'success-message' : ''}`}>{localMessage}</div>}
        {loadError ? (
          <EmptyState title="Failed to load dual-role data." text={loadError} icon={ShieldCheck} />
        ) : dataLoading ? (
          <LoadingBlock text="Loading Research Committee users..." />
        ) : committeeUsers.length === 0 ? (
          <EmptyState title="No Research Committee users found." text="Approve or create Research Committee accounts first." icon={Users} />
        ) : filteredCommitteeUsers.length ? (
          <div className="managed-list compact-managed-list dual-role-user-list">
            {filteredCommitteeUsers.map((user) => {
              const enabled = hasCommitteeSupervisorAccess(user)
              const loadingKey = `${user.id}-${enabled ? 'disable' : 'enable'}`
              return (
                <div className="mini-card managed-item dual-role-row" key={user.id || user.email}>
                  <div className="dual-role-user-main">
                    <div className="status-avatar small-avatar">{getProfilePhotoUrl(user) ? <img src={getProfilePhotoUrl(user)} alt="Profile" /> : String(getProfileDisplayName(user) || 'C').trim().charAt(0).toUpperCase()}</div>
                    <div>
                      <b>{getProfileDisplayName(user) || user.email || 'Research Committee user'}</b>
                      <p className="small muted">{user.email || 'No email'}{user.department || user.program ? ` • ${user.department || user.program}` : ''}</p>
                    </div>
                  </div>
                  <div className="dual-role-status-block">
                    <Pill tone={enabled ? 'blue' : 'slate'}>{enabled ? 'Research Committee + Supervisor Access' : 'Research Committee only'}</Pill>
                    <p className="small muted">Main role remains Research Committee.</p>
                  </div>
                  <div className="stacked-actions dual-role-actions">
                    {enabled ? (
                      <button className="warning compact-button min-button-width" type="button" disabled={Boolean(actionLoading)} onClick={() => handleAccessChange(user, false)}>
                        <ButtonContent loading={actionLoading === loadingKey} loadingText="Updating access..." icon={XCircle} iconSize={14}>Disable Supervisor Access</ButtonContent>
                      </button>
                    ) : (
                      <button className="secondary compact-button min-button-width" type="button" disabled={Boolean(actionLoading)} onClick={() => handleAccessChange(user, true)}>
                        <ButtonContent loading={actionLoading === loadingKey} loadingText="Updating access..." icon={CheckCircle2} iconSize={14}>Enable Supervisor Access</ButtonContent>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState title="No Research Committee users found." text="Try another name, email, department, program, or access status." icon={Search} />
        )}
      </div>
    </div>
  )
}

function SupervisorManagementTab({ data = emptyData, projects = [], currentUser, loadError = '', dataLoading = false, updateProject, assignStudentToSupervisor, assignProjectLeader, exportCsv }) {
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
    groupJoinRequests: Array.isArray(data?.groupJoinRequests) ? data.groupJoinRequests : [],
    groupMembers: Array.isArray(data?.groupMembers) ? data.groupMembers : [],
  })
  projects = Array.isArray(projects) ? projects : data.projects
  const supervisors = data.profiles.filter((u) => u.role === 'supervisor')
  const students = data.profiles.filter((u) => u.role === 'student')
  const [studentSearch, setStudentSearch] = useState('')
  const [supervisorSearch, setSupervisorSearch] = useState('')
  const [studentSupervisorSelections, setStudentSupervisorSelections] = useState({})
  const [projectSupervisorId, setProjectSupervisorId] = useState(supervisors[0]?.id || '')
  const [projectAssignmentSearch, setProjectAssignmentSearch] = useState('')
  const [leaderSearch, setLeaderSearch] = useState('')
  const [leaderSelections, setLeaderSelections] = useState({})
  const [actionLoading, setActionLoading] = useState('')

  useEffect(() => {
    if (!projectSupervisorId && supervisors[0]?.id) setProjectSupervisorId(supervisors[0].id)
  }, [projectSupervisorId, supervisors])

  function getUserDepartment(user = {}) {
    const direct = user.department || user.area || user.research_area
    if (direct) return direct
    const relatedProject = getStudentProject(user)
    return relatedProject?.area || relatedProject?.department || 'Not set'
  }

  function getAssignedSupervisor(user = {}) {
    if (user.role !== 'student') return null
    if (user.assigned_supervisor_id || user.assigned_supervisor_email || user.assigned_supervisor_name) {
      const byId = supervisors.find((s) => String(s.id) === String(user.assigned_supervisor_id))
      const byEmail = supervisors.find((s) => normalizeText(s.email) === normalizeText(user.assigned_supervisor_email))
      return byId || byEmail || { id: user.assigned_supervisor_id || '', full_name: user.assigned_supervisor_name || 'Assigned supervisor', email: user.assigned_supervisor_email || '' }
    }
    return null
  }

  function getStudentProject(student = {}) {
    if (!student) return null
    const currentGroup = getStudentCurrentResearchGroup(data, student)
    if (currentGroup) return currentGroup
    const studentName = normalizeText(student.full_name)
    const studentEmail = normalizeText(student.email)
    return projects.find((project) => {
      const projectStudents = getProjectStudents(project).map(normalizeText)
      return (
        String(project.student_id || project.created_by || '') === String(student.id || '') ||
        normalizeText(project.student_email || project.created_by_email) === studentEmail ||
        normalizeText(project.group_name) === studentName ||
        projectStudents.includes(studentName) ||
        projectStudents.includes(studentEmail)
      )
    }) || null
  }

  function getProjectAssignedStudent(project = {}) {
    return students.find((student) =>
      String(project.student_id || project.created_by || '') === String(student.id) ||
      normalizeText(project.student_email || project.created_by_email) === normalizeText(student.email) ||
      getProjectStudents(project).map(normalizeText).includes(normalizeText(student.full_name)) ||
      getProjectStudents(project).map(normalizeText).includes(normalizeText(student.email))
    )
  }

  async function runSupervisorAction(key, action) {
    if (actionLoading) return
    setActionLoading(key)
    try {
      await action()
    } finally {
      setActionLoading('')
    }
  }

  const filteredSupervisorOptions = supervisors.filter((supervisor) => {
    const q = supervisorSearch.trim().toLowerCase()
    if (!q) return true
    return [supervisor.full_name, supervisor.email, supervisor.department, supervisor.area, supervisor.research_area].some((value) => String(value || '').toLowerCase().includes(q))
  })

  const filteredStudents = students.filter((student) => {
    const q = studentSearch.trim().toLowerCase()
    if (!q) return true
    const assigned = getAssignedSupervisor(student)
    const project = getStudentProject(student)
    const searchable = [
      student.full_name,
      student.email,
      student.status,
      getUserDepartment(student),
      assigned?.full_name,
      assigned?.email,
      project?.group_name,
      project?.title,
      project?.area,
      project?.department,
    ].join(' ').toLowerCase()
    return searchable.includes(q)
  })

  async function handleStudentSupervisorAssign(studentId) {
    const student = students.find((item) => String(item.id) === String(studentId))
    const currentSupervisor = student ? getAssignedSupervisor(student) : null
    const selectedSupervisorId = Object.prototype.hasOwnProperty.call(studentSupervisorSelections, studentId)
      ? studentSupervisorSelections[studentId]
      : currentSupervisor?.id || ''
    if (!selectedSupervisorId || !assignStudentToSupervisor) return
    await assignStudentToSupervisor(studentId, selectedSupervisorId, { assignmentScope: 'student' })
  }

  async function handleStudentSupervisorRemove(studentId) {
    if (!assignStudentToSupervisor) return
    await assignStudentToSupervisor(studentId, '', { assignmentScope: 'student' })
    setStudentSupervisorSelections((current) => ({ ...current, [studentId]: '' }))
  }

  const selectedProjectSupervisor = supervisors.find((supervisor) => String(supervisor.id) === String(projectSupervisorId))
  const filteredAssignmentProjects = projects.filter((project) => {
    const q = projectAssignmentSearch.trim().toLowerCase()
    if (!q) return true
    const student = getProjectAssignedStudent(project)
    const supervisor = supervisors.find((item) =>
      String(item.id) === String(project.supervisor_id) ||
      normalizeText(item.email) === normalizeText(project.supervisor_email) ||
      normalizeText(item.full_name) === normalizeText(project.supervisor_name)
    )
    const searchable = [
      project.title,
      project.group_name,
      project.area,
      project.department,
      project.student_email,
      project.created_by_email,
      project.supervisor_name,
      project.supervisor_email,
      getProjectStudents(project).join(' '),
      student?.full_name,
      student?.email,
      getUserDepartment(student || {}),
      supervisor?.full_name,
      supervisor?.email,
    ].join(' ').toLowerCase()
    return searchable.includes(q)
  })

  async function handleProjectSupervisorAssign(projectId) {
    const supervisor = selectedProjectSupervisor
    const project = projects.find((item) => String(item.id) === String(projectId))
    const student = project ? getProjectAssignedStudent(project) : null

    if (student?.id && assignStudentToSupervisor) {
      await assignStudentToSupervisor(student.id, supervisor?.id || '', { projectId })
      return
    }

    await updateProject?.(projectId, {
      supervisor_name: supervisor?.full_name || 'Pending Assignment',
      supervisor_id: supervisor?.id || null,
      supervisor_email: supervisor?.email || '',
    })
  }

  async function handleProjectSupervisorRemove(projectId) {
    const project = projects.find((item) => String(item.id) === String(projectId))
    const student = project ? getProjectAssignedStudent(project) : null

    if (student?.id && assignStudentToSupervisor) {
      await assignStudentToSupervisor(student.id, '', { projectId })
      return
    }

    await updateProject?.(projectId, {
      supervisor_name: 'Pending Assignment',
      supervisor_id: null,
      supervisor_email: '',
    })
  }

  const filteredLeaderProjects = projects.filter((project) => {
    const q = leaderSearch.trim().toLowerCase()
    if (!q) return true
    const leader = getProjectLeaderProfile(data, project)
    const members = getProjectMembersWithoutSupervisor(data, project, data.reports)
    const searchable = [
      project.title,
      project.group_name,
      project.area,
      project.supervisor_name,
      project.supervisor_email,
      leader?.full_name,
      leader?.email,
      members.map((member) => `${member.full_name || ''} ${member.email || ''}`).join(' '),
    ].join(' ').toLowerCase()
    return searchable.includes(q)
  })

  async function handleAssignProjectLeader(projectId) {
    const selectedStudentId = leaderSelections[projectId]
    if (!selectedStudentId || !assignProjectLeader) return
    await assignProjectLeader(projectId, selectedStudentId)
  }

  if (dataLoading) return <LoadingBlock text="Loading supervisor management..." />

  return (
    <div className="admin-panel-stack supervisor-management-page">
      <div className="card supervisor-management-card student-supervisor-management-card">
        <SectionHeader icon={UserCog} title="Student Supervisor Assignment" subtitle="Assign, change, or remove direct supervisors for student accounts" />
        <div className="supervisor-management-controls">
          <label className="field"><span>Search students</span><input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search student name, email, supervisor, department, project..." /></label>
          <label className="field"><span>Search supervisors</span><input value={supervisorSearch} onChange={(e) => setSupervisorSearch(e.target.value)} placeholder="Search supervisor name, email, department..." /></label>
        </div>
        {loadError ? <EmptyState title="Failed to load supervisor management data." text={loadError} icon={Users} /> : usersLoading ? <EmptyState title="Loading users..." text="Please wait while the user list loads." icon={Users} /> : supervisors.length === 0 ? <EmptyState title="No supervisors found." text="Create or approve supervisor accounts first." icon={UserCog} /> : filteredStudents.length ? (
          <div className="managed-list compact-managed-list supervisor-management-list">
            {filteredStudents.map((student) => {
              const assigned = getAssignedSupervisor(student)
              const project = getStudentProject(student)
              const selectedValue = Object.prototype.hasOwnProperty.call(studentSupervisorSelections, student.id) ? studentSupervisorSelections[student.id] : assigned?.id || ''
              const assignKey = `student-supervisor-assign-${student.id}`
              const removeKey = `student-supervisor-remove-${student.id}`
              const isAssigned = Boolean(assigned?.id || assigned?.email || assigned?.full_name)
              return (
                <div className="mini-card managed-item supervisor-management-row" key={student.id}>
                  <div className="supervisor-management-record-main">
                    <b>{student.full_name || 'Unnamed student'}</b>
                    <p>{student.email || 'No email available'}</p>
                    <p className="small muted">Department/program: <b>{getUserDepartment(student)}</b></p>
                    <p className="small muted">Research group/project: <b>{project?.group_name || project?.title || 'Not assigned'}</b>{project?.title && project?.group_name ? ` • ${project.title}` : ''}</p>
                    <p className="small muted">Current supervisor: <b>{assigned?.full_name || 'Not assigned'}</b>{assigned?.email ? ` • ${assigned.email}` : ''}</p>
                    <Pill tone={isAssigned ? 'green' : 'amber'}>{isAssigned ? 'Assigned' : 'Not Assigned'}</Pill>
                  </div>
                  <div className="supervisor-management-actions">
                    <label className="field compact-field">
                      <span>Supervisor</span>
                      <select value={selectedValue} disabled={Boolean(actionLoading)} onChange={(e) => setStudentSupervisorSelections((current) => ({ ...current, [student.id]: e.target.value }))}>
                        <option value="">Choose supervisor</option>
                        {filteredSupervisorOptions.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.full_name || supervisor.email}{supervisor.email ? ` — ${supervisor.email}` : ''}</option>)}
                      </select>
                    </label>
                    <button className="secondary compact-button min-button-width" disabled={Boolean(actionLoading) || !selectedValue} onClick={() => runSupervisorAction(assignKey, () => handleStudentSupervisorAssign(student.id))}><ButtonContent loading={actionLoading === assignKey} loadingText="Assigning..." icon={UserPlus} iconSize={14}>Assign Supervisor</ButtonContent></button>
                    <button className="warning compact-button min-button-width" disabled={Boolean(actionLoading) || !isAssigned} onClick={() => runSupervisorAction(removeKey, () => handleStudentSupervisorRemove(student.id))}><ButtonContent loading={actionLoading === removeKey} loadingText="Removing..." icon={XCircle} iconSize={14}>Remove Supervisor</ButtonContent></button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : <EmptyState title="No students found." text="Try another student name, email, supervisor, department, or project keyword." icon={Search} />}
        {supervisors.length > 0 && filteredSupervisorOptions.length === 0 && <EmptyState title="No supervisors found." text="Try another supervisor search keyword." icon={Search} />}
      </div>

      <div className="card supervisor-management-card admin-assignment-card">
        <SectionHeader icon={UserCog} title="Project Supervisor Assignment" subtitle="Assign, change, or remove supervisors for submitted research titles" />
        <div className="supervisor-management-controls">
          <label className="field"><span>Search projects</span><input value={projectAssignmentSearch} onChange={(e) => setProjectAssignmentSearch(e.target.value)} placeholder="Search students, supervisors, projects, or research groups..." /></label>
          <label className="field"><span>Choose supervisor</span><select value={projectSupervisorId} onChange={(e) => setProjectSupervisorId(e.target.value)}><option value="">Pending Assignment / remove supervisor</option>{supervisors.map((supervisor) => <option key={supervisor.id} value={supervisor.id}>{supervisor.full_name || supervisor.email}</option>)}</select></label>
        </div>
        <div className="managed-list compact-managed-list admin-project-assignment-list supervisor-management-list">
          {projects.length ? (filteredAssignmentProjects.length ? filteredAssignmentProjects.map((project) => (
            <div className="mini-card managed-item supervisor-management-row" key={project.id}>
              <div className="supervisor-management-record-main">
                <b>{project.group_name || 'Research Group'}</b>
                <p>{project.title || 'Untitled project'}</p>
                <p className="small muted">Student/member: {project.student_email || project.created_by_email || getProjectStudents(project).join(', ') || 'Not linked'}</p>
                <p className="small muted">Current supervisor: <b>{project.supervisor_name || 'Pending Assignment'}</b>{project.supervisor_email ? ` • ${project.supervisor_email}` : ''}</p>
              </div>
              <div className="stacked-actions supervisor-management-actions">
                <button className="secondary compact-button min-button-width" disabled={Boolean(actionLoading)} onClick={() => runSupervisorAction(`project-assign-${project.id}`, () => handleProjectSupervisorAssign(project.id))}><ButtonContent loading={actionLoading === `project-assign-${project.id}`} loadingText="Assigning..." icon={UserCog} iconSize={14}>Assign Supervisor</ButtonContent></button>
                <button className="warning compact-button min-button-width" disabled={Boolean(actionLoading)} onClick={() => runSupervisorAction(`project-unassign-${project.id}`, () => handleProjectSupervisorRemove(project.id))}><ButtonContent loading={actionLoading === `project-unassign-${project.id}`} loadingText="Removing..." icon={XCircle} iconSize={14}>Remove Supervisor</ButtonContent></button>
              </div>
            </div>
          )) : <EmptyState title="No projects found." text="Try another student, supervisor, project, research group, or department keyword." icon={Search} />) : <EmptyState title="No projects found." text="Project assignments appear after supervisors submit projects." icon={BookOpen} />}
        </div>
        {exportCsv && <button className="primary" onClick={exportCsv}><Download size={16} /> Export CSV Report</button>}
      </div>

      <div className="card supervisor-management-card project-leader-management-card">
        <SectionHeader icon={UserPlus} title="Project Leader Assignment" subtitle="Choose one student member as Research Project Leader for each group/project" />
        <div className="supervisor-management-controls">
          <label className="field wide-field"><span>Search research group/project</span><input value={leaderSearch} onChange={(e) => setLeaderSearch(e.target.value)} placeholder="Search project title, group, supervisor, leader, or member..." /></label>
        </div>
        {projects.length ? (filteredLeaderProjects.length ? (
          <div className="project-leader-grid supervisor-management-leader-grid">
            {filteredLeaderProjects.map((project) => {
              const members = getProjectMembersWithoutSupervisor(data, project, data.reports)
              const leader = getProjectLeaderProfile(data, project)
              const leaderKey = `leader-assign-${project.id}`
              const selectedLeader = Object.prototype.hasOwnProperty.call(leaderSelections, project.id) ? leaderSelections[project.id] : leader?.id || ''
              return (
                <div className="soft-box project-leader-card supervisor-leader-card" key={project.id}>
                  <div className="split supervisor-leader-header">
                    <div>
                      <h3>{project.title || 'Untitled project'}</h3>
                      <p className="muted small">Group: {project.group_name || 'Research Group'} • Supervisor: {project.supervisor_name || 'Pending Assignment'}</p>
                      <p className="muted small">Current Project Leader: <b>{leader?.full_name || leader?.email || 'Not assigned yet'}</b></p>
                    </div>
                    <Pill tone={getProjectDecisionTone(project)}>{getProjectDecisionLabel(project)}</Pill>
                  </div>
                  <div className="supervisor-project-member-list">
                    <b>Project members</b>
                    {members.length ? members.map((member) => {
                      const isLeader = String(member.id || '') === String(leader?.id || '') || normalizeText(member.email) === normalizeText(leader?.email) || member.roleStatus === 'Project Leader'
                      return (
                        <div className="supervisor-project-member-row" key={member.id || member.email || member.full_name}>
                          <div>
                            <b>{member.full_name || member.email || 'Student'}</b>
                            <p className="small muted">{member.email || 'No email'}{member.joined_at ? ` • Joined ${String(member.joined_at).slice(0, 10)}` : ''}</p>
                          </div>
                          <Pill tone={isLeader ? 'blue' : 'slate'} className={isLeader ? 'project-leader-badge' : ''}>{isLeader ? 'Project Leader' : 'Member'}</Pill>
                        </div>
                      )
                    }) : <EmptyState title="No project members found." text="Only students who are already project/group members can become Project Leader." icon={Users} />}
                  </div>
                  <div className="project-leader-controls supervisor-management-leader-controls">
                    <label className="field">
                      <span>Select Project Leader</span>
                      <select value={selectedLeader} disabled={Boolean(actionLoading) || !members.length} onChange={(e) => setLeaderSelections((current) => ({ ...current, [project.id]: e.target.value }))}>
                        <option value="">Choose a student member</option>
                        {members.map((member) => <option key={member.id || member.email} value={member.id || ''} disabled={!member.id}>{member.full_name || member.email}{member.email ? ` — ${member.email}` : ''}</option>)}
                      </select>
                    </label>
                    <button className="primary min-button-width" type="button" disabled={Boolean(actionLoading) || !selectedLeader || !members.length} onClick={() => runSupervisorAction(leaderKey, () => handleAssignProjectLeader(project.id))}>
                      <ButtonContent loading={actionLoading === leaderKey} loadingText="Assigning leader..." icon={UserPlus}>Assign Project Leader</ButtonContent>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : <EmptyState title="No projects found." text="Try another project, group, supervisor, leader, or member keyword." icon={Search} />) : <EmptyState title="No projects found." text="Research groups/projects appear here after submission." icon={BookOpen} />}
      </div>
    </div>
  )
}

function AdminResearchWorkspace({ data = emptyData, projects = [], currentUser, loadError = '', dataLoading = false, updateProject, updateUserRole, updateUserStatus, assignStudentToSupervisor, exportCsv, deleteWeeklyReport, deleteUploadedFile, deleteUserAccount, deleteResearchGroup, deleteResearchProject, heroSettings = defaultWebsiteSettings, onNavigate }) {
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
    groupJoinRequests: Array.isArray(data?.groupJoinRequests) ? data.groupJoinRequests : [],
    groupMembers: Array.isArray(data?.groupMembers) ? data.groupMembers : [],
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
  const [assignmentSearch, setAssignmentSearch] = useState('')
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
      ? 'Search, filter, change roles, update account status, and delete accounts.'
      : 'Review rejected accounts and restore them if needed.'

  const researchGroups = getProjectGroupSummaries(projects)
  const selectedProjectSupervisor = supervisors.find((supervisor) => String(supervisor.id) === String(projectSupervisorId))
  const assignmentQuery = assignmentSearch.trim().toLowerCase()
  const getProjectAssignedStudent = (project) => students.find((student) =>
    String(project.student_id || project.created_by || '') === String(student.id) ||
    normalizeText(project.student_email || project.created_by_email) === normalizeText(student.email) ||
    getProjectStudents(project).map(normalizeText).includes(normalizeText(student.full_name))
  )
  const filteredAssignmentProjects = projects.filter((project) => {
    if (!assignmentQuery) return true
    const student = getProjectAssignedStudent(project)
    const supervisor = supervisors.find((item) =>
      String(item.id) === String(project.supervisor_id) ||
      normalizeText(item.email) === normalizeText(project.supervisor_email) ||
      normalizeText(item.full_name) === normalizeText(project.supervisor_name)
    )
    const searchable = [
      project.title,
      project.group_name,
      project.area,
      project.department,
      project.student_email,
      project.created_by_email,
      project.supervisor_name,
      project.supervisor_email,
      getProjectStudents(project).join(' '),
      student?.full_name,
      student?.email,
      getUserDepartment(student || {}),
      supervisor?.full_name,
      supervisor?.email,
    ].join(' ').toLowerCase()
    return searchable.includes(assignmentQuery)
  })

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
      <button className="danger compact-button delete-item-button admin-panel-delete-button min-button-width" type="button" disabled={Boolean(adminActionLoading)} onClick={() => runAdminAction(itemKey, onDelete)}>
        <ButtonContent loading={loading} loadingText="Deleting..." icon={Trash2} iconSize={14}>{label}</ButtonContent>
      </button>
    )
  }

  async function handleProjectSupervisorAssign(projectId) {
    const supervisor = selectedProjectSupervisor
    const project = projects.find((item) => String(item.id) === String(projectId))
    const student = project ? getProjectAssignedStudent(project) : null

    if (student?.id && assignStudentToSupervisor) {
      await assignStudentToSupervisor(student.id, supervisor?.id || '', { projectId })
      return
    }

    await updateProject(projectId, {
      supervisor_name: supervisor?.full_name || 'Pending Assignment',
      supervisor_id: supervisor?.id || null,
      supervisor_email: supervisor?.email || '',
    })
  }

  async function handleProjectSupervisorRemove(projectId) {
    const project = projects.find((item) => String(item.id) === String(projectId))
    const student = project ? getProjectAssignedStudent(project) : null

    if (student?.id && assignStudentToSupervisor) {
      await assignStudentToSupervisor(student.id, '', { projectId })
      return
    }

    await updateProject(projectId, {
      supervisor_name: 'Pending Assignment',
      supervisor_id: null,
      supervisor_email: '',
    })
  }

  if (dataLoading) return <LoadingBlock text="Loading users..." />

  return (
    <div className="admin-dashboard-grid full-admin-dashboard-grid">
      <div className="card admin-user-management-card admin-users-and-roles-card">
        <SectionHeader icon={Users} title="Users and Roles" subtitle="Approve users, manage account roles/status, and delete accounts" />

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
            return (
              <div className="mini-card user-role-row admin-pending-user-request admin-user-role-management-row" key={u.id}>
                <div className="admin-pending-user-info">
                  <b>{u.full_name || 'Unnamed user'}</b>
                  <p>{u.email || 'No email available'}</p>
                  <p className="small muted">Role: <b>{requestedRoleLabel}</b> • Status: <b>{u.status || 'Pending'}</b></p>
                  <p className="small muted">Department: <b>{department}</b></p>
                  <p className="small muted">Submitted: <b>{submittedAt}</b></p>
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


                  {userTab === 'pending' && !isCurrentAdmin && <button className="success compact-button min-button-width" disabled={Boolean(adminActionLoading)} onClick={() => runAdminAction(`accept-${u.id}`, () => updateUserStatus(u.id, 'Active'))}><ButtonContent loading={adminActionLoading === `accept-${u.id}`} loadingText="Accepting..." icon={CheckCircle2} iconSize={14}>Accept</ButtonContent></button>}
                  {userTab === 'pending' && !isCurrentAdmin && <button className="danger compact-button min-button-width" disabled={Boolean(adminActionLoading)} onClick={() => runAdminAction(`reject-${u.id}`, () => updateUserStatus(u.id, 'Rejected'))}><ButtonContent loading={adminActionLoading === `reject-${u.id}`} loadingText="Rejecting..." icon={XCircle} iconSize={14}>Reject</ButtonContent></button>}
                  {userTab === 'rejected' && !isCurrentAdmin && <button className="warning compact-button min-button-width" disabled={Boolean(adminActionLoading)} onClick={() => runAdminAction(`pending-${u.id}`, () => updateUserStatus(u.id, 'Pending'))}><ButtonContent loading={adminActionLoading === `pending-${u.id}`} loadingText="Updating..." icon={RefreshCw} iconSize={14}>Move to Pending</ButtonContent></button>}
                  {userTab === 'rejected' && !isCurrentAdmin && <button className="success compact-button min-button-width" disabled={Boolean(adminActionLoading)} onClick={() => runAdminAction(`accept-${u.id}`, () => updateUserStatus(u.id, 'Active'))}><ButtonContent loading={adminActionLoading === `accept-${u.id}`} loadingText="Accepting..." icon={CheckCircle2} iconSize={14}>Accept</ButtonContent></button>}
                  {canDeleteUserAccount(u, currentUser) && deleteUserAccount && (
                    <AdminPanelDeleteButton itemKey={`user-${u.id}`} label="Delete Account" onDelete={() => deleteUserAccount(u.id)} />
                  )}
                </div>
              </div>
            )
          }) : <EmptyState title="No users found." text="Try changing the search/filter settings or wait for users to register." icon={Users} />}
        </div>
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
                    <p className="small muted">Group: {project.group_name || 'N/A'} • Department: {project.area || 'N/A'}</p>
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
                  <p className="small muted">Group: {project.group_name || 'N/A'} • Supervisor: {project.supervisor_name || 'Pending Assignment'}</p>
                  <p className="small muted">Status: {project.status || 'Pending'} • Last update: {String(project.updated_at || project.created_at || '').slice(0, 10) || 'N/A'}</p>
                  <ProjectMembersCompact members={getProjectMembersWithoutSupervisor(data, project, data.reports)} />
                </div>
                <div className="admin-progress-inline">
                  <span>{formatProgress(getProjectProgress(project, data.reports))}%</span>
                  <ProgressBar value={getProjectProgress(project, data.reports)} />
                </div>
              </div>
            )) : <EmptyState title="No project progress" text="Project progress will appear after research titles are submitted." icon={CheckCircle2} />}
          </div>
        </div>

        <div className="card admin-delete-management-card admin-report-deletion-card">
          <SectionHeader icon={Trash2} title="Report Deletion" subtitle="Admins can delete any weekly report" />
          <div className="managed-list admin-scrollable-delete-list">
            {data.reports.length ? data.reports.map((report) => {
              const project = data.projects.find((p) => String(p.id) === String(report.project_id))
              return (
                <div className="mini-card managed-item admin-report-delete-item" key={report.id}>
                  <div>
                    <b>Week {report.week_number || 'N/A'} — {project?.title || report.title || 'Weekly Report'}</b>
                    <p className="small muted">Student: {report.submitted_by || report.student_email || report.created_by_email || 'Unknown student'}</p>
                    <p className="small muted">Submitted date: {String(report.submitted_at || report.created_at || '').slice(0, 10) || 'N/A'} • Status: {report.status || 'Submitted'}</p>
                  </div>
                  {canDeleteReport(report, currentUser) && deleteWeeklyReport && <AdminPanelDeleteButton itemKey={`report-${report.id}`} label="Delete Report" onDelete={() => deleteWeeklyReport(report.id)} />}
                </div>
              )
            }) : <EmptyState title="No reports available." text="Submitted weekly reports will appear here." icon={MessageSquareText} />}
          </div>
        </div>

        <div className="card admin-delete-management-card admin-uploaded-document-card">
          <SectionHeader icon={FileText} title="Uploaded Document Deletion" subtitle="Admins can delete any uploaded file" />
          <div className="managed-list admin-scrollable-delete-list">
            {data.uploadedFiles.length ? data.uploadedFiles.map((file) => {
              const report = data.reports.find((item) => String(item.id) === String(file.report_id))
              const project = data.projects.find((item) => String(item.id) === String(file.project_id || report?.project_id))
              const uploadedBy = file.uploaded_by_email || file.created_by_email || report?.student_email || report?.submitted_by || 'Unknown user'
              return (
                <div className="mini-card managed-item admin-document-delete-item" key={file.id}>
                  <div>
                    <b>{file.file_name || 'Uploaded document'}</b>
                    <p className="small muted">Uploaded by: {uploadedBy} • Uploaded date: {String(file.created_at || '').slice(0, 10) || 'N/A'}</p>
                    <p className="small muted">Related: {project?.title || project?.group_name || `Week ${report?.week_number || 'N/A'}`} • {file.file_type || 'Document'}</p>
                    <ReportAttachmentBox attachment={file} canDelete={canDeleteUploadedFile(file, currentUser, data.reports)} onDelete={() => deleteUploadedFile(file.id)} />
                  </div>
                </div>
              )
            }) : <EmptyState title="No uploaded documents available." text="Uploaded documents will appear here." icon={FileText} />}
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

function ProjectDecisionTable({ projects, updateProject, data = emptyData, reports = [] }) {
  const [decisionLoading, setDecisionLoading] = useState('')

  async function runDecision(projectId, decision) {
    const key = `${projectId}-${decision}`
    if (decisionLoading) return
    const project = projects.find((item) => String(item.id) === String(projectId)) || {}
    if (isProjectCommitteeDecided(project)) {
      await showAppAlert('This title submission has already received a final decision.', { title: 'Final Decision Already Saved', type: 'info' })
      return
    }
    let comment = ''
    if (decision !== 'Approved') {
      comment = (await showAppPrompt(decision === 'Revision Required' ? 'Write revision request/comment for the supervisor:' : 'Write rejection reason/comment for the supervisor:', project.committee_comments || '', { title: decision === 'Revision Required' ? 'Revision Comment' : 'Rejection Reason', confirmLabel: 'Save Comment' })) || ''
    } else {
      comment = (await showAppPrompt('Optional acceptance comment for the supervisor:', project.committee_comments || '', { title: 'Acceptance Comment', confirmLabel: 'Save Comment' })) || ''
    }
    const fields = {
      approval: decision,
      status: decision === 'Approved' ? 'Ongoing' : decision === 'Rejected' ? 'Rejected' : 'Needs Attention',
      committee_comments: comment.trim(),
      decision_message: comment.trim(),
    }
    setDecisionLoading(key)
    try {
      await updateProject(projectId, fields)
    } finally {
      setDecisionLoading('')
    }
  }

  return (
    <div className="table-wrap"><table><thead><tr><th>Supervisor project</th><th>Department</th><th>Members</th><th>Progress</th><th>Committee decision</th></tr></thead><tbody>{projects.map((p) => {
      const approvedKey = `${p.id}-Approved`
      const reviseKey = `${p.id}-Revision Required`
      const rejectKey = `${p.id}-Rejected`
      const decided = isProjectCommitteeDecided(p)
      const comment = p.committee_comments || p.decision_message || p.admin_comment || ''
      return (
        <tr key={p.id}>
          <td><b>{p.group_name || 'Research Group'}</b><p>{p.title}</p><p className="muted small">Supervisor: {p.supervisor_name || p.supervisor_email || 'Not assigned'}{p.submitted_at ? ` • Submitted ${new Date(p.submitted_at).toLocaleDateString()}` : ''}</p></td>
          <td>{p.area}</td>
          <td><ProjectMembersCompact members={getProjectMembersWithoutSupervisor(data, p, reports)} /></td>
          <td><ProgressBar value={getProjectProgress(p, reports)} /><p className="small muted">{formatProgress(getProjectProgress(p, reports))}%</p></td>
          <td className="project-decision-cell">
            {decided ? (
              <div className="project-decision-status">
                <Pill tone={getProjectDecisionTone(p)}>{getProjectDecisionLabel(p)}</Pill>
                {comment && <p className="muted small">Comment: {comment}</p>}
              </div>
            ) : (
              <div className="project-decision-status">
                <div className="inline-actions decision-actions committee-decision-actions">
                  <button className="committee-decision-btn committee-accept-btn accept-btn approve-btn decision-btn min-button-width" disabled={Boolean(decisionLoading)} onClick={() => runDecision(p.id, 'Approved')}><ButtonContent loading={decisionLoading === approvedKey} loadingText="Accepting..." icon={CheckCircle2}>Accept</ButtonContent></button>
                  <button className="committee-decision-btn committee-revision-btn revision-btn decision-btn min-button-width" disabled={Boolean(decisionLoading)} onClick={() => runDecision(p.id, 'Revision Required')}><ButtonContent loading={decisionLoading === reviseKey} loadingText="Requesting..." icon={RefreshCw}>Revision</ButtonContent></button>
                  <button className="committee-decision-btn committee-reject-btn reject-btn danger-btn min-button-width" disabled={Boolean(decisionLoading)} onClick={() => runDecision(p.id, 'Rejected')}><ButtonContent loading={decisionLoading === rejectKey} loadingText="Rejecting..." icon={XCircle}>Reject</ButtonContent></button>
                </div>
                <Pill tone={getProjectDecisionTone(p)}>{getProjectDecisionLabel(p)}</Pill>
                {comment && <p className="muted small">Comment: {comment}</p>}
              </div>
            )}
          </td>
        </tr>
      )
    })}</tbody></table></div>
  )
}


function NotificationsTab({ data, role, currentUser, dataLoading = false, createNotification, markNotificationRead, removeNotification }) {
  const [form, setForm] = useState({ title: '', message: '', type: 'Reminder', target_role: 'all' })
  const [removingNotificationId, setRemovingNotificationId] = useState('')
  const [readingNotificationId, setReadingNotificationId] = useState('')
  const [creatingNotification, setCreatingNotification] = useState(false)
  const visibleNotifications = data.notifications.filter((n) => notificationForUser(n, currentUser, role))

  async function handleRemoveNotification(notificationId) {
    if (removingNotificationId) return
    if (!(await showAppConfirm('Are you sure you want to delete this inbox message?', { title: 'Delete Inbox Message', type: 'danger', confirmLabel: 'Delete' }))) return
    setRemovingNotificationId(notificationId)
    try {
      await removeNotification(notificationId)
    } finally {
      setRemovingNotificationId('')
    }
  }


  async function handleMarkNotificationRead(notificationId) {
    if (readingNotificationId || removingNotificationId) return
    setReadingNotificationId(notificationId)
    try {
      await markNotificationRead(notificationId)
    } finally {
      setReadingNotificationId('')
    }
  }

  async function handleCreateNotification() {
    if (creatingNotification) return
    setCreatingNotification(true)
    try {
      const result = await createNotification(form)
      if (result?.ok !== false) setForm({ title: '', message: '', type: 'Reminder', target_role: 'all' })
    } finally {
      setCreatingNotification(false)
    }
  }

  if (dataLoading) return <LoadingBlock text="Loading inbox messages..." />

  return (
    <div className="grid two-one">
      <div className="card">
        <SectionHeader icon={Inbox} title="Inbox and Reminders" subtitle="Deadline reminders and admin messages" />
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
                    <button type="button" className="min-button-width notification-read-button" onClick={() => handleMarkNotificationRead(n.id)} disabled={removing || Boolean(readingNotificationId) || n.is_read}><ButtonContent loading={String(readingNotificationId) === String(n.id)} loadingText="Updating...">{n.is_read ? 'Read' : 'Mark read'}</ButtonContent></button>
                    <button type="button" className="danger compact-button notification-delete-button" onClick={() => handleRemoveNotification(n.id)} disabled={removing}>
                      <ButtonContent loading={removing} loadingText="Removing..." icon={Trash2} iconSize={14}>Remove</ButtonContent>
                    </button>
                  </div>
                </div>
              </div>
            )
          }) : <EmptyState title="No inbox messages" text="Admin-created inbox messages will appear here." icon={Inbox} />}
        </div>
      </div>
      {['admin', 'committee'].includes(role) ? (
        <div className="card no-print">
          <SectionHeader icon={Inbox} title="Create Inbox Message" subtitle="For admin or committee reminders" />
          <label className="field"><span>Title</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Example: Submit weekly report" /></label>
          <label className="field"><span>Message</span><textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Write reminder message" /></label>
          <label className="field"><span>Type</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Reminder</option><option>Feedback</option><option>Warning</option><option>Announcement</option></select></label>
          <label className="field"><span>Target role</span><select value={form.target_role} onChange={(e) => setForm({ ...form, target_role: e.target.value })}><option value="all">All users</option><option value="student">Students</option><option value="supervisor">Supervisors</option><option value="committee">Research Committee</option><option value="admin">Admins</option></select></label>
          <button className="primary min-button-width" disabled={creatingNotification} onClick={handleCreateNotification}><ButtonContent loading={creatingNotification} loadingText="Creating..." icon={Inbox}>Create Inbox Message</ButtonContent></button>
        </div>
      ) : (
        <div className="card no-print">
          <SectionHeader icon={Lock} title="Inbox Message Creation Locked" subtitle="Only Admin and Research Committee accounts can create reminders" />
          <p className="muted">Your account can read reminders sent to your role, but it cannot create new system-wide inbox messages.</p>
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
function ReportsTab({ data, projects, currentUser, role, printPdfReport, exportCsv, pdfReportSettings = defaultPdfReportSettings, dataLoading = false }) {
  const settings = normalizePdfReportSettings(pdfReportSettings)
  const generatedAt = new Date()
  const generatedLabel = generatedAt.toLocaleString()
  const [selectedSupervisorKey, setSelectedSupervisorKey] = useState('all')
  const [selectedStudentKey, setSelectedStudentKey] = useState(role === 'student' ? makeStudentOptionKey({ id: currentUser?.id, email: currentUser?.email, name: currentUser?.full_name }) : 'all')
  const [supervisorSearch, setSupervisorSearch] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [reportFilters, setReportFilters] = useState({ group: 'All', title: '', progress: 'All', evaluation: 'All' })
  const [printMessage, setPrintMessage] = useState('')
  const [printingReport, setPrintingReport] = useState(false)
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
    if (role === 'student') {
      const studentProfile = findProfileForUser(data, currentUser) || currentUser
      const contextProject = getStudentCurrentResearchGroup(data, studentProfile)
      return projectFilteredProjects.filter((project) =>
        isOwnStudentProject(project, studentProfile) ||
        projectMatchesStudentOption(project, studentProfile, allReports) ||
        (!!contextProject?.id && String(project.id) === String(contextProject.id))
      )
    }
    if (selectedStudentKey === 'all') return projectFilteredProjects
    if (!selectedStudent) return []
    return projectFilteredProjects.filter((project) => projectMatchesStudentOption(project, selectedStudent, allReports))
  }, [role, projectFilteredProjects, selectedStudentKey, selectedStudent, allReports, currentUser, data])

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
      if (role === 'student') return deadlineVisibleToUser(deadline, 'student', currentUser, data)
      if (selectedStudentKey !== 'all' && selectedStudent) {
        const selectedProjects = studentFilteredProjects || []
        return !hasDeadlineTargets(deadline) || deadlineTargetsStudentOption(deadline, selectedStudent) || selectedProjects.some((project) => deadlineLinkedToProject(deadline, project))
      }
      if (role === 'supervisor') return deadlineVisibleToUser(deadline, 'supervisor', currentUser, data)
      return true
    })
  }, [allDeadlines, role, currentUser, selectedStudentKey, selectedStudent, data, studentFilteredProjects])

  const scopedEvaluations = useMemo(() => allEvaluations.filter((evaluation) => selectedProjectIds.has(String(evaluation.project_id))), [allEvaluations, selectedProjectIds])
  const scopedStudents = useMemo(() => {
    if (role === 'student') return [studentOptionToProfile({ id: currentUser?.id, email: currentUser?.email, name: currentUser?.full_name })]
    if (selectedStudentKey !== 'all' && selectedStudent) return [studentOptionToProfile(selectedStudent)]
    return selectableStudentOptions.map(studentOptionToProfile)
  }, [role, currentUser, selectedStudentKey, selectedStudent, selectableStudentOptions])
  const studentAssignedSupervisor = useMemo(() => role === 'student' ? findAssignedSupervisorForStudent(data, currentUser) : null, [role, data, currentUser])
  const scopedSupervisors = useMemo(() => {
    if (role === 'student') return studentAssignedSupervisor ? [studentAssignedSupervisor] : []
    if (role === 'supervisor') return [currentUser]
    if (!isAdminLike) return []
    if (selectedSupervisorKey === 'all') return supervisorOptions
    return supervisorOptions.filter((supervisor) => supervisor.key === selectedSupervisorKey)
  }, [role, currentUser, isAdminLike, selectedSupervisorKey, supervisorOptions, studentAssignedSupervisor])

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
    if (printingReport) return
    setPrintingReport(true)
    try {
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
    } finally {
      window.setTimeout(() => setPrintingReport(false), 500)
    }
  }

  if (dataLoading) return <LoadingBlock text="Loading reports..." />

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
        <div className="action-row report-actions"><button className="primary min-button-width" disabled={printingReport} onClick={handlePrint}><ButtonContent loading={printingReport} loadingText="Preparing..." icon={Printer}>Print / Save as PDF</ButtonContent></button><button className="secondary" onClick={exportCsv}><Download size={16} /> Export CSV</button></div>
      </div>

      <div className="card print-report pdf-report-template">
        <div className="report-header pdf-report-header">
          {settings.showLogo !== false && settings.logoUrl ? <img className="pdf-report-logo" src={settings.logoUrl} alt="Report logo" /> : null}
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
            role === 'student' ? (
              <ReportTable><thead><tr><th>Supervisor</th><th>Email</th><th>Department/program</th><th>Assigned date</th><th>Research group/title</th></tr></thead><tbody>{scopedSupervisors.map((supervisor) => { const studentProfile = findProfileForUser(data, currentUser) || currentUser; const assignedProject = studentFilteredProjects.find((project) => findSupervisorProfileForProject(data, project)); return <tr key={supervisor.id || supervisor.email || supervisor.full_name}><td>{supervisor.full_name || supervisor.name || 'Supervisor'}</td><td>{supervisor.email || '-'}</td><td>{supervisor.department || studentProfile?.department || assignedProject?.area || '-'}</td><td>{studentProfile?.assigned_supervisor_assigned_at ? new Date(studentProfile.assigned_supervisor_assigned_at).toLocaleDateString() : (assignedProject?.created_at ? new Date(assignedProject.created_at).toLocaleDateString() : '-')}</td><td>{assignedProject ? `${assignedProject.group_name || 'Research group'} — ${assignedProject.title || 'Untitled project'}` : getStudentResearchLabel({ id: currentUser?.id, email: currentUser?.email, name: currentUser?.full_name }, studentFilteredProjects, scopedReports)}</td></tr> })}</tbody></ReportTable>
            ) : (
              <ReportTable><thead><tr><th>Supervisor</th><th>Email</th><th>Assigned students</th><th>Assigned projects</th></tr></thead><tbody>{scopedSupervisors.map((supervisor) => { const supervisorProjects = role === 'supervisor' ? studentFilteredProjects : studentFilteredProjects.filter((project) => projectMatchesSupervisorOption(project, supervisor)); const assignedStudents = getAssignedSupervisorStudents(data, supervisorProjects, scopedReports); return <tr key={supervisor.id || supervisor.email || supervisor.key}><td>{supervisor.full_name || supervisor.name}</td><td>{supervisor.email || '-'}</td><td>{assignedStudents.length}</td><td>{supervisorProjects.length}</td></tr> })}</tbody></ReportTable>
            )
          ) : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="researchGroup" title="Research Group">
          {hasProjects ? <ReportTable><thead><tr><th>Group</th><th>Students</th><th>Supervisor</th><th>Status</th></tr></thead><tbody>{studentFilteredProjects.map((project) => <tr key={project.id}><td>{project.group_name || 'Research group'}</td><td>{getProjectStudents(project).join(', ') || project.student_email || '-'}</td><td>{project.supervisor_name || 'Pending Assignment'}</td><td>{getProjectDecisionLabel(project)}</td></tr>)}</tbody></ReportTable> : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="researchTitle" title="Research Title / Project">
          {hasProjects ? <ReportTable><thead><tr><th>Title</th><th>Department</th><th>Final due</th><th>Approval</th></tr></thead><tbody>{studentFilteredProjects.map((project) => <tr key={project.id}><td>{project.title}</td><td>{project.area || '-'}</td><td>{project.final_due || '-'}</td><td>{getProjectDecisionLabel(project)}</td></tr>)}</tbody></ReportTable> : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="weeklyReports" title="Weekly Reports">
          {scopedReports.length ? <ReportTable><thead><tr><th>Week</th><th>Project</th><th>Student</th><th>Status</th><th>Submitted</th></tr></thead><tbody>{scopedReports.map((report) => { const project = getReportProject({ ...data, projects: studentFilteredProjects }, report); return <tr key={report.id}><td>{report.week_number || '-'}</td><td>{project?.title || 'Weekly Report'}</td><td>{getReportStudentLabel(report, data)}</td><td>{report.status || 'Submitted'}</td><td>{report.submitted_at ? new Date(report.submitted_at).toLocaleDateString() : '-'}</td></tr> })}</tbody></ReportTable> : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="feedback" title="Feedback">
          {feedbackReports.length ? <ReportTable><thead><tr><th>Week</th><th>Project</th><th>Student</th><th>Feedback</th></tr></thead><tbody>{feedbackReports.map((report) => { const project = getReportProject({ ...data, projects: studentFilteredProjects }, report); return <tr key={report.id}><td>{report.week_number || '-'}</td><td>{project?.title || 'Weekly Report'}</td><td>{getReportStudentLabel(report, data)}</td><td className="compact-feedback-cell">{report.feedback || report.supervisor_feedback}</td></tr> })}</tbody></ReportTable> : <NoRecords />}
        </PdfReportSection>

        <PdfReportSection settings={settings} sectionKey="projectProgress" title="Project Progress">
          {hasProjects ? <ReportTable><thead><tr><th>Group</th><th>Title</th><th>Progress</th><th>Members</th><th>Status</th></tr></thead><tbody>{studentFilteredProjects.map((project) => { const members = getProjectMemberProfiles(data, project, scopedReports); return <tr key={project.id}><td>{project.group_name || '-'}</td><td>{project.title}</td><td>{formatProgress(getProjectProgress(project, scopedReports))}%</td><td>{members.length ? members.map((member) => member.full_name || member.email).join(', ') : 'No project members found.'}</td><td>{getProgressStatusLabel(project, scopedReports)}</td></tr> })}</tbody></ReportTable> : <NoRecords />}
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

function PdfReportCustomizationPanel({ settingsByRole = {}, globalSettings = defaultPdfReportSettings, updateSettings, uploadLogo, removeLogo, resetSettings, data, projects, currentUser, printPdfReport }) {
  const [selectedRole, setSelectedRole] = useState('student')
  const [draft, setDraft] = useState(() => getPdfReportSettingsForRole('student', settingsByRole, globalSettings))
  const [localMessage, setLocalMessage] = useState('')
  const [pdfActionLoading, setPdfActionLoading] = useState('')

  useEffect(() => {
    setPdfActionLoading('load-role-settings')
    setLocalMessage('Loading role PDF settings...')
    const timer = window.setTimeout(() => {
      setDraft(getPdfReportSettingsForRole(selectedRole, settingsByRole, globalSettings))
      setPdfActionLoading('')
      setLocalMessage('')
    }, 120)
    return () => window.clearTimeout(timer)
  }, [selectedRole, settingsByRole, globalSettings])

  const roleLabel = getPdfReportRoleLabel(selectedRole)

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function updateSection(sectionKey, value) {
    setDraft((current) => ({ ...current, sections: { ...current.sections, [sectionKey]: value } }))
  }

  async function runPdfAction(key, action) {
    if (pdfActionLoading) return
    setPdfActionLoading(key)
    try {
      await action()
    } finally {
      setPdfActionLoading('')
    }
  }

  async function saveDraft() {
    if (!String(draft.reportTitle || '').trim()) {
      setLocalMessage('Please write a report header/title text before saving.')
      return
    }
    setLocalMessage(`Saving role PDF settings for ${roleLabel}...`)
    const result = await updateSettings(draft, { role: selectedRole })
    setLocalMessage(result?.ok === false ? `Failed to save PDF settings for ${roleLabel}.` : `PDF settings for ${roleLabel} saved successfully.`)
  }

  async function saveChecklistDraft() {
    setLocalMessage('Saving checklist settings...')
    const result = await updateSettings(draft, { role: selectedRole })
    setLocalMessage(result?.ok === false ? `Failed to save PDF settings for ${roleLabel}.` : `Checklist PDF settings saved successfully for ${roleLabel}.`)
  }

  async function handleLogoUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || pdfActionLoading) return
    await runPdfAction('upload-logo', async () => {
      const result = await uploadLogo(file, { role: selectedRole })
      if (result?.logoUrl) {
        setDraft((current) => ({ ...current, logoUrl: result.logoUrl, logoPath: result.logoPath || '' }))
      }
    })
  }

  async function handleRemoveLogo() {
    await runPdfAction('remove-logo', async () => {
      await removeLogo({ role: selectedRole })
      setDraft((current) => ({ ...current, logoUrl: '', logoPath: '' }))
      setLocalMessage(`Logo removed from ${roleLabel} PDF settings.`)
    })
  }

  async function handleReset() {
    await runPdfAction('reset-pdf', async () => {
      await resetSettings({ role: selectedRole })
      setDraft(defaultPdfReportSettings)
      setLocalMessage(`${roleLabel} PDF settings reset to the default design.`)
    })
  }

  return (
    <div className="admin-panel-stack pdf-customization-page">
      <div className="card">
        <SectionHeader icon={FileText} title="PDF Report Customization" subtitle="Customize the existing Print/PDF Report template separately for each role" />
        {pdfActionLoading === 'load-role-settings' ? <LoadingBlock text="Loading role PDF settings..." /> : null}
        <div className="form-grid">
          <label className="field wide-field"><span>Report header/title text</span><input value={draft.reportTitle || ''} onChange={(e) => updateDraft('reportTitle', e.target.value)} placeholder="Pharmacy Research Project Management Report" /></label>
          <label className="field"><span>Header line</span><input value={draft.headerText || ''} onChange={(e) => updateDraft('headerText', e.target.value)} placeholder="Hawler Medical University – College of Pharmacy" /></label>
          <label className="field"><span>University name</span><input value={draft.universityName || ''} onChange={(e) => updateDraft('universityName', e.target.value)} placeholder="Hawler Medical University" /></label>
          <label className="field"><span>College name</span><input value={draft.collegeName || ''} onChange={(e) => updateDraft('collegeName', e.target.value)} placeholder="College of Pharmacy" /></label>
          <label className="field"><span>Department name</span><input value={draft.departmentName || ''} onChange={(e) => updateDraft('departmentName', e.target.value)} placeholder="Department of Pharmacy" /></label>
          <label className="field wide-field"><span>Footer text</span><textarea value={draft.footerText || ''} onChange={(e) => updateDraft('footerText', e.target.value)} placeholder="Optional footer text shown at the bottom of printed/PDF reports" /></label>
        </div>
        <div className="settings-actions">
          <button className="primary min-button-width" disabled={Boolean(pdfActionLoading)} onClick={() => runPdfAction('save-pdf', saveDraft)}><ButtonContent loading={pdfActionLoading === 'save-pdf'} loadingText="Saving role PDF settings..." icon={Save}>Save {roleLabel} PDF Settings</ButtonContent></button>
          <button className="secondary min-button-width" disabled={Boolean(pdfActionLoading)} onClick={handleReset}><ButtonContent loading={pdfActionLoading === 'reset-pdf'} loadingText="Resetting..." icon={RefreshCw}>Reset {roleLabel} Default</ButtonContent></button>
          <button className="secondary" onClick={printPdfReport}><Printer size={16} /> Preview by Print / Save as PDF</button>
        </div>
        {localMessage && <div className="message">{localMessage}</div>}
      </div>

      <div className="admin-split-layout">
        <div className="card">
          <SectionHeader icon={ImageIcon} title="Report Logo" subtitle={`Upload, replace, or remove the logo used in ${roleLabel} PDF reports`} />
          <label className="settings-toggle logo-toggle">
            <input type="checkbox" checked={draft.showLogo !== false} onChange={(e) => updateDraft('showLogo', e.target.checked)} />
            <span><b>Show logo</b><small>{draft.showLogo !== false ? 'Logo will appear when a logo URL exists.' : 'Logo is hidden for this role.'}</small></span>
          </label>
          <label className="field"><span>Logo URL</span><input value={draft.logoUrl || ''} onChange={(e) => updateDraft('logoUrl', e.target.value)} placeholder="Paste hosted logo URL or upload below" /></label>
          <label className="field"><span>Upload / replace logo</span><input type="file" accept="image/*" onChange={handleLogoUpload} /></label>
          {draft.showLogo !== false && draft.logoUrl ? <div className="pdf-logo-preview"><img src={draft.logoUrl} alt="PDF report logo preview" /></div> : <div className="pdf-logo-preview empty"><span>{draft.showLogo === false ? 'Logo hidden for this role' : 'No logo selected'}</span></div>}
          <div className="settings-actions">
            <button className="secondary min-button-width" disabled={Boolean(pdfActionLoading)} onClick={() => runPdfAction('save-logo', () => updateSettings({ ...draft, logoUrl: draft.logoUrl, logoPath: draft.logoPath || '' }, { role: selectedRole }))}><ButtonContent loading={pdfActionLoading === 'save-logo'} loadingText="Saving..." icon={Save}>Save Logo Setting</ButtonContent></button>
            <button className="danger min-button-width" disabled={Boolean(pdfActionLoading)} onClick={handleRemoveLogo}><ButtonContent loading={pdfActionLoading === 'remove-logo'} loadingText="Removing..." icon={Trash2}>Remove Logo</ButtonContent></button>
          </div>
          <div className="soft-box settings-note"><p>Uploaded logos use the existing Supabase Storage bucket <code>app-assets</code>. If storage is not configured, the logo still previews locally.</p></div>
        </div>

        <div className="card">
          <SectionHeader icon={Eye} title="Template Preview" subtitle={`Preview of the ${roleLabel} PDF template settings`} />
          <div className="pdf-template-preview">
            {draft.showLogo !== false && draft.logoUrl ? <img src={draft.logoUrl} alt="Logo preview" /> : <div className="preview-logo-placeholder">Logo</div>}
            <h4>{draft.headerText || defaultPdfReportSettings.headerText}</h4>
            <h3>{draft.reportTitle || defaultPdfReportSettings.reportTitle}</h3>
            <p>{[draft.universityName, draft.collegeName, draft.departmentName].filter(Boolean).join(' • ')}</p>
            <div className="preview-report-lines"><span /><span /><span /></div>
            {draft.footerText && <small>{draft.footerText}</small>}
          </div>
        </div>
      </div>

      <div className="card pdf-checklist-card">
        <SectionHeader icon={SlidersHorizontal} title="Show / Hide Report Sections" subtitle={`Control which sections appear in ${roleLabel} printed/PDF reports`} />
        <div className="form-grid pdf-role-selector-grid checklist-role-selector">
          <label className="field"><span>Customize PDF for Role</span><select value={selectedRole} onChange={(e) => { setSelectedRole(e.target.value); setLocalMessage('Loading role PDF settings...') }} disabled={Boolean(pdfActionLoading)}>{pdfReportRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <div className="soft-box settings-note wide-field"><p>These checklist settings apply only to the selected role and will not change other role PDF layouts.</p></div>
        </div>
        <div className="pdf-toggle-grid">
          {pdfReportSectionLabels.map(([key, label]) => (
            <label className="settings-toggle" key={key}>
              <input type="checkbox" checked={draft.sections[key] !== false} onChange={(e) => updateSection(key, e.target.checked)} />
              <span><b>{label}</b><small>{draft.sections[key] !== false ? `Shown in ${roleLabel} reports when data exists.` : `Hidden from ${roleLabel} reports.`}</small></span>
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
        <div className="settings-actions checklist-save-actions">
          <button className="primary min-button-width" disabled={Boolean(pdfActionLoading)} onClick={() => runPdfAction('save-checklist', saveChecklistDraft)}><ButtonContent loading={pdfActionLoading === 'save-checklist'} loadingText="Saving checklist settings..." icon={Save}>Save Checklist Settings</ButtonContent></button>
        </div>
        <div className="soft-box settings-note"><p>Students, supervisors, and research committee users cannot edit these settings; they only use the saved role-specific template when pressing the existing Print/PDF button.</p></div>
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
        <ProjectMembersCompact members={getProjectMembersWithoutSupervisor({ profiles: [], groupMembers: [] }, project, reports)} />
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

function AuditTab({ logs = [], dataLoading = false }) {
  const [search, setSearch] = useState('')
  const [actionType, setActionType] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const actionTypes = useMemo(() => ['all', ...Array.from(new Set((logs || []).map((log) => log.action_type || log.action).filter(Boolean)))], [logs])
  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (logs || []).filter((log) => {
      const logAction = log.action_type || log.action || ''
      const matchesAction = actionType === 'all' || logAction === actionType
      const matchesDate = !dateFilter || String(log.created_at || '').slice(0, 10) === dateFilter
      const haystack = [
        log.actor,
        log.actor_email,
        log.actor_role,
        log.action,
        log.action_type,
        log.entity,
        log.affected_entity,
        log.description,
        log.old_value,
        log.new_value,
      ].map((value) => typeof value === 'object' ? JSON.stringify(value) : String(value || '')).join(' ').toLowerCase()
      return matchesAction && matchesDate && (!q || haystack.includes(q))
    })
  }, [logs, search, actionType, dateFilter])

  return (
    <div className="card audit-log-card">
      <SectionHeader icon={ShieldCheck} title="Audit Log" subtitle="Records important admin and system actions" />
      <div className="form-grid audit-filter-grid">
        <label className="field wide-field"><span>Search audit logs</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actor, email, action, user, project, report, or details..." /></label>
        <label className="field"><span>Action type</span><select value={actionType} onChange={(e) => setActionType(e.target.value)}>{actionTypes.map((type) => <option key={type} value={type}>{type === 'all' ? 'All actions' : type}</option>)}</select></label>
        <label className="field"><span>Date</span><input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} /></label>
        <button className="secondary" type="button" onClick={() => { setSearch(''); setActionType('all'); setDateFilter('') }}>Reset</button>
      </div>
      {dataLoading ? <LoadingBlock text="Loading audit logs..." /> : filteredLogs.length ? (
        <div className="audit-log-list">
          {filteredLogs.map((log) => (
            <div className="mini-card audit-log-entry" key={log.id || `${log.actor}-${log.action}-${log.created_at}`}>
              <div className="split">
                <div>
                  <b>{log.action_type || log.action || 'action'}</b>
                  <p className="muted small">Actor: {log.actor || 'System'}{log.actor_email ? ` • ${log.actor_email}` : ''}{log.actor_role ? ` • ${getRoleLabel(log.actor_role)}` : ''}</p>
                  <p>{log.description || <>{log.actor || 'System'} {log.action || 'updated'} <b>{log.entity || log.affected_entity || 'record'}</b></>}</p>
                </div>
                <Pill tone="blue">{String(log.created_at || '').slice(0, 16).replace('T', ' ') || 'No date'}</Pill>
              </div>
              {(log.affected_entity || log.entity) && <p className="small muted">Affected: {log.affected_entity || log.entity}</p>}
              {(log.old_value || log.new_value) && <div className="audit-values"><p><b>Old:</b> {typeof log.old_value === 'object' ? JSON.stringify(log.old_value) : String(log.old_value || '-')}</p><p><b>New:</b> {typeof log.new_value === 'object' ? JSON.stringify(log.new_value) : String(log.new_value || '-')}</p></div>}
            </div>
          ))}
        </div>
      ) : <EmptyState title="No audit logs found." text="Important actions will appear here after users start using the platform or after changing the filters." icon={ShieldCheck} />}
    </div>
  )
}

// Base design tokens and utilities for WorkMesh AI

export const colors = {
  brand: {
    primary: '#0ea5e9',
    secondary: '#6366f1',
    accent: '#a78bfa',
  },
  surface: {
    base: '#0b0f19',
    card: 'rgba(17, 24, 39, 0.7)',
    elevated: 'rgba(31, 41, 55, 0.5)',
  },
  border: {
    default: 'rgba(255,255,255,0.07)',
    subtle: 'rgba(255,255,255,0.04)',
    active: 'rgba(14, 165, 233, 0.4)',
  },
  text: {
    primary: '#f1f5f9',
    secondary: '#94a3b8',
    muted: '#64748b',
  },
};

export const statusColors = {
  success: { bg: '#10b981', text: '#fff', subtle: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
  warning: { bg: '#f59e0b', text: '#fff', subtle: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
  error:   { bg: '#ef4444', text: '#fff', subtle: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)'   },
  info:    { bg: '#0ea5e9', text: '#fff', subtle: 'rgba(14,165,233,0.1)',  border: 'rgba(14,165,233,0.3)'  },
  neutral: { bg: '#6366f1', text: '#fff', subtle: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.3)' },
};

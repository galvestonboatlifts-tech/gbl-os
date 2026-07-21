import React from 'react'
import { statusTone } from '../lib/utils'

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal-card">
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose}>Close</button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  )
}

export function Field({ label, value, onChange, type = 'text', required = false, wide = false }) {
  return (
    <label className={wide ? 'span-2' : ''}>
      {label}
      {type === 'textarea' ? (
        <textarea value={value ?? ''} required={required} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} value={value ?? ''} required={required} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

export function SelectField({ label, value, onChange, options, required = false }) {
  return (
    <label>
      {label}
      <select value={value ?? ''} required={required} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  )
}

export function Badge({ children }) {
  return <span className={`badge ${statusTone(children)}`}>{children}</span>
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function Metric({ label, value }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>
}

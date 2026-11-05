import { useEffect, type ReactNode } from 'react'

export function Folha({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onFechar])
  return (
    <div className="fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="folha" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="linha entre">
          <h2>{titulo}</h2>
          <button className="btn mini" onClick={onFechar} aria-label="Fechar">Fechar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="campo">
      {rotulo}
      {children}
    </label>
  )
}

export const Icone = {
  inicio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
  ),
  escala: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>
  ),
  multas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  casa: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c3 .2 5 2.3 5 5.3" /></svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>
  ),
}

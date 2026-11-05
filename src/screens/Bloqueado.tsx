import { useApp } from '../lib/contexto'

export default function Bloqueado() {
  const app = useApp()
  return (
    <main className="centro">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet="/kivio-logo-app-escuro.svg" />
        <img className="logo" src="/kivio-logo-app-claro.svg" alt="Kivio Digital" />
      </picture>
      <div className="card" style={{ width: '100%' }}>
        <h2>Acesso suspenso</h2>
        <p>
          O acesso da república <b>{app.republica?.nome}</b> está suspenso. Isso costuma acontecer por mensalidade ou
          taxa em aberto. Fale com a Kivio Digital pelo WhatsApp para regularizar. Seus dados continuam guardados.
        </p>
      </div>
      <button className="btn" onClick={app.sair}>Sair da conta</button>
    </main>
  )
}

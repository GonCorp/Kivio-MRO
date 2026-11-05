function Em({ titulo, texto, itens }: { titulo: string; texto: string; itens: string[] }) {
  return (
    <>
      <h1>{titulo}</h1>
      <div className="card fase3-box">
        <span className="chip aviso" style={{ alignSelf: 'center' }}>Chega na Fase 3</span>
        <p>{texto}</p>
        <ul className="small muted" style={{ textAlign: 'left', margin: '0 auto', maxWidth: 420 }}>{itens.map((i) => <li key={i}>{i}</li>)}</ul>
      </div>
    </>
  )
}

export const Ingressos = () => (
  <Em titulo="Ingressos" texto="Depende do módulo de festas, que ainda não existe no app. Por isso não há o que mostrar aqui hoje."
    itens={['Festas criadas pelas repúblicas', 'Ingressos vendidos e conferidos na portaria', 'Repasse e taxa por ingresso']} />
)
export const Calendario = () => (
  <Em titulo="Calendário geral" texto="Reúne as festas de todas as repúblicas por região. Entra junto com o módulo de festas."
    itens={['Todas as festas por data e cidade', 'Aprovação e destaque de eventos', 'Visão para repúblicas do plano Completo']} />
)

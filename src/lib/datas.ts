// Datas sempre como texto "AAAA-MM-DD" no fuso de Brasília, para bater com o banco.
const fmtBR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })

export function hoje(): string {
  return fmtBR.format(new Date())
}

function parse(d: string): Date {
  const [a, m, dia] = d.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, dia))
}
function fmt(dt: Date): string {
  return dt.toISOString().slice(0, 10)
}

export function somarDias(d: string, n: number): string {
  const dt = parse(d)
  dt.setUTCDate(dt.getUTCDate() + n)
  return fmt(dt)
}

export function diaSemana(d: string): number {
  return parse(d).getUTCDay() // 0 = domingo
}

export function segundaDaSemana(d: string): string {
  const dow = diaSemana(d)
  return somarDias(d, dow === 0 ? -6 : 1 - dow)
}

export function primeiroDoMes(d: string): string {
  return d.slice(0, 8) + '01'
}

export function mesAnterior(d: string): string {
  const [a, m] = d.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 2, 1))
  return fmt(dt)
}
export function mesSeguinte(d: string): string {
  const [a, m] = d.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m, 1))
  return fmt(dt)
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export const nomeDia = (dow: number) => DIAS[dow]
export const nomeDiaCurto = (dow: number) => DIAS_CURTOS[dow]
export const dataCurta = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)
export function nomeMes(d: string): string {
  const m = Number(d.slice(5, 7)) - 1
  const nome = MESES[m]
  return nome.charAt(0).toUpperCase() + nome.slice(1) + ' de ' + d.slice(0, 4)
}

export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function diffDias(a: string, b: string): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86400000)
}
export const diasNoMes = (d: string) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate()
export const nomeDiaExtenso = (d: string) => DIAS[diaSemana(d)] + ', ' + dataCurta(d)

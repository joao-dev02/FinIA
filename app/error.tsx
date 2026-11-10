'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main style={{ margin: 0, padding: 40, width: '100%' }}><h1>Não foi possível abrir o painel.</h1><p>Tente novamente. Recarregar descarta os lançamentos demonstrativos.</p><button className="button" onClick={reset}>Tentar novamente</button></main>;
}

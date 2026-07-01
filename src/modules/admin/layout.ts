const ESTILO = `
  * { box-sizing: border-box; }
  body { margin:0; background:#0A0B0E; color:#f5f5f5; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  a { color:#f5f5f5; }
  .topo { display:flex; align-items:center; justify-content:space-between; padding:1rem 1.5rem; border-bottom:1px solid #23262e; }
  .topo b { font-size:1.05rem; }
  .conteudo { max-width:960px; margin:0 auto; padding:1.5rem; }
  .card { background:#15171c; border:1px solid #23262e; border-radius:16px; padding:1.5rem; margin-bottom:1.25rem; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:1rem; }
  .kpi { font-size:1.8rem; font-weight:700; }
  .kpi-label { color:#9ca3af; font-size:.85rem; }
  label { display:block; margin:.9rem 0 .3rem; font-size:.9rem; color:#c7cad1; }
  input, select { width:100%; padding:.6rem .8rem; border-radius:10px; border:1px solid #2b2f3a; background:#0f1117; color:#f5f5f5; font-size:.95rem; }
  button { margin-top:1.25rem; padding:.65rem 1.2rem; border-radius:10px; border:none; background:#f5f5f5; color:#0A0B0E; font-weight:700; cursor:pointer; }
  .erro { background:#3b1414; border:1px solid #7f1d1d; color:#fecaca; padding:.6rem .9rem; border-radius:10px; margin-bottom:1rem; font-size:.9rem; }
  .sair { color:#9ca3af; text-decoration:none; font-size:.85rem; }
  .badge { display:inline-block; padding:.2rem .7rem; border-radius:999px; font-size:.75rem; font-weight:600; }
  .lista-item { display:flex; justify-content:space-between; padding:.6rem 0; border-bottom:1px solid #1f222a; font-size:.9rem; }
  .lista-item:last-child { border-bottom:none; }
  table { width:100%; border-collapse:collapse; font-size:.9rem; }
  th, td { text-align:left; padding:.5rem .4rem; border-bottom:1px solid #1f222a; }
  th { color:#9ca3af; font-weight:600; }
  .topo-acoes { display:flex; align-items:center; gap:1.1rem; }
  .sino { position:relative; text-decoration:none; font-size:1.25rem; line-height:1; }
  .sino-badge { position:absolute; top:-.5rem; right:-.6rem; min-width:1.1rem; height:1.1rem; padding:0 .25rem;
    background:#ef4444; color:#fff; border-radius:999px; font-size:.7rem; font-weight:700; display:none;
    align-items:center; justify-content:center; text-align:center; line-height:1.1rem; }
`;

export function layout(titulo: string, corpo: string, options?: { semTopo?: boolean }): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${titulo}</title>
<style>${ESTILO}</style>
</head>
<body>
${
    options?.semTopo
        ? corpo
        : `<div class="topo">
             <b>🔧 Painel Admin</b>
             <div class="topo-acoes">
               <a class="sino" href="/admin/notificacoes" title="Notificações">🔔<span class="sino-badge" id="sino-badge">0</span></a>
               <a class="sair" href="/admin/logout">Sair</a>
             </div>
           </div>
           <div class="conteudo">${corpo}</div>
           <script>
             async function atualizarSino() {
               try {
                 const r = await fetch('/admin/notificacoes/count.json', { credentials: 'same-origin' });
                 if (!r.ok) return;
                 const d = await r.json();
                 const b = document.getElementById('sino-badge');
                 if (d.total > 0) { b.textContent = d.total > 99 ? '99+' : d.total; b.style.display = 'flex'; }
                 else { b.style.display = 'none'; }
               } catch (e) {}
             }
             atualizarSino();
             setInterval(atualizarSino, 20000);
           </script>`
}
</body>
</html>`;
}

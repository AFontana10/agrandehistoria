(() => {
  'use strict';

  const MAX_PER_DAY = 4;
  const TOTAL_DAYS = 260;
  const DAYS_PER_WEEK = 5;
  const TOTAL_WEEKS = 52;

  const LS_SETTINGS = 'agHist_settings';
  const LS_CHECKS = 'agHist_checks';
  const LS_NOTES = 'agHist_notes';          // notas por dia (Ouvindo a Deus)
  const LS_GLOBAL_NOTES = 'agHist_gnotes';  // bloco de notas geral (notes.html)
  const LS_FP = 'agHist_plan_fingerprint';
  const LS_PLAN260 = 'agHist_plan260_cache';

  let originalPlan = null;
  let plan260 = null;

  let settings = { startDate: '' };
  let checks = {};
  let notes = {};
  let gnotes = {};

  const $ = (sel) => document.querySelector(sel);

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function pad3(n) { return String(n).padStart(3, '0'); }

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function loadStorage() {
    settings = safeJsonParse(localStorage.getItem(LS_SETTINGS) || '{"startDate":""}', { startDate: '' });
    checks = safeJsonParse(localStorage.getItem(LS_CHECKS) || '{}', {});
    notes = safeJsonParse(localStorage.getItem(LS_NOTES) || '{}', {});
    gnotes = safeJsonParse(localStorage.getItem(LS_GLOBAL_NOTES) || '{}', {});
  }

  function saveStorage() {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
    localStorage.setItem(LS_CHECKS, JSON.stringify(checks));
    localStorage.setItem(LS_NOTES, JSON.stringify(notes));
    localStorage.setItem(LS_GLOBAL_NOTES, JSON.stringify(gnotes));
  }

  function fingerprintOfPlan(obj) {
    const s = JSON.stringify(obj);
    const head = s.slice(0, 40);
    const tail = s.slice(-40);
    return String(s.length) + ':' + head + ':' + tail;
  }

  function setPlan260Cache(fp, planObj) {
    localStorage.setItem(LS_FP, fp);
    localStorage.setItem(LS_PLAN260, JSON.stringify(planObj));
  }

  function getPlan260Cache(fp) {
    const cachedFp = localStorage.getItem(LS_FP) || '';
    const cached = localStorage.getItem(LS_PLAN260) || '';
    if (!cached || cachedFp !== fp) return null;
    return safeJsonParse(cached, null);
  }

  function parseReference(ref) {
    const s = String(ref || '').replace(/\s+/g, ' ').trim();
    const m = s.match(/^(.*?)\s+(\d+)$/);
    if (!m) return null;
    const book = m[1].trim();
    const chapter = Number(m[2]);
    if (!book || !Number.isInteger(chapter) || chapter <= 0) return null;
    return { book, chapter };
  }

  function flattenBlockUnits(bloco) {
    const units = [];
    for (let wi = 0; wi < bloco.semanas.length; wi++) {
      const semana = bloco.semanas[wi];
      for (let di = 0; di < semana.dias.length; di++) {
        const dia = semana.dias[di];
        for (let li = 0; li < dia.leituras.length; li++) {
          units.push({ ref: dia.leituras[li].leitura, desc: dia.descricao });
        }
      }
    }
    return units;
  }

  function computeWeeksBounds(unitsCount) {
    const minDaysNeeded = Math.ceil(unitsCount / MAX_PER_DAY);
    const minWeeks = Math.max(1, Math.ceil(minDaysNeeded / DAYS_PER_WEEK));
    const maxWeeks = unitsCount >= DAYS_PER_WEEK ? Math.floor(unitsCount / DAYS_PER_WEEK) : 0;
    return { minWeeks, maxWeeks };
  }

  function allocateWeeks(blockMetas) {
    const sumMin = blockMetas.reduce((s, b) => s + b.minWeeks, 0);
    if (sumMin > TOTAL_WEEKS) {
      throw new Error('Impossível: soma dos mínimos de semanas excede 52.');
    }

    for (let i = 0; i < blockMetas.length; i++) blockMetas[i].weeks = blockMetas[i].minWeeks;
    let remaining = TOTAL_WEEKS - sumMin;

    while (remaining > 0) {
      const candidates = blockMetas.filter(b => b.weeks < b.maxWeeks);
      if (candidates.length === 0) throw new Error('Impossível: sobram semanas, mas nenhum bloco pode receber mais.');

      candidates.sort((a, b) => {
        const pa = a.units.length / (a.weeks * DAYS_PER_WEEK * MAX_PER_DAY);
        const pb = b.units.length / (b.weeks * DAYS_PER_WEEK * MAX_PER_DAY);
        return pb - pa;
      });

      candidates[0].weeks += 1;
      remaining -= 1;
    }
  }

  function buildPlan260(blockMetas) {
    const out = {
      meta: {
        totalDays: TOTAL_DAYS,
        totalWeeks: TOTAL_WEEKS,
        daysPerWeek: DAYS_PER_WEEK,
        maxPerDay: MAX_PER_DAY,
        generatedAt: new Date().toISOString()
      },
      blocos: [],
      semanas: []
    };

    let globalWeek = 1;
    let globalDay = 1;

    for (let bi = 0; bi < blockMetas.length; bi++) {
      const b = blockMetas[bi];
      const weekStart = globalWeek;
      const weeksCount = b.weeks;
      const daysInBlock = weeksCount * DAYS_PER_WEEK;

      const units = b.units.slice();

      for (let w = 0; w < weeksCount; w++) {
        const semana = { id: String(globalWeek), blocoIndex: bi, blocoTitulo: b.titulo, dias: [] };

        for (let d = 0; d < DAYS_PER_WEEK; d++) {
          const dayIndexInBlock = (w * DAYS_PER_WEEK) + d;
          const remainingDays = daysInBlock - dayIndexInBlock;
          const remainingUnits = units.length;
          if (remainingUnits <= 0) throw new Error('Erro: bloco ficou sem leituras cedo demais.');

          const meta = Math.ceil(remainingUnits / remainingDays);
          const take = clamp(meta, 1, MAX_PER_DAY);
          const taken = units.splice(0, take);

          const dayId = 'd' + pad3(globalDay);
          const leituras = taken.map((x, i) => ({ referencia: x.ref, readingId: dayId + '-r' + (i + 1) }));

          semana.dias.push({
            dia: 'Dia ' + globalDay,
            diaNumero: globalDay,
            dayId,
            descricao: taken[0] ? taken[0].desc : '',
            leituras
          });

          globalDay++;
        }

        out.semanas.push(semana);
        globalWeek++;
      }

      out.blocos.push({
        index: bi,
        titulo: b.titulo,
        semanaInicio: weekStart,
        semanasCount: weeksCount
      });
    }

    return out;
  }

  function getWeekdayNameByIndex(i) {
    return ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'][i] || '';
  }

  function getDayByNumber(dayNum) {
    const w = Math.ceil(dayNum / DAYS_PER_WEEK);
    const di = (dayNum - 1) % DAYS_PER_WEEK;
    return plan260.semanas[w - 1].dias[di];
  }

  function dayIsCompleted(day) {
    for (let i = 0; i < day.leituras.length; i++) {
      if (!checks[day.leituras[i].readingId]) return false;
    }
    return true;
  }

  function countCompletedDays() {
    let c = 0;
    for (let wi = 0; wi < plan260.semanas.length; wi++) {
      const semana = plan260.semanas[wi];
      for (let di = 0; di < semana.dias.length; di++) {
        if (dayIsCompleted(semana.dias[di])) c++;
      }
    }
    return c;
  }

  function pct(n, d) {
    if (!d) return 0;
    return Math.round((n / d) * 100);
  }

  function iconSvg(kind) {
    // ícones simples (laranja) para os cards do topo
    if (kind === 'progress') {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v7h-7"/></svg>`;
    }
    if (kind === 'doc') {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/></svg>`;
    }
    if (kind === 'calendar') {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 8h18"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M7 12h4"/><path d="M7 16h4"/></svg>`;
    }
    if (kind === 'pencil') {
      return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
    }
    if (kind === 'arrow') {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>`;
    }
    return '';
  }

  function renderError(msg) {
    $('#app').innerHTML = `<div class="container"><div class="card"><div style="color:#b91c1c;font-weight:900;font-size:18px">Erro</div><div style="margin-top:10px;color:#374151">${msg}</div></div></div>`;
  }

  // formata título do bloco evitando duplicação "BLOCO X — ..."
  function formatBlockTitle(titulo, index) {
    if (!titulo || typeof titulo !== 'string') return '';
    const t = titulo.trim();
    if (/^BLOCO\s+\d+/i.test(t)) return t; // já contém o prefixo
    return 'BLOCO ' + (index + 1) + ' — ' + t;
  }

  // ---------- INDEX (visão geral: blocos + semanas) ----------
  function renderIndex() {
    const completedDays = countCompletedDays();
    const overall = pct(completedDays, TOTAL_DAYS);

    // agrupar semanas por bloco (usando plan260.blocos)
    let htmlBlocks = '';
    for (let bi = 0; bi < plan260.blocos.length; bi++) {
      const bloco = plan260.blocos[bi];
      const startWeek = bloco.semanaInicio;
      const endWeek = startWeek + bloco.semanasCount - 1;

      htmlBlocks += `<div class="section-title">${formatBlockTitle(bloco.titulo, bi)}</div>`;

      for (let w = startWeek; w <= endWeek; w++) {
        const semana = plan260.semanas[w - 1];
        const doneCount = semana.dias.filter(dayIsCompleted).length;
        const p = pct(doneCount, 5);
        const doneClass = doneCount === 5 ? 'done' : '';

        htmlBlocks += `
          <a class="week-card ${doneClass}" href="week.html?w=${w}">
            <div class="week-left">
              <div class="wk">Semana ${w}</div>
              <div class="days">${doneCount}/5 dias</div>
            </div>
            <div class="week-right">${p}%</div>
          </a>
        `;
      }
    }

    $('#app').innerHTML = `
      <div class="container">
        <div class="title">A Grande História</div>
        <div class="subtitle">Plano de Leitura do Velho Testamento em Ordem Cronológica</div>

        <div class="card">
          <div class="progress-row">
            <div>
              <div class="h-label">Progresso geral</div>
              <div class="h-big">${overall}% concluído</div>
              <div class="bar"><div style="width:${overall}%"></div></div>
            </div>
            <div class="ring" style="--p:${overall}"></div>
          </div>
        </div>


        <div class="card">
          <div class="h-label">Backup</div>
          <div class="tools" style="margin-top:10px">
            <button id="btnExpProgHome">Exportar progresso (JSON)</button>
            <button id="btnImpProgHome">Importar progresso (JSON)</button>
            <input id="fileImpProgHome" type="file" accept="application/json,.json" style="display:none" />
          </div>
        </div>

        ${htmlBlocks}
      </div>
    `;

    // Backup (Home) — registrar listeners fora da template string
    const btnHomeExp = document.getElementById('btnExpProgHome');
    if (btnHomeExp) btnHomeExp.addEventListener('click', exportProgress);
    wireImportProgress('btnImpProgHome', 'fileImpProgHome');
  }

  // ---------- WEEK (detalhe da semana) ----------
  function renderWeek() {
    const params = new URLSearchParams(location.search);
    const w = Number(params.get('w'));
    const weekNum = Number.isInteger(w) && w >= 1 && w <= TOTAL_WEEKS ? w : 1;

    const semana = plan260.semanas[weekNum - 1];
    const doneDays = semana.dias.filter(dayIsCompleted).length;

    const completedDays = countCompletedDays();
    const overall = pct(completedDays, TOTAL_DAYS);

    // cards de dias
    let daysHtml = '';
    for (let di = 0; di < 5; di++) {
      const d = semana.dias[di];
      const dayIndexInWeek = di; // 0..4
      const dayName = getWeekdayNameByIndex(dayIndexInWeek);

      let pills = '';
      for (let ri = 0; ri < d.leituras.length; ri++) {
        const r = d.leituras[ri];
        const checked = !!checks[r.readingId];
        pills += `
          <span class="pill ${checked ? 'checked' : ''}" data-readingid="${r.readingId}">
            <span>${r.referencia}</span>
            <span class="ck"></span>
          </span>
        `;
      }

      daysHtml += `
        <div class="day-card ${dayIsCompleted(d) ? 'done' : ''}">
          <div>
            <div class="day-num">${di + 1}</div>
            <div class="day-name">${dayName}</div>
          </div>
          <div>
            <div class="day-desc">${d.descricao || ''}</div>
            <div class="pills">${pills}</div>
          </div>

          <a class="note-fab" href="day.html?d=${d.diaNumero}" title="Anotar / Ouvindo a Deus">
            ${iconSvg('pencil')}
          </a>
        </div>
      `;
    }

    $('#app').innerHTML = `
      <div class="top-mini">Semana</div>

      <div class="container">
        <div class="card">
          <div class="title" style="margin-top:0">A Grande História</div>
          <div class="subtitle">Plano de Leitura do Velho Testamento em Ordem Cronológica</div>

          <div class="info-3">
            <div class="info-card">
              <div class="info-icon">${iconSvg('progress')}</div>
              <div><b>${overall}%</b> do plano<br><span style="color:#6b7280">concluído</span></div>
            </div>
            <div class="info-card">
              <div class="info-icon">${iconSvg('doc')}</div>
              <div><b>Semana ${weekNum}</b></div>
            </div>
            <div class="info-card">
              <div class="info-icon">${iconSvg('calendar')}</div>
              <div><b>${doneDays}</b> de <b>5</b> dias lidos</div>
            </div>
          </div>

          <div class="hr-orange"></div>

          <div class="week-head">
            <div>
              <h2>Semana ${weekNum}</h2>
              <div class="block">${formatBlockTitle(semana.blocoTitulo, semana.blocoIndex)}</div>
            </div>
            <a class="btn-back" href="index.html">${iconSvg('arrow')} Voltar</a>
          </div>

          <div style="margin-top:10px">${daysHtml}</div>
        </div>
      </div>
    `;

    // toggles dos pills (marcar leitura lida) – clique no pill
    const pills = document.querySelectorAll('[data-readingid]');
    for (let i = 0; i < pills.length; i++) {
      pills[i].addEventListener('click', (ev) => {
        const rid = ev.currentTarget.getAttribute('data-readingid');
        checks[rid] = !checks[rid];
        saveStorage();
        renderWeek(); // re-render para atualizar checkmarks e percentuais
      });
    }
  }

  // ---------- DAY (Ouvindo a Deus) ----------
  function getOrInitDayNotes(dayId) {
    const cur = notes[dayId];
    if (cur && typeof cur === 'object') return cur;

    const fresh = {
      reflexao: '',
      pedidos: '',
      pessoas: '',
      confissao: '',
      gratidao: ''
    };
    notes[dayId] = fresh;
    saveStorage();
    return fresh;
  }

  function renderDay() {
    const params = new URLSearchParams(location.search);
    const d = Number(params.get('d'));
    const dayNum = Number.isInteger(d) && d >= 1 && d <= TOTAL_DAYS ? d : 1;

    const day = getDayByNumber(dayNum);
    const weekNum = Math.ceil(dayNum / 5);
    const dayIndexInWeek = (dayNum - 1) % 5;
    const dayName = getWeekdayNameByIndex(dayIndexInWeek);

    // referência “Segunda • Gênesis 1” (usa a primeira leitura)
    const firstRef = day.leituras[0] ? day.leituras[0].referencia : '';
    const refLine = `${dayName} • ${firstRef}`;

    // pills para marcar as leituras do dia (mantém o check do app)
    let pills = '';
    for (let i = 0; i < day.leituras.length; i++) {
      const r = day.leituras[i];
      const checked = !!checks[r.readingId];
      pills += `
        <span class="pill ${checked ? 'checked' : ''}" data-readingid="${r.readingId}">
          <span>${r.referencia}</span>
          <span class="ck"></span>
        </span>
      `;
    }

    const dayId = 'd' + pad3(dayNum);
    const n = getOrInitDayNotes(dayId);

    $('#app').innerHTML = `
      <div class="top-mini">Ouvindo a Deus</div>

      <div class="container">
        <div class="card">
          <div class="title" style="margin-top:0">Ouvindo a Deus</div>
          <div class="subtitle">Reflexão e oração a partir da Palavra</div>
          <div class="meta-center">${refLine}</div>

          <div class="week-head" style="margin-top:10px">
            <div></div>
            <a class="btn-back" href="week.html?w=${weekNum}">${iconSvg('arrow')} Voltar</a>
          </div>

          <div class="pills" style="margin-top:12px;justify-content:center">${pills}</div>

          <div class="form-section">
            <h3>Reflexão bíblica</h3>
            <p>Escute o que Deus está lhe dizendo por meio do texto lido hoje.</p>
            <textarea id="t_reflexao" placeholder="O que Deus revelou ao meu coração nesta leitura?">${n.reflexao || ''}</textarea>
          </div>

          <div class="form-section">
            <h3>Pelo que estou orando hoje?</h3>
            <p>Apresente diante de Deus suas lutas, decisões e necessidades.</p>
            <textarea id="t_pedidos" placeholder="Uma linha por pedido">${n.pedidos || ''}</textarea>
          </div>

          <div class="form-section">
            <h3>Pessoas por quem preciso orar</h3>
            <p>Interceda por pessoas que Deus colocou em seu caminho.</p>
            <textarea id="t_pessoas" placeholder="Uma linha por pessoa/situação">${n.pessoas || ''}</textarea>
          </div>

          <div class="form-section">
            <h3>Confessando o meu pecado</h3>
            <p>Confesse com sinceridade e receba a graça restauradora de Deus.</p>
            <textarea id="t_confissao" placeholder="O que preciso confessar e entregar hoje?">${n.confissao || ''}</textarea>
          </div>

          <div class="form-section">
            <h3>Bênçãos e agradecimentos</h3>
            <p>Reconheça a graça de Deus presente neste dia.</p>
            <textarea id="t_gratidao" placeholder="Uma linha por motivo de gratidão">${n.gratidao || ''}</textarea>
          </div>
        </div>
      </div>
    `;

    // toggle leitura lida
    const pillEls = document.querySelectorAll('[data-readingid]');
    for (let i = 0; i < pillEls.length; i++) {
      pillEls[i].addEventListener('click', (ev) => {
        const rid = ev.currentTarget.getAttribute('data-readingid');
        checks[rid] = !checks[rid];
        saveStorage();
        renderDay();
      });
    }

    function bind(id, key) {
      const el = document.getElementById(id);
      el.addEventListener('input', () => {
        n[key] = el.value || '';
        notes[dayId] = n;
        saveStorage();
      });
    }

    bind('t_reflexao', 'reflexao');
    bind('t_pedidos', 'pedidos');
    bind('t_pessoas', 'pessoas');
    bind('t_confissao', 'confissao');
    bind('t_gratidao', 'gratidao');
  }

  // ---------- NOTES (bloco de notas geral) ----------
  function getOrInitGlobalNotes() {
    if (gnotes && typeof gnotes === 'object') return gnotes;
    gnotes = {};
    return gnotes;
  }

  function exportPlan260() {
    if (!plan260) { alert('Plano ainda não carregou.'); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    const payload = { exportedAt: new Date().toISOString(), planFingerprint: localStorage.getItem(LS_FP) || '', plan260: plan260 };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agrandehistoria_plano260_' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 400);
  }

  function exportProgress() {
    const stamp = new Date().toISOString().slice(0, 10);
    const payload = { exportedAt: new Date().toISOString(), settings, checks, notes, gnotes };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agrandehistoria_progresso_' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 400);
  }

  function importProgressFromJsonText(text) {
    const data = safeJsonParse(text, null);
    if (!data || typeof data !== 'object') throw new Error('Arquivo inválido (JSON).');

    // Aceita apenas as chaves esperadas; se alguma vier faltando, usa fallback.
    const nextSettings = (data.settings && typeof data.settings === 'object') ? data.settings : { startDate: '' };
    const nextChecks = (data.checks && typeof data.checks === 'object') ? data.checks : {};
    const nextNotes = (data.notes && typeof data.notes === 'object') ? data.notes : {};
    const nextGnotes = (data.gnotes && typeof data.gnotes === 'object') ? data.gnotes : {};

    settings = nextSettings;
    checks = nextChecks;
    notes = nextNotes;
    gnotes = nextGnotes;
    saveStorage();
  }

  function wireImportProgress(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;

    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;

      const ok = confirm('Importar este arquivo vai substituir o progresso e as notas salvas neste dispositivo. Deseja continuar?');
      if (!ok) return;

      try {
        const text = await file.text();
        importProgressFromJsonText(text);
        alert('Progresso importado com sucesso!');
        // volta para o início para recalcular percentuais e refletir no app inteiro
        location.href = 'index.html';
      } catch (e) {
        alert('Não foi possível importar: ' + String(e && e.message ? e.message : e));
      }
    });
  }

  function renderNotes() {
    const n = getOrInitGlobalNotes();

    $('#app').innerHTML = `
      <div class="top-mini">Notas</div>

      <div class="container">
        <div class="form-section">
          <h3>Reflexão bíblica</h3>
          <p>Escute o que Deus está lhe dizendo por meio da Palavra.</p>
          <textarea id="g_reflexao" placeholder="O que Deus está me ensinando?">${n.reflexao || ''}</textarea>
        </div>

        <div class="form-section">
          <h3>Pelo que estou orando hoje?</h3>
          <p>Apresente diante de Deus suas lutas, decisões e necessidades.</p>
          <textarea id="g_pedidos" placeholder="Uma linha por pedido">${n.pedidos || ''}</textarea>
        </div>

        <div class="form-section">
          <h3>Pessoas por quem preciso orar</h3>
          <p>Interceda por pessoas que Deus colocou em seu caminho.</p>
          <textarea id="g_pessoas" placeholder="Uma linha por pessoa/situação">${n.pessoas || ''}</textarea>
        </div>

        <div class="form-section">
          <h3>Confessando o meu pecado</h3>
          <p>Confesse com sinceridade e receba a graça restauradora de Deus.</p>
          <textarea id="g_confissao" placeholder="O que preciso confessar e entregar hoje?">${n.confissao || ''}</textarea>
        </div>

        <div class="form-section">
          <h3>Bênçãos e agradecimentos</h3>
          <p>Reconheça a graça de Deus presente neste dia.</p>
          <textarea id="g_gratidao" placeholder="Uma linha por motivo de gratidão">${n.gratidao || ''}</textarea>
        </div>

        <div class="tools">
          <button id="btnExpProg">Exportar progresso (JSON)</button>
          <button id="btnImpProg">Importar progresso (JSON)</button>
          <input id="fileImpProg" type="file" accept="application/json,.json" style="display:none" />
          <button id="btnExp260">Exportar Plano260 (JSON)</button>
          <a class="btn-back" href="index.html" style="justify-content:center">${iconSvg('arrow')} Voltar</a>
        </div>
      </div>
    `;

    function bind(id, key) {
      const el = document.getElementById(id);
      el.addEventListener('input', () => {
        n[key] = el.value || '';
        gnotes = n;
        saveStorage();
      });
    }

    bind('g_reflexao', 'reflexao');

    bind('g_pedidos', 'pedidos');
    bind('g_pessoas', 'pessoas');
    bind('g_confissao', 'confissao');
    bind('g_gratidao', 'gratidao');

    document.getElementById('btnExpProg').addEventListener('click', exportProgress);
    wireImportProgress('btnImpProg', 'fileImpProg');
    document.getElementById('btnExp260').addEventListener('click', exportPlan260);
  }

  // ---------- ROUTER / LOAD ----------
  async function load() {
    loadStorage();

    const res = await fetch('data/plano.json', { cache: 'no-store' });
    originalPlan = await res.json();

    if (!originalPlan || !originalPlan.blocos || !originalPlan.blocos.length) {
      renderError('data/plano.json não está no formato esperado (precisa ter "blocos").');
      return;
    }

    // validação leve (só garante que as leituras parecem "Livro Capítulo")
    for (let bi = 0; bi < originalPlan.blocos.length; bi++) {
      const bloco = originalPlan.blocos[bi];
      if (!bloco.semanas) continue;
      for (let wi = 0; wi < bloco.semanas.length; wi++) {
        const semana = bloco.semanas[wi];
        for (let di = 0; di < semana.dias.length; di++) {
          const dia = semana.dias[di];
          for (let li = 0; li < dia.leituras.length; li++) {
            const ref = dia.leituras[li].leitura;
            if (!parseReference(ref)) {
              renderError('Encontrei uma leitura fora do padrão "Livro Capítulo": ' + String(ref));
              return;
            }
          }
        }
      }
    }

    const fp = fingerprintOfPlan(originalPlan);
    const cached = getPlan260Cache(fp);

    if (cached) {
      plan260 = cached;
    } else {
      const blockMetas = originalPlan.blocos.map((bloco) => {
        const units = flattenBlockUnits(bloco);
        const bounds = computeWeeksBounds(units.length);
        if (bounds.maxWeeks === 0) throw new Error('Algum bloco tem menos de 5 leituras; não dá para manter seg–sex sem misturar.');
        if (bounds.maxWeeks < bounds.minWeeks) throw new Error('Algum bloco ficou inviável com teto de 4 leituras/dia.');
        return { titulo: bloco.titulo, units, minWeeks: bounds.minWeeks, maxWeeks: bounds.maxWeeks, weeks: 0 };
      });

      allocateWeeks(blockMetas);
      plan260 = buildPlan260(blockMetas);
      setPlan260Cache(fp, plan260);
    }

    route();
  }

  function route() {
    const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (page === 'week.html') renderWeek();
    else if (page === 'day.html') renderDay();
    else if (page === 'notes.html') renderNotes();
    else renderIndex();
  }

  window.addEventListener('DOMContentLoaded', () => {
    load().catch((err) => renderError(String(err && err.message ? err.message : err)));
  });
})();
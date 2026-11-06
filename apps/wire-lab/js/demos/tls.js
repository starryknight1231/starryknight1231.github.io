/* ============ TLS 握手轮次：报文回放 + RTT 由模型算出 ============ */
(function () {
  'use strict';

  const SUITE = {
    rsa: 'TLS_RSA_WITH_AES_128_GCM_SHA256',
    ecdhe: 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
    t13: 'TLS_AES_128_GCM_SHA256',
  };

  // 生成报文序列；握手轮次 = 「客户端必须等待的服务端航班」数(rttEnd)，全部实时数出。
  function genMessages(cfg) {
    const M = [];
    const add = (dir, msg, fields, opts) => M.push(Object.assign({ dir, msg, fields: fields || [], pfs: false }, opts || {}));

    if (cfg.ver === '1.2-rsa') {
      if (cfg.resume) {
        add('C', 'ClientHello', ['version=TLS 1.2', 'cipher_suites=' + SUITE.rsa, 'session_id=<缓存会话>']);
        add('S', 'ServerHello', ['cipher_suite=' + SUITE.rsa, 'session_id=<命中，复用主密钥>']);
        add('S', 'ChangeCipherSpec', []);
        add('S', 'Finished', ['verify_data=<对握手摘要>'], { rttEnd: true });
        add('C', 'ChangeCipherSpec', []);
        add('C', 'Finished', ['verify_data=<...>']);
      } else {
        add('C', 'ClientHello', ['random=ClNT', 'cipher_suites=' + SUITE.rsa, 'server_name=example.com']);
        add('S', 'ServerHello', ['random=SeNT', 'cipher_suite=' + SUITE.rsa]);
        add('S', 'Certificate', ['<RSA 叶证书 + CA 链>']);
        add('S', 'ServerHelloDone', [], { rttEnd: true });
        add('C', 'ClientKeyExchange', ['EncRSA_oaep(pre_master=ClNT‖SeNT)'], { pfs: false });
        add('C', 'ChangeCipherSpec', []);
        add('C', 'Finished', ['verify_data']);
        add('S', 'ChangeCipherSpec', []);
        add('S', 'Finished', ['verify_data'], { rttEnd: true });
      }
    } else if (cfg.ver === '1.2-ecdhe') {
      if (cfg.resume) {
        add('C', 'ClientHello', ['version=TLS 1.2', 'cipher_suites=' + SUITE.ecdhe, 'session_id=<缓存会话>']);
        add('S', 'ServerHello', ['cipher_suite=' + SUITE.ecdhe, 'session_id=<命中>']);
        add('S', 'ChangeCipherSpec', []);
        add('S', 'Finished', ['verify_data'], { rttEnd: true });
        add('C', 'ChangeCipherSpec', []);
        add('C', 'Finished', ['verify_data']);
      } else {
        add('C', 'ClientHello', ['random=ClNT', 'cipher_suites=' + SUITE.ecdhe, 'supported_groups=[X25519]']);
        add('S', 'ServerHello', ['random=SeNT', 'cipher_suite=' + SUITE.ecdhe]);
        add('S', 'Certificate', ['<证书链>']);
        add('S', 'ServerKeyExchange', ['named_group=X25519', 'pub=<服务端临时 ECDH 份额>', 'signature=<私钥签名>']);
        add('S', 'ServerHelloDone', [], { rttEnd: true });
        add('C', 'ClientKeyExchange', ['pub=<客户端临时 ECDH 份额>'], { pfs: true });
        add('C', 'ChangeCipherSpec', []);
        add('C', 'Finished', ['verify_data']);
        add('S', 'ChangeCipherSpec', []);
        add('S', 'Finished', ['verify_data'], { rttEnd: true });
      }
    } else { // 1.3
      if (cfg.zeroRtt) {
        add('C', 'ClientHello + early_data', ['key_share=<X25519 临时份额>', 'pre_shared_key=<会话票据>', 'cipher_suites=' + SUITE.t13,
          '· 0-RTT 数据：GET / ——用 PSK 派生密钥，非前向安全'], { pfs: true });
        add('S', 'ServerHello', ['key_share=<X25519 服务端份额>', 'use_psk'], { pfs: true });
        add('S', 'EncryptedExtensions, Finished', [], { enc: true, rttEnd: true });
        add('C', 'Finished', [], { enc: true });
        add('S', 'NewSessionTicket', ['<供下次 0-RTT / 复用的新票据>'], { enc: true });
      } else if (cfg.resume) {
        add('C', 'ClientHello', ['key_share=<X25519 临时份额>', 'pre_shared_key=<会话票据>', 'cipher_suites=' + SUITE.t13], { pfs: true });
        add('S', 'ServerHello', ['key_share=<服务端份额>', 'use_psk'], { pfs: true });
        add('S', 'EncryptedExtensions, Finished', ['<恢复会话免发证书>'], { enc: true, rttEnd: true });
        add('C', 'Finished', [], { enc: true });
      } else {
        add('C', 'ClientHello', ['key_share=<X25519 临时份额>', 'supported_versions=[TLS1.3]', 'cipher_suites=' + SUITE.t13]);
        add('S', 'ServerHello', ['key_share=<服务端份额>', 'cipher_suite=' + SUITE.t13], { pfs: true });
        add('S', 'EncryptedExtensions', [], { enc: true });
        add('S', 'Certificate', ['<叶证书 + CA 链>'], { enc: true });
        add('S', 'CertificateVerify', ['<对新 key_share 的签名>'], { enc: true });
        add('S', 'Finished', ['<握手完整性>'], { enc: true, rttEnd: true });
        add('C', 'Finished', [], { enc: true });
        add('S', 'NewSessionTicket', []);
      }
    }
    return M;
  }

  function computeRtt(cfg) {
    const M = genMessages(cfg);
    const tls = M.filter(m => m.rttEnd).length;         // 握手轮次：模型里 flight 边界数
    const tcp = cfg.quic ? 0 : 1;                       // QUIC 把传输与加密合一，省掉独立 TCP 握手
    const req = cfg.zeroRtt ? 0 : 1;                    // 0-RTT 让首个请求搭进 flight0，省掉请求轮次
    const hasPfs = M.some(m => m.pfs);
    return { M, tls, tcp, req, total: tcp + tls + req, hasPfs };
  }

  const CANON = [
    { name: 'TLS1.2 RSA', ver: '1.2-rsa' },
    { name: 'TLS1.2 ECDHE', ver: '1.2-ecdhe' },
    { name: 'TLS1.2 ECDHE 复用', ver: '1.2-ecdhe', resume: true },
    { name: 'TLS1.3 全握手', ver: '1.3' },
    { name: 'TLS1.3 复用', ver: '1.3', resume: true },
    { name: 'TLS1.3 0-RTT', ver: '1.3', resume: true, zeroRtt: true },
    { name: 'QUIC 全握手', ver: '1.3', quic: true },
    { name: 'QUIC 0-RTT', ver: '1.3', quic: true, resume: true, zeroRtt: true },
  ];

  registerDemo({
    id: 'tls', cat: '应用层', name: '握手轮次',
    desc: 'TLS1.2(RSA/ECDHE) vs TLS1.3 vs 复用/0-RTT vs QUIC：逐报文回放，RTT 数与首字节时间由模型算出',
    keywords: 'tls tls1.3 握手 rtt 前向安全 pfs ecdhe rsa 0-rtt 会话复用 quic 首字节',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    render(body) {
      const cfg = { ver: '1.3', resume: false, zeroRtt: false, quic: false, rtt: 100 };
      let STEP = 0;

      body.innerHTML = `
        <div class="info-note">
          <b>口径：</b>握手轮次不是背下来的表，而是从「有几个 flight 边界」数出来的；
          首字节时间 = <b>TCP RTT + 握手 RTT + 请求 RTT</b>。切换版本 / 复用 / 0-RTT / QUIC，数字随之而变。
        </div>
        <div class="card">
          <div class="card-title">配置</div>
          <div class="row">
            <div>
              <label class="fld">协议 / 密钥交换</label>
              <div class="seg" id="tl-ver">
                <button data-v="1.2-rsa">1.2 RSA</button>
                <button data-v="1.2-ecdhe">1.2 ECDHE</button>
                <button class="on" data-v="1.3">1.3</button>
              </div>
            </div>
            <div class="fix" style="display:flex;gap:16px;align-items:flex-end">
              <label class="chk"><input type="checkbox" id="tl-resume">会话复用</label>
              <label class="chk"><input type="checkbox" id="tl-0rtt">0-RTT</label>
              <label class="chk"><input type="checkbox" id="tl-quic">QUIC</label>
            </div>
            <div><label class="fld">RTT：<b id="tl-rtt-v">100 ms</b></label><input type="range" id="tl-rtt" min="10" max="300" value="100"></div>
          </div>
          <div class="btn-row">
            <button class="btn sm" id="tl-prev">◀ 上一步</button>
            <button class="btn teal sm" id="tl-next">下一步 ▶</button>
            <button class="btn sm" id="tl-reset">重置</button>
          </div>
          <div class="warn-note" id="tl-warn" style="display:none"></div>
        </div>
        <div class="card">
          <div class="card-title">逐报文回放</div>
          <div class="stat-grid" style="margin-bottom:12px">
            <div class="stat"><b id="tl-tcprt">1</b><span>TCP RTT</span></div>
            <div class="stat c-accent"><b id="tl-tlsrtt">1</b><span>握手 RTT</span></div>
            <div class="stat"><b id="tl-reqrtt">1</b><span>请求 RTT</span></div>
            <div class="stat c-teal"><b id="tl-ttfb">—</b><span>首字节时间</span></div>
            <div class="stat"><b id="tl-pfs">—</b><span>前向安全</span></div>
          </div>
          <div class="tls-flow" id="tl-msgs"></div>
        </div>
        <div class="card">
          <div class="card-title">首字节时间 = TCP + 握手 + 请求（各配置对比，随 RTT 缩放）</div>
          <div class="row" style="margin-bottom:8px">
            <span class="legend" style="margin:0">
              <span><i style="background:#4e6478"></i>TCP</span>
              <span><i style="background:var(--accent)"></i>TLS 握手</span>
              <span><i style="background:var(--amber)"></i>请求</span>
            </span>
          </div>
          <div id="tl-chart"></div>
          <div class="hint" id="tl-chartnote"></div>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">TLS1.3 为什么能砍到 1-RTT：1.2 要先「协商参数」再「交换密钥」，往返两次；1.3 把版本、套件定稿，并让客户端在 ClientHello 直接带上 key_share（猜测服务端支持的曲线），ServerHello 一回就凑齐共享密钥 → 一个 RTT 出全部握手密钥。猜错再补一轮，但常态是一轮。

前向安全来自什么：只有 (EC)DHE 这类「临时」密钥交换才提供前向安全——会话密钥由每次新建的临时 DH 对算出，服务端长期私钥泄露也解不开历史流量。RSA 密钥交换把 pre_master 用服务端公钥加密，私钥一泄露、所有录过的历史会话全部可解密 → 无前向安全。1.3 干脆删掉了 RSA 密钥交换，只留 DHE / PSK。

0-RTT 省了什么、贵了什么：0-RTT 把首个应用请求塞进 flight0，省掉一整轮请求 RTT；代价是早期数据用 PSK 派生密钥、不带新鲜 ECDHE → 无前向安全，且可被重放，只适合幂等请求。

QUIC 为什么更快：它把传输握手与加密握手合并成一个往返，没有「TCP 一轮 + TLS 一两轮」的串行叠加，恢复会话还能 0-RTT。</pre>
        </div>`;

      /* ---------- 渲染 ---------- */
      function render() {
        // 归一化约束：0-RTT 依赖会话复用，且只走 1.3；QUIC 承载 1.3
        if (cfg.zeroRtt) { cfg.resume = true; if (cfg.ver.startsWith('1.2')) cfg.ver = '1.3'; }
        const r = computeRtt(cfg);
        STEP = Math.min(STEP, r.M.length);

        body.querySelector('#tl-tcprt').textContent = r.tcp;
        body.querySelector('#tl-tlsrtt').textContent = r.tls;
        body.querySelector('#tl-reqrtt').textContent = r.req;
        body.querySelector('#tl-ttfb').textContent = WL.fmtMs(r.total * cfg.rtt);
        const pfsEl = body.querySelector('#tl-pfs');
        pfsEl.innerHTML = r.hasPfs
          ? (cfg.zeroRtt ? '<span style="color:var(--amber)">握手有·0RTT无</span>' : '<span style="color:var(--green)">是</span>')
          : '<span style="color:var(--red)">否</span>';
        const pfs = cfg.ver === '1.2-rsa' ? 'RSA 密钥交换无前向安全（私钥泄露可解密历史）'
          : cfg.ver === '1.2-ecdhe' ? 'ECDHE 临时密钥 → 前向安全'
          : cfg.zeroRtt ? '1.3 ECDHE 前向安全；但 0-RTT 数据无'
          : '1.3 key_share ECDHE → 前向安全';
        pfsEl.title = pfs;

        // 报文流
        let s = '';
        let flightNo = 1;
        s += flightHeader(1);
        r.M.forEach((m, n) => {
          const cur = n <= STEP;
          const cls = m.dir === 'C' ? 'cs' : 'sc';
          const arrow = m.dir === 'C' ? '→' : '←';
          const enc = m.enc ? ' <span style="color:var(--teal);font-size:10px">已加密</span>' : '';
          s += `<div class="tls-msg ${cur ? '' : 'dim'}" style="opacity:${cur ? 1 : 0.35}">
            <div class="dir ${cls}">${arrow}</div>
            <div><div class="nm">${WL.esc(m.msg)}${enc}</div>
            <div class="fields">${m.fields.map(f => WL.esc(f)).join('<br>')}</div></div></div>`;
          if (m.rttEnd && n < r.M.length - 1) { s += `<div class="tls-rtt">— RTT ${flightNo} 结束 · 下一航班加密 —</div>`; flightNo++; s += flightHeader(flightNo); }
        });
        body.querySelector('#tl-msgs').innerHTML = s;

        // 0-RTT/QUIC 警告
        const warn = body.querySelector('#tl-warn');
        const issues = [];
        if (cfg.zeroRtt) issues.push('0-RTT 早期数据无前向安全且可重放，仅用于幂等请求');
        if (cfg.ver === '1.2-rsa') issues.push('RSA 密钥交换无前向安全');
        if (cfg.ver.startsWith('1.2') && !cfg.resume) issues.push('1.2 全握手需 2 RTT');
        if (issues.length) { warn.style.display = ''; warn.innerHTML = '⚠ ' + issues.join(' ； '); }
        else warn.style.display = 'none';

        renderChart();
      }
      function flightHeader(n) {
        return `<div style="font-size:11px;color:var(--faint);font-family:var(--mono);margin:2px 0">flight ${n}${n === 1 ? ' · 明文' : ' · 加密'}</div>`;
      }

      function renderChart() {
        const rows = CANON.map(c => {
          const cc = Object.assign({ ver: c.ver, resume: !!c.resume, zeroRtt: !!c.zeroRtt, quic: !!c.quic }, {});
          const r = computeRtt(cc);
          const isCur = c.ver === cfg.ver && !!c.resume === cfg.resume && !!c.zeroRtt === cfg.zeroRtt && !!c.quic === cfg.quic;
          return { c, r, isCur };
        });
        const maxRtt = Math.max(...rows.map(x => x.r.total));
        body.querySelector('#tl-chart').innerHTML = rows.map(x => {
          const seg = (n, col) => n ? `<div class="ttfb-seg" style="width:${n / maxRtt * 100}%;background:${col}"></div>` : '';
          return `<div class="ttfb-row ${x.isCur ? 'cur' : ''}">
            <div class="ttfb-name">${WL.esc(x.c.name)}${x.r.hasPfs ? '' : ' ·无PFS'}</div>
            <div class="ttfb-bar">${seg(x.r.tcp, '#4e6478')}${seg(x.r.tls, 'var(--accent)')}${seg(x.r.req, 'var(--amber)')}</div>
            <div class="ttfb-total">${x.r.total} RTT · ${Math.round(x.r.total * cfg.rtt)}ms</div>
          </div>`;
        }).join('');
        body.querySelector('#tl-chartnote').innerHTML =
          `最快配置 <b>${WL.esc(pickFastest(rows).c.name)}</b> 只需 ${pickFastest(rows).r.total} 个 RTT 出首字节；`
          + '把 RTT 拉大，1.2 全握手与 QUIC 的差距成倍放大（这就是移动端/跨洋场景上 1.3 与 QUIC 的动力）。';
      }
      function pickFastest(rows) { return rows.reduce((a, b) => (a.r.total <= b.r.total ? a : b)); }

      /* ---------- 控件 ---------- */
      body.querySelectorAll('#tl-ver button').forEach(b => {
        b.addEventListener('click', () => {
          if (cfg.zeroRtt) { cfg.zeroRtt = false; body.querySelector('#tl-0rtt').checked = false; }
          body.querySelectorAll('#tl-ver button').forEach(x => x.classList.remove('on'));
          b.classList.add('on'); cfg.ver = b.dataset.v; STEP = 0; render();
        });
      });
      body.querySelector('#tl-resume').addEventListener('change', e => { cfg.resume = e.target.checked; if (!cfg.resume) { cfg.zeroRtt = false; body.querySelector('#tl-0rtt').checked = false; } STEP = 0; render(); });
      body.querySelector('#tl-0rtt').addEventListener('change', e => {
        cfg.zeroRtt = e.target.checked;
        if (cfg.zeroRtt) {
          cfg.resume = true; body.querySelector('#tl-resume').checked = true;
          if (cfg.ver.startsWith('1.2')) { cfg.ver = '1.3'; body.querySelectorAll('#tl-ver button').forEach(x => x.classList.toggle('on', x.dataset.v === '1.3')); }
        }
        STEP = 0; render();
      });
      body.querySelector('#tl-quic').addEventListener('change', e => {
        cfg.quic = e.target.checked;
        if (cfg.quic && cfg.ver.startsWith('1.2')) { cfg.ver = '1.3'; body.querySelectorAll('#tl-ver button').forEach(x => x.classList.toggle('on', x.dataset.v === '1.3')); WL.toast('QUIC 承载 1.3 语义，已切到 1.3'); }
        STEP = 0; render();
      });
      body.querySelector('#tl-rtt').addEventListener('input', e => {
        cfg.rtt = Number(e.target.value); body.querySelector('#tl-rtt-v').textContent = cfg.rtt + ' ms'; render();
      });
      body.querySelector('#tl-next').addEventListener('click', () => { STEP++; render(); });
      body.querySelector('#tl-prev').addEventListener('click', () => { STEP = Math.max(0, STEP - 1); render(); });
      body.querySelector('#tl-reset').addEventListener('click', () => { STEP = 0; render(); });

      render();
    },
  });
})();

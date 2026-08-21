// ============================================================================
// Bổ Củi Chill 3D — Server phòng chơi mạng (Cloudflare Worker + Durable Object)
// ----------------------------------------------------------------------------
// Mỗi phòng = 1 Durable Object (định danh theo mã phòng). Người chơi kết nối
// WebSocket tới  wss://<worker>/room/<MÃ>?m=r|1&name=Tên .
// Server làm TRUNG CHUYỂN + TRỌNG TÀI: giữ danh sách người chơi (roster), hàng
// chờ, và xoay vòng khi có người chết trong phòng đã đầy. Vì server đứng giữa,
// không còn phụ thuộc NAT/TURN như P2P, và phòng vẫn sống kể cả khi người tạo
// phòng thoát.
//
// Dùng WebSocket Hibernation API (state.acceptWebSocket + webSocketMessage/…)
// — cách chuẩn cho Durable Object nền SQLite ở gói miễn phí, kết nối ổn định,
// không rớt socket ngay sau khi bắt tay. Dữ liệu mỗi socket lưu trong
// serializeAttachment() nên sống sót qua hibernation.
// ============================================================================

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': '*',
};
const MAX = 16;         // số người đánh cùng lúc tối đa (chế độ phòng đông)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('Bo Cui Chill 3D server OK', { headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' } });
    }
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{4,32})$/);
    if (!m) return new Response('Not found', { status: 404, headers: CORS });
    const code = m[1].toUpperCase();
    const id = env.ROOMS.idFromName(code);
    return env.ROOMS.get(id).fetch(request);
  },
};

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  // ---- helpers over the live sockets ----
  sockets() { return this.state.getWebSockets(); }
  // chỉ những socket THỰC SỰ còn mở (readyState OPEN=1). Socket "ma" của tab đã
  // đóng/F5/mất mạng còn kẹt trong getWebSockets() cho tới khi close kịp bắn —
  // nếu đếm cả chúng thì phòng 1v1 báo "full" oan khi người cũ vào lại.
  liveSockets() { const out = []; for (const ws of this.sockets()) { try { if (ws.readyState === undefined || ws.readyState === 1) out.push(ws); } catch (e) {} } return out; }
  // dọn socket đã đóng: gọi onGone cho từng cái để phát 'bye' + cập nhật roster
  pruneDead() {
    for (const ws of this.sockets()) {
      try { if (ws.readyState !== undefined && ws.readyState !== 1) { this.onGone(ws); } } catch (e) {}
    }
  }
  meta(ws) { try { return ws.deserializeAttachment() || {}; } catch (e) { return {}; } }
  setMeta(ws, m) { try { ws.serializeAttachment(m); } catch (e) {} }
  activeCount() { let n = 0; for (const ws of this.liveSockets()) if (!this.meta(ws).waiting) n++; return n; }
  roomIsMulti() { const s = this.liveSockets(); return s.length ? !!this.meta(s[0]).room : null; }
  roster() {
    return this.liveSockets().map(ws => {
      const c = this.meta(ws);
      return { id: c.id, name: c.name, lvl: c.lvl || 1, kills: c.kills || 0, deaths: c.deaths || 0, dead: !!c.dead, waiting: !!c.waiting };
    });
  }
  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
  sendToId(id, obj) { for (const ws of this.liveSockets()) if (this.meta(ws).id === id) { this.send(ws, obj); return; } }
  broadcast(obj, exceptId) { const s = JSON.stringify(obj); for (const ws of this.liveSockets()) { if (exceptId && this.meta(ws).id === exceptId) continue; try { ws.send(s); } catch (e) {} } }
  // TRỌNG TÀI phòng = socket còn sống LÂU NHẤT (vào sớm nhất). Ổn định qua F5 của
  // người khác: chỉ khi chính trọng tài rời đi mới chuyển cho người kế tiếp. Đây
  // là bên chạy AI boss + đồng hồ, nên phòng luôn có đúng MỘT trọng tài.
  authId() { const s = this.liveSockets(); return s.length ? (this.meta(s[0]).id || null) : null; }
  sendRoster() { this.broadcast({ t: 'roster', players: this.roster(), max: MAX, authId: this.authId() }); }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426, headers: CORS });
    }
    this.pruneDead();                    // dọn socket ma TRƯỚC khi đếm chỗ
    const existing = this.liveSockets();
    const reqMode = url.searchParams.get('m') || '1';
    // loại phòng do người đầu tiên quyết định; người sau kế thừa
    const room = existing.length ? !!this.meta(existing[0]).room : (reqMode === 'r');

    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];

    // từ chối nếu phòng quá tải (đóng ngay, client sẽ thấy 'full')
    const overfull = (!room && existing.length >= 2) || (room && existing.length >= MAX + 8);
    if (overfull) {
      this.state.acceptWebSocket(server);
      this.send(server, { t: 'full' });
      try { server.close(1000, 'full'); } catch (e) {}
      return new Response(null, { status: 101, webSocket: client });
    }

    this.state.acceptWebSocket(server);
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const name = String(url.searchParams.get('name') || 'Người chơi').slice(0, 14);
    const waiting = room && this.activeCount() >= MAX;
    this.setMeta(server, { id, name, room, waiting, lvl: 1, kills: 0, deaths: 0, dead: false, hp: 100, hpMax: 100 });

    this.send(server, { t: 'welcome', id, room, waiting, max: MAX, authId: this.authId(), slot: waiting ? 'Phòng đang đầy — bạn vào hàng chờ' : '' });
    this.sendRoster();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    let d; try { d = JSON.parse(message); } catch (e) { return; }
    if (!d || !d.t) return;
    const c = this.meta(ws);
    if (!c.id) return;
    d.id = c.id;                       // luôn tin id server gán, chống giả mạo
    switch (d.t) {
      case 'hello':
        c.name = String(d.name || c.name).slice(0, 14);
        c.lvl = d.lvl || 1; c.hp = d.hp || c.hp; c.hpMax = d.hpMax || c.hpMax;
        c.kills = d.kills || 0; c.deaths = d.deaths || 0; c.dead = !!d.dead;
        this.setMeta(ws, c);
        this.sendRoster();
        break;
      case 'stats':
        c.hp = d.hp; c.hpMax = d.hpMax || c.hpMax; c.lvl = d.lvl || c.lvl;
        c.dead = !!d.dead; c.kills = d.kills != null ? d.kills : c.kills; c.deaths = d.deaths != null ? d.deaths : c.deaths;
        if (d.name) c.name = String(d.name).slice(0, 14);
        this.setMeta(ws, c);
        this.broadcast(d, c.id);
        this.sendRoster();
        break;
      case 'pos':
        this.broadcast(d, c.id);
        break;
      case 'died':
        c.dead = true; this.setMeta(ws, c);
        this.broadcast({ t: 'died', id: c.id }, c.id);
        this.handleDeath(ws);
        this.sendRoster();
        break;
      case 'respawn':
        c.dead = false; c.hp = d.hp || c.hpMax; this.setMeta(ws, c);
        this.broadcast({ t: 'respawn', id: c.id, hp: c.hp }, c.id);
        this.sendRoster();
        break;
      default:
        // tin có _to (vd 'hit') → gửi đúng người nhận; còn lại phát cho mọi người
        if (d._to) this.sendToId(d._to, d);
        else this.broadcast(d, c.id);
    }
  }

  webSocketClose(ws, code, reason, wasClean) { this.onGone(ws); }
  webSocketError(ws, err) { this.onGone(ws); }

  onGone(ws) {
    const c = this.meta(ws);
    if (c._gone) return;                 // tránh xử lý 2 lần (pruneDead + sự kiện close)
    c._gone = true; this.setMeta(ws, c);
    const room = c.room;
    try { ws.close(); } catch (e) {}
    // ws đã bị gỡ khỏi getWebSockets() sau close; nếu còn chỗ, kéo người chờ vào
    if (room && this.activeCount() < MAX) {
      const w = this.liveSockets().find(s => this.meta(s).waiting);
      if (w) { const m = this.meta(w); m.waiting = false; this.setMeta(w, m); this.send(w, { t: 'setWaiting', waiting: false }); }
    }
    const id = c.id;
    if (id) this.broadcast({ t: 'bye', id });
    this.sendRoster();
  }

  // Khi một người ĐANG ĐÁNH chết mà phòng đầy và có người chờ:
  // người chết ra hàng chờ, người chờ đầu tiên được vào thay.
  handleDeath(ws) {
    const c = this.meta(ws);
    if (!c.room || c.waiting) return;
    const waiterWs = this.liveSockets().find(s => this.meta(s).waiting);
    if (!waiterWs) return;             // không ai chờ → hồi sinh bình thường
    c.waiting = true; this.setMeta(ws, c);
    this.send(ws, { t: 'setWaiting', waiting: true, reason: 'Bạn đã hết lượt — chờ tới lượt vào lại' });
    const wm = this.meta(waiterWs); wm.waiting = false; this.setMeta(waiterWs, wm);
    this.send(waiterWs, { t: 'setWaiting', waiting: false });
  }
}

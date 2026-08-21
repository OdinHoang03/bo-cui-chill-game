// ============================================================================
// Bổ Củi Chill 3D — Server phòng chơi mạng (Cloudflare Worker + Durable Object)
// ----------------------------------------------------------------------------
// Mỗi phòng = 1 Durable Object (định danh theo mã phòng). Người chơi kết nối
// WebSocket tới  wss://<worker>/room/<MÃ>?m=r|1&name=Tên .
// Server làm TRUNG CHUYỂN + TRỌNG TÀI: giữ danh sách người chơi (roster), hàng
// chờ, và xoay vòng khi có người chết trong phòng đã đầy. Vì server đứng giữa,
// không còn phụ thuộc NAT/TURN như P2P, và phòng vẫn sống kể cả khi người tạo
// phòng thoát.
// ============================================================================

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': '*',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('Bo Cui Chill 3D server OK', { headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' } });
    }
    // /room/<CODE>  — chỉ cho ký tự an toàn, độ dài 4..32
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{4,32})$/);
    if (!m) return new Response('Not found', { status: 404, headers: CORS });
    const code = m[1].toUpperCase();
    const id = env.ROOMS.idFromName(code);
    const stub = env.ROOMS.get(id);
    return stub.fetch(request);
  },
};

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = new Map();   // id -> {id, ws, name, lvl, kills, deaths, dead, waiting, hp, hpMax}
    this.mode = '1';            // '1' = 1v1, 'r' = phòng đông
    this.MAX = 8;               // số người đánh cùng lúc tối đa (chế độ phòng đông)
    this.seq = 0;
  }

  activeCount() { let n = 0; for (const c of this.clients.values()) if (!c.waiting) n++; return n; }
  roster() {
    return [...this.clients.values()].map(c => ({
      id: c.id, name: c.name, lvl: c.lvl, kills: c.kills, deaths: c.deaths, dead: c.dead, waiting: c.waiting,
    }));
  }
  send(c, obj) { try { c.ws.send(JSON.stringify(obj)); } catch (e) {} }
  sendTo(id, obj) { const c = this.clients.get(id); if (c) this.send(c, obj); }
  broadcast(obj, exceptId) { const s = JSON.stringify(obj); for (const [cid, c] of this.clients) { if (cid === exceptId) continue; try { c.ws.send(s); } catch (e) {} } }
  sendRoster() { this.broadcast({ t: 'roster', players: this.roster(), max: this.MAX }); }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426, headers: CORS });
    }
    const reqMode = url.searchParams.get('m') || '1';
    if (this.clients.size === 0) this.mode = (reqMode === 'r' ? 'r' : '1'); // người đầu tiên quyết định loại phòng

    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();

    // từ chối nếu phòng đã quá tải
    if (this.mode !== 'r' && this.clients.size >= 2) {
      try { server.send(JSON.stringify({ t: 'full' })); server.close(1000, 'full'); } catch (e) {}
      return new Response(null, { status: 101, webSocket: client });
    }
    if (this.mode === 'r' && this.clients.size >= this.MAX + 8) { // 8 đánh + tối đa 8 chờ
      try { server.send(JSON.stringify({ t: 'full' })); server.close(1000, 'full'); } catch (e) {}
      return new Response(null, { status: 101, webSocket: client });
    }

    const id = 'p' + (++this.seq) + Math.random().toString(36).slice(2, 6);
    const name = String(url.searchParams.get('name') || 'Người chơi').slice(0, 14);
    const room = this.mode === 'r';
    const waiting = room && this.activeCount() >= this.MAX;
    const c = { id, ws: server, name, lvl: 1, kills: 0, deaths: 0, dead: false, waiting, hp: 100, hpMax: 100 };
    this.clients.set(id, c);

    this.send(c, { t: 'welcome', id, room, waiting, max: this.MAX, slot: waiting ? 'Phòng đang đầy — bạn vào hàng chờ' : '' });
    this.sendRoster();

    server.addEventListener('message', ev => {
      let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (!d || !d.t) return;
      d.id = id; // luôn tin id do server gán, chống giả mạo
      this.onMsg(c, d);
    });
    const bye = () => {
      if (!this.clients.has(id)) return;
      this.clients.delete(id);
      // ai đó rời đi → nếu còn chỗ trống, kéo người trong hàng chờ vào
      if (this.mode === 'r' && this.activeCount() < this.MAX) {
        const w = [...this.clients.values()].find(x => x.waiting);
        if (w) { w.waiting = false; this.sendTo(w.id, { t: 'setWaiting', waiting: false }); }
      }
      this.broadcast({ t: 'bye', id });
      this.sendRoster();
    };
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);

    return new Response(null, { status: 101, webSocket: client });
  }

  onMsg(c, d) {
    switch (d.t) {
      case 'hello':
        c.name = String(d.name || c.name).slice(0, 14);
        c.lvl = d.lvl || 1; c.hp = d.hp || c.hp; c.hpMax = d.hpMax || c.hpMax;
        c.kills = d.kills || 0; c.deaths = d.deaths || 0; c.dead = !!d.dead;
        this.sendRoster();
        break;
      case 'stats':
        c.hp = d.hp; c.hpMax = d.hpMax || c.hpMax; c.lvl = d.lvl || c.lvl;
        c.dead = !!d.dead; c.kills = d.kills != null ? d.kills : c.kills; c.deaths = d.deaths != null ? d.deaths : c.deaths;
        if (d.name) c.name = String(d.name).slice(0, 14);
        this.broadcast(d, c.id);
        this.sendRoster();
        break;
      case 'pos':
        this.broadcast(d, c.id);
        break;
      case 'died':
        c.dead = true;
        this.broadcast({ t: 'died', id: c.id }, c.id);
        this.handleDeath(c);
        this.sendRoster();
        break;
      case 'respawn':
        c.dead = false; c.hp = d.hp || c.hpMax;
        this.broadcast({ t: 'respawn', id: c.id, hp: c.hp }, c.id);
        this.sendRoster();
        break;
      default:
        // tin nhắn có _to (vd 'hit') → chỉ gửi cho đúng người nhận; còn lại phát cho mọi người
        if (d._to) this.sendTo(d._to, d);
        else this.broadcast(d, c.id);
    }
  }

  // Khi một người ĐANG ĐÁNH chết mà phòng đầy và có người chờ:
  // người chết bị đẩy ra hàng chờ, người chờ đầu tiên được vào thay.
  handleDeath(c) {
    if (this.mode !== 'r') return;
    if (c.waiting) return;
    const waiter = [...this.clients.values()].find(x => x.waiting);
    if (!waiter) return; // không ai chờ → hồi sinh bình thường (client tự xử lý)
    c.waiting = true;
    this.sendTo(c.id, { t: 'setWaiting', waiting: true, reason: 'Bạn đã hết lượt — chờ tới lượt vào lại' });
    waiter.waiting = false;
    this.sendTo(waiter.id, { t: 'setWaiting', waiting: false });
  }
}

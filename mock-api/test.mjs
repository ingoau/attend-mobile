const B = 'http://127.0.0.1:4010';
let fails = 0;
async function call(method, path, token, body, form) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let b;
  if (form) b = form; else if (body) { headers['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
  const r = await fetch(B + path, { method, headers, body: b });
  const t = await r.text();
  let j = null;
  if (t) { try { j = JSON.parse(t); } catch { fails++; console.log('NOT JSON', method, path); } }
  return { s: r.status, j };
}
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const a = await call('POST', '/api/v1/session', null, { dev_email: 'admin@hackclub.com' });
const p = await call('POST', '/api/v1/session', null, { dev_email: 'participant-demo@hackclub.com' });
ok(a.j.token && a.j.user.is_organizer, 'admin login'); ok(p.j.token && !p.j.user.is_organizer, 'participant login');
const A = a.j.token, P = p.j.token;
ok((await call('GET', '/api/v1/me', A)).j.email === 'admin@hackclub.com', 'me');
ok((await call('GET', '/api/v1/me')).s === 401, 'me unauth');
const ev = (await call('GET', '/api/v1/events', A)).j.events;
console.log('events', ev.map(e => `${e.name} ${e.role} ${e.starts_at}`));
ok((await call('GET', '/api/v1/events', P)).j.events.length === 0, 'participant no events');
const at = (await call('GET', '/api/v1/tickets', A)).j.tickets, pt = (await call('GET', '/api/v1/tickets', P)).j.tickets;
console.log('tickets', at.map(t => t.event.name + ' ' + t.short_code + ' ' + t.qr_payload), pt.map(t => `${t.event.name} ${t.display_status} ci=${t.checked_in} msgs=${t.messages.length}`));
ok((await call('GET', `/api/v1/tickets/${pt[0].id}`, P)).j.ticket.id === pt[0].id, 'ticket show');
ok((await call('GET', `/api/v1/tickets/${pt[0].id}/google_wallet`, P)).j.url, 'wallet');
ok((await call('GET', `/api/v1/events/${ev[0].id}/participants`, P)).s === 403, 'participant 403');
const E = ev[0].id;
const roster = (await call('GET', `/api/v1/events/${E}/participants`, A)).j;
const st = {}; roster.participants.forEach(x => { const k = x.status + (x.checked_in_at ? '+in' : ''); st[k] = (st[k] || 0) + 1; });
console.log('roster', roster.participants.length, st, roster.synced_at);
const inc = (await call('GET', `/api/v1/events/${E}/participants?updated_since=${encodeURIComponent(roster.synced_at)}`, A)).j;
ok(inc.participants.length === 0, 'incremental empty');
ok((await call('GET', `/api/v1/events/${E}/participants/search?q=nguyen`, A)).j.results.length > 0, 'search');
const pe = roster.participants[2];
const det = (await call('GET', `/api/v1/events/${E}/participants/${pe.participant_event_id}`, A)).j.participant;
console.log('detail keys', Object.keys(det).join(','));
console.log('scans_by_context', det.scans_by_context.map(s => s.scan_context_name + ':' + s.scan_count).join(' '));
const notes = (await call('GET', `/api/v1/events/${E}/participants/${pe.participant_event_id}/notes`, A)).j.notes;
const nn = await call('POST', `/api/v1/events/${E}/participants/${pe.participant_event_id}/notes`, A, { content: 'Test note' });
ok(nn.s === 201 && (await call('GET', `/api/v1/events/${E}/participants/${pe.participant_event_id}/notes`, A)).j.notes.length === notes.length + 1, 'note added');
ok((await call('POST', `/api/v1/events/${E}/participants/${pe.participant_event_id}/id_checks`, A, { id_check: { outcome: 'match' } })).j.note_id, 'id check');
const ctxs = (await call('GET', `/api/v1/events/${E}/scan_contexts`, A)).j.scan_contexts;
console.log('contexts', ctxs.map(c => c.name).join(', '));
const scans = (await call('GET', `/api/v1/events/${E}/scans`, A)).j;
console.log('scans', scans.scans.length, scans.synced_at, scans.has_more);
const s2 = (await call('GET', `/api/v1/events/${E}/scans?since=${encodeURIComponent(scans.synced_at)}`, A)).j;
ok(s2.scans.length === 0 && !s2.has_more && s2.synced_at === scans.synced_at, 'scan cursor stable');
const notIn = roster.participants.find(x => x.status === 'complete' && !x.checked_in_at);
const sc = await call('POST', `/api/v1/events/${E}/scans`, A, { participant_id: notIn.participant_id, scan_context_id: ctxs[0].id, client_scan_id: 'c1', source: 'qr', scanned_at: new Date().toISOString() });
ok(sc.s === 201 && sc.j.outcome === 'scanned' && sc.j.participant.checked_in_at, 'scan checks in');
const sc2 = await call('POST', `/api/v1/events/${E}/scans`, A, { participant_id: notIn.participant_id, scan_context_id: ctxs[0].id, client_scan_id: 'c2', source: 'qr', scanned_at: new Date().toISOString() });
ok(sc2.j.outcome === 'already_scanned', 'already');
const dup = await call('POST', `/api/v1/events/${E}/scans`, A, { participant_id: notIn.participant_id, scan_context_id: ctxs[0].id, client_scan_id: 'c1', source: 'qr', scanned_at: new Date().toISOString() });
ok(dup.j.deduplicated, 'dedupe');
const s3 = (await call('GET', `/api/v1/events/${E}/scans?since=${encodeURIComponent(scans.synced_at)}`, A)).j;
ok(s3.scans.length === 2, 'new scans sync ' + s3.scans.length);
const inc2 = (await call('GET', `/api/v1/events/${E}/participants?updated_since=${encodeURIComponent(roster.synced_at)}`, A)).j;
ok(inc2.participants.length === 1, 'incremental after scan');
const badge = roster.participants.find(x => x.nfc_badge_token);
ok((await call('POST', `/api/v1/events/${E}/scans`, A, { badge_token: badge.nfc_badge_token, scan_context_id: ctxs[5].id, client_scan_id: 'c3', source: 'nfc', scanned_at: new Date().toISOString() })).j.success, 'nfc');
const wd = roster.participants.find(x => x.status === 'withdrawn');
console.log('withdrawn scan', (await call('POST', `/api/v1/events/${E}/scans`, A, { participant_id: wd.participant_id, client_scan_id: 'c4', source: 'qr', scanned_at: new Date().toISOString() })).s);
ok((await call('DELETE', `/api/v1/events/${E}/scans/${notIn.participant_event_id}?scan_context_id=${ctxs[0].id}`, A)).s === 204, 'undo');
ok(!(await call('GET', `/api/v1/events/${E}/participants/${notIn.participant_event_id}`, A)).j.participant.checked_in_at, 'undo clears');
const tr = (await call('GET', `/api/v1/events/${E}/travel`, A)).j;
console.log('travel', tr.dates, tr.counts, tr.entries.slice(0, 2));
ok((await call('POST', '/api/v1/push_tokens', A, { token: 'ExponentPushToken[x]' })).s < 300, 'push');
ok((await call('DELETE', '/api/v1/push_tokens/ExponentPushToken%5Bx%5D', A)).s === 204, 'push del');
const incs = (await call('GET', `/api/v1/events/${E}/incidents`, A)).j.incidents;
console.log('incidents', incs.map(i => `${i.severity}/${i.status}/${i.category}`).join(' '));
const iopt = (await call('GET', `/api/v1/events/${E}/incidents/options`, A)).j;
ok(iopt.levels.length === 4 && iopt.participants.length > 30, 'inc options');
const i0 = (await call('GET', `/api/v1/events/${E}/incidents/${incs[0].id}`, A)).j.incident;
ok(i0.timeline.length > 0, 'incident detail');
const ni = await call('POST', `/api/v1/events/${E}/incidents`, A, { incident: { category: 'medical', severity: 's2', status: 'open', summary: 'Headache', details: 'x', actions_taken: 'Panadol', location: 'Hall', occurred_at: new Date().toISOString(), medication_dispensed: true, visible_to_roles: ['event_admin'], participant_event_ids: [pe.participant_event_id], helping_staff_ids: [], medications_attributes: [{ name: 'Paracetamol', dose: '500mg' }] }, escalate: true, escalation: { reporter_phone: '1', emergency_services_called: false } });
ok(ni.s === 201 && ni.j.incident.hq_report && ni.j.notice, 'create incident');
ok((await call('PATCH', `/api/v1/events/${E}/incidents/${ni.j.incident.id}`, A, { incident: { summary: 'Bad headache' } })).j.incident.summary === 'Bad headache', 'patch inc');
ok((await call('POST', `/api/v1/events/${E}/incidents/${incs[0].id}/escalate`, A, { escalation: { reporter_phone: '1', emergency_services_called: false } })).s < 500, 'escalate');
ok((await call('POST', `/api/v1/events/${E}/incidents/${incs[0].id}/comments`, A, { comment: { body: 'hi', new_status: 'closed' } })).j.incident_status === 'closed', 'comment');
const msgs = (await call('GET', `/api/v1/events/${E}/messages`, A)).j.messages;
console.log('messages', msgs.map(m => `${m.status}:${m.recipient_count}/${m.sent_count}/${m.failed_count}`).join(' '));
ok((await call('GET', `/api/v1/events/${E}/messages/options`, A)).j.audiences.length, 'msg opts');
const md = (await call('GET', `/api/v1/events/${E}/messages/${msgs[0].id}`, A)).j.message;
ok(md.recipients && md.permissions && md.body_html, 'msg detail');
const pv = (await call('GET', `/api/v1/events/${E}/messages/${msgs[0].id}/preview`, A)).j.preview;
ok(pv.total_count >= 0 && pv.body_html, 'preview');
const nm = await call('POST', `/api/v1/events/${E}/messages`, A, { message: { subject: 'Hi', body: 'Body', audience: 'checked_in', channels: ['push'], participant_event_ids: [], group_ids: [], scheduled_at: null } });
ok(nm.s === 201 && nm.j.message.status === 'draft', 'create msg');
ok((await call('PATCH', `/api/v1/events/${E}/messages/${nm.j.message.id}`, A, { message: { subject: 'Hi2', body: 'Body', audience: 'checked_in', channels: ['push'], participant_event_ids: [], group_ids: [], scheduled_at: new Date(Date.now() + 864e5).toISOString() } })).j.message.status === 'scheduled', 'update msg');
for (const act of ['cancel', 'send_now', 'retry_failed', 'retry_delivery', 'send_to_new_recipients']) {
  const r = await call('POST', `/api/v1/events/${E}/messages/${nm.j.message.id}/${act}`, A, {}); ok(r.s === 200 && r.j.notice, act);
}
ok((await call('DELETE', `/api/v1/events/${E}/messages/${nm.j.message.id}`, A)).s === 204, 'del msg');
for (const [T, n] of [[A, 'admin'], [P, 'part']]) {
  const ib = (await call('GET', '/api/v1/messages', T)).j;
  console.log('inbox', n, ib.messages.length, ib.unread_count, ib.events.length);
  ok((await call('GET', `/api/v1/messages/${ib.messages[0].id}`, T)).j.message.body_html, 'inbox msg');
  ok((await call('GET', `/api/v1/messages?event_id=${ib.events[0].id}&q=a`, T)).s === 200, 'inbox filter');
  const ro = (await call('GET', '/api/v1/incident_reports/options', T)).j;
  ok(ro.levels && ro.events.length, 'report opts ' + JSON.stringify(ro.events));
}
const fd = new FormData(); fd.append('incident_report[priority]', 's1'); fd.append('event_choice', E);
const rep = await call('POST', '/api/v1/incident_reports', P, null, fd);
ok(rep.s === 201 && rep.j.incident_report.priority === 's1', 'report submit');
for (const e of ev.slice(1)) {
  for (const path of ['participants', 'scan_contexts', 'scans', 'travel', 'incidents', 'messages']) {
    const r = await call('GET', `/api/v1/events/${e.id}/${path}`, A); ok(r.s === 200, `${e.name} ${path}`);
  }
}
ok((await call('DELETE', '/api/v1/session', A)).s === 204 && (await call('GET', '/api/v1/me', A)).s === 401, 'logout');
console.log('FAILS', fails);

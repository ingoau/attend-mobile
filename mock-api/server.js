#!/usr/bin/env node
// Mock Attend API for screenshotting the Attend mobile app.
// Plain Node 18+, no dependencies. PORT env (default 4010), binds 0.0.0.0.
// Logins (POST /api/v1/session {dev_email}):
//   admin@hackclub.com             organiser (global admin) + one attendee ticket
//   participant-demo@hackclub.com  attendee only, three tickets
'use strict';

const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 4010);

// ---------------------------------------------------------------- helpers
const uuid = (seed) => {
  const h = crypto.createHash('md5').update('attend-mock:' + seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
let rngState = 20261115;
const rand = () => {
  rngState |= 0; rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const pad = (n) => String(n).padStart(2, '0');
// Local wall time in an offset -> ISO string with that offset.
const local = (date, time, offset) => `${date}T${time.length === 5 ? time + ':00' : time}${offset}`;
const toUtc = (iso) => new Date(iso).toISOString();
const nowIso = () => new Date().toISOString();
const addMinutes = (iso, mins, offset) => {
  // keep output in the given offset
  const d = new Date(new Date(iso).getTime() + mins * 60000);
  const sign = offset[0] === '-' ? -1 : 1;
  const [oh, om] = offset.slice(1).split(':').map(Number);
  const l = new Date(d.getTime() + sign * (oh * 60 + om) * 60000);
  return `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}T${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}:00${offset}`;
};
const shortCode = (seed) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const h = crypto.createHash('sha1').update('code:' + seed).digest();
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[h[i] % alphabet.length];
  return s;
};
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (text) => String(text || '').split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
const previewText = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140);

// ---------------------------------------------------------------- users
const USERS = {
  admin: {
    id: uuid('user:admin'), email: 'admin@hackclub.com', name: 'Riley Admin',
    global_admin: true, is_organizer: true, is_participant: true,
  },
  participant: {
    id: uuid('user:participant'), email: 'participant-demo@hackclub.com', name: 'Jamie Demo',
    global_admin: false, is_organizer: false, is_participant: true,
  },
};
const STAFF = [
  { id: USERS.admin.id, name: USERS.admin.name, email: USERS.admin.email },
  { id: uuid('staff:1'), name: 'Priya Natarajan', email: 'priya@hackclub.com' },
  { id: uuid('staff:2'), name: 'Tom Whitfield', email: 'tom@hackclub.com' },
  { id: uuid('staff:3'), name: 'Mei Lin', email: 'mei@hackclub.com' },
  { id: uuid('staff:4'), name: 'Callum O\'Brien', email: 'callum@hackclub.com' },
];
const tokens = new Map([
  ['mock-token-admin', 'admin'],
  ['mock-token-participant', 'participant'],
]);

// ---------------------------------------------------------------- events
const FULL_ACCESS = {
  can_view_participant_pii: true, can_view_participants: true, can_view_sensitive_data: true,
  can_view_incidents: true,
};
const EVENTS = {
  sydney: {
    id: uuid('event:sydney'), name: 'Harbourhack Sydney 2026', slug: 'harbourhack-sydney-2026',
    starts_at: '2026-11-14T09:00:00+11:00', ends_at: '2026-11-16T15:00:00+11:00',
    timezone: 'Australia/Sydney', location_city: 'Sydney', location_country: 'Australia',
    location_address: 'Level 3, 1 Wharf Lane, Pyrmont NSW 2009',
    location_latitude: -33.8688, location_longitude: 151.1957, travel_enabled: true,
  },
  melbourne: {
    id: uuid('event:melbourne'), name: 'Southern Lights Melbourne', slug: 'southern-lights-melbourne',
    starts_at: '2026-12-05T09:00:00+11:00', ends_at: '2026-12-06T17:00:00+11:00',
    timezone: 'Australia/Melbourne', location_city: 'Melbourne', location_country: 'Australia',
    location_address: '12 Flinders Lane, Melbourne VIC 3000',
    location_latitude: -37.8162, location_longitude: 144.9706, travel_enabled: true,
  },
  brisbane: {
    id: uuid('event:brisbane'), name: 'Winter Build Brisbane', slug: 'winter-build-brisbane',
    starts_at: '2026-07-11T09:00:00+10:00', ends_at: '2026-07-12T16:00:00+10:00',
    timezone: 'Australia/Brisbane', location_city: 'Brisbane', location_country: 'Australia',
    location_address: '88 Grey Street, South Brisbane QLD 4101',
    location_latitude: -27.4766, location_longitude: 153.0166, travel_enabled: false,
  },
  adelaide: {
    id: uuid('event:adelaide'), name: 'Outback Jam Adelaide', slug: 'outback-jam-adelaide',
    starts_at: '2027-01-16T09:00:00+10:30', ends_at: '2027-01-17T16:00:00+10:30',
    timezone: 'Australia/Adelaide', location_city: 'Adelaide', location_country: 'Australia',
    location_address: '45 North Terrace, Adelaide SA 5000',
    location_latitude: -34.9206, location_longitude: 138.6036, travel_enabled: true,
  },
  perth: {
    id: uuid('event:perth'), name: 'Sunset Hacks Perth', slug: 'sunset-hacks-perth',
    starts_at: '2026-09-19T09:00:00+08:00', ends_at: '2026-09-20T16:00:00+08:00',
    timezone: 'Australia/Perth', location_city: 'Perth', location_country: 'Australia',
    location_address: '200 St Georges Terrace, Perth WA 6000',
    location_latitude: -31.9545, location_longitude: 115.8569, travel_enabled: false,
  },
};
const OFFSETS = { sydney: '+11:00', melbourne: '+11:00', brisbane: '+10:00', adelaide: '+10:30', perth: '+08:00' };
const eventByIdOrSlug = (id) => Object.entries(EVENTS).find(([, e]) => e.id === id || e.slug === id);
// Organiser standings per user
const ORGANISER = {
  admin: { sydney: 'global_admin', melbourne: 'event_admin', brisbane: 'safeguarding_lead' },
  participant: {},
};
const eventForUser = (userKey, key) => ({ ...EVENTS[key], role: ORGANISER[userKey][key], ...FULL_ACCESS });

// ---------------------------------------------------------------- per-event state
const state = {}; // key -> { participants: [], scans: [], contexts: [], notes: {}, incidents: [], messages: [], groups: [] }
for (const k of Object.keys(EVENTS)) state[k] = { participants: [], scans: [], contexts: [], notes: {}, incidents: [], messages: [], groups: [], travelExtras: {} };

const FIRST = ['Ava', 'Noah', 'Mia', 'Liam', 'Zoe', 'Ethan', 'Isla', 'Kai', 'Chloe', 'Arjun', 'Grace', 'Oliver', 'Sienna', 'Lucas', 'Matilda', 'Hamish', 'Aisha', 'Jack', 'Ruby', 'Tane',
  'Harper', 'Leo', 'Priyanka', 'Finn', 'Evie', 'Mohammed', 'Willow', 'Hugo', 'Ngaio', 'Darcy', 'Sofia', 'Jasper', 'Ling', 'Archie', 'Amelia', 'Rohan', 'Ivy', 'Charlie', 'Yuki', 'Max',
  'Layla', 'Felix', 'Nina', 'Oscar', 'Hana', 'Sam', 'Ellie', 'Benji', 'Tilly', 'Rafael'];
const LAST = ['Nguyen', 'Smith', 'Patel', 'Williams', 'Chen', 'Brown', 'Kaur', 'Jones', 'Wilson', 'Taylor', 'Singh', 'Anderson', 'Thompson', 'Martin', 'White', 'Kim', 'Walker', 'Harris', 'Tran', 'Lee',
  'Robinson', 'Murphy', 'Kelly', 'Ryan', 'Clarke', 'Hughes', 'Ali', 'Wang', 'Edwards', 'Wright', 'Hall', 'Young', 'King', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Hill', 'Campbell'];
const PRONOUNS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they'];
const CITIES = [
  { city: 'Melbourne', airport: 'MEL', state: 'VIC', pc: '3000' }, { city: 'Brisbane', airport: 'BNE', state: 'QLD', pc: '4000' },
  { city: 'Adelaide', airport: 'ADL', state: 'SA', pc: '5000' }, { city: 'Perth', airport: 'PER', state: 'WA', pc: '6000' },
  { city: 'Hobart', airport: 'HBA', state: 'TAS', pc: '7000' }, { city: 'Auckland', airport: 'AKL', state: 'Auckland', pc: '1010' },
  { city: 'Darwin', airport: 'DRW', state: 'NT', pc: '0800' }, { city: 'Gold Coast', airport: 'OOL', state: 'QLD', pc: '4217' },
];
const LOCAL = [
  { city: 'Parramatta', state: 'NSW', pc: '2150' }, { city: 'Chatswood', state: 'NSW', pc: '2067' }, { city: 'Newcastle', state: 'NSW', pc: '2300' },
  { city: 'Wollongong', state: 'NSW', pc: '2500' }, { city: 'Canberra', state: 'ACT', pc: '2601' }, { city: 'Bondi', state: 'NSW', pc: '2026' },
];
const STREETS = ['Banksia St', 'Wattle Ave', 'Jacaranda Cres', 'Ocean Pde', 'Gum Tree Rd', 'Lorikeet Way', 'Harbour View Dr', 'Kookaburra Ct'];
const GROUP_DEFS = [
  { name: 'Team Kookaburra', color: '#ec3750' }, { name: 'Team Wombat', color: '#ff8c37' },
  { name: 'Team Platypus', color: '#33d6a6' }, { name: 'Team Quokka', color: '#338eda' },
  { name: 'Volunteers', color: '#a633d6' },
];
const phone = () => `+61 4${Math.floor(rand() * 10)}${Math.floor(rand() * 10)} ${String(Math.floor(rand() * 1000)).padStart(3, '0')} ${String(Math.floor(rand() * 1000)).padStart(3, '0')}`;

function makeContexts(key) {
  const off = OFFSETS[key];
  const e = EVENTS[key];
  const d0 = e.starts_at.slice(0, 10);
  const d1 = new Date(new Date(d0 + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
  const defs = [
    { name: 'Check-in', checks_in: true, is_airport: false, starts_at: null, ends_at: null },
    { name: 'Airport pickup', checks_in: false, is_airport: true, starts_at: null, ends_at: null },
    { name: 'Lunch Sat', checks_in: false, is_airport: false, starts_at: local(d0, '12:00', off), ends_at: local(d0, '14:00', off) },
    { name: 'Dinner Sat', checks_in: false, is_airport: false, starts_at: local(d0, '18:00', off), ends_at: local(d0, '20:00', off) },
    { name: 'Breakfast Sun', checks_in: false, is_airport: false, starts_at: local(d1, '07:30', off), ends_at: local(d1, '09:30', off) },
    { name: 'Swag', checks_in: false, is_airport: false, starts_at: null, ends_at: null },
  ];
  return defs.map((d, i) => ({ id: uuid(`ctx:${key}:${d.name}`), position: i + 1, ...d }));
}

function makeTravel(key, pe, direction, mode, origin, opts = {}) {
  const off = OFFSETS[key];
  const e = EVENTS[key];
  const startDate = e.starts_at.slice(0, 10);
  const endDate = e.ends_at.slice(0, 10);
  const dest = { city: e.location_city, airport: { Sydney: 'SYD', Melbourne: 'MEL', Brisbane: 'BNE', Adelaide: 'ADL', Perth: 'PER' }[e.location_city] };
  const id = uuid(`travel:${pe}:${direction}`);
  const base = {
    id, direction, mode, is_unaccompanied_minor: !!opts.minor, legs: [],
    visa_required: origin.city === 'Auckland', visa_status: origin.city === 'Auckland' ? 'approved' : 'not_required',
    passport_nationality: origin.city === 'Auckland' ? 'New Zealand' : 'Australia',
  };
  if (origin.city === 'Auckland') base.visa_type = 'eTA (subclass 601)';
  const inbound = direction === 'inbound';
  const day = inbound ? startDate : endDate;
  const hour = inbound ? 7 + Math.floor(rand() * 4) : 15 + Math.floor(rand() * 4);
  const minute = pick(['00', '15', '25', '40', '50']);
  if (mode === 'plane') {
    const carrier = pick(['Qantas', 'Virgin Australia', 'Jetstar']);
    const code = { Qantas: 'QF', 'Virgin Australia': 'VA', Jetstar: 'JQ' }[carrier];
    const num = String(400 + Math.floor(rand() * 500));
    const dur = origin.airport === 'PER' ? 300 : origin.airport === 'AKL' ? 200 : 90;
    const dep = inbound ? addMinutes(local(day, `${pad(hour)}:${minute}`, off), -dur, off) : local(day, `${pad(hour)}:${minute}`, off);
    const arr = addMinutes(dep, dur, off);
    const from = inbound ? origin.airport : dest.airport;
    const to = inbound ? dest.airport : origin.airport;
    Object.assign(base, {
      carrier, flight_number: code + num, departure_city: inbound ? origin.city : dest.city, arrival_city: inbound ? dest.city : origin.city,
      departure_time: dep, arrival_time: arr, expected_arrival_time: arr,
    });
    base.legs.push({
      id: uuid(`leg:${id}:1`), position: 1, flight_code: code + num, departure_airport: from, arrival_airport: to,
      departure_time: dep, arrival_time: arr,
      live_status: opts.delayed ? 'delayed' : (inbound && key === 'sydney' ? 'landed' : 'scheduled'),
      live_departure_time: opts.delayed ? addMinutes(dep, 45, off) : dep,
      live_arrival_time: opts.delayed ? addMinutes(arr, 45, off) : arr,
      ...(opts.pickedUp ? { airport_picked_up_at: addMinutes(arr, 35, off) } : {}),
    });
  } else if (mode === 'train') {
    const station = pick(['Canberra', 'Newcastle Interchange', 'Wollongong', 'Goulburn']);
    const dep = local(day, `${pad(hour)}:${minute}`, off);
    const arr = addMinutes(dep, 180, off);
    Object.assign(base, {
      carrier: station === 'Canberra' || station === 'Goulburn' ? 'NSW TrainLink' : 'Sydney Trains',
      train_departure_station: inbound ? station : 'Central', train_arrival_station: inbound ? 'Central' : station,
      departure_station: inbound ? station : 'Central', arrival_station: inbound ? 'Central' : station,
      departure_city: inbound ? station.split(' ')[0] : dest.city, arrival_city: inbound ? dest.city : station.split(' ')[0],
      departure_time: dep, arrival_time: arr, expected_arrival_time: arr,
    });
  } else if (mode === 'bus') {
    const dep = local(day, `${pad(hour)}:${minute}`, off);
    const arr = addMinutes(dep, 240, off);
    Object.assign(base, {
      carrier: 'Murrays Coaches',
      bus_departure_location: inbound ? 'Jolimont Centre, Canberra' : 'Central Station Coach Bay',
      bus_arrival_location: inbound ? 'Central Station Coach Bay' : 'Jolimont Centre, Canberra',
      departure_city: inbound ? 'Canberra' : dest.city, arrival_city: inbound ? dest.city : 'Canberra',
      departure_time: dep, arrival_time: arr, expected_arrival_time: arr,
    });
  } else if (mode === 'car') {
    const dep = local(day, `${pad(hour)}:${minute}`, off);
    Object.assign(base, {
      origin_address: opts.address,
      departure_time: inbound ? undefined : dep, arrival_time: inbound ? dep : undefined,
      expected_arrival_time: inbound ? dep : undefined,
      other_details: inbound ? 'Dropped off by parent' : 'Collected by parent',
    });
  } else {
    Object.assign(base, { other_details: 'Walking from home, lives nearby' });
  }
  if (opts.unscheduled) {
    delete base.departure_time; delete base.arrival_time; delete base.expected_arrival_time;
    base.legs = [];
    base.notes = 'Still booking, will confirm by Friday';
  }
  if (mode === 'plane' && inbound && opts.dismissed) base.pickup_dismissed_at = base.arrival_time;
  for (const k of Object.keys(base)) if (base[k] === undefined) delete base[k];
  return base;
}

function seedEvent(key, count, opts) {
  const s = state[key];
  const off = OFFSETS[key];
  const e = EVENTS[key];
  s.contexts = makeContexts(key);
  s.groups = GROUP_DEFS.map((g) => ({ id: uuid(`group:${key}:${g.name}`), ...g }));
  const d0 = e.starts_at.slice(0, 10);
  const d1 = new Date(new Date(d0 + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
  const eventStartYear = Number(d0.slice(0, 4));

  for (let i = 0; i < count; i++) {
    const first = FIRST[(i + opts.nameOffset) % FIRST.length];
    const last = LAST[(i * 7 + opts.nameOffset) % LAST.length];
    const peId = uuid(`pe:${key}:${i}`);
    const pId = uuid(`person:${first}:${last}`);
    const age = i % 9 === 0 ? 18 : 13 + (i % 5);
    const minor = age < 18;
    const preferred = i % 11 === 3 ? first.slice(0, 3) : undefined;
    const display = `${preferred || first} ${last}`;
    let status = 'complete';
    if (opts.statuses && opts.statuses[i]) status = opts.statuses[i];
    const checkedIn = status === 'complete' && opts.checkedIn(i);
    const modeCycle = ['plane', 'plane', 'train', 'car', 'plane', 'bus', 'plane', 'car', 'other'];
    const mode = [11, 23, 29].includes(i) ? 'plane' : modeCycle[i % modeCycle.length];
    // Flyers come from interstate; everyone else lives within reach of the venue.
    const origin = mode === 'plane' ? CITIES[i % CITIES.length] : LOCAL[i % LOCAL.length];
    const address = { line_1: `${10 + i * 3} ${STREETS[i % STREETS.length]}`, city: origin.city, state: origin.state, postal_code: origin.pc, country: origin.city === 'Auckland' ? 'New Zealand' : 'Australia' };
    const parentFirst = pick(['Karen', 'David', 'Mei', 'Sanjay', 'Rachel', 'Andrew', 'Fatima', 'Michael', 'Lisa', 'Hiroshi']);
    const guardianName = `${parentFirst} ${last}`;
    const guardianEmail = `${parentFirst.toLowerCase()}.${last.toLowerCase()}@example.com`;
    const guardianPhone = phone();

    // medical/dietary mix
    const anaphylaxis = i % 8 === 2;
    const allergies = anaphylaxis ? pick(['Peanuts, tree nuts', 'Shellfish', 'Sesame']) : (i % 6 === 1 ? 'Hay fever, dust mites' : undefined);
    const diet = pick(['No restrictions', 'No restrictions', 'No restrictions', 'Vegetarian', 'Vegan', 'Halal', 'Gluten free', 'Pescatarian']);
    const conditions = i % 7 === 4 ? 'Asthma' : (i % 13 === 5 ? 'Type 1 diabetes' : undefined);
    const medications = conditions === 'Asthma' ? 'Ventolin inhaler as needed' : conditions === 'Type 1 diabetes' ? 'Insulin (NovoRapid), CGM worn on arm' : (anaphylaxis ? 'EpiPen 300mcg x2' : undefined);

    let travelIn, travelOut;
    if (e.travel_enabled && status !== 'invited') {
      const addr = `${address.line_1}, ${address.city} ${address.state} ${address.postal_code}`;
      travelIn = makeTravel(key, peId, 'inbound', mode, origin, { minor: minor && mode === 'plane' && i % 3 === 0, address: addr, delayed: i === 4, pickedUp: mode === 'plane' && (checkedIn || i === 11 || i === 29), unscheduled: i === 31 || i === 17, dismissed: i === 12 });
      travelOut = makeTravel(key, peId, 'outbound', mode, origin, { minor: minor && mode === 'plane' && i % 3 === 0, address: addr, unscheduled: i === 31 });
    }

    const updatedAt = toUtc(local(d0, '08:00', off));
    const p = {
      participant_id: pId,
      participant_event_id: peId,
      display_name: display,
      full_name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
      phone: phone(),
      pronouns: PRONOUNS[i % PRONOUNS.length],
      headshot_url: null,
      status,
      checked_in_at: null,
      has_anaphylaxis_risk: anaphylaxis,
      requires_refrigeration: conditions === 'Type 1 diabetes',
      allergies,
      medical_conditions: conditions,
      medications,
      diet_type: diet,
      life_threatening_allergies: anaphylaxis ? allergies : undefined,
      cross_contamination_risk: anaphylaxis || diet === 'Gluten free',
      freedom_waiver_granted: !minor || i % 4 === 0,
      high_support_flag: i === 9 || i === 22,
      can_leave_unaccompanied: !minor || i % 4 === 0,
      waiver_signed: status === 'complete' || status === 'withdrawn',
      emergency_contacts: [
        { id: uuid(`ec:${peId}:1`), name: guardianName, phone: guardianPhone, email: guardianEmail, relationship: pick(['Mother', 'Father', 'Parent']), priority: 1, is_primary: true },
        ...(i % 3 === 0 ? [{ id: uuid(`ec:${peId}:2`), name: `${pick(['Sue', 'Bruce', 'Anh', 'Deepa'])} ${pick(LAST)}`, phone: phone(), relationship: pick(['Aunt', 'Uncle', 'Grandparent', 'Family friend']), priority: 2, is_primary: false }] : []),
      ],
      parent_guardian_name: minor ? guardianName : undefined,
      parent_guardian_phone: minor ? guardianPhone : undefined,
      parent_guardian_email: minor ? guardianEmail : undefined,
      travel_inbound: travelIn,
      travel_outbound: travelOut,
      nfc_badge_token: checkedIn && i % 2 === 0 ? `nfc_${crypto.createHash('sha1').update(peId).digest('hex').slice(0, 16)}` : undefined,
      nfc_badge_assigned: checkedIn && i % 2 === 0,
      slack_user_id: i % 3 !== 2 ? `U0${crypto.createHash('sha1').update(pId).digest('hex').slice(0, 8).toUpperCase()}` : undefined,
      updated_at: updatedAt,
      // detail-only
      personal: {
        legal_first_name: first, legal_last_name: last, preferred_name: preferred,
        date_of_birth: `${eventStartYear - age - 1}-${pad(1 + (i % 12))}-${pad(1 + ((i * 3) % 28))}`,
        age, tshirt_size: pick(['XS', 'S', 'M', 'L', 'XL']),
        secondary_email: i % 5 === 0 ? `${first.toLowerCase()}@school.example.edu.au` : undefined,
        engagement_preference: pick(['very_social', 'somewhat_social', 'prefer_quiet']),
        engagement_notes: i % 10 === 6 ? 'First hackathon, a bit nervous. Loves robotics.' : undefined,
        address,
      },
      accommodation: e.travel_enabled ? {
        check_in_date: d0, check_out_date: e.ends_at.slice(0, 10),
        gender_identity: pick(['female', 'male', 'non_binary']),
        assigned_room: i % 10 === 7 ? undefined : `Room ${100 + Math.floor(i / 4) + 1}`,
        rooming_exempt: mode === 'car' && i % 2 === 1,
        venue_name: key === 'sydney' ? 'Pyrmont Bay YHA' : 'Flinders Lane Hostel',
        preferred_roommate_genders: ['same_gender'],
        roommate_preferences: i % 4 === 1 ? `${FIRST[(i + 1) % FIRST.length]} ${LAST[((i + 1) * 7) % LAST.length]}` : undefined,
        quiet_room_preference: i % 5 === 2,
        room_type_preference: pick(['shared', 'shared', 'single']),
        accessibility_needs: i === 22 ? 'Ground floor room preferred' : undefined,
      } : undefined,
      consents: [
        { id: uuid(`consent:${peId}:waiver`), consent_type: 'liability_waiver', status: status === 'complete' ? 'signed' : 'pending', sent_at: toUtc(local('2026-10-01', '10:00', off)), viewed_at: toUtc(local('2026-10-02', '19:21', off)), ...(status === 'complete' ? { participant_signed_at: toUtc(local('2026-10-02', '19:25', off)), guardian_signed_at: minor ? toUtc(local('2026-10-03', '08:10', off)) : undefined, signed_at: toUtc(local('2026-10-03', '08:10', off)) } : { pending_on: minor ? 'guardian' : 'participant' }) },
        { id: uuid(`consent:${peId}:media`), consent_type: 'media_release', status: i % 6 === 5 ? 'declined' : 'signed', signed_at: toUtc(local('2026-10-03', '08:12', off)) },
        { id: uuid(`consent:${peId}:coc`), consent_type: 'code_of_conduct', status: 'signed', signed_at: toUtc(local('2026-10-02', '19:30', off)) },
      ],
      guardians: minor ? [{
        id: uuid(`pg:${peId}`), guardian_id: uuid(`guardian:${guardianEmail}`), name: guardianName, email: guardianEmail, phone: guardianPhone,
        relationship: 'Parent', is_primary: true, status: status === 'awaiting_guardian' ? 'invited' : 'completed',
        invited_via_email: guardianEmail, invite_token_sent_at: toUtc(local('2026-10-01', '10:00', off)),
        ...(status === 'awaiting_guardian' ? {} : { accepted_at: toUtc(local('2026-10-02', '21:00', off)), completed_at: toUtc(local('2026-10-03', '08:10', off)) }),
        media_permission: i % 6 !== 5, photo_permission: i % 6 !== 5, travel_permission: true,
        emergency_medical_consent: true, otc_medication_consent: i % 5 !== 3,
      }] : [],
      medical_detail: (anaphylaxis || conditions) ? {
        allergy_severity: anaphylaxis ? 'Severe (anaphylaxis)' : undefined,
        emergency_action_plan: anaphylaxis ? 'ASCIA action plan: administer EpiPen to outer thigh, call 000, lay flat. Second EpiPen after 5 min if no response.' : (conditions === 'Type 1 diabetes' ? 'If BGL < 4 give 150ml juice, recheck in 15 min. Hypo kit in blue pouch.' : undefined),
        additional_notes: conditions === 'Asthma' ? 'Exercise-induced; carries own inhaler.' : undefined,
      } : undefined,
      dietary_detail: diet !== 'No restrictions' || anaphylaxis ? { intolerances: diet === 'Gluten free' ? 'Coeliac' : undefined, notes: anaphylaxis ? 'Needs separately prepared meals, no shared serving utensils.' : `${diet} meals please.` } : undefined,
      accessibility: (i === 22 || i === 14) ? {
        mobility_needs: i === 22 ? 'Uses crutches after knee surgery' : undefined, step_free_required: i === 22, uses_wheelchair: false,
        noise_sensitivity: i === 14, has_autism: i === 14, neurodivergent_notes: i === 14 ? 'May need quiet breaks; has noise-cancelling headphones.' : undefined,
        prayer_space_required: false,
      } : undefined,
      safeguarding_detail: (i === 9 || i === 22) ? {
        high_support_notes: i === 9 ? 'Check in with them at meal times. Contact mum if anything comes up.' : 'Extra time needed moving between floors.',
        authorized_pickup_adults: `${guardianName} (parent), ${pick(['Sue', 'Bruce'])} ${last} (grandparent)`,
        other_instructions: 'Must not leave venue without staff escort.',
      } : undefined,
    };
    stripUndefined(p);
    s.participants.push(p);
    p._groupIds = [s.groups[i % 4].id];

    if (checkedIn) {
      const inTime = local(d0, `${pad(9 + Math.floor(i / 12))}:${pad((i * 7) % 60)}`, off);
      addScan(key, p, s.contexts[0], inTime, 'qr', USERS.admin.name);
      if (mode === 'plane' && travelIn && travelIn.arrival_time) addScan(key, p, s.contexts[1], addMinutes(travelIn.arrival_time, 30, off), 'qr', 'Tom Whitfield');
      if (i % 5 !== 1) addScan(key, p, s.contexts[2], local(d0, `12:${pad(10 + (i % 40))}`, off), i % 2 ? 'nfc' : 'qr', 'Priya Natarajan');
      if (i % 4 !== 2) addScan(key, p, s.contexts[3], local(d0, `18:${pad(5 + (i % 50))}`, off), 'nfc', 'Mei Lin');
      if (opts.day2 && i % 3 !== 0) addScan(key, p, s.contexts[4], local(d1, `08:${pad(i % 55)}`, off), 'qr', 'Callum O\'Brien');
      if (i % 2 === 0) addScan(key, p, s.contexts[5], local(d0, `10:${pad(i % 55)}`, off), 'manual', 'Priya Natarajan');
      // one double scan for "already scanned" counts
      if (i === 3) addScan(key, p, s.contexts[2], local(d0, '13:20', off), 'qr', 'Mei Lin');
    }
  }
}

function stripUndefined(o) {
  for (const k of Object.keys(o)) {
    if (o[k] === undefined) delete o[k];
    else if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) stripUndefined(o[k]);
    else if (Array.isArray(o[k])) o[k].forEach((x) => x && typeof x === 'object' && stripUndefined(x));
  }
  return o;
}

let scanSeq = 0;
function addScan(key, p, ctx, scannedAt, source, scannedBy, clientScanId) {
  const s = state[key];
  scanSeq++;
  // created_at gets distinct milliseconds so the cursor always advances
  const created = new Date(Math.min(new Date(scannedAt).getTime() + 2000, Date.now()) + (scanSeq % 1000)).toISOString();
  const scan = {
    id: uuid(`scan:${key}:${scanSeq}:${p.participant_event_id}`),
    participant_id: p.participant_id,
    participant_event_id: p.participant_event_id,
    scanned_at: toUtc(scannedAt),
    scanned_by: scannedBy,
    client_scan_id: clientScanId || null,
    source,
    scan_context: publicContext(ctx),
    created_at: created,
  };
  s.scans.push(scan);
  if (ctx.checks_in && !p.checked_in_at) p.checked_in_at = scan.scanned_at;
  return scan;
}
const publicContext = (c) => ({ id: c.id, name: c.name, checks_in: c.checks_in, is_airport: c.is_airport, position: c.position, starts_at: c.starts_at, ends_at: c.ends_at });

// Sydney (live): 40 people with a spread of statuses
const sydStatuses = { 33: 'awaiting_guardian', 34: 'awaiting_guardian', 35: 'in_progress', 36: 'in_progress', 37: 'invited', 38: 'withdrawn', 39: 'rejected' };
seedEvent('sydney', 40, { nameOffset: 0, statuses: sydStatuses, checkedIn: (i) => i < 33 && i % 6 !== 5, day2: true });
seedEvent('melbourne', 14, { nameOffset: 17, statuses: { 10: 'awaiting_guardian', 11: 'in_progress', 12: 'invited', 13: 'withdrawn' }, checkedIn: () => false, day2: false });
seedEvent('brisbane', 18, { nameOffset: 29, statuses: { 16: 'withdrawn' }, checkedIn: (i) => i !== 15, day2: true });

// The two attendee users' own registrations
function addSelf(key, userKey, i, status, checkedIn) {
  const s = state[key];
  const u = USERS[userKey];
  const peId = uuid(`pe:${key}:self:${userKey}`);
  const [first, last] = u.name.split(' ');
  const off = OFFSETS[key];
  const origin = CITIES[1];
  const travel = EVENTS[key].travel_enabled ? {
    travel_inbound: makeTravel(key, peId, 'inbound', 'plane', origin, {}),
    travel_outbound: makeTravel(key, peId, 'outbound', 'plane', origin, {}),
  } : {};
  const p = stripUndefined({
    participant_id: uuid(`person:${userKey}`), participant_event_id: peId, display_name: u.name, full_name: u.name,
    email: u.email, phone: '+61 412 555 019', pronouns: 'they/them', headshot_url: null, status, checked_in_at: null,
    has_anaphylaxis_risk: false, requires_refrigeration: false, diet_type: 'Vegetarian', cross_contamination_risk: false,
    freedom_waiver_granted: true, high_support_flag: false, can_leave_unaccompanied: true, waiver_signed: status === 'complete',
    emergency_contacts: [{ id: uuid(`ec:${peId}`), name: `Alex ${last}`, phone: '+61 400 111 222', relationship: 'Parent', priority: 1, is_primary: true }],
    ...travel,
    updated_at: toUtc(EVENTS[key].starts_at),
    personal: { legal_first_name: first, legal_last_name: last, age: 17, tshirt_size: 'M' },
    consents: [], guardians: [],
  });
  s.participants.push(p);
  p._userKey = userKey;
  if (checkedIn) addScan(key, p, s.contexts[0] || makeContexts(key)[0], local(EVENTS[key].starts_at.slice(0, 10), '09:20', off), 'qr', 'Priya Natarajan');
  return p;
}
for (const k of ['adelaide', 'perth']) state[k].contexts = makeContexts(k);
const SELF = {
  admin: [{ key: 'adelaide', p: addSelf('adelaide', 'admin', 0, 'complete', false) }],
  participant: [
    { key: 'melbourne', p: addSelf('melbourne', 'participant', 0, 'complete', false) },
    { key: 'adelaide', p: addSelf('adelaide', 'participant', 0, 'in_progress', false) },
    { key: 'brisbane', p: addSelf('brisbane', 'participant', 0, 'complete', true) },
  ],
};

// ---------------------------------------------------------------- notes
function addNote(key, peId, content, author, createdAt, extra = {}) {
  const s = state[key];
  const note = { id: uuid(`note:${peId}:${content}`), content, note_type: 'ops', sensitivity: 'normal', created_at: createdAt, author: { id: author.id, name: author.name, email: author.email }, ...extra };
  (s.notes[peId] = s.notes[peId] || []).push(note);
  return note;
}
{
  const sp = state.sydney.participants;
  const o = OFFSETS.sydney;
  addNote('sydney', sp[0].participant_event_id, 'Left phone charger at home, lent them one from the ops box.', STAFF[1], toUtc(local('2026-11-14', '10:05', o)), { note_type: 'logistical' });
  addNote('sydney', sp[2].participant_event_id, 'Confirmed EpiPen is in their backpack (front pocket). Kitchen briefed.', STAFF[3], toUtc(local('2026-11-14', '09:40', o)), { note_type: 'safeguarding' });
  addNote('sydney', sp[2].participant_event_id, 'Had the nut-free lunch box, no issues.', STAFF[2], toUtc(local('2026-11-14', '12:45', o)));
  addNote('sydney', sp[9].participant_event_id, 'Mum asked for a text when they arrive each morning. Done Sat 9:15.', STAFF[0], toUtc(local('2026-11-14', '09:16', o)), { note_type: 'safeguarding', sensitivity: 'restricted' });
  addNote('sydney', sp[4].participant_event_id, 'Flight delayed 45 min; Tom waiting at T2 arrivals.', STAFF[1], toUtc(local('2026-11-14', '07:30', o)), { note_type: 'logistical' });
  addNote('sydney', sp[14].participant_event_id, 'Showed them the quiet room on level 2.', STAFF[3], toUtc(local('2026-11-14', '11:00', o)));
  addNote('sydney', sp[22].participant_event_id, 'Using the lift; room swapped to ground floor (Room 101).', STAFF[4], toUtc(local('2026-11-14', '15:30', o)), { note_type: 'logistical' });
}

// ---------------------------------------------------------------- incidents
const LEVELS = [
  { value: 's0', code: 'S0', name: 'Emergency', target: 'Immediately', label: 'S0 · Emergency', color: 'red', examples: ['Anaphylaxis or a serious injury', 'Missing young person', 'Police or ambulance attending'] },
  { value: 's1', code: 'S1', name: 'High', target: 'Within 15 minutes', label: 'S1 · High', color: 'amber', examples: ['Safeguarding disclosure', 'Medication given', 'Participant left the venue'] },
  { value: 's2', code: 'S2', name: 'Medium', target: 'Within 2 hours', label: 'S2 · Medium', color: 'green', examples: ['Minor injury needing first aid', 'Code of conduct concern'] },
  { value: 's3', code: 'S3', name: 'Low', target: 'By end of day', label: 'S3 · Low', color: 'blue', examples: ['Lost property', 'Facilities issue'] },
];
const INCIDENT_ROLES = [
  { value: 'event_admin', label: 'Event admins' }, { value: 'safeguarding_lead', label: 'Safeguarding leads' },
  { value: 'ops', label: 'Ops' }, { value: 'limited', label: 'Limited staff' },
];
const STATUS_OPTIONS = [{ value: 'open', label: 'Open' }, { value: 'in_review', label: 'In review' }, { value: 'closed', label: 'Closed' }];
const CATEGORY_OPTIONS = [{ value: 'safeguarding', label: 'Safeguarding' }, { value: 'medical', label: 'Medical' }, { value: 'behavior', label: 'Behaviour' }, { value: 'other', label: 'Other' }];
const person = (p) => ({ id: p.participant_event_id, name: p.display_name, email: p.email });
const staffPerson = (s) => ({ id: s.id, name: s.name, email: s.email });

function makeIncident(key, n, d) {
  const off = OFFSETS[key];
  const ps = state[key].participants;
  const created = toUtc(d.occurred);
  const inc = {
    id: uuid(`incident:${key}:${n}`), category: d.category, severity: d.severity, status: d.status, summary: d.summary, location: d.location,
    occurred_at: d.occurred, created_at: created, reported_by: staffPerson(d.reporter),
    participant_names: d.people.map((i) => ps[i].display_name),
    hq_report: d.hq ? { id: uuid(`hq:${key}:${n}`), status: d.hq, created_at: toUtc(addMinutes(d.occurred, 20, off)) } : null,
    details: d.details, actions_taken: d.actions, visible_to_roles: d.roles || ['event_admin', 'safeguarding_lead'],
    medication_dispensed: !!d.meds, medications: (d.meds || []).map((m, j) => ({ id: uuid(`med:${n}:${j}`), ...m })),
    participants: d.people.map((i) => person(ps[i])), helping_staff: (d.helpers || []).map(staffPerson),
    timeline: [{ type: 'change', id: uuid(`tl:${n}:0`), action: 'created', actor_name: d.reporter.name, fields: [], created_at: created }],
    permissions: { update: true, comment: true, change_status: true, view_casework: true, escalate: !d.hq },
  };
  (d.comments || []).forEach((c, j) => {
    inc.timeline.push({ type: 'comment', id: uuid(`tl:${n}:c${j}`), body: c.body, new_status: c.status || null, author_name: c.author.name, source: c.source || 'app', slack_url: c.source === 'slack' ? 'https://hackclub.slack.com/archives/C0MOCK/p1731550000000' : null, created_at: toUtc(addMinutes(d.occurred, c.after, off)) });
    if (c.change) inc.timeline.push({ type: 'change', id: uuid(`tl:${n}:u${j}`), action: 'updated', actor_name: c.author.name, fields: c.change, created_at: toUtc(addMinutes(d.occurred, c.after + 1, off)) });
  });
  return inc;
}
{
  const o = OFFSETS.sydney;
  const defs = [
    { category: 'medical', severity: 's1', status: 'in_review', summary: 'Mild allergic reaction after lunch', location: 'Main hall, table 4', occurred: local('2026-11-15', '12:40', o), people: [2], reporter: STAFF[3], helpers: [STAFF[1], STAFF[0]],
      details: 'Reported itchy throat and hives on forearms about 15 minutes after lunch. Breathing normal, no swelling of lips or tongue.', actions: 'Gave antihistamine with guardian consent by phone. Monitored in first aid room for 45 minutes; symptoms settled. EpiPen ready but not used.',
      meds: [{ name: 'Cetirizine', dose: '10mg', notes: 'Given 12:52 after phone consent from mum' }], hq: null,
      comments: [{ author: STAFF[3], after: 10, body: 'Mum on the phone, consented to cetirizine. Hives fading.' }, { author: STAFF[0], after: 35, body: 'Moved to review. Kitchen checking which dish had sesame.', status: 'in_review', change: ['status'] }, { author: STAFF[1], after: 60, body: 'Kitchen confirms the dressing had sesame oil. Labelled for dinner.', source: 'slack' }] },
    { category: 'safeguarding', severity: 's1', status: 'open', summary: 'Participant disclosed feeling unsafe at home', location: 'Quiet room, level 2', occurred: local('2026-11-15', '10:15', o), people: [9], reporter: STAFF[4], helpers: [STAFF[0]], roles: ['safeguarding_lead'],
      details: 'During a check-in chat the participant mentioned arguments at home and said they did not want to go home on Sunday.', actions: 'Listened, did not promise confidentiality, informed the safeguarding lead immediately.',
      hq: 'open', comments: [{ author: STAFF[0], after: 20, body: 'Safeguarding lead aware. Will speak with them after lunch with a second staff member present.' }] },
    { category: 'medical', severity: 's2', status: 'closed', summary: 'Cut finger on soldering station', location: 'Hardware lab', occurred: local('2026-11-14', '15:30', o), people: [6], reporter: STAFF[2], helpers: [STAFF[2]],
      details: 'Small cut on left index finger from a wire cutter.', actions: 'Cleaned and dressed with a plaster. Back to hacking within 10 minutes.',
      comments: [{ author: STAFF[2], after: 15, body: 'All fine, closing.', status: 'closed', change: ['status'] }] },
    { category: 'behavior', severity: 's2', status: 'open', summary: 'Two participants arguing over team repo access', location: 'Breakout room B', occurred: local('2026-11-15', '09:05', o), people: [11, 18], reporter: STAFF[1],
      details: 'Heated disagreement after one force-pushed over the other\'s work. Raised voices, no physical contact.', actions: 'Separated them and set up a mediated chat at 11:00.', comments: [] },
    { category: 'other', severity: 's3', status: 'closed', summary: 'Lost AirPods case', location: 'Lobby', occurred: local('2026-11-14', '19:45', o), people: [25], reporter: STAFF[0],
      details: 'White AirPods case with a sticker of a dinosaur.', actions: 'Found in the lost property box Sunday morning and returned.',
      comments: [{ author: STAFF[3], after: 720, body: 'Found and returned.', status: 'closed', change: ['status', 'actions_taken'] }] },
    { category: 'medical', severity: 's0', status: 'closed', summary: 'Low blood sugar during late session', location: 'Main hall', occurred: local('2026-11-14', '23:10', o), people: [5], reporter: STAFF[4], helpers: [STAFF[4], STAFF[3]],
      details: 'CGM alarm at 3.1 mmol/L. Participant drowsy but responsive.', actions: 'Gave 150ml juice and jelly beans, rechecked at 15 min (5.4). Called parent. Did not need ambulance.',
      meds: [{ name: 'Glucose (juice)', dose: '150ml' }], hq: 'resolved',
      comments: [{ author: STAFF[4], after: 15, body: 'BGL 5.4 and rising. Parent informed.' }, { author: STAFF[0], after: 90, body: 'Stable all night. Closing.', status: 'closed', change: ['status'] }] },
  ];
  state.sydney.incidents = defs.map((d, n) => makeIncident('sydney', n, d));
  const ob = OFFSETS.brisbane;
  state.brisbane.incidents = [makeIncident('brisbane', 100, { category: 'other', severity: 's3', status: 'closed', summary: 'Wi-Fi outage for 20 minutes', location: 'Whole venue', occurred: local('2026-07-11', '14:00', ob), people: [], reporter: STAFF[2], details: 'Venue router rebooted.', actions: 'Venue IT fixed it.', comments: [] })];
}
const incidentSummary = (i) => {
  const { id, category, severity, status, summary, location, occurred_at, created_at, reported_by, participant_names, hq_report } = i;
  return { id, category, severity, status, summary, location, occurred_at, created_at, reported_by, participant_names, hq_report };
};

// ---------------------------------------------------------------- broadcast messages
const AUDIENCES = [
  { value: 'confirmed_attendees', label: 'Confirmed attendees' }, { value: 'checked_in', label: 'Checked-in attendees' },
  { value: 'not_checked_in', label: 'Not yet checked in' }, { value: 'all_registrants', label: 'Everyone registered' },
  { value: 'guardians', label: 'Parents and guardians' }, { value: 'groups', label: 'Selected groups' },
  { value: 'selected_participants', label: 'Selected people' },
];
const audienceLabel = (v) => (AUDIENCES.find((a) => a.value === v) || { label: v }).label;
function audienceMembers(key, msg) {
  const ps = state[key].participants.filter((p) => !['withdrawn', 'rejected'].includes(p.status));
  switch (msg.audience) {
    case 'checked_in': return ps.filter((p) => p.checked_in_at);
    case 'not_checked_in': return ps.filter((p) => p.status === 'complete' && !p.checked_in_at);
    case 'all_registrants': return ps;
    case 'guardians': return ps.filter((p) => p.parent_guardian_name);
    case 'groups': return ps.filter((p) => (p._groupIds || []).some((g) => msg.group_ids.includes(g)));
    case 'selected_participants': return ps.filter((p) => msg.participant_event_ids.includes(p.participant_event_id));
    default: return ps.filter((p) => p.status === 'complete');
  }
}
function buildRecipients(key, msg) {
  const members = audienceMembers(key, msg);
  const sent = ['completed', 'failed', 'sending'].includes(msg.status);
  return members.map((p, i) => {
    const guardian = msg.audience === 'guardians';
    return {
      id: uuid(`rcpt:${msg.id}:${p.participant_event_id}`),
      name: guardian ? p.parent_guardian_name : p.display_name,
      kind: guardian ? 'guardian' : 'attendee',
      catch_up: false,
      deliveries: msg.channels.map((ch) => {
        let status = sent ? 'delivered' : 'pending';
        if (sent && msg.status === 'failed' && i % 5 === 0) status = 'failed';
        if (sent && msg.status === 'sending' && i % 3 === 0) status = 'sending';
        return {
          id: uuid(`dlv:${msg.id}:${p.participant_event_id}:${ch}`), channel: ch, status,
          recipient_identifier: ch === 'email' ? (guardian ? p.parent_guardian_email : p.email) : ch === 'sms' ? (guardian ? p.parent_guardian_phone : p.phone) : ch === 'slack' ? (p.slack_user_id || null) : 'Expo push token',
          error_message: status === 'failed' ? (ch === 'sms' ? 'Carrier rejected: number unreachable' : 'Mailbox full') : null,
          delivered_at: status === 'delivered' ? msg.sent_at : null,
          read_at: status === 'delivered' && ch === 'email' && i % 2 === 0 ? msg.sent_at : null,
        };
      }),
    };
  });
}
function refreshMessage(key, msg) {
  msg.audience_label = audienceLabel(msg.audience);
  msg.recipients = buildRecipients(key, msg);
  msg.recipient_count = msg.recipients.length;
  // Counts are per recipient: one person on three channels is one send.
  const any = (f) => msg.recipients.filter((r) => r.deliveries.some(f)).length;
  msg.failed_count = any((d) => d.status === 'failed');
  msg.pending_count = msg.recipients.filter((r) => !r.deliveries.some((d) => d.status === 'failed') && r.deliveries.some((d) => d.status === 'pending' || d.status === 'sending')).length;
  msg.sent_count = msg.recipient_count - msg.failed_count - msg.pending_count;
  msg.opened_count = msg.channels.includes('email') ? any((d) => d.read_at) : null;
  msg.body_html = toHtml(msg.body);
  msg.preview_text = previewText(msg.body);
  const editable = msg.status === 'draft' || msg.status === 'scheduled';
  msg.permissions = {
    edit: editable, send_now: editable, destroy: msg.status === 'draft' || msg.status === 'cancelled', cancel: msg.status === 'scheduled',
    retry_failed: msg.status === 'failed' || msg.failed_count > 0, send_to_new_recipients: msg.status === 'completed' && msg.new_recipient_count > 0,
  };
  return msg;
}
function makeMessage(key, n, d) {
  const msg = {
    id: uuid(`msg:${key}:${n}`), subject: d.subject, status: d.status, audience: d.audience, channels: d.channels,
    scheduled_at: d.scheduled_at || null, sent_at: d.sent_at || null, created_at: d.created_at, sent_by: d.sent_by || null,
    body: d.body, participant_event_ids: d.participant_event_ids || [], group_ids: d.group_ids || [], new_recipient_count: d.new_recipient_count || 0,
  };
  return refreshMessage(key, msg);
}
{
  const o = OFFSETS.sydney;
  const g = state.sydney.groups;
  const ps = state.sydney.participants;
  state.sydney.messages = [
    makeMessage('sydney', 0, { subject: 'Welcome to Harbourhack!', status: 'completed', audience: 'confirmed_attendees', channels: ['email', 'push', 'slack'], created_at: toUtc(local('2026-11-13', '16:00', o)), sent_at: toUtc(local('2026-11-13', '17:00', o)), sent_by: STAFF[0].name, new_recipient_count: 2,
      body: 'Hey hackers!\n\nDoors open at 9:00 tomorrow at 1 Wharf Lane, Pyrmont. Bring your laptop, charger, and a water bottle.\n\nShow the QR code on your ticket at the front desk and we\'ll get you sorted with a badge and swag.\n\nSee you soon,\nThe Harbourhack team' }),
    makeMessage('sydney', 1, { subject: 'Lunch is served', status: 'completed', audience: 'checked_in', channels: ['push', 'slack'], created_at: toUtc(local('2026-11-14', '11:55', o)), sent_at: toUtc(local('2026-11-14', '12:00', o)), sent_by: STAFF[1].name,
      body: 'Lunch is up in the main hall. Allergy-safe meals are labelled with your name at the side table.' }),
    makeMessage('sydney', 2, { subject: 'Pickup reminder for parents', status: 'scheduled', audience: 'guardians', channels: ['email', 'sms'], created_at: toUtc(local('2026-11-15', '08:00', o)), scheduled_at: local('2026-11-16', '09:00', o),
      body: 'Hi! A reminder that demos finish at 2:30pm on Sunday and pickup is from 3:00pm at the Wharf Lane entrance. Please bring photo ID if you are collecting someone other than your own child.' }),
    makeMessage('sydney', 3, { subject: 'Demo order and judging', status: 'draft', audience: 'groups', channels: ['slack', 'email'], group_ids: [g[0].id, g[1].id], created_at: toUtc(local('2026-11-15', '09:30', o)),
      body: 'Demo order for Sunday:\n\n1. Team Kookaburra\n2. Team Wombat\n\nEach team gets 3 minutes plus 2 minutes of questions.' }),
    makeMessage('sydney', 4, { subject: 'Flight delay update', status: 'failed', audience: 'selected_participants', channels: ['sms', 'email'], participant_event_ids: ps.slice(0, 6).map((p) => p.participant_event_id), created_at: toUtc(local('2026-11-14', '06:45', o)), sent_at: toUtc(local('2026-11-14', '06:50', o)), sent_by: STAFF[1].name,
      body: 'QF flights from Melbourne are running about 45 minutes late. Tom will wait at T2 arrivals, no need to rush.' }),
    makeMessage('sydney', 5, { subject: 'Midnight snack run', status: 'cancelled', audience: 'checked_in', channels: ['push'], created_at: toUtc(local('2026-11-14', '21:00', o)), scheduled_at: local('2026-11-14', '23:30', o),
      body: 'Pizza in the lobby at 11:30!' }),
    makeMessage('sydney', 6, { subject: null, status: 'sending', audience: 'checked_in', channels: ['push', 'slack'], created_at: nowIso(), sent_at: nowIso(), sent_by: STAFF[0].name,
      body: 'Workshop on building with Raspberry Pi Pico starts in 10 minutes in Breakout B.' }),
  ];
  const om = OFFSETS.melbourne;
  state.melbourne.messages = [
    makeMessage('melbourne', 0, { subject: 'You\'re in! Next steps', status: 'completed', audience: 'all_registrants', channels: ['email'], created_at: toUtc(local('2026-11-01', '10:00', om)), sent_at: toUtc(local('2026-11-01', '10:05', om)), sent_by: STAFF[0].name,
      body: 'Congrats, you\'re coming to Southern Lights Melbourne!\n\nPlease finish onboarding (waiver, guardian details and travel) by 20 November.' }),
    makeMessage('melbourne', 1, { subject: 'Travel bookings confirmed', status: 'scheduled', audience: 'confirmed_attendees', channels: ['email', 'push'], created_at: toUtc(local('2026-11-14', '10:00', om)), scheduled_at: local('2026-11-20', '09:00', om),
      body: 'Your flights are booked. Check the Attend app for your itinerary.' }),
  ];
  const ob = OFFSETS.brisbane;
  state.brisbane.messages = [makeMessage('brisbane', 0, { subject: 'Thanks for coming!', status: 'completed', audience: 'checked_in', channels: ['email'], created_at: toUtc(local('2026-07-12', '17:00', ob)), sent_at: toUtc(local('2026-07-12', '17:30', ob)), sent_by: STAFF[0].name, body: 'Thanks for an amazing weekend. Photos are up on Slack!' })];
}
const messageSummary = (m) => {
  const { id, subject, status, audience, audience_label, channels, recipient_count, sent_count, failed_count, scheduled_at, sent_at, created_at, sent_by, preview_text } = m;
  return { id, subject, status, audience, audience_label, channels, recipient_count, sent_count, failed_count, scheduled_at, sent_at, created_at, sent_by, preview_text };
};
const publicMessage = (m) => { const { body: _b, ...rest } = m; return { ...rest, body: m.body }; };

// ---------------------------------------------------------------- inbox (per user)
const INBOX = { admin: [], participant: [] };
function addInbox(userKey, key, d) {
  const t = SELF[userKey].find((x) => x.key === key);
  INBOX[userKey].push({
    id: uuid(`inbox:${userKey}:${key}:${d.subject}`), subject: d.subject, body: d.body, event: { id: EVENTS[key].id, name: EVENTS[key].name },
    ticket_id: t ? t.p.participant_event_id : null, channels: d.channels, delivered_at: d.delivered_at, sender_name: d.sender || 'Harbourhack team', unread: !!d.unread,
  });
}
addInbox('participant', 'melbourne', { subject: 'You\'re in! Next steps', channels: ['email', 'push'], delivered_at: '2026-10-31T23:05:00Z', sender: 'Priya Natarajan', unread: false,
  body: 'Congrats, you\'re coming to Southern Lights Melbourne!\n\nPlease finish onboarding (waiver, guardian details and travel) by 20 November.' });
addInbox('participant', 'melbourne', { subject: 'Your flights are booked', channels: ['email'], delivered_at: '2026-11-13T22:00:00Z', sender: 'Tom Whitfield', unread: true,
  body: 'Hi Jamie,\n\nYou\'re on VA 312 from Brisbane on Friday 4 December, landing at 10:35. Someone from the team will meet you at arrivals in a red Hack Club hoodie.\n\nSafe travels!' });
addInbox('participant', 'adelaide', { subject: 'Finish your registration', channels: ['email', 'push'], delivered_at: '2026-11-14T01:00:00Z', sender: 'Outback Jam team', unread: true,
  body: 'You\'re almost there! We still need your waiver and a parent or guardian\'s details before we can confirm your spot.' });
addInbox('participant', 'brisbane', { subject: 'Thanks for coming!', channels: ['email'], delivered_at: '2026-07-12T07:30:00Z', sender: 'Riley Admin', unread: false,
  body: 'Thanks for an amazing weekend. Photos are up on Slack!' });
addInbox('admin', 'adelaide', { subject: 'Welcome to Outback Jam', channels: ['email', 'push'], delivered_at: '2026-11-10T03:00:00Z', sender: 'Outback Jam team', unread: true,
  body: 'Welcome aboard! Doors open 9:00am on Saturday 16 January at 45 North Terrace.' });
addInbox('admin', 'adelaide', { subject: 'Volunteer briefing pack', channels: ['email'], delivered_at: '2026-11-12T03:00:00Z', sender: 'Outback Jam team', unread: false,
  body: 'Attached is the run sheet for the weekend. Please read before the Friday briefing.' });

// ---------------------------------------------------------------- tickets
function participantView(key, p, detail) {
  const s = state[key];
  const mine = s.scans.filter((sc) => sc.participant_event_id === p.participant_event_id);
  const byCtx = new Map();
  for (const sc of mine) {
    const c = sc.scan_context;
    const cur = byCtx.get(c.id) || { scan_context_id: c.id, scan_context_name: c.name, checks_in: c.checks_in, is_airport: c.is_airport, scan_count: 0, first_scanned_at: sc.scanned_at, last_scanned_at: sc.scanned_at };
    cur.scan_count++;
    if (sc.scanned_at < cur.first_scanned_at) cur.first_scanned_at = sc.scanned_at;
    if (sc.scanned_at > cur.last_scanned_at) cur.last_scanned_at = sc.scanned_at;
    byCtx.set(c.id, cur);
  }
  const out = {};
  for (const [k, v] of Object.entries(p)) if (!k.startsWith('_')) out[k] = v;
  out.scans_by_context = [...byCtx.values()];
  if (!detail) for (const k of ['personal', 'accommodation', 'consents', 'guardians', 'medical_detail', 'dietary_detail', 'accessibility', 'safeguarding_detail']) delete out[k];
  return out;
}
function ticketFor(userKey, entry) {
  const { key, p } = entry;
  const e = EVENTS[key];
  const confirmed = p.status === 'complete';
  const ticketMsgs = INBOX[userKey].filter((m) => m.event.id === e.id).map((m) => ({ id: m.id, subject: m.subject, body: m.body, sender_name: m.sender_name, delivered_at: m.delivered_at }));
  const displayStatus = { complete: 'Confirmed', in_progress: 'Registration in progress', awaiting_guardian: 'Waiting on guardian', invited: 'Invited', withdrawn: 'Withdrawn' }[p.status] || p.status;
  return stripUndefined({
    id: p.participant_event_id, participant_id: p.participant_id, status: p.status, display_status: displayStatus, confirmed,
    checked_in: !!p.checked_in_at, attendee_name: p.display_name,
    qr_payload: `attend://checkin/${p.participant_id}`, short_code: shortCode(p.participant_event_id),
    apple_wallet_url: null, onboarding_url: `https://attend.hackclub.com/onboarding/${e.slug}`,
    event: { ...e }, travel_inbound: p.travel_inbound || null, messages: ticketMsgs,
    can_download_ticket: confirmed, can_download_excuse_letter: confirmed,
  });
}

// ---------------------------------------------------------------- travel calendar
function travelCalendar(key) {
  const s = state[key];
  const e = EVENTS[key];
  const entries = [];
  for (const p of s.participants) {
    if (['withdrawn', 'rejected'].includes(p.status)) continue;
    for (const t of [p.travel_inbound, p.travel_outbound]) {
      if (!t) continue;
      const inbound = t.direction === 'inbound';
      const primary = inbound ? (t.expected_arrival_time || t.arrival_time) : (t.departure_time || t.arrival_time);
      let route = null; let reference = null; let details = t.other_details || t.notes || null;
      if (t.mode === 'plane') { route = t.legs.length ? t.legs.map((l) => l.departure_airport).concat(t.legs[t.legs.length - 1].arrival_airport).join(' → ') : `${t.departure_city || '?'} → ${t.arrival_city || '?'}`; reference = t.flight_number || null; details = details || t.carrier || null; }
      else if (t.mode === 'train') { route = `${t.train_departure_station} → ${t.train_arrival_station}`; reference = t.carrier; }
      else if (t.mode === 'bus') { route = `${t.bus_departure_location} → ${t.bus_arrival_location}`; reference = t.carrier; }
      else if (t.mode === 'car') { route = t.origin_address || null; }
      let pickup = null;
      if (inbound) {
        if (p.checked_in_at) pickup = 'checked_in';
        else if (t.mode !== 'plane' || t.pickup_dismissed_at) pickup = 'pickup_not_needed';
        else if (t.legs.some((l) => l.airport_picked_up_at)) pickup = 'collected';
        else pickup = 'awaiting_pickup';
      }
      entries.push({
        id: t.id, participantId: p.participant_id, participantEventId: p.participant_event_id,
        participantName: p.full_name, participantPreferredName: p.personal?.preferred_name || null,
        direction: t.direction, mode: t.mode || 'other', primaryTimeAt: primary || null, agendaDate: primary ? primary.slice(0, 10) : null,
        route, reference, details, pickupState: pickup, isUnaccompaniedMinor: !!t.is_unaccompanied_minor,
        groups: (p._groupIds || []).map((gid) => s.groups.find((g) => g.id === gid)).filter(Boolean).map((g) => ({ id: g.id, name: g.name, color: g.color })),
      });
    }
  }
  entries.sort((a, b) => (a.primaryTimeAt || 'z').localeCompare(b.primaryTimeAt || 'z'));
  const dates = [...new Set(entries.map((x) => x.agendaDate).filter(Boolean))].sort();
  const count = (f) => entries.filter(f).length;
  return {
    eventTimezone: e.timezone, dates, entries,
    counts: {
      total: entries.length, inbound: count((x) => x.direction === 'inbound'), outbound: count((x) => x.direction === 'outbound'),
      scheduled: count((x) => x.agendaDate), unscheduled: count((x) => !x.agendaDate),
      awaitingPickup: count((x) => x.pickupState === 'awaiting_pickup'), collected: count((x) => x.pickupState === 'collected'),
      checkedIn: count((x) => x.pickupState === 'checked_in'), pickupNotNeeded: count((x) => x.pickupState === 'pickup_not_needed'),
    },
  };
}

// ---------------------------------------------------------------- HTTP plumbing
function send(res, status, body) {
  if (status === 204 || body === undefined) { res.writeHead(status); res.end(); return; }
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}
const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', () => resolve(Buffer.alloc(0)));
});
const parseJson = (buf) => { try { return buf.length ? JSON.parse(buf.toString('utf8')) : {}; } catch { return {}; } };
const multipartField = (buf, name) => {
  const m = buf.toString('utf8').match(new RegExp(`name="${name.replace(/[[\]]/g, '\\$&')}"\\r?\\n\\r?\\n([^\\r\\n]*)`));
  return m ? m[1] : null;
};

function authUser(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return tokens.get(m[1].trim()) || null;
}

// Route table: [method, regex, handler(ctx)]
const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler, opts });
};

// Event access helpers
function organiserEvent(ctx) {
  const found = eventByIdOrSlug(ctx.params.eventId);
  if (!found) throw httpError(404, 'Event not found');
  const [key] = found;
  if (!ORGANISER[ctx.user][key]) throw httpError(403, 'You do not have access to this event');
  return key;
}
const httpError = (status, message) => Object.assign(new Error(message), { status });
const findParticipant = (key, id) => state[key].participants.find((p) => p.participant_event_id === id || p.participant_id === id);

// ---- session
route('POST', '/api/v1/session', async (ctx) => {
  const body = ctx.json;
  let userKey = null;
  if (body.dev_email) userKey = Object.keys(USERS).find((k) => USERS[k].email.toLowerCase() === String(body.dev_email).toLowerCase());
  else if (body.user_id) userKey = Object.keys(USERS).find((k) => USERS[k].id === body.user_id);
  else if (body.code) userKey = 'admin';
  if (!userKey) return [401, { error: 'Unknown user' }];
  const token = `mock-token-${userKey}-${crypto.randomBytes(6).toString('hex')}`;
  tokens.set(token, userKey);
  return [200, { token, user: USERS[userKey] }];
}, { public: true });
route('DELETE', '/api/v1/session', async (ctx) => {
  const m = (ctx.req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (m && !m[1].startsWith('mock-token-admin') && !m[1].startsWith('mock-token-participant')) tokens.delete(m[1]);
  else if (m && m[1].split('-').length > 3) tokens.delete(m[1]);
  return [204];
});
route('GET', '/api/v1/me', async (ctx) => [200, USERS[ctx.user]]);

// ---- tickets
route('GET', '/api/v1/tickets', async (ctx) => [200, { tickets: SELF[ctx.user].map((e) => ticketFor(ctx.user, e)) }]);
route('GET', '/api/v1/tickets/:id', async (ctx) => {
  const e = SELF[ctx.user].find((x) => x.p.participant_event_id === ctx.params.id);
  if (!e) throw httpError(404, 'Ticket not found');
  return [200, { ticket: ticketFor(ctx.user, e) }];
});
route('GET', '/api/v1/tickets/:id/google_wallet', async (ctx) => {
  const e = SELF[ctx.user].find((x) => x.p.participant_event_id === ctx.params.id);
  if (!e) throw httpError(404, 'Ticket not found');
  return [200, { url: `https://pay.google.com/gp/v/save/mock-${shortCode(ctx.params.id)}` }];
});

// ---- events
route('GET', '/api/v1/events', async (ctx) => [200, { events: Object.keys(ORGANISER[ctx.user]).map((k) => eventForUser(ctx.user, k)) }]);

// ---- participants
route('GET', '/api/v1/events/:eventId/participants', async (ctx) => {
  const key = organiserEvent(ctx);
  const since = ctx.query.get('updated_since');
  let list = state[key].participants;
  if (since) { const t = new Date(since).getTime(); list = list.filter((p) => new Date(p.updated_at).getTime() > t); }
  return [200, { participants: list.map((p) => participantView(key, p, false)), synced_at: nowIso() }];
});
route('GET', '/api/v1/events/:eventId/participants/search', async (ctx) => {
  const key = organiserEvent(ctx);
  const q = (ctx.query.get('q') || '').toLowerCase().trim();
  const results = state[key].participants.filter((p) => !q || [p.display_name, p.full_name, p.email, p.phone, shortCode(p.participant_event_id)].some((f) => f && f.toLowerCase().includes(q)));
  return [200, { results: results.slice(0, 50).map((p) => participantView(key, p, false)) }];
});
route('GET', '/api/v1/events/:eventId/participants/:pid', async (ctx) => {
  const key = organiserEvent(ctx);
  const p = findParticipant(key, ctx.params.pid);
  if (!p) throw httpError(404, 'Participant not found');
  return [200, { participant: participantView(key, p, true) }];
});
route('GET', '/api/v1/events/:eventId/participants/:pid/notes', async (ctx) => {
  const key = organiserEvent(ctx);
  const p = findParticipant(key, ctx.params.pid);
  if (!p) throw httpError(404, 'Participant not found');
  const notes = (state[key].notes[p.participant_event_id] || []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  return [200, { notes }];
});
route('POST', '/api/v1/events/:eventId/participants/:pid/notes', async (ctx) => {
  const key = organiserEvent(ctx);
  const p = findParticipant(key, ctx.params.pid);
  if (!p) throw httpError(404, 'Participant not found');
  const content = String(ctx.json.content || '').trim();
  if (!content) return [422, { error: 'Content can\'t be blank' }];
  const note = addNote(key, p.participant_event_id, content, USERS[ctx.user], nowIso());
  note.id = uuid(`note:new:${Date.now()}:${Math.random()}`);
  return [201, { note }];
});
route('POST', '/api/v1/events/:eventId/participants/:pid/id_checks', async (ctx) => {
  const key = organiserEvent(ctx);
  const p = findParticipant(key, ctx.params.pid);
  if (!p) throw httpError(404, 'Participant not found');
  const c = ctx.json.id_check || {};
  const note = addNote(key, p.participant_event_id, `ID check: ${c.outcome || c.result || 'recorded'}`, USERS[ctx.user], nowIso(), { note_type: 'safeguarding', sensitivity: 'restricted' });
  note.id = uuid(`note:idcheck:${Date.now()}`);
  return [201, { note_id: note.id }];
});

// ---- scan contexts & scans
route('GET', '/api/v1/events/:eventId/scan_contexts', async (ctx) => {
  const key = organiserEvent(ctx);
  return [200, { scan_contexts: state[key].contexts.map(publicContext) }];
});
const SCAN_PAGE = 200;
route('GET', '/api/v1/events/:eventId/scans', async (ctx) => {
  const key = organiserEvent(ctx);
  const since = ctx.query.get('since');
  const all = state[key].scans.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (!since) return [200, { scans: all, synced_at: all.length ? all[all.length - 1].created_at : nowIso(), has_more: false }];
  const newer = all.filter((s) => s.created_at > since);
  const page = newer.slice(0, SCAN_PAGE);
  const hasMore = newer.length > SCAN_PAGE;
  return [200, { scans: page, synced_at: hasMore ? page[page.length - 1].created_at : (page.length ? page[page.length - 1].created_at : since), has_more: hasMore }];
});
route('POST', '/api/v1/events/:eventId/scans', async (ctx) => {
  const key = organiserEvent(ctx);
  const s = state[key];
  const b = ctx.json;
  let p = null;
  if (b.badge_token) p = s.participants.find((x) => x.nfc_badge_token === b.badge_token);
  else if (b.participant_id) p = findParticipant(key, b.participant_id);
  if (!p) return [404, { error: b.badge_token ? 'Badge not recognised' : 'Participant not found for this event' }];
  if (['withdrawn', 'rejected'].includes(p.status)) return [422, { error: `${p.display_name} has ${p.status === 'withdrawn' ? 'withdrawn' : 'been rejected'} and can't be checked in` }];
  const ctxObj = (b.scan_context_id && s.contexts.find((c) => c.id === b.scan_context_id)) || s.contexts[0];
  if (b.client_scan_id) {
    const dup = s.scans.find((x) => x.client_scan_id === b.client_scan_id);
    if (dup) {
      const prior = s.scans.filter((x) => x.participant_event_id === p.participant_event_id && x.scan_context.id === ctxObj.id);
      return [200, { success: true, outcome: prior.length > 1 ? 'already_scanned' : 'scanned', first_scan_in_context: prior[0] === dup, first_scanned_at: prior[0].scanned_at, deduplicated: true, scan: dup, scan_context: publicContext(ctxObj), participant: participantView(key, p, true) }];
    }
  }
  const prior = s.scans.filter((x) => x.participant_event_id === p.participant_event_id && x.scan_context.id === ctxObj.id);
  const first = prior.length === 0;
  const scan = addScan(key, p, ctxObj, b.scanned_at || nowIso(), b.source || (b.badge_token ? 'nfc' : 'qr'), USERS[ctx.user].name, b.client_scan_id);
  scan.created_at = nowIso();
  p.updated_at = nowIso();
  return [201, { success: true, outcome: first ? 'scanned' : 'already_scanned', first_scan_in_context: first, first_scanned_at: first ? scan.scanned_at : prior[0].scanned_at, deduplicated: false, scan, scan_context: publicContext(ctxObj), participant: participantView(key, p, true) }];
});
route('DELETE', '/api/v1/events/:eventId/scans/:peId', async (ctx) => {
  const key = organiserEvent(ctx);
  const s = state[key];
  const p = findParticipant(key, ctx.params.peId);
  if (!p) throw httpError(404, 'Participant not found');
  const ctxObj = (ctx.query.get('scan_context_id') && s.contexts.find((c) => c.id === ctx.query.get('scan_context_id'))) || s.contexts[0];
  s.scans = s.scans.filter((x) => !(x.participant_event_id === p.participant_event_id && x.scan_context.id === ctxObj.id));
  if (ctxObj.checks_in) p.checked_in_at = null;
  p.updated_at = nowIso();
  return [204];
});

// ---- travel
route('GET', '/api/v1/events/:eventId/travel', async (ctx) => {
  const key = organiserEvent(ctx);
  return [200, travelCalendar(key)];
});

// ---- push tokens
route('POST', '/api/v1/push_tokens', async () => [201, { ok: true }]);
route('DELETE', '/api/v1/push_tokens/:token', async () => [204]);

// ---- incidents
route('GET', '/api/v1/events/:eventId/incidents', async (ctx) => {
  const key = organiserEvent(ctx);
  const list = state[key].incidents.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  return [200, { incidents: list.map(incidentSummary) }];
});
route('GET', '/api/v1/events/:eventId/incidents/options', async (ctx) => {
  const key = organiserEvent(ctx);
  return [200, {
    categories: CATEGORY_OPTIONS, levels: LEVELS, statuses: STATUS_OPTIONS, roles: INCIDENT_ROLES,
    default_visible_to_roles: ['event_admin', 'safeguarding_lead'], default_severity: 's2', emergency_level: 's0',
    participants: state[key].participants.filter((p) => !['rejected'].includes(p.status)).map(person),
    staff: STAFF.map(staffPerson), reporter_phone: '+61 412 000 111',
  }];
});
const findIncident = (key, id) => { const i = state[key].incidents.find((x) => x.id === id); if (!i) throw httpError(404, 'Incident not found'); return i; };
route('GET', '/api/v1/events/:eventId/incidents/:id', async (ctx) => {
  const key = organiserEvent(ctx);
  return [200, { incident: findIncident(key, ctx.params.id) }];
});
function applyIncidentInput(key, inc, input) {
  const ps = state[key].participants;
  const changed = [];
  for (const f of ['category', 'severity', 'status', 'summary', 'details', 'actions_taken', 'location', 'occurred_at', 'medication_dispensed', 'visible_to_roles']) {
    if (input[f] !== undefined && JSON.stringify(input[f]) !== JSON.stringify(inc[f])) { inc[f] = input[f]; changed.push(f); }
  }
  if (Array.isArray(input.participant_event_ids)) {
    inc.participants = input.participant_event_ids.map((id) => findParticipant(key, id)).filter(Boolean).map(person);
    inc.participant_names = inc.participants.map((x) => x.name);
  }
  if (Array.isArray(input.helping_staff_ids)) inc.helping_staff = input.helping_staff_ids.map((id) => STAFF.find((s) => s.id === id)).filter(Boolean).map(staffPerson);
  if (Array.isArray(input.medications_attributes)) {
    const keep = inc.medications.filter((m) => !input.medications_attributes.some((a) => a.id === m.id));
    inc.medications = keep.concat(input.medications_attributes.filter((a) => !a._destroy).map((a) => ({ id: a.id || uuid(`med:new:${Math.random()}`), name: a.name, dose: a.dose, notes: a.notes || null })));
  }
  void ps;
  return changed;
}
route('POST', '/api/v1/events/:eventId/incidents', async (ctx) => {
  const key = organiserEvent(ctx);
  const input = ctx.json.incident || {};
  const now = nowIso();
  const me = USERS[ctx.user];
  const inc = {
    id: uuid(`incident:new:${Date.now()}:${Math.random()}`), category: 'other', severity: 's2', status: 'open', summary: '', location: null,
    occurred_at: now, created_at: now, reported_by: staffPerson(me), participant_names: [], hq_report: null, details: null, actions_taken: null,
    visible_to_roles: ['event_admin', 'safeguarding_lead'], medication_dispensed: false, medications: [], participants: [], helping_staff: [],
    timeline: [{ type: 'change', id: uuid(`tl:new:${Date.now()}`), action: 'created', actor_name: me.name, fields: [], created_at: now }],
    permissions: { update: true, comment: true, change_status: true, view_casework: true, escalate: true },
  };
  applyIncidentInput(key, inc, input);
  let notice = 'Incident logged.';
  if (ctx.json.escalate) { inc.hq_report = { id: uuid(`hq:new:${Date.now()}`), status: 'open', created_at: now }; inc.permissions.escalate = false; notice = 'Incident logged and escalated to Hack Club HQ.'; }
  state[key].incidents.push(inc);
  return [201, { incident: inc, notice }];
});
route('PATCH', '/api/v1/events/:eventId/incidents/:id', async (ctx) => {
  const key = organiserEvent(ctx);
  const inc = findIncident(key, ctx.params.id);
  const changed = applyIncidentInput(key, inc, ctx.json.incident || {});
  if (changed.length) inc.timeline.push({ type: 'change', id: uuid(`tl:upd:${Date.now()}`), action: 'updated', actor_name: USERS[ctx.user].name, fields: changed, created_at: nowIso() });
  return [200, { incident: inc, notice: 'Incident updated.' }];
});
route('POST', '/api/v1/events/:eventId/incidents/:id/escalate', async (ctx) => {
  const key = organiserEvent(ctx);
  const inc = findIncident(key, ctx.params.id);
  if (inc.hq_report) return [422, { error: 'This incident has already been escalated' }];
  inc.hq_report = { id: uuid(`hq:esc:${Date.now()}`), status: 'open', created_at: nowIso() };
  inc.permissions.escalate = false;
  inc.timeline.push({ type: 'comment', id: uuid(`tl:esc:${Date.now()}`), body: `Escalated to Hack Club HQ${ctx.json.escalation?.emergency_services_called ? ' (emergency services called)' : ''}.`, new_status: null, author_name: USERS[ctx.user].name, source: 'app', slack_url: null, created_at: nowIso() });
  return [200, { incident: inc, notice: 'Escalated to Hack Club HQ. Someone will call you shortly.' }];
});
route('POST', '/api/v1/events/:eventId/incidents/:id/comments', async (ctx) => {
  const key = organiserEvent(ctx);
  const inc = findIncident(key, ctx.params.id);
  const c = ctx.json.comment || {};
  const newStatus = c.new_status || null;
  if (!String(c.body || '').trim() && !newStatus) return [422, { error: 'Comment can\'t be blank' }];
  inc.timeline.push({ type: 'comment', id: uuid(`tl:c:${Date.now()}:${Math.random()}`), body: c.body || '', new_status: newStatus, author_name: USERS[ctx.user].name, source: 'app', slack_url: null, created_at: nowIso() });
  if (newStatus && newStatus !== inc.status) inc.status = newStatus;
  return [201, { incident_status: inc.status }];
});

// ---- broadcast messages
route('GET', '/api/v1/events/:eventId/messages', async (ctx) => {
  const key = organiserEvent(ctx);
  const list = state[key].messages.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  return [200, { messages: list.map(messageSummary) }];
});
route('GET', '/api/v1/events/:eventId/messages/options', async (ctx) => {
  const key = organiserEvent(ctx);
  return [200, {
    audiences: AUDIENCES,
    channels: [
      { value: 'email', label: 'Email', disabled: false, description: 'Sent from events@hackclub.com' },
      { value: 'slack', label: 'Slack DM', disabled: false, description: 'To people who linked Slack' },
      { value: 'push', label: 'Push notification', disabled: false, description: 'To people with the Attend app' },
      { value: 'sms', label: 'SMS', disabled: key !== 'sydney', description: key !== 'sydney' ? 'SMS credit not set up for this event' : 'Charged per segment' },
    ],
    groups: state[key].groups,
    participants: state[key].participants.map((p) => ({ id: p.participant_event_id, name: p.display_name, email: p.email, status: p.status })),
    defaults: { audience: 'confirmed_attendees', channels: ['email', 'push'] },
  }];
});
const findMessage = (key, id) => { const m = state[key].messages.find((x) => x.id === id); if (!m) throw httpError(404, 'Message not found'); return m; };
route('GET', '/api/v1/events/:eventId/messages/:id', async (ctx) => {
  const key = organiserEvent(ctx);
  return [200, { message: publicMessage(findMessage(key, ctx.params.id)) }];
});
function applyMessageInput(m, input) {
  for (const f of ['subject', 'body', 'audience', 'channels', 'participant_event_ids', 'group_ids', 'scheduled_at']) if (input[f] !== undefined) m[f] = input[f];
  if (m.subject === '') m.subject = null;
  m.status = m.scheduled_at && new Date(m.scheduled_at) > new Date() ? 'scheduled' : 'draft';
}
route('POST', '/api/v1/events/:eventId/messages', async (ctx) => {
  const key = organiserEvent(ctx);
  const m = { id: uuid(`msg:new:${Date.now()}:${Math.random()}`), subject: null, status: 'draft', audience: 'confirmed_attendees', channels: ['email'], scheduled_at: null, sent_at: null, created_at: nowIso(), sent_by: null, body: '', participant_event_ids: [], group_ids: [], new_recipient_count: 0 };
  applyMessageInput(m, ctx.json.message || {});
  refreshMessage(key, m);
  state[key].messages.push(m);
  return [201, { message: publicMessage(m) }];
});
route('PATCH', '/api/v1/events/:eventId/messages/:id', async (ctx) => {
  const key = organiserEvent(ctx);
  const m = findMessage(key, ctx.params.id);
  if (!['draft', 'scheduled'].includes(m.status)) return [422, { error: 'Only drafts and scheduled messages can be edited' }];
  applyMessageInput(m, ctx.json.message || {});
  refreshMessage(key, m);
  return [200, { message: publicMessage(m) }];
});
route('DELETE', '/api/v1/events/:eventId/messages/:id', async (ctx) => {
  const key = organiserEvent(ctx);
  findMessage(key, ctx.params.id);
  state[key].messages = state[key].messages.filter((x) => x.id !== ctx.params.id);
  return [204];
});
route('GET', '/api/v1/events/:eventId/messages/:id/preview', async (ctx) => {
  const key = organiserEvent(ctx);
  const m = findMessage(key, ctx.params.id);
  const names = m.recipients.map((r) => r.name);
  const sms = `${EVENTS[key].name}: ${m.subject ? m.subject + ' - ' : ''}${m.body.replace(/\s+/g, ' ')}`;
  const labels = { email: 'Email', slack: 'Slack', sms: 'SMS', push: 'Push' };
  return [200, { preview: {
    total_count: names.length, recipient_names: names.slice(0, 25), audience_label: m.audience_label,
    channel_labels: m.channels.map((c) => labels[c] || c).join(', '), channels: m.channels,
    slack_text: m.channels.includes('slack') ? `*${m.subject || EVENTS[key].name}*\n${m.body}` : null,
    email_subject: m.channels.includes('email') ? (m.subject || `Update from ${EVENTS[key].name}`) : null,
    body_html: m.body_html, sms_text: m.channels.includes('sms') ? sms : null, sms_length: sms.length, sms_segments: Math.max(1, Math.ceil(sms.length / 153)),
    scheduled_at: m.scheduled_at, scheduled_in_future: !!(m.scheduled_at && new Date(m.scheduled_at) > new Date()),
  } }];
});
route('POST', '/api/v1/events/:eventId/messages/:id/:action', async (ctx) => {
  const key = organiserEvent(ctx);
  const m = findMessage(key, ctx.params.id);
  const action = ctx.params.action;
  let notice;
  switch (action) {
    case 'send_now': m.status = 'completed'; m.sent_at = nowIso(); m.sent_by = USERS[ctx.user].name; m.scheduled_at = null; notice = 'Message is sending.'; break;
    case 'cancel': m.status = 'cancelled'; notice = 'Scheduled message cancelled.'; break;
    case 'retry_failed': case 'retry_delivery': m.status = 'completed'; notice = 'Retrying failed deliveries.'; break;
    case 'send_to_new_recipients': notice = `Sent to ${m.new_recipient_count} new recipient${m.new_recipient_count === 1 ? '' : 's'}.`; m.new_recipient_count = 0; break;
    default: throw httpError(404, 'Unknown action');
  }
  refreshMessage(key, m);
  return [200, { message: publicMessage(m), notice }];
});

// ---- inbox
route('GET', '/api/v1/messages', async (ctx) => {
  const evId = ctx.query.get('event_id');
  const q = (ctx.query.get('q') || '').toLowerCase();
  const all = INBOX[ctx.user].slice().sort((a, b) => (b.delivered_at || '').localeCompare(a.delivered_at || ''));
  const list = all.filter((m) => (!evId || m.event.id === evId) && (!q || `${m.subject} ${m.body}`.toLowerCase().includes(q)));
  const events = [...new Map(all.map((m) => [m.event.id, m.event])).values()];
  return [200, {
    messages: list.map((m) => ({ id: m.id, subject: m.subject, preview_text: previewText(m.body), event: m.event, ticket_id: m.ticket_id, channels: m.channels, delivered_at: m.delivered_at, sender_name: m.sender_name, unread: m.unread })),
    unread_count: all.filter((m) => m.unread).length, events,
  }];
});
route('GET', '/api/v1/messages/:id', async (ctx) => {
  const m = INBOX[ctx.user].find((x) => x.id === ctx.params.id);
  if (!m) throw httpError(404, 'Message not found');
  m.unread = false;
  return [200, { message: { id: m.id, subject: m.subject, body_html: toHtml(m.body), event: m.event, ticket_id: m.ticket_id, channels: m.channels, delivered_at: m.delivered_at, sender_name: m.sender_name } }];
});

// ---- confidential incident reports
route('GET', '/api/v1/incident_reports/options', async (ctx) => {
  const u = USERS[ctx.user];
  const attending = SELF[ctx.user].map((x) => x.key);
  const organising = Object.keys(ORGANISER[ctx.user]);
  const keys = [...new Set([...organising, ...attending])];
  const now = Date.now();
  const live = (k) => new Date(EVENTS[k].starts_at).getTime() - 86400000 < now && now < new Date(EVENTS[k].ends_at).getTime() + 86400000;
  return [200, {
    roles: [{ value: 'participant', label: 'Participant' }, { value: 'parent_guardian', label: 'Parent or guardian' }, { value: 'volunteer', label: 'Volunteer' }, { value: 'organiser', label: 'Organiser' }, { value: 'other', label: 'Someone else' }],
    incident_types: [{ value: 'safeguarding', label: 'Safeguarding concern' }, { value: 'harassment', label: 'Harassment or bullying' }, { value: 'medical', label: 'Medical' }, { value: 'code_of_conduct', label: 'Code of conduct' }, { value: 'safety', label: 'Health and safety' }, { value: 'other', label: 'Other' }],
    levels: LEVELS, emergency_level: 's0', default_level: 's2',
    events: keys.map((k) => ({ value: EVENTS[k].id, label: EVENTS[k].name, emergency_allowed: live(k) })),
    custom_events: [{ value: 'online', label: 'Online / Slack', emergency_allowed: false }, { value: 'other', label: 'Another Hack Club event', emergency_allowed: false }],
    organizer_events: organising.map((k) => ({ id: EVENTS[k].id, name: EVENTS[k].name })),
    max_attachment_count: 5, max_attachment_bytes: 20 * 1024 * 1024,
    prefill: { reporter_name: u.name, reporter_email: u.email, reporter_phone: ctx.user === 'admin' ? '+61 412 000 111' : null },
  }];
});
route('POST', '/api/v1/incident_reports', async (ctx) => {
  const priority = multipartField(ctx.raw, 'incident_report[priority]') || ctx.json?.incident_report?.priority || 's2';
  return [201, { incident_report: { id: uuid(`report:${Date.now()}:${Math.random()}`), priority } }];
});

// ---------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let status = 500;
  try {
    const raw = await readBody(req);
    const ctype = req.headers['content-type'] || '';
    const json = ctype.includes('application/json') ? parseJson(raw) : {};
    const matches = routes.filter((r) => r.re.test(url.pathname));
    const r = matches.find((x) => x.method === req.method);
    if (!r) {
      status = matches.length ? 405 : 404;
      send(res, status, { error: matches.length ? 'Method not allowed' : 'Not found' });
      return;
    }
    const m = url.pathname.match(r.re);
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    const user = authUser(req);
    if (!r.opts.public && !user) { status = 401; send(res, 401, { error: 'Unauthorized' }); return; }
    const [st, body] = await r.handler({ req, params, query: url.searchParams, json, raw, user });
    status = st;
    send(res, st, body);
  } catch (err) {
    status = err.status || 500;
    if (!err.status) console.error(err);
    send(res, status, { error: err.message || 'Server error' });
  } finally {
    console.log(`${new Date().toISOString()} ${req.method} ${url.pathname}${url.search} ${status}`);
  }
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Attend mock API on http://0.0.0.0:${PORT}`);
  console.log('Logins: admin@hackclub.com (organiser), participant-demo@hackclub.com (attendee)');
});

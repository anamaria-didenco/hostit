import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL not set');

function splitName(full) {
  if (!full) return { firstName: '', lastName: '' };
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
}

// All 10 enquiries from enquiries_list(1).xlsx
const enquiries = [
  { ref: 'ENQ401', eventDate: new Date('2026-05-23'), occasion: 'Engagement Party', guests: 60, contactName: 'Paris Holten',    email: 'parismelissa7@gmail.com' },
  { ref: 'ENQ402', eventDate: new Date('2026-03-28'), occasion: 'Engagement Party', guests: 100, contactName: 'Megan Leith',    email: 'megan.leith@hotmail.com' },
  { ref: 'ENQ404', eventDate: new Date('2026-05-23'), occasion: '21st Birthday Party', guests: 80, contactName: 'Annette Cook', email: 'annettec007@gmail.com' },
  { ref: 'ENQ405', eventDate: new Date('2026-09-19'), occasion: '21st Birthday Party', guests: 80, contactName: 'Wendy James',  email: 'wendydallas94@gmail.com' },
  { ref: 'ENQ406', eventDate: new Date('2026-08-08'), occasion: '21st Birthday Party', guests: 50, contactName: 'Mira Matthews',email: 'mirazsofia11@gmail.com' },
  { ref: 'ENQ407', eventDate: new Date('2026-04-04'), occasion: 'Wedding',            guests: 12, contactName: 'Jorge Bolanos', email: 'jorge.bolanos.l@gmail.com' },
  { ref: 'ENQ408', eventDate: new Date('2026-04-25'), occasion: 'Engagement Party',   guests: 35, contactName: 'Jyeney Elmaz',  email: 'Elmaz97@hotmail.com' },
  { ref: 'ENQ409', eventDate: new Date('2026-03-28'), occasion: 'Birthday',           guests: 70, contactName: 'Michelle Scott',email: 'michellescott2000@hotmail.com' },
  { ref: 'ENQ410', eventDate: new Date('2026-04-18'), occasion: 'Birthday',           guests: 60, contactName: 'Abby Rhodes',   email: 'abby.rhodes96@gmail.com' },
  { ref: 'ENQ411', eventDate: new Date('2026-07-03'), occasion: 'Work Event',         guests: 80, contactName: 'Ashlee Nevard', email: 'ashlee.nevard@raywhite.com' },
];

async function seed() {
  const conn = await mysql.createConnection(DB_URL);
  console.log('Connected to database');

  const [userRows] = await conn.execute('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
  if (!userRows.length) throw new Error('No admin user found');
  const ownerId = userRows[0].id;
  console.log(`Using ownerId: ${ownerId}\n`);

  let inserted = 0;
  for (const e of enquiries) {
    const { firstName, lastName } = splitName(e.contactName);

    // Insert contact
    const [cr] = await conn.execute(
      `INSERT INTO contacts (ownerId, firstName, lastName, email, phone, company, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [ownerId, firstName, lastName, e.email || '', '', '', `Online enquiry ${e.ref}`]
    );
    const contactId = cr.insertId;

    // Insert lead — status 'new' since these are fresh online enquiries
    await conn.execute(
      `INSERT INTO leads (ownerId, contactId, firstName, lastName, email, phone, company, eventType, eventDate, guestCount, spaceId, status, internalNotes, source, budget, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        ownerId,
        contactId,
        firstName,
        lastName,
        e.email || '',
        '',
        e.ref,           // company field used for ENQ reference
        e.occasion,
        e.eventDate,
        e.guests || null,
        null,
        'new',           // fresh online enquiries start as 'new'
        `Online enquiry reference: ${e.ref}`,
        'online_form',
        null,
      ]
    );
    inserted++;
    console.log(`✓ ${e.ref} — ${e.contactName} | ${e.occasion} | ${e.eventDate.toDateString()} | ${e.guests} guests`);
  }

  await conn.end();
  console.log(`\nDone! Inserted ${inserted} new enquiries.`);
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

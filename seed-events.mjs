import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL not set');

// Map spreadsheet statuses to HOSTit lead pipeline statuses
function mapStatus(raw) {
  if (!raw) return 'new';
  const s = raw.toLowerCase();
  if (s.includes('confirmed')) return 'booked';
  if (s.includes('tentative')) return 'proposal_sent';
  if (s.includes('function pack sent')) return 'proposal_sent';
  if (s.includes('followed up') || s.includes('follow up')) return 'contacted';
  if (s.includes('site visit')) return 'contacted';
  if (s.includes('final follow up')) return 'contacted';
  return 'new';
}

// Parse "Fri 06 Mar 2026" → Date
function parseDate(str) {
  if (!str) return null;
  // Remove day-of-week prefix
  const cleaned = str.replace(/^[A-Za-z]+ /, '');
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

// Split first/last name
function splitName(full) {
  if (!full) return { firstName: '', lastName: '' };
  const parts = full.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

const events = [
  ['Kiri Morgan', 'Birthday', 'Fri 06 Mar 2026', 'Birthday', 45, 'Level 1 Bar', 'Tentative'],
  ['Keeraty C', 'Wedding', 'Sat 07 Mar 2026', 'Wedding', 100, 'Level 1 Bar,Level 2 Restaurant', 'Confirmed'],
  ['Casey ', 'Black Diamond Technologies Limited', 'Fri 13 Mar 2026', null, 58, 'Level 1 Bar', 'Confirmed'],
  ['Grace Jensen', '21st', 'Sat 14 Mar 2026', '21st Birthday Party', 90, 'Level 1 Bar', 'Function Pack Sent'],
  ['niamh baxter', '21st', 'Sat 14 Mar 2026', '21st Birthday Party', 70, 'Level 1 Bar', 'Confirmed'],
  ['Bernadette Ramos', 'Work Event', 'Wed 18 Mar 2026', 'Work Event', 50, 'Level 1 Bar', 'Confirmed'],
  ["Isabella O'Keefe", 'Engagement Party', 'Sat 21 Mar 2026', 'Engagement Party', 50, 'Level 1 Bar', 'Tentative'],
  ['Caitlyn  Stewart', '21st ', 'Sat 28 Mar 2026', '21st Birthday Party', 100, 'Level 1 Bar', 'Function Pack Sent'],
  ['Gentz,Thomas ', 'Journey Beyond', 'Tue 31 Mar 2026', null, 50, 'Level 1 Bar', 'Tentative'],
  ['Rhonda Binnie', 'Work Event', 'Thu 09 Apr 2026', 'Work Event', 80, 'Level 1 Bar', 'Confirmed'],
  ["Hayley O'Connor ", 'Plato Creative', 'Fri 10 Apr 2026', null, 60, 'Level 1 Bar', 'Confirmed'],
  ['Hollie Cantwell', 'Celebration', 'Sat 11 Apr 2026', 'Cocktail Party', 120, 'Level 1 Bar', 'Function Pack Sent'],
  ['Emma Guiney', 'Graduation Dinner', 'Wed 15 Apr 2026', 'Dinner', 40, 'Level 1 Bar', 'Function Pack Sent'],
  ['Amelia Griffiths', 'Private Dinner', 'Thu 16 Apr 2026', 'Seated Shared Dinner', 18, 'Level 1 Bar', 'Final Follow Up Sent'],
  ['Isabelle Lecher ', "Izzy Letcher's 21st", 'Sat 25 Apr 2026', null, 60, 'Level 1 Bar', 'Confirmed'],
  ['Jeff Fitzgerald', 'Engagement Party', 'Sat 09 May 2026', 'Engagement Party', 40, 'Level 1 Bar', 'Function Pack Sent'],
  ['Chelsea Jones', 'Event', 'Thu 14 May 2026', 'Cocktail Party', 40, 'Level 1 Bar', 'Function Pack Sent'],
  ['Marianne Wullings', 'Work Event', 'Fri 15 May 2026', 'Work Event', 30, 'Level 1 Bar', 'Confirmed'],
  ['Talia Marshall', '21st', 'Sat 23 May 2026', '21st Birthday Party', 80, 'Level 2 Restaurant', 'Function Pack Sent'],
  ['Adelle Stevenson', '21st', 'Sat 30 May 2026', '21st Birthday Party', 50, 'Level 1 Bar', 'Function Pack Sent'],
  ['Olivia Fisher ', "Olivia's 30th Birthday", 'Sat 06 Jun 2026', null, 60, 'Level 1 Bar', 'Confirmed'],
  ['Lavender Clark', 'Wedding Vendor Event', 'Fri 19 Jun 2026', 'Work Event', 60, 'Level 1 Bar', 'Tentative'],
  ['Charise Walter', "St George's Mid Winter Cocktail Function", 'Fri 26 Jun 2026', 'Work Event', 80, 'Level 1 Bar', 'Tentative'],
  ['Victoria Williamson', '30th Birthday', 'Sat 27 Jun 2026', 'Birthday', 30, 'Level 1 Bar', 'Followed Up'],
  ['Eveane Tuetue-Gray', 'Engagement party', 'Sat 11 Jul 2026', 'Engagement Party', 60, 'Level 1 Bar', 'Function Pack Sent'],
  ['Keri Inglis', '21st', 'Fri 17 Jul 2026', '21st Birthday Party', 80, 'Level 1 Bar', 'Function Pack Sent'],
  ['Maia Driver', "Maia's 21st", 'Sat 18 Jul 2026', '21st Birthday Party', 50, 'Level 1 Bar', 'Function Pack Sent'],
  ['Roxy Lortan', 'Mid Winter', 'Fri 24 Jul 2026', 'Work Event', 80, 'Level 1 Bar', 'Confirmed'],
  ['Sarah Pope', '30th', 'Sat 25 Jul 2026', 'Birthday', 50, 'Level 1 Bar', 'Tentative'],
  ['Rachael Chandler', 'Conference Dinner', 'Tue 28 Jul 2026', 'Work Event', 65, 'Level 2 Restaurant', 'Confirmed'],
  ['Stephen Robertson', 'University of Otago Dinner', 'Sat 01 Aug 2026', 'Seated Shared Dinner', 60, 'Level 1 Bar', 'Site Visit Scheduled'],
  ['Katie Schuyt', 'Elopement', 'Sat 03 Oct 2026', 'Wedding', 70, 'Level 1 Bar', 'Tentative'],
  ['Michele Parkyn', 'Birthday Party', 'Sat 24 Oct 2026', 'Birthday', 100, 'Level 1 Bar', 'Tentative'],
  ['Angela Boyle ', 'Harcourts Cup Day Breakfast', 'Tue 10 Nov 2026', null, 60, 'Level 1 Bar,Level 2 Restaurant', 'Confirmed'],
  ['Jamie Theyers', 'Vow Renewal', 'Fri 13 Nov 2026', 'Cocktail Party', 60, 'Level 1 Bar', 'Function Pack Sent'],
  ['Madison Monk', 'Wedding', 'Fri 11 Dec 2026', 'Wedding', 100, 'Level 1 Bar', 'Site Visit Scheduled'],
  ['Joseph Munro', 'Wedding', 'Mon 11 Jan 2027', 'Wedding', 53, 'Level 1 Bar', 'Final Follow Up Sent'],
  ["Emily O'Brien", "Emily's Wedding", 'Sat 27 Feb 2027', 'Wedding', 60, 'Level 1 Bar,Level 2 Restaurant', 'Confirmed'],
];

async function seed() {
  const conn = await mysql.createConnection(DB_URL);
  console.log('Connected to database');

  // Get the owner user id
  const [userRows] = await conn.execute('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
  if (!userRows.length) throw new Error('No admin user found — please log in first');
  const ownerId = userRows[0].id;
  console.log(`Using ownerId: ${ownerId}`);

  let contactsInserted = 0;
  let leadsInserted = 0;

  for (const [contactName, title, startDate, occasion, guests, space, statusRaw] of events) {
    const { firstName, lastName } = splitName(contactName);
    const eventDate = parseDate(startDate);
    const status = mapStatus(statusRaw);
    const eventType = occasion || title || 'Event';
    const spaceName = space || 'Main Venue';

    // Insert contact
    const [contactResult] = await conn.execute(
      `INSERT INTO contacts (ownerId, firstName, lastName, email, phone, company, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [ownerId, firstName.trim(), lastName.trim(), '', '', '', `Imported from events spreadsheet. Space: ${spaceName}`]
    );
    const contactId = contactResult.insertId;
    contactsInserted++;

    // Insert lead — leads table uses firstName/lastName/email directly (not contactId FK)
    await conn.execute(
      `INSERT INTO leads (ownerId, contactId, firstName, lastName, email, phone, company, eventType, eventDate, guestCount, spaceId, status, internalNotes, source, budget, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        ownerId,
        contactId,
        firstName.trim(),
        lastName.trim(),
        '',
        '',
        title ? title.trim() : eventType,
        eventType,
        eventDate,
        guests || null,
        null,
        status,
        `Original status: ${statusRaw}. Space: ${spaceName}`,
        'import',
        null,
      ]
    );
    leadsInserted++;
    console.log(`✓ ${firstName} ${lastName} — ${title} (${statusRaw} → ${status})`);
  }

  await conn.end();
  console.log(`\nDone! Inserted ${contactsInserted} contacts and ${leadsInserted} leads.`);
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

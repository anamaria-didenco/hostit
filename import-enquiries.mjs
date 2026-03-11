import mysql from 'mysql2/promise';
import fs from 'fs';

const CSV_PATH = '/home/ubuntu/upload/eventsxxxxxx.csv';

// Status mapping from CSV to DB values
const statusMap = {
  'Confirmed': 'booked',
  'Tentative': 'proposal_sent',
  'Function Pack Sent': 'proposal_sent',
  'Followed Up': 'contacted',
  'Site Visit Scheduled': 'contacted',
  'New': 'new',
};

// Space name mapping from CSV to DB IDs
// DB has: id=1 "Spritz & Negroni Bar", id=2 "Restaurant"
const spaceMap = {
  'Level 1 Bar': 1,
  'Level 2 Restaurant': 2,
};

function parseDate(str) {
  // Format: "Fri 13 Mar 2026"
  if (!str) return null;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function parseName(contactName) {
  const trimmed = (contactName || '').trim();
  const parts = trimmed.split(/\s+/);
  const firstName = parts[0] || trimmed;
  const lastName = parts.slice(1).join(' ') || null;
  return { firstName, lastName };
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Get owner ID
  const [users] = await conn.query('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
  if (!users.length) { console.error('No admin user found'); process.exit(1); }
  const ownerId = users[0].id;
  console.log('Owner ID:', ownerId);

  // Read CSV
  const lines = fs.readFileSync(CSV_PATH, 'utf-8').trim().split('\n');
  const headers = lines[0].split(',');
  console.log('Headers:', headers);
  console.log('Rows to process:', lines.length - 1);

  // Get existing leads to avoid duplicates (match on firstName + eventDate)
  const [existingLeads] = await conn.query(
    'SELECT firstName, lastName, eventDate FROM leads WHERE ownerId = ?',
    [ownerId]
  );
  const existingKeys = new Set(
    existingLeads.map(l => {
      const d = l.eventDate ? new Date(l.eventDate).toDateString() : 'null';
      return `${(l.firstName || '').toLowerCase().trim()}|${d}`;
    })
  );
  console.log('Existing leads:', existingLeads.length);

  let inserted = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Handle quoted fields with commas
    const fields = [];
    let inQuote = false;
    let current = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { fields.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    fields.push(current.trim());

    const contactName = fields[0] || '';
    const title = fields[1] || '';
    const startDate = fields[2] || '';
    const occasion = fields[3] || '';
    const guests = parseInt(fields[4]) || null;
    const spaceName = fields[5] || '';
    const statusRaw = fields[6] || '';

    const { firstName, lastName } = parseName(contactName);
    const eventDate = parseDate(startDate);
    const status = statusMap[statusRaw] || 'new';
    
    // Determine spaceId - handle multiple spaces like "Level 1 Bar,Level 2 Restaurant"
    let spaceId = null;
    for (const [key, id] of Object.entries(spaceMap)) {
      if (spaceName.includes(key)) { spaceId = id; break; }
    }

    // Check for duplicate
    const dateKey = eventDate ? eventDate.toDateString() : 'null';
    const key = `${firstName.toLowerCase().trim()}|${dateKey}`;
    if (existingKeys.has(key)) {
      console.log(`  SKIP (exists): ${firstName} ${lastName || ''} on ${startDate}`);
      skipped++;
      continue;
    }

    // Use title as company/event name, occasion as eventType
    const company = title || null;
    const eventType = occasion || title || null;

    await conn.query(
      `INSERT INTO leads (ownerId, firstName, lastName, email, company, eventType, eventDate, guestCount, spaceId, status, source, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv_import', NOW(), NOW())`,
      [ownerId, firstName, lastName || '', `imported-${Date.now()}-${i}@placeholder.com`, company, eventType, eventDate, guests, spaceId, status]
    );
    console.log(`  INSERT: ${firstName} ${lastName || ''} | ${startDate} | ${statusRaw}`);
    inserted++;
    existingKeys.add(key);
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped (already exist): ${skipped}`);
  await conn.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

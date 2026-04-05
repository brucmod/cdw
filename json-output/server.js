#!/usr/bin/env node

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();

// CORS — allow requests from CDW Org Directory
app.use(function(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
const PORT = process.env.PORT || 3000;

const CONFIG = {
  uploadDir: path.join(__dirname, 'uploads'),
  jsonOutputDir: path.join(__dirname, 'json-output'),
  wwwDir: '/var/www/html/cdw',
  configFile: path.join(__dirname, 'config.json'),
  maxFileSize: 50 * 1024 * 1024,
};

[CONFIG.uploadDir, CONFIG.jsonOutputDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function getJsonFilename(orgType) {
  const map = {
    'cdw': 'CDW_data.json',
    'dcs': 'dcs_data.json',
    'canada': 'canada_data.json',
    'CDW_accounts': 'CDW_accounts.json'
  };
  return map[orgType] || `${orgType}.json`;
}

const KEY_MAP = {
  'coworkername': 'name',
  'emailaddress': 'email',
  'firstname': 'name',
  'lastname': 'name',
  'directphone': 'phone',
  'coworkerlocationdescription': 'location',
  'coworkertitledescription': 'title',
  'coworkertitlegroupdescription': 'titleGroup',
  'losmonth': 'losMonths',
  'losgroupdescription': 'losGroup',
  'academyamflagdescription': 'academyFlag',
  'managertitle': 'managerTitle',
  'managere-mail': 'managerEmail',
  'manageremail': 'managerEmail',
  'manageremailaddress': 'managerEmail',
  'directoremail': 'directorEmail',
  'director email': 'directorEmail',
  'director title': 'directorTitle',
  'director': 'directorRaw',
  'manager': 'managerRaw',
  'mgr_first': 'managerFirst',
  'mgr_last': 'managerLast',
  'srmgr_first': 'srManagerFirst',
  'srmgr_last': 'srManagerLast',
  'locationdescr': 'location',
  'deptdesc': 'dept',
  'emailaddr': 'email',
  'solutionarea': 'solutionArea',
  'homelocation': 'homeLocation',
  'statescovers': 'statesCovers',
  'officelocation': 'officeLocation',
  'srmanager': 'srManager',
  'province': 'province',
  'role': 'role',
  'sector': 'sector',
  'segment': 'segment',
  'channel': 'channel',
  'tier': 'tier',
  'region': 'region',
  'area': 'area',
  'district': 'district',
  'los': 'losMonths'
};

const DCS_NAME_ALIASES = {
  'jessica keehnen': 'Jessica Keehan',
  'pete mccloughan': 'Pete McCloughan',
  'leslie fielding-russell': 'Leslie Fielding-Russell',
  'alejandro roman': 'Alejandro Roman',
  'kathryn averyheart': 'Kat Averyheart'
};

function getMergeKey(record) {
  const email = (record.email || '').toLowerCase();
  return email || record.name || '';
}

function cleanPersonName(s) {
  if (!s) return '';
  const parts = String(s).split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    return [parts[1], parts[0]].join(' ').trim();
  }
  return String(s).trim();
}

function cleanName(s) {
  if (!s) return '';
  return String(s)
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function titleCaseWord(word) {
  if (!word) return '';
  const lower = word.toLowerCase();
  if (['a', 'an', 'the', 'and', 'or', 'but', 'in', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'on', 'as', 'is', 'was'].includes(lower)) {
    return lower;
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function cleanString(s) {
  if (!s || String(s).trim() === 'nan' || String(s).trim() === '-' || String(s).trim() === 'None') return '';
  return String(s)
    .replace(/[\u200b\u200c\u200d\xa0\u2060]+/g, ' ')
    .split(/\s+/)
    .join(' ')
    .trim();
}

function parseStates(s) {
  if (!s || s === '-') return [];
  return String(s)
    .split(/[,;&\/]+/)
    .map(p => p.trim())
    .filter(p => p && p !== '-');
}

const JUNK_NAME = /\b(house\s*ac(?:ct|count)|hse\s*acct?|houseacct|donotdelete|do\s*not\s*delete|rpa\s*bot|rpabot|salestrainee|sales\s*trainee|placeholder|vacant|open\s*req|temp\d*\s*temp\d*|temporary\s*sales|qa\s*sales|system\s*engineer\s*grp|fncl\s*svcs|hc\s*ent\s*(?:east|west)|nonprofit\s*ne|navy\s*hogan|k-12\s*(?:small|tad|enterp)|edca|edch|edpr|edxs|scck|soh1|soho|sh80|sxrx|rslr|bbg1|bsk1|ignw|dono|uscb|usps\s*adept|us\s*(?:air\s*force|army|navy)|dod(?:\s*advapgm)?|rippling\s*house|gifting\s*house|landover|leesburg|dc\s*metro|congresional|consumer\s*house|sys\s*integrat|hc\s*payor)\b/i;
const JUNK_START = /^(core\s+hse|all\s+|total\s+|group\s+|houseacct|rpabot|donotdelete)/i;

function normaliseRows(rows, org = 'cdw') {
  const out = rows.map(row => {
    const rec = {};
    Object.keys(row).forEach(k => {
      const norm = k.trim().toLowerCase().replace(/\s+/g, '');
      const mapped = KEY_MAP[norm] || KEY_MAP[k.trim().toLowerCase()] || k.trim();
      rec[mapped] = row[k] != null ? String(row[k]).trim() : '';
    });

    if (org === 'canada' && !rec.name) {
      const first = rec.managerFirst || rec.firstName || '';
      const last = rec.managerLast || rec.lastName || '';
      if (first || last) {
        rec.name = `${first} ${last}`.trim();
      }
      if (rec.managerFirst || rec.managerLast) {
        const mgrFirst = rec.managerFirst || '';
        const mgrLast = rec.managerLast || '';
        if (mgrFirst || mgrLast) {
          rec.manager = `${mgrFirst} ${mgrLast}`.trim();
        }
        delete rec.managerFirst;
        delete rec.managerLast;
      }
      if (rec.srManagerFirst || rec.srManagerLast) {
        const srFirst = rec.srManagerFirst || '';
        const srLast = rec.srManagerLast || '';
        if (srFirst || srLast) {
          rec.srManager = `${srFirst} ${srLast}`.trim();
        }
        delete rec.srManagerFirst;
        delete rec.srManagerLast;
      }
    }

    if (rec.name) rec.name = cleanName(cleanPersonName(rec.name));
    if (rec.managerRaw) {
      rec.manager = cleanName(rec.managerRaw);
      delete rec.managerRaw;
    }
    if (rec.directorRaw) {
      rec.director = cleanName(rec.directorRaw);
      delete rec.directorRaw;
    }

    if (rec.location && !rec.state) {
      const sm = rec.location.match(/\((?:VIRTUAL\s*-\s*)?([A-Z]{2})\)$/);
      if (sm) rec.state = sm[1];
      rec.location = rec.location.replace(/\s*\([^)]*\)\s*$/, '').trim();
    }

    return rec;
  });

  out.forEach(r => {
    if (r.titleGroup && r.titleGroup.trim().toLowerCase() === 'unknown') {
      r.titleGroup = (r.title && r.title.trim()) ? r.title.trim() : 'Other';
    }
  });

  return out.filter(r => {
    if (!r.name && !r.email) return false;
    if (r.sector && r.sector.toLowerCase() !== 'sales') return false;
    const nm = r.name || '';
    if (JUNK_NAME.test(nm) || JUNK_START.test(nm)) return false;
    // Only filter long all-caps names if there's no email (catches junk group rows, not real people)
    if (!r.email && nm === nm.toUpperCase() && nm.replace(/\s/g, '').length > 20) return false;
    const ttl = r.title || '';
    if (/-–\s*EXT\s*$/i.test(ttl)) return false;
    if (!r.email) {
      const ttlLower = (ttl || '').toLowerCase();
      if (!ttl || ttlLower === 'unknown' || ttlLower === 'other') return false;
    }
    return true;
  });
}

function normaliseDCSRows(rows) {
  function get(row, target) {
    const t = target.toLowerCase().replace(/[^a-z0-9]/g, '');
    const keys = Object.keys(row);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (k === t || k.indexOf(t) === 0) return row[keys[i]];
    }
    return '';
  }

  const sampleKeys = rows.length ? Object.keys(rows[0]).map(k => k.toLowerCase().replace(/[^a-z0-9]/g, '')) : [];
  const isZooDoc = sampleKeys.some(k => k === 'coworkername') && sampleKeys.some(k => k === 'directorname');
  const isOldDCS = sampleKeys.some(k => k === 'hicoworker');

  if (!isZooDoc && !isOldDCS) return null;

  return rows.map(row => {
    let name, email, title, manager, srMgr, director, segment, aor, solArea, office, home, domain;

    if (isZooDoc) {
      name = cleanString(get(row, 'Coworker Name'));
      name = name.split(' ').filter(Boolean).map(titleCaseWord).join(' ');
      email = cleanString(get(row, 'Email')).toLowerCase();
      title = cleanString(get(row, 'Coworker Title'));
      manager = cleanString(get(row, 'Manager Name'));
      manager = manager.split(' ').filter(Boolean).map(titleCaseWord).join(' ');
      srMgr = cleanString(get(row, 'Sr Manager Name'));
      srMgr = srMgr.split(' ').filter(Boolean).map(titleCaseWord).join(' ');
      director = cleanString(get(row, 'Director Name'));
      director = director.split(' ').filter(Boolean).map(titleCaseWord).join(' ');
      segment = cleanString(get(row, 'Segment/Vertical') || get(row, 'Segment'));
      aor = cleanString(get(row, 'AOR'));
      solArea = cleanString(get(row, 'Presales or Practice')) || 'Data Center Solutions (DCS)';
      office = cleanString(get(row, 'CDW Office Location'));
      home = cleanString(get(row, 'Home Location'));
      domain = cleanString(get(row, 'Domain'));
    } else {
      name = cleanString(row['HI Coworker'] || row['Name'] || '');
      name = name.split(' ').filter(Boolean).map(titleCaseWord).join(' ');
      email = cleanString(row['Email'] || '').toLowerCase();
      title = cleanString(row['Role/Title'] || row['Title'] || '');
      manager = cleanString(row['Manager'] || row['Manager Name'] || '');
      manager = manager.split(' ').filter(Boolean).map(titleCaseWord).join(' ');
      srMgr = cleanString(row['Sr Manager'] || '');
      srMgr = srMgr.split(' ').filter(Boolean).map(titleCaseWord).join(' ');
      director = cleanString(row['Director'] || '');
      director = director.split(' ').filter(Boolean).map(titleCaseWord).join(' ');
      segment = cleanString(row['Primary Segment Coverage / Area of Responsibility (AOR)'] || row['Segment'] || '');
      aor = cleanString(row['States Coworker Covers'] || '');
      solArea = cleanString(row['Primary Solution Area'] || 'Data Center Solutions (DCS)');
      office = cleanString(row['CDW Office Location'] || '');
      home = cleanString(row['Home Location'] || '');
      domain = cleanString(row['Domain'] || 'DCS');
    }

    if (!name && !email) return null;
    if (name.toLowerCase() === 'tbh') return null;

    const nameLower = name.toLowerCase();
    if (DCS_NAME_ALIASES[nameLower]) name = DCS_NAME_ALIASES[nameLower];
    if (DCS_NAME_ALIASES[manager.toLowerCase()]) manager = DCS_NAME_ALIASES[manager.toLowerCase()];
    if (DCS_NAME_ALIASES[srMgr.toLowerCase()]) srMgr = DCS_NAME_ALIASES[srMgr.toLowerCase()];
    if (DCS_NAME_ALIASES[director.toLowerCase()]) director = DCS_NAME_ALIASES[director.toLowerCase()];

    return {
      name,
      email,
      title,
      manager,
      srManager: srMgr,
      director,
      segment,
      solutionArea: solArea,
      domain,
      officeLocation: office,
      homeLocation: home,
      statesCovers: aor,
      coverageParsed: parseStates(aor),
      _zooAOR: aor,
      _zooHome: home
    };
  }).filter(Boolean);
}

function mergeRecords(existing, incoming, org) {
  const exMap = {};
  existing.forEach(r => {
    exMap[getMergeKey(r)] = r;
  });

  const isDCS = org === 'dcs';
  const isCanada = org === 'canada';
  const preserveUnmatched = isDCS || isCanada;
  
  const touched = {};
  const merged = incoming.map(r => {
    const key = getMergeKey(r);
    touched[key] = true;
    const old = exMap[key];

    if (!old) {
      if (isDCS) {
        if (!r.homeLocation && r._zooHome) r.homeLocation = r._zooHome;
        if (!r.statesCovers && r._zooAOR) r.statesCovers = r._zooAOR;
        if ((!r.coverageParsed || !r.coverageParsed.length) && r._zooAOR) {
          r.coverageParsed = parseStates(r._zooAOR);
        }
        delete r._zooAOR;
        delete r._zooHome;
      }
      return r;
    }

    const out = { ...r };
    Object.keys(old).forEach(k => {
      if (!(k in out) || out[k] === '' || out[k] === null || out[k] === undefined) {
        out[k] = old[k];
      }
    });

    if (isDCS) {
      if (!out.homeLocation && out._zooHome) out.homeLocation = out._zooHome;
      if (!out.statesCovers && out._zooAOR) out.statesCovers = out._zooAOR;
      if ((!out.coverageParsed || !out.coverageParsed.length) && out._zooAOR) {
        out.coverageParsed = parseStates(out._zooAOR);
      }
      delete out._zooAOR;
      delete out._zooHome;
    }

    return out;
  });

  if (preserveUnmatched) {
    existing.forEach(r => {
      if (!touched[getMergeKey(r)]) merged.push(r);
    });
  }

  let added = 0, updated = 0;
  const addedPeople = [];
  const changedDetails = [];
  const fieldChangeSummary = {};
  const COMPARE_KEYS = ['name','title','titleGroup','manager','managerEmail','managerTitle',
    'director','directorEmail','directorTitle','sector','segment','channel','tier',
    'region','area','district','location','phone','losGroup','academyFlag'];

  incoming.forEach(r => {
    const key = getMergeKey(r);
    const old = exMap[key];
    if (old) {
      updated++;
      // Compute field-level diffs (skip cosmetic-only formatting changes)
      const diffs = [];
      COMPARE_KEYS.forEach(k => {
        const ov = String(old[k] || '').trim();
        const nv = String(r[k] || '').trim();
        if (ov !== nv) {
          // Skip if the only difference is casing
          if (ov.toLowerCase() === nv.toLowerCase()) return;
          // Skip if the only difference is a trailing code in parens e.g. "Shelton - CT" vs "Shelton - CT (USA0004)"
          if (nv.replace(/\s*\([^)]*\)\s*$/, '') === ov || ov.replace(/\s*\([^)]*\)\s*$/, '') === nv) return;
          diffs.push({ field: k, oldVal: ov, newVal: nv });
          fieldChangeSummary[k] = (fieldChangeSummary[k] || 0) + 1;
        }
      });
      if (diffs.length > 0) {
        changedDetails.push({
          name: r.name || old.name || '',
          email: r.email || old.email || '',
          changes: diffs
        });
      }
    } else {
      added++;
      addedPeople.push({ name: r.name || '', email: r.email || '', title: r.title || '' });
    }
  });

  const removedPeople = [];
  if (!preserveUnmatched) {
    existing.forEach(r => {
      if (!touched[getMergeKey(r)]) {
        removedPeople.push({ name: r.name || '', email: r.email || '', title: r.title || '' });
      }
    });
  }

  const realChanges = changedDetails.length;

  return {
    data: merged,
    added,
    updated,
    removed: removedPeople.length,
    realChanges,
    fieldChangeSummary,
    changedDetails: changedDetails.slice(0, 50),
    removedPeople,
    addedPeople: addedPeople.slice(0, 50)
  };
}

function processAccountMapping(rows, existingAccounts, existingOrgData) {
  // Build org lookup
  const byEmail = {};
  const byName = {};
  const managerReports = {};
  
  existingOrgData.forEach(person => {
    const email = (person.email || '').toLowerCase();
    const name = (person.name || '').toLowerCase();
    const managerEmail = (person.managerEmail || '').toLowerCase();
    
    if (email) byEmail[email] = person;
    if (name) byName[name] = person;
    
    if (managerEmail) {
      if (!managerReports[managerEmail]) managerReports[managerEmail] = [];
      managerReports[managerEmail].push(person);
    }
  });
  
  // Find house accounts (SCC, SCCK, SCHI, etc.)
  const houseAccounts = Object.keys(existingAccounts)
    .filter(email => email !== '__UNMAPPED__')
    .filter(email => {
      const person = byEmail[email.toLowerCase()];
      if (!person) return false;
      const title = (person.title || '').toUpperCase();
      const name = (person.name || '').toUpperCase();
      return /SCC|HOUSE|CENTER/.test(title) || /CONTACT.*CENTER|HOUSE.*ACCOUNT/.test(name);
    });

  const ACCT_MAP = {};
  let mapped = 0, emailMatches = 0, nameMatches = 0, noMatch = 0, noCustomer = 0;
  const unmappedAccounts = [];
  
  let emailMatches_primary = 0, nameMatches_primary = 0, houseMatches = 0;

  rows.forEach((row, idx) => {
    const acct = {
      customer: String(row['CustomerDescription'] || row['MatchCustomerDescription'] || '').trim(),
      city: String(row['MatchBillToCity'] || row['City'] || '').trim(),
      state: String(row['MatchBillToState'] || row['State'] || '').trim(),
      custNum: String(row['MatchCustomerNumber'] || row['CustomerNumber'] || '').trim(),
      t12: row['MatchT12Spend'] || row['T12'] || '',
      duns: String(row['MatchDUNS'] || row['DUNS'] || row['DUNSNumber'] || row['DUNS Number'] || '').trim()
    };

    if (!acct.customer) {
      noCustomer++;
      return;
    }

    let matchKey = null;
    let matchMethod = null;

    // Strategy 1: Try MatchAMEmail (primary)
    const email = String(row['MatchAMEmail'] || row['Email'] || '').trim().toLowerCase();
    if (email && email.includes('@') && byEmail[email]) {
      matchKey = email;
      matchMethod = 'email_primary';
      emailMatches++;
      emailMatches_primary++;
    } 
    // Strategy 2: Try MatchAMFirstName + MatchAMLastName (fallback)
    else {
      const first = String(row['MatchAMFirstName'] || row['FirstName'] || '').trim();
      const last = String(row['MatchAMLastName'] || row['LastName'] || '').trim();
      if (first && last) {
        const fullName = (first + ' ' + last).toLowerCase();
        if (byName[fullName]) {
          const person = byName[fullName];
          matchKey = person.email ? person.email.toLowerCase() : null;
          
          if (matchKey) {
            matchMethod = 'name_fallback';
            nameMatches++;
            nameMatches_primary++;
          }
        }
      }
    }

    // If matched person is a removed manager, reassign to house account
    if (matchKey) {
      const person = byEmail[matchKey];
      const reports = managerReports[matchKey] || [];
      
      // Check if this person is missing from new upload (removed manager)
      if (reports.length > 0) {
        // This is a manager - keep assigned to them for now
        // Dashboard will show warning about reassignment
        if (!ACCT_MAP[matchKey]) ACCT_MAP[matchKey] = [];
        ACCT_MAP[matchKey].push(acct);
        mapped++;
      } else {
        if (!ACCT_MAP[matchKey]) ACCT_MAP[matchKey] = [];
        ACCT_MAP[matchKey].push(acct);
        mapped++;
      }
    }
    // Strategy 3: No match found - assign to house account
    else {
      if (houseAccounts.length > 0) {
        // Round-robin distribute to house accounts
        const houseEmail = houseAccounts[idx % houseAccounts.length];
        if (!ACCT_MAP[houseEmail]) ACCT_MAP[houseEmail] = [];
        ACCT_MAP[houseEmail].push(acct);
        mapped++;
        houseMatches++;
      } else {
        // No house account found, add to unmapped
        const unmappedAcct = {
          customer: acct.customer,
          city: acct.city,
          state: acct.state,
          custNum: acct.custNum,
          t12: acct.t12,
          duns: acct.duns,
          attemptedEmail: email || '',
          attemptedName: (row['MatchAMFirstName'] || '') + ' ' + (row['MatchAMLastName'] || ''),
          reason: 'No matching AE and no house account found'
        };
        unmappedAccounts.push(unmappedAcct);
        noMatch++;
      }
    }
  });

  if (unmappedAccounts.length > 0) {
    ACCT_MAP['__UNMAPPED__'] = unmappedAccounts;
  }

  return {
    data: ACCT_MAP,
    stats: {
      mapped,
      emailMatches: emailMatches_primary,
      nameMatches: nameMatches_primary,
      houseMatches,
      noMatch,
      noCustomer,
      total: rows.length
    }
  };
}

function loadConfig() {
  if (fs.existsSync(CONFIG.configFile)) {
    return JSON.parse(fs.readFileSync(CONFIG.configFile, 'utf8'));
  }
  return { password: 'admin123' };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG.configFile, JSON.stringify(config, null, 2), 'utf8');
}

let config = loadConfig();
const sessions = new Map();

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(password) {
  if (password === config.password) {
    const token = generateSessionToken();
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000);
    sessions.set(token, { expiresAt });
    return token;
  }
  return null;
}

function isValidSession(token) {
  const session = sessions.get(token);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
  if (token && isValidSession(token)) {
    req.authenticated = true;
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const cookies = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      cookies[name] = decodeURIComponent(value);
    });
  }
  req.cookies = cookies;
  next();
});

const storage = multer.diskStorage({
  destination: CONFIG.uploadDir,
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `${timestamp}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: CONFIG.maxFileSize },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx, .xls, or .csv files are allowed'));
    }
  }
});

function parseExcelFile(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const result = {};
    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      result[sheetName] = XLSX.utils.sheet_to_json(worksheet);
    });
    return result;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
}

function updateJsonFile(orgType, newData, backupFirst = true) {
  const filename = getJsonFilename(orgType);
  const outputPath = path.join(CONFIG.jsonOutputDir, filename);
  if (backupFirst && fs.existsSync(outputPath)) {
    const backupPath = `${outputPath}.backup.${Date.now()}`;
    fs.copyFileSync(outputPath, backupPath);
    console.log(`Backup created: ${backupPath}`);
  }
  fs.writeFileSync(outputPath, JSON.stringify(newData, null, 2), 'utf8');
  return outputPath;
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  
  const token = createSession(password);
  if (!token) return res.status(401).json({ error: 'Invalid password' });
  
  res.json({ success: true, token, expiresIn: 24 * 60 * 60 });
});

app.post('/api/logout', (req, res) => {
  const token = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
  if (token) sessions.delete(token);
  res.json({ success: true });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/auth-status', (req, res) => {
  const token = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
  const authenticated = token && isValidSession(token);
  res.json({ authenticated });
});

app.get('/api/status', authMiddleware, (req, res) => {
  try {
    const files = fs.readdirSync(CONFIG.jsonOutputDir)
      .filter(f => f.endsWith('.json') && !f.includes('.backup'))
      .map(f => {
        const filePath = path.join(CONFIG.jsonOutputDir, f);
        const stats = fs.statSync(filePath);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Check if www version exists and whether it matches (by size)
        const wwwPath = path.join(CONFIG.wwwDir, f);
        let deployStatus = 'not_deployed';
        if (fs.existsSync(wwwPath)) {
          const wwwStats = fs.statSync(wwwPath);
          if (wwwStats.size === stats.size) {
            deployStatus = 'live';
          } else {
            deployStatus = 'outdated'; // exists in www but different version
          }
        }

        return {
          name: f,
          size: stats.size,
          modified: stats.mtime,
          records: Array.isArray(content) ? content.length : Object.keys(content).length,
          deployStatus
        };
      });

    const wwwFiles = fs.existsSync(CONFIG.wwwDir) ? fs.readdirSync(CONFIG.wwwDir).filter(f => f.endsWith('.json')) : [];

    res.json({
      uploadDir: CONFIG.uploadDir,
      jsonOutputDir: CONFIG.jsonOutputDir,
      wwwDir: CONFIG.wwwDir,
      jsonFiles: files,
      wwwFiles: wwwFiles,
      wwwDirExists: fs.existsSync(CONFIG.wwwDir)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload/org', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let orgType = req.body.orgType;
    if (!orgType) return res.status(400).json({ error: 'Organization type not specified' });
    
    orgType = orgType.toLowerCase();
    if (!['cdw', 'dcs', 'canada'].includes(orgType)) {
      return res.status(400).json({ error: 'Invalid org type. Must be cdw, dcs, or canada' });
    }

    console.log(`Using specified org type: ${orgType}`);

    const sheetData = parseExcelFile(req.file.path);
    let incomingData = Object.values(sheetData)[0] || [];
    
    if (incomingData.length === 0) {
      return res.status(400).json({ error: 'No data found in uploaded file' });
    }

    const dcsNorm = orgType === 'dcs' ? normaliseDCSRows(incomingData) : null;
    if (dcsNorm) {
      incomingData = dcsNorm;
    } else {
      incomingData = normaliseRows(incomingData, orgType);
    }

    const jsonFilename = getJsonFilename(orgType);
    const localPath = path.join(CONFIG.jsonOutputDir, jsonFilename);
    const wwwPath = path.join(CONFIG.wwwDir, jsonFilename);
    const jsonPath = fs.existsSync(localPath) ? localPath : (fs.existsSync(wwwPath) ? wwwPath : null);
    let existingData = [];
    if (jsonPath) {
      console.log(`Loading existing org data from: ${jsonPath}`);
      existingData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } else {
      console.log(`No existing org data found for ${orgType} (checked ${localPath} and ${wwwPath})`);
    }

    const mergeResult = mergeRecords(existingData, incomingData, orgType);
    updateJsonFile(orgType, mergeResult.data, false);

    res.json({
      success: true,
      orgType,
      autoDetected: false,
      recordsProcessed: incomingData.length,
      stats: {
        added: mergeResult.added,
        updated: mergeResult.updated,
        removed: mergeResult.removed,
        realChanges: mergeResult.realChanges
      },
      fieldChangeSummary: mergeResult.fieldChangeSummary,
      changedDetails: mergeResult.changedDetails,
      removedPeople: mergeResult.removedPeople,
      addedPeople: mergeResult.addedPeople,
      outputFile: jsonFilename,
      uploadedFile: req.file.originalname,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/apply-changes', authMiddleware, (req, res) => {
  try {
    const { orgType, outputFile, actualFilename } = req.body;
    
    if (!orgType || !outputFile) {
      return res.status(400).json({ error: 'orgType and outputFile required' });
    }

    const sourcePath = path.join(CONFIG.jsonOutputDir, outputFile);
    
    // For account mapping, use actualFilename; for org types use getJsonFilename
    const destFilename = actualFilename || getJsonFilename(orgType);
    const destPath = path.join(CONFIG.jsonOutputDir, destFilename);

    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Source file not found' });
    }

    // Create backup of current file if it exists
    if (fs.existsSync(destPath)) {
      const backupPath = `${destPath}.backup.${Date.now()}`;
      fs.copyFileSync(destPath, backupPath);
      console.log(`Backup created: ${backupPath}`);
    }

    // Copy source to destination
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Updated: ${destPath}`);

    // Clean up temp/staging file if it's different from the destination
    if (sourcePath !== destPath) {
      try {
        fs.unlinkSync(sourcePath);
        console.log(`Cleaned up temp file: ${outputFile}`);
      } catch (e) {
        console.error(`Could not clean up temp file: ${outputFile}`, e.message);
      }
    }

    res.json({
      success: true,
      message: `${destFilename} has been applied. Backup created.`,
      destination: destPath,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Apply changes error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload/mapping', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const sheetData = parseExcelFile(req.file.path);
    const rawData = Object.values(sheetData)[0] || [];

    // Load all org data — check json-output first, fall back to wwwDir
    const allOrgData = [];
    let existingAccounts = {};

    ['cdw', 'dcs', 'canada'].forEach(org => {
      const filename = getJsonFilename(org);
      const localPath = path.join(CONFIG.jsonOutputDir, filename);
      const wwwPath = path.join(CONFIG.wwwDir, filename);
      const jsonPath = fs.existsSync(localPath) ? localPath : (fs.existsSync(wwwPath) ? wwwPath : null);
      if (jsonPath) {
        console.log(`Loading org data from: ${jsonPath}`);
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        allOrgData.push(...(Array.isArray(data) ? data : Object.values(data).flat()));
      } else {
        console.log(`No org data found for ${org} (checked ${localPath} and ${wwwPath})`);
      }
    });

    console.log(`Total org records loaded: ${allOrgData.length}`);

    // Load existing accounts — check json-output first, fall back to wwwDir
    const acctFilename = getJsonFilename('CDW_accounts');
    const acctLocalPath = path.join(CONFIG.jsonOutputDir, acctFilename);
    const acctWwwPath = path.join(CONFIG.wwwDir, acctFilename);
    const acctPath = fs.existsSync(acctLocalPath) ? acctLocalPath : (fs.existsSync(acctWwwPath) ? acctWwwPath : null);
    if (acctPath) {
      console.log(`Loading existing accounts from: ${acctPath}`);
      existingAccounts = JSON.parse(fs.readFileSync(acctPath, 'utf8'));
    } else {
      console.log(`No existing accounts found (checked ${acctLocalPath} and ${acctWwwPath})`);
    }

    const result = processAccountMapping(rawData, existingAccounts, allOrgData);
    
    // Create temp file (don't update production yet)
    const tempFilename = `CDW_accounts_${Date.now()}.json`;
    const tempPath = path.join(CONFIG.jsonOutputDir, tempFilename);
    fs.writeFileSync(tempPath, JSON.stringify(result.data, null, 2), 'utf8');

    // Count existing accounts for comparison
    const existingCount = Object.keys(existingAccounts)
      .filter(k => k !== '__UNMAPPED__')
      .reduce((sum, k) => sum + (existingAccounts[k] ? existingAccounts[k].length : 0), 0);
    
    const newCount = Object.keys(result.data)
      .filter(k => k !== '__UNMAPPED__')
      .reduce((sum, k) => sum + (result.data[k] ? result.data[k].length : 0), 0);

    res.json({
      success: true,
      orgType: 'mapping',
      recordsProcessed: rawData.length,
      stats: {
        added: Math.max(0, newCount - existingCount),
        updated: Math.min(existingCount, newCount),
        removed: Math.max(0, existingCount - newCount),
        mapped: result.stats.mapped,
        emailMatches: result.stats.emailMatches,
        nameMatches: result.stats.nameMatches,
        houseMatches: result.stats.houseMatches,
        noMatch: result.stats.noMatch,
        noCustomer: result.stats.noCustomer
      },
      outputFile: tempFilename,
      actualFilename: acctFilename,
      uploadedFile: req.file.originalname,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Mapping upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

function processPureAEMapping(rows, existingCdwData, existingCanadaData, cdwAccounts, canadaOrgEmails) {
  const PAE_COL_MAP = {
    'aename': 'ae_name', 'ae name': 'ae_name', 'ae': 'ae_name',
    'stakeholder': 'ae_name', 'stakeholdername': 'ae_name', 'stakeholder name': 'ae_name',
    'pam': 'pam', 'pam name': 'pam',
    'customernumber': 'custNum', 'customer number': 'custNum', 'customer #': 'custNum',
    'custnum': 'custNum', 'accountnumber': 'custNum', 'account number': 'custNum',
    'matchcustomer': 'custNum', 'match customer': 'custNum',
    'matchcustomernumber': 'custNum', 'match customer number': 'custNum',
    'customerdescription': 'custDesc', 'customer description': 'custDesc',
    'customer name': 'custDesc', 'customername': 'custDesc', 'custdesc': 'custDesc',
    'matchcustomerdescription': 'custDesc', 'match customer description': 'custDesc',
    'matchcustomername': 'custDesc', 'match customer name': 'custDesc',
    'amfirstname': 'amFirstName', 'am first name': 'amFirstName', 'am first': 'amFirstName',
    'first name': 'amFirstName', 'firstname': 'amFirstName',
    'matchamfirst': 'amFirstName', 'match am first': 'amFirstName',
    'matchamfirstname': 'amFirstName', 'match am first name': 'amFirstName',
    'amlastname': 'amLastName', 'am last name': 'amLastName', 'am last': 'amLastName',
    'last name': 'amLastName', 'lastname': 'amLastName',
    'matchamlastname': 'amLastName', 'match am last name': 'amLastName', 'matchamlast': 'amLastName',
    'amemail': 'amEmail', 'am email': 'amEmail', 'email': 'amEmail',
    'matchamemail': 'amEmail', 'match am email': 'amEmail',
    'amphone': 'amPhone', 'am phone': 'amPhone', 'phone': 'amPhone',
    'matchduns': 'duns', 'match duns': 'duns', 'duns': 'duns', 'dunsnumber': 'duns', 'duns number': 'duns',
  };

  function normalizeKey(k) { return String(k).toLowerCase().trim().replace(/\s+/g, ' '); }

  // ── Build CDW_accounts lookup indexes for cascade matching ──────────────
  const acctByEmail = {};
  const acctByDuns = {};
  const acctByCustNum = {};
  const acctByNameExact = {};
  const acctNames = [];

  if (cdwAccounts && typeof cdwAccounts === 'object') {
    Object.keys(cdwAccounts).forEach(emailKey => {
      if (emailKey === '__UNMAPPED__') return;
      const accts = cdwAccounts[emailKey];
      if (!Array.isArray(accts)) return;
      accts.forEach(acct => {
        if (!acctByEmail[emailKey]) acctByEmail[emailKey] = [];
        acctByEmail[emailKey].push(acct);
        const duns = String(acct.duns || '').trim();
        if (duns) acctByDuns[duns] = { email: emailKey, acct };
        const cn = String(acct.custNum || '').trim();
        if (cn) acctByCustNum[cn] = { email: emailKey, acct };
        const custName = String(acct.customer || '').trim().toLowerCase();
        if (custName) {
          acctByNameExact[custName] = { email: emailKey, acct };
          acctNames.push({ name: acct.customer, nameLower: custName, email: emailKey, acct });
        }
      });
    });
  }
  console.log(`PAE match indexes built: ${Object.keys(acctByEmail).length} emails, ${Object.keys(acctByDuns).length} DUNS, ${Object.keys(acctByCustNum).length} custNums, ${acctNames.length} names`);

  function fuzzyMatch(needle, haystack, threshold) {
    if (!needle || !haystack.length) return null;
    const nLower = needle.toLowerCase();
    const nWords = nLower.split(/\s+/).filter(Boolean);
    let best = null, bestScore = 0;
    haystack.forEach(entry => {
      const hWords = entry.nameLower.split(/\s+/).filter(Boolean);
      let shared = 0;
      nWords.forEach(w => { if (hWords.some(hw => hw === w || hw.includes(w) || w.includes(hw))) shared++; });
      const score = shared / Math.max(nWords.length, hWords.length);
      const containsScore = (entry.nameLower.includes(nLower) || nLower.includes(entry.nameLower)) ? 0.85 : 0;
      const finalScore = Math.max(score, containsScore);
      if (finalScore > bestScore && finalScore >= threshold) { bestScore = finalScore; best = entry; }
    });
    return best;
  }

  const matchStats = { byEmail: 0, byDuns: 0, byCustNum: 0, byExactName: 0, byFuzzyName: 0, noMatch: 0 };

  function resolveMatch(norm) {
    const email = (norm.amEmail || '').toLowerCase();
    if (email && email.includes('@') && acctByEmail[email]) {
      matchStats.byEmail++;
      return { email, acct: acctByEmail[email][0] || null };
    }
    const duns = String(norm.duns || '').trim();
    if (duns && acctByDuns[duns]) {
      matchStats.byDuns++;
      return { email: acctByDuns[duns].email, acct: acctByDuns[duns].acct };
    }
    const cn = String(norm.custNum || '').trim();
    if (cn && acctByCustNum[cn]) {
      matchStats.byCustNum++;
      return { email: acctByCustNum[cn].email, acct: acctByCustNum[cn].acct };
    }
    const desc = (norm.custDesc || '').trim().toLowerCase();
    if (desc && acctByNameExact[desc]) {
      matchStats.byExactName++;
      return { email: acctByNameExact[desc].email, acct: acctByNameExact[desc].acct };
    }
    // Fuzzy matching disabled — too slow against 109K names. TODO: optimize with word index.
    matchStats.noMatch++;
    return { email, acct: null };
  }

  // Group incoming rows into CDW or Canada bucket based on @cdw.ca email domain
  const incomingCdw = {};
  const incomingCanada = {};
  let skipped = 0;

  rows.forEach(row => {
    const norm = {};
    Object.keys(row).forEach(k => {
      const mapped = PAE_COL_MAP[normalizeKey(k)];
      if (mapped) norm[mapped] = String(row[k] == null ? '' : row[k]).trim();
    });
    const aeName = norm.ae_name;
    if (!aeName || !norm.custNum) { skipped++; return; }

    const match = resolveMatch(norm);
    const resolvedEmail = match.email;

    // Route to Canada if: @cdw.ca email, Canada org member, OR Canada house account pattern in AM name
    const amFullName = ((norm.amFirstName || '') + ' ' + (norm.amLastName || '')).toUpperCase();
    const isCanadaHouse = /\bCA0[0-9]\b|CANADA/i.test(amFullName);
    if (norm.amFirstName && /CA0/i.test(norm.amFirstName)) console.log(`  DEBUG: custDesc=${norm.custDesc} amFirst=${norm.amFirstName} amLast=${norm.amLastName} amFull=${amFullName} isCanadaHouse=${isCanadaHouse} resolvedEmail=${resolvedEmail}`);
    const isCanada = resolvedEmail.endsWith('@cdw.ca') || (canadaOrgEmails && canadaOrgEmails.has(resolvedEmail)) || isCanadaHouse;
    const target = isCanada ? incomingCanada : incomingCdw;

    if (!target[aeName]) target[aeName] = { ae_name: aeName, pam: norm.pam || '', accounts: {} };
    if (norm.pam && !target[aeName].pam) target[aeName].pam = norm.pam;
    target[aeName].accounts[norm.custNum] = {
      custNum: norm.custNum,
      custDesc: norm.custDesc || '',
      amFirstName: norm.amFirstName || (match.acct && match.acct.amFirstName) || '',
      amLastName: norm.amLastName || (match.acct && match.acct.amLastName) || '',
      amEmail: resolvedEmail,
      amPhone: norm.amPhone || (match.acct && match.acct.amPhone) || '',
      duns: norm.duns || (match.acct && match.acct.duns) || '',
    };
  });

  // Merge incoming bucket into an existing dataset
  // isCdw flag: when true, strip any @cdw.ca accounts from existing data so old
  // Canadian accounts don't persist in pure_ae_mapping.json after the split is applied.
  function mergeDataset(incoming, existingData, isCdw = false) {
    const existing = {};
    (existingData || []).forEach(entry => {
      existing[entry.ae_name] = { ae_name: entry.ae_name, pam: entry.pam || '', accounts: {} };
      (entry.accounts || []).forEach(acct => {
        // If building the CDW file, drop accounts belonging to Canada reps or Canada house accounts
        if (isCdw) {
          if (acct.amEmail) {
            const em = acct.amEmail.toLowerCase();
            if (em.endsWith('@cdw.ca') || (canadaOrgEmails && canadaOrgEmails.has(em))) return;
          }
          const amName = ((acct.amFirstName || '') + ' ' + (acct.amLastName || '')).toUpperCase();
          if (/\bCA0[0-9]\b|CANADA/i.test(amName)) return;
        }
        existing[entry.ae_name].accounts[acct.custNum] = acct;
      });
    });

    const merged = {};
    let addedAEs = 0, updatedAEs = 0, addedAccounts = 0, updatedAccounts = 0;
    Object.keys(existing).forEach(n => { merged[n] = { ...existing[n], accounts: { ...existing[n].accounts } }; });

    Object.keys(incoming).forEach(aeName => {
      if (!merged[aeName]) {
        merged[aeName] = { ae_name: aeName, pam: incoming[aeName].pam, accounts: {} };
        addedAEs++;
      } else {
        if (incoming[aeName].pam) merged[aeName].pam = incoming[aeName].pam;
        updatedAEs++;
      }
      Object.keys(incoming[aeName].accounts).forEach(custNum => {
        if (!merged[aeName].accounts[custNum]) {
          merged[aeName].accounts[custNum] = incoming[aeName].accounts[custNum];
          addedAccounts++;
        } else {
          merged[aeName].accounts[custNum] = { ...merged[aeName].accounts[custNum], ...incoming[aeName].accounts[custNum] };
          updatedAccounts++;
        }
      });
    });

    const result = Object.keys(merged).sort().map(n => ({
      ae_name: merged[n].ae_name,
      pam: merged[n].pam,
      accounts: Object.values(merged[n].accounts),
    }));

    return { data: result, stats: { totalAEs: result.length, addedAEs, updatedAEs, addedAccounts, updatedAccounts } };
  }

  const cdwResult = mergeDataset(incomingCdw, existingCdwData, true);
  const canadaResult = mergeDataset(incomingCanada, existingCanadaData, false);
  cdwResult.stats.skipped = skipped;
  canadaResult.stats.skipped = 0;

  console.log('PAE match results:', matchStats);
  return { cdw: cdwResult, canada: canadaResult, matchStats };
}

app.post('/api/upload/pure-ae', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const sheetData = parseExcelFile(req.file.path);
    const rawData = Object.values(sheetData)[0] || [];
    if (rawData.length === 0) return res.status(400).json({ error: 'No data found in uploaded file' });

    // Helper: load a JSON file from json-output/ first, then wwwDir fallback
    function loadExistingJson(filename) {
      const localPath = path.join(CONFIG.jsonOutputDir, filename);
      const wwwPath = path.join(CONFIG.wwwDir, filename);
      const resolved = fs.existsSync(localPath) ? localPath : (fs.existsSync(wwwPath) ? wwwPath : null);
      if (resolved) {
        console.log(`Loading existing ${filename} from: ${resolved}`);
        return JSON.parse(fs.readFileSync(resolved, 'utf8'));
      }
      console.log(`No existing ${filename} found — starting fresh`);
      return [];
    }

    const existingCdwData = loadExistingJson('pure_ae_mapping.json');
    const existingCanadaData = loadExistingJson('pure_ae_canada.json');

    let cdwAccounts = {};
    const acctFilename = 'CDW_accounts.json';
    const acctLocalPath = path.join(CONFIG.jsonOutputDir, acctFilename);
    const acctWwwPath = path.join(CONFIG.wwwDir, acctFilename);
    const acctPath = fs.existsSync(acctLocalPath) ? acctLocalPath : (fs.existsSync(acctWwwPath) ? acctWwwPath : null);
    if (acctPath) {
      console.log(`Loading CDW_accounts.json for PAE matching from: ${acctPath}`);
      cdwAccounts = JSON.parse(fs.readFileSync(acctPath, 'utf8'));
    } else {
      console.log('No CDW_accounts.json found — PAE matching will use email only');
    }

    // Build set of Canada org emails for routing (catches @cdw.com reps in Canada org)
    const canadaOrgEmails = new Set();
    const caOrgFilename = 'canada_data.json';
    const caOrgLocal = path.join(CONFIG.jsonOutputDir, caOrgFilename);
    const caOrgWww = path.join(CONFIG.wwwDir, caOrgFilename);
    const caOrgPath = fs.existsSync(caOrgLocal) ? caOrgLocal : (fs.existsSync(caOrgWww) ? caOrgWww : null);
    if (caOrgPath) {
      const caOrg = JSON.parse(fs.readFileSync(caOrgPath, 'utf8'));
      caOrg.forEach(p => { if (p.email) canadaOrgEmails.add(p.email.toLowerCase()); });
      console.log(`Canada org emails loaded: ${canadaOrgEmails.size} people`);
    }

    const result = processPureAEMapping(rawData, existingCdwData, existingCanadaData, cdwAccounts, canadaOrgEmails);

    const ts = Date.now();
    const cdwTempFile = `pure_ae_mapping_${ts}.json`;
    const canadaTempFile = `pure_ae_canada_${ts}.json`;

    fs.writeFileSync(path.join(CONFIG.jsonOutputDir, cdwTempFile), JSON.stringify(result.cdw.data, null, 2), 'utf8');
    fs.writeFileSync(path.join(CONFIG.jsonOutputDir, canadaTempFile), JSON.stringify(result.canada.data, null, 2), 'utf8');

    res.json({
      success: true,
      orgType: 'pure-ae',
      recordsProcessed: rawData.length,
      cdw: { stats: result.cdw.stats, outputFile: cdwTempFile, actualFilename: 'pure_ae_mapping.json' },
      canada: { stats: result.canada.stats, outputFile: canadaTempFile, actualFilename: 'pure_ae_canada.json' },
      matchStats: result.matchStats,
      uploadedFile: req.file.originalname,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Pure AE upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/copy-to-www/:filename', authMiddleware, (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename.endsWith('.json') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const sourcePath = path.join(CONFIG.jsonOutputDir, filename);
    const destPath = path.join(CONFIG.wwwDir, filename);

    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Source file not found' });
    }

    if (!fs.existsSync(CONFIG.wwwDir)) {
      return res.status(500).json({ error: `Destination directory not found: ${CONFIG.wwwDir}` });
    }

    fs.copyFileSync(sourcePath, destPath);
    fs.chmodSync(destPath, 0o666);

    res.json({
      success: true,
      filename: filename,
      destination: destPath,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Copy error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/download/:filename', authMiddleware, (req, res) => {
  try {
    const filePath = path.join(CONFIG.jsonOutputDir, req.params.filename);
    if (!filePath.startsWith(CONFIG.jsonOutputDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.download(filePath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (currentPassword !== config.password) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  config.password = newPassword;
  saveConfig(config);
  res.json({ success: true, message: 'Password changed successfully' });
});

app.post('/api/delete-file/:filename', authMiddleware, (req, res) => {
  try {
    const { filename } = req.params;

    if (!filename.endsWith('.json') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(CONFIG.jsonOutputDir, filename);
    
    if (!filePath.startsWith(CONFIG.jsonOutputDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Also delete any backups of this file
    const dir = fs.readdirSync(CONFIG.jsonOutputDir);
    dir.forEach(f => {
      if (f.startsWith(filename) && f.includes('.backup')) {
        const backupPath = path.join(CONFIG.jsonOutputDir, f);
        try {
          fs.unlinkSync(backupPath);
          console.log(`Deleted backup: ${f}`);
        } catch (e) {
          console.error(`Could not delete backup: ${f}`, e.message);
        }
      }
    });

    fs.unlinkSync(filePath);
    console.log(`Deleted: ${filename}`);

    res.json({
      success: true,
      message: `${filename} deleted successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: error.message });
});

app.listen(PORT, () => {
  console.log(`CDW Admin Dashboard running on http://localhost:${PORT}`);
  console.log(`Upload directory: ${CONFIG.uploadDir}`);
  console.log(`JSON output directory: ${CONFIG.jsonOutputDir}`);
  console.log(`Web directory target: ${CONFIG.wwwDir}`);
  console.log(`Default password: ${config.password}`);
});

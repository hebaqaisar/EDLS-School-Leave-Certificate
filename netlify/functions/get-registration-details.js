const { google } = require('googleapis');

// Required env vars:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_PRIVATE_KEY_B64
//   REGISTRATIONS_SHEET_ID   - the registration form's sheet
//   REGISTRATIONS_SHEET_TAB  - defaults to "CurrentRegistrations"
//
// Looks up a student by EDLS ID and returns the fields needed for the
// leaving certificate: name, father's name, date of birth, and date of
// admission (Registration Date). If a student has multiple rows (e.g. a
// re-admission), the LAST matching row is used, assuming rows are appended
// chronologically and the most recent is authoritative.

function findCol(headers, ...candidates){
  const lower = headers.map(h => (h || '').toString().trim().toLowerCase());
  for (const candidate of candidates){
    const idx = lower.findIndex(h => h.includes(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { edlsId } = event.queryStringParameters || {};
  if (!edlsId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing edlsId' }) };
  }

  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      Buffer.from(process.env.GOOGLE_PRIVATE_KEY_B64 || '', 'base64').toString('utf8'),
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );

    const sheets = google.sheets({ version: 'v4', auth });
    const tab = process.env.REGISTRATIONS_SHEET_TAB || 'CurrentRegistrations';

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.REGISTRATIONS_SHEET_ID,
      range: `${tab}!A:Z`
    });

    const rows = result.data.values || [];
    if (rows.length < 2) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No registration records found' }) };
    }

    const headers = rows[0];
    const edlsCol = findCol(headers, 'edls');
    const firstNameCol = findCol(headers, 'first name');
    const lastNameCol = findCol(headers, 'last name');
    const fatherNameCol = findCol(headers, "father's name", 'father name');
    const dobCol = findCol(headers, 'date of birth', 'dob');
    const admissionDateCol = findCol(headers, 'registration date');

    if ([edlsCol, firstNameCol, lastNameCol, fatherNameCol, dobCol, admissionDateCol].includes(-1)) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not find expected columns in the registrations sheet' }) };
    }

    const matches = rows.slice(1).filter(row => (row[edlsCol] || '').trim() === edlsId);
    if (matches.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: `No registration record found for ${edlsId}` }) };
    }
    const row = matches[matches.length - 1]; // most recent

    return {
      statusCode: 200,
      body: JSON.stringify({
        firstName: (row[firstNameCol] || '').trim(),
        lastName: (row[lastNameCol] || '').trim(),
        fatherName: (row[fatherNameCol] || '').trim(),
        dob: (row[dobCol] || '').trim(),
        admissionDate: (row[admissionDateCol] || '').trim()
      })
    };
  } catch (err) {
    console.error('get-registration-details failed:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not load registration details. Please try again.' })
    };
  }
};

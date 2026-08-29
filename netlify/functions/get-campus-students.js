const { google } = require('googleapis');

// Required env vars:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_PRIVATE_KEY_B64
//   STUDENTS_SHEET_ID     - the Student_Info sheet
//   STUDENTS_SHEET_TAB    - defaults to "Student_Info"
//
// Returns every student at a campus with their EDLS ID and Category
// (Category doubles as both "Grade to which Admitted" and "Current Grade"
// on the certificate, per how EDLS tracks it).

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

  const { campus } = event.queryStringParameters || {};
  if (!campus) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing campus' }) };
  }

  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      Buffer.from(process.env.GOOGLE_PRIVATE_KEY_B64 || '', 'base64').toString('utf8'),
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );

    const sheets = google.sheets({ version: 'v4', auth });
    const tab = process.env.STUDENTS_SHEET_TAB || 'Student_Info';

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.STUDENTS_SHEET_ID,
      range: `${tab}!A:Z`
    });

    const rows = result.data.values || [];
    if (rows.length < 2) {
      return { statusCode: 200, body: JSON.stringify({ students: [] }) };
    }

    const headers = rows[0];
    const nameCol = findCol(headers, 'student_name', 'name');
    const edlsCol = findCol(headers, 'edls');
    const campusCol = findCol(headers, 'campus');
    const categoryCol = findCol(headers, 'category');

    if ([nameCol, edlsCol, campusCol, categoryCol].includes(-1)) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not find expected columns in the students sheet' }) };
    }

    const students = rows.slice(1)
      .filter(row => (row[campusCol] || '').trim() === campus)
      .map(row => ({
        name: (row[nameCol] || '').trim(),
        edlsId: (row[edlsCol] || '').trim(),
        category: (row[categoryCol] || '').trim()
      }))
      .filter(s => s.name && s.edlsId);

    return { statusCode: 200, body: JSON.stringify({ students }) };
  } catch (err) {
    console.error('get-campus-students failed:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not load student list. Please try again.' })
    };
  }
};

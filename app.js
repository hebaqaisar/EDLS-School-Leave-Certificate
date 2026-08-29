const EXCLUDED_CAMPUSES = ['C11', 'C14'];

const campusSelect = document.getElementById('campus');
const studentSelect = document.getElementById('student');
const studentLoadState = document.getElementById('studentLoadState');
const generateBtn = document.getElementById('generate-btn');
const statusEl = document.getElementById('status');
const certPreview = document.getElementById('certPreview');
const downloadActions = document.getElementById('downloadActions');
const downloadStatus = document.getElementById('downloadStatus');
const downloadBtn = document.getElementById('download-btn');

// Campus dropdown C01–C15 excl. C11/C14 (no Off Campus — leaving
// certificates are a regular-campus admin task; add it here later if needed)
for (let i = 1; i <= 15; i++){
  const code = 'C' + String(i).padStart(2, '0');
  if (EXCLUDED_CAMPUSES.includes(code)) continue;
  const opt = document.createElement('option');
  opt.value = code;
  opt.textContent = code;
  campusSelect.appendChild(opt);
}

let currentStudents = [];
let selectedStudent = null;

function resetStudentSelect(placeholder){
  studentSelect.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
  studentSelect.disabled = true;
}
function setStatus(text, kind){
  statusEl.textContent = text;
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

campusSelect.addEventListener('change', async () => {
  resetStudentSelect('Loading…');
  currentStudents = [];
  selectedStudent = null;
  certPreview.classList.remove('show');
  downloadActions.style.display = 'none';
  if (!campusSelect.value) return;

  studentLoadState.classList.add('show');
  try{
    const res = await fetch(`/.netlify/functions/get-campus-students?campus=${encodeURIComponent(campusSelect.value)}`);
    if (!res.ok) throw new Error('Could not load students.');
    const json = await res.json();
    currentStudents = json.students || [];
    if (!currentStudents.length){
      resetStudentSelect('No students found');
      return;
    }
    studentSelect.innerHTML = '<option value="" disabled selected>Select student</option>' +
      currentStudents.map((s, i) => `<option value="${i}">${s.name} (${s.edlsId})</option>`).join('');
    studentSelect.disabled = false;
  } catch (err){
    resetStudentSelect('Could not load students');
  } finally {
    studentLoadState.classList.remove('show');
  }
});

studentSelect.addEventListener('change', () => {
  selectedStudent = currentStudents[studentSelect.value] || null;
  certPreview.classList.remove('show');
  downloadActions.style.display = 'none';
});

generateBtn.addEventListener('click', async () => {
  if (!selectedStudent){
    setStatus('Please select a student first.', 'error');
    return;
  }
  setStatus('', '');
  generateBtn.disabled = true;
  generateBtn.classList.add('loading');

  try{
    const res = await fetch(`/.netlify/functions/get-registration-details?edlsId=${encodeURIComponent(selectedStudent.edlsId)}`);
    if (!res.ok){
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || 'Could not load registration details.');
    }
    const details = await res.json();

    const campus = campusSelect.value;
    document.getElementById('regNo').value = `${campus}_${selectedStudent.edlsId}`;
    document.getElementById('certName').value = `${details.firstName} ${details.lastName}`.trim();
    document.getElementById('fatherName').value = details.fatherName;
    document.getElementById('dob').value = details.dob;
    document.getElementById('admissionDate').value = details.admissionDate;
    document.getElementById('gradeAdmitted').value = selectedStudent.category;
    document.getElementById('currentGrade').value = selectedStudent.category;

    certPreview.classList.add('show');
    downloadActions.style.display = 'flex';
    certPreview.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err){
    setStatus(err.message || 'Could not generate certificate.', 'error');
  } finally {
    generateBtn.disabled = false;
    generateBtn.classList.remove('loading');
  }
});

// --- Signature: click-to-upload or paste-an-image (Ctrl+V) ---
function wireSignatureBox(boxId, inputId){
  const box = document.getElementById(boxId);
  const input = document.getElementById(inputId);

  function loadImage(file){
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      box.innerHTML = `<img src="${reader.result}" alt="signature">`;
      box.dataset.filled = 'true';
    };
    reader.readAsDataURL(file);
  }

  box.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files[0]) loadImage(input.files[0]);
  });
  box.addEventListener('paste', (e) => {
    const item = Array.from(e.clipboardData.items || []).find(i => i.type.startsWith('image/'));
    if (item) loadImage(item.getAsFile());
  });
  // Allow paste while focused via keyboard too — some browsers only fire
  // 'paste' on contenteditable/inputs, so also listen at document level
  // when this box was the last one clicked.
  box.addEventListener('focus', () => { document._activeSigBox = box; });
}
wireSignatureBox('teacherSigBox', 'teacherSigFile');
wireSignatureBox('headSigBox', 'headSigFile');

// --- Local test mode: open certificate.html?test=1 to preview the
// certificate + PDF flow without any backend/deployment — fills in dummy
// data and reveals the preview immediately. Safe to leave in; does nothing
// unless that exact query param is present.
if (new URLSearchParams(location.search).get('test') === '1'){
  document.getElementById('regNo').value = 'C01_EDLS0001';
  document.getElementById('certName').value = 'Test Student';
  document.getElementById('fatherName').value = 'Test Father Name';
  document.getElementById('dob').value = '2012-05-14';
  document.getElementById('admissionDate').value = '2020-01-10';
  document.getElementById('gradeAdmitted').value = 'Year 4';
  document.getElementById('currentGrade').value = 'Year 4';
  certPreview.classList.add('show');
  downloadActions.style.display = 'flex';
}

document.addEventListener('paste', (e) => {
  if (!document._activeSigBox) return;
  const item = Array.from(e.clipboardData.items || []).find(i => i.type.startsWith('image/'));
  if (!item) return;
  const reader = new FileReader();
  reader.onload = () => {
    document._activeSigBox.innerHTML = `<img src="${reader.result}" alt="signature">`;
    document._activeSigBox.dataset.filled = 'true';
  };
  reader.readAsDataURL(item.getAsFile());
});

// --- Download as PDF (print) ---
downloadBtn.addEventListener('click', () => {
  const teacherFilled = document.getElementById('teacherSigBox').dataset.filled === 'true';
  const headFilled = document.getElementById('headSigBox').dataset.filled === 'true';
  const certDate = document.getElementById('certDate').value;

  if (!teacherFilled || !headFilled){
    downloadStatus.textContent = 'Both signatures are required before downloading.';
    downloadStatus.className = 'status error';
    return;
  }
  if (!certDate){
    downloadStatus.textContent = 'Please set the certificate date.';
    downloadStatus.className = 'status error';
    return;
  }
  downloadStatus.textContent = '';
  downloadStatus.className = 'status';
  window.print();
});
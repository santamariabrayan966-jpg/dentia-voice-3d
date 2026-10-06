/**
 * DentIA Voice 3D — Functional Clinical Simulation Logic
 * Organización: Consultorio Vazques
 * Cursos: Herramientas de Prototipado & Interacción Hombre-Máquina (HCI)
 * Profesional: Dr. Luis Ramos | Paciente: María Torres (HC-00128)
 */

// Application Global State
const appState = {
  currentSection: 'dashboard',
  doctorName: 'Dr. Luis Ramos',
  patientName: 'María Torres',
  patientId: 'HC-00128',
  clinicOrg: 'Consultorio Vazques',
  piece16State: 'caries', // 'healthy', 'caries', 'restored', 'absent'
  stats: {
    healthy: 24,
    caries: 3,
    restored: 5,
    absent: 1
  },
  isRecording: false,
  recordTimer: null,
  recordSeconds: 0
};

// Global 3D Viewer Instance
let mainDentalViewer = null;

// FDI Tooth Anatomy Names
const toothNames = ['', 'Incisivo central', 'Incisivo lateral', 'Canino', 'Primer premolar', 'Segundo premolar', 'Primer molar', 'Segundo molar', 'Tercer molar'];

function getToothFullName(num) {
  const type = toothNames[num % 10] || 'Pieza';
  const arch = num < 30 ? 'superior' : 'inferior';
  const side = [1, 4].includes(Math.floor(num / 10)) ? 'derecho' : 'izquierdo';
  return `${type} ${arch} ${side}`;
}

// Main Navigation Routing
function navigateTo(sectionId, updateHash = true) {
  appState.currentSection = sectionId;

  if (updateHash && window.location.hash !== `#${sectionId}`) {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', `#${sectionId}`);
    } else {
      window.location.hash = sectionId;
    }
  }

  // View toggling
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.remove('active');
  });
  const targetSection = document.getElementById(`view-${sectionId}`);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  // Sidebar & Topbar visibility for Login view
  const sidebar = document.querySelector('.sidebar');
  const topbar = document.querySelector('.topbar');
  if (sectionId === 'login') {
    if (sidebar) sidebar.style.display = 'none';
    if (topbar) topbar.style.display = 'none';
  } else {
    if (sidebar) sidebar.style.display = '';
    if (topbar) topbar.style.display = '';
  }

  // Clinical Sidebar links (active state)
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('data-target') === sectionId) {
      link.classList.add('active');
    }
  });

  // Top Academic Evaluation Bar tabs
  document.querySelectorAll('.eval-tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-target') === sectionId) {
      btn.classList.add('active');
    }
  });

  // Smooth scroll to top
  const mainWrapper = document.querySelector('.main-wrapper');
  if (mainWrapper) mainWrapper.scrollTop = 0;

  // Resize 3D canvas when entering odontogram
  if (sectionId === 'odontogram' && mainDentalViewer) {
    setTimeout(() => {
      mainDentalViewer.resize();
    }, 60);
  }
}

// Login Handler (00 Login -> Dashboard)
function handleLoginSubmit() {
  showToast('✓ Sesión iniciada: Dr. Luis Ramos • Consultorio Vazques');
  navigateTo('dashboard');
}

// New Patient Registration Handler (02 Nuevo Paciente -> 03 Ficha)
function handleSaveNewPatient() {
  const nombres = document.getElementById('npNombres')?.value || 'María';
  const apellidos = document.getElementById('npApellidos')?.value || 'Torres Mendoza';
  
  appState.patientName = `${nombres} ${apellidos}`;
  appState.patientId = 'HC-00128';

  showToast(`✓ Paciente ${nombres} ${apellidos} registrado con éxito (HC-00128). Abriendo Ficha Clínica...`);
  navigateTo('patients');
}

// Tooth Click Handler from 3D Scene
function handleToothSelect(number) {
  const titleEl = document.querySelector('.inspector-title h3');
  const subEl = document.querySelector('.inspector-title p');
  const toothBadge = document.getElementById('selectedToothBadge');
  const notesField = document.getElementById('toothClinicalNotes');

  if (number === 16) {
    if (titleEl) titleEl.textContent = 'Pieza 16';
    if (subEl) subEl.textContent = 'Primer Molar Superior Derecho';
    setToothState(appState.piece16State, false);
  } else {
    if (titleEl) titleEl.textContent = `Pieza ${number}`;
    if (subEl) subEl.textContent = getToothFullName(number);
    if (toothBadge) {
      toothBadge.className = 'badge badge-healthy';
      toothBadge.textContent = 'Sano';
    }
    if (notesField) {
      notesField.value = `Pieza anatómica FDI ${number} (${getToothFullName(number)}). Estructura íntegra sin patología observada en paciente María Torres.`;
    }
    showToast(`Pieza seleccionada en visor 3D: FDI ${number} (${getToothFullName(number)})`);
  }
}

// Focus on Tooth 16 (Demo case)
function focusPiece16() {
  if (mainDentalViewer) {
    mainDentalViewer.select(16);
    mainDentalViewer.setView('three-quarter');
  }
  handleToothSelect(16);
  showToast('Enfocando Pieza 16 (Primer Molar Sup. Der.)');
}

// Tooth 16 Functional Simulation: Sano -> Caries -> Restaurado -> Ausente
function setToothState(newState, update3D = true) {
  const previousState = appState.piece16State;
  appState.piece16State = newState;

  // Update Buttons active class
  document.querySelectorAll('.status-opt-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-state') === newState) {
      btn.classList.add('active');
    }
  });

  const toothBadge = document.getElementById('selectedToothBadge');
  const notesField = document.getElementById('toothClinicalNotes');
  const toothThumb = document.getElementById('toothThumbPreview');

  // Metadata mappings
  const stateMeta = {
    healthy: {
      color: '#10b981',
      bg: '#ecfdf5',
      label: 'Sano',
      note: 'Pieza íntegra sin desmineralización activa. Esmalte y dentina anatómicos conservados.',
      badgeClass: 'badge-healthy'
    },
    caries: {
      color: '#f59e0b',
      bg: '#fffbeb',
      label: 'Caries Oclusal',
      note: 'Caries oclusal activa en surcos profundos de esmalte y dentina superficial. Sensibilidad al frío.',
      badgeClass: 'badge-caries'
    },
    restored: {
      color: '#2563eb',
      bg: '#eff6ff',
      label: 'Restaurada',
      note: 'Restauración con resina nanohíbrida fotocurable terminada y pulida. Sellado marginal y contactos oclusales óptimos.',
      badgeClass: 'badge-restored'
    },
    absent: {
      color: '#64748b',
      bg: '#f1f5f9',
      label: 'Ausente',
      note: 'Pieza dental ausente en la arcada superior derecha. No presenta remanente radicular visible.',
      badgeClass: 'badge-absent'
    }
  };

  const currentMeta = stateMeta[newState];

  if (toothBadge) {
    toothBadge.className = `badge ${currentMeta.badgeClass}`;
    toothBadge.textContent = currentMeta.label;
  }

  if (notesField) {
    notesField.value = currentMeta.note;
  }

  if (toothThumb) {
    if (newState === 'absent') {
      toothThumb.classList.add('is-absent');
    } else {
      toothThumb.classList.remove('is-absent');
    }
  }

  // Update tooth counts
  if (previousState !== newState) {
    if (appState.stats[previousState] !== undefined) appState.stats[previousState]--;
    if (appState.stats[newState] !== undefined) appState.stats[newState]++;
    updateStatsCounterDisplay();
  }

  // Sync with WebGL 3D Viewer
  if (update3D && mainDentalViewer) {
    const findings = [];
    if (newState === 'caries') {
      findings.push({ numeroPieza: 16, condicion: 'CARIES', superficie: 'GENERAL' });
    } else if (newState === 'restored') {
      findings.push({ numeroPieza: 16, condicion: 'OBTURACION', superficie: 'GENERAL' });
    } else if (newState === 'absent') {
      findings.push({ numeroPieza: 16, condicion: 'AUSENTE', superficie: 'GENERAL' });
    }
    mainDentalViewer.setData(findings);
  }
}

// Update counters in Odontogram UI
function updateStatsCounterDisplay() {
  const healthyEl = document.getElementById('statCountHealthy');
  const cariesEl = document.getElementById('statCountCaries');
  const restoredEl = document.getElementById('statCountRestored');
  const absentEl = document.getElementById('statCountAbsent');

  if (healthyEl) healthyEl.textContent = `${appState.stats.healthy} Sanas`;
  if (cariesEl) cariesEl.textContent = `${appState.stats.caries} Caries`;
  if (restoredEl) restoredEl.textContent = `${appState.stats.restored} Restauradas`;
  if (absentEl) absentEl.textContent = `${appState.stats.absent} Ausente`;
}

// 3D Angle Selector
function set3DViewAngle(angle) {
  document.querySelectorAll('.stage-view-switches .stage-switch-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-angle') === angle);
  });

  if (mainDentalViewer) {
    mainDentalViewer.setView(angle);
  }

  // Sync backup image if toggled
  const dentalImg = document.getElementById('dental3DMainImage');
  if (dentalImg) {
    if (angle === 'upper' || angle === 'superior') {
      dentalImg.src = 'assets/images/03_maxillary_occlusal_arch.png';
    } else if (angle === 'lower' || angle === 'inferior') {
      dentalImg.src = 'assets/images/04_mandibular_occlusal_arch.png';
    } else if (angle === 'front' || angle === 'frontal') {
      dentalImg.src = 'assets/images/arcade_front.png';
    } else {
      dentalImg.src = 'assets/images/arcade_persp.png';
    }
  }
}

// 3D Zoom control
function mainViewerZoom(factor) {
  if (mainDentalViewer) mainDentalViewer.zoom(factor);
}

// Toggle between WebGL 3D Viewer and Static Figma Backup Image
function toggleFigmaBackupView() {
  const vp = document.getElementById('mainOdontoViewport');
  const img = document.getElementById('dental3DMainImage');
  const btn = document.getElementById('btnToggleFigma');
  if (!vp || !img) return;

  if (vp.style.display !== 'none') {
    vp.style.display = 'none';
    img.style.display = 'block';
    if (btn) btn.textContent = '🌐 Modo 3D WebGL';
    showToast('Visualizando render estático para captura/exportación a Figma.');
  } else {
    vp.style.display = 'block';
    img.style.display = 'none';
    if (btn) btn.textContent = '📷 Respaldo Figma';
    if (mainDentalViewer) mainDentalViewer.resize();
    showToast('Regresando al visor interactivo WebGL en tiempo real.');
  }
}

// Voice Recording Integrated inside Odontogram
function toggleVoiceRecording() {
  const btn = document.getElementById('btnStartVoice');
  const statusLabel = document.getElementById('voiceStatusLabel');
  const waveBox = document.getElementById('audioWaveVisualizer');
  const liveTranscript = document.getElementById('voiceTranscriptPreview');
  const aiDecisionBox = document.getElementById('aiDecisionBox');

  if (!appState.isRecording) {
    // Start Recording
    appState.isRecording = true;
    appState.recordSeconds = 0;
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
      Detener Grabación
    `;
    btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    statusLabel.textContent = 'Escuchando... 00:00';
    statusLabel.style.color = '#ef4444';
    waveBox.style.display = 'flex';
    liveTranscript.innerHTML = '<strong>Escuchando voz del Dr. Luis Ramos...</strong>';
    aiDecisionBox.style.display = 'none';

    // Simulate real-time speech transcription
    appState.recordTimer = setInterval(() => {
      appState.recordSeconds++;
      const formattedTime = appState.recordSeconds < 10 ? `00:0${appState.recordSeconds}` : `00:${appState.recordSeconds}`;
      statusLabel.textContent = `Escuchando... ${formattedTime}`;

      if (appState.recordSeconds === 2) {
        liveTranscript.innerHTML = '<em>"Paciente María Torres..."</em>';
      } else if (appState.recordSeconds === 4) {
        liveTranscript.innerHTML = '<em>"Paciente María Torres presenta caries oclusal activa en pieza dieciséis..."</em>';
      } else if (appState.recordSeconds === 6) {
        liveTranscript.innerHTML = '<em>"Paciente María Torres presenta caries oclusal activa en pieza dieciséis, se programa preparación y resina fotocurable."</em>';
      }
    }, 1000);

  } else {
    // Stop Recording & Show Structured Interpretation
    clearInterval(appState.recordTimer);
    appState.isRecording = false;
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
      Capturar por Voz con IA
    `;
    btn.style.background = 'linear-gradient(135deg, #0ea5e9, #028090)';
    statusLabel.textContent = 'Interpretación lista para validación';
    statusLabel.style.color = '#059669';
    waveBox.style.display = 'none';

    liveTranscript.innerHTML = `
      <strong>Transcripción clínica:</strong><br>
      "Paciente María Torres presenta caries oclusal activa en pieza 16, se programa preparación y resina fotocurable."
    `;

    // Show ethical HCI decision block: Corregir | Confirmar y guardar
    aiDecisionBox.style.display = 'block';
  }
}

// Correct Voice Data
function correctVoiceData() {
  const note = prompt("Edita la transcripción o diagnóstico para la Pieza 16:", "Caries oclusal en pieza 16, restaurar con resina");
  if (note) {
    const liveTranscript = document.getElementById('voiceTranscriptPreview');
    if (liveTranscript) {
      liveTranscript.innerHTML = `<strong>Transcripción corregida por Dr. Luis Ramos:</strong><br>"${note}"`;
    }
    showToast("Transcripción corregida manualmente por el profesional.");
  }
}

// Confirm and Save into Clinical History (HCI Final Decision: Changes to RESTAURADA)
function confirmAndSaveVoiceFinding() {
  // 1. Transition tooth 16 state to 'restored'
  setToothState('restored');

  // 2. Hide AI decision box
  const aiDecisionBox = document.getElementById('aiDecisionBox');
  if (aiDecisionBox) aiDecisionBox.style.display = 'none';

  // 3. Update voice status label
  const statusLabel = document.getElementById('voiceStatusLabel');
  if (statusLabel) {
    statusLabel.textContent = 'Tratamiento validado y completado';
    statusLabel.style.color = '#10b981';
  }

  // 4. Update transcript preview
  const liveTranscript = document.getElementById('voiceTranscriptPreview');
  if (liveTranscript) {
    liveTranscript.innerHTML = `
      <span style="color:#059669; font-weight:700;">✓ Hallazgo clínico confirmado:</span><br>
      Pieza 16 restaurada con resina nanohíbrida fotocurable. Sellado marginal óptimo y guardado en expediente.
    `;
  }

  // 5. Update Treatment & Evolution section
  updateEvolutionWithRestoration();

  // 6. Show toast notification
  showToast('✓ Hallazgo confirmado por Dr. Luis Ramos: Pieza 16 RESTAURADA con éxito en la ficha de María Torres.');
}

// Update Treatment & Evolution Screen
function updateEvolutionWithRestoration() {
  const timelineList = document.querySelector('.timeline-list');
  if (!timelineList) return;

  const firstItem = timelineList.querySelector('.timeline-item');
  if (firstItem) {
    const dateEl = firstItem.querySelector('.timeline-date');
    if (dateEl) dateEl.textContent = '06 OCT 2026 • Dr. Luis Ramos • Realizado (Hoy)';
    const titleEl = firstItem.querySelector('p');
    if (titleEl) titleEl.textContent = 'Restauración con Resina Fotocurable en Pieza 16 (Completada)';
    const badge = firstItem.querySelector('.badge');
    if (badge) {
      badge.className = 'badge badge-healthy';
      badge.textContent = '✓ Restauración Completada en Consulta';
    }
  }
}

// Integrated Patient Assistant Prompt Handler (Inside Ficha)
function askPatientAssistant(topic) {
  const responseBox = document.getElementById('integratedAssistantResponse');
  if (!responseBox) return;

  responseBox.style.display = 'block';

  if (topic === 'ultima_vez') {
    responseBox.innerHTML = `
      <strong>DentIA Assistant • Resumen de última sesión (28 SEP 2026):</strong><br>
      • Se realizó examen clínico estomatológico integral a <strong>María Torres</strong>.<br>
      • Se detectó lesión cariosa oclusal activa en <strong>Pieza 16</strong> con vitalidad pulpar positiva.<br>
      • Se completó profilaxis coronaria preventiva.<br>
      • <em>Tratamiento pendiente:</em> Restauración con resina nanohíbrida en pieza 16.
    `;
  } else if (topic === 'pendientes') {
    responseBox.innerHTML = `
      <strong>DentIA Assistant • Pendientes de María Torres:</strong><br>
      1. <strong>Pieza 16:</strong> Obturación con resina nanohíbrida fotocurable.<br>
      2. <strong>Pieza 24:</strong> Evaluación de sellante en fosas y fisuras.<br>
      3. <strong>Higiene:</strong> Control semestral de índice de placa en Consultorio Vazques.
    `;
  } else if (topic === 'protocolo16') {
    responseBox.innerHTML = `
      <strong>DentIA Assistant • Protocolo sugerido para Pieza 16:</strong><br>
      1. Aislamiento absoluto con dique de goma.<br>
      2. Remoción conservadora de caries de esmalte y dentina.<br>
      3. Base cavitaria si profundidad &gt; 2mm.<br>
      4. Grabado ácido selectivo + adhesivo universal.<br>
      5. Estratificación con resina color A2 y pulido final.
    `;
  }
}

// Toast Notification
function showToast(message) {
  const toast = document.getElementById('toastNotification');
  const toastMsg = document.getElementById('toastMessageText');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  updateStatsCounterDisplay();

  // Initialize 3D Viewer if canvas exists
  const canvas = document.getElementById('mainDentalCanvas');
  const container = document.getElementById('mainOdontoViewport');

  if (canvas && container && window.DentiaDentalViewer) {
    try {
      mainDentalViewer = new DentiaDentalViewer({
        canvas,
        container,
        modelUrl: 'assets/3d/dentia-articulado-v2.glb',
        onSelect: (number) => {
          handleToothSelect(number);
        },
        onStatus: (message, status) => {
          const statusTag = document.getElementById('mainModelStatusTag');
          if (statusTag) {
            statusTag.textContent = `● ${message}`;
            if (status === 'ready') {
              statusTag.style.color = '#34d399';
              statusTag.style.borderColor = 'rgba(16,185,129,0.35)';
            } else if (status === 'error') {
              statusTag.style.color = '#f87171';
              statusTag.style.borderColor = 'rgba(239,68,68,0.35)';
            }
          }
        }
      });

      // Initialize with Tooth 16 selected and in CARIES state
      mainDentalViewer.ready.then(() => {
        mainDentalViewer.select(16);
        setToothState('caries');
      }).catch(err => {
        console.error('Error inicializando visor 3D:', err);
      });

    } catch (err) {
      console.error('Error instanciando DentiaDentalViewer:', err);
    }
  }

  // Connect opening slider
  const openingSlider = document.getElementById('mainOpeningSlider');
  if (openingSlider) {
    openingSlider.addEventListener('input', e => {
      const val = Number(e.target.value);
      if (mainDentalViewer) mainDentalViewer.setOpening(val / 100);
      const valLabel = document.getElementById('mainOpeningValue');
      if (valLabel) valLabel.textContent = `${val}%`;
    });
  }

  // Check URL hash for direct navigation
  const hash = window.location.hash.replace('#', '');
  if (hash && document.getElementById(`view-${hash}`)) {
    navigateTo(hash, false);
  } else {
    navigateTo('login', true);
  }

  // Listen to browser hash navigation
  window.addEventListener('hashchange', () => {
    const newHash = window.location.hash.replace('#', '');
    if (newHash && document.getElementById(`view-${newHash}`) && newHash !== appState.currentSection) {
      navigateTo(newHash, false);
    }
  });
});

// Dispose on unload
window.addEventListener('pagehide', () => {
  if (mainDentalViewer) mainDentalViewer.dispose();
}, { once: true });
